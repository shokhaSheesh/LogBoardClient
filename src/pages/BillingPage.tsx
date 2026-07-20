import { useState, useEffect } from "react";
import { CreditCard, Check, Zap, Shield, Building2, ChevronRight, AlertCircle, Download } from "lucide-react";
import { api, getCompanyId } from "../lib/api";

// ─── Backend types ────────────────────────────────────────────────────────────

interface BackendPlan {
  id: string;
  name: string;
  price: number;
  color?: string;
  duration?: number;
  max_drivers?: number;
  popular?: boolean;
  features?: string[];
}

interface BackendBilling {
  status?: string;
  current_plan: {
    id: string; name: string; price: number; color?: string;
    max_drivers?: number; features?: string[];
    renews_on?: string | null;
    days_left?: number | null;
  } | null;
  expires_at?: string | null;
}

interface BackendInvoice {
  id: string;
  invoice?: string;
  date?: string;
  plan?: string;
  amount?: number;
  currency?: string;
  status?: string;
  download?: string;
  // fallback names from older API shape
  plan_name?: string;
  amount_paid?: number;
  created_at?: string;
}

// ─── Local types ──────────────────────────────────────────────────────────────

interface Plan {
  id: string; name: string; price: number; color: string;
  features: string[]; popular: boolean;
}

interface Invoice {
  id: string; invoiceNumber: string; date: string; plan: string;
  amount: number; currency: string; status: string;
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

function toPlan(b: BackendPlan): Plan {
  return {
    id: b.id, name: b.name, price: b.price,
    color: b.color ?? "#3B82F6",
    features: b.features ?? [],
    popular: b.popular ?? false,
  };
}

function toInvoice(b: BackendInvoice): Invoice {
  const raw = b.date ?? b.created_at ?? "";
  const date = raw ? new Date(raw).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
  return {
    id: b.id,
    invoiceNumber: b.invoice ?? b.id,
    date,
    plan: b.plan ?? b.plan_name ?? "—",
    amount: b.amount ?? b.amount_paid ?? 0,
    currency: b.currency ?? "USD",
    status: b.status ?? "—",
  };
}

// ─── Status style ─────────────────────────────────────────────────────────────

function invoiceStatusStyle(status: string): { color: string; bg: string } {
  const s = status.toLowerCase();
  if (s === "active" || s === "paid") return { color: "#10B981", bg: "rgba(16,185,129,0.14)" };
  if (s === "failed" || s === "expired" || s === "suspended") return { color: "#EF4444", bg: "rgba(239,68,68,0.14)" };
  return { color: "#F59E0B", bg: "rgba(245,158,11,0.14)" };
}

// ─── Plan icon (fallback by name) ─────────────────────────────────────────────

function PlanIcon({ name, size = 16 }: { name: string; size?: number }) {
  const n = name.toLowerCase();
  if (n.includes("enterprise") || n.includes("enterprise")) return <Building2 size={size} />;
  if (n.includes("pro") || n.includes("standard")) return <Shield size={size} />;
  return <Zap size={size} />;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function BillingPage() {
  const [plans, setPlans]       = useState<Plan[]>([]);
  const [billing, setBilling]   = useState<BackendBilling | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null); // invoice id in flight
  const [downloadErr, setDownloadErr] = useState<string | null>(null);

  const companyId = getCompanyId();

  // The PDF is streamed behind the same auth as everything else, so we pull it as a blob
  // and hand it to the browser — a plain link would drop the Authorization header and 401.
  const downloadInvoice = async (inv: Invoice) => {
    if (downloading) return;
    setDownloading(inv.id); setDownloadErr(null);
    let url: string | null = null;
    try {
      const blob = await api.getBlob(`/owner/companies/${companyId}/invoices/${inv.id}/pdf`);
      url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `invoice-${inv.invoiceNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      setDownloadErr(e instanceof Error ? e.message : "Couldn't download that invoice.");
    } finally {
      // Revoke on the next tick — revoking synchronously can cancel the click's download.
      if (url) setTimeout(() => URL.revokeObjectURL(url!), 10_000);
      setDownloading(null);
    }
  };

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get<BackendPlan[]>("/owner/plans"),
      api.get<BackendBilling>(`/owner/companies/${companyId}/billing`),
      api.get<BackendInvoice[]>(`/owner/companies/${companyId}/invoices`),
    ])
      .then(([rawPlans, rawBilling, rawInvoices]) => {
        setPlans((rawPlans ?? []).map(toPlan));
        setBilling(rawBilling ?? null);
        setInvoices((rawInvoices ?? []).map(toInvoice));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load billing"))
      .finally(() => setLoading(false));
  }, [companyId]);

  const currentPlan = billing?.current_plan ?? null;
  const daysLeft    = currentPlan?.days_left ?? null;

  const capStyle: React.CSSProperties = {
    fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600,
    color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.07em",
  };

  if (loading) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>Loading…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
        <AlertCircle size={16} style={{ color: "#EF4444" }} />
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "#EF4444" }}>{error}</span>
      </div>
    );
  }

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
        {currentPlan ? (
          <div style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 24px", display: "flex", alignItems: "center", gap: 24 }}>
            <div style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: "var(--secondary)", display: "flex", alignItems: "center", justifyContent: "center", color: currentPlan.color ?? "var(--primary)", flexShrink: 0 }}>
              <PlanIcon name={currentPlan.name} size={22} />
            </div>

            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 16, fontWeight: 700, color: "var(--foreground)" }}>
                  {currentPlan.name} Plan
                </span>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600, color: "#10B981", backgroundColor: "rgba(16,185,129,0.14)", borderRadius: 20, padding: "2px 8px" }}>
                  {billing?.status ?? "Active"}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>
                  ${currentPlan.price}/month
                </span>
                {currentPlan.renews_on && (<>
                  <span style={{ width: 3, height: 3, borderRadius: "50%", backgroundColor: "var(--muted-foreground)" }} />
                  <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>
                    Renews on <strong style={{ color: "var(--foreground)" }}>{currentPlan.renews_on}</strong>
                  </span>
                </>)}
                {daysLeft != null && (<>
                  <span style={{ width: 3, height: 3, borderRadius: "50%", backgroundColor: "var(--muted-foreground)" }} />
                  <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>
                    {daysLeft} days remaining
                  </span>
                </>)}
              </div>
            </div>

            {daysLeft != null && daysLeft <= 7 && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 12px", backgroundColor: "rgba(245,158,11,0.14)", borderRadius: 8, border: "1px solid rgba(245,158,11,0.35)" }}>
                <AlertCircle size={14} style={{ color: "#F59E0B" }} />
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 500, color: "#F59E0B" }}>Expiring soon</span>
              </div>
            )}

            <button
              disabled
              title="Plan changes coming soon — contact support"
              style={{
                fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600,
                padding: "8px 16px", borderRadius: 8, border: "none",
                backgroundColor: "var(--muted)", color: "var(--muted-foreground)",
                cursor: "not-allowed", display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
              }}>
              Manage Plan <ChevronRight size={14} />
            </button>
          </div>
        ) : (
          <div style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 24px", display: "flex", alignItems: "center", gap: 14 }}>
            <AlertCircle size={18} style={{ color: "#F59E0B", flexShrink: 0 }} />
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--foreground)" }}>
              No active plan. Choose a plan below to unlock board features.
            </span>
          </div>
        )}

        {/* ── Plans ── */}
        {plans.length > 0 && (
          <div>
            <div style={{ marginBottom: 14 }}>
              <span style={capStyle}>Available Plans</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(plans.length, 3)}, 1fr)`, gap: 16 }}>
              {plans.map((plan) => {
                const isCurrent = plan.id === currentPlan?.id;

                return (
                  <div
                    key={plan.id}
                    style={{
                      backgroundColor: "var(--card)",
                      border: `2px solid ${isCurrent ? plan.color : "var(--border)"}`,
                      borderRadius: 12, padding: 20,
                      position: "relative", display: "flex", flexDirection: "column", gap: 16,
                      boxShadow: isCurrent ? `0 0 0 3px ${plan.color}22` : "none",
                    }}
                  >
                    {isCurrent && (
                      <div style={{ position: "absolute", top: -1, right: 16, backgroundColor: plan.color, color: "#fff", fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 700, padding: "2px 10px", borderRadius: "0 0 6px 6px", letterSpacing: "0.05em" }}>
                        CURRENT
                      </div>
                    )}
                    {plan.popular && !isCurrent && (
                      <div style={{ position: "absolute", top: -1, right: 16, backgroundColor: "var(--primary)", color: "#fff", fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 700, padding: "2px 10px", borderRadius: "0 0 6px 6px", letterSpacing: "0.05em" }}>
                        POPULAR
                      </div>
                    )}

                    {/* Plan header */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: isCurrent ? `${plan.color}22` : "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", color: isCurrent ? plan.color : "var(--muted-foreground)" }}>
                        <PlanIcon name={plan.name} />
                      </div>
                      <div>
                        <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 700, color: "var(--foreground)" }}>{plan.name}</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: isCurrent ? plan.color : "var(--foreground)" }}>
                          ${plan.price}<span style={{ fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 400, color: "var(--muted-foreground)" }}>/mo</span>
                        </div>
                      </div>
                    </div>

                    {/* Features */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                      {plan.features.map((f) => (
                        <div key={f} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ width: 16, height: 16, borderRadius: "50%", backgroundColor: "rgba(16,185,129,0.14)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <Check size={9} style={{ color: "#10B981" }} />
                          </span>
                          <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--foreground)" }}>{f}</span>
                        </div>
                      ))}
                    </div>

                    {/* Action */}
                    <button
                      disabled
                      title={isCurrent ? "Current plan" : "Plan changes coming soon — contact support"}
                      style={{
                        marginTop: "auto", width: "100%",
                        fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600,
                        padding: "8px 0", borderRadius: 8,
                        border: isCurrent ? "none" : "1px solid var(--border)",
                        backgroundColor: isCurrent ? `${plan.color}22` : "transparent",
                        color: isCurrent ? plan.color : "var(--muted-foreground)",
                        cursor: "not-allowed",
                      }}
                    >
                      {isCurrent ? "Current Plan" : plan.price > (currentPlan?.price ?? 0) ? "Upgrade" : "Downgrade"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Invoices ── */}
        <div>
          <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={capStyle}>Transaction History</span>
            {downloadErr && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-sans)", fontSize: 12, color: "#EF4444" }}>
                <AlertCircle size={13} /> {downloadErr}
              </span>
            )}
          </div>
          <div style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
            {invoices.length === 0 ? (
              <div style={{ padding: "32px 0", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>
                No transactions yet
              </div>
            ) : (
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
                  {invoices.map((inv, i) => {
                    const s = invoiceStatusStyle(inv.status);
                    return (
                      <tr key={inv.id} style={{ backgroundColor: i % 2 === 0 ? "var(--card)" : "var(--background)" }}>
                        <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--foreground)" }}>
                          {inv.date}
                        </td>
                        <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted-foreground)" }}>
                          {inv.invoiceNumber}
                        </td>
                        <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--foreground)" }}>
                          {inv.plan}
                        </td>
                        <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: "var(--foreground)", textAlign: "right" }}>
                          {inv.currency} ${inv.amount.toFixed(2)}
                        </td>
                        <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", textAlign: "right" }}>
                          <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600, color: s.color, backgroundColor: s.bg, borderRadius: 20, padding: "2px 10px" }}>
                            {inv.status}
                          </span>
                        </td>
                        <td style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)", textAlign: "right", whiteSpace: "nowrap" }}>
                          <button
                            onClick={() => downloadInvoice(inv)}
                            disabled={downloading === inv.id}
                            title={`Download invoice ${inv.invoiceNumber} (PDF)`}
                            style={{
                              display: "inline-flex", alignItems: "center", gap: 5,
                              fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600,
                              padding: "5px 10px", borderRadius: 6, border: "1px solid var(--border)",
                              backgroundColor: "transparent",
                              color: downloading === inv.id ? "var(--muted-foreground)" : "var(--foreground)",
                              cursor: downloading === inv.id ? "default" : "pointer",
                            }}
                            onMouseEnter={(e) => { if (downloading !== inv.id) { const b = e.currentTarget; b.style.borderColor = "var(--primary)"; b.style.color = "var(--primary)"; } }}
                            onMouseLeave={(e) => { const b = e.currentTarget; b.style.borderColor = "var(--border)"; b.style.color = downloading === inv.id ? "var(--muted-foreground)" : "var(--foreground)"; }}
                          >
                            <Download size={12} /> {downloading === inv.id ? "…" : "PDF"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
