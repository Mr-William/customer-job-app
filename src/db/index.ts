import { drizzle, NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { hashPassword } from "@/lib/auth";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

// ─── Lazy database initialization ────────────────────────────────────────────
// The connection is only created when a query actually runs, NOT at import time.
// This prevents build-time failures when DATABASE_URL isn't available.

const globalForDb = globalThis as typeof globalThis & {
  __drizzleDb?: NodePgDatabase;
};

function getDb(): NodePgDatabase {
  if (!globalForDb.__drizzleDb) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("DATABASE_URL is required. Set it in your .env file.");
    }
    const pool = new Pool({ connectionString: databaseUrl });
    globalForDb.__drizzleDb = drizzle(pool);
  }
  return globalForDb.__drizzleDb;
}

// Proxy so that `db.select()...` works without an explicit getDb() call
export const db: NodePgDatabase = new Proxy({} as NodePgDatabase, {
  get(_, prop) {
    return (getDb() as any)[prop];
  },
});

// ─── Default admin bootstrap ─────────────────────────────────────────────────
// Exported for instrumentation.ts — runs at server startup only (not during build)

export async function ensureDefaultAdmin() {
  const email = process.env.DEFAULT_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.DEFAULT_ADMIN_PASSWORD;

  if (!email || !password) {
    return;
  }

  try {
    const [existingAdmin] = await getDb()
      .select({ id: users.id, email: users.email, role: users.role })
      .from(users)
      .where(eq(users.role, "admin"))
      .limit(1);

    if (existingAdmin) {
      if (existingAdmin.email === email) {
        await getDb()
          .update(users)
          .set({
            firstName: process.env.DEFAULT_ADMIN_FIRST_NAME?.trim() || "Admin",
            lastName: process.env.DEFAULT_ADMIN_LAST_NAME?.trim() || "User",
            passwordHash: await hashPassword(password),
            approved: true,
            approvalToken: null,
            role: "admin",
          })
          .where(eq(users.id, existingAdmin.id));
      }
      return;
    }

    const [existingUser] = await getDb()
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    const passwordHash = await hashPassword(password);

    if (existingUser) {
      await getDb()
        .update(users)
        .set({
          role: "admin",
          approved: true,
          approvalToken: null,
          passwordHash,
        })
        .where(eq(users.id, existingUser.id));
      return;
    }

    await getDb().insert(users).values({
      firstName: process.env.DEFAULT_ADMIN_FIRST_NAME?.trim() || "Admin",
      lastName: process.env.DEFAULT_ADMIN_LAST_NAME?.trim() || "User",
      email,
      passwordHash,
      approved: true,
      role: "admin",
      approvalToken: null,
    });
  } catch (error) {
    console.error("Failed to create default admin account:", error);
  }
}
