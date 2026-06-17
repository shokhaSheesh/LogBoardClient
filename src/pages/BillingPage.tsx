import { useState } from "react";
import { CreditCard, Check, Zap, Shield, Building2, ChevronRight, AlertCircle } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Plan {
  id: string;
  name: string;
  price: number;
  period: "month" | "year";
  description: string;
  features: string[];
  highlight?: boolean;
}

interface Transaction {
  id: string;
  date: string;
  plan: string;
  amount: number;
  status: "paid" | "failed" | "refunded";
  invoice: string;
}

// ─── Seed data ────────────────────────────────────────────────────────────────

const CURRENT_PLAN = {
  id: "pro",
  name: "Pro",
  price: 149,
  renewsOn: "Jul 17, 2026",
  daysLeft: 30,
  status: "active" as const,
};

const PLANS: Plan[] = [
  {
    id: "starter",
    name: "Starter",
    price: 49,
    period: "month",
    description: "For small owner-operators just getting started.",
    features: [
      "Up to 5 drivers",
      "Load tracking",
      "Basic reporting",
      "Email support",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    price: 149,
    period: "month",
    description: "For growing fleets that need full dispatch visibility.",
    features: [
      "Up to 25 drivers",
      "Board & dispatch table",
      "Gross matrix & payouts",
      "Multi-stop loads",
      "Priority support",
    ],
    highlight: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 399,
    period: "month",
    description: "For large fleets with advanced operational needs.",
    features: [
      "Unlimited drivers",
      "Everything in Pro",
      "Multiple accounts",
      "Custom integrations",
      "Dedicated account manager",
    ],
  },
];

const TRANSACTIONS: Transaction[] = [
  { id: "1", date: "Jun 17, 2026", plan: "Pro",     amount: 149, status: "paid",     invoice: "INV-2026-0617" },
  { id: "2", date: "May 17, 2026", plan: "Pro",     amount: 149, status: "paid",     invoice: "INV-2026-0517" },
  { id: "3", date: "Apr 17, 2026", plan: "Pro",     amount: 149, status: "paid",     invoice: "INV-2026-0417" },
  { id: "4", date: "Mar 17, 2026", plan: "Pro",     amount: 149, status: "paid",     invoice: "INV-2026-0317" },
  { id: "5", date: "Feb 17, 2026", plan: "Starter", amount:  49, status: "paid",     invoice: "INV-2026-0217" },
  { id: "6", date: "Jan 17, 2026", plan: "Starter", amount:  49, status: "refunded", invoice: "INV-2026-0117" },
  { id: "7", date: "Dec 17, 2025", plan: "Starter", amount:  49, status: "paid",     invoice: "INV-2025-1217" },
  { id: "8", date: "Nov 17, 2025", plan: "Starter", amount:  49, status: "failed",   invoice: "INV-2025-1117" },
];

const STATUS_STYLE: Record<Transaction["status"], { color: string; bg: string; label: string }> = {
  paid:     { color: "#10B981", bg: "#D1FAE5", label: "Paid"     },
  failed:   { color: "#EF4444", bg: "#FEE2E2", label: "Failed"   },
  refunded: { color: "#F59E0B", bg: "#FEF3C7", label: "Refunded" },
};

const PLAN_ICON: Record<string, React.ReactNode> = {
  starter:    <Zap size={16} />,
  pro:        <Shield size={16} />,
  enterprise: <Building2 size={16} />,
};

// ─── Page ─────────────────────────────────────────────────────────────────────

export function BillingPage() {
  const [selectedPlan, setSelectedPlan] = useState(CURRENT_PLAN.id);

  const capStyle: React.CSSProperties = {
    fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600,
    color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.07em",
  };

  return (
    <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px", backgroundColor: "var(--background)", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
      <div style={{ maxWidth: 900, display: "flex", flexDirection: "column", gap: 28 }}>

        {/* Page title */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <CreditCard size={20} style={{ color: "var(--primary)" }} />
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 20, fontWeight: 700, color: "var(--foreground)" }}>
            Billing & Subscription
          </span>
        </div>

        {/* ── Current plan card ── */}
        <div style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 24px", display: "flex", alignItems: "center", gap: 24 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: "var(--secondary)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--primary)", flexShrink: 0 }}>
            <Shield size={22} />
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 16, fontWeight: 700, color: "var(--foreground)" }}>
                {CURRENT_PLAN.name} Plan
              </span>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600, color: "#10B981", backgroundColor: "#D1FAE5", borderRadius: 20, padding: "2px 8px" }}>
                Active
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>
                ${CURRENT_PLAN.price}/month
              </span>
              <span style={{ width: 3, height: 3, borderRadius: "50%", backgroundColor: "var(--muted-foreground)" }} />
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>
                Renews on <strong style={{ color: "var(--foreground)" }}>{CURRENT_PLAN.renewsOn}</strong>
              </span>
              <span style={{ width: 3, height: 3, borderRadius: "50%", backgroundColor: "var(--muted-foreground)" }} />
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>
                {CURRENT_PLAN.daysLeft} days remaining
              </span>
            </div>
          </div>

          {CURRENT_PLAN.daysLeft <= 7 && (
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", backgroundColor: "#FEF3C7", borderRadius: 8, border: "1px solid #FDE68A" }}>
              <AlertCircle size={14} style={{ color: "#F59E0B" }} />
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 500, color: "#B45309" }}>Expiring soon</span>
            </div>
          )}

          <button style={{
            fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600,
            padding: "8px 16px", borderRadius: 8, border: "none",
            backgroundColor: "var(--primary)", color: "#fff", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
          }}>
            Manage Plan <ChevronRight size={14} />
          </button>
        </div>

        {/* ── Plans ── */}
        <div>
          <div style={{ marginBottom: 14 }}>
            <span style={capStyle}>Available Plans</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            {PLANS.map((plan) => {
              const isCurrent = plan.id === CURRENT_PLAN.id;
              const isSelected = plan.id === selectedPlan;

              return (
                <div
                  key={plan.id}
                  onClick={() => setSelectedPlan(plan.id)}
                  style={{
                    backgroundColor: "var(--card)",
                    border: `2px solid ${isCurrent ? "var(--primary)" : isSelected ? "var(--border)" : "var(--border)"}`,
                    borderRadius: 12, padding: 20, cursor: "pointer",
                    position: "relative", display: "flex", flexDirection: "column", gap: 16,
                    boxShadow: isCurrent ? "0 0 0 3px rgba(59,130,246,0.12)" : "none",
                  }}
                >
                  {isCurrent && (
                    <div style={{ position: "absolute", top: -1, right: 16, backgroundColor: "var(--primary)", color: "#fff", fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 700, padding: "2px 10px", borderRadius: "0 0 6px 6px", letterSpacing: "0.05em" }}>
                      CURRENT
                    </div>
                  )}

                  {/* Plan header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: isCurrent ? "var(--secondary)" : "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", color: isCurrent ? "var(--primary)" : "var(--muted-foreground)" }}>
                      {PLAN_ICON[plan.id]}
                    </div>
                    <div>
                      <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 700, color: "var(--foreground)" }}>{plan.name}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: isCurrent ? "var(--primary)" : "var(--foreground)" }}>
                        ${plan.price}<span style={{ fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 400, color: "var(--muted-foreground)" }}>/mo</span>
                      </div>
                    </div>
                  </div>

                  {/* Description */}
                  <p style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", margin: 0, lineHeight: 1.5 }}>
                    {plan.description}
                  </p>

                  {/* Features */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {plan.features.map((f) => (
                      <div key={f} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 16, height: 16, borderRadius: "50%", backgroundColor: "#D1FAE5", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          <Check size={9} style={{ color: "#10B981" }} />
                        </span>
                        <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--foreground)" }}>{f}</span>
                      </div>
                    ))}
                  </div>

                  {/* Action */}
                  <button
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      marginTop: "auto", width: "100%",
                      fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600,
                      padding: "8px 0", borderRadius: 8, cursor: isCurrent ? "default" : "pointer",
                      border: isCurrent ? "none" : "1px solid var(--border)",
                      backgroundColor: isCurrent ? "var(--secondary)" : "transparent",
                      color: isCurrent ? "var(--primary)" : "var(--foreground)",
                    }}
                  >
                    {isCurrent ? "Current Plan" : plan.price > CURRENT_PLAN.price ? "Upgrade" : "Downgrade"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Transactions ── */}
        <div>
          <div style={{ marginBottom: 14 }}>
            <span style={capStyle}>Transaction History</span>
          </div>
          <div style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ backgroundColor: "var(--muted)" }}>
                  {["Date", "Invoice", "Plan", "Amount", "Status", ""].map((h, i) => (
                    <th key={i} style={{
                      padding: "10px 16px", textAlign: i >= 3 ? "right" : "left",
                      fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600,
                      color: "var(--muted-foreground)", textTransform: "uppercase",
                      letterSpacing: "0.07em", borderBottom: "1px solid var(--border)",
                      whiteSpace: "nowrap",
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {TRANSACTIONS.map((tx, i) => {
                  const s = STATUS_STYLE[tx.status];
                  return (
                    <tr
                      key={tx.id}
                      style={{ backgroundColor: i % 2 === 0 ? "var(--card)" : "var(--background)" }}
                    >
                      <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--foreground)" }}>
                        {tx.date}
                      </td>
                      <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted-foreground)" }}>
                        {tx.invoice}
                      </td>
                      <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--foreground)" }}>
                        {tx.plan}
                      </td>
                      <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: "var(--foreground)", textAlign: "right" }}>
                        ${tx.amount.toFixed(2)}
                      </td>
                      <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", textAlign: "right" }}>
                        <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600, color: s.color, backgroundColor: s.bg, borderRadius: 20, padding: "2px 10px" }}>
                          {s.label}
                        </span>
                      </td>
                      <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", textAlign: "right" }}>
                        <button style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--primary)", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.textDecoration = "underline"; }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.textDecoration = "none"; }}
                        >
                          Download
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
