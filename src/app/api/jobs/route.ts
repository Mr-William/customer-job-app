import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { jobs } from "@/db/schema";
import { getSession } from "@/lib/auth";

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
    } = body;

    if (!customerId || !employeeName || totalHoursWorked === undefined || !workCompleted) {
      return NextResponse.json({ error: "Required fields missing." }, { status: 400 });
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
      })
      .returning();

    return NextResponse.json({ job });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to create job." }, { status: 500 });
  }
}
