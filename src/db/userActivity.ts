import { and, desc, eq, isNull, lt, or } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { users } from "./schema.ts";

// Debounce passive session activity updates so concurrent page-load requests
// only trigger a single lightweight row update per user per interval.
export const ACTIVITY_UPDATE_INTERVAL_MS = 60 * 1000;

const lastTouchedByUser = new Map<number, number>();

export function clearUserActivityCache() {
  lastTouchedByUser.clear();
}

export async function recordUserActivity(
  database: NodePgDatabase,
  userId: number,
  options?: {
    force?: boolean;
    now?: Date;
    cache?: Map<number, number>;
  }
): Promise<boolean> {
  const now = options?.now ?? new Date();
  const nowMs = now.getTime();
  const cache = options?.cache ?? lastTouchedByUser;
  const force = options?.force ?? false;

  const previous = cache.get(userId);
  if (
    !force &&
    previous !== undefined &&
    nowMs - previous < ACTIVITY_UPDATE_INTERVAL_MS
  ) {
    return false;
  }

  cache.set(userId, nowMs);

  try {
    if (force) {
      await database
        .update(users)
        .set({ lastActiveAt: now })
        .where(eq(users.id, userId));
    } else {
      const cutoff = new Date(nowMs - ACTIVITY_UPDATE_INTERVAL_MS);
      await database
        .update(users)
        .set({ lastActiveAt: now })
        .where(
          and(
            eq(users.id, userId),
            eq(users.approved, true),
            or(isNull(users.lastActiveAt), lt(users.lastActiveAt, cutoff))
          )
        );
    }
    return true;
  } catch (error) {
    if (previous === undefined) {
      cache.delete(userId);
    } else {
      cache.set(userId, previous);
    }
    throw error;
  }
}

export async function listUserAccounts(database: NodePgDatabase) {
  return database
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      role: users.role,
      approved: users.approved,
      createdAt: users.createdAt,
      lastActiveAt: users.lastActiveAt,
    })
    .from(users)
    .orderBy(desc(users.createdAt));
}
