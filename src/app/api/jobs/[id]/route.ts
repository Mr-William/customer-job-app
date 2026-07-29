import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getSession } from "@/lib/auth";

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
      updatedAt: new Date(),
    })
    .where(eq(jobs.id, jobId))
    .returning();

  return NextResponse.json({ job: updated });
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
