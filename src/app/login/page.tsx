"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Login state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register state
  const [regFirstName, setRegFirstName] = useState("");
  const [regLastName, setRegLastName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed.");
      } else {
        router.push("/dashboard");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (regPassword !== regConfirm) {
      setError("Passwords do not match.");
      return;
    }
    if (regPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: regFirstName,
          lastName: regLastName,
          email: regEmail,
          password: regPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Registration failed.");
      } else {
        setSuccess(data.message);
        setTab("login");
        setRegFirstName("");
        setRegLastName("");
        setRegEmail("");
        setRegPassword("");
        setRegConfirm("");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center relative"
      style={{ background: "var(--bg-primary)" }}
    >
      {/* Background image with overlay */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: "url('/images/hero-bg.jpg')",
          opacity: 0.15,
        }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(135deg, rgba(13,17,23,0.97) 0%, rgba(30,64,175,0.15) 50%, rgba(13,17,23,0.97) 100%)",
        }}
      />

      <div className="relative z-10 w-full max-w-md px-4">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4"
            style={{ background: "rgba(249,115,22,0.15)", border: "2px solid rgba(249,115,22,0.4)" }}>
            <span className="text-3xl">⚡</span>
          </div>
          <h1 className="text-3xl font-bold" style={{ color: "var(--accent-orange)" }}>
            Digital Revolution
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
            Job Tracker — Internal Management System
          </p>
        </div>

        {/* Card */}
        <div className="dr-card slide-in">
          {/* Tabs */}
          <div className="flex rounded-lg mb-6 overflow-hidden" style={{ background: "var(--bg-primary)", border: "1px solid var(--border-color)" }}>
            <button
              onClick={() => { setTab("login"); setError(""); setSuccess(""); }}
              className="flex-1 py-3 text-sm font-semibold transition-all"
              style={{
                background: tab === "login" ? "var(--accent-orange)" : "transparent",
                color: tab === "login" ? "white" : "var(--text-secondary)",
                border: "none",
                cursor: "pointer",
              }}
            >
              Sign In
            </button>
            <button
              onClick={() => { setTab("register"); setError(""); setSuccess(""); }}
              className="flex-1 py-3 text-sm font-semibold transition-all"
              style={{
                background: tab === "register" ? "var(--accent-orange)" : "transparent",
                color: tab === "register" ? "white" : "var(--text-secondary)",
                border: "none",
                cursor: "pointer",
              }}
            >
              Register
            </button>
          </div>

          {error && <div className="alert-error mb-4">{error}</div>}
          {success && <div className="alert-success mb-4">{success}</div>}

          {tab === "login" ? (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="dr-label">Email Address</label>
                <input
                  className="dr-input"
                  type="email"
                  placeholder="you@example.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                  autoComplete="email"
                />
              </div>
              <div>
                <label className="dr-label">Password</label>
                <input
                  className="dr-input"
                  type="password"
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                />
              </div>
              <button
                type="submit"
                className="dr-btn-primary w-full justify-center mt-2"
                disabled={loading}
                style={{ width: "100%", padding: "12px" }}
              >
                {loading ? "Signing in..." : "Sign In →"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleRegister} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="dr-label">First Name</label>
                  <input
                    className="dr-input"
                    type="text"
                    placeholder="John"
                    value={regFirstName}
                    onChange={(e) => setRegFirstName(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label className="dr-label">Last Name</label>
                  <input
                    className="dr-input"
                    type="text"
                    placeholder="Smith"
                    value={regLastName}
                    onChange={(e) => setRegLastName(e.target.value)}
                    required
                  />
                </div>
              </div>
              <div>
                <label className="dr-label">Email Address</label>
                <input
                  className="dr-input"
                  type="email"
                  placeholder="you@example.com"
                  value={regEmail}
                  onChange={(e) => setRegEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="dr-label">Password</label>
                <input
                  className="dr-input"
                  type="password"
                  placeholder="Min. 8 characters"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <div>
                <label className="dr-label">Confirm Password</label>
                <input
                  className="dr-input"
                  type="password"
                  placeholder="Repeat password"
                  value={regConfirm}
                  onChange={(e) => setRegConfirm(e.target.value)}
                  required
                />
              </div>
              <button
                type="submit"
                className="dr-btn-primary w-full justify-center mt-2"
                disabled={loading}
                style={{ width: "100%", padding: "12px" }}
              >
                {loading ? "Registering..." : "Request Account"}
              </button>
              <p className="text-xs text-center mt-2" style={{ color: "var(--text-muted)" }}>
                After registering, an administrator will review and approve your account.
              </p>
            </form>
          )}
        </div>

        <p className="text-center text-xs mt-6" style={{ color: "var(--text-muted)" }}>
          © {new Date().getFullYear()} Digital Revolution — St. Louis, MO
        </p>
      </div>
    </div>
  );
}
