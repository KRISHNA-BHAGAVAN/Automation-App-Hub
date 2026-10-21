import { createHash } from "node:crypto";
import { Router, type IRouter } from "express";
import {
  SignUpWithEmailBody,
  SignUpWithEmailResponse,
  SubmitAccessRequestBody,
  SubmitAccessRequestResponse,
} from "@workspace/api-zod";
import { isCompanyEmail } from "../lib/account-policy";
import { getSameOriginAuthRedirectUrl } from "../lib/auth-redirect";
import { escapeHtml, getVerifiedBrevoSender, sendBrevoEmail } from "../lib/brevo-email";

const router: IRouter = Router();
const genericSignupResponse = {
  message: "If this address is eligible, we’ll send a verification link. Check your inbox shortly.",
};
const accessRequestResponse = {
  message: "Your access request has been sent to the workspace admins.",
};

type RateBucket = { count: number; resetAt: number };
type GeneratedLink = { action_link?: string; user?: { id?: string } };
const ipBuckets = new Map<string, RateBucket>();
const emailBuckets = new Map<string, RateBucket>();

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

function rateLimitKey(email: string): string {
  return createHash("sha256").update(email).digest("hex");
}

async function deleteAuthUser(
  supabaseUrl: string,
  serviceRoleKey: string,
  userId: string | undefined,
  req: Parameters<Parameters<typeof router.post>[1]>[0],
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
      req.log.error({ statusCode: response.status }, "Could not remove an account after email delivery failed.");
    }
  } catch (error) {
    req.log.error(
      { err: error instanceof Error ? error.message : "Unknown error" },
      "Could not remove an account after email delivery failed.",
    );
  }
}

router.post("/auth/sign-up", async (req, res): Promise<void> => {
  const parsed = SignUpWithEmailBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid email address and a password with at least 8 characters." });
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();
  if (!isCompanyEmail(email)) {
    res.status(400).json({
      error: "Use an @one-line.com address to sign up. Other addresses must request access.",
    });
    return;
  }

  const redirectUrl = getSameOriginAuthRedirectUrl(
    req.get("origin"),
    req.get("host"),
    req.get("referer"),
    { path: "/login", query: { verified: "1" } },
  );
  if (!redirectUrl) {
    res.status(400).json({ error: "The signup request origin is not allowed." });
    return;
  }

  const ip = req.ip || "unknown";
  const emailHash = rateLimitKey(email);
  if (
    isLimited(ipBuckets, ip, 8, 15 * 60 * 1000) ||
    isLimited(emailBuckets, emailHash, 3, 60 * 60 * 1000)
  ) {
    res.status(429).json({ error: "Please wait before trying to sign up again." });
    return;
  }
  if (ipBuckets.size > 5000 || emailBuckets.size > 5000) pruneExpiredBuckets();

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    req.log.error("Signup service is missing Supabase configuration.");
    res.status(503).json({ error: "The signup service is not configured." });
    return;
  }

  let newUserId: string | undefined;
  try {
    const sender = await getVerifiedBrevoSender();
    if (!sender) {
      req.log.error("Brevo has no active verified sender configured for signup.");
      res.status(503).json({ error: "Email verification is not configured. Contact an administrator." });
      return;
    }

    const baseUrl = supabaseUrl.replace(/\/+$/, "");
    const linkResponse = await fetch(`${baseUrl}/auth/v1/admin/generate_link`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        type: "signup",
        email,
        password: parsed.data.password,
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
      if (/email_exists|already (?:been )?registered|already exists/i.test(providerMessage)) {
        res.status(202).json(SignUpWithEmailResponse.parse(genericSignupResponse));
        return;
      }
      if (/weak_password|password.*(weak|short|strength)/i.test(providerMessage)) {
        res.status(400).json({ error: "Choose a stronger password and try again." });
        return;
      }
      req.log.warn({ statusCode: linkResponse.status }, "Supabase did not create a signup verification link.");
      res.status(503).json({ error: "The signup service is temporarily unavailable." });
      return;
    }

    newUserId = linkData.user?.id;
    if (!linkData.action_link) {
      req.log.error("Supabase returned no signup verification link.");
      await deleteAuthUser(baseUrl, serviceRoleKey, newUserId, req);
      res.status(502).json({ error: "The verification link could not be created. Try again later." });
      return;
    }

    const safeLink = escapeHtml(linkData.action_link);
    const emailResponse = await sendBrevoEmail({
      sender,
      to: [{ email }],
      subject: "Verify your Automation Hub email",
      textContent: `Verify your email address to finish creating your Automation Hub account: ${linkData.action_link}\n\nIf you did not request an account, you can ignore this email.`,
      htmlContent: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#27212a"><h1 style="color:#BD0F72">Verify your email</h1><p>Confirm your @one-line.com address to finish creating your Automation Hub account.</p><p><a href="${safeLink}" style="display:inline-block;background:#BD0F72;color:#FFFFFF;padding:12px 18px;border-radius:8px;text-decoration:none">Verify email</a></p><p>If you did not request an account, you can ignore this email.</p></body></html>`,
    });
    if (!emailResponse.ok) {
      req.log.error({ statusCode: emailResponse.status }, "Brevo failed to send a signup verification email.");
      await deleteAuthUser(baseUrl, serviceRoleKey, newUserId, req);
      res.status(502).json({ error: "The verification email could not be sent. Try again later." });
      return;
    }

    res.status(202).json(SignUpWithEmailResponse.parse(genericSignupResponse));
  } catch (error) {
    if (newUserId) {
      await deleteAuthUser(supabaseUrl, serviceRoleKey, newUserId, req);
    }
    req.log.error(
      { err: error instanceof Error ? error.message : "Unknown error" },
      "Signup verification email delivery failed.",
    );
    res.status(503).json({ error: "The signup service is temporarily unavailable." });
  }
});

router.post("/auth/access-requests", async (req, res): Promise<void> => {
  const parsed = SubmitAccessRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();
  if (isCompanyEmail(email)) {
    res.status(400).json({
      error: "Use your @one-line.com address to sign up directly.",
    });
    return;
  }
  if (
    !getSameOriginAuthRedirectUrl(
      req.get("origin"),
      req.get("host"),
      req.get("referer"),
      { path: "/request-access" },
    )
  ) {
    res.status(400).json({ error: "The access request origin is not allowed." });
    return;
  }

  const ip = req.ip || "unknown";
  const emailHash = rateLimitKey(email);
  if (
    isLimited(ipBuckets, `request:${ip}`, 10, 60 * 60 * 1000) ||
    isLimited(emailBuckets, `request:${emailHash}`, 2, 24 * 60 * 60 * 1000)
  ) {
    res.status(429).json({ error: "Please wait before submitting another access request." });
    return;
  }
  if (ipBuckets.size > 5000 || emailBuckets.size > 5000) pruneExpiredBuckets();

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    req.log.error("Access request service is missing Supabase configuration.");
    res.status(503).json({ error: "The access request service is not configured." });
    return;
  }

  try {
    const response = await fetch(
      `${supabaseUrl.replace(/\/+$/, "")}/rest/v1/access_requests`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: serviceRoleKey,
          Authorization: `Bearer ${serviceRoleKey}`,
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ email }),
      },
    );
    if (response.status === 409) {
      res.status(202).json(SubmitAccessRequestResponse.parse(accessRequestResponse));
      return;
    }
    if (!response.ok) {
      req.log.error({ statusCode: response.status }, "Could not save an access request.");
      res.status(503).json({ error: "The access request could not be saved. Try again later." });
      return;
    }
    res.status(202).json(SubmitAccessRequestResponse.parse(accessRequestResponse));
  } catch (error) {
    req.log.error(
      { err: error instanceof Error ? error.message : "Unknown error" },
      "Access request could not be saved.",
    );
    res.status(503).json({ error: "The access request service is temporarily unavailable." });
  }
});

export default router;
