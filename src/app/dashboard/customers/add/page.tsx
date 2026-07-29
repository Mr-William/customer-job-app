"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import AddJobModal from "@/components/AddJobModal";

export default function AddCustomerPage() {
  const router = useRouter();

  const [nameMode, setNameMode] = useState<"split" | "single">("split");
  const [name, setName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [jobAddress, setJobAddress] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [savedCustomer, setSavedCustomer] = useState<{ id: number; name: string } | null>(null);
  const [showJobModal, setShowJobModal] = useState(false);
  const [jobCount, setJobCount] = useState(0);

  const hasName =
    nameMode === "single" ? name.trim() !== "" : firstName.trim() !== "" || lastName.trim() !== "";

  const isFormValid = hasName && jobAddress.trim() !== "";

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const payload =
        nameMode === "single"
          ? { name, firstName: null, lastName: null, phone, email, jobAddress }
          : { name: null, firstName, lastName, phone, email, jobAddress };

      const res = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save customer.");
      } else {
        const c = data.customer;
        const displayName =
          c.name || [c.firstName, c.lastName].filter(Boolean).join(" ") || "Customer";
        setSuccess(true);
        setSavedCustomer({ id: c.id, name: displayName });
      }
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setName("");
    setFirstName("");
    setLastName("");
    setPhone("");
    setEmail("");
    setJobAddress("");
    setSuccess(false);
    setSavedCustomer(null);
    setJobCount(0);
    setNameMode("split");
  }

  if (success && savedCustomer) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="dr-card text-center py-10 fade-in">
          <div className="text-5xl mb-4">✅</div>
          <h2 className="text-2xl font-bold mb-2" style={{ color: "var(--success)" }}>
            Customer Saved!
          </h2>
          <p className="mb-2" style={{ color: "var(--text-secondary)" }}>
            <strong style={{ color: "var(--text-primary)" }}>{savedCustomer.name}</strong> has been added.
          </p>
          {jobCount > 0 && (
            <p className="text-sm mb-6" style={{ color: "var(--text-muted)" }}>
              {jobCount} job{jobCount > 1 ? "s" : ""} added.
            </p>
          )}
          <div className="flex flex-wrap gap-3 justify-center mt-6">
            <button className="dr-btn-primary" onClick={() => setShowJobModal(true)}>
              ➕ Add Job for Customer
            </button>
            <button className="dr-btn-secondary" onClick={() => router.push("/dashboard/customers")}>
              View All Customers
            </button>
            <button className="dr-btn-secondary" onClick={resetForm}>
              Add Another Customer
            </button>
          </div>
        </div>

        {showJobModal && (
          <AddJobModal
            customerId={savedCustomer.id}
            customerName={savedCustomer.name}
            onClose={() => setShowJobModal(false)}
            onSuccess={() => setJobCount((c) => c + 1)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
          Add Customer
        </h1>
        <p style={{ color: "var(--text-muted)" }}>
          Fill in the customer&apos;s details below. Required fields are marked with *.
        </p>
      </div>

      {error && <div className="alert-error mb-4">{error}</div>}

      <div className="dr-card fade-in">
        <form onSubmit={handleSave} className="space-y-5">

          {/* Name mode toggle */}
          <div>
            <label className="dr-label mb-2">Customer Name *</label>
            <div
              className="flex rounded-lg mb-4 overflow-hidden"
              style={{ background: "var(--bg-primary)", border: "1px solid var(--border-color)" }}
            >
              <button
                type="button"
                onClick={() => setNameMode("split")}
                className="flex-1 py-2 text-sm font-medium transition-all"
                style={{
                  background: nameMode === "split" ? "var(--accent-orange)" : "transparent",
                  color: nameMode === "split" ? "white" : "var(--text-secondary)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                👤 First / Last Name
              </button>
              <button
                type="button"
                onClick={() => setNameMode("single")}
                className="flex-1 py-2 text-sm font-medium transition-all"
                style={{
                  background: nameMode === "single" ? "var(--accent-orange)" : "transparent",
                  color: nameMode === "single" ? "white" : "var(--text-secondary)",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                🏢 Business / Full Name
              </button>
            </div>

            {nameMode === "split" ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="dr-label">First Name</label>
                  <input
                    className="dr-input"
                    type="text"
                    placeholder="John"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="dr-label">Last Name</label>
                  <input
                    className="dr-input"
                    type="text"
                    placeholder="Smith"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="dr-label">Business or Full Name</label>
                <input
                  className="dr-input"
                  type="text"
                  placeholder="e.g. Acme Corp or John Smith"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* Phone */}
          <div>
            <label className="dr-label">
              Phone Number{" "}
              <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(optional)</span>
            </label>
            <input
              className="dr-input"
              type="tel"
              placeholder="(314) 555-0100"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </div>

          {/* Email */}
          <div>
            <label className="dr-label">
              Email Address{" "}
              <span style={{ color: "var(--text-muted)", fontWeight: 400 }}>(optional)</span>
            </label>
            <input
              className="dr-input"
              type="email"
              placeholder="customer@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          {/* Job Address */}
          <div>
            <label className="dr-label">Job Address *</label>
            <textarea
              className="dr-input"
              rows={2}
              placeholder="123 Main St, St. Louis, MO 63101"
              value={jobAddress}
              onChange={(e) => setJobAddress(e.target.value)}
              required
              style={{ resize: "vertical" }}
            />
          </div>

          <div style={{ borderTop: "1px solid var(--border-color)" }} />

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              className="dr-btn-primary"
              disabled={loading || !isFormValid}
            >
              {loading ? "Saving..." : "💾 Save Customer"}
            </button>
            <button
              type="button"
              className="dr-btn-secondary"
              onClick={() => router.push("/dashboard")}
            >
              Cancel
            </button>
          </div>

          {!isFormValid && (
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              * Please fill in all required fields before saving.
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
