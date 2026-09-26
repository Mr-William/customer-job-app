"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getDisplayName } from "@/lib/customerName";
import {
  CalendarJob,
  fmtTime,
  formatShort,
  parseKey,
  toKey,
} from "@/lib/calendar";

function dayKeys(n: number): string[] {
  const today = new Date();
  return Array.from({ length: n }, (_, i) =>
    toKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + i))
  );
}

export default function UpcomingStrip() {
  const [jobsByDate, setJobsByDate] = useState<Record<string, CalendarJob[]>>({});
  const [unscheduledCount, setUnscheduledCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch("/api/calendar?upcoming=7&includeUnscheduled=1")
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setFailed(true);
          return;
        }
        const grouped: Record<string, CalendarJob[]> = {};
        for (const job of data.jobs as CalendarJob[]) {
          const key = job.scheduledDate as string;
          if (!key) continue;
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(job);
        }
        for (const key of Object.keys(grouped)) {
          grouped[key].sort((a, b) => {
            const ta = a.scheduledTime || "99:99";
            const tb = b.scheduledTime || "99:99";
            if (ta !== tb) return ta < tb ? -1 : 1;
            return (a.jobCompleted ? 1 : 0) - (b.jobCompleted ? 1 : 0);
          });
        }
        setJobsByDate(grouped);
        setUnscheduledCount(data.unscheduledCount || 0);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, []);

  if (failed) return null;

  const keys = dayKeys(7);
  const todayKey = toKey(new Date());
  const total = keys.reduce((sum, k) => sum + (jobsByDate[k]?.length || 0), 0);

  return (
    <div className="dr-card mb-8">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <h2 className="text-lg font-semibold" style={{ color: "var(--text-secondary)" }}>
          📅 Upcoming 7 Days
        </h2>
        <div className="flex items-center gap-2">
          {unscheduledCount > 0 && (
            <Link
              href="/dashboard/calendar"
              className="text-xs px-2 py-1 rounded-full"
              style={{
                background: "rgba(245,158,11,0.1)",
                color: "var(--warning)",
                border: "1px solid rgba(245,158,11,0.25)",
                textDecoration: "none",
              }}
            >
              📥 {unscheduledCount} unscheduled
            </Link>
          )}
          <Link
            href="/dashboard/calendar"
            className="text-xs font-semibold"
            style={{ color: "var(--accent-orange)", textDecoration: "none" }}
          >
            Open calendar →
          </Link>
        </div>
      </div>

      {loading ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Loading schedule…
        </p>
      ) : total === 0 && unscheduledCount === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Nothing scheduled for the next 7 days.{" "}
          <Link href="/dashboard/calendar" style={{ color: "var(--accent-orange)" }}>
            Schedule work →
          </Link>
        </p>
      ) : (
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: "repeat(7, minmax(110px, 1fr))", overflowX: "auto" }}
        >
          {keys.map((key, i) => {
            const dayJobs = jobsByDate[key] || [];
            const isToday = key === todayKey;
            const d = parseKey(key);
            return (
              <Link
                key={key}
                href={`/dashboard/calendar?date=${key}`}
                style={{ textDecoration: "none" }}
              >
                <div
                  className="rounded-lg p-2 h-full"
                  style={{
                    background: isToday ? "rgba(249,115,22,0.08)" : "var(--bg-tertiary)",
                    border: isToday
                      ? "1px solid rgba(249,115,22,0.4)"
                      : "1px solid var(--border-color)",
                    minHeight: "110px",
                  }}
                >
                  <div
                    className="text-xs font-bold mb-1"
                    style={{ color: isToday ? "var(--accent-orange)" : "var(--text-primary)" }}
                  >
                    {i === 0 ? "Today" : d.toLocaleDateString("en-US", { weekday: "short" })}
                  </div>
                  <div className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
                    {formatShort(key).replace(/^\w+, /, "")}
                  </div>
                  {dayJobs.length === 0 ? (
                    <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                      —
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {dayJobs.slice(0, 3).map((job) => (
                        <div
                          key={job.id}
                          className="text-xs truncate"
                          style={{
                            color: job.jobCompleted
                              ? "var(--text-muted)"
                              : "var(--text-secondary)",
                            textDecoration: job.jobCompleted ? "line-through" : "none",
                          }}
                          title={`${getDisplayName(job.customer)} — ${job.workCompleted}`}
                        >
                          {job.scheduledTime && (
                            <span style={{ color: "var(--accent-orange)" }}>
                              {fmtTime(job.scheduledTime)}{" "}
                            </span>
                          )}
                          {job.jobCompleted ? "✓ " : ""}
                          {getDisplayName(job.customer)}
                        </div>
                      ))}
                      {dayJobs.length > 3 && (
                        <div className="text-xs" style={{ color: "var(--accent-orange)" }}>
                          +{dayJobs.length - 3} more
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
