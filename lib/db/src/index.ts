import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

export let pool: pg.Pool | null = null;
export let db: any = null;
export const isDbConnected = Boolean(process.env.DATABASE_URL);

if (process.env.DATABASE_URL) {
  try {
    const isLocal =
      process.env.DATABASE_URL.includes("localhost") ||
      process.env.DATABASE_URL.includes("127.0.0.1");

    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: isLocal ? false : { rejectUnauthorized: false },
      max: 10,
    });

    db = drizzle(pool, { schema });
    console.info("[Database] PostgreSQL connection initialized via DATABASE_URL.");
  } catch (err) {
    console.warn("[Database] Failed to initialize connection pool:", err);
  }
}

// In-memory store fallback when DATABASE_URL is not provided
const inMemory = {
  profiles: new Map<string, schema.Profile>(),
  categories: new Map<string, schema.Category>(),
  appCards: new Map<string, schema.AppCard>(),
  accessRequests: new Map<string, schema.AccessRequest>(),
  passwordResets: new Map<string, schema.PasswordReset>(),
};

/**
 * Initializes tables in PostgreSQL automatically if they do not exist.
 * This guarantees any PostgreSQL database URL works out of the box.
 */
export async function initializeDatabase(): Promise<void> {
  if (!pool) {
    console.info("[Database] Running with in-memory store (no DATABASE_URL provided).");
    return;
  }

  try {
    const client = await pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS profiles (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'user',
          is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
          access_approved BOOLEAN NOT NULL DEFAULT FALSE,
          email_verified BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        -- If existing table didn't have password_hash
        ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_hash TEXT;
        ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN NOT NULL DEFAULT FALSE;
        ALTER TABLE profiles ADD COLUMN IF NOT EXISTS access_approved BOOLEAN NOT NULL DEFAULT FALSE;
        ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT TRUE;

        CREATE TABLE IF NOT EXISTS categories (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS app_cards (
          id TEXT PRIMARY KEY,
          category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          link TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS access_requests (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          reviewed_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
          reviewed_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE TABLE IF NOT EXISTS password_resets (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          token TEXT NOT NULL UNIQUE,
          expires_at TIMESTAMPTZ NOT NULL,
          used BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      console.info("[Database] Tables verified and ready in PostgreSQL.");
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("[Database] Error ensuring database tables exist:", error);
  }
}

export { inMemory };
export * from "./schema";
