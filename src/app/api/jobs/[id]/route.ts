import { NextRequest, NextResponse } from "next/server";
import { db, ensureCalendarColumns } from "@/db";
import { jobs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const jobId = parseInt(id);
  const body = await req.json();

  const {
    employeeName,
    totalHoursWorked,
    workCompleted,
    jobCompleted,
    jobPartiallyCompleted,
    additionalWorkRecommended,
    billSent,
    billPaid,
    additionalDetails,
    scheduledDate,
    scheduledTime,
  } = body;

  const [updated] = await db
    .update(jobs)
    .set({
      employeeName,
      totalHoursWorked: parseFloat(totalHoursWorked),
      workCompleted,
      jobCompleted: !!jobCompleted,
      jobPartiallyCompleted: !!jobPartiallyCompleted,
      additionalWorkRecommended: !!additionalWorkRecommended,
      billSent: !!billSent,
      billPaid: !!billPaid,
      additionalDetails: additionalDetails || null,
      // Only touch the schedule when the client sends the field (allows clearing with null/"")
      ...(body && Object.prototype.hasOwnProperty.call(body, "scheduledDate")
        ? { scheduledDate: scheduledDate || null }
        : {}),
      ...(body && Object.prototype.hasOwnProperty.call(body, "scheduledTime")
        ? { scheduledTime: scheduledTime || null }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, jobId))
    .returning();

  return NextResponse.json({ job: updated });
}

// PATCH — lightweight partial updates used by the calendar:
//   { action: "complete" }            → mark job done (one-click complete)
//   { action: "reopen" }              → undo completion
//   { scheduledDate: "YYYY-MM-DD" }   → schedule / reschedule (drag & drop)
//   { scheduledDate: null }           → move back to unscheduled
//   { scheduledTime: "HH:MM" | null } → set / clear time of day
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureCalendarColumns();

  const { id } = await params;
  const jobId = parseInt(id);
  if (isNaN(jobId)) {
    return NextResponse.json({ error: "Invalid job id." }, { status: 400 });
  }

  const body = await req.json();
  const patch: Partial<typeof jobs.$inferInsert> = {};

  if (body.action === "complete") {
    patch.jobCompleted = true;
    patch.jobPartiallyCompleted = false;
    patch.additionalWorkRecommended = false;
  } else if (body.action === "reopen") {
    patch.jobCompleted = false;
    patch.jobPartiallyCompleted = false;
    patch.additionalWorkRecommended = false;
  } else if (body.action !== undefined) {
    return NextResponse.json({ error: "Invalid action." }, { status: 400 });
  }

  if (Object.prototype.hasOwnProperty.call(body, "scheduledDate")) {
    const v = body.scheduledDate;
    if (v !== null && v !== "" && !DATE_RE.test(v)) {
      return NextResponse.json({ error: "Invalid scheduled date." }, { status: 400 });
    }
    patch.scheduledDate = v || null;
  }

  if (Object.prototype.hasOwnProperty.call(body, "scheduledTime")) {
    const v = body.scheduledTime;
    if (v !== null && v !== "" && !TIME_RE.test(v)) {
      return NextResponse.json({ error: "Invalid scheduled time." }, { status: 400 });
    }
    patch.scheduledTime = v || null;
  }

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  try {
    const [updated] = await db
      .update(jobs)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(jobs.id, jobId))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: "Job not found." }, { status: 404 });
    }
    return NextResponse.json({ job: updated });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to update job." }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const jobId = parseInt(id);

  await db.delete(jobs).where(eq(jobs.id, jobId));

  return NextResponse.json({ message: "Job deleted." });
}
