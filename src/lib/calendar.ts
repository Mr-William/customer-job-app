import { getDisplayName } from "@/lib/customerName";

// Clock-time helpers live in lib/time.ts; re-exported here for existing imports.
export { fmtTime, fmtTimeRange, hoursBetween } from "@/lib/time";

export interface CalendarCustomer {
  id: number;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  jobAddress: string;
}

export interface CalendarJob {
  id: number;
  customerId: number;
  employeeName: string;
  totalHoursWorked: number;
  workCompleted: string;
  jobCompleted: boolean;
  jobPartiallyCompleted: boolean;
  additionalWorkRecommended: boolean;
  billSent: boolean;
  billPaid: boolean;
  additionalDetails: string | null;
  scheduledDate: string | null;
  scheduledTime: string | null;
  scheduledEndTime: string | null;
  createdAt: string;
  customer: CalendarCustomer;
}

export const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

// ─── Date helpers (local-time, no timezone shifting) ─────────────────────────
export function toKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatLong(key: string): string {
  return parseKey(key).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function formatShort(key: string): string {
  return parseKey(key).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

// Sort jobs within a single day: timed first (chronologically), then untimed;
// pending before completed; then customer name.
export function sortJobsDay(a: CalendarJob, b: CalendarJob): number {
  const ta = a.scheduledTime || "99:99";
  const tb = b.scheduledTime || "99:99";
  if (ta !== tb) return ta < tb ? -1 : 1;
  const rank = (j: CalendarJob) => (j.jobCompleted ? 1 : 0);
  return (
    rank(a) - rank(b) ||
    getDisplayName(a.customer).localeCompare(getDisplayName(b.customer))
  );
}
