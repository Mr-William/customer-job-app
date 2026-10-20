"use client";
import { useState } from "react";
import { hoursBetween } from "@/lib/time";

interface AddJobModalProps {
  customerId: number;
  customerName: string;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AddJobModal({
  customerId,
  customerName,
  onClose,
  onSuccess,
}: AddJobModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [employeeName, setEmployeeName] = useState("");
  const [totalHours, setTotalHours] = useState("");
  const [workCompleted, setWorkCompleted] = useState("");
  const [status, setStatus] = useState<"completed" | "partial" | "additional" | "">("");
  const [billStatus, setBillStatus] = useState<"sent" | "paid" | "">("");
  const [additionalDetails, setAdditionalDetails] = useState(
    "Materials used:\n\nAdditional notes:"
  );
  const [scheduledDate, setScheduledDate] = useState("");
  const [scheduledStartTime, setScheduledStartTime] = useState("");
  const [scheduledEndTime, setScheduledEndTime] = useState("");
  // Once the user types their own hours we stop overwriting them from the times.
  const [hoursEdited, setHoursEdited] = useState(false);

  const computedHours = hoursBetween(scheduledStartTime, scheduledEndTime);
  const invalidTimeRange =
    computedHours === null &&
    scheduledStartTime !== "" &&
    scheduledEndTime !== "";

  // Keep Total Hours in sync with the start/end boxes unless edited by hand.
  function syncHours(start: string, end: string) {
    if (hoursEdited) return;
    const hours = hoursBetween(start, end);
    if (hours !== null) setTotalHours(String(hours));
    else if (start === "" || end === "") setTotalHours("");
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
      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerId,
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
        setError(data.error || "Failed to add job.");
      } else {
        onSuccess();
        onClose();
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-content slide-in">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold" style={{ color: "var(--accent-orange)" }}>
              Add Job
            </h2>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              For: <span style={{ color: "var(--text-primary)" }}>{customerName}</span>
            </p>
          </div>
          <button
            onClick={onClose}
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

        {error && <div className="alert-error mb-4">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Employee Name */}
          <div>
            <label className="dr-label">Employee Name *</label>
            <input
              className="dr-input"
              type="text"
              placeholder="e.g. Mike Johnson"
              value={employeeName}
              onChange={(e) => setEmployeeName(e.target.value)}
              required
            />
          </div>

          {/* Total Hours */}
          <div>
            <label className="dr-label">Total Hours Worked *</label>
            <input
              className="dr-input"
              type="number"
              step="0.25"
              min="0"
              placeholder="e.g. 3.5"
              value={totalHours}
              onChange={(e) => {
                setTotalHours(e.target.value);
                setHoursEdited(true);
              }}
              required
            />
            {computedHours !== null && (
              <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
                Calculated from the start and end times — you can overwrite it.
              </p>
            )}
          </div>

          {/* Work Completed */}
          <div>
            <label className="dr-label">Work Completed *</label>
            <textarea
              className="dr-input"
              rows={3}
              placeholder="Describe the work that was completed..."
              value={workCompleted}
              onChange={(e) => setWorkCompleted(e.target.value)}
              required
              style={{ resize: "vertical" }}
            />
          </div>

          {/* Job Status Checkboxes */}
          <div>
            <label className="dr-label mb-3">Job Status *</label>
            <div className="space-y-3">
              {[
                { value: "completed", label: "Job Completed" },
                { value: "partial", label: "Job Partially Completed" },
                { value: "additional", label: "Additional Work Recommended" },
              ].map((opt) => (
                <label
                  key={opt.value}
                  className="flex items-center gap-3 cursor-pointer"
                  style={{
                    padding: "12px",
                    borderRadius: "8px",
                    border: `1px solid ${status === opt.value ? "rgba(249,115,22,0.5)" : "var(--border-color)"}`,
                    background: status === opt.value ? "rgba(249,115,22,0.08)" : "transparent",
                    transition: "all 0.15s",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={status === opt.value}
                    onChange={() => {
                      if (status === opt.value) {
                        setStatus("");
                        setBillStatus("");
                      } else {
                        setStatus(opt.value as typeof status);
                        if (opt.value !== "completed") setBillStatus("");
                      }
                    }}
                    style={{ accentColor: "var(--accent-orange)", width: "16px", height: "16px" }}
                  />
                  <span
                    className="font-medium text-sm"
                    style={{ color: status === opt.value ? "var(--accent-orange)" : "var(--text-primary)" }}
                  >
                    {opt.label}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Billing — only shown when Job Completed */}
          {status === "completed" && (
            <div
              className="fade-in"
              style={{
                padding: "16px",
                borderRadius: "8px",
                background: "rgba(34,197,94,0.05)",
                border: "1px solid rgba(34,197,94,0.2)",
              }}
            >
              <label className="dr-label mb-3" style={{ color: "var(--success)" }}>
                Billing Status
              </label>
              <div className="space-y-2">
                {[
                  { value: "sent", label: "Bill Sent" },
                  { value: "paid", label: "Bill Paid" },
                ].map((opt) => (
                  <label
                    key={opt.value}
                    className="flex items-center gap-3 cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="billStatus"
                      value={opt.value}
                      checked={billStatus === opt.value}
                      onChange={() => setBillStatus(opt.value as typeof billStatus)}
                      style={{ accentColor: "var(--success)", width: "16px", height: "16px" }}
                    />
                    <span className="text-sm" style={{ color: "var(--text-primary)" }}>
                      {opt.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Scheduled Date + Start/End Time */}
          <div>
            <label className="dr-label" htmlFor="add-job-scheduled-date">
              Scheduled Date{" "}
              <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
                (optional — shows on the calendar)
              </span>
            </label>
            <input
              id="add-job-scheduled-date"
              className="dr-input"
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
            />
            <div className="grid grid-cols-2 gap-4 mt-3">
              <div>
                <label className="dr-label" htmlFor="add-job-start-time">
                  Start Time{" "}
                  <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
                    (optional)
                  </span>
                </label>
                <input
                  id="add-job-start-time"
                  className="dr-input"
                  type="time"
                  value={scheduledStartTime}
                  onChange={(e) => handleStartChange(e.target.value)}
                />
              </div>
              <div>
                <label className="dr-label" htmlFor="add-job-end-time">
                  End Time{" "}
                  <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
                    (optional)
                  </span>
                </label>
                <input
                  id="add-job-end-time"
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
          </div>

          {/* Additional Details */}
          <div>
            <label className="dr-label">Additional Details</label>
            <textarea
              className="dr-input"
              rows={4}
              value={additionalDetails}
              onChange={(e) => setAdditionalDetails(e.target.value)}
              placeholder="Materials used, notes, etc."
              style={{ resize: "vertical" }}
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="dr-btn-secondary flex-1"
              style={{ justifyContent: "center" }}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="dr-btn-primary flex-1"
              disabled={loading || !status || invalidTimeRange}
              style={{ justifyContent: "center" }}
            >
              {loading ? "Saving..." : "Save Job"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
