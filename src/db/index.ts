import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { hashPassword } from "@/lib/auth";
import { users } from "@/db/schema";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);

async function ensureDefaultAdmin() {
  const email = process.env.DEFAULT_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.DEFAULT_ADMIN_PASSWORD;

  if (!email || !password) {
    return;
  }

  try {
    const [existingAdmin] = await db
      .select({ id: users.id, email: users.email, role: users.role })
      .from(users)
      .where(eq(users.role, "admin"))
      .limit(1);

    if (existingAdmin) {
      if (existingAdmin.email === email) {
        await db
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

    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    const passwordHash = await hashPassword(password);

    if (existingUser) {
      await db
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

    await db.insert(users).values({
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

void ensureDefaultAdmin();
