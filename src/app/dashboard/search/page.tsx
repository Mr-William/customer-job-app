"use client";
import { useState, useCallback } from "react";
import EditJobModal from "@/components/EditJobModal";
import AddJobModal from "@/components/AddJobModal";
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

type SortField = "name" | "phone" | "jobs" | "date";
type SortDir = "asc" | "desc";

function getJobStatus(jobs: Job[]) {
  if (jobs.some((j) => j.jobCompleted)) return "Completed";
  if (jobs.some((j) => j.jobPartiallyCompleted)) return "Partial";
  if (jobs.some((j) => j.additionalWorkRecommended)) return "Additional";
  return "Pending";
}

function getBillStatus(jobs: Job[]) {
  if (jobs.some((j) => j.billPaid)) return "Paid";
  if (jobs.some((j) => j.billSent)) return "Sent";
  return "None";
}

export default function SearchPage() {
  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [billFilter, setBillFilter] = useState("");
  const [results, setResults] = useState<Customer[]>([]);
  const [searched, setSearched] = useState(false);
  const [loading, setLoading] = useState(false);

  const [sortField, setSortField] = useState<SortField>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editJob, setEditJob] = useState<{ job: Job; customerName: string } | null>(null);
  const [addJobCustomer, setAddJobCustomer] = useState<Customer | null>(null);

  // Edit customer inline
  const [editCustomerId, setEditCustomerId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({
    name: "", firstName: "", lastName: "", phone: "", email: "", jobAddress: "",
  });
  const [editLoading, setEditLoading] = useState(false);

  const doSearch = useCallback(async () => {
    setLoading(true);
    setSearched(true);
    try {
      const params = new URLSearchParams();
      if (searchText) params.set("search", searchText);
      if (statusFilter) params.set("status", statusFilter);
      if (billFilter) params.set("bill", billFilter);
      const res = await fetch(`/api/customers?${params}`);
      const data = await res.json();
      setResults(data.customers || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [searchText, statusFilter, billFilter]);

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortDir("asc");
    }
  }

  const sorted = [...results].sort((a, b) => {
    let cmp = 0;
    if (sortField === "name") cmp = getDisplayName(a).localeCompare(getDisplayName(b));
    else if (sortField === "phone") cmp = (a.phone || "").localeCompare(b.phone || "");
    else if (sortField === "jobs") cmp = a.jobs.length - b.jobs.length;
    else if (sortField === "date") cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    return sortDir === "asc" ? cmp : -cmp;
  });

  function SortBtn({ field, label }: { field: SortField; label: string }) {
    const active = sortField === field;
    return (
      <button
        onClick={() => handleSort(field)}
        className="flex items-center gap-1"
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: active ? "var(--accent-orange)" : "var(--text-secondary)",
          fontWeight: active ? 600 : 500,
          fontSize: "12px", textTransform: "uppercase", letterSpacing: "0.05em",
          padding: "0",
        }}
      >
        {label} {active ? (sortDir === "asc" ? "↑" : "↓") : "↕"}
      </button>
    );
  }

  async function startEditCustomer(c: Customer) {
    setEditCustomerId(c.id);
    setEditForm({
      name: c.name || "",
      firstName: c.firstName || "",
      lastName: c.lastName || "",
      phone: c.phone || "",
      email: c.email || "",
      jobAddress: c.jobAddress || "",
    });
  }

  async function saveEditCustomer(id: number) {
    setEditLoading(true);
    try {
      const res = await fetch(`/api/customers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        setEditCustomerId(null);
        doSearch();
      }
    } finally {
      setEditLoading(false);
    }
  }

  async function handleDeleteJob(jobId: number) {
    await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
    doSearch();
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
          Search Customers
        </h1>
        <p style={{ color: "var(--text-muted)" }}>
          Filter by name, phone, job status, or billing status.
        </p>
      </div>

      {/* Search Panel */}
      <div className="dr-card mb-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="dr-label">Name or Phone</label>
            <input
              className="dr-input"
              placeholder="Search name or phone..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
            />
          </div>
          <div>
            <label className="dr-label">Job Status</label>
            <select
              className="dr-input"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ cursor: "pointer" }}
            >
              <option value="">All Statuses</option>
              <option value="completed">Job Completed</option>
              <option value="partial">Job Partially Completed</option>
              <option value="additional">Additional Work Recommended</option>
            </select>
          </div>
          <div>
            <label className="dr-label">Billing Status</label>
            <select
              className="dr-input"
              value={billFilter}
              onChange={(e) => setBillFilter(e.target.value)}
              style={{ cursor: "pointer" }}
            >
              <option value="">All Billing</option>
              <option value="sent">Bill Sent</option>
              <option value="paid">Bill Paid</option>
              <option value="outstanding">Outstanding (Sent, Not Paid)</option>
            </select>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={doSearch} className="dr-btn-primary" disabled={loading}>
            {loading ? "Searching..." : "🔍 Search"}
          </button>
          <button
            onClick={() => {
              setSearchText(""); setStatusFilter(""); setBillFilter("");
              setResults([]); setSearched(false);
            }}
            className="dr-btn-secondary"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Results */}
      {searched && (
        <div className="fade-in">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold" style={{ color: "var(--text-secondary)" }}>
              Results <span style={{ color: "var(--accent-orange)" }}>({sorted.length})</span>
            </h2>
            <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-muted)" }}>
              Sort by:
              <SortBtn field="name" label="Name" />
              <SortBtn field="phone" label="Phone" />
              <SortBtn field="jobs" label="Jobs" />
              <SortBtn field="date" label="Date" />
            </div>
          </div>

          {sorted.length === 0 ? (
            <div className="dr-card text-center py-10">
              <div className="text-4xl mb-3">🔍</div>
              <p style={{ color: "var(--text-muted)" }}>No customers match your search.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {sorted.map((customer) => (
                <div key={customer.id} className="dr-card">
                  {editCustomerId === customer.id ? (
                    /* Inline edit form */
                    <div>
                      <h3 className="font-semibold mb-4" style={{ color: "var(--accent-orange)" }}>
                        Editing: {getDisplayName(customer)}
                      </h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
                        <div className="sm:col-span-2">
                          <label className="dr-label">Business / Full Name</label>
                          <input className="dr-input" value={editForm.name} placeholder="e.g. Acme Corp"
                            onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} />
                        </div>
                        <div>
                          <label className="dr-label">First Name</label>
                          <input className="dr-input" value={editForm.firstName} placeholder="John"
                            onChange={(e) => setEditForm((f) => ({ ...f, firstName: e.target.value }))} />
                        </div>
                        <div>
                          <label className="dr-label">Last Name</label>
                          <input className="dr-input" value={editForm.lastName} placeholder="Smith"
                            onChange={(e) => setEditForm((f) => ({ ...f, lastName: e.target.value }))} />
                        </div>
                        <div>
                          <label className="dr-label">Phone</label>
                          <input className="dr-input" value={editForm.phone}
                            onChange={(e) => setEditForm((f) => ({ ...f, phone: e.target.value }))} />
                        </div>
                        <div>
                          <label className="dr-label">Email</label>
                          <input className="dr-input" value={editForm.email}
                            onChange={(e) => setEditForm((f) => ({ ...f, email: e.target.value }))} />
                        </div>
                        <div className="sm:col-span-2">
                          <label className="dr-label">Job Address</label>
                          <input className="dr-input" value={editForm.jobAddress}
                            onChange={(e) => setEditForm((f) => ({ ...f, jobAddress: e.target.value }))} />
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <button onClick={() => setEditCustomerId(null)} className="dr-btn-secondary">Cancel</button>
                        <button onClick={() => saveEditCustomer(customer.id)} className="dr-btn-primary" disabled={editLoading}>
                          {editLoading ? "Saving..." : "Save Changes"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Normal customer row */
                    <>
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 flex-wrap mb-2">
                            <h3 className="font-bold text-lg" style={{ color: "var(--text-primary)" }}>
                              {getDisplayName(customer)}
                            </h3>
                            <span className="text-xs px-2 py-0.5 rounded"
                              style={{ background: "rgba(249,115,22,0.1)", color: "var(--accent-orange)", border: "1px solid rgba(249,115,22,0.2)" }}>
                              {customer.jobs.length} job{customer.jobs.length !== 1 ? "s" : ""}
                            </span>
                            <StatusPill status={getJobStatus(customer.jobs)} />
                            <BillPill bill={getBillStatus(customer.jobs)} />
                          </div>
                          <div className="text-sm space-y-1" style={{ color: "var(--text-secondary)" }}>
                            <div>📞 {customer.phone || <span style={{ color: "var(--text-muted)" }}>No phone</span>}{customer.email && <span className="ml-4">✉️ {customer.email}</span>}</div>
                            <div>📍 {customer.jobAddress || <span style={{ color: "var(--text-muted)" }}>No address</span>}</div>
                          </div>
                        </div>
                        <div className="flex gap-2 flex-wrap">
                          <button className="dr-btn-secondary" style={{ padding: "6px 12px", fontSize: "13px" }}
                            onClick={() => setExpandedId(expandedId === customer.id ? null : customer.id)}>
                            {expandedId === customer.id ? "▲" : "▼"} Jobs
                          </button>
                          <button className="dr-btn-primary" style={{ padding: "6px 12px", fontSize: "13px" }}
                            onClick={() => setAddJobCustomer(customer)}>
                            ➕ Job
                          </button>
                          <button className="dr-btn-secondary" style={{ padding: "6px 12px", fontSize: "13px" }}
                            onClick={() => startEditCustomer(customer)}>
                            ✏️ Edit
                          </button>
                        </div>
                      </div>

                      {/* Jobs */}
                      {expandedId === customer.id && (
                        <div className="mt-4 pt-4 fade-in" style={{ borderTop: "1px solid var(--border-color)" }}>
                          {customer.jobs.length === 0 ? (
                            <p className="text-sm" style={{ color: "var(--text-muted)" }}>No jobs recorded.</p>
                          ) : (
                            <div className="space-y-3">
                              {customer.jobs.map((job) => (
                                <div key={job.id} className="rounded-lg p-4"
                                  style={{ background: "var(--bg-tertiary)", border: "1px solid var(--border-color)" }}>
                                  <div className="flex items-start justify-between gap-2 flex-wrap">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap mb-1">
                                        <span className="font-medium text-sm" style={{ color: "var(--text-primary)" }}>
                                          👷 {job.employeeName}
                                        </span>
                                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>⏱ {job.totalHoursWorked}h</span>
                                        <JobStatusBadge job={job} />
                                        <BillingBadge job={job} />
                                      </div>
                                      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                                        <strong>Work:</strong> {job.workCompleted}
                                      </p>
                                    </div>
                                    <div className="flex gap-2">
                                      <button className="dr-btn-secondary" style={{ padding: "4px 10px", fontSize: "12px" }}
                                        onClick={() => setEditJob({ job, customerName: `${customer.firstName} ${customer.lastName}` })}>
                                        ✏️ Edit
                                      </button>
                                      <button className="dr-btn-danger" style={{ padding: "4px 10px", fontSize: "12px" }}
                                        onClick={() => handleDeleteJob(job.id)}>
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
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {editJob && (
        <EditJobModal job={editJob.job} customerName={editJob.customerName}
          onClose={() => setEditJob(null)} onSuccess={doSearch} />
      )}
      {addJobCustomer && (
        <AddJobModal customerId={addJobCustomer.id}
          customerName={getDisplayName(addJobCustomer)}
          onClose={() => setAddJobCustomer(null)} onSuccess={doSearch} />
      )}
    </div>
  );
}

function JobStatusBadge({ job }: { job: Job }) {
  if (job.jobCompleted) return <span className="badge-success">✓ Completed</span>;
  if (job.jobPartiallyCompleted) return <span className="badge-warning">⚡ Partial</span>;
  if (job.additionalWorkRecommended) return <span className="badge-blue">+ Additional</span>;
  return null;
}

function BillingBadge({ job }: { job: Job }) {
  if (!job.jobCompleted) return null;
  if (job.billPaid) return <span className="badge-success">💰 Paid</span>;
  if (job.billSent) return <span className="badge-warning">📄 Sent</span>;
  return <span className="badge-danger">⚠ No Bill</span>;
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    Completed: "badge-success",
    Partial: "badge-warning",
    Additional: "badge-blue",
    Pending: "badge-danger",
  };
  return <span className={map[status] || "badge-danger"}>{status}</span>;
}

function BillPill({ bill }: { bill: string }) {
  if (bill === "None") return null;
  const map: Record<string, string> = { Paid: "badge-success", Sent: "badge-warning" };
  return <span className={map[bill] || "badge-danger"}>💰 {bill}</span>;
}
