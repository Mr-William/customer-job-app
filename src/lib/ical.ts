export interface ICalendarJob {
  id: number;
  customerName: string;
  employeeName: string;
  workCompleted: string;
  additionalDetails?: string | null;
  jobAddress?: string | null;
  scheduledDate: string | Date | null;
  scheduledTime?: string | null;
  jobCompleted?: boolean;
  jobPartiallyCompleted?: boolean;
  additionalWorkRecommended?: boolean;
  updatedAt?: Date | string | null;
}

const encoder = new TextEncoder();
const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_KEY_RE = /^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/;

/** Escape text values per RFC 5545, including newlines to prevent line injection. */
export function escapeIcsText(value: string | null | undefined): string {
  return (value || "")
    .replace(/\\/g, "\\\\")
    .replace(/\r\n|\r|\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

/** Fold a content line at 75 UTF-8 octets without splitting a Unicode character. */
export function foldIcsLine(line: string): string {
  const physicalLines: string[] = [];
  let current = "";
  let octets = 0;

  for (const character of line) {
    const characterOctets = encoder.encode(character).length;
    if (current && octets + characterOctets > 75) {
      physicalLines.push(current);
      // RFC 5545 continuation lines start with one whitespace character.
      current = ` ${character}`;
      octets = 1 + characterOctets;
    } else {
      current += character;
      octets += characterOctets;
    }
  }

  physicalLines.push(current);
  return physicalLines.join("\r\n");
}

function dayKey(value: string | Date | null): string | null {
  if (!value) return null;

  let key: string;
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null;
    // PostgreSQL DATE values are represented as midnight UTC by the pg driver.
    key = [
      String(value.getUTCFullYear()).padStart(4, "0"),
      String(value.getUTCMonth() + 1).padStart(2, "0"),
      String(value.getUTCDate()).padStart(2, "0"),
    ].join("-");
  } else {
    key = value.slice(0, 10);
  }

  if (!DATE_KEY_RE.test(key)) return null;
  const parsed = new Date(`${key}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === key
    ? key
    : null;
}

function timeKey(value: string | null | undefined): string | null {
  if (!value) return null;
  const candidate = value.slice(0, 8);
  return TIME_KEY_RE.test(candidate) ? candidate : null;
}

function compactDate(value: string): string {
  return value.replace(/-/g, "");
}

function compactUtcTimestamp(value: Date | string | null | undefined): string {
  const date = value instanceof Date ? value : value ? new Date(value) : null;
  const validDate = date && Number.isFinite(date.getTime()) ? date : new Date(0);
  return validDate.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function addOneHour(date: string, time: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute, second = 0] = time.split(":").map(Number);
  const end = new Date(Date.UTC(year, month - 1, day, hour, minute, second + 60 * 60));
  return [
    String(end.getUTCFullYear()).padStart(4, "0"),
    String(end.getUTCMonth() + 1).padStart(2, "0"),
    String(end.getUTCDate()).padStart(2, "0"),
    "T",
    String(end.getUTCHours()).padStart(2, "0"),
    String(end.getUTCMinutes()).padStart(2, "0"),
    String(end.getUTCSeconds()).padStart(2, "0"),
  ].join("");
}

function nextDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return [
    String(next.getUTCFullYear()).padStart(4, "0"),
    String(next.getUTCMonth() + 1).padStart(2, "0"),
    String(next.getUTCDate()).padStart(2, "0"),
  ].join("");
}

function jobStatus(job: ICalendarJob): string {
  if (job.jobCompleted) return "Completed";
  if (job.jobPartiallyCompleted) return "Partially complete";
  if (job.additionalWorkRecommended) return "Additional work recommended";
  return "Scheduled";
}

function eventLines(job: ICalendarJob): string[] | null {
  const date = dayKey(job.scheduledDate);
  if (!date) return null;

  const time = timeKey(job.scheduledTime);
  const stamp = compactUtcTimestamp(job.updatedAt);
  const summary = `${job.jobCompleted ? "✓ " : ""}${job.customerName} — ${job.workCompleted}`;
  const description = [
    `Work: ${job.workCompleted}`,
    `Employee: ${job.employeeName}`,
    `Status: ${jobStatus(job)}`,
    job.additionalDetails ? `Notes: ${job.additionalDetails}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const lines = [
    "BEGIN:VEVENT",
    `UID:job-${job.id}@digitalrevolution-job-tracker`,
    `DTSTAMP:${stamp}`,
    `LAST-MODIFIED:${stamp}`,
  ];

  if (time) {
    const hhmmss = time.replace(/:/g, "").padEnd(6, "0");
    lines.push(`DTSTART:${compactDate(date)}T${hhmmss}`);
    lines.push(`DTEND:${addOneHour(date, time)}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${compactDate(date)}`);
    lines.push(`DTEND;VALUE=DATE:${nextDate(date)}`);
  }

  lines.push(
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    ...(job.jobAddress ? [`LOCATION:${escapeIcsText(job.jobAddress)}`] : []),
    "CLASS:PRIVATE",
    "STATUS:CONFIRMED",
    "TRANSP:OPAQUE",
    "END:VEVENT"
  );

  return lines;
}

/** Build a read-only RFC 5545 calendar feed from scheduled jobs. */
export function buildCalendarIcs(
  jobs: ICalendarJob[],
  calendarName = "Job Tracker — Scheduled Jobs"
): string {
  const sortedJobs = [...jobs].sort((a, b) => {
    const dateA = dayKey(a.scheduledDate) || "";
    const dateB = dayKey(b.scheduledDate) || "";
    const timeA = timeKey(a.scheduledTime) || "";
    const timeB = timeKey(b.scheduledTime) || "";
    return dateA.localeCompare(dateB) || timeA.localeCompare(timeB) || a.id - b.id;
  });

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Digital Revolution Job Tracker//Calendar Sync//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    "X-WR-CALDESC:Scheduled jobs from Digital Revolution Job Tracker",
    "X-PUBLISHED-TTL:PT1H",
  ];

  for (const job of sortedJobs) {
    const event = eventLines(job);
    if (event) lines.push(...event);
  }

  lines.push("END:VCALENDAR");
  return `${lines.map(foldIcsLine).join("\r\n")}\r\n`;
}
