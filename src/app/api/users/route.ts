import { NextResponse } from "next/server";
import { db, ensureLastActiveColumn } from "@/db";
import { listUserAccounts } from "@/db/userActivity";
import { getSession } from "@/lib/auth";

// GET /api/users — admin only: list all user accounts (no password hashes)
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await ensureLastActiveColumn();
  const list = await listUserAccounts(db);

  return NextResponse.json({ users: list });
}
