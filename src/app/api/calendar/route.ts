import { NextRequest, NextResponse } from "next/server";
import { db, ensureCalendarColumns } from "@/db";
import { customers, jobs } from "@/db/schema";
import { eq, and, gte, lte, isNull, desc, count } from "drizzle-orm";
import { getSession } from "@/lib/auth";
import { getDisplayName } from "@/lib/customerName";

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

function currentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Normalize whatever the pg driver returns for a DATE column (string or Date)
// into a plain YYYY-MM-DD key. Uses local date components to avoid UTC-shift bugs.
function toDayKey(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  if (value instanceof Date) {
    return dayKey(value);
  }
  return String(value).slice(0, 10);
}

// Normalize a TIME column into "HH:MM".
function toTimeKey(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 5);
  return null;
}

// GET /api/calendar?month=YYYY-MM[&includeUnscheduled=1]
// GET /api/calendar?upcoming=7[&includeUnscheduled=1]
// Returns jobs scheduled in the range, each with its customer attached,
// plus a per-day count map. Optionally includes unscheduled jobs + count.
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Self-heal: make sure the schedule columns exist (no migrations folder in this project)
  await ensureCalendarColumns();

  const { searchParams } = new URL(req.url);
  const upcomingParam = searchParams.get("upcoming");
  const includeUnscheduled = searchParams.get("includeUnscheduled") === "1";

  let start: string;
  let end: string;
  let month = "";

  if (upcomingParam !== null) {
    const n = Math.min(Math.max(parseInt(upcomingParam) || 7, 1), 31);
    const today = new Date();
    const last = new Date(today.getFullYear(), today.getMonth(), today.getDate() + n - 1);
    start = dayKey(today);
    end = dayKey(last);
  } else {
    month = searchParams.get("month") || "";
    if (!MONTH_RE.test(month)) month = currentMonthKey();
    const [y, m] = month.split("-").map(Number);
    // Expand the range to cover exactly the cells the month grid renders:
    // leading days back to Sunday, trailing days forward to Saturday, with a
    // minimum 5-row (35-cell) grid like the frontend's buildCells().
    const firstDow = new Date(y, m - 1, 1).getDay();
    const lastDay = new Date(y, m, 0).getDate();
    let trailing = (7 - ((firstDow + lastDay) % 7)) % 7;
    if (firstDow + lastDay + trailing < 35) trailing += 35 - (firstDow + lastDay + trailing);
    start = dayKey(new Date(y, m - 1, 1 - firstDow));
    end = dayKey(new Date(y, m - 1, lastDay + trailing));
  }

  try {
    const rows = await db
      .select({ job: jobs, customer: customers })
      .from(jobs)
      .innerJoin(customers, eq(jobs.customerId, customers.id))
      .where(and(gte(jobs.scheduledDate, start), lte(jobs.scheduledDate, end)));

    const items = rows.map(({ job, customer }) => ({
      ...job,
      scheduledDate: toDayKey(job.scheduledDate),
      scheduledTime: toTimeKey(job.scheduledTime),
      customer,
    }));

    const counts: Record<string, number> = {};
    for (const item of items) {
      const key = item.scheduledDate;
      if (key) counts[key] = (counts[key] || 0) + 1;
    }

    let unscheduled: typeof items = [];
    let unscheduledCount = 0;
    if (includeUnscheduled) {
      const urows = await db
        .select({ job: jobs, customer: customers })
        .from(jobs)
        .innerJoin(customers, eq(jobs.customerId, customers.id))
        .where(isNull(jobs.scheduledDate))
        .orderBy(desc(jobs.createdAt))
        .limit(100);
      unscheduled = urows.map(({ job, customer }) => ({
        ...job,
        scheduledDate: toDayKey(job.scheduledDate),
        scheduledTime: toTimeKey(job.scheduledTime),
        customer,
      }));
      const [{ n }] = await db
        .select({ n: count() })
        .from(jobs)
        .where(isNull(jobs.scheduledDate));
      unscheduledCount = n;
    }

    return NextResponse.json({
      jobs: items,
      counts,
      month,
      start,
      end,
      unscheduled,
      unscheduledCount,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to load calendar." }, { status: 500 });
  }
}

// POST /api/calendar — schedule a new job from the calendar page.
// Body: { scheduledDate, scheduledTime?, customerName, phone?, jobAddress?, workDetails, employeeName? }
// Finds an existing customer by name (case-insensitive) or creates one.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await ensureCalendarColumns();

  try {
    const body = await req.json();
    const { scheduledDate, scheduledTime, customerName, phone, jobAddress, workDetails, employeeName } = body;

    if (!scheduledDate || !DATE_RE.test(scheduledDate)) {
      return NextResponse.json(
        { error: "A valid scheduled date (YYYY-MM-DD) is required." },
        { status: 400 }
      );
    }
    if (scheduledTime && !TIME_RE.test(scheduledTime)) {
      return NextResponse.json({ error: "Invalid scheduled time." }, { status: 400 });
    }
    const name = (customerName || "").trim();
    if (!name) {
      return NextResponse.json({ error: "Customer name is required." }, { status: 400 });
    }
    const work = (workDetails || "").trim();
    if (!work) {
      return NextResponse.json({ error: "Job information is required." }, { status: 400 });
    }

    // Find-or-create customer (case-insensitive match on display name)
    const all = await db.select().from(customers);
    const lower = name.toLowerCase();
    const matches = all.filter((c) => getDisplayName(c).toLowerCase() === lower);
    let customer = matches[0] || null;
    let isNewCustomer = false;

    const cleanPhone = (phone || "").trim();
    const digits = cleanPhone.replace(/\D/g, "");

    if (!customer) {
      const [created] = await db
        .insert(customers)
        .values({
          name,
          firstName: null,
          lastName: null,
          phone: cleanPhone || null,
          email: null,
          jobAddress: (jobAddress || "").trim() || "TBD — added from calendar",
        })
        .returning();
      customer = created;
      isNewCustomer = true;
    } else if (digits) {
      // If there are duplicate names, prefer the one with a matching phone number
      const phoneMatch = matches.find(
        (c) => (c.phone || "").replace(/\D/g, "") === digits
      );
      if (phoneMatch) {
        customer = phoneMatch;
      } else if (!customer.phone) {
        // Backfill a missing phone number on the matched customer
        const [updated] = await db
          .update(customers)
          .set({ phone: cleanPhone, updatedAt: new Date() })
          .where(eq(customers.id, customer.id))
          .returning();
        if (updated) customer = updated;
      }
    }

    const [job] = await db
      .insert(jobs)
      .values({
        customerId: customer.id,
        employeeName: (employeeName || "").trim() || "Unassigned",
        totalHoursWorked: 0,
        workCompleted: work,
        jobCompleted: false,
        jobPartiallyCompleted: false,
        additionalWorkRecommended: false,
        billSent: false,
        billPaid: false,
        additionalDetails: null,
        scheduledDate,
        scheduledTime: scheduledTime || null,
      })
      .returning();

    return NextResponse.json({
      job: {
        ...job,
        scheduledDate: toDayKey(job.scheduledDate),
        scheduledTime: toTimeKey(job.scheduledTime),
        customer,
      },
      customer,
      isNewCustomer,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "Failed to schedule job." }, { status: 500 });
  }
}
