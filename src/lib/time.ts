// Shared clock-time helpers for job scheduling (start time / end time).

// "14:30" → "2:30 PM". Returns "" when no time set.
export function fmtTime(t: string | null | undefined): string {
  if (!t) return "";
  const [hStr, mStr] = t.split(":");
  const h = parseInt(hStr, 10);
  if (isNaN(h)) return t;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr || "00"} ${suffix}`;
}

// "14:30", "16:00" → "2:30 PM – 4:00 PM"; falls back to whichever time is set.
export function fmtTimeRange(
  start: string | null | undefined,
  end: string | null | undefined
): string {
  const startLabel = fmtTime(start);
  const endLabel = fmtTime(end);
  if (startLabel && endLabel) return `${startLabel} – ${endLabel}`;
  return startLabel || endLabel;
}

// Decimal hours between two "HH:MM" clock times (e.g. "09:00", "11:30" → 2.5).
// Returns null when either time is invalid or the end is not after the start.
export function hoursBetween(start: string, end: string): number | null {
  const parse = (value: string) => {
    const match = /^(\d{1,2}):(\d{2})/.exec(value);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
  };
  const startMinutes = parse(start);
  const endMinutes = parse(end);
  if (startMinutes === null || endMinutes === null) return null;
  const diff = endMinutes - startMinutes;
  if (diff <= 0) return null;
  return Math.round((diff / 60) * 100) / 100;
}
