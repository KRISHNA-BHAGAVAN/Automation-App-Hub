import { Router, type IRouter, type Response } from "express";
import crypto from "node:crypto";
import { asc, eq, sql } from "drizzle-orm";
import { db, pool, inMemory, profiles, passwordResets } from "@workspace/db";
import { requireAdmin, hashPassword, type AuthRequest } from "../lib/auth";

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
  const { userId } = req.params;
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

// POST /auth/invite (Admin only)
router.post("/auth/invite", requireAdmin, async (req: AuthRequest, res: Response): Promise<void> => {
  const { email } = req.body || {};
  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail.endsWith("@one-line.com")) {
    res.status(400).json({
      error: "Use an @one-line.com address to invite a teammate. Other addresses must use the access request process.",
    });
    return;
  }

  const now = new Date();
  const id = crypto.randomUUID();
  const tempPassword = crypto.randomBytes(12).toString("hex");
  const tempHash = await hashPassword(tempPassword);

  if (pool && db) {
    try {
      const existing = await db
        .select()
        .from(profiles)
        .where(sql`LOWER(${profiles.email}) = ${normalizedEmail}`)
        .limit(1);

      if (existing.length > 0) {
        res.status(409).json({ error: "This email already has an Automation Hub account." });
        return;
      }

      await db.insert(profiles).values({
        id,
        email: normalizedEmail,
        passwordHash: tempHash,
        role: "user",
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

      console.info(`[Invite] Setup link for ${normalizedEmail}: /reset-password?invite=1&token=${token}`);

      res.status(201).json({
        message: `Invitation created for ${normalizedEmail}.`,
      });
      return;
    } catch (err) {
      console.error("[Invite] Database error inviting user:", err);
    }
  }

  for (const u of inMemory.profiles.values()) {
    if (u.email.toLowerCase() === normalizedEmail) {
      res.status(409).json({ error: "This email already has an Automation Hub account." });
      return;
    }
  }

  inMemory.profiles.set(id, {
    id,
    email: normalizedEmail,
    passwordHash: tempHash,
    role: "user",
    isBlocked: false,
    accessApproved: true,
    emailVerified: true,
    createdAt: now,
    updatedAt: now,
  });
  inMemory.save?.();

  res.status(201).json({
    message: `Invitation created for ${normalizedEmail}.`,
  });
});

export default router;
