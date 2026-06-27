import { useState } from "react";
import { useNavigate } from "react-router";
import { Zap, Eye, EyeOff, TrendingUp, MapPin, Truck } from "lucide-react";
import { useAuth } from "../lib/auth";

const STATS = [
  { label: "Active Drivers", value: "1,240+" },
  { label: "Loads Dispatched", value: "48,000+" },
  { label: "Miles Tracked", value: "12M+" },
];

export function LoginPage() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const { mustChangePassword } = await login(email, password);
      if (mustChangePassword) {
        navigate("/workspace/settings/credentials", { replace: true });
      } else {
        navigate("/workspace/dashboard", { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "var(--font-sans)" }}>

      {/* ── Left: form ─────────────────────────────────── */}
      <div
        style={{
          flex: "0 0 480px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "48px 56px",
          backgroundColor: "var(--background)",
          position: "relative",
          zIndex: 1,
        }}
      >
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 48 }}>
          <div
            style={{
              width: 42, height: 42, borderRadius: 12, flexShrink: 0,
              background: "linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 4px 12px rgba(59,130,246,0.35)",
            }}
          >
            <Zap size={20} color="#fff" strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: "var(--foreground)", letterSpacing: "-0.3px" }}>
              DispatchOS
            </div>
            <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 1 }}>
              Carrier Log Board
            </div>
          </div>
        </div>

        {/* Heading */}
        <h1 style={{ fontSize: 26, fontWeight: 700, color: "var(--foreground)", marginBottom: 6, letterSpacing: "-0.5px" }}>
          Welcome back
        </h1>
        <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 32 }}>
          Sign in to your workspace to continue
        </p>

        {/* Error */}
        {error && (
          <div
            style={{
              fontSize: 13, color: "#ef4444",
              backgroundColor: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.2)",
              borderRadius: 8, padding: "10px 14px", marginBottom: 20,
            }}
          >
            {error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)" }}>
              Email address
            </label>
            <input
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                height: 40, borderRadius: 8, padding: "0 12px",
                backgroundColor: "var(--input-background)",
                border: "1px solid var(--border)",
                fontSize: 13, color: "var(--foreground)", outline: "none",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#3B82F6")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label style={{ fontSize: 13, fontWeight: 500, color: "var(--foreground)" }}>
              Password
            </label>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: "100%", height: 40, borderRadius: 8,
                  padding: "0 40px 0 12px", boxSizing: "border-box",
                  backgroundColor: "var(--input-background)",
                  border: "1px solid var(--border)",
                  fontSize: 13, color: "var(--foreground)", outline: "none",
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#3B82F6")}
                onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                style={{
                  position: "absolute", right: 12, top: "50%",
                  transform: "translateY(-50%)", background: "none",
                  border: "none", cursor: "pointer", color: "var(--muted-foreground)",
                  padding: 0, display: "flex",
                }}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            style={{
              height: 40, borderRadius: 8, border: "none",
              background: "linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)",
              color: "#fff", fontSize: 14, fontWeight: 600,
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.7 : 1,
              marginTop: 4,
              boxShadow: submitting ? "none" : "0 4px 12px rgba(59,130,246,0.3)",
              transition: "opacity 0.15s, box-shadow 0.15s",
            }}
            onMouseEnter={(e) => {
              if (!submitting) (e.currentTarget as HTMLButtonElement).style.opacity = "0.9";
            }}
            onMouseLeave={(e) => {
              if (!submitting) (e.currentTarget as HTMLButtonElement).style.opacity = "1";
            }}
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {/* Footer */}
        <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 40 }}>
          © 2026 DispatchOS · All rights reserved
        </p>
      </div>

      {/* ── Right: visual panel ─────────────────────────── */}
      <div
        style={{
          flex: 1,
          position: "relative",
          overflow: "hidden",
          background: "linear-gradient(140deg, #0F172A 0%, #1E3A5F 45%, #0F172A 100%)",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "52px 56px",
        }}
      >
        {/* Grid background */}
        <svg
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.06 }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
              <path d="M 48 0 L 0 0 0 48" fill="none" stroke="#60A5FA" strokeWidth="0.8" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
        </svg>

        {/* Glow blobs */}
        <div style={{
          position: "absolute", top: -80, right: -80, width: 400, height: 400, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(59,130,246,0.18) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", bottom: -60, left: 40, width: 320, height: 320, borderRadius: "50%",
          background: "radial-gradient(circle, rgba(99,102,241,0.14) 0%, transparent 70%)",
          pointerEvents: "none",
        }} />

        {/* Top badge */}
        <div style={{ position: "relative", zIndex: 1 }}>
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            backgroundColor: "rgba(59,130,246,0.15)",
            border: "1px solid rgba(59,130,246,0.3)",
            borderRadius: 20, padding: "6px 14px",
          }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: "#10B981" }} />
            <span style={{ fontSize: 12, fontWeight: 500, color: "#93C5FD" }}>
              Live dispatch platform
            </span>
          </div>
        </div>

        {/* Center content */}
        <div style={{ position: "relative", zIndex: 1 }}>
          {/* Heading */}
          <h2 style={{
            fontSize: 36, fontWeight: 800, color: "#F1F5F9",
            lineHeight: 1.15, letterSpacing: "-0.8px", marginBottom: 16,
          }}>
            Move freight.<br />
            <span style={{ color: "#60A5FA" }}>Move faster.</span>
          </h2>
          <p style={{ fontSize: 15, color: "#94A3B8", lineHeight: 1.6, maxWidth: 380, marginBottom: 48 }}>
            One screen to track every driver, every load, and every mile — in real time.
          </p>

          {/* Feature pills */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {[
              { icon: Truck,      text: "Live driver & load board with instant status sync" },
              { icon: MapPin,     text: "Route tracking, ETAs, and location updates" },
              { icon: TrendingUp, text: "Gross, RPM, and dispatcher payout analytics" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10, flexShrink: 0,
                  backgroundColor: "rgba(59,130,246,0.15)",
                  border: "1px solid rgba(59,130,246,0.25)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Icon size={16} color="#60A5FA" />
                </div>
                <span style={{ fontSize: 13, color: "#CBD5E1" }}>{text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Stats row */}
        <div style={{
          position: "relative", zIndex: 1,
          display: "flex", gap: 0,
          backgroundColor: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 14, overflow: "hidden",
        }}>
          {STATS.map((s, i) => (
            <div
              key={s.label}
              style={{
                flex: 1, padding: "18px 20px",
                borderRight: i < STATS.length - 1 ? "1px solid rgba(255,255,255,0.08)" : "none",
              }}
            >
              <div style={{ fontSize: 22, fontWeight: 700, color: "#F1F5F9", letterSpacing: "-0.5px" }}>
                {s.value}
              </div>
              <div style={{ fontSize: 11, color: "#64748B", marginTop: 2 }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
