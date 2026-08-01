"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface AppUser {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  approved: boolean;
  createdAt: string;
}

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [me, setMe] = useState<{ userId: number; role: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [error, setError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<AppUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [approvingId, setApprovingId] = useState<number | null>(null);
  const [notice, setNotice] = useState("");

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/users");
      if (res.status === 403) {
        setForbidden(true);
        return;
      }
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      const data = await res.json();
      setUsers(data.users || []);
    } catch {
      setError("Failed to load users.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => setMe(d.user || null))
      .catch(() => {});
    loadUsers();
  }, [loadUsers]);

  async function handleApprove(u: AppUser) {
    setApprovingId(u.id);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/users/${u.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved: true }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to approve user.");
      } else {
        setUsers((prev) =>
          prev.map((x) => (x.id === u.id ? { ...x, approved: true } : x))
        );
        setNotice(`${u.firstName} ${u.lastName} has been approved.`);
      }
    } catch {
      setError("Failed to approve user.");
    } finally {
      setApprovingId(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setError("");
    setNotice("");
    try {
      const res = await fetch(`/api/users/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Failed to delete user.");
      } else {
        setUsers((prev) => prev.filter((u) => u.id !== deleteTarget.id));
        setNotice(
          deleteTarget.approved
            ? `${deleteTarget.firstName} ${deleteTarget.lastName}'s account was removed.`
            : `${deleteTarget.firstName} ${deleteTarget.lastName}'s request was denied.`
        );
        setDeleteTarget(null);
      }
    } catch {
      setError("Failed to delete user.");
    } finally {
      setDeleting(false);
    }
  }

  if (forbidden) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
          Users
        </h1>
        <p style={{ color: "var(--text-muted)" }}>
          You need administrator access to view this page.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
          User Accounts
        </h1>
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          Approve pending requests, and view or remove accounts that can access
          the job tracker.
        </p>
      </div>

      {notice && (
        <div
          className="mb-4 px-4 py-3 rounded"
          style={{
            background: "rgba(34,197,94,0.12)",
            border: "1px solid rgba(34,197,94,0.35)",
            color: "#86efac",
          }}
        >
          {notice}
        </div>
      )}

      {error && (
        <div
          className="mb-4 px-4 py-3 rounded"
          style={{
            background: "rgba(239,68,68,0.12)",
            border: "1px solid rgba(239,68,68,0.35)",
            color: "#fca5a5",
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ color: "var(--text-muted)" }}>Loading users...</p>
      ) : users.length === 0 ? (
        <p style={{ color: "var(--text-muted)" }}>No users found.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border-color)" }}>
                {["Name", "Email", "Role", "Status", "Created", ""].map((h) => (
                  <th
                    key={h}
                    className="text-left px-3 py-2 font-medium"
                    style={{ color: "var(--text-muted)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isSelf = me?.userId === u.id;
                return (
                  <tr
                    key={u.id}
                    style={{ borderBottom: "1px solid var(--border-color)" }}
                  >
                    <td className="px-3 py-3" style={{ color: "var(--text-primary)" }}>
                      {u.firstName} {u.lastName}
                      {isSelf && (
                        <span className="ml-2 text-xs" style={{ color: "var(--text-muted)" }}>
                          (you)
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3" style={{ color: "var(--text-muted)" }}>
                      {u.email}
                    </td>
                    <td className="px-3 py-3">
                      {u.role === "admin" ? (
                        <span className="badge-blue">Admin</span>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>User</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {u.approved ? (
                        <span className="badge-success">✓ Approved</span>
                      ) : (
                        <span className="badge-warning">⏳ Pending</span>
                      )}
                    </td>
                    <td className="px-3 py-3" style={{ color: "var(--text-muted)" }}>
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex gap-2 justify-end">
                        {!u.approved && (
                          <button
                            disabled={approvingId === u.id}
                            onClick={() => handleApprove(u)}
                            title="Approve this account"
                            style={{
                              background: "none",
                              border: "1px solid rgba(34,197,94,0.4)",
                              color: "#4ade80",
                              borderRadius: 6,
                              padding: "4px 12px",
                              cursor: approvingId === u.id ? "wait" : "pointer",
                            }}
                          >
                            {approvingId === u.id ? "Approving..." : "Approve"}
                          </button>
                        )}
                        <button
                          disabled={isSelf}
                          onClick={() => {
                            setError("");
                            setNotice("");
                            setDeleteTarget(u);
                          }}
                          title={
                            isSelf
                              ? "You cannot remove your own account"
                              : u.approved
                              ? "Remove user"
                              : "Deny this request"
                          }
                          style={{
                            background: "none",
                            border: "1px solid rgba(239,68,68,0.4)",
                            color: isSelf ? "var(--text-muted)" : "#f87171",
                            borderRadius: 6,
                            padding: "4px 12px",
                            cursor: isSelf ? "not-allowed" : "pointer",
                            opacity: isSelf ? 0.4 : 1,
                          }}
                        >
                          {u.approved ? "Remove" : "Deny"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            zIndex: 60,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 16,
          }}
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              background: "var(--bg-secondary)",
              border: "1px solid var(--border-color)",
              borderRadius: 12,
              padding: 24,
              maxWidth: 420,
              width: "100%",
            }}
          >
            <h2
              className="text-lg font-bold mb-2"
              style={{ color: "var(--text-primary)" }}
            >
              {deleteTarget.approved ? "Remove user?" : "Deny request?"}
            </h2>
            <p className="text-sm mb-5" style={{ color: "var(--text-muted)" }}>
              This permanently deletes the account for{" "}
              <strong style={{ color: "var(--text-primary)" }}>
                {deleteTarget.firstName} {deleteTarget.lastName}
              </strong>{" "}
              ({deleteTarget.email}).{" "}
              {deleteTarget.approved
                ? "They will immediately lose access."
                : "They will be emailed that their request was denied."}
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                style={{
                  background: "none",
                  border: "1px solid var(--border-color)",
                  color: "var(--text-primary)",
                  borderRadius: 6,
                  padding: "8px 16px",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  background: "#ef4444",
                  border: "none",
                  color: "white",
                  borderRadius: 6,
                  padding: "8px 16px",
                  fontWeight: 600,
                  cursor: deleting ? "wait" : "pointer",
                }}
              >
                {deleting
                  ? "Working..."
                  : deleteTarget.approved
                  ? "Remove"
                  : "Deny"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
