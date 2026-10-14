import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { db, ensureCalendarColumns, ensureCalendarFeedTokenColumn } from "@/db";
import { customers, jobs, users } from "@/db/schema";
import { getDisplayName } from "@/lib/customerName";
import { buildCalendarIcs } from "@/lib/ical";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

function feedHeaders(etag?: string, download = false): Headers {
  const headers = new Headers({
    "Content-Type": "text/calendar; charset=utf-8",
    "Content-Disposition": download
      ? 'attachment; filename="job-calendar.ics"'
      : 'inline; filename="job-calendar.ics"',
    "Cache-Control": "private, no-cache, max-age=0, must-revalidate",
    "X-Content-Type-Options": "nosniff",
    "X-Robots-Tag": "noindex, nofollow",
    "Referrer-Policy": "no-referrer",
  });
  if (etag) headers.set("ETag", etag);
  return headers;
}

function notFound() {
  return new NextResponse("Calendar feed not found.", {
    status: 404,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

// GET /api/calendar/feed/:token — public, read-only iCalendar subscription.
// The random token is a revocable bearer secret because calendar providers
// cannot sign in to the Job Tracker when they periodically refresh a feed.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!TOKEN_RE.test(token)) return notFound();

  await ensureCalendarColumns();
  await ensureCalendarFeedTokenColumn();

  try {
    const [owner] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.calendarFeedToken, token), eq(users.approved, true)))
      .limit(1);
    if (!owner) return notFound();

    const rows = await db
      .select({ job: jobs, customer: customers })
      .from(jobs)
      .innerJoin(customers, eq(jobs.customerId, customers.id))
      .where(isNotNull(jobs.scheduledDate))
      .orderBy(asc(jobs.scheduledDate), asc(jobs.scheduledTime), asc(jobs.id));

    const calendarJobs = rows.map(({ job, customer }) => ({
      id: job.id,
      customerName: getDisplayName(customer),
      employeeName: job.employeeName,
      workCompleted: job.workCompleted,
      additionalDetails: job.additionalDetails,
      jobAddress: customer.jobAddress,
      scheduledDate: job.scheduledDate,
      scheduledTime: job.scheduledTime,
      jobCompleted: job.jobCompleted,
      jobPartiallyCompleted: job.jobPartiallyCompleted,
      additionalWorkRecommended: job.additionalWorkRecommended,
      // Customer renames/address edits also change the event sent to subscribers.
      updatedAt:
        job.updatedAt.getTime() >= customer.updatedAt.getTime()
          ? job.updatedAt
          : customer.updatedAt,
    }));

    const content = buildCalendarIcs(calendarJobs);
    const etag = `"${createHash("sha256").update(content).digest("hex")}"`;
    const download = new URL(req.url).searchParams.get("download") === "1";
    const headers = feedHeaders(etag, download);
    const requestEtags = (req.headers.get("if-none-match") || "")
      .split(",")
      .map((value) => value.trim());

    if (requestEtags.includes("*") || requestEtags.includes(etag)) {
      return new NextResponse(null, { status: 304, headers });
    }

    return new NextResponse(content, { status: 200, headers });
  } catch (error) {
    console.error("Calendar feed error:", error);
    return new NextResponse("Calendar feed is temporarily unavailable.", {
      status: 500,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Referrer-Policy": "no-referrer",
      },
    });
  }
}
