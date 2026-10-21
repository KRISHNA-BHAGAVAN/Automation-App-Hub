import { Router, type IRouter, type Request } from "express";
import {
  ReviewAccessRequestBody,
  ReviewAccessRequestParams,
  ReviewAccessRequestResponse,
} from "@workspace/api-zod";
import { getSameOriginAuthRedirectUrl } from "../lib/auth-redirect";
import { escapeHtml, getVerifiedBrevoSender, sendBrevoEmail } from "../lib/brevo-email";
import { requireAdmin, supabaseAdminFetch, type AdminContext } from "../lib/supabase-admin";

const router: IRouter = Router();

type AccessRequestRow = { id: string; email: string; status: string };
type GeneratedLink = { action_link?: string; user?: { id?: string } };

async function deleteInvitedUser(
  context: AdminContext,
  userId: string | undefined,
  req: Request,
): Promise<void> {
  if (!userId) return;
  try {
    const response = await supabaseAdminFetch(
      context,
      `/auth/v1/admin/users/${encodeURIComponent(userId)}`,
      { method: "DELETE" },
    );
    if (!response.ok) {
      req.log.error({ statusCode: response.status }, "Could not remove a failed access-request invitation.");
    }
  } catch (error) {
    req.log.error(
      { err: error instanceof Error ? error.message : "Unknown error" },
      "Could not remove a failed access-request invitation.",
    );
  }
}

async function setRequestDecision(
  context: AdminContext,
  requestId: string,
  adminId: string,
  decision: "accepted" | "declined",
): Promise<Response> {
  return supabaseAdminFetch(
    context,
    `/rest/v1/access_requests?id=eq.${encodeURIComponent(requestId)}&status=eq.pending`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        status: decision,
        reviewed_by: adminId,
        reviewed_at: new Date().toISOString(),
      }),
    },
  );
}

async function reopenRequest(
  context: AdminContext,
  requestId: string,
  adminId: string,
  req: Request,
): Promise<void> {
  try {
    const response = await supabaseAdminFetch(
      context,
      `/rest/v1/access_requests?id=eq.${encodeURIComponent(requestId)}&status=eq.accepted&reviewed_by=eq.${encodeURIComponent(adminId)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          status: "pending",
          reviewed_by: null,
          reviewed_at: null,
        }),
      },
    );
    if (!response.ok) {
      req.log.error({ statusCode: response.status }, "Could not reopen an access request after invitation failed.");
    }
  } catch (error) {
    req.log.error(
      { err: error instanceof Error ? error.message : "Unknown error" },
      "Could not reopen an access request after invitation failed.",
    );
  }
}

router.post("/auth/access-requests/:requestId/decision", async (req, res): Promise<void> => {
  const params = ReviewAccessRequestParams.safeParse(req.params);
  const body = ReviewAccessRequestBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Choose accept or decline for a valid access request." });
    return;
  }

  const adminAuth = await requireAdmin(req);
  if (!adminAuth.ok) {
    res.status(adminAuth.status).json({ error: adminAuth.error });
    return;
  }
  const { context } = adminAuth;
  let invitedUserId: string | undefined;
  let requestMarkedAccepted = false;

  try {
    const requestResponse = await supabaseAdminFetch(
      context,
      `/rest/v1/access_requests?id=eq.${encodeURIComponent(params.data.requestId)}&select=id,email,status&limit=1`,
    );
    if (!requestResponse.ok) {
      req.log.error({ statusCode: requestResponse.status }, "Could not load an access request.");
      res.status(503).json({ error: "The access request service is temporarily unavailable." });
      return;
    }
    const requests = (await requestResponse.json()) as AccessRequestRow[];
    const accessRequest = requests[0];
    if (!accessRequest) {
      res.status(404).json({ error: "Access request not found." });
      return;
    }
    if (accessRequest.status !== "pending") {
      res.status(409).json({ error: "This access request has already been reviewed." });
      return;
    }

    if (body.data.decision === "decline") {
      const declineResponse = await setRequestDecision(
        context,
        accessRequest.id,
        context.userId,
        "declined",
      );
      if (!declineResponse.ok) {
        req.log.error({ statusCode: declineResponse.status }, "Could not decline an access request.");
        res.status(503).json({ error: "The access request could not be updated. Try again later." });
        return;
      }
      const declinedRows = (await declineResponse.json()) as AccessRequestRow[];
      if (!declinedRows.length) {
        res.status(409).json({ error: "This access request was reviewed by another admin." });
        return;
      }
      res.status(200).json(
        ReviewAccessRequestResponse.parse({ message: "Access request declined." }),
      );
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
    const sender = await getVerifiedBrevoSender();
    if (!sender) {
      req.log.error("Brevo has no active verified sender configured for access approvals.");
      res.status(503).json({ error: "Email delivery is not configured. Contact an administrator." });
      return;
    }

    const claimResponse = await setRequestDecision(
      context,
      accessRequest.id,
      context.userId,
      "accepted",
    );
    if (!claimResponse.ok) {
      req.log.error({ statusCode: claimResponse.status }, "Could not reserve an access request for approval.");
      res.status(503).json({ error: "The access request could not be updated. Try again later." });
      return;
    }
    const claimedRows = (await claimResponse.json()) as AccessRequestRow[];
    if (!claimedRows.length) {
      res.status(409).json({ error: "This access request was reviewed by another admin." });
      return;
    }
    requestMarkedAccepted = true;

    const linkResponse = await supabaseAdminFetch(context, "/auth/v1/admin/generate_link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "invite",
        email: accessRequest.email,
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
        await reopenRequest(context, accessRequest.id, context.userId, req);
        requestMarkedAccepted = false;
        res.status(409).json({ error: "This email already has an Automation Hub account." });
        return;
      }
      req.log.warn({ statusCode: linkResponse.status }, "Supabase did not create an approved invitation.");
      await reopenRequest(context, accessRequest.id, context.userId, req);
      requestMarkedAccepted = false;
      res.status(502).json({ error: "Supabase could not create the invitation. Try again later." });
      return;
    }

    invitedUserId = linkData.user?.id;
    if (!linkData.action_link || !invitedUserId) {
      req.log.error("Supabase returned incomplete access-approval invitation details.");
      await deleteInvitedUser(context, invitedUserId, req);
      await reopenRequest(context, accessRequest.id, context.userId, req);
      requestMarkedAccepted = false;
      res.status(502).json({ error: "The invitation link could not be created. Try again later." });
      return;
    }

    const profileResponse = await supabaseAdminFetch(
      context,
      `/rest/v1/profiles?id=eq.${encodeURIComponent(invitedUserId)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({ access_approved: true }),
      },
    );
    if (!profileResponse.ok) {
      req.log.error({ statusCode: profileResponse.status }, "Could not approve the invited user's profile.");
      await deleteInvitedUser(context, invitedUserId, req);
      await reopenRequest(context, accessRequest.id, context.userId, req);
      requestMarkedAccepted = false;
      res.status(503).json({ error: "The account could not be approved. Try again later." });
      return;
    }
    const profiles = (await profileResponse.json()) as Array<{ id: string }>;
    if (!profiles.length) {
      req.log.error("No profile was updated for the invited user.");
      await deleteInvitedUser(context, invitedUserId, req);
      await reopenRequest(context, accessRequest.id, context.userId, req);
      requestMarkedAccepted = false;
      res.status(503).json({ error: "The account could not be approved. Try again later." });
      return;
    }

    const safeLink = escapeHtml(linkData.action_link);
    const safeEmail = escapeHtml(accessRequest.email);
    const emailResponse = await sendBrevoEmail({
      sender,
      to: [{ email: accessRequest.email }],
      subject: "Your Automation Hub access request was approved",
      textContent: `Your request to use Automation Hub has been approved. Accept your invitation and set your password here: ${linkData.action_link}\n\nIf you did not request access, you can ignore this email.`,
      htmlContent: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#27212a"><h1 style="color:#BD0F72">Your request was approved</h1><p>Access for <strong>${safeEmail}</strong> has been approved by a workspace admin.</p><p>Use the invitation link below to verify your email and finish setting up your account.</p><p><a href="${safeLink}" style="display:inline-block;background:#BD0F72;color:#FFFFFF;padding:12px 18px;border-radius:8px;text-decoration:none">Accept invitation</a></p><p>If you did not request access, you can ignore this email.</p></body></html>`,
    });
    if (!emailResponse.ok) {
      req.log.error({ statusCode: emailResponse.status }, "Brevo failed to send an access approval email.");
      await deleteInvitedUser(context, invitedUserId, req);
      await reopenRequest(context, accessRequest.id, context.userId, req);
      requestMarkedAccepted = false;
      res.status(502).json({ error: "The invitation email could not be sent. Try again later." });
      return;
    }

    res.status(200).json(
      ReviewAccessRequestResponse.parse({ message: `Invitation sent to ${accessRequest.email}.` }),
    );
  } catch (error) {
    if (invitedUserId) await deleteInvitedUser(context, invitedUserId, req);
    if (requestMarkedAccepted) {
      await reopenRequest(context, params.data.requestId, context.userId, req);
    }
    req.log.error(
      { err: error instanceof Error ? error.message : "Unknown error" },
      "Access request review failed.",
    );
    res.status(503).json({ error: "The access request service is temporarily unavailable." });
  }
});

export default router;
