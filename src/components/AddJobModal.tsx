"use client";
import { useState } from "react";

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
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
              onChange={(e) => setTotalHours(e.target.value)}
              required
            />
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
              disabled={loading || !status}
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
