"use client";
import { useEffect, useId, useMemo, useState, type KeyboardEvent } from "react";
import PhoneLink from "@/components/PhoneLink";
import AddressAutocomplete from "@/components/AddressAutocomplete";
import { matchesCustomerName } from "@/lib/customerName";
import { hoursBetween } from "@/lib/time";

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
  const [scheduledEndTime, setScheduledEndTime] = useState("");

  const invalidTimeRange =
    scheduledTime !== "" &&
    scheduledEndTime !== "" &&
    hoursBetween(scheduledTime, scheduledEndTime) === null;
  const [customerName, setCustomerName] = useState("");
  const [nameOpen, setNameOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const nameInputId = useId();
  const nameListId = `${nameInputId}-suggestions`;
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

  // Case-insensitive substring suggestions, like the Search page lookup:
  // "john", "JOHN", and "John" all match "John Smith".
  const nameSuggestions = useMemo(
    () => customerOptions.filter((c) => matchesCustomerName(c.name, customerName)).slice(0, 8),
    [customerOptions, customerName]
  );
  const showNameSuggestions = nameOpen && customerName.trim().length > 0 && nameSuggestions.length > 0;
  const activeOptionId =
    showNameSuggestions && nameSuggestions[activeIndex]
      ? `${nameListId}-${activeIndex}`
      : undefined;

  useEffect(() => {
    if (activeOptionId) document.getElementById(activeOptionId)?.scrollIntoView({ block: "nearest" });
  }, [activeOptionId]);

  function selectCustomer(option: CustomerOption) {
    setNameOpen(false);
    setActiveIndex(-1);
    handleNameChange(option.name);
  }

  function handleNameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape" && showNameSuggestions) {
      event.preventDefault();
      setNameOpen(false);
      setActiveIndex(-1);
    } else if (event.key === "Enter" && showNameSuggestions && nameSuggestions[activeIndex]) {
      event.preventDefault();
      selectCustomer(nameSuggestions[activeIndex]);
    } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!nameSuggestions.length) return;
      event.preventDefault();
      setNameOpen(true);
      if (event.key === "ArrowDown") {
        setActiveIndex((activeIndex + 1) % nameSuggestions.length);
      } else {
        setActiveIndex(
          activeIndex <= 0 ? nameSuggestions.length - 1 : activeIndex - 1
        );
      }
    }
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
      const res = await fetch("/api/calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledDate,
          scheduledTime: scheduledTime || undefined,
          scheduledEndTime: scheduledEndTime || undefined,
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
          {/* Scheduled date + start/end time */}
          <div>
            <label className="dr-label">Scheduled Date *</label>
            <input
              className="dr-input"
              type="date"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
              required
            />
            <div className="grid grid-cols-2 gap-4 mt-3">
              <div>
                <label className="dr-label">
                  Start Time{" "}
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
              <div>
                <label className="dr-label">
                  End Time{" "}
                  <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
                    (optional)
                  </span>
                </label>
                <input
                  className="dr-input"
                  type="time"
                  value={scheduledEndTime}
                  onChange={(e) => setScheduledEndTime(e.target.value)}
                />
              </div>
            </div>
            {invalidTimeRange && (
              <p className="text-xs mt-1" style={{ color: "var(--danger, #ef4444)" }}>
                End time must be after the start time.
              </p>
            )}
          </div>

          {/* Customer name with autocomplete */}
          <div>
            <label className="dr-label" htmlFor={nameInputId}>Customer Name *</label>
            <div className="relative">
              <input
                id={nameInputId}
                className="dr-input"
                type="text"
                placeholder="Start typing to match an existing customer…"
                autoComplete="off"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={showNameSuggestions}
                aria-controls={showNameSuggestions ? nameListId : undefined}
                aria-activedescendant={activeOptionId}
                value={customerName}
                onFocus={() => setNameOpen(true)}
                onBlur={() => { setNameOpen(false); setActiveIndex(-1); }}
                onKeyDown={handleNameKeyDown}
                onChange={(e) => { setActiveIndex(-1); setNameOpen(true); handleNameChange(e.target.value); }}
                required
              />
              {showNameSuggestions && (
                <div className="absolute z-20 mt-1 w-full rounded-lg border border-(--border-color) bg-(--bg-secondary) shadow-lg">
                  <ul id={nameListId} role="listbox" aria-label="Matching customers" className="max-h-60 overflow-y-auto">
                    {nameSuggestions.map((c, index) => (
                      <li key={`${c.name}-${c.phone ?? ""}-${index}`} role="presentation">
                        <button
                          type="button"
                          tabIndex={-1}
                          role="option"
                          id={`${nameListId}-${index}`}
                          aria-selected={activeIndex === index}
                          className="block w-full cursor-pointer rounded-md px-3 py-2 text-left text-sm aria-selected:bg-orange-500/15"
                          onMouseEnter={() => setActiveIndex(index)}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => selectCustomer(c)}
                        >
                          <span className="font-medium">{c.name}</span>
                          {c.phone && (
                            <span className="block text-xs text-(--text-secondary)">{c.phone}</span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
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
            {phone.trim() && (
              <div className="text-xs mt-1"><PhoneLink phone={phone} fallback={null} label="Call number" /></div>
            )}
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
              <label className="dr-label" htmlFor="calendar-job-address">
                Job Address{" "}
                <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>
                  (new customers only)
                </span>
              </label>
              <AddressAutocomplete
                id="calendar-job-address"
                placeholder="Optional"
                value={jobAddress}
                onChange={setJobAddress}
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
              disabled={loading || invalidTimeRange}
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
