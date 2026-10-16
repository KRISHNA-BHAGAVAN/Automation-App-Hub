import { createHash } from "node:crypto";
import { Router, type IRouter } from "express";
import { ReplitConnectors } from "@replit/connectors-sdk";
import {
  RequestPasswordResetBody,
  RequestPasswordResetResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const genericResponse = {
  message: "If an account matches that email, a password reset link will arrive shortly.",
};

type RateBucket = { count: number; resetAt: number };
type BrevoSender = { email?: string; name?: string; active?: boolean };
type BrevoSendersResponse = { senders?: BrevoSender[] };
type SupabaseGenerateLinkResponse = { action_link?: string };

const ipBuckets = new Map<string, RateBucket>();
const emailBuckets = new Map<string, RateBucket>();
const ipWindowMs = 15 * 60 * 1000;
const emailWindowMs = 60 * 60 * 1000;
let senderCache: { sender: { email: string; name: string } | null; expiresAt: number } | null =
  null;

function isLimited(
  buckets: Map<string, RateBucket>,
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  if (bucket.count >= limit) return true;
  bucket.count += 1;
  return false;
}

function pruneExpiredBuckets(): void {
  const now = Date.now();
  for (const buckets of [ipBuckets, emailBuckets]) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
  }
}

function getSameOriginResetUrl(origin: string | undefined, host: string | undefined): string | null {
  if (!origin || !host) return null;
  try {
    const parsedOrigin = new URL(origin);
    const isLocalHttp =
      parsedOrigin.protocol === "http:" &&
      (parsedOrigin.hostname === "localhost" || parsedOrigin.hostname === "127.0.0.1");
    if (
      parsedOrigin.host !== host ||
      (parsedOrigin.protocol !== "https:" && !isLocalHttp)
    ) {
      return null;
    }
    return new URL("/reset-password", parsedOrigin.origin).toString();
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

async function getVerifiedSender(): Promise<{ email: string; name: string } | null> {
  if (senderCache && senderCache.expiresAt > Date.now()) return senderCache.sender;
  const response = await new ReplitConnectors().proxy("brevo", "/senders", {
    method: "GET",
  });
  if (!response.ok) return null;
  const data = (await response.json()) as BrevoSendersResponse;
  const sender = data.senders?.find(
    (candidate) =>
      candidate.active === true &&
      typeof candidate.email === "string" &&
      candidate.email.length > 0,
  );
  const resolvedSender = sender?.email
    ? { email: sender.email, name: sender.name || "Automation Hub" }
    : null;
  senderCache = resolvedSender
    ? { sender: resolvedSender, expiresAt: Date.now() + 15 * 60 * 1000 }
    : null;
  return resolvedSender;
}

router.post("/auth/password-reset", async (req, res): Promise<void> => {
  const parsed = RequestPasswordResetBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }

  const resetUrl = getSameOriginResetUrl(req.get("origin"), req.get("host"));
  if (!resetUrl) {
    res.status(400).json({ error: "The reset request origin is not allowed." });
    return;
  }

  const ip = req.ip || "unknown";
  const normalizedEmail = parsed.data.email.trim().toLowerCase();
  const emailHash = createHash("sha256").update(normalizedEmail).digest("hex");
  const ipLimited = isLimited(ipBuckets, ip, 10, ipWindowMs);
  const emailLimited = isLimited(emailBuckets, emailHash, 3, emailWindowMs);
  if (ipLimited || emailLimited) {
    res.status(429).json({ error: "Please wait before requesting another reset email." });
    return;
  }
  if (ipBuckets.size > 5000 || emailBuckets.size > 5000) pruneExpiredBuckets();

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    req.log.error("Password reset service is missing Supabase configuration.");
    res.status(202).json(genericResponse);
    return;
  }

  try {
    const linkResponse = await fetch(
      `${supabaseUrl.replace(/\/+$/, "")}/auth/v1/admin/generate_link`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          type: "recovery",
          email: normalizedEmail,
          options: { redirectTo: resetUrl },
        }),
      },
    );

    if (!linkResponse.ok) {
      req.log.warn(
        { statusCode: linkResponse.status },
        "Supabase did not create a recovery link.",
      );
      res.status(202).json(genericResponse);
      return;
    }

    const linkData = (await linkResponse.json()) as SupabaseGenerateLinkResponse;
    if (!linkData.action_link) {
      req.log.error("Supabase returned no recovery action link.");
      res.status(202).json(genericResponse);
      return;
    }

    const sender = await getVerifiedSender();
    if (!sender) {
      req.log.error("Brevo has no active verified sender configured.");
      res.status(202).json(genericResponse);
      return;
    }

    const safeLink = escapeHtml(linkData.action_link);
    const emailResponse = await new ReplitConnectors().proxy("brevo", "/smtp/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sender,
        to: [{ email: normalizedEmail }],
        subject: "Reset your Automation Hub password",
        textContent: `Use this link to reset your password: ${linkData.action_link}\n\nIf you did not request this, you can ignore this email.`,
        htmlContent: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#27212a"><h1 style="color:#BD0F72">Reset your password</h1><p>We received a request to reset your Automation Hub password.</p><p><a href="${safeLink}" style="display:inline-block;background:#BD0F72;color:#FFFFFF;padding:12px 18px;border-radius:8px;text-decoration:none">Reset password</a></p><p>If you did not request this, you can ignore this email.</p></body></html>`,
      }),
    });

    if (!emailResponse.ok) {
      req.log.error(
        { statusCode: emailResponse.status },
        "Brevo failed to send a password reset email.",
      );
    }
  } catch (error) {
    req.log.error(
      { err: error instanceof Error ? error.message : "Unknown error" },
      "Password reset delivery failed.",
    );
  }

  res.status(202).json(RequestPasswordResetResponse.parse(genericResponse));
});

export default router;
