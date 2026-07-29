"use client";
import { useEffect, useState } from "react";
import Link from "next/link";

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

const quickActions = [
  {
    href: "/dashboard/customers/add",
    icon: "➕",
    label: "Add Customer",
    desc: "Create a new customer profile with contact & address details.",
    color: "var(--accent-orange)",
  },
  {
    href: "/dashboard/customers",
    icon: "👥",
    label: "View Customers",
    desc: "Browse all customers and their associated jobs.",
    color: "var(--accent-blue-light)",
  },
  {
    href: "/dashboard/search",
    icon: "🔍",
    label: "Search",
    desc: "Find customers by name, phone, status, or billing.",
    color: "#a78bfa",
  },
  {
    href: "/dashboard/metrics",
    icon: "📈",
    label: "Metrics",
    desc: "View key business metrics and billing summaries.",
    color: "var(--success)",
  },
];

export default function DashboardHome() {
  const [metrics, setMetrics] = useState<Metrics | null>(null);

  useEffect(() => {
    fetch("/api/metrics")
      .then((r) => r.json())
      .then(setMetrics)
      .catch(console.error);
  }, []);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>
          Welcome back 👋
        </h1>
        <p style={{ color: "var(--text-muted)" }}>
          Here&apos;s a quick overview of your operations.
        </p>
      </div>

      {/* Quick Stats */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard label="Total Customers" value={metrics.totalCustomers} icon="👥" color="var(--accent-orange)" />
          <StatCard label="Total Jobs" value={metrics.totalJobs} icon="🔧" color="var(--accent-blue-light)" />
          <StatCard label="Completed Jobs" value={metrics.completedJobs} icon="✅" color="var(--success)" />
          <StatCard label="Outstanding Bills" value={metrics.outstandingBills} icon="💰" color="var(--warning)" />
        </div>
      )}

      {/* Quick Actions */}
      <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--text-secondary)" }}>
        Quick Actions
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {quickActions.map((action) => (
          <Link
            key={action.href}
            href={action.href}
            style={{ textDecoration: "none" }}
          >
            <div
              className="dr-card h-full cursor-pointer transition-all duration-200 hover:scale-105"
              style={{
                borderTop: `3px solid ${action.color}`,
              }}
            >
              <div
                className="text-3xl mb-3"
                style={{
                  filter: "drop-shadow(0 0 8px rgba(249,115,22,0.3))",
                }}
              >
                {action.icon}
              </div>
              <div className="font-semibold mb-2" style={{ color: action.color }}>
                {action.label}
              </div>
              <div className="text-xs" style={{ color: "var(--text-muted)", lineHeight: "1.5" }}>
                {action.desc}
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Company branding footer */}
      <div className="mt-12 text-center">
        <div
          className="inline-flex items-center gap-2 px-6 py-3 rounded-full"
          style={{
            background: "rgba(249,115,22,0.08)",
            border: "1px solid rgba(249,115,22,0.2)",
          }}
        >
          <span className="text-lg">⚡</span>
          <span className="font-semibold text-sm" style={{ color: "var(--accent-orange)" }}>
            Digital Revolution
          </span>
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            Home Theater · Audio · Automation · Security
          </span>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  color,
}: {
  label: string;
  value: number;
  icon: string;
  color: string;
}) {
  return (
    <div
      className="dr-card"
      style={{ borderLeft: `3px solid ${color}` }}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xl">{icon}</span>
        <span className="text-2xl font-bold" style={{ color }}>
          {value}
        </span>
      </div>
      <div className="text-xs" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
    </div>
  );
}
