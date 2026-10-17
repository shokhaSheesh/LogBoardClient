import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { ArrowLeft, CircleDollarSign, HandCoins, Info, Package } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { fmtDate } from "../lib/dates";
import { friendlyError } from "../components/feedback";
import { Dash } from "../components/Dash";
import { Kpi } from "../components/Kpi";
import { PeriodFilter, ALL_TIME, type Period, type PeriodMode } from "../components/PeriodFilter";
import { ScrollPane } from "../components/ScrollX";

// ─── Dispatcher KPI (/workspace/payouts/kpi) ──────────────────────────────────
//
// What each dispatcher earned in a period: the loads of theirs that were COMPLETED in it
// (the same loads the Payouts page lists), and their percent of those loads' rates.
// Dispatchers on the left, the picked one's loads on the right — the list a dispatcher
// would otherwise bring the owner at month end.

interface Row { dispatcher_id: string; name: string; loads: number; rate_total: number; percent_min: number; percent_max: number; by_table?: number; bonus?: number; amount: number }
interface Summary { rows: Row[]; totals: { loads: number; rate_total: number; amount: number } }
interface Rule { gross_from: number; gross_to: number | null; rpm_from: number; rpm_to: number | null; percent: number; bonus?: number }
// One work week of a dispatcher: the whole week's gross, miles and RPM (they pick the table's
// percent), the window's loads in it and what they earned.
interface WeekRow {
  week_start: string; week_end: string; loads: number; gross: number; miles: number; rpm: number;
  table_percent: number; rule: Rule | null; by_table: number; percent_min: number; percent_max: number;
  bonus: number; // the week's bonus, when the week ends in the period (a bonus belongs to the month its week ends in)
  amount: number;
  next: { gross_needed: number; percent: number } | null;
}
interface LoadRow { payout_id: string; load_ref: string; broker: string; driver: string; completed_at: string; rate: number; percent: number; amount: number }

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const whole = (n: number) => `$${Math.round(n).toLocaleString()}`;
// "2%", or "1–2%" when the percent changed inside the period, with "KPI table" when the
// table paid any of it; null when nothing was paid.
const pctRange = (min: number, max: number) => min === max ? `${max}%` : `${min}–${max}%`;
const pctLabel = (r: Row) => r.percent_max === 0 ? null : (r.by_table ? "KPI table · " : "") + pctRange(r.percent_min, r.percent_max);
const range2 = (from: number, to: number | null, fmt: (n: number) => string) => to == null ? `${fmt(from)}+` : `${fmt(from)}–${fmt(to)}`;
// What paid a week: a fixed percent, the rule it matched (with its bonus), or the fallback.
// A week with only a bonus here (its loads were completed in the period before) shows its rule.
const paidBy = (w: WeekRow) => w.by_table === 0 && !w.bonus
  ? `Fixed ${pctRange(w.percent_min, w.percent_max)}`
  : w.rule
    ? `${range2(w.rule.gross_from, w.rule.gross_to, whole)} · RPM ${range2(w.rule.rpm_from, w.rule.rpm_to, (n) => n.toFixed(2))} → ${w.table_percent}%${w.bonus ? ` + ${whole(w.bonus)} bonus` : ""}`
    : `Below the table → ${w.table_percent}%`;
const HOW = "Loads completed in the period, for the dispatcher on the load at that time. KPI = load rate × the dispatcher's percent: a fixed one, or — paid by the KPI table — the percent their whole work week earns from its gross and RPM, plus the rule's bonus once a week (in the month the week ends). Weeks are added up for a month. Added and deducted amounts don't count.";

export function KpiPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();

  // The period lives in the address, so the page opens on what Payouts was showing and a
  // link to it shows the same thing to whoever opens it.
  const mode = (params.get("mode") as PeriodMode | null) ?? "all";
  const period: Period = mode === "all" ? ALL_TIME : { mode, from: params.get("from") ?? "", to: params.get("to") ?? "" };
  const setPeriod = (p: Period) => setParams(p.mode === "all" ? {} : { mode: p.mode, from: p.from, to: p.to }, { replace: true });
  const range = [period.from && `from=${period.from}`, period.to && `to=${period.to}`].filter(Boolean).join("&");

  const [data, setData]       = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [picked, setPicked]   = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    setLoading(true); setError(null);
    api.get<Summary>(`/kpi/summary${range ? `?${range}` : ""}`)
      .then((d) => {
        if (gone) return;
        const next = d ?? { rows: [], totals: { loads: 0, rate_total: 0, amount: 0 } };
        setData(next);
        // Keep the same dispatcher open across a period change when they're still listed;
        // otherwise open the first one, so the loads side is never blank.
        setPicked((cur) => (cur && next.rows.some((r) => r.dispatcher_id === cur) ? cur : next.rows[0]?.dispatcher_id ?? null));
      })
      .catch((e) => { if (!gone) setError(friendlyError(e, "Couldn't work out the KPI.")); })
      .finally(() => { if (!gone) setLoading(false); });
    return () => { gone = true; };
  }, [range]);

  // The picked dispatcher's loads.
  // The picked dispatcher's weeks; and, once a week is opened, that week's loads.
  const [weeks, setWeeks]           = useState<WeekRow[] | null>(null);
  const [weeksError, setWeeksError] = useState(false);
  const [week, setWeek]             = useState<WeekRow | null>(null);
  useEffect(() => {
    setWeek(null);
    if (!picked) { setWeeks(null); return; }
    let gone = false;
    setWeeks(null); setWeeksError(false);
    api.get<WeekRow[]>(`/kpi/weeks?dispatcher_id=${picked}${range ? `&${range}` : ""}`)
      .then((wks) => { if (!gone) setWeeks(wks ?? []); })
      .catch(() => { if (!gone) setWeeksError(true); });
    return () => { gone = true; };
  }, [picked, range]);

  const [loads, setLoads]           = useState<LoadRow[] | null>(null);
  const [loadsError, setLoadsError] = useState(false);
  useEffect(() => {
    if (!picked || !week) { setLoads(null); return; }
    let gone = false;
    setLoads(null); setLoadsError(false);
    // The week's loads inside the period: a week at the edge of a month shows only that
    // month's loads, the ones its KPI line counts.
    const from = period.from && period.from > week.week_start ? period.from : week.week_start;
    const to = period.to && period.to < week.week_end ? period.to : week.week_end;
    api.get<LoadRow[]>(`/kpi/loads?dispatcher_id=${picked}&from=${from}&to=${to}`)
      .then((rows) => { if (!gone) setLoads(rows ?? []); })
      .catch(() => { if (!gone) setLoadsError(true); });
    return () => { gone = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picked, week, range]);

  const current = data?.rows.find((r) => r.dispatcher_id === picked) ?? null;

  const card: React.CSSProperties = { backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden", display: "flex", flexDirection: "column", minHeight: 0 };
  const th = (align: "left" | "right" = "left"): React.CSSProperties => ({
    position: "sticky", top: 0, zIndex: 1, padding: "9px 14px", textAlign: align, backgroundColor: "var(--card)", borderBottom: "1px solid var(--border)",
    fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-foreground)", whiteSpace: "nowrap",
  });
  const td = (align: "left" | "right" = "left"): React.CSSProperties => ({
    padding: "9px 14px", textAlign: align, borderBottom: "1px solid var(--border)", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--foreground)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
  });
  const quiet: React.CSSProperties = { padding: "48px 20px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" };
  const chip = (set: boolean): React.CSSProperties => ({
    fontFamily: "var(--font-sans)", fontSize: 11.5, fontWeight: 600, borderRadius: 5, padding: "1px 7px", whiteSpace: "nowrap",
    color: set ? "var(--primary)" : "var(--muted-foreground)", backgroundColor: set ? "var(--primary-soft)" : "var(--muted)",
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "var(--background)", overflow: "hidden" }}>
      <div style={{ flex: 1, minHeight: 0, padding: "14px 24px 20px", display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Where you are, and which period */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px 12px", flexWrap: "wrap", flexShrink: 0 }}>
          <button onClick={() => navigate("/workspace/payouts")}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer", padding: "4px 7px", borderRadius: 6 }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--muted)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}>
            <ArrowLeft size={14} /> Payouts
          </button>
          <span style={{ color: "var(--border)", userSelect: "none" }}>/</span>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 17, fontWeight: 700, color: "var(--foreground)", letterSpacing: "-0.01em" }}>Dispatcher KPI</span>
          {/* The counting rule, for whoever wants it — one hover away instead of a paragraph */}
          <span title={HOW} aria-label={HOW} role="img" style={{ display: "inline-flex", color: "var(--muted-foreground)", cursor: "help" }}><Info size={15} /></span>
          <div style={{ flex: 1 }} />
          <PeriodFilter value={period} onChange={setPeriod} weekStartDay={user?.company?.week_start_day ?? 1} />
        </div>

        {/* The period in three numbers */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, flexShrink: 0 }}>
          <Kpi icon={<Package size={18} />} label="Completed loads" value={(data?.totals.loads ?? 0).toLocaleString()} />
          <Kpi icon={<CircleDollarSign size={18} />} label="Total rate" value={whole(data?.totals.rate_total ?? 0)} />
          <Kpi icon={<HandCoins size={18} />} label="KPI to pay" value={money(data?.totals.amount ?? 0)} tone={(data?.totals.amount ?? 0) > 0 ? "good" : "plain"} />
        </div>

        {/* Dispatchers, and the picked one's loads */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(300px,1fr)_minmax(0,2fr)]" style={{ gap: 12, flex: 1, minHeight: 0, opacity: loading && data ? 0.55 : 1, transition: "opacity 0.15s" }}>

          <div style={card}>
            <div style={{ padding: "11px 14px", borderBottom: "1px solid var(--border)", fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 700, color: "var(--foreground)", flexShrink: 0 }}>Dispatchers</div>
            <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
              {error ? <div style={{ ...quiet, color: "#EF4444" }}>{error}</div>
                : !data ? <div style={quiet}>Loading…</div>
                : data.rows.length === 0 ? <div style={quiet}>No completed loads in this period.</div>
                : data.rows.map((r) => {
                  const active = r.dispatcher_id === picked;
                  const pct = pctLabel(r);
                  return (
                    <button key={r.dispatcher_id} onClick={() => setPicked(r.dispatcher_id)} aria-pressed={active}
                      style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", boxSizing: "border-box", padding: "11px 14px", border: "none", borderBottom: "1px solid var(--border)", textAlign: "left", cursor: "pointer", backgroundColor: active ? "var(--primary-faint)" : "transparent", boxShadow: active ? "inset 3px 0 0 var(--primary)" : "none" }}
                      onMouseEnter={(e) => { if (!active) e.currentTarget.style.backgroundColor = "var(--muted)"; }}
                      onMouseLeave={(e) => { if (!active) e.currentTarget.style.backgroundColor = "transparent"; }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}>
                          <span style={{ fontFamily: "var(--font-sans)", fontSize: 13.5, fontWeight: 600, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name || "Unknown"}</span>
                          <span style={chip(!!pct)}>{pct ?? "No percent"}</span>
                        </div>
                        <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                          {r.loads} {r.loads === 1 ? "load" : "loads"} · {whole(r.rate_total)}{r.bonus ? ` · incl. ${whole(r.bonus)} bonus` : ""}
                        </div>
                      </div>
                      <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 700, color: r.amount > 0 ? "var(--foreground)" : "var(--muted-foreground)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{money(r.amount)}</span>
                    </button>
                  );
                })}
            </div>
          </div>

          <div style={card}>
            {/* Week by week first; opening a week shows the loads completed in it. */}
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "9px 14px", minHeight: 42, boxSizing: "border-box", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
              {week ? (
                <>
                  <button onClick={() => setWeek(null)}
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer", padding: "3px 6px", borderRadius: 6 }}
                    onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--muted)"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}>
                    <ArrowLeft size={14} /> All weeks
                  </button>
                  <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 700, color: "var(--foreground)" }}>{fmtDate(week.week_start)} – {fmtDate(week.week_end)}</span>
                  <span style={{ marginLeft: "auto", fontFamily: "var(--font-sans)", fontSize: 12.5, color: "var(--muted-foreground)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    {week.loads} {week.loads === 1 ? "load" : "loads"} · {paidBy(week)} · <strong style={{ color: "var(--foreground)" }}>{money(week.amount)}</strong>
                  </span>
                </>
              ) : (
                <>
                  <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 700, color: "var(--foreground)" }}>{current ? `${current.name || "Unknown"} · by week` : "Weeks"}</span>
                  {current && (
                    <span style={{ marginLeft: "auto", fontFamily: "var(--font-sans)", fontSize: 12.5, color: "var(--muted-foreground)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                      {current.loads} {current.loads === 1 ? "load" : "loads"} · {whole(current.rate_total)} · <strong style={{ color: "var(--foreground)" }}>{money(current.amount)}</strong>
                    </span>
                  )}
                </>
              )}
            </div>
            <ScrollPane style={{ flex: 1, overflow: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
              {!current ? <div style={quiet}>{data && data.rows.length === 0 ? "Nothing to show for this period." : "Pick a dispatcher."}</div>
                : !week ? (
                  weeksError ? <div style={{ ...quiet, color: "#EF4444" }}>Couldn't load the weeks.</div>
                  : !weeks ? <div style={quiet}>Loading weeks…</div>
                  : (
                  <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
                    <thead>
                      <tr>
                        <th style={th()}>Week</th>
                        <th style={th("right")}>Gross</th>
                        <th style={th("right")}>RPM</th>
                        <th style={th()}>Paid by</th>
                        <th style={th("right")}>Loads</th>
                        <th style={th("right")}>KPI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {weeks.map((w) => (
                        <tr key={w.week_start} tabIndex={0} role="button" aria-label={`Open the week of ${fmtDate(w.week_start)}`}
                          onClick={() => setWeek(w)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setWeek(w); } }}
                          style={{ cursor: "pointer" }}
                          onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--primary-faint)"; }}
                          onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}>
                          <td style={td()}>{fmtDate(w.week_start)} – {fmtDate(w.week_end)}</td>
                          <td style={td("right")}>{whole(w.gross)}</td>
                          <td style={{ ...td("right"), color: w.miles > 0 ? "var(--foreground)" : "var(--muted-foreground)" }} title={w.miles > 0 ? `${Math.round(w.miles).toLocaleString()} mi with deadhead` : "No miles recorded on these loads"}>
                            {w.miles > 0 ? `$${w.rpm.toFixed(2)}` : "no miles"}
                          </td>
                          <td style={td()}>
                            <span style={chip(true)}>{paidBy(w)}</span>
                            {!(w.by_table === 0 && !w.bonus) && w.next && (
                              <span style={{ marginLeft: 8, fontSize: 12, color: "var(--muted-foreground)" }}>
                                {whole(w.next.gross_needed)} more → {w.next.percent}%
                              </span>
                            )}
                          </td>
                          <td style={td("right")}>{w.loads}</td>
                          <td style={{ ...td("right"), fontWeight: 600 }}>{money(w.amount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  )
                )
                : loadsError ? <div style={{ ...quiet, color: "#EF4444" }}>Couldn't load these loads.</div>
                : !loads ? <div style={quiet}>Loading loads…</div>
                : loads.length === 0 ? <div style={quiet}>{week.bonus ? `No loads of this week were completed in this period; it's here for its ${whole(week.bonus)} bonus.` : "No loads this week."}</div>
                : (
                  <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
                    <thead>
                      <tr>
                        <th style={th()}>Load</th>
                        <th style={th()}>Driver</th>
                        <th style={th()}>Completed</th>
                        <th style={th("right")}>Rate</th>
                        <th style={th("right")}>Percent</th>
                        <th style={th("right")}>KPI</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loads.map((l) => (
                        <tr key={l.payout_id}>
                          <td style={td()}>
                            {l.broker && <span style={{ color: "var(--muted-foreground)" }}>{l.broker} - </span>}
                            <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--primary)" }}>{l.load_ref || "Load"}</span>
                          </td>
                          <td style={td()}>{l.driver || <Dash />}</td>
                          <td style={{ ...td(), color: "var(--muted-foreground)" }}>{fmtDate(l.completed_at)}</td>
                          <td style={td("right")}>{whole(l.rate)}</td>
                          <td style={{ ...td("right"), color: "var(--muted-foreground)" }}>{l.percent}%</td>
                          <td style={{ ...td("right"), fontWeight: 600 }}>{money(l.amount)}</td>
                        </tr>
                      ))}
                      {week.bonus > 0 && (
                        <tr>
                          <td style={{ ...td(), color: "var(--muted-foreground)" }} colSpan={5}>Week bonus</td>
                          <td style={{ ...td("right"), fontWeight: 600, color: "var(--primary)" }}>+{money(week.bonus)}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                )}
            </ScrollPane>
          </div>
        </div>
      </div>
    </div>
  );
}
