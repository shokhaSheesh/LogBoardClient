import { useState, useEffect } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import { Package, CircleDollarSign, Wallet, AlertCircle } from "lucide-react";
import { api } from "../lib/api";
import { PageLoader } from "../components/PageLoader";
import { fmtDateRange } from "../lib/dates";
import { Kpi } from "../components/Kpi";
import { useTheme } from "../lib/theme";
import { PeriodFilter, type Period } from "../components/PeriodFilter";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WeekData {
  label: string;
  weekKey: string;
  // The span actually covered, as the server reports it (inclusive days).
  periodStart: string;
  periodEnd: string;
  weekStartDay: number; // 0=Sunday … 6=Saturday — the company's work-week anchor
  completedLoads: number;
  totalGross: number;
  dispatcherPayout: number;
  loadsDelta:    number | null;
  grossDelta:    number | null;
  topDriversByGross: { name: string; gross: number; loads: number }[];
  topDriversByRpm:   { name: string; rpm: number; miles: number }[];
  topDispatchers:    { name: string; payout: number; loads: number }[];
  // Gross of the week's completed loads by the state they were picked up / delivered in.
  topPickupStates:   { state: string; gross: number; loads: number }[];
  topDeliveryStates: { state: string; gross: number; loads: number }[];
  // The week's highest-earning completed loads.
  topLoads: { loadRef: string; broker: string; driver: string; origin: string; destination: string; gross: number; miles: number }[];
  // Dense per-day series for the selected week (backend `daily`): one entry per
  // day, ascending, quiet days included as zeros — drives the two line charts.
  daily: { date: string; gross: number; completedLoads: number }[];
}

// ─── Backend mapper ───────────────────────────────────────────────────────────

interface BackendKpi { value: number; prev: number; delta_pct: number | null; }
interface BackendDashboard {
  week?: { start: string; end: string; label: string };
  period?: { kind: "week" | "range" | "all"; start: string; end: string };
  week_start_day?: number; // 0=Sunday … 6=Saturday — the company's work-week anchor
  kpis?: {
    loads?:           BackendKpi;
    completed_loads?: BackendKpi;
    total_gross?:     BackendKpi;
    total_miles?:     BackendKpi;
  };
  dispatcher_payout?: number;
  top_drivers_by_gross?: { name: string; gross: number; loads: number }[];
  top_drivers_by_rpm?:   { name: string; rpm: number; miles: number }[];
  top_dispatchers?:      { name: string; payout: number; loads: number }[];
  top_pickup_states?:    { state: string; gross: number; loads: number }[];
  top_delivery_states?:  { state: string; gross: number; loads: number }[];
  top_loads?: { load_ref: string; broker: string; driver: string; origin: string; destination: string; gross: number; miles: number }[];
  daily?: { date: string; gross: number; completed_loads: number }[];
}

// Shift a calendar date (YYYY-MM-DD) by n days. Pure UTC math so the browser's own
// timezone can never drift the result — the backend buckets days in its business
// timezone (APP_TZ), and these strings are plain calendar dates, not instants.
function addDaysISO(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}

function fmtWeekLabel(from: string): string {
  const d   = new Date(from.slice(0, 10) + "T12:00:00");
  if (isNaN(d.getTime())) return from;
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  return fmtDateRange(d, end);
}

function toWeekData(b: BackendDashboard, key: string): WeekData {
  return {
    // Always our own date format — the backend's ready-made label is worded differently.
    label:            fmtWeekLabel(b.week?.start ?? key),
    weekKey:          key,
    periodStart:      b.period?.start ?? b.week?.start ?? key,
    periodEnd:        b.period?.end   ?? b.week?.end   ?? key,
    weekStartDay:     b.week_start_day ?? 1,
    completedLoads:   b.kpis?.completed_loads?.value ?? 0,
    totalGross:       b.kpis?.total_gross?.value     ?? 0,
    dispatcherPayout: b.dispatcher_payout            ?? 0,
    loadsDelta:       b.kpis?.completed_loads?.delta_pct ?? null,
    grossDelta:       b.kpis?.total_gross?.delta_pct     ?? null,
    topDriversByGross: b.top_drivers_by_gross ?? [],
    topDriversByRpm:   b.top_drivers_by_rpm   ?? [],
    topDispatchers:    b.top_dispatchers       ?? [],
    topPickupStates:   b.top_pickup_states     ?? [],
    topDeliveryStates: b.top_delivery_states   ?? [],
    topLoads: (b.top_loads ?? []).map((l) => ({ loadRef: l.load_ref, broker: l.broker, driver: l.driver, origin: l.origin, destination: l.destination, gross: l.gross, miles: l.miles })),
    daily: (b.daily ?? []).map((d) => ({ date: d.date, gross: d.gross, completedLoads: d.completed_loads })),
  };
}

// "2026-06-22" → "Mon 22" for the daily-series X axis.
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function fmtDayLabel(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  if (Number.isNaN(d.getTime())) return dateStr;
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()}`;
}

// Two-letter codes → names, so a ranking reads "Texas", not "TX". Anything not listed
// (a typo, a Canadian province) is shown as it was entered.
const US_STATES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California", CO: "Colorado", CT: "Connecticut",
  DE: "Delaware", DC: "Washington, D.C.", FL: "Florida", GA: "Georgia", HI: "Hawaii", ID: "Idaho", IL: "Illinois",
  IN: "Indiana", IA: "Iowa", KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri", MT: "Montana",
  NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey", NM: "New Mexico", NY: "New York",
  NC: "North Carolina", ND: "North Dakota", OH: "Ohio", OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania",
  RI: "Rhode Island", SC: "South Carolina", SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah",
  VT: "Vermont", VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
};
const stateName = (code: string) => US_STATES[code.toUpperCase()] ?? code;
const nLoads = (n: number) => `${n} ${n === 1 ? "load" : "loads"}`;

// ─── Charts ───────────────────────────────────────────────────────────────────
//
// One colour does all the work here: Pine. Every chart on this page shows a single
// measure, so the colour never has to tell two things apart — the title says what the
// marks are, and length or height says how much. Text stays in the text colours; the
// green is only ever a mark.

const INK = { fontFamily: "var(--font-sans)", fontSize: 11, fill: "var(--muted-foreground)" } as const;
const money  = (n: number) => `$${Math.round(n).toLocaleString()}`;
// Axis money: "$0", "$850", "$12k", "$1.2M" — short enough to never crowd the plot.
const axisMoney = (n: number) =>
  n >= 1_000_000 ? `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`
  : n >= 1_000 ? `$${(n / 1_000).toFixed(n < 10_000 ? 1 : 0).replace(/\.0$/, "")}k`
  : `$${n}`;

function ChartCard({ title, total, children }: { title: string; total?: string; children: React.ReactNode }) {
  return (
    <div style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 700, color: "var(--foreground)" }}>{title}</span>
        {total && <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{total}</span>}
      </div>
      {children}
    </div>
  );
}

// The box that follows the pointer: the day, then the figure — in the page's own card
// colours so it reads the same in light and dark.
function Tip({ label, value, note, color = "var(--primary)" }: { label: string; value: string; note?: string; color?: string }) {
  return (
    <div style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 11px", boxShadow: "0 8px 24px rgba(0,0,0,0.14)" }}>
      <div style={{ fontFamily: "var(--font-sans)", fontSize: 11.5, color: "var(--muted-foreground)", marginBottom: 2 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 700, color: "var(--foreground)", fontVariantNumeric: "tabular-nums" }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: color, flexShrink: 0 }} />
        {value}
      </div>
      {note && <div style={{ fontFamily: "var(--font-sans)", fontSize: 11.5, color: "var(--muted-foreground)", marginTop: 1 }}>{note}</div>}
    </div>
  );
}

const EmptyChart = ({ height, text }: { height: number; text: string }) => (
  <div style={{ height, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>{text}</div>
);

// A ranking: who, how much, and a bar for how they compare. Every bar starts at zero and
// is the same green — rank is the order they're listed in, not a colour. The figure is
// printed on every row, so nothing here depends on hovering.
function RankList({ rows, empty, bars = true }: { rows: { name: string; value: number; label: string; note: string; sub?: string }[]; empty: string; bars?: boolean }) {
  if (rows.length === 0) return <EmptyChart height={120} text={empty} />;
  const max = Math.max(...rows.map((r) => r.value), 0);
  return (
    <ol style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: bars ? 12 : 0 }}>
      {rows.map((r, i) => (
        <li key={`${r.name}-${i}`} style={{ display: "flex", flexDirection: "column", gap: 5, minWidth: 0, ...(bars ? {} : { padding: "9px 0", borderTop: i === 0 ? "none" : "1px solid var(--border)" }) }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0, fontFamily: "var(--font-sans)", fontSize: 13 }}>
            <span style={{ width: 14, flexShrink: 0, color: "var(--muted-foreground)", fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
            <span title={r.name} style={{ flex: 1, minWidth: 0, fontWeight: 600, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
            <span style={{ fontSize: 12, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{r.note}</span>
            <span style={{ fontWeight: 700, color: "var(--foreground)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{r.label}</span>
          </div>
          {r.sub && (
            <div title={r.sub} style={{ marginLeft: 22, marginTop: -3, fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.sub}</div>
          )}
          {bars && (
            <div style={{ marginLeft: 22, height: 8, borderRadius: 4, backgroundColor: "var(--muted)", overflow: "hidden" }}>
              <div style={{ width: `${max > 0 ? Math.max(1, (r.value / max) * 100) : 0}%`, height: "100%", borderRadius: 4, backgroundColor: "var(--primary)" }} />
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}

// ─── Share-of-gross donut ─────────────────────────────────────────────────────
//
// The one place on this page where colour has to tell things apart: each arc is a state.
// The five hues lead with a soft green and were checked (dataviz validator) for separation
// between neighbouring arcs, colour-blind viewing included — light and dark each have
// their own steps. "Other" is a neutral grey, so it never reads as a sixth state. Colour
// is never the only cue: the list beside the ring names every arc with its amount and share.
const SLICE_COLORS = {
  light: ["#2FBF7F", "#5B9BF0", "#E5A50F", "#8B6CF0", "#F088B0"],
  dark:  ["#22A05B", "#3987E5", "#C98500", "#8B46C9", "#D55181"],
};
const OTHER_COLOR = { light: "#C3CCC7", dark: "#4B5563" };

const RING = { size: 176, r: 68, width: 16, hoverWidth: 24, gapPx: 5 };

function StateDonut({ rows, total, empty }: { rows: { state: string; gross: number; loads: number }[]; total: number; empty: string }) {
  const { theme } = useTheme();
  const mode = theme === "dark" ? "dark" : "light";
  const [hover, setHover] = useState<number | null>(null);

  const shown = rows.filter((r) => r.gross > 0).slice(0, SLICE_COLORS.light.length);
  if (shown.length === 0) return <EmptyChart height={200} text={empty} />;

  // Whatever the named states don't account for — the states below the top five, and loads
  // whose stop has no state — is one grey arc, so the ring is the whole period's gross.
  const named = shown.reduce((sum, r) => sum + r.gross, 0);
  const whole = Math.max(total, named);
  const rest  = whole - named;
  const slices = [
    ...shown.map((r, i) => ({ name: stateName(r.state), value: r.gross, note: nLoads(r.loads), color: SLICE_COLORS[mode][i] })),
    ...(rest > 0.5 ? [{ name: "Other", value: rest, note: "", color: OTHER_COLOR[mode] }] : []),
  ];
  const pct = (v: number) => `${whole > 0 ? Math.round((v / whole) * 100) : 0}%`;

  // Each arc is a stroked circle segment with round ends. A round end sticks out past the
  // segment by half the stroke width, so each segment is drawn shorter by one stroke width
  // plus the gap — that is what leaves clean space between the rounded ends.
  const C = 2 * Math.PI * RING.r;
  const trim = slices.length > 1 ? RING.width + RING.gapPx : 0;
  let at = 0;
  const arcs = slices.map((sl) => {
    const span = (sl.value / whole) * C;
    const arc = { ...sl, start: at + trim / 2, length: Math.max(0.5, span - trim) };
    at += span;
    return arc;
  });
  const active = hover !== null ? slices[hover] : null;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
      <div style={{ position: "relative", width: RING.size, height: RING.size, flexShrink: 0, margin: "0 auto" }}>
        <svg width={RING.size} height={RING.size} viewBox={`0 0 ${RING.size} ${RING.size}`} role="img"
          aria-label={slices.map((sl) => `${sl.name} ${pct(sl.value)}`).join(", ")}
          style={{ display: "block", transform: "rotate(-90deg)", overflow: "visible" }}>
          {arcs.map((a, i) => (
            <circle key={a.name} cx={RING.size / 2} cy={RING.size / 2} r={RING.r} fill="none"
              stroke={a.color} strokeLinecap={slices.length > 1 ? "round" : "butt"}
              strokeWidth={hover === i ? RING.hoverWidth : RING.width}
              strokeDasharray={`${a.length} ${C - a.length}`} strokeDashoffset={-a.start}
              opacity={hover === null || hover === i ? 1 : 0.45}
              onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
              // The arc swells slowly under the pointer, and settles back the same way.
              style={{ pointerEvents: "stroke", cursor: "default", transition: "stroke-width 0.45s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.3s ease" }} />
          ))}
        </svg>
        {/* The whole in the hole — or the arc under the pointer */}
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", pointerEvents: "none", textAlign: "center", padding: "0 34px" }}>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 17, fontWeight: 700, color: "var(--foreground)", fontVariantNumeric: "tabular-nums" }}>
            {axisMoney(Math.round(active ? active.value : whole))}
          </span>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 11.5, color: "var(--muted-foreground)", maxWidth: "100%", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {active ? `${active.name} · ${pct(active.value)}` : "Total gross"}
          </span>
        </div>
      </div>

      <ul style={{ listStyle: "none", margin: 0, padding: 0, flex: "1 1 180px", minWidth: 0, display: "flex", flexDirection: "column", gap: 7 }}>
        {slices.map((sl, i) => (
          <li key={sl.name} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} title={sl.note || undefined}
            style={{ display: "flex", alignItems: "baseline", gap: 8, minWidth: 0, fontFamily: "var(--font-sans)", fontSize: 13, opacity: hover === null || hover === i ? 1 : 0.5, transition: "opacity 0.3s ease" }}>
            <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: sl.color, flexShrink: 0, alignSelf: "center" }} />
            <span style={{ flex: 1, minWidth: 0, fontWeight: 600, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sl.name}</span>
            <span style={{ fontSize: 12, color: "var(--muted-foreground)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{pct(sl.value)}</span>
            <span style={{ fontWeight: 700, color: "var(--foreground)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>{money(sl.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// The day series, grouped so the charts stay readable whatever the span: days up to a
// month, weeks up to four months, months beyond that.
interface Point { label: string; tip: string; gross: number; loads: number }
function toSeries(daily: WeekData["daily"]): { unit: "day" | "week" | "month"; points: Point[] } {
  const n = daily.length;
  if (n <= 31) {
    return { unit: "day", points: daily.map((d) => ({ label: n <= 7 ? fmtDayLabel(d.date) : `${d.date.slice(8, 10)}.${d.date.slice(5, 7)}`, tip: `${fmtDayLabel(d.date)} · ${fmtDateRange(d.date, d.date)}`, gross: d.gross, loads: d.completedLoads })) };
  }
  const groups = new Map<string, { first: string; last: string; gross: number; loads: number }>();
  const byMonth = n > 120;
  daily.forEach((d, i) => {
    const key = byMonth ? d.date.slice(0, 7) : String(Math.floor(i / 7));
    const g = groups.get(key) ?? { first: d.date, last: d.date, gross: 0, loads: 0 };
    g.last = d.date; g.gross += d.gross; g.loads += d.completedLoads;
    groups.set(key, g);
  });
  const manyYears = daily[0].date.slice(0, 4) !== daily[n - 1].date.slice(0, 4);
  return {
    unit: byMonth ? "month" : "week",
    points: [...groups.values()].map((g) => ({
      label: byMonth
        ? `${MONTHS_SHORT[Number(g.first.slice(5, 7)) - 1]}${manyYears ? ` ${g.first.slice(2, 4)}` : ""}`
        : `${g.first.slice(8, 10)}.${g.first.slice(5, 7)}`,
      tip: fmtDateRange(g.first, g.last), gross: g.gross, loads: g.loads,
    })),
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function DashboardPage() {
  // null = "the current week, as the server reckons it". The first request omits every
  // parameter and the response tells us which week that is (anchored to the company's
  // week_start_day, in the server's business timezone) — so we never guess Monday, and
  // never derive the week from the browser's clock.
  const [period, setPeriod]     = useState<Period | null>(null);
  const [thisWeek, setThisWeek] = useState<Period | undefined>(undefined);

  const [cache, setCache]     = useState<Map<string, WeekData>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  // What to ask the server for. It doubles as the cache key.
  const query =
    !period ? ""
    : period.mode === "all" ? "period=all"
    : period.mode === "week" ? `week=${period.from}`
    : `period=range&from=${period.from}&to=${period.to}`;

  useEffect(() => {
    if (cache.has(query)) { setLoading(false); setError(null); return; }
    let stale = false;
    setLoading(true);
    setError(null);
    api.get<BackendDashboard>(query ? `/dashboard?${query}` : "/dashboard")
      .then((data) => {
        if (stale) return;
        // The server names the week it actually returned; trust it over our request.
        const resolved = data.week?.start ?? period?.from ?? "";
        const parsed = toWeekData(data, resolved);
        setCache((prev) => {
          const next = new Map(prev).set(query, parsed);
          if (query === "") next.set(`week=${parsed.periodStart}`, parsed);
          return next;
        });
        if (query === "") {
          // Only this first, parameterless response defines "the current week".
          const wk: Period = { mode: "week", from: parsed.periodStart, to: parsed.periodEnd };
          setThisWeek(wk);
          setPeriod(wk);
        }
      })
      .catch((e) => { if (!stale) setError(e instanceof Error ? e.message : "Failed to load"); })
      .finally(() => { if (!stale) setLoading(false); });
    return () => { stale = true; };
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  // While the next period loads, the last one stays on screen (dimmed) instead of a blank page.
  const [shownData, setShownData] = useState<WeekData | undefined>(undefined);
  const fresh = cache.get(query);
  useEffect(() => { if (fresh) setShownData(fresh); }, [fresh]);
  const week = fresh ?? shownData;

  const series = toSeries(week?.daily ?? []);
  const anyGross = series.points.some((p) => p.gross > 0);
  const anyLoads = series.points.some((p) => p.loads > 0);
  const showDots = series.points.length <= 31;

  const mode = period?.mode ?? "week";

  // The change against the stretch before, straight from the backend's delta_pct.
  const before = mode === "week" ? "last week" : "the period before";
  const change = (v: number | null): { note?: string; noteTone: "plain" | "good" | "bad" } =>
    v == null ? { noteTone: "plain" } : { note: `${v >= 0 ? "+" : ""}${v.toFixed(0)}% vs ${before}`, noteTone: v >= 0 ? "good" : "bad" };

  const navBtn: React.CSSProperties = { width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, border: "1px solid var(--border)", backgroundColor: "var(--card)", color: "var(--muted-foreground)", flexShrink: 0 };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "var(--background)", overflow: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
      <div style={{ padding: "14px 24px 28px", display: "flex", flexDirection: "column", gap: 12, flex: 1 }}>

        {/* ── Which period ── */}
        <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
          <PeriodFilter value={period ?? thisWeek ?? { mode: "week", from: "", to: "" }} onChange={setPeriod}
            weekStartDay={week?.weekStartDay ?? 1} thisWeek={thisWeek} />
        </div>

        {/* ── Loading / error ── */}
        {loading && !week && <PageLoader label="dashboard" />}

        {error && (
          <div style={{ flex: week ? undefined : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: week ? "4px 0" : 0 }}>
            <AlertCircle size={16} style={{ color: "#EF4444" }} />
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "#EF4444" }}>{error}</span>
          </div>
        )}

        {week && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12, opacity: loading ? 0.5 : 1, transition: "opacity 0.15s" }}>

            {/* ── The period in three numbers ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12 }}>
              <Kpi icon={<Package size={18} />} label="Completed loads" value={week.completedLoads.toLocaleString()} {...change(week.loadsDelta)} />
              <Kpi icon={<CircleDollarSign size={18} />} label="Gross" value={money(week.totalGross)} {...change(week.grossDelta)} />
              <Kpi icon={<Wallet size={18} />} label="Dispatcher payout" value={money(week.dispatcherPayout)} />
            </div>

            {/* ── Over time ── */}
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]" style={{ gap: 12 }}>
              <ChartCard title={`Gross by ${series.unit}`} total={`${money(week.totalGross)} total`}>
                {!anyGross ? <EmptyChart height={240} text="No gross recorded in this period." /> : (
                  <ResponsiveContainer width="100%" height={240}>
                    <AreaChart data={series.points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <defs>
                        <linearGradient id="grossFill" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.2} />
                          <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="label" tick={INK} axisLine={false} tickLine={false} tickMargin={8} minTickGap={16} />
                      <YAxis tickFormatter={axisMoney} tick={INK} axisLine={false} tickLine={false} width={46} />
                      <Tooltip cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1, strokeDasharray: "3 3" }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload as Point;
                          return <Tip label={d.tip} value={money(d.gross)} note={`${nLoads(d.loads)} completed`} />;
                        }} />
                      <Area type="monotone" dataKey="gross" stroke="var(--primary)" strokeWidth={2} fill="url(#grossFill)"
                        dot={showDots ? { r: 3.5, fill: "var(--primary)", stroke: "var(--card)", strokeWidth: 2 } : false}
                        activeDot={{ r: 5.5, fill: "var(--primary)", stroke: "var(--card)", strokeWidth: 2 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>

              <ChartCard title={`Completed loads by ${series.unit}`} total={`${week.completedLoads.toLocaleString()} total`}>
                {!anyLoads ? <EmptyChart height={240} text="No loads completed in this period." /> : (
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={series.points} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%">
                      <CartesianGrid vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="label" tick={INK} axisLine={false} tickLine={false} tickMargin={8} minTickGap={16} />
                      <YAxis allowDecimals={false} tick={INK} axisLine={false} tickLine={false} width={28} />
                      <Tooltip cursor={{ fill: "var(--primary-faint)" }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload as Point;
                          return <Tip label={d.tip} value={nLoads(d.loads)} />;
                        }} />
                      <Bar dataKey="loads" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={28} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </ChartCard>
            </div>

            {/* ── Who led ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
              <ChartCard title="Top drivers by gross">
                <RankList empty="No driver gross in this period."
                  rows={week.topDriversByGross.map((d) => ({ name: d.name, value: d.gross, label: money(d.gross), note: nLoads(d.loads) }))} />
              </ChartCard>
              <ChartCard title="Top drivers by rate per mile">
                <RankList empty="No miles recorded in this period."
                  rows={week.topDriversByRpm.map((d) => ({ name: d.name, value: d.rpm, label: `$${d.rpm.toFixed(2)}/mi`, note: `${d.miles.toLocaleString()} mi` }))} />
              </ChartCard>
              <ChartCard title="Top dispatchers by payout">
                <RankList empty="No dispatcher payouts in this period."
                  rows={week.topDispatchers.map((d) => ({ name: d.name, value: d.payout, label: money(d.payout), note: nLoads(d.loads) }))} />
              </ChartCard>
            </div>

            {/* ── Where the money came from, and the loads that made the most ── */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
              <ChartCard title="Gross by pickup state">
                <StateDonut rows={week.topPickupStates} total={week.totalGross} empty="No completed loads with a pickup state in this period." />
              </ChartCard>
              <ChartCard title="Gross by delivery state">
                <StateDonut rows={week.topDeliveryStates} total={week.totalGross} empty="No completed loads with a delivery state in this period." />
              </ChartCard>
              <ChartCard title="Top loads by gross">
                <RankList bars={false} empty="No loads completed in this period."
                  rows={week.topLoads.map((l) => ({
                    // Broker first, then the load ID — the way a load is named on the Board.
                    name: [l.broker, l.loadRef || "Load"].filter(Boolean).join(" - "),
                    value: l.gross, label: money(l.gross),
                    note: l.miles > 0 ? `${Math.round(l.miles).toLocaleString()} mi` : "",
                  }))} />
              </ChartCard>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
