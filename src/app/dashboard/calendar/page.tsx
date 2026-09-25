"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import CalendarAddJobModal, {
  CustomerOption,
} from "@/components/CalendarAddJobModal";
import EditJobModal from "@/components/EditJobModal";
import PhoneLink from "@/components/PhoneLink";
import { getDisplayName } from "@/lib/customerName";
import {
  CalendarJob,
  DATE_RE,
  fmtTime,
  formatLong,
  formatShort,
  monthLabel,
  parseKey,
  sortJobsDay,
  toKey,
} from "@/lib/calendar";

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

function weekRangeLabel(days: string[]): string {
  const a = parseKey(days[0]);
  const b = parseKey(days[days.length - 1]);
  const left = a.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const right =
    a.getMonth() === b.getMonth()
      ? String(b.getDate())
      : b.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${left} – ${right}, ${b.getFullYear()}`;
}

type ViewMode = "month" | "week" | "agenda";

// Days with this many jobs (or more) get a workload warning. Counts ALL jobs,
// even when an employee filter is active, since it reflects true daily load.
const HEAVY_DAY_THRESHOLD = 4;
const FILTER_KEY = "cal-employee-filter";

// ─── Shared job row (top list, day popup, agenda) ─────────────────────────────
// Main card opens the detail popup; the ✓ button completes without opening it.
function JobRow({
  job,
  onOpen,
  onToggleComplete,
}: {
  job: CalendarJob;
  onOpen: () => void;
  onToggleComplete: (job: CalendarJob, complete: boolean) => void;
}) {
  const status = getStatus(job);
  const time = fmtTime(job.scheduledTime);
  return (
    <div className="flex gap-2 items-stretch">
      <button
        onClick={onOpen}
        className="text-left"
        style={{
          flex: 1,
          minWidth: 0,
          background: "var(--bg-tertiary)",
          border: "1px solid var(--border-color)",
          borderRadius: "8px",
          padding: "10px 14px",
          cursor: "pointer",
          transition: "border-color 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = status.color)}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border-color)")}
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
          {time && (
            <span
              className="text-xs font-semibold"
              style={{ color: "var(--accent-orange)" }}
            >
              🕐 {time}
            </span>
          )}
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
      {!job.jobCompleted ? (
        <button
          onClick={() => onToggleComplete(job, true)}
          title="Mark complete"
          aria-label={`Mark job for ${getDisplayName(job.customer)} complete`}
          style={{
            flexShrink: 0,
            width: "44px",
            borderRadius: "8px",
            border: "1px solid rgba(34,197,94,0.4)",
            background: "rgba(34,197,94,0.08)",
            color: "var(--success)",
            fontSize: "18px",
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          ✓
        </button>
      ) : (
        <button
          onClick={() => onToggleComplete(job, false)}
          title="Reopen job"
          aria-label={`Reopen job for ${getDisplayName(job.customer)}`}
          style={{
            flexShrink: 0,
            width: "44px",
            borderRadius: "8px",
            border: "1px solid var(--border-color)",
            background: "transparent",
            color: "var(--text-muted)",
            fontSize: "16px",
            cursor: "pointer",
          }}
        >
          ↩
        </button>
      )}
    </div>
  );
}

export default function CalendarPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-5xl mx-auto">
          <div className="dr-card text-center py-16" style={{ color: "var(--text-muted)" }}>
            Loading calendar…
          </div>
        </div>
      }
    >
      <CalendarInner />
    </Suspense>
  );
}

function CalendarInner() {
  const searchParams = useSearchParams();
  const paramDate = searchParams.get("date");
  const initialDate =
    paramDate && DATE_RE.test(paramDate) ? paramDate : toKey(new Date());

  const todayKey = useMemo(() => toKey(new Date()), []);
  const today = useMemo(() => new Date(), []);

  const [selectedDate, setSelectedDate] = useState(initialDate);
  const [viewYear, setViewYear] = useState(() => parseKey(initialDate).getFullYear());
  const [viewMonth, setViewMonth] = useState(() => parseKey(initialDate).getMonth());
  const [view, setView] = useState<ViewMode>("month");
  const [employeeFilter, setEmployeeFilterState] = useState(() =>
    typeof window === "undefined" ? "" : localStorage.getItem(FILTER_KEY) || ""
  );

  // Sync state when the ?date= param changes (e.g. coming from the dashboard
  // "Upcoming 7 Days" strip while already on this page). This is the documented
  // "adjust state during render" pattern — not a setState-in-effect.
  const [appliedParam, setAppliedParam] = useState<string | null>(paramDate);
  if (paramDate !== appliedParam) {
    setAppliedParam(paramDate);
    if (paramDate && DATE_RE.test(paramDate)) {
      const d = parseKey(paramDate);
      setViewYear(d.getFullYear());
      setViewMonth(d.getMonth());
      setSelectedDate(paramDate);
    }
  }

  function updateFilter(v: string) {
    setEmployeeFilterState(v);
    try {
      if (v) localStorage.setItem(FILTER_KEY, v);
      else localStorage.removeItem(FILTER_KEY);
    } catch {
      /* storage unavailable — filter still works for this session */
    }
  }

  const monthKey = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;

  const [jobsByDate, setJobsByDate] = useState<Record<string, CalendarJob[]>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [range, setRange] = useState({ start: "", end: "" });
  const [unscheduled, setUnscheduled] = useState<CalendarJob[]>([]);
  const [unscheduledCount, setUnscheduledCount] = useState(0);
  const [trayOpen, setTrayOpen] = useState(true);
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
  const [toastKind, setToastKind] = useState<"success" | "error">("success");

  // Drag & drop (unscheduled tray → day)
  const [dragJobId, setDragJobId] = useState<number | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  // Imperative refresh (after add/edit/delete/complete/schedule) — all state
  // updates below happen inside promise callbacks so no setState runs
  // synchronously in the effect.
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), []);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/calendar?month=${monthKey}&includeUnscheduled=1`)
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
        for (const key of Object.keys(grouped)) {
          grouped[key].sort(sortJobsDay);
        }
        setJobsByDate(grouped);
        setCounts(data.counts || {});
        setRange({ start: data.start || "", end: data.end || "" });
        setUnscheduled(data.unscheduled || []);
        setUnscheduledCount(data.unscheduledCount || 0);
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

  function showToast(msg: string, isError = false) {
    setToast(msg);
    setToastKind(isError ? "error" : "success");
    setTimeout(() => setToast(""), 3000);
  }

  // ── Employee filter (options derived from UNFILTERED jobs) ──
  const employees = useMemo(() => {
    const names = new Set<string>();
    for (const list of Object.values(jobsByDate)) {
      for (const j of list) names.add(j.employeeName);
    }
    for (const j of unscheduled) names.add(j.employeeName);
    return [...names].sort((a, b) => a.localeCompare(b));
  }, [jobsByDate, unscheduled]);

  const filteredJobsByDate = useMemo(() => {
    if (!employeeFilter) return jobsByDate;
    const out: Record<string, CalendarJob[]> = {};
    for (const [key, list] of Object.entries(jobsByDate)) {
      const kept = list.filter((j) => j.employeeName === employeeFilter);
      if (kept.length > 0) out[key] = kept;
    }
    return out;
  }, [jobsByDate, employeeFilter]);

  const filteredCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [key, list] of Object.entries(filteredJobsByDate)) {
      out[key] = list.length;
    }
    return out;
  }, [filteredJobsByDate]);

  const filteredUnscheduled = useMemo(
    () =>
      employeeFilter
        ? unscheduled.filter((j) => j.employeeName === employeeFilter)
        : unscheduled,
    [unscheduled, employeeFilter]
  );

  const isHeavy = useCallback(
    (key: string) => (counts[key] || 0) >= HEAVY_DAY_THRESHOLD,
    [counts]
  );

  // ── Navigation ──
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

  // Clicking a month-grid day selects it AND opens the day-summary popup.
  // If the day belongs to an adjacent month, the view follows it so its
  // jobs (fetched per-month) actually load.
  function handleDayClick(key: string) {
    const d = parseKey(key);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setSelectedDate(key);
    setDayPopupOpen(true);
  }

  // Week view: shift the selected date by whole weeks. The fetch month follows
  // the mid-week day, which guarantees the whole week is inside the loaded
  // range (any week touching month M is fully covered by M's grid range).
  function goWeek(delta: number) {
    const d = parseKey(selectedDate);
    d.setDate(d.getDate() + delta * 7);
    const mid = new Date(d.getFullYear(), d.getMonth(), d.getDate() + (3 - d.getDay()));
    setViewYear(mid.getFullYear());
    setViewMonth(mid.getMonth());
    setSelectedDate(toKey(d));
  }

  const weekDays = useMemo(() => {
    const sel = parseKey(selectedDate);
    const sunday = new Date(
      sel.getFullYear(),
      sel.getMonth(),
      sel.getDate() - sel.getDay()
    );
    return Array.from({ length: 7 }, (_, i) =>
      toKey(new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + i))
    );
  }, [selectedDate]);

  // Agenda: every day in the loaded range that has (filtered) jobs.
  const agendaDays = useMemo(() => {
    if (!range.start || !range.end) return [];
    const out: string[] = [];
    const d = parseKey(range.start);
    const end = parseKey(range.end);
    while (d <= end) {
      const key = toKey(d);
      if ((filteredJobsByDate[key] || []).length > 0) out.push(key);
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [range, filteredJobsByDate]);

  // ── Mutations ──
  async function scheduleJob(jobId: number, dateKey: string) {
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledDate: dateKey }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || "Could not schedule job.", true);
        return;
      }
      setSelectedDate(dateKey);
      refresh();
      showToast(`✓ Scheduled for ${dateKey}`);
    } catch {
      showToast("Network error.", true);
    }
  }

  async function unscheduleJob(job: CalendarJob) {
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledDate: null, scheduledTime: null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || "Could not unschedule job.", true);
        return;
      }
      setDetailJob(null);
      refresh();
      showToast("📥 Moved to unscheduled.");
    } catch {
      showToast("Network error.", true);
    }
  }

  async function toggleComplete(job: CalendarJob, complete: boolean) {
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: complete ? "complete" : "reopen" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        showToast(data.error || "Update failed.", true);
        return;
      }
      if (detailJob && detailJob.id === job.id) {
        setDetailJob({
          ...detailJob,
          jobCompleted: complete,
          jobPartiallyCompleted: false,
          additionalWorkRecommended: false,
        });
      }
      refresh();
      showToast(complete ? "✓ Marked complete." : "↩ Reopened.");
    } catch {
      showToast("Network error.", true);
    }
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

  // Shared drop-target props for month cells + week columns
  function dropProps(key: string) {
    return {
      onDragOver: (e: React.DragEvent) => {
        if (dragJobId !== null) {
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
          setDragOverKey(key);
        }
      },
      onDragLeave: () => setDragOverKey((k) => (k === key ? null : k)),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        const id = parseInt(e.dataTransfer.getData("text/plain"), 10);
        setDragOverKey(null);
        setDragJobId(null);
        if (!isNaN(id)) scheduleJob(id, key);
      },
    };
  }

  function openAddFor(dateKey: string) {
    setSelectedDate(dateKey);
    setDayPopupOpen(false);
    setShowAddForm(true);
  }

  const cells = useMemo(() => buildCells(viewYear, viewMonth), [viewYear, viewMonth]);
  const selectedJobs = filteredJobsByDate[selectedDate] || [];
  const popupJobs = filteredJobsByDate[selectedDate] || [];
  const selectedHeavy = isHeavy(selectedDate);

  const viewBtn = (mode: ViewMode, label: string) => (
    <button
      key={mode}
      onClick={() => setView(mode)}
      style={{
        padding: "6px 14px",
        fontSize: "13px",
        fontWeight: view === mode ? 700 : 500,
        border: "none",
        borderRadius: "6px",
        cursor: "pointer",
        background: view === mode ? "var(--accent-orange)" : "transparent",
        color: view === mode ? "white" : "var(--text-secondary)",
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="max-w-5xl mx-auto">
      {/* ── Header ── */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
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

      {/* ── Toolbar: view toggle + employee filter ── */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div
          className="flex gap-1 p-1 rounded-lg"
          style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)" }}
          role="tablist"
          aria-label="Calendar view"
        >
          {viewBtn("month", "Month")}
          {viewBtn("week", "Week")}
          {viewBtn("agenda", "Agenda")}
        </div>
        <div className="flex items-center gap-2">
          <label
            htmlFor="employee-filter"
            className="text-xs font-semibold"
            style={{ color: "var(--text-muted)" }}
          >
            👷 Employee:
          </label>
          <select
            id="employee-filter"
            className="dr-input"
            style={{ width: "auto", padding: "6px 10px", fontSize: "13px" }}
            value={employeeFilter}
            onChange={(e) => updateFilter(e.target.value)}
          >
            <option value="">All employees</option>
            {employees.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
          {employeeFilter && (
            <button
              onClick={() => updateFilter("")}
              title="Clear filter"
              style={{
                background: "rgba(249,115,22,0.15)",
                border: "1px solid rgba(249,115,22,0.4)",
                color: "var(--accent-orange)",
                borderRadius: "6px",
                padding: "5px 10px",
                fontSize: "12px",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {toast && (
        <div
          className={toastKind === "error" ? "alert-error mb-4 fade-in" : "alert-success mb-4 fade-in"}
          role="status"
        >
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
          <span className="flex items-center gap-2">
            {selectedHeavy && (
              <span
                className="text-xs px-2 py-1 rounded-full"
                title={`Heavy day — ${counts[selectedDate]} jobs scheduled in total`}
                style={{
                  background: "rgba(245,158,11,0.12)",
                  color: "var(--warning)",
                  border: "1px solid rgba(245,158,11,0.35)",
                }}
              >
                ⚠️ Heavy day
              </span>
            )}
            <span
              className="text-xs px-2 py-1 rounded-full"
              style={{
                background: "rgba(249,115,22,0.1)",
                color: "var(--accent-orange)",
                border: "1px solid rgba(249,115,22,0.2)",
              }}
            >
              {selectedJobs.length} job{selectedJobs.length !== 1 ? "s" : ""}
              {employeeFilter ? ` · ${employeeFilter}` : ""}
            </span>
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
            {employeeFilter
              ? `No jobs for ${employeeFilter} on this day. `
              : "No jobs scheduled for this day. "}
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
            {selectedJobs.map((job) => (
              <li key={job.id} className="mb-2" style={{ color: "var(--text-muted)" }}>
                <JobRow
                  job={job}
                  onOpen={() => setDetailJob(job)}
                  onToggleComplete={toggleComplete}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Unscheduled tray (drag onto a day, or schedule for selected day) ── */}
      <div className="dr-card mb-6" style={{ padding: "16px 24px" }}>
        <button
          onClick={() => setTrayOpen((o) => !o)}
          className="w-full"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            width: "100%",
            padding: 0,
          }}
          aria-expanded={trayOpen}
        >
          <span
            className="text-sm font-semibold"
            style={{ color: "var(--text-secondary)" }}
          >
            📥 Unscheduled Jobs ({employeeFilter ? filteredUnscheduled.length : unscheduledCount}
            {unscheduled.length < unscheduledCount && !employeeFilter
              ? ` · showing ${unscheduled.length}`
              : ""}
            )
          </span>
          <span style={{ color: "var(--text-muted)" }}>{trayOpen ? "▲" : "▼"}</span>
        </button>

        {trayOpen && (
          <div className="mt-3 fade-in">
            {loading ? (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                Loading…
              </p>
            ) : filteredUnscheduled.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--success)" }}>
                ✓ Everything is scheduled. Nice work!
              </p>
            ) : (
              <>
                <p className="text-xs mb-3" style={{ color: "var(--text-muted)" }}>
                  Drag a job onto a day{view === "month" ? " in the calendar below" : ""} — or
                  use the 📅 button to schedule it for {formatShort(selectedDate)}.
                </p>
                <div className="space-y-2" style={{ maxHeight: "280px", overflowY: "auto" }}>
                  {filteredUnscheduled.map((job) => {
                    const status = getStatus(job);
                    const dragging = dragJobId === job.id;
                    return (
                      <div
                        key={job.id}
                        className="flex gap-2 items-stretch"
                        draggable
                        onDragStart={(e) => {
                          setDragJobId(job.id);
                          e.dataTransfer.setData("text/plain", String(job.id));
                          e.dataTransfer.effectAllowed = "move";
                        }}
                        onDragEnd={() => {
                          setDragJobId(null);
                          setDragOverKey(null);
                        }}
                        style={{ opacity: dragging ? 0.45 : 1, cursor: "grab" }}
                      >
                        <button
                          onClick={() => setDetailJob(job)}
                          className="text-left"
                          title="Drag onto a calendar day, or click for details"
                          style={{
                            flex: 1,
                            minWidth: 0,
                            background: "var(--bg-tertiary)",
                            border: "1px dashed var(--border-color)",
                            borderRadius: "8px",
                            padding: "8px 12px",
                            cursor: "grab",
                          }}
                        >
                          <span className="flex items-center gap-2 flex-wrap">
                            <span style={{ color: "var(--text-muted)", fontSize: "12px" }}>⠿</span>
                            <span
                              className="inline-block rounded-full"
                              style={{ width: "8px", height: "8px", background: status.color }}
                            />
                            <strong className="text-sm" style={{ color: "var(--text-primary)" }}>
                              {getDisplayName(job.customer)}
                            </strong>
                            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                              👷 {job.employeeName}
                            </span>
                          </span>
                          <span
                            className="block text-xs mt-1 truncate"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {job.workCompleted}
                          </span>
                        </button>
                        <button
                          onClick={() => scheduleJob(job.id, selectedDate)}
                          title={`Schedule for ${formatLong(selectedDate)}`}
                          style={{
                            flexShrink: 0,
                            borderRadius: "8px",
                            border: "1px solid rgba(249,115,22,0.4)",
                            background: "rgba(249,115,22,0.08)",
                            color: "var(--accent-orange)",
                            fontSize: "12px",
                            fontWeight: 700,
                            cursor: "pointer",
                            padding: "0 12px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          📅 {formatShort(selectedDate).replace(/^\w+, /, "")}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* ── View card: month / week / agenda ── */}
      <div className="dr-card">
        {view === "month" && (
          <>
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
          </>
        )}

        {view === "week" && (
          <div className="flex items-center justify-between mb-4">
            <button
              className="dr-btn-secondary"
              style={{ padding: "6px 14px" }}
              onClick={() => goWeek(-1)}
              aria-label="Previous week"
            >
              ‹ Prev
            </button>
            <h2
              className="text-lg font-bold text-center"
              style={{ color: "var(--text-primary)" }}
            >
              {weekRangeLabel(weekDays)}
            </h2>
            <button
              className="dr-btn-secondary"
              style={{ padding: "6px 14px" }}
              onClick={() => goWeek(1)}
              aria-label="Next week"
            >
              Next ›
            </button>
          </div>
        )}

        {view === "agenda" && (
          <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
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
              Agenda — {monthLabel(viewYear, viewMonth)}
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
        )}
        {view === "agenda" && range.start && (
          <p className="text-xs text-center mb-4" style={{ color: "var(--text-muted)" }}>
            Showing {range.start} – {range.end}
            {employeeFilter ? ` · ${employeeFilter}` : ""}
          </p>
        )}

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
            {/* ── MONTH GRID ── */}
            {view === "month" && (
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
                    const count = filteredCounts[cell.key] || 0;
                    const dayJobs = filteredJobsByDate[cell.key] || [];
                    const isToday = cell.key === todayKey;
                    const isSelected = cell.key === selectedDate;
                    const heavy = isHeavy(cell.key);
                    const dragOver = dragOverKey === cell.key && dragJobId !== null;
                    return (
                      <button
                        key={cell.key}
                        onClick={() => handleDayClick(cell.key)}
                        className="cal-day"
                        {...dropProps(cell.key)}
                        style={{
                          minHeight: "64px",
                          borderRadius: "10px",
                          padding: "6px 4px",
                          cursor: "pointer",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: "4px",
                          background: dragOver
                            ? "rgba(34,197,94,0.15)"
                            : isSelected
                              ? "rgba(249,115,22,0.15)"
                              : "var(--bg-tertiary)",
                          border: dragOver
                            ? "2px dashed var(--success)"
                            : isSelected
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
                            background:
                              isToday && !isSelected
                                ? "rgba(59,130,246,0.2)"
                                : "transparent",
                          }}
                        >
                          {cell.day}
                        </span>
                        {heavy && (
                          <span
                            title={`Heavy day — ${counts[cell.key]} jobs scheduled in total`}
                            style={{ fontSize: "12px", lineHeight: 1 }}
                          >
                            ⚠️
                          </span>
                        )}
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
                  <span className="flex items-center gap-1">⚠️ = heavy day ({HEAVY_DAY_THRESHOLD}+ jobs)</span>
                </div>
              </>
            )}

            {/* ── WEEK VIEW ── */}
            {view === "week" && (
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: "repeat(7, minmax(100px, 1fr))", overflowX: "auto" }}
              >
                {weekDays.map((key) => {
                  const dayJobs = filteredJobsByDate[key] || [];
                  const isToday = key === todayKey;
                  const isSelected = key === selectedDate;
                  const heavy = isHeavy(key);
                  const dragOver = dragOverKey === key && dragJobId !== null;
                  const d = parseKey(key);
                  return (
                    <div
                      key={key}
                      {...dropProps(key)}
                      className="rounded-lg p-2"
                      style={{
                        background: dragOver
                          ? "rgba(34,197,94,0.12)"
                          : isSelected
                            ? "rgba(249,115,22,0.07)"
                            : "var(--bg-tertiary)",
                        border: dragOver
                          ? "2px dashed var(--success)"
                          : isSelected
                            ? "1px solid rgba(249,115,22,0.45)"
                            : "1px solid var(--border-color)",
                        minHeight: "220px",
                        display: "flex",
                        flexDirection: "column",
                      }}
                    >
                      <button
                        onClick={() => setSelectedDate(key)}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          padding: "2px 0 6px",
                          textAlign: "left",
                        }}
                      >
                        <div
                          className="text-xs font-bold"
                          style={{
                            color: isSelected ? "var(--accent-orange)" : "var(--text-primary)",
                          }}
                        >
                          {d.toLocaleDateString("en-US", { weekday: "short" })}{" "}
                          <span
                            style={{
                              display: "inline-block",
                              minWidth: "22px",
                              height: "22px",
                              lineHeight: "22px",
                              textAlign: "center",
                              borderRadius: "50%",
                              background: isToday ? "rgba(59,130,246,0.25)" : "transparent",
                            }}
                          >
                            {d.getDate()}
                          </span>{" "}
                          {heavy && (
                            <span title={`Heavy day — ${counts[key]} jobs in total`}>⚠️</span>
                          )}
                        </div>
                      </button>
                      <div className="space-y-1 flex-1">
                        {dayJobs.map((job) => {
                          const s = getStatus(job);
                          return (
                            <button
                              key={job.id}
                              onClick={() => setDetailJob(job)}
                              className="text-left w-full"
                              style={{
                                display: "block",
                                width: "100%",
                                background: "var(--bg-primary)",
                                border: "1px solid var(--border-color)",
                                borderLeft: `3px solid ${s.color}`,
                                borderRadius: "6px",
                                padding: "5px 7px",
                                cursor: "pointer",
                              }}
                              title={`${getDisplayName(job.customer)} — ${job.workCompleted}`}
                            >
                              {job.scheduledTime && (
                                <div
                                  className="text-xs font-bold"
                                  style={{ color: "var(--accent-orange)" }}
                                >
                                  {fmtTime(job.scheduledTime)}
                                </div>
                              )}
                              <div
                                className="text-xs truncate"
                                style={{
                                  color: job.jobCompleted
                                    ? "var(--text-muted)"
                                    : "var(--text-primary)",
                                  textDecoration: job.jobCompleted ? "line-through" : "none",
                                }}
                              >
                                {job.jobCompleted ? "✓ " : ""}
                                {getDisplayName(job.customer)}
                              </div>
                              <div
                                className="text-xs truncate"
                                style={{ color: "var(--text-muted)" }}
                              >
                                {job.workCompleted}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                      <button
                        onClick={() => openAddFor(key)}
                        style={{
                          marginTop: "6px",
                          background: "transparent",
                          border: "1px dashed var(--border-color)",
                          borderRadius: "6px",
                          color: "var(--text-muted)",
                          fontSize: "12px",
                          padding: "4px",
                          cursor: "pointer",
                        }}
                      >
                        ＋ Add
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {/* ── AGENDA VIEW ── */}
            {view === "agenda" && (
              <div>
                {agendaDays.length === 0 ? (
                  <p className="text-sm py-8 text-center" style={{ color: "var(--text-muted)" }}>
                    No jobs scheduled in this range
                    {employeeFilter ? ` for ${employeeFilter}` : ""}.{" "}
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
                  </p>
                ) : (
                  <div className="space-y-5">
                    {agendaDays.map((key) => {
                      const dayJobs = filteredJobsByDate[key] || [];
                      const isToday = key === todayKey;
                      const heavy = isHeavy(key);
                      return (
                        <div key={key}>
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <button
                              onClick={() => setSelectedDate(key)}
                              style={{
                                background: isToday ? "rgba(249,115,22,0.15)" : "transparent",
                                border: `1px solid ${isToday ? "rgba(249,115,22,0.4)" : "var(--border-color)"}`,
                                borderRadius: "6px",
                                padding: "4px 12px",
                                cursor: "pointer",
                                color: isToday ? "var(--accent-orange)" : "var(--text-primary)",
                                fontWeight: 700,
                                fontSize: "13px",
                              }}
                            >
                              {isToday ? "Today · " : ""}
                              {formatShort(key)}
                            </button>
                            {heavy && (
                              <span
                                className="text-xs"
                                title={`Heavy day — ${counts[key]} jobs in total`}
                                style={{ color: "var(--warning)" }}
                              >
                                ⚠️ Heavy day
                              </span>
                            )}
                            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                              {dayJobs.length} job{dayJobs.length !== 1 ? "s" : ""}
                            </span>
                            <button
                              onClick={() => openAddFor(key)}
                              style={{
                                background: "none",
                                border: "none",
                                color: "var(--text-muted)",
                                fontSize: "12px",
                                cursor: "pointer",
                                padding: "2px 6px",
                              }}
                              title={`Add job on ${formatShort(key)}`}
                            >
                              ＋ Add
                            </button>
                          </div>
                          <div className="space-y-2">
                            {dayJobs.map((job) => (
                              <JobRow
                                key={job.id}
                                job={job}
                                onOpen={() => setDetailJob(job)}
                                onToggleComplete={toggleComplete}
                              />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
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
                    ? employeeFilter
                      ? `No tasks for ${employeeFilter} on this day.`
                      : "No tasks scheduled for this day."
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

            {selectedHeavy && (
              <div
                className="text-xs rounded-lg p-3 mb-4"
                style={{
                  background: "rgba(245,158,11,0.08)",
                  border: "1px solid rgba(245,158,11,0.3)",
                  color: "var(--warning)",
                }}
              >
                ⚠️ Heavy day — {counts[selectedDate]} jobs scheduled in total. Consider spreading
                work out.
              </div>
            )}

            {popupJobs.length > 0 && (
              <div className="space-y-2 mb-5" style={{ maxHeight: "260px", overflowY: "auto" }}>
                {popupJobs.map((job) => (
                  <JobRow
                    key={job.id}
                    job={job}
                    onOpen={() => {
                      setDayPopupOpen(false);
                      setDetailJob(job);
                    }}
                    onToggleComplete={toggleComplete}
                  />
                ))}
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
                  {detailJob.scheduledDate ? (
                    <>
                      📅 {formatLong(detailJob.scheduledDate)}
                      {detailJob.scheduledTime && <> · 🕐 {fmtTime(detailJob.scheduledTime)}</>}
                    </>
                  ) : (
                    "📥 Unscheduled"
                  )}
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
                    📞 <PhoneLink phone={detailJob.customer.phone} />
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
                    onClick={() => setEditJob(detailJob)}
                    className="dr-btn-primary flex-1"
                    style={{ justifyContent: "center" }}
                  >
                    ✏️ Edit
                  </button>
                  {detailJob.jobCompleted ? (
                    <button
                      onClick={() => toggleComplete(detailJob, false)}
                      className="dr-btn-secondary flex-1"
                      style={{ justifyContent: "center" }}
                    >
                      ↩ Reopen
                    </button>
                  ) : (
                    <button
                      onClick={() => toggleComplete(detailJob, true)}
                      className="dr-btn-success flex-1"
                      style={{ justifyContent: "center" }}
                    >
                      ✓ Mark Complete
                    </button>
                  )}
                </div>
                <div className="flex gap-4 justify-center mt-3">
                  <button
                    onClick={() => setConfirmDeleteId(detailJob.id)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "var(--danger)",
                      fontSize: "13px",
                      cursor: "pointer",
                      padding: "4px 8px",
                    }}
                  >
                    🗑️ Delete
                  </button>
                  {detailJob.scheduledDate && (
                    <button
                      onClick={() => unscheduleJob(detailJob)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--text-muted)",
                        fontSize: "13px",
                        cursor: "pointer",
                        padding: "4px 8px",
                      }}
                    >
                      📥 Unschedule
                    </button>
                  )}
                  {!detailJob.scheduledDate && (
                    <button
                      onClick={() => {
                        const id = detailJob.id;
                        setDetailJob(null);
                        scheduleJob(id, selectedDate);
                      }}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--accent-orange)",
                        fontSize: "13px",
                        fontWeight: 600,
                        cursor: "pointer",
                        padding: "4px 8px",
                      }}
                    >
                      📅 Schedule for {formatShort(selectedDate)}
                    </button>
                  )}
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
