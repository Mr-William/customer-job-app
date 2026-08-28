"use client";
import { useEffect, useState, useCallback } from "react";
import AddJobModal from "@/components/AddJobModal";
import EditJobModal from "@/components/EditJobModal";
import ImportCustomersModal from "@/components/ImportCustomersModal";
import { getDisplayName } from "@/lib/customerName";

interface Job {
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
  createdAt: string;
}

interface Customer {
  id: number;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  email: string | null;
  jobAddress: string;
  createdAt: string;
  jobs: Job[];
}

function JobStatusBadge({ job }: { job: Job }) {
  if (job.jobCompleted) return <span className="badge-success">✓ Completed</span>;
  if (job.jobPartiallyCompleted) return <span className="badge-warning">⚡ Partial</span>;
  if (job.additionalWorkRecommended) return <span className="badge-blue">+ Additional</span>;
  return <span className="badge-danger">— Pending</span>;
}

function BillingBadge({ job }: { job: Job }) {
  if (!job.jobCompleted) return null;
  if (job.billPaid) return <span className="badge-success">💰 Paid</span>;
  if (job.billSent) return <span className="badge-warning">📄 Sent</span>;
  return <span className="badge-danger">⚠ No Bill</span>;
}

function SortBtn({
  field,
  label,
  current,
  dir,
  onClick,
}: {
  field: "default" | "name" | "lastJob";
  label: string;
  current: string;
  dir: string;
  onClick: (field: "default" | "name" | "lastJob") => void;
}) {
  const active = current === field;
  return (
    <button
      onClick={() => onClick(field)}
      style={{
        background: active ? "rgba(249,115,22,0.15)" : "transparent",
        border: `1px solid ${active ? "rgba(249,115,22,0.4)" : "var(--border-color)"}`,
        borderRadius: "4px",
        padding: "4px 10px",
        cursor: "pointer",
        color: active ? "var(--accent-orange)" : "var(--text-secondary)",
        fontWeight: active ? 600 : 400,
        fontSize: "12px",
        transition: "all 0.15s",
      }}
    >
      {label} {active ? (dir === "asc" ? "↑" : "↓") : ""}
    </button>
  );
}

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [addJobCustomer, setAddJobCustomer] = useState<Customer | null>(null);
  const [editJob, setEditJob] = useState<{ job: Job; customerName: string } | null>(null);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [showImport, setShowImport] = useState(false);

  // Sort state
  const [sortField, setSortField] = useState<"default" | "name" | "lastJob">("default");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  function handleSort(field: "default" | "name" | "lastJob") {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir(field === "lastJob" ? "desc" : "asc");
    }
  }

  function getLastJobDate(customer: Customer): number {
    if (customer.jobs.length === 0) return 0;
    return Math.max(...customer.jobs.map((j) => new Date(j.createdAt).getTime()));
  }

  const sortedCustomers = [...customers].sort((a, b) => {
    let cmp = 0;
    if (sortField === "name") {
      cmp = getDisplayName(a).localeCompare(getDisplayName(b));
    } else if (sortField === "lastJob") {
      cmp = getLastJobDate(a) - getLastJobDate(b);
    }
    return sortDir === "asc" ? cmp : -cmp;
  });

  // Edit customer form state
  const [editName, setEditName] = useState("");
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState("");

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/customers");
      const data = await res.json();
      setCustomers(data.customers || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  function openEditCustomer(c: Customer) {
    setEditCustomer(c);
    setEditName(c.name || "");
    setEditFirstName(c.firstName || "");
    setEditLastName(c.lastName || "");
    setEditPhone(c.phone || "");
    setEditEmail(c.email || "");
    setEditAddress(c.jobAddress || "");
    setEditError("");
  }

  async function handleUpdateCustomer(e: React.FormEvent) {
    e.preventDefault();
    if (!editCustomer) return;
    setEditLoading(true);
    setEditError("");
    try {
      const res = await fetch(`/api/customers/${editCustomer.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName || null,
          firstName: editFirstName || null,
          lastName: editLastName || null,
          phone: editPhone,
          email: editEmail,
          jobAddress: editAddress,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setEditError(data.error || "Update failed.");
      } else {
        setEditCustomer(null);
        loadCustomers();
      }
    } catch {
      setEditError("Network error.");
    } finally {
      setEditLoading(false);
    }
  }

  async function handleDeleteCustomer(id: number) {
    await fetch(`/api/customers/${id}`, { method: "DELETE" });
    setDeleteConfirm(null);
    loadCustomers();
  }

  async function handleDeleteJob(jobId: number) {
    await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
    loadCustomers();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div
          className="inline-block w-8 h-8 border-2 rounded-full animate-spin"
          style={{ borderColor: "var(--accent-orange)", borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
            Customers
          </h1>
          <p style={{ color: "var(--text-muted)" }}>
            {customers.length} customer{customers.length !== 1 ? "s" : ""} total
          </p>
        </div>
         <div className="flex gap-3 flex-wrap items-center">
          <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
            <span>Sort:</span>
            <SortBtn field="default" label="Default" current={sortField} dir={sortDir} onClick={handleSort} />
            <SortBtn field="name" label="Name" current={sortField} dir={sortDir} onClick={handleSort} />
            <SortBtn field="lastJob" label="Last Job" current={sortField} dir={sortDir} onClick={handleSort} />
          </div>
          <button className="dr-btn-secondary" onClick={() => setShowImport(true)}>
            📂 Import Customers
          </button>
          <a href="/dashboard/customers/add" className="dr-btn-primary">
            ➕ Add Customer
          </a>
        </div>
      </div>

      {customers.length === 0 ? (
        <div className="dr-card text-center py-16">
          <div className="text-5xl mb-4">👥</div>
          <h3 className="text-lg font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>
            No customers yet
          </h3>
          <p className="mb-4" style={{ color: "var(--text-muted)" }}>
            Add your first customer or import from a spreadsheet.
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <button className="dr-btn-secondary" onClick={() => setShowImport(true)}>
              📂 Import Customers
            </button>
            <a href="/dashboard/customers/add" className="dr-btn-primary">
              ➕ Add Customer
            </a>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedCustomers.map((customer) => (
            <div key={customer.id} className="dr-card fade-in">
              {/* Customer Header */}
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
                      {getDisplayName(customer)}
                    </h3>
                    <span
                      className="text-xs px-2 py-1 rounded-full"
                      style={{
                        background: "rgba(249,115,22,0.1)",
                        color: "var(--accent-orange)",
                        border: "1px solid rgba(249,115,22,0.2)",
                      }}
                    >
                      {customer.jobs.length} job{customer.jobs.length !== 1 ? "s" : ""}
                    </span>
                  </div>
                  <div className="mt-2 space-y-1">
                    <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                      📞 {customer.phone || <span style={{ color: "var(--text-muted)" }}>No phone</span>}
                      {customer.email && <span className="ml-4">✉️ {customer.email}</span>}
                    </div>
                    <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                      📍 {customer.jobAddress || <span style={{ color: "var(--text-muted)" }}>No address</span>}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                  <button
                    className="dr-btn-secondary"
                    style={{ padding: "6px 12px", fontSize: "13px" }}
                    onClick={() => setExpandedId(expandedId === customer.id ? null : customer.id)}
                  >
                    {expandedId === customer.id ? "▲ Hide Jobs" : "▼ View Jobs"}
                  </button>
                  <button
                    className="dr-btn-primary"
                    style={{ padding: "6px 12px", fontSize: "13px" }}
                    onClick={() => setAddJobCustomer(customer)}
                  >
                    ➕ Add Job
                  </button>
                  <button
                    className="dr-btn-secondary"
                    style={{ padding: "6px 12px", fontSize: "13px" }}
                    onClick={() => openEditCustomer(customer)}
                  >
                    ✏️ Edit
                  </button>
                  <button
                    className="dr-btn-danger"
                    style={{ padding: "6px 12px", fontSize: "13px" }}
                    onClick={() => setDeleteConfirm(customer.id)}
                  >
                    🗑️
                  </button>
                </div>
              </div>

              {/* Jobs section */}
              {expandedId === customer.id && (
                <div className="mt-5 pt-5 fade-in" style={{ borderTop: "1px solid var(--border-color)" }}>
                  <h4 className="text-sm font-semibold mb-3" style={{ color: "var(--text-secondary)" }}>
                    Jobs for {getDisplayName(customer)}
                  </h4>
                  {customer.jobs.length === 0 ? (
                    <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                      No jobs yet. Click &quot;Add Job&quot; to create one.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {customer.jobs.map((job) => (
                        <div
                          key={job.id}
                          className="rounded-lg p-4"
                          style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border-color)" }}
                        >
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-2">
                                <span className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>
                                  👷 {job.employeeName}
                                </span>
                                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                                  ⏱ {job.totalHoursWorked}h
                                </span>
                                <JobStatusBadge job={job} />
                                <BillingBadge job={job} />
                              </div>
                              <p className="text-xs mb-1" style={{ color: "var(--text-secondary)" }}>
                                <strong>Work:</strong> {job.workCompleted}
                              </p>
                              {job.additionalDetails && (
                                <p className="text-xs" style={{ color: "var(--text-muted)", whiteSpace: "pre-wrap" }}>
                                  {job.additionalDetails}
                                </p>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <button
                                className="dr-btn-secondary"
                                style={{ padding: "5px 10px", fontSize: "12px" }}
                                onClick={() => setEditJob({ job, customerName: getDisplayName(customer) })}
                              >
                                ✏️ Edit
                              </button>
                              <button
                                className="dr-btn-danger"
                                style={{ padding: "5px 10px", fontSize: "12px" }}
                                onClick={() => handleDeleteJob(job.id)}
                              >
                                🗑️
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add Job Modal */}
      {addJobCustomer && (
        <AddJobModal
          customerId={addJobCustomer.id}
          customerName={getDisplayName(addJobCustomer)}
          onClose={() => setAddJobCustomer(null)}
          onSuccess={loadCustomers}
        />
      )}

      {/* Edit Job Modal */}
      {editJob && (
        <EditJobModal
          job={editJob.job}
          customerName={editJob.customerName}
          onClose={() => setEditJob(null)}
          onSuccess={loadCustomers}
        />
      )}

      {/* Edit Customer Modal */}
      {editCustomer && (
        <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setEditCustomer(null); }}>
          <div className="modal-content slide-in">
            <div className="flex items-start justify-between mb-6">
              <h2 className="text-xl font-bold" style={{ color: "var(--accent-orange)" }}>
                Edit Customer
              </h2>
              <button
                onClick={() => setEditCustomer(null)}
                style={{ background: "none", border: "none", color: "var(--text-muted)", fontSize: "22px", cursor: "pointer" }}
              >
                ×
              </button>
            </div>
            {editError && <div className="alert-error mb-4">{editError}</div>}
            <form onSubmit={handleUpdateCustomer} className="space-y-4">
              {/* Name or Business Name */}
              <div>
                <label className="dr-label">
                  Business / Full Name
                  <span style={{ color: "var(--text-muted)", fontWeight: 400 }}> (if business or single name)</span>
                </label>
                <input
                  className="dr-input"
                  placeholder="e.g. Acme Corp or John Smith"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                />
              </div>
              <div
                className="flex items-center gap-2"
                style={{ color: "var(--text-muted)", fontSize: "12px" }}
              >
                <div style={{ flex: 1, height: "1px", background: "var(--border-color)" }} />
                <span>or split first / last</span>
                <div style={{ flex: 1, height: "1px", background: "var(--border-color)" }} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="dr-label">First Name</label>
                  <input className="dr-input" value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} placeholder="John" />
                </div>
                <div>
                  <label className="dr-label">Last Name</label>
                  <input className="dr-input" value={editLastName} onChange={(e) => setEditLastName(e.target.value)} placeholder="Smith" />
                </div>
              </div>
              <div>
                <label className="dr-label">Phone *</label>
                <input className="dr-input" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} required />
              </div>
              <div>
                <label className="dr-label">Email (optional)</label>
                <input className="dr-input" type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} />
              </div>
              <div>
                <label className="dr-label">Job Address *</label>
                <textarea
                  className="dr-input"
                  rows={2}
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  required
                  style={{ resize: "vertical" }}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditCustomer(null)} className="dr-btn-secondary flex-1" style={{ justifyContent: "center" }}>
                  Cancel
                </button>
                <button type="submit" className="dr-btn-primary flex-1" disabled={editLoading} style={{ justifyContent: "center" }}>
                  {editLoading ? "Saving..." : "Update Customer"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Import Modal */}
      {showImport && (
        <ImportCustomersModal
          onClose={() => setShowImport(false)}
          onSuccess={loadCustomers}
        />
      )}

      {/* Delete Confirm Modal */}
      {deleteConfirm !== null && (
        <div className="modal-overlay">
          <div className="modal-content slide-in" style={{ maxWidth: "400px" }}>
            <h2 className="text-xl font-bold mb-3" style={{ color: "var(--danger)" }}>
              Delete Customer?
            </h2>
            <p className="mb-6" style={{ color: "var(--text-secondary)" }}>
              This will permanently delete this customer and all their jobs. This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="dr-btn-secondary flex-1" style={{ justifyContent: "center" }}>
                Cancel
              </button>
              <button
                onClick={() => handleDeleteCustomer(deleteConfirm)}
                className="dr-btn-danger flex-1"
                style={{ justifyContent: "center", background: "var(--danger)", color: "white" }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
