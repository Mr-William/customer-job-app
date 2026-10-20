"use client";
import { useState } from "react";
import { hoursBetween } from "@/lib/time";

interface Job {
  id: number;
  employeeName: string;
  totalHoursWorked: number;
  workCompleted: string;
  jobCompleted: boolean;
  jobPartiallyCompleted: boolean;
  additionalWorkRecommended: boolean;
  billSent: boolean;
  billPaid: boolean;
  additionalDetails: string | null;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  scheduledEndTime?: string | null;
}

interface EditJobModalProps {
  job: Job;
  customerName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditJobModal({
  job,
  customerName,
  onClose,
  onSuccess,
}: EditJobModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const getInitialStatus = () => {
    if (job.jobCompleted) return "completed";
    if (job.jobPartiallyCompleted) return "partial";
    if (job.additionalWorkRecommended) return "additional";
    return "";
  };

  const getInitialBill = () => {
    if (job.billPaid) return "paid";
    if (job.billSent) return "sent";
    return "";
  };

  const [employeeName, setEmployeeName] = useState(job.employeeName);
  const [totalHours, setTotalHours] = useState(String(job.totalHoursWorked));
  const [workCompleted, setWorkCompleted] = useState(job.workCompleted);
  const [status, setStatus] = useState<"completed" | "partial" | "additional" | "">(
    getInitialStatus() as "completed" | "partial" | "additional" | ""
  );
  const [billStatus, setBillStatus] = useState<"sent" | "paid" | "">(
    getInitialBill() as "sent" | "paid" | ""
  );
  const [additionalDetails, setAdditionalDetails] = useState(
    job.additionalDetails || "Materials used:\n\nAdditional notes:"
  );
  const [scheduledDate, setScheduledDate] = useState(job.scheduledDate || "");
  const [scheduledStartTime, setScheduledStartTime] = useState(
    job.scheduledTime || ""
  );
  const [scheduledEndTime, setScheduledEndTime] = useState(
    job.scheduledEndTime || ""
  );
  // Track whether Total Hours is a hand-entered value we should leave alone.
  // Jobs saved without an end time are expected to get one filled in later, so
  // we allow the hours to be derived at that point. For jobs that already have
  // a full time range, only treat the hours as derived when they actually match
  // that range — otherwise keep whatever the user typed.
  const getInitialHoursEdited = () => {
    const storedStart = job.scheduledTime || "";
    const storedEnd = job.scheduledEndTime || "";
    if (!storedEnd) return false;
    const storedHours = hoursBetween(storedStart, storedEnd);
    if (storedHours === null) return true;
    return Math.abs(storedHours - job.totalHoursWorked) > 0.001;
  };
  const [hoursEdited, setHoursEdited] = useState(getInitialHoursEdited);

  const invalidTimeRange =
    scheduledStartTime !== "" &&
    scheduledEndTime !== "" &&
    hoursBetween(scheduledStartTime, scheduledEndTime) === null;

  // When an end time is filled in (or changed), sync Total Hours unless the
  // user already typed a value by hand. A blank end time never clears the
  // hours — they can be finished after the work is done.
  function syncHours(start: string, end: string) {
    if (hoursEdited) return;
    const hours = hoursBetween(start, end);
    if (hours !== null) setTotalHours(String(hours));
  }

  function handleStartChange(value: string) {
    setScheduledStartTime(value);
    syncHours(value, scheduledEndTime);
  }

  function handleEndChange(value: string) {
    setScheduledEndTime(value);
    syncHours(scheduledStartTime, value);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (invalidTimeRange) {
      setError("End time must be after start time.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeName,
          totalHoursWorked: parseFloat(totalHours),
          workCompleted,
          jobCompleted: status === "completed",
          jobPartiallyCompleted: status === "partial",
          additionalWorkRecommended: status === "additional",
          billSent: status === "completed" && (billStatus === "sent" || billStatus === "paid"),
          billPaid: status === "completed" && billStatus === "paid",
          additionalDetails,
          scheduledDate: scheduledDate || null,
          scheduledTime: scheduledStartTime || null,
          scheduledEndTime: scheduledEndTime || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to update job.");
      } else {
        onSuccess();
        onClose();
      }
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content slide-in">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold" style={{ color: "var(--accent-orange)" }}>
              Edit Job
            </h2>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              For: <span style={{ color: "var(--text-primary)" }}>{customerName}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            style={{
              background: "none", border: "none", color: "var(--text-muted)",
              fontSize: "22px", cursor: "pointer", lineHeight: 1, padding: "4px",
            }}
          >
            ×
          </button>
        </div>

        {error && <div className="alert-error mb-4">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="dr-label">Employee Name *</label>
            <input className="dr-input" type="text" value={employeeName}
              onChange={(e) => setEmployeeName(e.target.value)} required />
          </div>
          <div>
            <label className="dr-label">Total Hours Worked *</label>
            <input className="dr-input" type="number" step="0.25" min="0" value={totalHours}
              onChange={(e) => {
                setTotalHours(e.target.value);
                setHoursEdited(true);
              }} required />
            {hoursBetween(scheduledStartTime, scheduledEndTime) !== null &&
              !hoursEdited && (
                <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                  Calculated from the start and end times — you can overwrite it.
                </p>
              )}
          </div>
          <div>
            <label className="dr-label">Work Completed *</label>
            <textarea className="dr-input" rows={3} value={workCompleted}
              onChange={(e) => setWorkCompleted(e.target.value)} required style={{ resize: "vertical" }} />
          </div>

          <div>
            <label className="dr-label mb-3">Job Status *</label>
            <div className="space-y-3">
              {[
                { value: "completed", label: "Job Completed" },
                { value: "partial", label: "Job Partially Completed" },
                { value: "additional", label: "Additional Work Recommended" },
              ].map((opt) => (
                <label key={opt.value} className="flex items-center gap-3 cursor-pointer"
                  style={{
                    padding: "12px", borderRadius: "8px",
                    border: `1px solid ${status === opt.value ? "rgba(249,115,22,0.5)" : "var(--border-color)"}`,
                    background: status === opt.value ? "rgba(249,115,22,0.08)" : "transparent",
                    transition: "all 0.15s",
                  }}>
                  <input type="checkbox" checked={status === opt.value}
                    onChange={() => {
                      if (status === opt.value) { setStatus(""); setBillStatus(""); }
                      else { setStatus(opt.value as typeof status); if (opt.value !== "completed") setBillStatus(""); }
                    }}
                    style={{ accentColor: "var(--accent-orange)", width: "16px", height: "16px" }} />
                  <span className="font-medium text-sm"
                    style={{ color: status === opt.value ? "var(--accent-orange)" : "var(--text-primary)" }}>
                    {opt.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {status === "completed" && (
            <div className="fade-in" style={{ padding: "16px", borderRadius: "8px", background: "rgba(34,197,94,0.05)", border: "1px solid rgba(34,197,94,0.2)" }}>
              <label className="dr-label mb-3" style={{ color: "var(--success)" }}>Billing Status</label>
              <div className="space-y-2">
                {[{ value: "sent", label: "Bill Sent" }, { value: "paid", label: "Bill Paid" }].map((opt) => (
                  <label key={opt.value} className="flex items-center gap-3 cursor-pointer">
                    <input type="radio" name="billStatus" value={opt.value} checked={billStatus === opt.value}
                      onChange={() => setBillStatus(opt.value as typeof billStatus)}
                      style={{ accentColor: "var(--success)", width: "16px", height: "16px" }} />
                    <span className="text-sm" style={{ color: "var(--text-primary)" }}>{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="dr-label" htmlFor="edit-job-scheduled-date">
              Scheduled Date{" "}
              <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
                (optional — shows on the calendar; clear to unschedule)
              </span>
            </label>
            <input
              id="edit-job-scheduled-date"
              className="dr-input"
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-4 mt-3">
              <div>
                <label className="dr-label" htmlFor="edit-job-start-time">
                  Start Time{" "}
                  <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
                    (optional)
                  </span>
                </label>
                <input
                  id="edit-job-start-time"
                  className="dr-input"
                  type="time"
                  value={scheduledStartTime}
                  onChange={(e) => handleStartChange(e.target.value)}
                />
              </div>
              <div>
                <label className="dr-label" htmlFor="edit-job-end-time">
                  End Time{" "}
                  <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
                    (optional)
                  </span>
                </label>
                <input
                  id="edit-job-end-time"
                  className="dr-input"
                  type="time"
                  value={scheduledEndTime}
                  onChange={(e) => handleEndChange(e.target.value)}
                />
              </div>
            </div>
            {invalidTimeRange && (
              <p className="text-xs mt-1" style={{ color: "var(--danger, #ef4444)" }}>
                End time must be after the start time.
              </p>
            )}
            {!invalidTimeRange && scheduledEndTime === "" && (
              <p className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
                End time can be left blank and filled in once the work is finished.
              </p>
            )}
          </div>

          <div>
            <label className="dr-label">Additional Details</label>
            <textarea className="dr-input" rows={4} value={additionalDetails}
              onChange={(e) => setAdditionalDetails(e.target.value)}
              style={{ resize: "vertical" }} />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="dr-btn-secondary flex-1" style={{ justifyContent: "center" }}>
              Cancel
            </button>
            <button type="submit" className="dr-btn-primary flex-1" disabled={loading || !status} style={{ justifyContent: "center" }}>
              {loading ? "Saving..." : "Update Job"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
