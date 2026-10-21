import { Router, type IRouter } from "express";
import {
  SetUserBlockedBody,
  SetUserBlockedParams,
  SetUserBlockedResponse,
} from "@workspace/api-zod";
import { requireAdmin, supabaseAdminFetch } from "../lib/supabase-admin";

const router: IRouter = Router();

type UserProfileRow = {
  id: string;
  role: "admin" | "user";
  is_blocked: boolean;
};

function updateAuthBan(
  context: Parameters<typeof supabaseAdminFetch>[0],
  userId: string,
  blocked: boolean,
): Promise<Response> {
  return supabaseAdminFetch(
    context,
    `/auth/v1/admin/users/${encodeURIComponent(userId)}`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ban_duration: blocked ? "876000h" : "none",
      }),
    },
  );
}

function updateProfileBlocked(
  context: Parameters<typeof supabaseAdminFetch>[0],
  userId: string,
  blocked: boolean,
): Promise<Response> {
  return supabaseAdminFetch(
    context,
    `/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ is_blocked: blocked }),
    },
  );
}

router.patch("/admin/users/:userId/blocked", async (req, res): Promise<void> => {
  const params = SetUserBlockedParams.safeParse(req.params);
  const body = SetUserBlockedBody.safeParse(req.body);
  if (!params.success || !body.success) {
    res.status(400).json({ error: "Choose a valid user and block status." });
    return;
  }

  const adminAuth = await requireAdmin(req);
  if (!adminAuth.ok) {
    res.status(adminAuth.status).json({ error: adminAuth.error });
    return;
  }
  const { context } = adminAuth;
  const targetId = params.data.userId;
  const shouldBlock = body.data.blocked;

  if (shouldBlock && targetId === context.userId) {
    res.status(400).json({ error: "You cannot block your own admin account." });
    return;
  }

  try {
    const profileUrl = new URL(`${context.supabaseUrl}/rest/v1/profiles`);
    profileUrl.searchParams.set("id", `eq.${targetId}`);
    profileUrl.searchParams.set("select", "id,role,is_blocked");
    profileUrl.searchParams.set("limit", "1");
    const profileResponse = await supabaseAdminFetch(
      context,
      `${profileUrl.pathname}${profileUrl.search}`,
    );
    if (!profileResponse.ok) {
      req.log.error({ statusCode: profileResponse.status }, "Could not load a user profile.");
      res.status(503).json({ error: "The user service is temporarily unavailable." });
      return;
    }
    const profiles = (await profileResponse.json()) as UserProfileRow[];
    const target = profiles[0];
    if (!target) {
      res.status(404).json({ error: "User not found." });
      return;
    }
    if (target.is_blocked === shouldBlock) {
      res.status(200).json(
        SetUserBlockedResponse.parse({
          message: shouldBlock ? "This account is already blocked." : "This account is already active.",
        }),
      );
      return;
    }

    if (shouldBlock && target.role === "admin") {
      const adminsUrl = new URL(`${context.supabaseUrl}/rest/v1/profiles`);
      adminsUrl.searchParams.set("role", "eq.admin");
      adminsUrl.searchParams.set("is_blocked", "eq.false");
      adminsUrl.searchParams.set("access_approved", "eq.true");
      adminsUrl.searchParams.set("email_verified", "eq.true");
      adminsUrl.searchParams.set("select", "id");
      const adminsResponse = await supabaseAdminFetch(
        context,
        `${adminsUrl.pathname}${adminsUrl.search}`,
      );
      if (!adminsResponse.ok) {
        req.log.error({ statusCode: adminsResponse.status }, "Could not check active admin count.");
        res.status(503).json({ error: "The user service is temporarily unavailable." });
        return;
      }
      const activeAdmins = (await adminsResponse.json()) as Array<{ id: string }>;
      if (activeAdmins.length <= 1) {
        res.status(409).json({ error: "The last active admin cannot be blocked." });
        return;
      }
    }

    if (shouldBlock) {
      const profileUpdate = await updateProfileBlocked(context, targetId, true);
      if (!profileUpdate.ok) {
        req.log.error({ statusCode: profileUpdate.status }, "Could not block the user profile.");
        res.status(503).json({ error: "The user access status could not be updated." });
        return;
      }
      const updatedProfiles = (await profileUpdate.json()) as UserProfileRow[];
      if (!updatedProfiles.length) {
        res.status(404).json({ error: "User not found." });
        return;
      }

      const authUpdate = await updateAuthBan(context, targetId, true);
      if (!authUpdate.ok) {
        req.log.error({ statusCode: authUpdate.status }, "Supabase Auth could not block the account.");
        await updateProfileBlocked(context, targetId, target.is_blocked);
        res.status(503).json({ error: "Supabase Auth could not update the account status. Try again later." });
        return;
      }
    } else {
      const authUpdate = await updateAuthBan(context, targetId, false);
      if (!authUpdate.ok) {
        req.log.error({ statusCode: authUpdate.status }, "Supabase Auth could not unblock the account.");
        res.status(503).json({ error: "Supabase Auth could not update the account status. Try again later." });
        return;
      }

      const profileUpdate = await updateProfileBlocked(context, targetId, false);
      if (!profileUpdate.ok) {
        req.log.error({ statusCode: profileUpdate.status }, "Could not unblock the user profile.");
        const rebanResponse = await updateAuthBan(context, targetId, true);
        if (!rebanResponse.ok) {
          req.log.error({ statusCode: rebanResponse.status }, "Could not restore the Supabase Auth ban.");
        }
        res.status(503).json({ error: "The user access status could not be updated. Try again later." });
        return;
      }
      const updatedProfiles = (await profileUpdate.json()) as UserProfileRow[];
      if (!updatedProfiles.length) {
        await updateAuthBan(context, targetId, true);
        res.status(404).json({ error: "User not found." });
        return;
      }
    }

    res.status(200).json(
      SetUserBlockedResponse.parse({
        message: shouldBlock ? "User blocked." : "User unblocked.",
      }),
    );
  } catch (error) {
    req.log.error(
      { err: error instanceof Error ? error.message : "Unknown error" },
      "User access status update failed.",
    );
    res.status(503).json({ error: "The user service is temporarily unavailable." });
  }
});

export default router;
