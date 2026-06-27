import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { Zap, Eye, EyeOff } from "lucide-react";
import { useAuth } from "../lib/auth";

const SLIDES = [
  {
    url: "/images/truck-1.jpg",
    label: "Live dispatch board",
    caption: "One screen for your entire fleet — statuses, ETAs, and loads.",
  },
  {
    url: "/images/truck-2.jpg",
    label: "Full visibility",
    caption: "Aerial-level insight into your operation — gross, RPM, payouts.",
  },
  {
    url: "/images/truck-3.jpg",
    label: "Fleet management",
    caption: "Track every driver and every mile as it happens.",
  },
];

const INTERVAL = 5000;

function ImageSlideshow() {
  const [current, setCurrent] = useState(0);
  const [progress, setProgress] = useState(0);
  const [fading, setFading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startRef = useRef<number>(Date.now());

  const goTo = (idx: number) => {
    setFading(true);
    setTimeout(() => {
      setCurrent(idx);
      setProgress(0);
      startRef.current = Date.now();
      setFading(false);
    }, 350);
  };

  useEffect(() => {
    const tick = () => {
      const elapsed = Date.now() - startRef.current;
      const pct = Math.min((elapsed / INTERVAL) * 100, 100);
      setProgress(pct);
      if (elapsed >= INTERVAL) {
        goTo((current + 1) % SLIDES.length);
      }
    };
    timerRef.current = setInterval(tick, 50);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [current]);

  const slide = SLIDES[current];

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", overflow: "hidden" }}>
      {/* Image */}
      <img
        key={current}
        src={slide.url}
        alt={slide.label}
        style={{
          position: "absolute", inset: 0, width: "100%", height: "100%",
          objectFit: "cover", objectPosition: "center",
          opacity: fading ? 0 : 1,
          transition: "opacity 0.35s ease",
        }}
      />

      {/* Dark overlay */}
      <div style={{
        position: "absolute", inset: 0,
        background: "linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.25) 50%, rgba(0,0,0,0.45) 100%)",
      }} />

      {/* Story progress bars */}
      <div style={{
        position: "absolute", top: 20, left: 20, right: 20,
        display: "flex", gap: 6, zIndex: 10,
      }}>
        {SLIDES.map((_, i) => (
          <div
            key={i}
            onClick={() => goTo(i)}
            style={{
              flex: 1, height: 3, borderRadius: 2,
              backgroundColor: "rgba(255,255,255,0.3)",
              cursor: "pointer", overflow: "hidden",
            }}
          >
            <div style={{
              height: "100%", borderRadius: 2,
              backgroundColor: "#fff",
              width: i < current ? "100%" : i === current ? `${progress}%` : "0%",
              transition: i === current ? "none" : "width 0.3s ease",
            }} />
          </div>
        ))}
      </div>

      {/* Logo in top-left */}
      <div style={{
        position: "absolute", top: 44, left: 24, zIndex: 10,
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <div style={{
          width: 34, height: 34, borderRadius: 10,
          background: "linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)",
          display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 2px 8px rgba(0,0,0,0.4)",
        }}>
          <Zap size={17} color="#fff" strokeWidth={2.5} />
        </div>
        <span style={{ fontSize: 15, fontWeight: 700, color: "#fff", letterSpacing: "-0.2px" }}>
          DispatchOS
        </span>
      </div>

      {/* Dot indicators */}
      <div style={{
        position: "absolute", bottom: 120, left: 0, right: 0,
        display: "flex", justifyContent: "center", gap: 8, zIndex: 10,
      }}>
        {SLIDES.map((_, i) => (
          <div
            key={i}
            onClick={() => goTo(i)}
            style={{
              width: i === current ? 20 : 7,
              height: 7, borderRadius: 4,
              backgroundColor: i === current ? "#fff" : "rgba(255,255,255,0.4)",
              cursor: "pointer",
              transition: "width 0.3s ease, background-color 0.3s ease",
            }}
          />
        ))}
      </div>

      {/* Bottom text */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0,
        padding: "0 28px 32px",
        opacity: fading ? 0 : 1,
        transition: "opacity 0.35s ease",
        zIndex: 10,
      }}>
        <div style={{
          display: "inline-block",
          backgroundColor: "rgba(59,130,246,0.85)",
          borderRadius: 6, padding: "3px 10px", marginBottom: 10,
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: "#fff", letterSpacing: "0.05em", textTransform: "uppercase" }}>
            {slide.label}
          </span>
        </div>
        <p style={{ fontSize: 20, fontWeight: 700, color: "#fff", lineHeight: 1.3, margin: 0, letterSpacing: "-0.3px" }}>
          {slide.caption}
        </p>
      </div>
    </div>
  );
}

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

      {/* ── Left: form ─────────────────────────────── */}
      <div style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "48px 32px",
        backgroundColor: "var(--background)",
      }}>
        {/* Centered content container */}
        <div style={{ width: "100%", maxWidth: 360 }}>

          {/* Logo */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 44 }}>
            <div style={{
              width: 40, height: 40, borderRadius: 12, flexShrink: 0,
              background: "linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 4px 12px rgba(59,130,246,0.35)",
            }}>
              <Zap size={20} color="#fff" strokeWidth={2.5} />
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--foreground)", letterSpacing: "-0.3px" }}>
                DispatchOS
              </div>
              <div style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 1 }}>
                Carrier Log Board
              </div>
            </div>
          </div>

          <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--foreground)", marginBottom: 6, letterSpacing: "-0.5px" }}>
            Welcome back
          </h1>
          <p style={{ fontSize: 13, color: "var(--muted-foreground)", marginBottom: 28 }}>
            Sign in to your workspace to continue
          </p>

          {error && (
            <div style={{
              fontSize: 13, color: "#ef4444",
              backgroundColor: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.2)",
              borderRadius: 8, padding: "10px 14px", marginBottom: 20,
            }}>
              {error}
            </div>
          )}

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

          <p style={{ fontSize: 12, color: "var(--muted-foreground)", marginTop: 48 }}>
            © 2026 DispatchOS · All rights reserved
          </p>

        </div>
      </div>

      {/* ── Right: slideshow ────────────────────────── */}
      <div style={{ flex: "0 0 45%", position: "relative", overflow: "hidden" }}>
        <ImageSlideshow />
      </div>

    </div>
  );
}
