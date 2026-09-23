import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { getSession } from "@/lib/auth";

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const {
      customerId,
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

    if (!customerId || !employeeName || totalHoursWorked === undefined || !workCompleted) {
      return NextResponse.json({ error: "Required fields missing." }, { status: 400 });
    }
    if (scheduledDate && !DATE_RE.test(scheduledDate)) {
      return NextResponse.json({ error: "Invalid scheduled date." }, { status: 400 });
    }
    if (scheduledTime && !TIME_RE.test(scheduledTime)) {
      return NextResponse.json({ error: "Invalid scheduled time." }, { status: 400 });
    }

    const [job] = await db
      .insert(jobs)
      .values({
        customerId,
        employeeName,
        totalHoursWorked: parseFloat(totalHoursWorked),
        workCompleted,
        jobCompleted: !!jobCompleted,
        jobPartiallyCompleted: !!jobPartiallyCompleted,
        additionalWorkRecommended: !!additionalWorkRecommended,
        billSent: !!billSent,
        billPaid: !!billPaid,
        additionalDetails: additionalDetails || null,
        scheduledDate: scheduledDate || null,
        scheduledTime: scheduledTime || null,
      })
      .returning();

    return NextResponse.json({ job });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to create job." }, { status: 500 });
  }
}
