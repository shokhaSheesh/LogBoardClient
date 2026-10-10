import { friendlyError } from "../lib/errors";
import { useState, useEffect } from "react";
import { CreditCard, Check, Zap, Shield, Building2, AlertCircle, Download } from "lucide-react";
import { api, getCompanyId } from "../lib/api";
import { PageLoader } from "../components/PageLoader";
import { fmtDate } from "../lib/dates";

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
  // Driver-seat usage — `used` counts live drivers, `limit` is null for unlimited (and
  // for a plan-less company). Sits beside current_plan because usage is the company's,
  // not the plan's, and is present even when current_plan is null.
  drivers?: { used: number; limit: number | null };
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
  duration: number | null; // billing-cycle length in days (30 monthly, 365 yearly)
}

interface Invoice {
  id: string; invoiceNumber: string; date: string; plan: string;
  amount: number; currency: string; status: string;
}

// ─── Mappers ──────────────────────────────────────────────────────────────────

function toPlan(b: BackendPlan): Plan {
  return {
    id: b.id, name: b.name, price: b.price,
    color: b.color ?? "#178A4C",
    features: b.features ?? [],
    popular: b.popular ?? false,
    duration: b.duration ?? null,
  };
}

function toInvoice(b: BackendInvoice): Invoice {
  const raw = b.date ?? b.created_at ?? "";
  const date = fmtDate(raw) || "—";
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

// ─── Formatting ───────────────────────────────────────────────────────────────

// The cycle is a length in days, so a yearly plan must not read "/month".
function cycleLabel(days: number | null): string {
  if (!days) return "";
  if (days === 30) return "/ month";
  if (days === 365) return "/ year";
  return `/ ${days} days`;
}

// renews_on is a bare YYYY-MM-DD. Build it as a local date — new Date("2026-11-02")
// is UTC midnight, which prints as the previous day west of Greenwich.
function formatDay(ymd: string): string {
  return fmtDate(ymd) || ymd;
}

// ─── Status style ─────────────────────────────────────────────────────────────

function statusStyle(status: string): { color: string; bg: string } {
  const s = status.toLowerCase();
  if (s === "active" || s === "paid") return { color: "var(--secondary-foreground)", bg: "var(--primary-soft)" };
  if (s === "failed" || s === "expired" || s === "suspended") return { color: "#EF4444", bg: "rgba(239,68,68,0.14)" };
  return { color: "#F59E0B", bg: "rgba(245,158,11,0.14)" };
}

// ─── Plan icon (fallback by name) ─────────────────────────────────────────────

function PlanIcon({ name, size = 16 }: { name: string; size?: number }) {
  const n = name.toLowerCase();
  if (n.includes("enterprise")) return <Building2 size={size} />;
  if (n.includes("pro") || n.includes("standard")) return <Shield size={size} />;
  return <Zap size={size} />;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

// Driver-seat usage — "23 of 50 drivers" with a bar, or "23 drivers · Unlimited" when
// the plan has no cap. Reporting only (the backend enforces the cap on driver create).
function DriverSeats({ drivers }: { drivers?: { used: number; limit: number | null } }) {
  if (!drivers) return null;
  const { used, limit } = drivers;
  const unlimited = limit == null;
  const pct = unlimited || limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));
  const nearingCap = !unlimited && limit > 0 && used / limit >= 0.8;
  const barColor = pct >= 100 ? "#EF4444" : nearingCap ? "#F59E0B" : "var(--primary)";

  return (
    <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
      {!unlimited && (
        <div style={{ width: 96, height: 6, borderRadius: 99, backgroundColor: "var(--muted)", overflow: "hidden" }}>
          <div style={{ height: "100%", borderRadius: 99, width: `${pct}%`, backgroundColor: barColor, transition: "width 0.4s ease" }} />
        </div>
      )}
      <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>
        <strong style={{ color: "var(--foreground)" }}>{used}</strong>
        {unlimited
          ? " drivers · Unlimited"
          : <> of <strong style={{ color: "var(--foreground)" }}>{limit}</strong> drivers{pct >= 100 && <span style={{ color: "#EF4444" }}> · Limit reached</span>}</>}
      </span>
    </div>
  );
}

function InlineError({ text }: { text: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-sans)", fontSize: 12, color: "#EF4444" }}>
      <AlertCircle size={13} /> {text}
    </span>
  );
}

const errText = (e: unknown, fallback: string) => friendlyError(e, fallback);

export function BillingPage() {
  const [plans, setPlans]       = useState<Plan[]>([]);
  const [billing, setBilling]   = useState<BackendBilling | null>(null);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);
  const [plansErr, setPlansErr]       = useState<string | null>(null);
  const [invoicesErr, setInvoicesErr] = useState<string | null>(null);
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
      setDownloadErr(errText(e, "Couldn't download that invoice."));
    } finally {
      // Revoke on the next tick — revoking synchronously can cancel the click's download.
      if (url) setTimeout(() => URL.revokeObjectURL(url!), 10_000);
      setDownloading(null);
    }
  };

  useEffect(() => {
    // An owner who hasn't picked a company has nothing to bill — don't request ".../companies//billing".
    if (!companyId) { setError("Choose a company to see its billing."); setLoading(false); return; }
    let cancelled = false;
    setLoading(true); setError(null); setPlansErr(null); setInvoicesErr(null);
    // The three lists load independently: a failed invoice list must not blank out the plan.
    Promise.allSettled([
      api.get<BackendPlan[]>("/owner/plans"),
      api.get<BackendBilling>(`/owner/companies/${companyId}/billing`),
      api.get<BackendInvoice[]>(`/owner/companies/${companyId}/invoices`),
    ]).then(([p, b, inv]) => {
      if (cancelled) return;
      if (b.status === "fulfilled") setBilling(b.value ?? null);
      else setError(errText(b.reason, "Couldn't load billing."));
      if (p.status === "fulfilled") setPlans((p.value ?? []).map(toPlan));
      else { setPlans([]); setPlansErr(errText(p.reason, "Couldn't load the plans.")); }
      if (inv.status === "fulfilled") setInvoices((inv.value ?? []).map(toInvoice));
      else { setInvoices([]); setInvoicesErr(errText(inv.reason, "Couldn't load the invoices.")); }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [companyId]);

  const currentPlan = billing?.current_plan ?? null;
  const daysLeft    = currentPlan?.days_left ?? null;
  // An expired plan reports days_left <= 0 (and/or a terminal status). Guard on both so a
  // lapsed plan reads "Expired", not "Expiring soon" (days_left <= 0 is also <= 7), and so
  // "days remaining" never shows a negative count.
  const planStatus  = (billing?.status ?? "").toLowerCase();
  const isExpired   = ["expired", "suspended", "failed"].includes(planStatus) || (daysLeft != null && daysLeft <= 0);
  const expiringSoon = !isExpired && daysLeft != null && daysLeft <= 7;
  // The pill shows the backend status, except that a lapsed period always reads "Expired".
  const statusLabel = isExpired && !["suspended", "failed"].includes(planStatus) ? "Expired" : (billing?.status || "Active");
  const pill = statusStyle(isExpired ? "expired" : expiringSoon ? "pending" : "active");

  const capStyle: React.CSSProperties = {
    fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600,
    color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.07em",
  };
  const cardStyle: React.CSSProperties = {
    backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 12,
  };

  if (loading) return <PageLoader label="billing" />;

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
      <div style={{ maxWidth: 980, display: "flex", flexDirection: "column", gap: 24 }}>

        {/* ── Status strip ── */}
        {currentPlan ? (
          <div style={{ ...cardStyle, padding: "12px 18px", display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px 20px" }}>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 700, color: pill.color, backgroundColor: pill.bg, borderRadius: 20, padding: "2px 10px", textTransform: "capitalize" }}>
              {statusLabel}
            </span>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--foreground)" }}>
              <strong>{currentPlan.name}</strong>
              {currentPlan.renews_on && (
                <span style={{ color: "var(--muted-foreground)" }}>
                  {" · "}{isExpired ? "ended" : "renews"} {formatDay(currentPlan.renews_on)}
                </span>
              )}
            </span>
            {!isExpired && daysLeft != null && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-sans)", fontSize: 13, color: expiringSoon ? "#B45309" : "var(--muted-foreground)" }}>
                {expiringSoon && <AlertCircle size={13} />}
                {daysLeft} {daysLeft === 1 ? "day" : "days"} left
              </span>
            )}
            <DriverSeats drivers={billing?.drivers} />
          </div>
        ) : (
          <div style={{ ...cardStyle, padding: "14px 18px", display: "flex", alignItems: "center", gap: 12 }}>
            <AlertCircle size={18} style={{ color: "#F59E0B", flexShrink: 0 }} />
            <span style={{ flex: 1, fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--foreground)" }}>
              {billing?.drivers ? `You have ${billing.drivers.used} driver${billing.drivers.used === 1 ? "" : "s"}. ` : ""}
              No active plan. Contact support to choose one and unlock the board.
            </span>
          </div>
        )}

        {/* ── Plans ── */}
        {(plans.length > 0 || plansErr) && (
          <div>
            <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
              <span style={capStyle}>Plans</span>
              {plansErr && <InlineError text={plansErr} />}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 16 }}>
              {plans.map((plan) => {
                const isCurrent = plan.id === currentPlan?.id;
                const badge = isCurrent ? "Current" : plan.popular ? "Popular" : null;

                return (
                  <div
                    key={plan.id}
                    style={{
                      ...cardStyle,
                      border: isCurrent ? "2px solid var(--primary)" : "1px solid var(--border)",
                      // Keep the content box the same size whichever border width is drawn.
                      padding: isCurrent ? 19 : 20,
                      display: "flex", flexDirection: "column", gap: 14,
                      boxShadow: isCurrent ? "0 0 0 4px var(--primary-soft)" : "none",
                    }}
                  >
                    {/* Plan header */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: `${plan.color}22`, display: "flex", alignItems: "center", justifyContent: "center", color: plan.color, flexShrink: 0 }}>
                        <PlanIcon name={plan.name} />
                      </div>
                      <span style={{ flex: 1, minWidth: 0, fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 700, color: "var(--foreground)" }}>{plan.name}</span>
                      {badge && (
                        <span style={{
                          fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 700, borderRadius: 20, padding: "2px 10px",
                          color: isCurrent ? "var(--secondary-foreground)" : "var(--muted-foreground)",
                          backgroundColor: isCurrent ? "var(--primary-soft)" : "var(--muted)",
                        }}>
                          {badge}
                        </span>
                      )}
                    </div>

                    <div style={{ fontFamily: "var(--font-sans)", fontSize: 26, fontWeight: 700, color: "var(--foreground)", letterSpacing: "-0.02em", lineHeight: 1.1 }}>
                      ${plan.price.toLocaleString()}
                      <span style={{ fontSize: 12, fontWeight: 500, color: "var(--muted-foreground)", letterSpacing: 0 }}> {cycleLabel(plan.duration)}</span>
                    </div>

                    {/* Features */}
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 7 }}>
                      {plan.features.map((f) => (
                        <div key={f} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                          <Check size={14} style={{ color: "var(--primary)", flexShrink: 0, marginTop: 2 }} />
                          <span style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, color: "var(--foreground)" }}>{f}</span>
                        </div>
                      ))}
                    </div>

                    {/* Plan changes aren't self-serve, so this is a label, not a button. */}
                    <div style={{
                      fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, textAlign: "center",
                      padding: "8px 0", borderRadius: 8,
                      backgroundColor: isCurrent ? "var(--primary)" : "var(--muted)",
                      color: isCurrent ? "var(--primary-foreground)" : "var(--muted-foreground)",
                    }}>
                      {isCurrent ? "Your plan" : "Contact support to switch"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Invoices ── */}
        <div>
          <div style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={capStyle}>Invoices</span>
            {(invoicesErr || downloadErr) && <InlineError text={(invoicesErr || downloadErr)!} />}
          </div>
          <div style={{ ...cardStyle, overflowX: "auto" }}>
            {invoices.length === 0 ? (
              <div style={{ padding: "32px 0", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>
                {invoicesErr ? "Invoices are unavailable right now" : "No invoices yet"}
              </div>
            ) : (
              <table style={{ width: "100%", minWidth: 560, borderCollapse: "collapse" }}>
                <thead>
                  <tr>
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
                    const s = statusStyle(inv.status);
                    const cell: React.CSSProperties = {
                      padding: "12px 16px", whiteSpace: "nowrap",
                      borderBottom: i === invoices.length - 1 ? "none" : "1px solid var(--border)",
                    };
                    return (
                      <tr key={inv.id}>
                        <td style={{ ...cell, fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--foreground)" }}>
                          {inv.date}
                        </td>
                        <td style={{ ...cell, fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted-foreground)" }}>
                          {inv.invoiceNumber}
                        </td>
                        <td style={{ ...cell, fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--foreground)" }}>
                          {inv.plan}
                        </td>
                        <td style={{ ...cell, fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: "var(--foreground)", textAlign: "right" }}>
                          {inv.currency} ${inv.amount.toFixed(2)}
                        </td>
                        <td style={{ ...cell, textAlign: "right" }}>
                          <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 700, color: s.color, backgroundColor: s.bg, borderRadius: 20, padding: "2px 10px", textTransform: "capitalize" }}>
                            {inv.status}
                          </span>
                        </td>
                        <td style={{ ...cell, textAlign: "right" }}>
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
