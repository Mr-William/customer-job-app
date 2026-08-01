import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import {
  sendAccountApprovedEmail,
  sendAccountDeniedEmail,
} from "@/lib/email";

// PATCH /api/users/:id — admin only: approve a pending account
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const userId = parseInt(id, 10);
  if (Number.isNaN(userId)) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  const body = await req.json().catch(() => ({}));
  if (body?.approved !== true) {
    return NextResponse.json(
      { error: "Only { approved: true } is supported. Use DELETE to deny." },
      { status: 400 }
    );
  }

  const [target] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }
  if (target.approved) {
    return NextResponse.json(
      { error: "This account is already approved." },
      { status: 400 }
    );
  }

  // Clearing the token invalidates any outstanding email approve/deny link
  await db
    .update(users)
    .set({ approved: true, approvalToken: null })
    .where(eq(users.id, userId));

  try {
    await sendAccountApprovedEmail({
      email: target.email,
      name: `${target.firstName} ${target.lastName}`,
    });
  } catch (e) {
    console.error("Failed to send approval notification:", e);
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/users/:id — admin only: remove a user account
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (session.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const userId = parseInt(id, 10);
  if (Number.isNaN(userId)) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  // Guard: an admin cannot delete their own account
  if (userId === session.userId) {
    return NextResponse.json(
      { error: "You cannot delete your own account." },
      { status: 400 }
    );
  }

  const [target] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!target) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  // Guard: never leave the app without an admin
  if (target.role === "admin") {
    const admins = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, "admin"));
    if (admins.length <= 1) {
      return NextResponse.json(
        { error: "Cannot delete the last remaining admin account." },
        { status: 400 }
      );
    }
  }

  await db.delete(users).where(eq(users.id, userId));

  // Pending accounts are being *denied* — let them know, same as the email flow.
  if (!target.approved) {
    try {
      await sendAccountDeniedEmail({
        email: target.email,
        name: `${target.firstName} ${target.lastName}`,
      });
    } catch (e) {
      console.error("Failed to send denial notification:", e);
    }
  }

  return NextResponse.json({ success: true });
}
