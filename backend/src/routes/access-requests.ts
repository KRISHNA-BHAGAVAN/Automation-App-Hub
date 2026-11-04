import { Router, type IRouter, type Response } from "express";
import crypto from "node:crypto";
import { desc, eq, sql } from "drizzle-orm";
import { db, pool, inMemory, accessRequests, profiles } from "../db";
import { requireAdmin, hashPassword, type AuthRequest } from "../lib/auth";

const router: IRouter = Router();

// GET all access requests (Admin only)
router.get("/auth/access-requests", requireAdmin, async (_req: AuthRequest, res: Response): Promise<void> => {
  if (pool && db) {
    try {
      const rows = await db
        .select()
        .from(accessRequests)
        .orderBy(desc(accessRequests.createdAt));

      const result = rows.map((r: any) => ({
        id: r.id,
        email: r.email,
        status: r.status,
        reviewed_by: r.reviewedBy,
        reviewed_at: r.reviewedAt ? (typeof r.reviewedAt === "string" ? r.reviewedAt : new Date(r.reviewedAt).toISOString()) : null,
        created_at: typeof r.createdAt === "string" ? r.createdAt : r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
      }));
      res.status(200).json(result);
      return;
    } catch (err) {
      console.error("[AccessRequests] Error fetching access requests:", err);
    }
  }

  const list = Array.from(inMemory.accessRequests.values()).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  res.status(200).json(
    list.map((r) => ({
      id: r.id,
      email: r.email,
      status: r.status,
      reviewed_by: r.reviewedBy,
      reviewed_at: r.reviewedAt ? new Date(r.reviewedAt).toISOString() : null,
      created_at: typeof r.createdAt === "string" ? r.createdAt : r.createdAt.toISOString(),
    })),
  );
});

// Admin decides on access request (accept / decline)
router.post(
  "/auth/access-requests/:requestId/decision",
  requireAdmin,
  async (req: AuthRequest, res: Response): Promise<void> => {
    const requestId = String(req.params.requestId);
    const { decision } = req.body || {};
    const adminUser = req.user!;

    if (decision !== "accept" && decision !== "decline") {
      res.status(400).json({ error: "Choose accept or decline." });
      return;
    }

    const now = new Date();

    if (pool && db) {
      try {
        const rows = await db
          .select()
          .from(accessRequests)
          .where(eq(accessRequests.id, requestId))
          .limit(1);

        if (!rows.length) {
          res.status(404).json({ error: "Access request not found." });
          return;
        }

        const request = rows[0];

        await db
          .update(accessRequests)
          .set({
            status: decision === "accept" ? "accepted" : "declined",
            reviewedBy: adminUser.id,
            reviewedAt: now,
            updatedAt: now,
          })
          .where(eq(accessRequests.id, requestId));

        if (decision === "accept") {
          // Check if profile exists for this email
          const existing = await db
            .select()
            .from(profiles)
            .where(sql`LOWER(${profiles.email}) = ${request.email.toLowerCase()}`)
            .limit(1);

          if (existing.length > 0) {
            await db
              .update(profiles)
              .set({ accessApproved: true, updatedAt: now })
              .where(eq(profiles.id, existing[0].id));
          } else {
            // Create user profile ready for them with default temp password
            const tempPassword = crypto.randomBytes(12).toString("hex");
            const tempHash = await hashPassword(tempPassword);
            await db.insert(profiles).values({
              id: crypto.randomUUID(),
              name: "",
              email: request.email.toLowerCase(),
              passwordHash: tempHash,
              role: "user",
              isBlocked: false,
              accessApproved: true,
              emailVerified: true,
              createdAt: now,
              updatedAt: now,
            });
          }
        }

        res.status(200).json({
          message:
            decision === "accept"
              ? `Access request approved for ${request.email}.`
              : `Access request declined for ${request.email}.`,
        });
        return;
      } catch (err) {
        console.error("[AccessRequests] Database error updating request:", err);
      }
    }

    const request = inMemory.accessRequests.get(requestId);
    if (!request) {
      res.status(404).json({ error: "Access request not found." });
      return;
    }

    request.status = decision === "accept" ? "accepted" : "declined";
    request.reviewedBy = adminUser.id;
    request.reviewedAt = now;
    request.updatedAt = now;

    if (decision === "accept") {
      let foundUser = false;
      for (const u of inMemory.profiles.values()) {
        if (u.email.toLowerCase() === request.email.toLowerCase()) {
          u.accessApproved = true;
          u.updatedAt = now;
          foundUser = true;
          break;
        }
      }
      if (!foundUser) {
        const tempPassword = crypto.randomBytes(12).toString("hex");
        const tempHash = await hashPassword(tempPassword);
        const newId = crypto.randomUUID();
        inMemory.profiles.set(newId, {
          id: newId,
          name: "",
          email: request.email.toLowerCase(),
          passwordHash: tempHash,
          role: "user",
          isBlocked: false,
          accessApproved: true,
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        });
      }
    }
    inMemory.save?.();

    res.status(200).json({
      message:
        decision === "accept"
          ? `Access request approved for ${request.email}.`
          : `Access request declined for ${request.email}.`,
    });
  },
);

export default router;
