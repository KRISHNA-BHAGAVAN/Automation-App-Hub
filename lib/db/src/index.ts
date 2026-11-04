import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import bcrypt from "bcryptjs";
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

// Persistent file storage fallback when DATABASE_URL is not provided
const DATA_DIR = path.resolve(process.cwd(), ".data");
const STORE_FILE = path.join(DATA_DIR, "local-db.json");

interface DataStore {
  profiles: Record<string, schema.Profile>;
  categories: Record<string, schema.Category>;
  appCards: Record<string, schema.AppCard>;
  accessRequests: Record<string, schema.AccessRequest>;
  passwordResets: Record<string, schema.PasswordReset>;
}

function loadStore(): DataStore {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const content = fs.readFileSync(STORE_FILE, "utf-8");
      return JSON.parse(content);
    }
  } catch (e) {
    console.warn("[Database] Failed to read local store file:", e);
  }
  return {
    profiles: {},
    categories: {},
    appCards: {},
    accessRequests: {},
    passwordResets: {},
  };
}

function saveStore(data: DataStore): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (e) {
    console.warn("[Database] Failed to write local store file:", e);
  }
}

const initialStore = loadStore();

// In-memory maps wrapped to sync with local disk file
export const inMemory = {
  profiles: new Map<string, schema.Profile>(Object.entries(initialStore.profiles)),
  categories: new Map<string, schema.Category>(Object.entries(initialStore.categories)),
  appCards: new Map<string, schema.AppCard>(Object.entries(initialStore.appCards)),
  accessRequests: new Map<string, schema.AccessRequest>(Object.entries(initialStore.accessRequests)),
  passwordResets: new Map<string, schema.PasswordReset>(Object.entries(initialStore.passwordResets)),
  save() {
    saveStore({
      profiles: Object.fromEntries(this.profiles.entries()),
      categories: Object.fromEntries(this.categories.entries()),
      appCards: Object.fromEntries(this.appCards.entries()),
      accessRequests: Object.fromEntries(this.accessRequests.entries()),
      passwordResets: Object.fromEntries(this.passwordResets.entries()),
    });
  },
};

const SEED_USER = {
  email: "krishnabhagavan910@gmail.com",
  password: "Aq1sw2de3fr4gt*",
  role: "admin",
  isBlocked: false,
  accessApproved: true,
  emailVerified: true,
};

const DEFAULT_CATEGORIES = [
  { id: "cat-dev-cicd", name: "Development & CI/CD" },
  { id: "cat-monitoring", name: "Monitoring & Observability" },
  { id: "cat-workflows", name: "Team Workflows & Automation" },
];

const DEFAULT_CARDS = [
  {
    id: "card-github-actions",
    categoryId: "cat-dev-cicd",
    name: "GitHub Actions",
    link: "https://github.com",
  },
  {
    id: "card-argo-cd",
    categoryId: "cat-dev-cicd",
    name: "ArgoCD Deployments",
    link: "https://argoproj.github.io/cd/",
  },
  {
    id: "card-grafana",
    categoryId: "cat-monitoring",
    name: "Grafana Dashboards",
    link: "https://grafana.com",
  },
  {
    id: "card-pagerduty",
    categoryId: "cat-monitoring",
    name: "PagerDuty Incident Response",
    link: "https://pagerduty.com",
  },
  {
    id: "card-n8n",
    categoryId: "cat-workflows",
    name: "n8n Workflow Automation",
    link: "https://n8n.io",
  },
  {
    id: "card-metabase",
    categoryId: "cat-workflows",
    name: "Metabase Business Intelligence",
    link: "https://metabase.com",
  },
];

/**
 * Initializes database tables (if PostgreSQL is connected) and seeds the requested user.
 */
export async function initializeDatabase(): Promise<void> {
  const seedPasswordHash = bcrypt.hashSync(SEED_USER.password, 10);
  const now = new Date();

  // Seed local fallback store
  let userExistsInMemory = false;
  for (const u of inMemory.profiles.values()) {
    if (u.email.toLowerCase() === SEED_USER.email.toLowerCase()) {
      u.passwordHash = seedPasswordHash;
      u.role = "admin";
      u.accessApproved = true;
      u.emailVerified = true;
      u.isBlocked = false;
      userExistsInMemory = true;
      break;
    }
  }

  if (!userExistsInMemory) {
    const id = "user-krishna-admin";
    inMemory.profiles.set(id, {
      id,
      email: SEED_USER.email,
      passwordHash: seedPasswordHash,
      role: "admin",
      isBlocked: false,
      accessApproved: true,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Seed default categories and cards if empty
  if (inMemory.categories.size === 0) {
    for (const cat of DEFAULT_CATEGORIES) {
      inMemory.categories.set(cat.id, {
        id: cat.id,
        name: cat.name,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  if (inMemory.appCards.size === 0) {
    for (const card of DEFAULT_CARDS) {
      inMemory.appCards.set(card.id, {
        id: card.id,
        categoryId: card.categoryId,
        name: card.name,
        link: card.link,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  inMemory.save();
  console.info(`[Database] Seeded user "${SEED_USER.email}" in local store.`);

  // If PostgreSQL is configured, initialize tables and seed PostgreSQL
  if (!pool) {
    console.info("[Database] Running with persistent local store (no DATABASE_URL provided).");
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

      // Seed krishnabhagavan910@gmail.com into PostgreSQL
      await client.query(
        `
        INSERT INTO profiles (id, email, password_hash, role, is_blocked, access_approved, email_verified)
        VALUES ($1, $2, $3, 'admin', false, true, true)
        ON CONFLICT (email) DO UPDATE SET
          password_hash = EXCLUDED.password_hash,
          role = 'admin',
          access_approved = true,
          email_verified = true,
          is_blocked = false;
        `,
        ["user-krishna-admin", SEED_USER.email, seedPasswordHash],
      );

      // Seed categories in PostgreSQL if empty
      const catCountRes = await client.query("SELECT COUNT(*) FROM categories");
      if (parseInt(catCountRes.rows[0].count, 10) === 0) {
        for (const cat of DEFAULT_CATEGORIES) {
          await client.query(
            "INSERT INTO categories (id, name) VALUES ($1, $2) ON CONFLICT DO NOTHING",
            [cat.id, cat.name],
          );
        }
        for (const card of DEFAULT_CARDS) {
          await client.query(
            "INSERT INTO app_cards (id, category_id, name, link) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
            [card.id, card.categoryId, card.name, card.link],
          );
        }
      }

      console.info(`[Database] Seeded user "${SEED_USER.email}" into PostgreSQL.`);
    } finally {
      client.release();
    }
  } catch (error) {
    console.error("[Database] Error ensuring database tables and seed in PostgreSQL:", error);
  }
}

export * from "./schema";
