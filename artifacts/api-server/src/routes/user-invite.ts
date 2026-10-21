import { createHash } from "node:crypto";
import { Router, type IRouter, type Request } from "express";
import { ReplitConnectors } from "@replit/connectors-sdk";
import { InviteUserBody, InviteUserResponse } from "@workspace/api-zod";
import { getSameOriginAuthRedirectUrl } from "../lib/auth-redirect";

const router: IRouter = Router();

type RateBucket = { count: number; resetAt: number };
type BrevoSender = { email?: string; name?: string; active?: boolean };
type SupabaseUser = { id?: string; email?: string };
type SupabaseProfile = { role?: string };
type GeneratedLink = { action_link?: string; user?: { id?: string } };
type BrevoSendersResponse = { senders?: BrevoSender[] };

const adminBuckets = new Map<string, RateBucket>();
const emailBuckets = new Map<string, RateBucket>();
const adminWindowMs = 15 * 60 * 1000;
const emailWindowMs = 60 * 60 * 1000;
let senderCache: {
  sender: { email: string; name: string } | null;
  expiresAt: number;
} | null = null;

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
  for (const buckets of [adminBuckets, emailBuckets]) {
    for (const [key, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(key);
    }
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

async function removePendingInvite(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string | undefined,
  req: Request,
): Promise<void> {
  if (!userId) return;
  try {
    const response = await fetch(
      `${supabaseUrl.replace(/\/+$/, "")}/auth/v1/admin/users/${encodeURIComponent(userId)}`,
      {
        method: "DELETE",
        headers: {
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
        },
      },
    );
    if (!response.ok) {
      req.log.error(
        { statusCode: response.status },
        "Could not remove an invite after email delivery failed.",
      );
    }
  } catch (error) {
    req.log.error(
      { err: error instanceof Error ? error.message : "Unknown error" },
      "Could not remove an invite after email delivery failed.",
    );
  }
}

router.post("/auth/invite", async (req, res): Promise<void> => {
  const parsed = InviteUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }

  const redirectUrl = getSameOriginAuthRedirectUrl(
    req.get("origin"),
    req.get("host"),
    req.get("referer"),
    { invite: "1" },
  );
  if (!redirectUrl) {
    res.status(400).json({ error: "The invitation request origin is not allowed." });
    return;
  }

  const token = /^Bearer\s+(.+)$/i.exec(req.get("authorization") ?? "")?.[1]?.trim();
  if (!token || token.length > 8192) {
    res.status(401).json({ error: "Sign in with an admin account to invite users." });
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    req.log.error("User invitation service is missing Supabase configuration.");
    res.status(503).json({ error: "The invitation service is not configured." });
    return;
  }

  const normalizedEmail = parsed.data.email.trim().toLowerCase();
  let pendingInviteId: string | undefined;

  try {
    const baseUrl = supabaseUrl.replace(/\/+$/, "");
    const authResponse = await fetch(`${baseUrl}/auth/v1/user`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`,
      },
    });
    if (authResponse.status === 401 || authResponse.status === 403) {
      res.status(401).json({ error: "Your session has expired. Sign in again." });
      return;
    }
    if (!authResponse.ok) {
      req.log.error({ statusCode: authResponse.status }, "Could not validate an invite request.");
      res.status(503).json({ error: "The invitation service is temporarily unavailable." });
      return;
    }

    const authUser = (await authResponse.json()) as SupabaseUser;
    if (!authUser.id) {
      res.status(401).json({ error: "Your session could not be validated. Sign in again." });
      return;
    }

    const profileUrl = new URL(`${baseUrl}/rest/v1/profiles`);
    profileUrl.searchParams.set("id", `eq.${authUser.id}`);
    profileUrl.searchParams.set("select", "role");
    profileUrl.searchParams.set("limit", "1");
    const profileResponse = await fetch(profileUrl, {
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
    });
    if (!profileResponse.ok) {
      req.log.error({ statusCode: profileResponse.status }, "Could not check invite administrator access.");
      res.status(503).json({ error: "The invitation service is temporarily unavailable." });
      return;
    }
    const profiles = (await profileResponse.json()) as SupabaseProfile[];
    if (profiles[0]?.role !== "admin") {
      res.status(403).json({ error: "Only workspace admins can invite users." });
      return;
    }

    const adminKey = authUser.id;
    const emailHash = createHash("sha256").update(normalizedEmail).digest("hex");
    const adminLimited = isLimited(adminBuckets, adminKey, 15, adminWindowMs);
    const emailLimited = isLimited(emailBuckets, emailHash, 3, emailWindowMs);
    if (adminLimited || emailLimited) {
      res.status(429).json({ error: "Please wait before sending another invitation." });
      return;
    }
    if (adminBuckets.size > 5000 || emailBuckets.size > 5000) pruneExpiredBuckets();

    const sender = await getVerifiedSender();
    if (!sender) {
      req.log.error("Brevo has no active verified sender configured for invitations.");
      res.status(503).json({ error: "Email delivery is not configured. Contact an administrator." });
      return;
    }

    const linkResponse = await fetch(`${baseUrl}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        type: "invite",
        email: normalizedEmail,
        options: { redirectTo: redirectUrl },
      }),
    });

    const linkData = (await linkResponse.json().catch(() => ({}))) as GeneratedLink & {
      code?: string;
      msg?: string;
      message?: string;
    };
    if (!linkResponse.ok) {
      const providerMessage = `${linkData.code ?? ""} ${linkData.msg ?? ""} ${linkData.message ?? ""}`;
      if (
        linkResponse.status === 409 ||
        linkResponse.status === 422 ||
        /email_exists|already (?:been )?registered|already exists/i.test(providerMessage)
      ) {
        res.status(409).json({ error: "This email already has an Automation Hub account." });
        return;
      }
      req.log.warn({ statusCode: linkResponse.status }, "Supabase did not create a user invitation.");
      res.status(502).json({ error: "Supabase could not create the invitation. Try again later." });
      return;
    }

    pendingInviteId = linkData.user?.id;
    if (!linkData.action_link) {
      req.log.error("Supabase returned no invitation action link.");
      await removePendingInvite(baseUrl, serviceRoleKey, pendingInviteId, req);
      res.status(502).json({ error: "The invitation link could not be created. Try again later." });
      return;
    }

    const safeLink = escapeHtml(linkData.action_link);
    const safeEmail = escapeHtml(normalizedEmail);
    const emailResponse = await new ReplitConnectors().proxy("brevo", "/smtp/email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sender,
        to: [{ email: normalizedEmail }],
        subject: "You’re invited to Automation Hub",
        textContent: `You’ve been invited to Automation Hub. Set your password using this link: ${linkData.action_link}\n\nIf you were not expecting this invitation, you can ignore this email.`,
        htmlContent: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#27212a"><h1 style="color:#BD0F72">You’re invited</h1><p>An admin invited <strong>${safeEmail}</strong> to Automation Hub.</p><p>Use the link below to set your password and open your workspace.</p><p><a href="${safeLink}" style="display:inline-block;background:#BD0F72;color:#FFFFFF;padding:12px 18px;border-radius:8px;text-decoration:none">Accept invitation</a></p><p>If you were not expecting this invitation, you can ignore this email.</p></body></html>`,
      }),
    });

    if (!emailResponse.ok) {
      req.log.error(
        { statusCode: emailResponse.status },
        "Brevo failed to send a user invitation.",
      );
      await removePendingInvite(baseUrl, serviceRoleKey, pendingInviteId, req);
      res.status(502).json({ error: "The invitation email could not be sent. Try again later." });
      return;
    }

    res.status(201).json(
      InviteUserResponse.parse({ message: `Invitation sent to ${normalizedEmail}.` }),
    );
  } catch (error) {
    if (pendingInviteId) {
      await removePendingInvite(supabaseUrl, serviceRoleKey, pendingInviteId, req);
    }
    req.log.error(
      { err: error instanceof Error ? error.message : "Unknown error" },
      "User invitation delivery failed.",
    );
    res.status(503).json({ error: "The invitation service is temporarily unavailable." });
  }
});

export default router;
