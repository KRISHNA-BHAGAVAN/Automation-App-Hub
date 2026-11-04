import { Router, type IRouter, type Request, type Response } from "express";
import crypto from "node:crypto";
import { eq, sql, and, gt } from "drizzle-orm";
import { db, pool, inMemory, profiles, accessRequests, passwordResets, emailVerifications } from "../db";
import {
  hashPassword,
  comparePassword,
  signToken,
  setAuthCookie,
  clearAuthCookie,
  authenticateToken,
  getUserByEmail,
  getUserById,
  requireAuth,
  type AuthRequest,
} from "../lib/auth";
import { isCompanyEmail } from "../lib/account-policy";
import { sendPasswordResetEmail, sendEmailVerificationCode } from "../lib/brevo-email";

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
    name: user.name || "",
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
  const { name, email, password } = req.body || {};
  if (!email || !password || typeof email !== "string" || typeof password !== "string") {
    res.status(400).json({ error: "Email and password are required." });
    return;
  }

  if (!name || typeof name !== "string" || name.trim().length < 2) {
    res.status(400).json({ error: "Please enter your full name (at least 2 characters)." });
    return;
  }

  const trimmedName = name.trim();
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
        name: trimmedName,
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
        name: trimmedName,
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
      name: trimmedName,
      email: normalizedEmail,
      passwordHash,
      role,
      isBlocked: false,
      accessApproved,
      emailVerified,
      createdAt: now,
      updatedAt: now,
    });
    inMemory.save?.();
  }

  const token = signToken({ id, email: normalizedEmail, role });
  setAuthCookie(res, token);

  const formattedUser = {
    id,
    name: trimmedName,
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

// Update Profile (Name & Email with verification)
router.patch("/auth/profile", requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const authUser = req.user!;
  const { name, email } = req.body || {};

  const updates: Record<string, any> = { updatedAt: new Date() };

  if (typeof name === "string") {
    const trimmedName = name.trim();
    if (trimmedName.length < 2) {
      res.status(400).json({ error: "Name must be at least 2 characters." });
      return;
    }
    updates.name = trimmedName;
  }

  // Check if name is being updated
  if (updates.name) {
    if (pool && db) {
      try {
        await db.update(profiles).set(updates).where(eq(profiles.id, authUser.id));
      } catch (err) {
        console.error("[Profile] Database error updating name:", err);
      }
    }
    const memUser = inMemory.profiles.get(authUser.id);
    if (memUser) {
      memUser.name = updates.name;
      memUser.updatedAt = updates.updatedAt;
    }
    for (const u of inMemory.profiles.values()) {
      if (u.id === authUser.id) {
        u.name = updates.name;
        u.updatedAt = updates.updatedAt;
      }
    }
    inMemory.save?.();
  }

  // Check if email is being updated
  if (typeof email === "string") {
    const normalizedEmail = email.trim().toLowerCase();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      res.status(400).json({ error: "Please enter a valid email address." });
      return;
    }

    if (normalizedEmail !== authUser.email.toLowerCase()) {
      // Check if new email is already in use by someone else
      const existing = await getUserByEmail(normalizedEmail);
      if (existing && existing.id !== authUser.id) {
        res.status(409).json({ error: "An account with this email address already exists." });
        return;
      }

      // Generate 6-digit code
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 mins
      const verificationId = crypto.randomUUID();

      // Store verification request in db
      if (pool && db) {
        try {
          await db.delete(emailVerifications).where(eq(emailVerifications.userId, authUser.id));
          await db.insert(emailVerifications).values({
            id: verificationId,
            userId: authUser.id,
            newEmail: normalizedEmail,
            code,
            expiresAt,
            createdAt: new Date(),
          });
        } catch (err) {
          console.warn("[EmailVerification] Error storing verification in db:", err);
        }
      }

      // Store in memory
      for (const [key, v] of inMemory.emailVerifications.entries()) {
        if (v.userId === authUser.id) inMemory.emailVerifications.delete(key);
      }
      inMemory.emailVerifications.set(verificationId, {
        id: verificationId,
        userId: authUser.id,
        newEmail: normalizedEmail,
        code,
        expiresAt,
        createdAt: new Date(),
      });
      inMemory.save?.();

      console.info(`[EmailVerification] Verification code for ${normalizedEmail}: ${code}`);
      void sendEmailVerificationCode({
        email: normalizedEmail,
        code,
      });

      const updatedUser = await getUserById(authUser.id);
      res.status(200).json({
        message: `Verification code sent to ${normalizedEmail}. Enter the code to confirm.`,
        pendingEmailVerification: true,
        newEmail: normalizedEmail,
        user: updatedUser,
        debugCode: !process.env.BREVO_API_KEY ? code : undefined,
      });
      return;
    }
  }

  const updatedUser = await getUserById(authUser.id);
  res.status(200).json({
    message: "Profile updated successfully.",
    user: updatedUser,
  });
});

// Verify Email Change with 6-digit code
router.post("/auth/verify-email-change", requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const authUser = req.user!;
  const { code } = req.body || {};

  if (!code || typeof code !== "string" || code.trim().length !== 6) {
    res.status(400).json({ error: "Please enter the 6-digit verification code." });
    return;
  }

  const cleanCode = code.trim();
  const now = new Date();
  let verification: any = null;

  if (pool && db) {
    try {
      const rows = await db
        .select()
        .from(emailVerifications)
        .where(
          and(
            eq(emailVerifications.userId, authUser.id),
            eq(emailVerifications.code, cleanCode),
            gt(emailVerifications.expiresAt, now),
          ),
        )
        .limit(1);
      if (rows.length > 0) verification = rows[0];
    } catch (err) {
      console.warn("[EmailVerification] Error querying verification from db:", err);
    }
  }

  if (!verification) {
    for (const v of inMemory.emailVerifications.values()) {
      if (v.userId === authUser.id && v.code === cleanCode && new Date(v.expiresAt) > now) {
        verification = v;
        break;
      }
    }
  }

  if (!verification) {
    res.status(400).json({ error: "Invalid or expired verification code." });
    return;
  }

  const newEmail = verification.newEmail.toLowerCase().trim();

  // Update profile email
  if (pool && db) {
    try {
      await db
        .update(profiles)
        .set({ email: newEmail, updatedAt: now })
        .where(eq(profiles.id, authUser.id));
      await db
        .delete(emailVerifications)
        .where(eq(emailVerifications.userId, authUser.id));
    } catch (err) {
      console.error("[EmailVerification] Error updating profile email:", err);
    }
  }

  const memUser = inMemory.profiles.get(authUser.id);
  if (memUser) {
    memUser.email = newEmail;
    memUser.updatedAt = now;
  }
  for (const u of inMemory.profiles.values()) {
    if (u.id === authUser.id) {
      u.email = newEmail;
      u.updatedAt = now;
    }
  }

  for (const [key, v] of inMemory.emailVerifications.entries()) {
    if (v.userId === authUser.id) inMemory.emailVerifications.delete(key);
  }
  inMemory.save?.();

  // Issue new token with updated email
  const newToken = signToken({ id: authUser.id, email: newEmail, role: authUser.role });
  setAuthCookie(res, newToken);

  const updatedUser = await getUserById(authUser.id);

  res.status(200).json({
    message: "Email updated successfully.",
    user: updatedUser,
    token: newToken,
  });
});

// Resend Email Verification Code
router.post("/auth/resend-verification-code", requireAuth, async (req: AuthRequest, res: Response): Promise<void> => {
  const authUser = req.user!;
  const now = new Date();
  let pendingEmail: string | null = null;

  if (pool && db) {
    try {
      const rows = await db
        .select()
        .from(emailVerifications)
        .where(eq(emailVerifications.userId, authUser.id))
        .limit(1);
      if (rows.length > 0) pendingEmail = rows[0].newEmail;
    } catch (err) {
      console.warn("[EmailVerification] Error finding pending email in db:", err);
    }
  }

  if (!pendingEmail) {
    for (const v of inMemory.emailVerifications.values()) {
      if (v.userId === authUser.id) {
        pendingEmail = v.newEmail;
        break;
      }
    }
  }

  if (!pendingEmail) {
    res.status(400).json({ error: "No pending email change request found." });
    return;
  }

  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  const verificationId = crypto.randomUUID();

  if (pool && db) {
    try {
      await db.delete(emailVerifications).where(eq(emailVerifications.userId, authUser.id));
      await db.insert(emailVerifications).values({
        id: verificationId,
        userId: authUser.id,
        newEmail: pendingEmail,
        code,
        expiresAt,
        createdAt: now,
      });
    } catch (err) {
      console.warn("[EmailVerification] Error refreshing code:", err);
    }
  }

  for (const [key, v] of inMemory.emailVerifications.entries()) {
    if (v.userId === authUser.id) inMemory.emailVerifications.delete(key);
  }
  inMemory.emailVerifications.set(verificationId, {
    id: verificationId,
    userId: authUser.id,
    newEmail: pendingEmail,
    code,
    expiresAt,
    createdAt: now,
  });
  inMemory.save?.();

  console.info(`[EmailVerification] Resent verification code for ${pendingEmail}: ${code}`);
  void sendEmailVerificationCode({
    email: pendingEmail,
    code,
  });

  res.status(200).json({
    message: `A fresh verification code has been sent to ${pendingEmail}.`,
    debugCode: !process.env.BREVO_API_KEY ? code : undefined,
  });
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
    inMemory.save?.();
  }

  res.status(202).json({
    message: "Your access request has been sent to the workspace admins.",
  });
});

function getBaseOrigin(req: Request): string {
  const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost:3000";
  const proto = (req.headers["x-forwarded-proto"] as string) || (req.secure ? "https" : "http");
  return `${proto}://${host}`;
}

async function createResetToken(email: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour
  const id = crypto.randomUUID();

  if (pool && db) {
    try {
      await db.insert(passwordResets).values({
        id,
        email,
        token,
        expiresAt,
        used: false,
        createdAt: new Date(),
      });
      return token;
    } catch (err) {
      console.warn("[PasswordReset] Error storing reset token in db:", err);
    }
  }

  inMemory.passwordResets.set(id, {
    id,
    email,
    token,
    expiresAt,
    used: false,
    createdAt: new Date(),
  });
  inMemory.save?.();
  return token;
}

// Password Reset Request (Forgot Password - sends Brevo email)
router.post("/auth/password-reset", async (req: Request, res: Response): Promise<void> => {
  const { email } = req.body || {};
  if (!email || typeof email !== "string") {
    res.status(400).json({ error: "Email address is required." });
    return;
  }

  const normalizedEmail = email.trim().toLowerCase();
  const user = await getUserByEmail(normalizedEmail);
  if (user) {
    const token = await createResetToken(normalizedEmail);
    const origin = getBaseOrigin(req);
    const resetUrl = `${origin}/reset-password?token=${token}`;

    console.info(`[PasswordReset] Reset link generated for ${normalizedEmail}: ${resetUrl}`);
    // Send email via Brevo
    void sendPasswordResetEmail({
      email: normalizedEmail,
      resetUrl,
      isChangePassword: false,
    });
  }

  // Consistent response regardless of user existence for security
  res.status(200).json({
    message: "If an account exists with this email, recovery instructions have been sent.",
  });
});

// Change Password Request (Sends reset link via Brevo to logged-in user - Admin or User)
router.post("/auth/change-password-request", async (req: AuthRequest, res: Response): Promise<void> => {
  const authUser = await authenticateToken(req);
  if (!authUser) {
    res.status(401).json({ error: "Authentication required to change password." });
    return;
  }

  const user = await getUserByEmail(authUser.email);
  if (!user) {
    res.status(404).json({ error: "User account not found." });
    return;
  }

  const token = await createResetToken(authUser.email);
  const origin = getBaseOrigin(req);
  const resetUrl = `${origin}/reset-password?token=${token}`;

  console.info(`[ChangePassword] Reset link requested for ${authUser.email}: ${resetUrl}`);
  // Dispatch via Brevo
  await sendPasswordResetEmail({
    email: authUser.email,
    resetUrl,
    isChangePassword: true,
  });

  res.status(200).json({
    message: `A password reset link has been sent to ${authUser.email} via Brevo.`,
  });
});

// Direct Change Password (For logged-in users with current password)
router.post("/auth/change-password", async (req: AuthRequest, res: Response): Promise<void> => {
  const authUser = await authenticateToken(req);
  if (!authUser) {
    res.status(401).json({ error: "Authentication required to change password." });
    return;
  }

  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword || typeof currentPassword !== "string" || typeof newPassword !== "string") {
    res.status(400).json({ error: "Current password and new password are required." });
    return;
  }

  if (newPassword.length < 8) {
    res.status(400).json({ error: "New password must be at least 8 characters." });
    return;
  }

  const user = await getUserByEmail(authUser.email);
  if (!user) {
    res.status(404).json({ error: "User not found." });
    return;
  }

  const match = await comparePassword(currentPassword, user.password_hash);
  if (!match) {
    res.status(400).json({ error: "Incorrect current password." });
    return;
  }

  const newHash = await hashPassword(newPassword);
  const now = new Date();

  if (pool && db) {
    try {
      await db
        .update(profiles)
        .set({ passwordHash: newHash, updatedAt: now })
        .where(sql`LOWER(${profiles.email}) = ${authUser.email.toLowerCase()}`);
    } catch (err) {
      console.error("[ChangePassword] Database error updating password:", err);
    }
  }

  for (const u of inMemory.profiles.values()) {
    if (u.email.toLowerCase() === authUser.email.toLowerCase()) {
      u.passwordHash = newHash;
      u.updatedAt = now;
    }
  }
  inMemory.save?.();

  res.status(200).json({ message: "Password updated successfully." });
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
  inMemory.save?.();

  res.status(200).json({ message: "Your password has been successfully updated." });
});

export default router;
