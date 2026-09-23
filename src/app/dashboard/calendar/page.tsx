"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import CalendarAddJobModal, {
  CustomerOption,
} from "@/components/CalendarAddJobModal";
import EditJobModal from "@/components/EditJobModal";
import { getDisplayName } from "@/lib/customerName";

interface Customer {
  id: number;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  jobAddress: string;
}

interface CalendarJob {
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
  createdAt: string;
  customer: Customer;
}

// ─── Date helpers (local-time, no timezone shifting) ─────────────────────────
function toKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function parseKey(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function formatLong(key: string): string {
  return parseKey(key).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

// ─── Status helpers ───────────────────────────────────────────────────────────
function getStatus(job: CalendarJob): {
  label: string;
  color: string;
  badgeClass: string;
  icon: string;
} {
  if (job.jobCompleted)
    return { label: "Completed", color: "#22c55e", badgeClass: "badge-success", icon: "✓" };
  if (job.jobPartiallyCompleted)
    return { label: "Partial", color: "#f59e0b", badgeClass: "badge-warning", icon: "⚡" };
  if (job.additionalWorkRecommended)
    return { label: "Additional", color: "#3b82f6", badgeClass: "badge-blue", icon: "+" };
  return { label: "Scheduled", color: "#8b949e", badgeClass: "badge-blue", icon: "📅" };
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

interface DayCell {
  key: string;
  day: number;
  inMonth: boolean;
}

function buildCells(year: number, month: number): DayCell[] {
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const cells: DayCell[] = [];

  for (let i = firstWeekday - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, daysInPrevMonth - i);
    cells.push({ key: toKey(d), day: d.getDate(), inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ key: toKey(new Date(year, month, d)), day: d, inMonth: true });
  }
  while (cells.length % 7 !== 0 || cells.length < 35) {
    const last = cells[cells.length - 1];
    const next = new Date(parseKey(last.key).getTime() + 24 * 60 * 60 * 1000);
    // Rebuild from y/m/d to dodge DST edge cases
    const fixed = new Date(next.getFullYear(), next.getMonth(), next.getDate());
    cells.push({ key: toKey(fixed), day: fixed.getDate(), inMonth: false });
    if (cells.length >= 42) break;
  }
  return cells;
}

export default function CalendarPage() {
  const todayKey = useMemo(() => toKey(new Date()), []);
  const today = useMemo(() => new Date(), []);

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState(todayKey);

  const monthKey = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;

  const [jobsByDate, setJobsByDate] = useState<Record<string, CalendarJob[]>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loadedMonth, setLoadedMonth] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState("");
  // Derived loading state: true until the viewed month's data has arrived.
  const loading = loadedMonth !== monthKey;

  const [customerOptions, setCustomerOptions] = useState<CustomerOption[]>([]);

  // Modals
  const [dayPopupOpen, setDayPopupOpen] = useState(false);
  const [detailJob, setDetailJob] = useState<CalendarJob | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editJob, setEditJob] = useState<CalendarJob | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [toast, setToast] = useState("");

  // Imperative refresh (after add/edit/delete) — all state updates below happen
  // inside promise callbacks so no setState runs synchronously in the effect.
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/calendar?month=${monthKey}`)
      .then((r) => r.json().then((data) => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (cancelled) return;
        if (!ok) {
          setError(data.error || "Failed to load calendar.");
          setLoadedMonth(monthKey);
          return;
        }
        const grouped: Record<string, CalendarJob[]> = {};
        for (const job of data.jobs as CalendarJob[]) {
          const key = job.scheduledDate as string;
          if (!key) continue;
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(job);
        }
        // Sort each day: pending first, then by customer name
        for (const key of Object.keys(grouped)) {
          grouped[key].sort((a, b) => {
            const rank = (j: CalendarJob) => (j.jobCompleted ? 1 : 0);
            return (
              rank(a) - rank(b) ||
              getDisplayName(a.customer).localeCompare(getDisplayName(b.customer))
            );
          });
        }
        setJobsByDate(grouped);
        setCounts(data.counts || {});
        setError("");
        setLoadedMonth(monthKey);
      })
      .catch(() => {
        if (cancelled) return;
        setError("Network error. Please try again.");
        setLoadedMonth(monthKey);
      });
    return () => {
      cancelled = true;
    };
  }, [monthKey, refreshKey]);

  // Load customer names once for the add-job autocomplete
  useEffect(() => {
    fetch("/api/customers?compact=1")
      .then((r) => r.json())
      .then((data) => {
        const opts: CustomerOption[] = (data.customers || []).map(
          (c: {
            name: string | null;
            firstName: string | null;
            lastName: string | null;
            phone: string | null;
          }) => ({ name: getDisplayName(c), phone: c.phone })
        );
        setCustomerOptions(opts);
      })
      .catch(() => {});
  }, []);

  // Esc closes the topmost modal
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (editJob) setEditJob(null);
      else if (showAddForm) setShowAddForm(false);
      else if (detailJob) setDetailJob(null);
      else if (dayPopupOpen) setDayPopupOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editJob, showAddForm, detailJob, dayPopupOpen]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  function goMonth(delta: number) {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  }

  function goToday() {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setSelectedDate(todayKey);
  }

  // Clicking a day selects it AND opens the day-summary popup.
  // If the day belongs to an adjacent month, the view follows it so its
  // jobs (fetched per-month) actually load.
  function handleDayClick(key: string) {
    const d = parseKey(key);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setSelectedDate(key);
    setDayPopupOpen(true);
  }

  // After saving a job, jump the calendar to that date and refresh
  function handleAddSuccess(savedDate: string) {
    const d = parseKey(savedDate);
    const sameMonth = d.getFullYear() === viewYear && d.getMonth() === viewMonth;
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setSelectedDate(savedDate);
    setDayPopupOpen(false);
    // Month change alone re-triggers the fetch; only force a refresh otherwise
    if (sameMonth) refresh();
    showToast(`✓ Job scheduled for ${savedDate}`);
  }

  async function handleDeleteJob(jobId: number) {
    await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
    setConfirmDeleteId(null);
    setDetailJob(null);
    refresh();
    showToast("Job deleted.");
  }

  const cells = useMemo(() => buildCells(viewYear, viewMonth), [viewYear, viewMonth]);
  const selectedJobs = jobsByDate[selectedDate] || [];
  const popupJobs = jobsByDate[selectedDate] || [];

  return (
    <div className="max-w-5xl mx-auto">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            📅 Job Calendar
          </h1>
          <p style={{ color: "var(--text-muted)" }}>
            Select a day to see what&apos;s scheduled.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button className="dr-btn-secondary" onClick={goToday}>
            Today
          </button>
          <button className="dr-btn-primary" onClick={() => setShowAddForm(true)}>
            ➕ Add Job
          </button>
        </div>
      </div>

      {toast && (
        <div className="alert-success mb-4 fade-in" role="status">
          {toast}
        </div>
      )}
      {error && <div className="alert-error mb-4">{error}</div>}

      {/* ── Top: bulleted list of jobs scheduled for the selected day ── */}
      <div className="dr-card mb-6">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h2
            className="text-lg font-semibold"
            style={{ color: "var(--accent-orange)" }}
          >
            Jobs scheduled for {formatLong(selectedDate)}
          </h2>
          <span
            className="text-xs px-2 py-1 rounded-full"
            style={{
              background: "rgba(249,115,22,0.1)",
              color: "var(--accent-orange)",
              border: "1px solid rgba(249,115,22,0.2)",
            }}
          >
            {selectedJobs.length} job{selectedJobs.length !== 1 ? "s" : ""}
          </span>
        </div>

        {loading ? (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            Loading…
          </p>
        ) : selectedJobs.length === 0 ? (
          <div
            className="text-sm rounded-lg p-4"
            style={{
              color: "var(--text-muted)",
              background: "var(--bg-tertiary)",
              border: "1px dashed var(--border-color)",
            }}
          >
            No jobs scheduled for this day.{" "}
            <button
              onClick={() => setShowAddForm(true)}
              style={{
                background: "none",
                border: "none",
                color: "var(--accent-orange)",
                cursor: "pointer",
                fontWeight: 600,
                padding: 0,
              }}
            >
              ➕ Schedule one
            </button>
          </div>
        ) : (
          <ul style={{ listStyle: "disc", paddingLeft: "24px", margin: 0 }}>
            {selectedJobs.map((job) => {
              const status = getStatus(job);
              return (
                <li key={job.id} className="mb-2" style={{ color: "var(--text-muted)" }}>
                  <button
                    onClick={() => setDetailJob(job)}
                    className="text-left w-full"
                    style={{
                      background: "var(--bg-tertiary)",
                      border: "1px solid var(--border-color)",
                      borderRadius: "8px",
                      padding: "10px 14px",
                      cursor: "pointer",
                      width: "100%",
                      transition: "border-color 0.15s",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.borderColor = status.color)
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.borderColor = "var(--border-color)")
                    }
                  >
                    <span className="flex items-center gap-2 flex-wrap">
                      <span
                        className="inline-block rounded-full"
                        style={{
                          width: "8px",
                          height: "8px",
                          background: status.color,
                          flexShrink: 0,
                        }}
                      />
                      <strong
                        className="text-sm"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {getDisplayName(job.customer)}
                      </strong>
                      <span className={status.badgeClass}>
                        {status.icon} {status.label}
                      </span>
                    </span>
                    <span
                      className="block text-xs mt-1 truncate"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {job.workCompleted}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Below: month calendar ── */}
      <div className="dr-card">
        <div className="flex items-center justify-between mb-4">
          <button
            className="dr-btn-secondary"
            style={{ padding: "6px 14px" }}
            onClick={() => goMonth(-1)}
            aria-label="Previous month"
          >
            ‹ Prev
          </button>
          <h2
            className="text-lg font-bold text-center"
            style={{ color: "var(--text-primary)" }}
          >
            {monthLabel(viewYear, viewMonth)}
          </h2>
          <button
            className="dr-btn-secondary"
            style={{ padding: "6px 14px" }}
            onClick={() => goMonth(1)}
            aria-label="Next month"
          >
            Next ›
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div
              className="inline-block w-8 h-8 border-2 rounded-full animate-spin"
              style={{
                borderColor: "var(--accent-orange)",
                borderTopColor: "transparent",
              }}
            />
          </div>
        ) : (
          <>
            <div
              className="grid grid-cols-7 gap-1 sm:gap-2"
              style={{ marginBottom: "8px" }}
            >
              {WEEKDAYS.map((d) => (
                <div
                  key={d}
                  className="text-center text-xs font-semibold py-1"
                  style={{ color: "var(--text-muted)" }}
                >
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1 sm:gap-2">
              {cells.map((cell) => {
                const count = counts[cell.key] || 0;
                const dayJobs = jobsByDate[cell.key] || [];
                const isToday = cell.key === todayKey;
                const isSelected = cell.key === selectedDate;
                return (
                  <button
                    key={cell.key}
                    onClick={() => handleDayClick(cell.key)}
                    className="cal-day"
                    style={{
                      minHeight: "64px",
                      borderRadius: "10px",
                      padding: "6px 4px",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "4px",
                      background: isSelected
                        ? "rgba(249,115,22,0.15)"
                        : "var(--bg-tertiary)",
                      border: isSelected
                        ? "2px solid var(--accent-orange)"
                        : isToday
                          ? "2px solid var(--accent-blue-light)"
                          : "1px solid var(--border-color)",
                      opacity: cell.inMonth ? 1 : 0.45,
                      transition: "transform 0.1s, border-color 0.15s",
                    }}
                  >
                    <span
                      className="text-sm font-semibold"
                      style={{
                        color: isSelected
                          ? "var(--accent-orange)"
                          : "var(--text-primary)",
                        width: "24px",
                        height: "24px",
                        lineHeight: "24px",
                        borderRadius: "50%",
                        background: isToday && !isSelected
                          ? "rgba(59,130,246,0.2)"
                          : "transparent",
                      }}
                    >
                      {cell.day}
                    </span>
                    {count > 0 && (
                      <>
                        <span
                          className="hidden sm:inline-block text-xs font-semibold px-2 rounded-full"
                          style={{
                            background: "rgba(249,115,22,0.2)",
                            color: "var(--accent-orange)",
                            fontSize: "11px",
                          }}
                        >
                          {count} job{count !== 1 ? "s" : ""}
                        </span>
                        <span className="flex gap-1 flex-wrap justify-center">
                          {dayJobs.slice(0, 4).map((j) => (
                            <span
                              key={j.id}
                              className="rounded-full"
                              style={{
                                width: "7px",
                                height: "7px",
                                background: getStatus(j).color,
                              }}
                            />
                          ))}
                          {count > 4 && (
                            <span
                              className="sm:hidden"
                              style={{
                                fontSize: "10px",
                                color: "var(--accent-orange)",
                              }}
                            >
                              +{count - 4}
                            </span>
                          )}
                        </span>
                        <span
                          className="sm:hidden text-xs font-bold"
                          style={{ color: "var(--accent-orange)" }}
                        >
                          {count}
                        </span>
                      </>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div
              className="flex items-center gap-4 flex-wrap mt-4 text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              <span className="font-semibold" style={{ color: "var(--text-secondary)" }}>
                Legend:
              </span>
              {[
                { label: "Scheduled", color: "#8b949e" },
                { label: "Completed", color: "#22c55e" },
                { label: "Partial", color: "#f59e0b" },
                { label: "Additional", color: "#3b82f6" },
              ].map((s) => (
                <span key={s.label} className="flex items-center gap-1">
                  <span
                    className="inline-block rounded-full"
                    style={{ width: "8px", height: "8px", background: s.color }}
                  />
                  {s.label}
                </span>
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Day summary popup ── */}
      {dayPopupOpen && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setDayPopupOpen(false);
          }}
        >
          <div className="modal-content slide-in" style={{ maxWidth: "480px" }}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2
                  className="text-lg font-bold"
                  style={{ color: "var(--accent-orange)" }}
                >
                  📅 {formatLong(selectedDate)}
                </h2>
                <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                  {popupJobs.length === 0
                    ? "No tasks scheduled for this day."
                    : `${popupJobs.length} task${popupJobs.length !== 1 ? "s" : ""} scheduled for this day.`}
                </p>
              </div>
              <button
                onClick={() => setDayPopupOpen(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  fontSize: "22px",
                  cursor: "pointer",
                  lineHeight: 1,
                  padding: "4px",
                }}
              >
                ×
              </button>
            </div>

            {popupJobs.length > 0 && (
              <div className="space-y-2 mb-5" style={{ maxHeight: "260px", overflowY: "auto" }}>
                {popupJobs.map((job) => {
                  const status = getStatus(job);
                  return (
                    <button
                      key={job.id}
                      onClick={() => {
                        setDayPopupOpen(false);
                        setDetailJob(job);
                      }}
                      className="text-left w-full"
                      style={{
                        background: "var(--bg-tertiary)",
                        border: "1px solid var(--border-color)",
                        borderRadius: "8px",
                        padding: "10px 12px",
                        cursor: "pointer",
                        width: "100%",
                      }}
                    >
                      <span className="flex items-center gap-2 flex-wrap">
                        <span
                          className="inline-block rounded-full"
                          style={{
                            width: "8px",
                            height: "8px",
                            background: status.color,
                            flexShrink: 0,
                          }}
                        />
                        <strong className="text-sm" style={{ color: "var(--text-primary)" }}>
                          {getDisplayName(job.customer)}
                        </strong>
                        <span className={status.badgeClass}>
                          {status.icon} {status.label}
                        </span>
                      </span>
                      <span
                        className="block text-xs mt-1 truncate"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        {job.workCompleted}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className="flex gap-3">
              <button
                onClick={() => setDayPopupOpen(false)}
                className="dr-btn-secondary flex-1"
                style={{ justifyContent: "center" }}
              >
                Close
              </button>
              <button
                onClick={() => {
                  setDayPopupOpen(false);
                  setShowAddForm(true);
                }}
                className="dr-btn-primary flex-1"
                style={{ justifyContent: "center" }}
              >
                ➕ Add New Job
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Job detail popup ── */}
      {detailJob && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget && confirmDeleteId === null)
              setDetailJob(null);
          }}
        >
          <div className="modal-content slide-in" style={{ maxWidth: "520px" }}>
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2
                  className="text-lg font-bold"
                  style={{ color: "var(--accent-orange)" }}
                >
                  🔧 {getDisplayName(detailJob.customer)}
                </h2>
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  Scheduled: {detailJob.scheduledDate || "—"}
                </p>
              </div>
              <button
                onClick={() => setDetailJob(null)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  fontSize: "22px",
                  cursor: "pointer",
                  lineHeight: 1,
                  padding: "4px",
                }}
              >
                ×
              </button>
            </div>

            {confirmDeleteId === detailJob.id ? (
              <div
                className="rounded-lg p-4 mb-4"
                style={{
                  background: "rgba(239,68,68,0.08)",
                  border: "1px solid rgba(239,68,68,0.3)",
                }}
              >
                <p
                  className="text-sm font-semibold mb-3"
                  style={{ color: "var(--danger)" }}
                >
                  Delete this job? This cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setConfirmDeleteId(null)}
                    className="dr-btn-secondary flex-1"
                    style={{ justifyContent: "center" }}
                  >
                    Keep
                  </button>
                  <button
                    onClick={() => handleDeleteJob(detailJob.id)}
                    className="flex-1"
                    style={{
                      justifyContent: "center",
                      background: "var(--danger)",
                      color: "white",
                      border: "none",
                      borderRadius: "6px",
                      padding: "10px 20px",
                      fontSize: "14px",
                      fontWeight: 600,
                      cursor: "pointer",
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div
                  className="rounded-lg p-4 mb-4 space-y-2"
                  style={{
                    background: "var(--bg-tertiary)",
                    border: "1px solid var(--border-color)",
                  }}
                >
                  <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    📞 {detailJob.customer.phone || "No phone"}
                  </div>
                  {detailJob.customer.email && (
                    <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                      ✉️ {detailJob.customer.email}
                    </div>
                  )}
                  <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    📍 {detailJob.customer.jobAddress}
                  </div>
                  <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    👷 {detailJob.employeeName} · ⏱ {detailJob.totalHoursWorked}h
                  </div>
                  <div className="flex items-center gap-2 flex-wrap pt-1">
                    {(() => {
                      const s = getStatus(detailJob);
                      return (
                        <span className={s.badgeClass}>
                          {s.icon} {s.label}
                        </span>
                      );
                    })()}
                    {detailJob.jobCompleted && detailJob.billPaid && (
                      <span className="badge-success">💰 Paid</span>
                    )}
                    {detailJob.jobCompleted && detailJob.billSent && !detailJob.billPaid && (
                      <span className="badge-warning">📄 Sent</span>
                    )}
                  </div>
                </div>

                <div className="mb-2">
                  <div
                    className="text-xs font-semibold mb-1"
                    style={{ color: "var(--text-muted)" }}
                  >
                    WORK TO BE COMPLETED
                  </div>
                  <p
                    className="text-sm rounded-lg p-3"
                    style={{
                      color: "var(--text-primary)",
                      background: "var(--bg-primary)",
                      border: "1px solid var(--border-color)",
                      whiteSpace: "pre-wrap",
                    }}
                  >
                    {detailJob.workCompleted}
                  </p>
                </div>
                {detailJob.additionalDetails && (
                  <div className="mb-4">
                    <div
                      className="text-xs font-semibold mb-1"
                      style={{ color: "var(--text-muted)" }}
                    >
                      ADDITIONAL DETAILS
                    </div>
                    <p
                      className="text-xs rounded-lg p-3"
                      style={{
                        color: "var(--text-secondary)",
                        background: "var(--bg-primary)",
                        border: "1px solid var(--border-color)",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {detailJob.additionalDetails}
                    </p>
                  </div>
                )}

                <div className="flex gap-2 flex-wrap mt-4">
                  <button
                    onClick={() => setDetailJob(null)}
                    className="dr-btn-secondary flex-1"
                    style={{ justifyContent: "center" }}
                  >
                    Close
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(detailJob.id)}
                    className="dr-btn-danger flex-1"
                    style={{ justifyContent: "center" }}
                  >
                    🗑️ Delete
                  </button>
                  <button
                    onClick={() => setEditJob(detailJob)}
                    className="dr-btn-primary flex-1"
                    style={{ justifyContent: "center" }}
                  >
                    ✏️ Edit
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Add job form ── */}
      {showAddForm && (
        <CalendarAddJobModal
          date={selectedDate}
          customerOptions={customerOptions}
          onClose={() => setShowAddForm(false)}
          onSuccess={handleAddSuccess}
        />
      )}

      {/* ── Edit job (supports rescheduling) ── */}
      {editJob && (
        <EditJobModal
          job={editJob}
          customerName={getDisplayName(editJob.customer)}
          onClose={() => setEditJob(null)}
          onSuccess={() => {
            setEditJob(null);
            setDetailJob(null);
            refresh();
            showToast("✓ Job updated.");
          }}
        />
      )}
    </div>
  );
}
