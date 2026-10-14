import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { and, eq, isNull } from "drizzle-orm";
import { db, ensureCalendarFeedTokenColumn } from "@/db";
import { users } from "@/db/schema";
import { getSession } from "@/lib/auth";

export const runtime = "nodejs";

function jsonNoStore(body: object, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

function createFeedToken(): string {
  return randomBytes(32).toString("base64url");
}

async function getOrCreateFeedToken(userId: number): Promise<string | null> {
  const [user] = await db
    .select({ id: users.id, calendarFeedToken: users.calendarFeedToken })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.approved, true)))
    .limit(1);

  if (!user) return null;
  if (user.calendarFeedToken) return user.calendarFeedToken;

  const candidate = createFeedToken();
  const [updated] = await db
    .update(users)
    .set({ calendarFeedToken: candidate })
    .where(
      and(
        eq(users.id, userId),
        eq(users.approved, true),
        isNull(users.calendarFeedToken)
      )
    )
    .returning({ calendarFeedToken: users.calendarFeedToken });

  if (updated?.calendarFeedToken) return updated.calendarFeedToken;

  // Another request may have created the link at the same time.
  const [latest] = await db
    .select({ calendarFeedToken: users.calendarFeedToken })
    .from(users)
    .where(and(eq(users.id, userId), eq(users.approved, true)))
    .limit(1);
  return latest?.calendarFeedToken || null;
}

function feedResponse(token: string) {
  return jsonNoStore({ feedPath: `/api/calendar/feed/${token}` });
}

// GET /api/calendar/sync — return this user's existing read-only feed URL,
// creating a random bearer token the first time calendar sync is opened.
export async function GET() {
  const session = await getSession();
  if (!session) return jsonNoStore({ error: "Unauthorized" }, 401);

  await ensureCalendarFeedTokenColumn();

  try {
    const token = await getOrCreateFeedToken(session.userId);
    if (!token) return jsonNoStore({ error: "Account not found or not approved." }, 403);
    return feedResponse(token);
  } catch (error) {
    console.error("Failed to load calendar subscription:", error);
    return jsonNoStore({ error: "Could not prepare calendar sync." }, 500);
  }
}

// POST /api/calendar/sync — revoke the old URL and issue a fresh one.
export async function POST() {
  const session = await getSession();
  if (!session) return jsonNoStore({ error: "Unauthorized" }, 401);

  await ensureCalendarFeedTokenColumn();

  try {
    const token = createFeedToken();
    const [updated] = await db
      .update(users)
      .set({ calendarFeedToken: token })
      .where(and(eq(users.id, session.userId), eq(users.approved, true)))
      .returning({ calendarFeedToken: users.calendarFeedToken });

    if (!updated) return jsonNoStore({ error: "Account not found or not approved." }, 403);
    return feedResponse(updated.calendarFeedToken || token);
  } catch (error) {
    console.error("Failed to reset calendar subscription:", error);
    return jsonNoStore({ error: "Could not reset calendar sync." }, 500);
  }
}
