"use client";
import { useEffect, useState } from "react";

interface Metrics {
  totalCustomers: number;
  totalJobs: number;
  completedJobs: number;
  partialJobs: number;
  additionalJobs: number;
  billsSent: number;
  billsPaid: number;
  outstandingBills: number;
}

function MetricCard({
  label,
  value,
  icon,
  color,
  sublabel,
}: {
  label: string;
  value: number;
  icon: string;
  color: string;
  sublabel?: string;
}) {
  return (
    <div
      className="dr-card text-center"
      style={{ borderBottom: `3px solid ${color}` }}
    >
      <div className="text-4xl mb-3">{icon}</div>
      <div
        className="text-4xl font-bold mb-1"
        style={{ color }}
      >
        {value}
      </div>
      <div className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>
        {label}
      </div>
      {sublabel && (
        <div className="text-xs" style={{ color: "var(--text-muted)" }}>
          {sublabel}
        </div>
      )}
    </div>
  );
}

function ProgressBar({
  label,
  value,
  total,
  color,
}: {
  label: string;
  value: number;
  total: number;
  color: string;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
          {label}
        </span>
        <span className="text-sm" style={{ color }}>
          {value} / {total} ({pct}%)
        </span>
      </div>
      <div
        className="w-full rounded-full"
        style={{
          height: "8px",
          background: "var(--bg-tertiary)",
          border: "1px solid var(--border-color)",
        }}
      >
        <div
          className="rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            height: "100%",
            background: color,
            minWidth: pct > 0 ? "8px" : "0",
          }}
        />
      </div>
    </div>
  );
}

export default function MetricsPage() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/metrics")
      .then((r) => r.json())
      .then((data) => {
        setMetrics(data);
        setLoading(false);
      })
      .catch(console.error);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div
          className="inline-block w-8 h-8 border-2 rounded-full animate-spin"
          style={{
            borderColor: "var(--accent-orange)",
            borderTopColor: "transparent",
          }}
        />
      </div>
    );
  }

  if (!metrics) return null;

  const completionRate =
    metrics.totalJobs > 0
      ? Math.round((metrics.completedJobs / metrics.totalJobs) * 100)
      : 0;
  const collectionRate =
    metrics.billsSent > 0
      ? Math.round((metrics.billsPaid / metrics.billsSent) * 100)
      : 0;

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
          Metrics & Reports
        </h1>
        <p style={{ color: "var(--text-muted)" }}>
          Business performance overview for Digital Revolution Job Tracker.
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <MetricCard
          label="Total Customers"
          value={metrics.totalCustomers}
          icon="👥"
          color="var(--accent-orange)"
          sublabel="All time"
        />
        <MetricCard
          label="Total Jobs"
          value={metrics.totalJobs}
          icon="🔧"
          color="var(--accent-blue-light)"
          sublabel="All recorded"
        />
        <MetricCard
          label="Bills Sent"
          value={metrics.billsSent}
          icon="📄"
          color="var(--warning)"
          sublabel="Invoiced"
        />
        <MetricCard
          label="Bills Paid"
          value={metrics.billsPaid}
          icon="💰"
          color="var(--success)"
          sublabel="Collected"
        />
      </div>

      {/* Two column layout */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {/* Job Breakdown */}
        <div className="dr-card">
          <h2
            className="text-lg font-semibold mb-6"
            style={{ color: "var(--text-primary)" }}
          >
            📊 Job Status Breakdown
          </h2>
          <ProgressBar
            label="Completed Jobs"
            value={metrics.completedJobs}
            total={metrics.totalJobs}
            color="var(--success)"
          />
          <ProgressBar
            label="Partially Completed"
            value={metrics.partialJobs}
            total={metrics.totalJobs}
            color="var(--warning)"
          />
          <ProgressBar
            label="Additional Work Recommended"
            value={metrics.additionalJobs}
            total={metrics.totalJobs}
            color="var(--accent-blue-light)"
          />

          <div
            className="mt-4 pt-4 text-center"
            style={{ borderTop: "1px solid var(--border-color)" }}
          >
            <div
              className="text-3xl font-bold"
              style={{ color: "var(--success)" }}
            >
              {completionRate}%
            </div>
            <div
              className="text-sm"
              style={{ color: "var(--text-muted)" }}
            >
              Job Completion Rate
            </div>
          </div>
        </div>

        {/* Billing Breakdown */}
        <div className="dr-card">
          <h2
            className="text-lg font-semibold mb-6"
            style={{ color: "var(--text-primary)" }}
          >
            💳 Billing Overview
          </h2>
          <ProgressBar
            label="Bills Sent"
            value={metrics.billsSent}
            total={metrics.completedJobs}
            color="var(--warning)"
          />
          <ProgressBar
            label="Bills Paid"
            value={metrics.billsPaid}
            total={metrics.billsSent}
            color="var(--success)"
          />
          <ProgressBar
            label="Outstanding Bills"
            value={metrics.outstandingBills}
            total={metrics.billsSent}
            color="var(--danger)"
          />

          <div
            className="mt-4 pt-4"
            style={{ borderTop: "1px solid var(--border-color)" }}
          >
            <div className="flex items-center justify-between">
              <div className="text-center flex-1">
                <div
                  className="text-2xl font-bold"
                  style={{ color: "var(--success)" }}
                >
                  {collectionRate}%
                </div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Collection Rate
                </div>
              </div>
              <div
                style={{ width: "1px", height: "40px", background: "var(--border-color)" }}
              />
              <div className="text-center flex-1">
                <div
                  className="text-2xl font-bold"
                  style={{ color: "var(--danger)" }}
                >
                  {metrics.outstandingBills}
                </div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Outstanding
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Summary table */}
      <div className="dr-card">
        <h2
          className="text-lg font-semibold mb-4"
          style={{ color: "var(--text-primary)" }}
        >
          📋 Summary Table
        </h2>
        <div className="overflow-x-auto">
          <table className="dr-table">
            <thead>
              <tr>
                <th>Metric</th>
                <th>Value</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Total Customers</td>
                <td style={{ color: "var(--accent-orange)", fontWeight: 600 }}>{metrics.totalCustomers}</td>
                <td style={{ color: "var(--text-muted)", fontSize: "13px" }}>All registered customers</td>
              </tr>
              <tr>
                <td>Total Jobs</td>
                <td style={{ color: "var(--accent-blue-light)", fontWeight: 600 }}>{metrics.totalJobs}</td>
                <td style={{ color: "var(--text-muted)", fontSize: "13px" }}>Across all customers</td>
              </tr>
              <tr>
                <td>Completed Jobs</td>
                <td style={{ color: "var(--success)", fontWeight: 600 }}>{metrics.completedJobs}</td>
                <td style={{ color: "var(--text-muted)", fontSize: "13px" }}>{completionRate}% completion rate</td>
              </tr>
              <tr>
                <td>Partially Completed</td>
                <td style={{ color: "var(--warning)", fontWeight: 600 }}>{metrics.partialJobs}</td>
                <td style={{ color: "var(--text-muted)", fontSize: "13px" }}>Jobs in progress</td>
              </tr>
              <tr>
                <td>Additional Work Recommended</td>
                <td style={{ color: "var(--accent-blue-light)", fontWeight: 600 }}>{metrics.additionalJobs}</td>
                <td style={{ color: "var(--text-muted)", fontSize: "13px" }}>Follow-up opportunities</td>
              </tr>
              <tr>
                <td>Bills Sent</td>
                <td style={{ color: "var(--warning)", fontWeight: 600 }}>{metrics.billsSent}</td>
                <td style={{ color: "var(--text-muted)", fontSize: "13px" }}>Invoiced to customers</td>
              </tr>
              <tr>
                <td>Bills Paid</td>
                <td style={{ color: "var(--success)", fontWeight: 600 }}>{metrics.billsPaid}</td>
                <td style={{ color: "var(--text-muted)", fontSize: "13px" }}>Revenue collected</td>
              </tr>
              <tr>
                <td>Outstanding Bills</td>
                <td style={{ color: "var(--danger)", fontWeight: 600 }}>{metrics.outstandingBills}</td>
                <td style={{ color: "var(--text-muted)", fontSize: "13px" }}>Sent but not yet paid</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
