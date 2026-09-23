"use client";
import { useState } from "react";

export interface CustomerOption {
  name: string;
  phone: string | null;
}

interface CalendarAddJobModalProps {
  /** Pre-selected day in YYYY-MM-DD format */
  date: string;
  /** Existing customers for name autocomplete + phone autofill */
  customerOptions: CustomerOption[];
  onClose: () => void;
  /** Called with the date the job was saved for, so the calendar can jump to it */
  onSuccess: (savedDate: string) => void;
}

export default function CalendarAddJobModal({
  date,
  customerOptions,
  onClose,
  onSuccess,
}: CalendarAddJobModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [scheduledDate, setScheduledDate] = useState(date);
  const [scheduledTime, setScheduledTime] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [jobAddress, setJobAddress] = useState("");
  const [employeeName, setEmployeeName] = useState("");
  const [workDetails, setWorkDetails] = useState("");

  // When the user picks an existing customer name, autofill their phone
  // (unless they already typed a phone number manually).
  function handleNameChange(value: string) {
    setCustomerName(value);
    if (!phoneTouched) {
      const match = customerOptions.find(
        (c) => c.name.toLowerCase() === value.trim().toLowerCase()
      );
      setPhone(match?.phone || "");
    }
  }

  const isExistingCustomer = customerOptions.some(
    (c) => c.name.toLowerCase() === customerName.trim().toLowerCase()
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledDate,
          scheduledTime: scheduledTime || undefined,
          customerName: customerName.trim(),
          phone: phone.trim() || undefined,
          jobAddress: jobAddress.trim() || undefined,
          workDetails: workDetails.trim(),
          employeeName: employeeName.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to schedule job.");
      } else {
        onSuccess(scheduledDate);
        onClose();
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-content slide-in">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold" style={{ color: "var(--accent-orange)" }}>
              ➕ Add New Job
            </h2>
            <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
              Schedule work for{" "}
              <span style={{ color: "var(--text-primary)" }}>{scheduledDate}</span>
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
          {/* Scheduled date + time */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="dr-label">Scheduled Date *</label>
              <input
                className="dr-input"
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="dr-label">
                Time{" "}
                <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
                  (optional)
                </span>
              </label>
              <input
                className="dr-input"
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
              />
            </div>
          </div>

          {/* Customer name with autocomplete */}
          <div>
            <label className="dr-label">Customer Name *</label>
            <input
              className="dr-input"
              type="text"
              placeholder="Start typing to match an existing customer…"
              list="calendar-customer-names"
              value={customerName}
              onChange={(e) => handleNameChange(e.target.value)}
              required
            />
            <datalist id="calendar-customer-names">
              {customerOptions.map((c) => (
                <option key={c.name} value={c.name}>
                  {c.phone || ""}
                </option>
              ))}
            </datalist>
            {customerName.trim() !== "" && (
              <p
                className="text-xs mt-1"
                style={{
                  color: isExistingCustomer
                    ? "var(--success)"
                    : "var(--accent-blue-light)",
                }}
              >
                {isExistingCustomer
                  ? "✓ Matched an existing customer — the job will be added to them."
                  : "＋ New customer — one will be created automatically."}
              </p>
            )}
          </div>

          {/* Optional phone */}
          <div>
            <label className="dr-label">
              Phone{" "}
              <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
                (optional)
              </span>
            </label>
            <input
              className="dr-input"
              type="tel"
              placeholder="e.g. (555) 123-4567"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setPhoneTouched(true);
              }}
            />
          </div>

          {/* Job info */}
          <div>
            <label className="dr-label">Job Information *</label>
            <textarea
              className="dr-input"
              rows={4}
              placeholder="Describe the work to be completed…"
              value={workDetails}
              onChange={(e) => setWorkDetails(e.target.value)}
              required
              style={{ resize: "vertical" }}
            />
          </div>

          {/* Optional extras */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="dr-label">
                Job Address{" "}
                <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
                  (new customers only)
                </span>
              </label>
              <input
                className="dr-input"
                type="text"
                placeholder="Optional"
                value={jobAddress}
                onChange={(e) => setJobAddress(e.target.value)}
              />
            </div>
            <div>
              <label className="dr-label">
                Assign Employee{" "}
                <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
                  (optional)
                </span>
              </label>
              <input
                className="dr-input"
                type="text"
                placeholder="Defaults to Unassigned"
                value={employeeName}
                onChange={(e) => setEmployeeName(e.target.value)}
              />
            </div>
          </div>

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
              disabled={loading}
              style={{ justifyContent: "center" }}
            >
              {loading ? "Saving…" : "Save Job"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
