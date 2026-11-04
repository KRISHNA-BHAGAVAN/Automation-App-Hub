import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db, pool, inMemory, profiles, accessRequests, passwordResets } from "@workspace/db";
import {
  hashPassword,
  comparePassword,
  signToken,
  setAuthCookie,
  clearAuthCookie,
  authenticateToken,
  getUserByEmail,
  type AuthRequest,
} from "../lib/auth";
import { isCompanyEmail } from "../lib/account-policy";

const router: IRouter = Router();

// Sign In
router.post("/auth/login", async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body || {};
  if (!email || !password || typeof email !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "Email address and password are required." });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await getUserByEmail(normalizedEmail);
  if (!user) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }

  const passwordMatch = await comparePassword(password, user.password_hash);
  if (!passwordMatch) {
    res.status(401).json({ error: "Invalid email or password." });
    return;
  }

  if (user.isBlocked) {
    res.status(403).json({ error: "This account has been blocked by an administrator." });
    return;
  }

  const token = signToken({ id: user.id, email: user.email, role: user.role });
  setAuthCookie(res, token);

  const formattedUser = {
    id: user.id,
    email: user.email,
    role: user.role,
    is_blocked: user.isBlocked,
    access_approved: user.accessApproved,
    email_verified: user.emailVerified,
    created_at: typeof user.createdAt === "string" ? user.createdAt : user.createdAt.toISOString(),
  };

  res.status(200).json({ user: formattedUser, token });
});

// Sign Up
router.post("/auth/sign-up", async (req: Request, res: Response): Promise<void> => {
  const { email, password } = req.body || {};
  if (!email || !password || typeof email !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "Email and password are required." });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (password.length < 8) {
    res.status(400).json({ error: "Choose a password with at least 8 characters." });
    return;
  }

  if (!isCompanyEmail(normalizedEmail)) {
    res.status(400).json({
      error: "Use an @one-line.com address to sign up directly. Other addresses must request access.",
    });
    return;
  }

  const existing = await getUserByEmail(normalizedEmail);
  if (existing) {
    // Return friendly duplicate response
    res.status(200).json({
      message: "An account with this email already exists. Please sign in.",
    });
    return;
  }

  const passwordHash = await hashPassword(password);
  const id = crypto.randomUUID();

  // Check if this is the first user in the database -> make them admin!
  let isFirstUser = false;
  if (pool && db) {
    try {
      const countResult = await db.select({ count: sql<number>`count(*)` }).from(profiles);
      const total = Number(countResult[0]?.count ?? 0);
      isFirstUser = total === 0;
    } catch {
      isFirstUser = inMemory.profiles.size === 0;
    }
  } else {
    isFirstUser = inMemory.profiles.size === 0;
  }

  const role = isFirstUser ? "admin" : "user";
  const accessApproved = true; // @one-line.com emails are approved
  const emailVerified = true;
  const now = new Date();

  if (pool && db) {
    try {
      await db.insert(profiles).values({
        id,
        email: normalizedEmail,
        passwordHash,
        role,
        isBlocked: false,
        accessApproved,
        emailVerified,
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      console.error("[Auth] Database error inserting profile:", err);
      // Fallback in memory
      inMemory.profiles.set(id, {
        id,
        email: normalizedEmail,
        passwordHash,
        role,
        isBlocked: false,
        accessApproved,
        emailVerified,
        createdAt: now,
        updatedAt: now,
      });
    }
  } else {
    inMemory.profiles.set(id, {
      id,
      email: normalizedEmail,
      passwordHash,
      role,
      isBlocked: false,
      accessApproved,
      emailVerified,
      createdAt: now,
      updatedAt: now,
    });
  }

  const token = signToken({ id, email: normalizedEmail, role });
  setAuthCookie(res, token);

  const formattedUser = {
    id,
    email: normalizedEmail,
    role,
    is_blocked: false,
    access_approved: accessApproved,
    email_verified: emailVerified,
    created_at: now.toISOString(),
  };

  res.status(201).json({
    message: "Your account has been created successfully.",
    user: formattedUser,
    token,
  });
});

// Current User Profile
router.get("/auth/me", async (req: AuthRequest, res: Response): Promise<void> => {
  const user = await authenticateToken(req);
  if (!user) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  res.status(200).json({ user });
});

// Sign Out
router.post("/auth/logout", (_req: Request, res: Response): void => {
  clearAuthCookie(res);
  res.status(200).json({ message: "Signed out successfully." });
});

// Access Request for non-company email
router.post("/auth/access-requests", async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body || {};
  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (isCompanyEmail(normalizedEmail)) {
    res.status(400).json({ error: "Use your @one-line.com address to sign up directly." });
    return;
  }

  const id = crypto.randomUUID();
  const now = new Date();

  if (pool && db) {
    try {
      await db.insert(accessRequests).values({
        id,
        email: normalizedEmail,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      });
    } catch (err) {
      console.warn("[AccessRequest] Error saving to db, using memory:", err);
      inMemory.accessRequests.set(id, {
        id,
        email: normalizedEmail,
        status: "pending",
        reviewedBy: null,
        reviewedAt: null,
        createdAt: now,
        updatedAt: now,
      });
    }
  } else {
    inMemory.accessRequests.set(id, {
      id,
      email: normalizedEmail,
      status: "pending",
      reviewedBy: null,
      reviewedAt: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  res.status(202).json({
    message: "Your access request has been sent to the workspace admins.",
  });
});

// Password Reset Request
router.post("/auth/password-reset", async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body || {};
  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Email address is required." });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await getUserByEmail(normalizedEmail);
  if (user) {
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour
    const id = crypto.randomUUID();

    if (pool && db) {
      try {
        await db.insert(passwordResets).values({
          id,
          email: normalizedEmail,
          token,
          expiresAt,
          used: false,
          createdAt: new Date(),
        });
      } catch (err) {
        console.warn("[PasswordReset] Error storing reset token in db:", err);
        inMemory.passwordResets.set(id, {
          id,
          email: normalizedEmail,
          token,
          expiresAt,
          used: false,
          createdAt: new Date(),
        });
      }
    } else {
      inMemory.passwordResets.set(id, {
        id,
        email: normalizedEmail,
        token,
        expiresAt,
        used: false,
        createdAt: new Date(),
      });
    }

    console.info(`[PasswordReset] Reset link generated for ${normalizedEmail}: /reset-password?token=${token}`);
  }

  // Consistent message regardless of user existence
  res.status(200).json({
    message: "If an account exists with this email, recovery instructions have been sent.",
  });
});

// Set New Password with Reset Token
router.post("/auth/reset-password", async (req: Request, res: Response): Promise<void> => {
  const { token, password } = req.body || {};
  if (!token || !password || typeof password !== "string" || password.length < 8) {
    res.status(400).json({ error: "A valid reset token and a password with at least 8 characters are required." });
    return;
  }

  let resetRecord: any = null;
  if (pool && db) {
    try {
      const rows = await db
        .select()
        .from(passwordResets)
        .where(eq(passwordResets.token, token))
        .limit(1);
      if (rows.length > 0) resetRecord = rows[0];
    } catch (err) {
      console.warn("[PasswordReset] Error querying reset token:", err);
    }
  }

  if (!resetRecord) {
    for (const r of inMemory.passwordResets.values()) {
      if (r.token === token) {
        resetRecord = r;
        break;
      }
    }
  }

  if (!resetRecord || resetRecord.used || new Date(resetRecord.expiresAt) < new Date()) {
    res.status(400).json({ error: "This password reset link is invalid or has expired." });
    return;
  }

  const newHash = await hashPassword(password);
  const now = new Date();

  if (pool && db) {
    try {
      await db
        .update(profiles)
        .set({ passwordHash: newHash, updatedAt: now })
        .where(sql`LOWER(${profiles.email}) = ${resetRecord.email.toLowerCase()}`);
      await db
        .update(passwordResets)
        .set({ used: true })
        .where(eq(passwordResets.token, token));
    } catch (err) {
      console.error("[PasswordReset] Error updating password in db:", err);
    }
  }

  // Also update in-memory if user exists there
  for (const u of inMemory.profiles.values()) {
    if (u.email.toLowerCase() === resetRecord.email.toLowerCase()) {
      u.passwordHash = newHash;
      u.updatedAt = now;
    }
  }
  resetRecord.used = true;

  res.status(200).json({ message: "Your password has been successfully updated." });
});

export default router;
