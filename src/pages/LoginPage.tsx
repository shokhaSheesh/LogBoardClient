import { useState } from "react";
import { useNavigate } from "react-router";
import { Zap, Eye, EyeOff } from "lucide-react";

export function LoginPage() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    navigate("/workspace/board");
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ backgroundColor: "var(--background)" }}
    >
      <div
        className="w-full max-w-sm rounded-xl p-8"
        style={{
          backgroundColor: "var(--card)",
          border: "1px solid var(--border)",
          boxShadow: "0 4px 24px rgba(0,0,0,0.07)",
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 mb-8">
          <div
            className="flex items-center justify-center rounded-xl"
            style={{
              width: 40,
              height: 40,
              background: "linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)",
            }}
          >
            <Zap size={20} color="#fff" strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--foreground)" }}>
              DispatchOS
            </div>
            <div style={{ fontSize: 11, color: "var(--muted-foreground)" }}>
              Log Board Admin
            </div>
          </div>
        </div>

        <h1
          style={{
            fontSize: 20,
            fontWeight: 700,
            color: "var(--foreground)",
            marginBottom: 4,
          }}
        >
          Welcome back
        </h1>
        <p
          style={{
            fontSize: "0.82rem",
            color: "var(--muted-foreground)",
            marginBottom: 24,
          }}
        >
          Sign in to your workspace
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--foreground)" }}
            >
              Email
            </label>
            <input
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="rounded-md px-3 outline-none transition-all"
              style={{
                height: 36,
                backgroundColor: "var(--input-background)",
                border: "1px solid var(--border)",
                fontSize: "0.82rem",
                color: "var(--foreground)",
              }}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              style={{ fontSize: "0.82rem", fontWeight: 500, color: "var(--foreground)" }}
            >
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md px-3 outline-none transition-all"
                style={{
                  height: 36,
                  backgroundColor: "var(--input-background)",
                  border: "1px solid var(--border)",
                  fontSize: "0.82rem",
                  color: "var(--foreground)",
                  paddingRight: 36,
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2"
                style={{ color: "var(--muted-foreground)" }}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="rounded-md font-medium transition-all mt-1"
            style={{
              height: 36,
              backgroundColor: "var(--primary)",
              color: "var(--primary-foreground)",
              fontSize: "0.875rem",
              border: "none",
              cursor: "pointer",
            }}
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.opacity = "0.9")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLButtonElement).style.opacity = "1")
            }
          >
            Sign in
          </button>
        </form>
      </div>
    </div>
  );
}
