import { useState } from "react";
import { useNavigate } from "react-router";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "../lib/auth";
import { STATUS_CONFIG, type Status } from "../lib/statuses";
import { BRAND_NAME, BrandMark } from "../components/Brand";

// ─── Board preview (right panel) ──────────────────────────────────────────────
// A static slice of the dispatch board — sample rows, real status colours — so the
// sign-in screen shows the product instead of stock photos.

const PREVIEW_ROWS: { driver: string; status: Status; lane: string }[] = [
  { driver: "Marcus Hill",     status: "enroute",    lane: "Dallas, TX → Atlanta, GA" },
  { driver: "Dilshod Karimov", status: "ready",      lane: "Chicago, IL" },
  { driver: "Ana Sousa",       status: "completed",  lane: "Phoenix, AZ → Denver, CO" },
  { driver: "Tyrone Banks",    status: "dispatched", lane: "Memphis, TN → Columbus, OH" },
  { driver: "Jorge Peña",      status: "covered",    lane: "Laredo, TX → Nashville, TN" },
  { driver: "Sam Okafor",      status: "home",       lane: "Kansas City, MO" },
  { driver: "Lena Fischer",    status: "reserved",   lane: "Reno, NV → Portland, OR" },
  { driver: "Andre Williams",  status: "rest",       lane: "Tulsa, OK" },
  { driver: "Bekzod Aliev",    status: "shop",       lane: "Indianapolis, IN" },
  { driver: "Chris Novak",     status: "re_update",  lane: "El Paso, TX → Tucson, AZ" },
];

function BoardPreview() {
  return (
    <div
      aria-hidden="true"
      style={{
        flex: 1, minWidth: 0, backgroundColor: "#fff", color: "#111827",
        borderTopLeftRadius: 14, padding: "16px 0 0 18px",
        boxShadow: "0 24px 60px rgba(0,0,0,0.28)",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", padding: "0 18px 12px 0" }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>Dispatch board</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#6B7280" }}>This week</span>
      </div>
      {PREVIEW_ROWS.map((r) => {
        const cfg = STATUS_CONFIG[r.status];
        return (
          <div
            key={r.driver}
            style={{
              display: "grid", gridTemplateColumns: "1.1fr 0.9fr 1.7fr", gap: 12, alignItems: "center",
              padding: "10px 18px 10px 0", borderTop: "1px solid #E5E7EB", fontSize: 12.5, whiteSpace: "nowrap",
            }}
          >
            <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis" }}>{r.driver}</span>
            <span style={{ justifySelf: "start", fontSize: 11, fontWeight: 700, padding: "2px 9px", borderRadius: 5, backgroundColor: cfg.bg, color: cfg.color }}>
              {cfg.label}
            </span>
            <span style={{ color: "#6B7280", overflow: "hidden", textOverflow: "ellipsis" }}>{r.lane}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  width: "100%", height: 42, borderRadius: 9, padding: "0 12px", boxSizing: "border-box",
  backgroundColor: "var(--card)", border: "1px solid var(--border)",
  fontFamily: "var(--font-sans)", fontSize: 13.5, color: "var(--foreground)", outline: "none",
  transition: "border-color 0.15s, box-shadow 0.15s",
};

const onFocus = (e: React.FocusEvent<HTMLInputElement>) => {
  e.currentTarget.style.borderColor = "var(--primary)";
  e.currentTarget.style.boxShadow = "0 0 0 3px var(--primary-soft)";
};
const onBlur = (e: React.FocusEvent<HTMLInputElement>) => {
  e.currentTarget.style.borderColor = "var(--border)";
  e.currentTarget.style.boxShadow = "none";
};

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
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "var(--font-sans)", backgroundColor: "var(--card)" }}>

      {/* ── Left: form ─────────────────────────────── */}
      <div
        className="w-full lg:w-[46%]"
        style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 32, padding: "28px 32px" }}
      >
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <BrandMark />
          <span style={{ fontSize: 15, fontWeight: 700, color: "var(--foreground)", letterSpacing: "-0.01em" }}>
            {BRAND_NAME}
          </span>
        </div>

        <div style={{ width: "100%", maxWidth: 360, margin: "0 auto" }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: "var(--foreground)", marginBottom: 6, letterSpacing: "-0.02em", lineHeight: 1.25 }}>
            Welcome back
          </h1>
          <p style={{ fontSize: 13.5, color: "var(--muted-foreground)", marginBottom: 28 }}>
            Sign in to your workspace
          </p>

          {error && (
            <div
              role="alert"
              style={{
                fontSize: 13, color: "var(--destructive)",
                backgroundColor: "rgba(239,68,68,0.08)",
                border: "1px solid rgba(239,68,68,0.2)",
                borderRadius: 9, padding: "10px 14px", marginBottom: 20,
              }}
            >
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label htmlFor="login-email" style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>
                Email address
              </label>
              <input
                id="login-email"
                type="email"
                autoComplete="username"
                autoFocus
                required
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={inputStyle}
                onFocus={onFocus}
                onBlur={onBlur}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <label htmlFor="login-password" style={{ fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>
                Password
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ ...inputStyle, paddingRight: 40 }}
                  onFocus={onFocus}
                  onBlur={onBlur}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
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
                height: 42, borderRadius: 9, border: "none",
                backgroundColor: "var(--primary)",
                color: "var(--primary-foreground)", fontSize: 14, fontWeight: 600,
                cursor: submitting ? "not-allowed" : "pointer",
                opacity: submitting ? 0.7 : 1,
                marginTop: 4,
                transition: "opacity 0.15s",
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
        </div>

        <p style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
          © 2026 {BRAND_NAME}
        </p>
      </div>

      {/* ── Right: product preview (hidden on narrow screens) ── */}
      <div
        className="hidden lg:flex"
        style={{
          flex: 1, minWidth: 0, flexDirection: "column", gap: 28, overflow: "hidden",
          padding: "56px 0 0 56px", color: "#fff",
          background: "linear-gradient(160deg, #1E9E59 0%, #136F3D 100%)",
        }}
      >
        <div style={{ paddingRight: 56 }}>
          <h2 style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.2, letterSpacing: "-0.02em", maxWidth: 420 }}>
            One screen for your whole fleet
          </h2>
          <p style={{ fontSize: 14.5, lineHeight: 1.55, color: "rgba(255,255,255,0.85)", marginTop: 12, maxWidth: 400 }}>
            Statuses, loads and gross for every driver, updated live.
          </p>
        </div>
        <BoardPreview />
      </div>

    </div>
  );
}
