import { createHash } from "node:crypto";
import { Router, type IRouter, type Request } from "express";
import { InviteUserBody, InviteUserResponse } from "@workspace/api-zod";
import { getSameOriginAuthRedirectUrl } from "../lib/auth-redirect";
import { escapeHtml, getVerifiedBrevoSender, sendBrevoEmail } from "../lib/brevo-email";
import { requireAdmin } from "../lib/supabase-admin";

const router: IRouter = Router();

type RateBucket = { count: number; resetAt: number };
type GeneratedLink = { action_link?: string; user?: { id?: string } };

const adminBuckets = new Map<string, RateBucket>();
const emailBuckets = new Map<string, RateBucket>();
const adminWindowMs = 15 * 60 * 1000;
const emailWindowMs = 60 * 60 * 1000;
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
    { query: { invite: "1" } },
  );
  if (!redirectUrl) {
    res.status(400).json({ error: "The invitation request origin is not allowed." });
    return;
  }

  const adminAuth = await requireAdmin(req);
  if (!adminAuth.ok) {
    res.status(adminAuth.status).json({ error: adminAuth.error });
    return;
  }
  const { userId: adminId, supabaseUrl: baseUrl, serviceRoleKey } = adminAuth.context;

  const normalizedEmail = parsed.data.email.trim().toLowerCase();
  if (!normalizedEmail.endsWith("@one-line.com")) {
    res.status(400).json({
      error: "Use an @one-line.com address here. Other addresses need an approved access request.",
    });
    return;
  }
  let pendingInviteId: string | undefined;

  try {
    const emailHash = createHash("sha256").update(normalizedEmail).digest("hex");
    const adminLimited = isLimited(adminBuckets, adminId, 15, adminWindowMs);
    const emailLimited = isLimited(emailBuckets, emailHash, 3, emailWindowMs);
    if (adminLimited || emailLimited) {
      res.status(429).json({ error: "Please wait before sending another invitation." });
      return;
    }
    if (adminBuckets.size > 5000 || emailBuckets.size > 5000) pruneExpiredBuckets();

    const sender = await getVerifiedBrevoSender();
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
    const emailResponse = await sendBrevoEmail({
      sender,
      to: [{ email: normalizedEmail }],
      subject: "You’re invited to Automation Hub",
      textContent: `You’ve been invited to Automation Hub. Set your password using this link: ${linkData.action_link}\n\nIf you were not expecting this invitation, you can ignore this email.`,
      htmlContent: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#27212a"><h1 style="color:#BD0F72">You’re invited</h1><p>An admin invited <strong>${safeEmail}</strong> to Automation Hub.</p><p>Use the link below to set your password and open your workspace.</p><p><a href="${safeLink}" style="display:inline-block;background:#BD0F72;color:#FFFFFF;padding:12px 18px;border-radius:8px;text-decoration:none">Accept invitation</a></p><p>If you were not expecting this invitation, you can ignore this email.</p></body></html>`,
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
      await removePendingInvite(baseUrl, serviceRoleKey, pendingInviteId, req);
    }
    req.log.error(
      { err: error instanceof Error ? error.message : "Unknown error" },
      "User invitation delivery failed.",
    );
    res.status(503).json({ error: "The invitation service is temporarily unavailable." });
  }
});

export default router;
