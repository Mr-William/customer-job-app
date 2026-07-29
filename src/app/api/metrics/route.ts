import { NextResponse } from "next/server";
import { db } from "@/db";
import { customers, jobs } from "@/db/schema";
import { getSession } from "@/lib/auth";
import { count, eq, and } from "drizzle-orm";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [{ totalCustomers }] = await db
    .select({ totalCustomers: count() })
    .from(customers);

  const [{ totalJobs }] = await db
    .select({ totalJobs: count() })
    .from(jobs);

  const [{ completedJobs }] = await db
    .select({ completedJobs: count() })
    .from(jobs)
    .where(eq(jobs.jobCompleted, true));

  const [{ partialJobs }] = await db
    .select({ partialJobs: count() })
    .from(jobs)
    .where(eq(jobs.jobPartiallyCompleted, true));

  const [{ additionalJobs }] = await db
    .select({ additionalJobs: count() })
    .from(jobs)
    .where(eq(jobs.additionalWorkRecommended, true));

  const [{ billsSent }] = await db
    .select({ billsSent: count() })
    .from(jobs)
    .where(eq(jobs.billSent, true));

  const [{ billsPaid }] = await db
    .select({ billsPaid: count() })
    .from(jobs)
    .where(eq(jobs.billPaid, true));

  // Outstanding = bill sent but not paid
  const [{ outstandingBills }] = await db
    .select({ outstandingBills: count() })
    .from(jobs)
    .where(and(eq(jobs.billSent, true), eq(jobs.billPaid, false)));

  return NextResponse.json({
    totalCustomers,
    totalJobs,
    completedJobs,
    partialJobs,
    additionalJobs,
    billsSent,
    billsPaid,
    outstandingBills,
  });
}
