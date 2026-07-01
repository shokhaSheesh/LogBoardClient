import { useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Cell, LabelList,
  AreaChart, Area,
} from "recharts";
import { ChevronLeft, ChevronRight, TrendingUp, TrendingDown, Package, DollarSign, Gauge, Trophy, Zap, AlertCircle } from "lucide-react";
import { api } from "../lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WeekData {
  label: string;
  weekKey: string;
  completedLoads: number;
  totalGross: number;
  dispatcherPayout: number;
  loadsDelta:    number | null;
  grossDelta:    number | null;
  topDriversByGross: { name: string; gross: number; loads: number }[];
  topDriversByRpm:   { name: string; rpm: number; miles: number }[];
  topDispatchers:    { name: string; payout: number; loads: number }[];
}

// ─── Backend mapper ───────────────────────────────────────────────────────────

interface BackendKpi { value: number; prev: number; delta_pct: number | null; }
interface BackendDashboard {
  week?: { start: string; end: string; label: string };
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
}

function getMondayOf(d: Date): Date {
  const copy = new Date(d);
  const day  = copy.getDay();
  copy.setDate(copy.getDate() + (day === 0 ? -6 : 1 - day));
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtWeekLabel(from: string): string {
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const d   = new Date(from + "T12:00:00");
  const end = new Date(d);
  end.setDate(end.getDate() + 6);
  return `${MONTHS[d.getMonth()]} ${d.getDate()} – ${MONTHS[end.getMonth()]} ${end.getDate()}`;
}

function toWeekData(b: BackendDashboard, key: string): WeekData {
  return {
    label:            b.week?.label ?? fmtWeekLabel(b.week?.start ?? key),
    weekKey:          key,
    completedLoads:   b.kpis?.completed_loads?.value ?? 0,
    totalGross:       b.kpis?.total_gross?.value     ?? 0,
    dispatcherPayout: b.dispatcher_payout            ?? 0,
    loadsDelta:       b.kpis?.completed_loads?.delta_pct ?? null,
    grossDelta:       b.kpis?.total_gross?.delta_pct     ?? null,
    topDriversByGross: b.top_drivers_by_gross ?? [],
    topDriversByRpm:   b.top_drivers_by_rpm   ?? [],
    topDispatchers:    b.top_dispatchers       ?? [],
  };
}

// ─── Color palettes ───────────────────────────────────────────────────────────

const DRIVER_COLORS = ["#3B82F6", "#6366F1", "#8B5CF6", "#A78BFA", "#C4B5FD"];
const DISP_COLORS   = ["#10B981", "#34D399", "#6EE7B7"];
const RPM_COLORS2   = ["#F59E0B", "#FB923C", "#F97316", "#EA580C", "#DC2626"];

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon, color, bg, trend, trendVal }: {
  label: string; value: string; sub: string;
  icon: React.ReactNode; color: string; bg: string;
  trend: "up" | "down" | "neutral"; trendVal: string;
}) {
  return (
    <div style={{
      backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 12,
      padding: "20px 22px", display: "flex", flexDirection: "column", gap: 12,
      flex: 1, minWidth: 0, position: "relative", overflow: "hidden",
    }}>
      <div style={{ position: "absolute", top: -30, right: -30, width: 100, height: 100, borderRadius: "50%", backgroundColor: bg, opacity: 0.4, filter: "blur(30px)", pointerEvents: "none" }} />
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 28, fontWeight: 700, color: "var(--foreground)", lineHeight: 1.1 }}>{value}</span>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)" }}>{sub}</span>
        </div>
        <div style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span style={{ color }}>{icon}</span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 4, borderTop: "1px solid var(--border)" }}>
        {trend === "up"   && <TrendingUp   size={14} style={{ color: "#10B981" }} />}
        {trend === "down" && <TrendingDown size={14} style={{ color: "#EF4444" }} />}
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: trend === "up" ? "#10B981" : trend === "down" ? "#EF4444" : "var(--muted-foreground)" }}>
          {trendVal}
        </span>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--muted-foreground)" }}>vs last week</span>
      </div>
    </div>
  );
}

// ─── Chart card wrapper ───────────────────────────────────────────────────────

function ChartCard({ title, subtitle, icon, color, bg, children }: {
  title: string; subtitle: string; icon: React.ReactNode; color: string; bg: string; children: React.ReactNode;
}) {
  return (
    <div style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 22px", display: "flex", flexDirection: "column", gap: 16, flex: 1, minWidth: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: bg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <span style={{ color }}>{icon}</span>
        </div>
        <div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>{title}</div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--muted-foreground)" }}>{subtitle}</div>
        </div>
      </div>
      {children}
    </div>
  );
}

// ─── Inline bar labels ────────────────────────────────────────────────────────

function InlineBarLabel({ x = 0, y = 0, width = 0, height = 0, value = 0, prefix = "" }: {
  x?: number; y?: number; width?: number; height?: number; value?: number; prefix?: string;
}) {
  if (width < 50) return null;
  return (
    <text x={x + width - 10} y={y + height / 2} textAnchor="end" dominantBaseline="middle"
      fill="#fff" style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700 }}>
      {prefix}{typeof value === "number" ? value.toLocaleString() : value}
    </text>
  );
}

function RpmBarLabel({ x = 0, y = 0, width = 0, height = 0, value = 0 }: {
  x?: number; y?: number; width?: number; height?: number; value?: number;
}) {
  if (width < 44) return null;
  return (
    <text x={x + width - 10} y={y + height / 2} textAnchor="end" dominantBaseline="middle"
      fill="#fff" style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700 }}>
      ${Number(value).toFixed(2)}/mi
    </text>
  );
}

// ─── Area chart dot ───────────────────────────────────────────────────────────

function ActiveDot({ cx, cy, payload, color, activeIdx, dataIdx }: {
  cx: number; cy: number; payload: { active: boolean }; color: string; activeIdx: number; dataIdx: number;
}) {
  const isActive = payload.active;
  return <circle cx={cx} cy={cy} r={isActive ? 7 : 4} fill={isActive ? color : "#fff"} stroke={color} strokeWidth={2} key={`dot-${activeIdx}-${dataIdx}`} />;
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function DashboardPage() {
  const [weekDate, setWeekDate]   = useState<Date>(() => getMondayOf(new Date()));
  const [cache, setCache]         = useState<Map<string, WeekData>>(new Map());
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);

  const weekKey        = toISODate(weekDate);
  const currentWeekKey = toISODate(getMondayOf(new Date()));

  useEffect(() => {
    if (cache.has(weekKey)) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    api.get<BackendDashboard>(`/dashboard?week=${weekKey}`)
      .then((data) => {
        setCache((prev) => new Map(prev).set(weekKey, toWeekData(data, weekKey)));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLoading(false));
  }, [weekKey]);

  const week = cache.get(weekKey);

  // Sorted cached weeks for trend charts (ascending by date)
  const trendWeeks = [...cache.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, v]) => v);

  const activeIdx = trendWeeks.findIndex((w) => w.weekKey === weekKey);

  const goBack = () => setWeekDate((d) => new Date(d.getTime() - 7 * 86400000));
  const goNext = () => {
    const next = new Date(weekDate.getTime() + 7 * 86400000);
    if (toISODate(next) <= currentWeekKey) setWeekDate(next);
  };

  // Use delta_pct from backend directly
  const trendStr = (v: number | null) => v != null ? `${v >= 0 ? "+" : ""}${v.toFixed(0)}%` : "No prior data";
  const trendDir = (v: number | null): "up" | "down" | "neutral" => v == null ? "neutral" : v >= 0 ? "up" : "down";

  const isAtCurrentWeek = weekKey === currentWeekKey;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "var(--background)", overflow: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>

      {/* ── Week picker header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid var(--border)", backgroundColor: "var(--card)", flexShrink: 0 }}>
        <div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 700, color: "var(--foreground)" }}>Operations Dashboard</div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)" }}>Performance overview for the selected week</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <button onClick={goBack}
            style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, border: "1px solid var(--border)", backgroundColor: "var(--card)", cursor: "pointer", outline: "none", flexShrink: 0 }}>
            <ChevronLeft size={15} style={{ color: "var(--foreground)" }} />
          </button>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minWidth: 188, height: 32, borderRadius: 8, border: "1px solid var(--border)", backgroundColor: "var(--muted)", padding: "0 14px" }}>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: "var(--foreground)", whiteSpace: "nowrap" }}>
              {week ? week.label : fmtWeekLabel(weekKey)}
            </span>
          </div>
          <button onClick={goNext} disabled={isAtCurrentWeek}
            style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, border: "1px solid var(--border)", backgroundColor: "var(--card)", cursor: isAtCurrentWeek ? "not-allowed" : "pointer", opacity: isAtCurrentWeek ? 0.35 : 1, outline: "none", flexShrink: 0 }}>
            <ChevronRight size={15} style={{ color: "var(--foreground)" }} />
          </button>
        </div>
      </div>

      {/* ── Loading / error ── */}
      {loading && !week && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>Loading…</span>
        </div>
      )}

      {error && !week && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <AlertCircle size={16} style={{ color: "#EF4444" }} />
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "#EF4444" }}>{error}</span>
        </div>
      )}

      {week && (
        <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20, flex: 1, opacity: loading ? 0.5 : 1, transition: "opacity 0.15s" }}>

          {/* ── Stat cards ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            <StatCard label="Completed Loads" value={String(week.completedLoads)} sub={`Week of ${week.label}`}
              icon={<Package size={20} />} color="#3B82F6" bg="#DBEAFE" trend={trendDir(week.loadsDelta)} trendVal={trendStr(week.loadsDelta)} />
            <StatCard label="Total Gross Revenue" value={`$${week.totalGross.toLocaleString()}`} sub="All drivers combined"
              icon={<DollarSign size={20} />} color="#10B981" bg="#D1FAE5" trend={trendDir(week.grossDelta)} trendVal={trendStr(week.grossDelta)} />
            <StatCard label="Dispatcher Payout" value={`$${week.dispatcherPayout.toLocaleString()}`} sub="~20% of total gross"
              icon={<Zap size={20} />} color="#F59E0B" bg="#FEF3C7" trend="neutral" trendVal="No prior data" />
          </div>

          {/* ── Row 1: Top drivers gross + RPM ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

              {/* Top 5 by Gross */}
              <ChartCard title="Top 5 Drivers by Gross" subtitle="Total revenue earned this week" icon={<Trophy size={16} />} color="#3B82F6" bg="#DBEAFE">
                <>
                  <svg width={0} height={0} style={{ position: "absolute" }}>
                    <defs>
                      {DRIVER_COLORS.map((c, i) => (
                        <linearGradient key={i} id={`dg${i}`} x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor={c} stopOpacity={0.85} />
                          <stop offset="100%" stopColor={c} />
                        </linearGradient>
                      ))}
                    </defs>
                  </svg>
                  <ResponsiveContainer width="100%" height={230}>
                    <BarChart layout="vertical"
                      data={week.topDriversByGross.map((d, i) => ({ shortName: d.name.split(" ")[0], gross: d.gross, loads: d.loads, rank: i + 1, color: DRIVER_COLORS[i] }))}
                      margin={{ top: 4, right: 16, left: 0, bottom: 4 }} barSize={28}>
                      <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="4 4" />
                      <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                        tick={{ fontFamily: "var(--font-mono)", fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="shortName" width={72}
                        tick={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 500, fill: "var(--foreground)" }} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{ fill: "rgba(59,130,246,0.06)" }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload as { shortName: string; gross: number; loads: number; rank: number; color: string };
                          return (
                            <div style={{ backgroundColor: "#0F172A", border: "1px solid #1E293B", borderRadius: 8, padding: "10px 14px", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
                              <div style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "#64748B", marginBottom: 4 }}>#{d.rank} {d.shortName}</div>
                              <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: d.color }}>${d.gross.toLocaleString()}</div>
                              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#64748B", marginTop: 2 }}>{d.loads} loads</div>
                            </div>
                          );
                        }} />
                      <Bar dataKey="gross" radius={[0, 6, 6, 0]}>
                        {week.topDriversByGross.map((_, i) => <Cell key={i} fill={`url(#dg${i})`} />)}
                        <LabelList content={(props) => <InlineBarLabel {...(props as Parameters<typeof InlineBarLabel>[0])} prefix="$" />} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </>
              </ChartCard>

              {/* Top 5 by RPM */}
              <ChartCard title="Top 5 Drivers by RPM" subtitle="Rate per mile — efficiency metric" icon={<Gauge size={16} />} color="#F59E0B" bg="#FEF3C7">
                <>
                  <svg width={0} height={0} style={{ position: "absolute" }}>
                    <defs>
                      {RPM_COLORS2.map((c, i) => (
                        <linearGradient key={i} id={`rg${i}`} x1="0" y1="0" x2="1" y2="0">
                          <stop offset="0%" stopColor={c} stopOpacity={0.8} />
                          <stop offset="100%" stopColor={RPM_COLORS2[Math.min(i + 1, 4)]} />
                        </linearGradient>
                      ))}
                    </defs>
                  </svg>
                  <ResponsiveContainer width="100%" height={230}>
                    <BarChart layout="vertical"
                      data={week.topDriversByRpm.map((d, i) => ({ shortName: d.name.split(" ")[0], rpm: d.rpm, miles: d.miles, rank: i + 1, color: RPM_COLORS2[i] }))}
                      margin={{ top: 4, right: 16, left: 0, bottom: 4 }} barSize={28}>
                      <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="4 4" />
                      <XAxis type="number" domain={[2.4, "dataMax + 0.2"]}
                        tickFormatter={(v) => `$${v.toFixed(2)}`}
                        tick={{ fontFamily: "var(--font-mono)", fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="shortName" width={72}
                        tick={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 500, fill: "var(--foreground)" }} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{ fill: "rgba(245,158,11,0.07)" }}
                        content={({ active, payload }) => {
                          if (!active || !payload?.length) return null;
                          const d = payload[0].payload as { shortName: string; rpm: number; miles: number; rank: number; color: string };
                          return (
                            <div style={{ backgroundColor: "#0F172A", border: "1px solid #1E293B", borderRadius: 8, padding: "10px 14px", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
                              <div style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "#64748B", marginBottom: 4 }}>#{d.rank} {d.shortName}</div>
                              <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: d.color }}>${d.rpm.toFixed(2)}<span style={{ fontSize: 11, fontWeight: 400, color: "#94A3B8" }}>/mi</span></div>
                              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#64748B", marginTop: 2 }}>{d.miles.toLocaleString()} miles</div>
                            </div>
                          );
                        }} />
                      <Bar dataKey="rpm" radius={[0, 6, 6, 0]}>
                        {week.topDriversByRpm.map((_, i) => <Cell key={i} fill={`url(#rg${i})`} />)}
                        <LabelList content={(props) => <RpmBarLabel {...(props as Parameters<typeof RpmBarLabel>[0])} />} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </>
              </ChartCard>
            </div>

          {/* ── Row 2: Dispatchers + weekly gross trend ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>

            {/* Top Dispatchers */}
            <ChartCard title="Top Dispatchers by Payout" subtitle="Total load value dispatched this week" icon={<TrendingUp size={16} />} color="#10B981" bg="#D1FAE5">
              <>
                <svg width={0} height={0} style={{ position: "absolute" }}>
                  <defs>
                    {DISP_COLORS.map((c, i) => (
                      <linearGradient key={i} id={`dpg${i}`} x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor={c} stopOpacity={0.75} />
                        <stop offset="100%" stopColor={c} />
                      </linearGradient>
                    ))}
                  </defs>
                </svg>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart layout="vertical"
                    data={week.topDispatchers.map((d, i) => ({ shortName: d.name.split(" ")[0], payout: d.payout, loads: d.loads, avgPerLoad: Math.round(d.payout / (d.loads || 1)), color: DISP_COLORS[i], rank: i + 1 }))}
                    margin={{ top: 4, right: 16, left: 0, bottom: 4 }} barSize={36}>
                    <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="4 4" />
                    <XAxis type="number" tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`}
                      tick={{ fontFamily: "var(--font-mono)", fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="shortName" width={68}
                      tick={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, fill: "var(--foreground)" }} axisLine={false} tickLine={false} />
                    <Tooltip cursor={{ fill: "rgba(16,185,129,0.07)" }}
                      content={({ active, payload }) => {
                        if (!active || !payload?.length) return null;
                        const d = payload[0].payload as { shortName: string; payout: number; loads: number; avgPerLoad: number; color: string };
                        return (
                          <div style={{ backgroundColor: "#0F172A", border: "1px solid #1E293B", borderRadius: 8, padding: "10px 14px", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
                            <div style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "#64748B", marginBottom: 4 }}>{d.shortName}</div>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: d.color }}>${d.payout.toLocaleString()}</div>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#64748B", marginTop: 2 }}>{d.loads} loads · ${d.avgPerLoad}/load avg</div>
                          </div>
                        );
                      }} />
                    <Bar dataKey="payout" radius={[0, 8, 8, 0]}>
                      {week.topDispatchers.map((_, i) => <Cell key={i} fill={`url(#dpg${i})`} />)}
                      <LabelList content={(props) => <InlineBarLabel {...(props as Parameters<typeof InlineBarLabel>[0])} prefix="$" />} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </>
            </ChartCard>

            {/* Weekly Gross Trend */}
            <ChartCard title="Weekly Gross Comparison" subtitle="Revenue trend across browsed weeks" icon={<TrendingUp size={16} />} color="#6366F1" bg="#EEF2FF">
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart
                  data={trendWeeks.map((w, i) => ({ weekLabel: w.label, gross: w.totalGross, loads: w.completedLoads, active: i === activeIdx }))}
                  margin={{ top: 10, right: 12, left: 0, bottom: 4 }}>
                  <defs>
                    <linearGradient id="grossGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#6366F1" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#6366F1" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 4" />
                  <XAxis dataKey="weekLabel" tickFormatter={(v: string) => v.split("–")[0].trim()}
                    tick={{ fontFamily: "var(--font-sans)", fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                    tick={{ fontFamily: "var(--font-mono)", fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={44} />
                  <Tooltip cursor={{ stroke: "#6366F1", strokeWidth: 1.5, strokeDasharray: "4 4" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload as { weekLabel: string; gross: number; loads: number };
                      return (
                        <div style={{ backgroundColor: "#0F172A", border: "1px solid #1E293B", borderRadius: 8, padding: "10px 14px", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
                          <div style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "#64748B", marginBottom: 4 }}>{d.weekLabel}</div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: "#818CF8" }}>${d.gross.toLocaleString()}</div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#64748B", marginTop: 2 }}>{d.loads} loads completed</div>
                        </div>
                      );
                    }} />
                  <Area type="monotone" dataKey="gross" stroke="#6366F1" strokeWidth={2.5} fill="url(#grossGrad)"
                    dot={(props: { cx: number; cy: number; index: number; payload: { active: boolean } }) => (
                      <ActiveDot key={props.index} cx={props.cx} cy={props.cy} payload={props.payload} color="#6366F1" activeIdx={activeIdx} dataIdx={props.index} />
                    )}
                    activeDot={{ r: 8, fill: "#6366F1", stroke: "#fff", strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* ── Row 3: Completed loads trend ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
            <ChartCard title="Completed Loads per Week" subtitle="Load volume trend across browsed weeks" icon={<Package size={16} />} color="#3B82F6" bg="#DBEAFE">
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart
                  data={trendWeeks.map((w, i) => ({ weekLabel: w.label, loads: w.completedLoads, active: i === activeIdx }))}
                  margin={{ top: 10, right: 12, left: 0, bottom: 4 }}>
                  <defs>
                    <linearGradient id="loadsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="#3B82F6" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="4 4" />
                  <XAxis dataKey="weekLabel" tickFormatter={(v: string) => v.split("–")[0].trim()}
                    tick={{ fontFamily: "var(--font-sans)", fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontFamily: "var(--font-mono)", fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip cursor={{ stroke: "#3B82F6", strokeWidth: 1.5, strokeDasharray: "4 4" }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload as { weekLabel: string; loads: number };
                      return (
                        <div style={{ backgroundColor: "#0F172A", border: "1px solid #1E293B", borderRadius: 8, padding: "10px 14px", boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
                          <div style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "#64748B", marginBottom: 4 }}>{d.weekLabel}</div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, fontWeight: 700, color: "#60A5FA" }}>{d.loads} loads</div>
                        </div>
                      );
                    }} />
                  <Area type="monotone" dataKey="loads" stroke="#3B82F6" strokeWidth={2.5} fill="url(#loadsGrad)"
                    dot={(props: { cx: number; cy: number; index: number; payload: { active: boolean } }) => (
                      <ActiveDot key={props.index} cx={props.cx} cy={props.cy} payload={props.payload} color="#3B82F6" activeIdx={activeIdx} dataIdx={props.index} />
                    )}
                    activeDot={{ r: 8, fill: "#3B82F6", stroke: "#fff", strokeWidth: 2 }} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

        </div>
      )}
    </div>
  );
}
