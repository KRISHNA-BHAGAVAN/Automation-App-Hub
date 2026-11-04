import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { db, pool, inMemory, profiles, type Profile } from "@workspace/db";

const JWT_SECRET = process.env.JWT_SECRET || "automation-hub-secret-key-change-in-production-2026";
const COOKIE_NAME = "hub_token";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: "admin" | "user";
  is_blocked: boolean;
  access_approved: boolean;
  email_verified: boolean;
  created_at: string;
}

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export function comparePassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export function signToken(user: { id: string; email: string; role: string }): string {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    JWT_SECRET,
    { expiresIn: "7d" },
  );
}

export function setAuthCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: "/",
  });
}

export function clearAuthCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
}

export function extractToken(req: Request): string | null {
  // Check cookie first
  if (req.cookies && req.cookies[COOKIE_NAME]) {
    return req.cookies[COOKIE_NAME];
  }
  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  return null;
}

export async function getUserById(id: string): Promise<AuthenticatedUser | null> {
  if (pool && db) {
    try {
      const rows = await db
        .select()
        .from(profiles)
        .where(eq(profiles.id, id))
        .limit(1);
      if (rows.length > 0) {
        const u = rows[0];
        return {
          id: u.id,
          email: u.email,
          role: u.role as "admin" | "user",
          is_blocked: u.isBlocked,
          access_approved: u.accessApproved,
          email_verified: u.emailVerified,
          created_at: u.createdAt.toISOString(),
        };
      }
      return null;
    } catch (err) {
      console.error("[Auth] Database error in getUserById:", err);
    }
  }

  // Fallback in-memory
  const u = inMemory.profiles.get(id);
  if (!u) return null;
  return {
    id: u.id,
    email: u.email,
    role: u.role as "admin" | "user",
    is_blocked: u.isBlocked,
    access_approved: u.accessApproved,
    email_verified: u.emailVerified,
    created_at: typeof u.createdAt === "string" ? u.createdAt : u.createdAt.toISOString(),
  };
}

export async function getUserByEmail(email: string): Promise<(Profile & { password_hash: string }) | null> {
  const normalized = email.trim().toLowerCase();
  if (pool && db) {
    try {
      const rows = await db
        .select()
        .from(profiles)
        .where(sql`LOWER(${profiles.email}) = ${normalized}`)
        .limit(1);
      if (rows.length > 0) {
        const u = rows[0];
        return {
          ...u,
          password_hash: u.passwordHash,
        };
      }
      return null;
    } catch (err) {
      console.error("[Auth] Database error in getUserByEmail:", err);
    }
  }

  // Fallback in-memory
  for (const u of inMemory.profiles.values()) {
    if (u.email.toLowerCase() === normalized) {
      return {
        ...u,
        password_hash: u.passwordHash,
      };
    }
  }
  return null;
}

export async function authenticateToken(req: Request): Promise<AuthenticatedUser | null> {
  const token = extractToken(req);
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: string };
    if (!decoded || !decoded.userId) return null;
    return await getUserById(decoded.userId);
  } catch {
    return null;
  }
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const user = await authenticateToken(req);
  if (!user) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  if (user.is_blocked) {
    res.status(403).json({ error: "Your account is blocked. Contact a workspace administrator." });
    return;
  }
  req.user = user;
  next();
}

export async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
  const user = await authenticateToken(req);
  if (!user) {
    res.status(401).json({ error: "Sign in with an admin account to continue." });
    return;
  }
  if (user.role !== "admin" || user.is_blocked) {
    res.status(403).json({ error: "Only workspace admins can perform this action." });
    return;
  }
  req.user = user;
  next();
}
