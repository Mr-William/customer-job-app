"use client";
import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";

interface User {
  userId: number;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: "📊" },
  { href: "/dashboard/customers/add", label: "Add Customer", icon: "➕" },
  { href: "/dashboard/customers", label: "Customers", icon: "👥" },
  { href: "/dashboard/search", label: "Search", icon: "🔍" },
  { href: "/dashboard/metrics", label: "Metrics", icon: "📈" },
];

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        if (!data.user) {
          router.replace("/login");
        } else {
          setUser(data.user);
          setLoading(false);
        }
      })
      .catch(() => router.replace("/login"));
  }, [router]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ background: "var(--bg-primary)" }}
      >
        <div className="text-center">
          <div
            className="inline-block w-8 h-8 border-2 rounded-full animate-spin mb-3"
            style={{
              borderColor: "var(--accent-orange)",
              borderTopColor: "transparent",
            }}
          />
          <p style={{ color: "var(--text-muted)" }}>Loading...</p>
        </div>
      </div>
    );
  }

  const SidebarContent = ({ onNav }: { onNav?: () => void }) => (
    <>
      {/* Brand */}
      <div
        className="flex items-center gap-3 px-4 py-5 flex-shrink-0"
        style={{ borderBottom: "1px solid var(--border-color)" }}
      >
        <div
          className="flex items-center justify-center w-10 h-10 rounded-lg flex-shrink-0"
          style={{
            background: "rgba(249,115,22,0.15)",
            border: "1px solid rgba(249,115,22,0.3)",
          }}
        >
          <span className="text-lg">⚡</span>
        </div>
        <div className="min-w-0">
          <div
            className="font-bold text-sm"
            style={{ color: "var(--accent-orange)" }}
          >
            Digital Revolution
          </div>
          <div className="text-xs truncate" style={{ color: "var(--text-muted)" }}>
            Job Tracker
          </div>
        </div>
      </div>

      {/* Nav links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => {
          const isActive =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNav}
              className={`sidebar-link ${isActive ? "active" : ""}`}
            >
              <span className="text-base">{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User info + logout */}
      <div
        className="px-3 py-4 flex-shrink-0"
        style={{ borderTop: "1px solid var(--border-color)" }}
      >
        {user && (
          <div className="mb-3 px-2">
            <div
              className="text-sm font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              {user.firstName} {user.lastName}
            </div>
            <div
              className="text-xs truncate"
              style={{ color: "var(--text-muted)" }}
            >
              {user.email}
            </div>
            {user.role === "admin" && (
              <span className="badge-blue mt-1">Admin</span>
            )}
          </div>
        )}
        <button onClick={handleLogout} className="sidebar-link w-full">
          <span>🚪</span>
          <span>Sign Out</span>
        </button>
      </div>
    </>
  );

  return (
    <div
      className="min-h-screen"
      style={{ background: "var(--bg-primary)", display: "flex" }}
    >
      {/* ── Desktop sidebar (always visible, never overlaps) ── */}
      <aside
        style={{
          width: "240px",
          minWidth: "240px",
          background: "var(--bg-secondary)",
          borderRight: "1px solid var(--border-color)",
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          position: "sticky",
          top: 0,
          overflowY: "auto",
        }}
        className="hidden md:flex"
      >
        <SidebarContent />
      </aside>

      {/* ── Mobile: top bar + slide-in drawer ── */}
      <>
        {/* Dark overlay */}
        {mobileOpen && (
          <div
            onClick={() => setMobileOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.65)",
              zIndex: 40,
            }}
            className="md:hidden"
          />
        )}

        {/* Slide-in drawer */}
        <aside
          className="md:hidden"
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            height: "100%",
            width: "240px",
            background: "var(--bg-secondary)",
            borderRight: "1px solid var(--border-color)",
            display: "flex",
            flexDirection: "column",
            zIndex: 50,
            transform: mobileOpen ? "translateX(0)" : "translateX(-100%)",
            transition: "transform 0.25s ease",
          }}
        >
          <SidebarContent onNav={() => setMobileOpen(false)} />
        </aside>
      </>

      {/* ── Main content area ── */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
        {/* Mobile top bar */}
        <div
          className="md:hidden flex items-center gap-3 px-4 py-3"
          style={{
            background: "var(--bg-secondary)",
            borderBottom: "1px solid var(--border-color)",
            position: "sticky",
            top: 0,
            zIndex: 30,
          }}
        >
          <button
            onClick={() => setMobileOpen(true)}
            style={{
              background: "none",
              border: "none",
              color: "var(--text-primary)",
              fontSize: "22px",
              cursor: "pointer",
              lineHeight: 1,
              padding: "2px 6px",
            }}
          >
            ☰
          </button>
          <span
            className="font-bold text-sm"
            style={{ color: "var(--accent-orange)" }}
          >
            Digital Revolution — Job Tracker
          </span>
        </div>

        {/* Page content */}
        <main className="flex-1 p-4 md:p-8 fade-in">{children}</main>
      </div>
    </div>
  );
}
