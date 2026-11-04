import { Router, type IRouter, type Response } from "express";
import crypto from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import { db, pool, inMemory, profiles, passwordResets } from "../db";
import { requireAdmin, hashPassword, type AuthRequest } from "../lib/auth";
import { sendAdminElevationEmail, sendUserInvitationEmail } from "../lib/brevo-email";

const router: IRouter = Router();

// GET all users (Admin only)
router.get("/admin/users", requireAdmin, async (_req: AuthRequest, res: Response): Promise<void> => {
  if (pool && db) {
    try {
      const rows = await db
        .select()
        .from(profiles)
        .where(eq(profiles.accessApproved, true))
        .orderBy(asc(profiles.email));

      const result = rows.map((u: any) => ({
        id: u.id,
        name: u.name || "",
        email: u.email,
        role: u.role,
        is_blocked: u.isBlocked,
        access_approved: u.accessApproved,
        email_verified: u.emailVerified,
        created_at: typeof u.createdAt === "string" ? u.createdAt : u.createdAt ? new Date(u.createdAt).toISOString() : new Date().toISOString(),
      }));
      res.status(200).json(result);
      return;
    } catch (err) {
      console.error("[AdminUsers] Error querying users from database:", err);
    }
  }

  const list = Array.from(inMemory.profiles.values())
    .filter((u) => u.accessApproved)
    .sort((a, b) => a.email.localeCompare(b.email));

  res.status(200).json(
    list.map((u) => ({
      id: u.id,
      name: u.name || "",
      email: u.email,
      role: u.role,
      is_blocked: u.isBlocked,
      access_approved: u.accessApproved,
      email_verified: u.emailVerified,
      created_at: typeof u.createdAt === "string" ? u.createdAt : u.createdAt.toISOString(),
    })),
  );
});

// PATCH /admin/users/:userId/blocked (Admin only)
router.patch("/admin/users/:userId/blocked", requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  const userId = String(req.params.userId);
  const { blocked } = req.body || {};
  const currentAdmin = req.user!;

  if (typeof blocked !== "boolean") {
    res.status(400).json({ error: "Choose a valid block status." });
    return;
  }

  if (blocked && userId === currentAdmin.id) {
    res.status(400).json({ error: "You cannot block your own admin account." });
    return;
  }

  const now = new Date();

  if (pool && db) {
    try {
      const targetRows = await db
        .select()
        .from(profiles)
        .where(eq(profiles.id, userId))
        .limit(1);

      if (!targetRows.length) {
        res.status(404).json({ error: "User not found." });
        return;
      }

      const target = targetRows[0];

      // Prevent blocking the last active admin
      if (blocked && target.role === "admin") {
        const activeAdmins = await db
          .select({ count: sql<number>`count(*)` })
          .from(profiles)
          .where(sql`${profiles.role} = 'admin' AND ${profiles.isBlocked} = false`);

        const count = Number(activeAdmins[0]?.count ?? 0);
        if (count <= 1) {
          res.status(409).json({ error: "The last active admin cannot be blocked." });
          return;
        }
      }

      await db
        .update(profiles)
        .set({ isBlocked: blocked, updatedAt: now })
        .where(eq(profiles.id, userId));

      res.status(200).json({
        message: blocked ? "User blocked." : "User unblocked.",
      });
      return;
    } catch (err) {
      console.error("[AdminUsers] Database error updating block status:", err);
    }
  }

  const target = inMemory.profiles.get(userId);
  if (!target) {
    res.status(404).json({ error: "User not found." });
    return;
  }

  target.isBlocked = blocked;
  target.updatedAt = now;
  inMemory.save?.();

  res.status(200).json({
    message: blocked ? "User blocked." : "User unblocked.",
  });
});

// GET /auth/check-email (Admin only check for existing user)
router.get("/auth/check-email", requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  const email = typeof req.query.email === "string" ? req.query.email.trim().toLowerCase() : "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(200).json({ exists: false, role: null });
    return;
  }

  if (pool && db) {
    try {
      const [found] = await db
        .select({ id: profiles.id, email: profiles.email, role: profiles.role, name: profiles.name })
        .from(profiles)
        .where(sql`LOWER(${profiles.email}) = ${email}`)
        .limit(1);

      if (found) {
        res.status(200).json({ exists: true, role: found.role, name: found.name || "" });
        return;
      }
    } catch (err) {
      console.error("[CheckEmail] Database error checking user email:", err);
    }
  }

  for (const u of inMemory.profiles.values()) {
    if (u.email.toLowerCase() === email) {
      res.status(200).json({ exists: true, role: u.role, name: u.name || "" });
      return;
    }
  }

  res.status(200).json({ exists: false, role: null });
});

// POST /auth/invite (Admin only)
router.post("/auth/invite", requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  const { email, name, isAdmin } = req.body || {};
  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const userName = typeof name === "string" ? name.trim() : "";
  const giveAdmin = Boolean(isAdmin);
  const now = new Date();
  const origin = req.headers.origin || "https://automation-app-hub.vercel.app";

  if (pool && db) {
    try {
      const existing = await db
        .select()
        .from(profiles)
        .where(sql`LOWER(${profiles.email}) = ${normalizedEmail}`)
        .limit(1);

      if (existing.length > 0) {
        const user = existing[0];
        if (giveAdmin) {
          if (user.role === "admin") {
            res.status(200).json({
              message: `${normalizedEmail} already has Admin privileges.`,
              alreadyAdmin: true,
              elevated: false,
            });
            return;
          }

          // Elevate existing user to Admin
          await db
            .update(profiles)
            .set({
              role: "admin",
              accessApproved: true,
              isBlocked: false,
              updatedAt: now,
            })
            .where(eq(profiles.id, user.id));

          try {
            await sendAdminElevationEmail({
              email: normalizedEmail,
              name: user.name || userName,
            });
          } catch (mailErr) {
            console.warn("[Invite] Failed to dispatch admin elevation email:", mailErr);
          }

          res.status(200).json({
            message: `Elevated ${normalizedEmail} to Admin privilege successfully.`,
            elevated: true,
          });
          return;
        }

        res.status(409).json({
          error: "This email already has an account. Check 'Grant Admin privileges' to elevate.",
          exists: true,
        });
        return;
      }

      // Create new invited user
      const id = crypto.randomUUID();
      const tempPassword = crypto.randomBytes(12).toString("hex");
      const tempHash = await hashPassword(tempPassword);

      await db.insert(profiles).values({
        id,
        name: userName,
        email: normalizedEmail,
        passwordHash: tempHash,
        role: giveAdmin ? "admin" : "user",
        isBlocked: false,
        accessApproved: true,
        emailVerified: true,
        createdAt: now,
        updatedAt: now,
      });

      // Generate a setup token
      const token = crypto.randomBytes(32).toString("hex");
      await db.insert(passwordResets).values({
        id: crypto.randomUUID(),
        email: normalizedEmail,
        token,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000), // 7 days
        used: false,
        createdAt: now,
      });

      const setupUrl = `${origin}/reset-password?invite=1&token=${token}`;
      console.info(`[Invite] Setup link for ${normalizedEmail}: ${setupUrl}`);

      try {
        await sendUserInvitationEmail({
          email: normalizedEmail,
          name: userName,
          setupUrl,
          isAdmin: giveAdmin,
        });
      } catch (mailErr) {
        console.warn("[Invite] Failed to dispatch user invitation email:", mailErr);
      }

      res.status(201).json({
        message: `Invitation created for ${normalizedEmail} with ${giveAdmin ? "Admin" : "Member"} privileges.`,
        elevated: false,
      });
      return;
    } catch (err) {
      console.error("[Invite] Database error inviting user:", err);
    }
  }

  // In-memory fallback
  for (const u of inMemory.profiles.values()) {
    if (u.email.toLowerCase() === normalizedEmail) {
      if (giveAdmin) {
        if (u.role === "admin") {
          res.status(200).json({
            message: `${normalizedEmail} already has Admin privileges.`,
            alreadyAdmin: true,
            elevated: false,
          });
          return;
        }
        u.role = "admin";
        u.accessApproved = true;
        u.isBlocked = false;
        u.updatedAt = now;
        inMemory.save?.();
        res.status(200).json({
          message: `Elevated ${normalizedEmail} to Admin privilege successfully.`,
          elevated: true,
        });
        return;
      }
      res.status(409).json({
        error: "This email already has an account. Check 'Grant Admin privileges' to elevate.",
        exists: true,
      });
      return;
    }
  }

  const id = crypto.randomUUID();
  const tempPassword = crypto.randomBytes(12).toString("hex");
  const tempHash = await hashPassword(tempPassword);

  inMemory.profiles.set(id, {
    id,
    name: userName,
    email: normalizedEmail,
    passwordHash: tempHash,
    role: giveAdmin ? "admin" : "user",
    isBlocked: false,
    accessApproved: true,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
  inMemory.save?.();

  res.status(201).json({
    message: `Invitation created for ${normalizedEmail} with ${giveAdmin ? "Admin" : "Member"} privileges.`,
    elevated: false,
  });
});

export default router;
