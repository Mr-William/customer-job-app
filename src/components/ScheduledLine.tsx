"use client";
import { DATE_RE, formatShort } from "@/lib/calendar";
import { fmtTimeRange } from "@/lib/time";

interface ScheduledLineProps {
  date?: string | null;
  start?: string | null;
  end?: string | null;
}

// Compact "📅 Wed, Oct 14 · 🕐 9:00 AM – 11:00 AM" line for a job card.
// Renders nothing when the job has no schedule at all.
export default function ScheduledLine({ date, start, end }: ScheduledLineProps) {
  const timeLabel = fmtTimeRange(start, end);
  if (!date && !timeLabel) return null;

  const dateLabel = date ? (DATE_RE.test(date.slice(0, 10)) ? formatShort(date.slice(0, 10)) : date) : "";

  return (
    <p className="text-xs mb-1" style={{ color: "var(--text-muted)" }}>
      {dateLabel && <>📅 {dateLabel}</>}
      {dateLabel && timeLabel ? " · " : ""}
      {timeLabel && <>🕐 {timeLabel}</>}
    </p>
  );
}
