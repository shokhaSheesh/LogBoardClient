import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

type CellType = "load" | "enroute" | "home" | "rest" | "new_driver" | "empty";

interface DayCell {
  type: CellType;
  amount?: number;
  loadId?: string;
}

interface DriverRow {
  id: number;
  name: string;
  driverType: "O/O" | "C/D";
  unit: string;
  days: DayCell[]; // Mon–Sun (7)
  weeklyTotal: number;
  companyProfit: number;
}

const WEEKS = [
  { label: "May 26 – Jun 1, 2026",  offset: -2 },
  { label: "Jun 2 – Jun 8, 2026",   offset: -1 },
  { label: "Jun 9 – Jun 15, 2026",  offset:  0 },
  { label: "Jun 16 – Jun 22, 2026", offset:  1 },
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function load(amount: number, loadId: string): DayCell {
  return { type: "load", amount, loadId };
}
const enroute: DayCell = { type: "enroute" };
const home: DayCell    = { type: "home" };
const rest: DayCell    = { type: "rest" };
const nd: DayCell      = { type: "new_driver" };

const DRIVERS: DriverRow[] = [
  {
    id: 1, name: "Carlos Mendez", driverType: "C/D", unit: "001",
    days: [
      load(1250, "57760165"), load(1250, "57760191"), home, home, home, home, home,
    ],
    weeklyTotal: 2500, companyProfit: -4500,
  },
  {
    id: 2, name: "Angela Torres", driverType: "C/D", unit: "002",
    days: [nd, nd, nd, nd, nd, nd, nd],
    weeklyTotal: 0, companyProfit: -7000,
  },
  {
    id: 3, name: "Darnell Washington", driverType: "O/O", unit: "003",
    days: [
      load(550, "4332979"), load(800, "4367209"), home, home, home, home, home,
    ],
    weeklyTotal: 1350, companyProfit: -5650,
  },
  {
    id: 4, name: "Priya Sharma", driverType: "C/D", unit: "004",
    days: [nd, nd, nd, nd, nd, nd, nd],
    weeklyTotal: 0, companyProfit: -7000,
  },
  {
    id: 5, name: "Marcus Webb", driverType: "O/O", unit: "100",
    days: [
      rest, enroute,
      load(3500, "126185/5777218"),
      load(1000, "35101523"),
      load(2500, "35241535"),
      load(1500, "127218503"),
      load(1500, "QUICKFREIGHT"),
    ],
    weeklyTotal: 10000, companyProfit: 3000,
  },
  {
    id: 6, name: "Linda Okafor", driverType: "C/D", unit: "101",
    days: [home, home, home, home, home, home, home],
    weeklyTotal: 0, companyProfit: -7000,
  },
  {
    id: 7, name: "Ray Kowalski", driverType: "O/O", unit: "102",
    days: [
      load(900, "G064863703"), home, home, home, home, home, home,
    ],
    weeklyTotal: 900, companyProfit: -6100,
  },
  {
    id: 8, name: "Tomás García", driverType: "C/D", unit: "103",
    days: [
      enroute,
      load(1550, "35132250"),
      load(2000, "35189864"),
      load(1450, "0245461"),
      load(1450, "0245328"),
      load(1550, "142896"),
      load(1550, "142901"),
    ],
    weeklyTotal: 9550, companyProfit: 2550,
  },
  {
    id: 9, name: "Jean Eddy Simon", driverType: "C/D", unit: "104",
    days: [
      load(1250, "57760155"),
      load(2000, "0118551"),
      load(1250, "57760203"),
      load(565,  "127197643"),
      load(1250, "57760228"),
      load(1500, "T01359997"),
      load(1500, "QUICKFREIGHT"),
    ],
    weeklyTotal: 9315, companyProfit: 2315,
  },
  {
    id: 10, name: "Jean Wesly Herard", driverType: "O/O", unit: "105",
    days: [
      load(1250, "57760157"),
      load(1250, "57760175"),
      load(1250, "57760173"),
      load(1250, "57760177"),
      load(1250, "57760233"),
      load(1500, "T01358372"),
      { type: "empty" },
    ],
    weeklyTotal: 7750, companyProfit: 750,
  },
  {
    id: 11, name: "Keavis Dyer", driverType: "C/D", unit: "701",
    days: [
      enroute,
      load(1450, "127120603"),
      load(750,  "4338260"),
      load(1250, "57760202"),
      load(1800, "T01356218"),
      enroute,
      load(1500, "57790748"),
    ],
    weeklyTotal: 8250, companyProfit: 1250,
  },
  {
    id: 12, name: "James Alan Schwein", driverType: "C/D", unit: "702",
    days: [home, home, home, home, home, home, home],
    weeklyTotal: 0, companyProfit: -7000,
  },
  {
    id: 13, name: "Shokhnurbek Komilov", driverType: "O/O", unit: "104",
    days: [
      rest,
      load(1250, "57760154"),
      load(1250, "57760151"),
      load(1250, "57760172"),
      { type: "load", amount: undefined, loadId: "?" },
      load(1200, "57760179/577601"),
      load(1900, "35243285"),
    ],
    weeklyTotal: 6850, companyProfit: -150,
  },
  {
    id: 14, name: "Umarkhon Kholmirzaev", driverType: "C/D", unit: "465",
    days: [
      load(550,  "4332793"),
      load(3200, "127129288"),
      load(825,  "4349224"),
      load(1000, "374553/437455"),
      load(1040, "4375926/4359065"),
      load(1250, "57760207"),
      { type: "empty" },
    ],
    weeklyTotal: 7365, companyProfit: 365,
  },
  {
    id: 15, name: "Bakhodir Azamov", driverType: "O/O", unit: "10",
    days: [
      load(1250, "57760149"),
      load(1250, "57760170"),
      load(1250, "57760194"),
      load(1250, "57760198"),
      load(1250, "57760174"),
      load(1250, "57760213"),
      { type: "empty" },
    ],
    weeklyTotal: 7500, companyProfit: 500,
  },
];

const CELL_STYLE: Record<CellType, { bg: string; color: string; label?: string }> = {
  load:       { bg: "#ffffff",  color: "#111827" },
  enroute:    { bg: "#3B82F6",  color: "#ffffff", label: "ENROUTE" },
  home:       { bg: "#EF4444",  color: "#ffffff", label: "HOME" },
  rest:       { bg: "#D1D5DB",  color: "#374151", label: "REST" },
  new_driver: { bg: "#10B981",  color: "#ffffff", label: "NEW DRIVER" },
  empty:      { bg: "#F9FAFB",  color: "#9CA3AF" },
};

function fmt(n: number) {
  return `$${n.toLocaleString()}`;
}

function DayCell({ cell }: { cell: DayCell }) {
  const s = CELL_STYLE[cell.type];

  if (cell.type === "load") {
    return (
      <td
        style={{
          padding: "6px 8px",
          backgroundColor: s.bg,
          borderRight: "1px solid #E5E7EB",
          borderBottom: "1px solid #E5E7EB",
          verticalAlign: "middle",
          textAlign: "center",
          minWidth: 110,
        }}
      >
        {cell.amount !== undefined ? (
          <>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 700, color: "#111827", lineHeight: 1.2 }}>
              {fmt(cell.amount)}
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#6B7280", marginTop: 2, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 100 }}>
              {cell.loadId}
            </div>
          </>
        ) : (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#9CA3AF" }}>
            {cell.loadId ?? "—"}
          </div>
        )}
      </td>
    );
  }

  if (cell.type === "empty") {
    return (
      <td
        style={{
          backgroundColor: "#F9FAFB",
          borderRight: "1px solid #E5E7EB",
          borderBottom: "1px solid #E5E7EB",
          minWidth: 110,
        }}
      />
    );
  }

  return (
    <td
      style={{
        padding: "6px 8px",
        backgroundColor: s.bg,
        borderRight: "1px solid rgba(255,255,255,0.15)",
        borderBottom: "1px solid #E5E7EB",
        textAlign: "center",
        verticalAlign: "middle",
        minWidth: 110,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: 11,
          fontWeight: 700,
          color: s.color,
          letterSpacing: "0.05em",
          textTransform: "uppercase",
        }}
      >
        {s.label}
      </span>
    </td>
  );
}

export function GrossMatrix() {
  const [weekIdx, setWeekIdx] = useState(2); // default: current week

  const totalRevenue = DRIVERS.reduce((s, d) => s + d.weeklyTotal, 0);
  const totalProfit  = DRIVERS.reduce((s, d) => s + d.companyProfit, 0);

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: "var(--background)" }}>
      {/* Top controls */}
      <div
        className="flex items-center justify-between px-6 py-3 border-b shrink-0"
        style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-4">
          <h2 style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 600, color: "var(--foreground)" }}>
            Gross Revenue Matrix
          </h2>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted-foreground)", backgroundColor: "var(--muted)", borderRadius: 4, padding: "2px 8px" }}>
            {DRIVERS.length} drivers
          </span>
        </div>

        {/* Week picker */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setWeekIdx((i) => Math.max(0, i - 1))}
            disabled={weekIdx === 0}
            style={{
              width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "var(--card)",
              cursor: weekIdx === 0 ? "not-allowed" : "pointer", opacity: weekIdx === 0 ? 0.4 : 1,
            }}
          >
            <ChevronLeft size={14} style={{ color: "var(--foreground)" }} />
          </button>
          <div
            style={{
              fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600,
              color: "var(--foreground)", backgroundColor: "var(--secondary)",
              border: "1px solid var(--accent)", borderRadius: 6,
              padding: "4px 14px", minWidth: 210, textAlign: "center",
            }}
          >
            {WEEKS[weekIdx].label}
          </div>
          <button
            onClick={() => setWeekIdx((i) => Math.min(WEEKS.length - 1, i + 1))}
            disabled={weekIdx === WEEKS.length - 1}
            style={{
              width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "var(--card)",
              cursor: weekIdx === WEEKS.length - 1 ? "not-allowed" : "pointer",
              opacity: weekIdx === WEEKS.length - 1 ? 0.4 : 1,
            }}
          >
            <ChevronRight size={14} style={{ color: "var(--foreground)" }} />
          </button>
        </div>

        {/* Summary pills */}
        <div className="flex items-center gap-3">
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Weekly Revenue</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: "#10B981" }}>{fmt(totalRevenue)}</div>
          </div>
          <div style={{ width: 1, height: 28, backgroundColor: "var(--border)" }} />
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em" }}>Net Profit</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 14, fontWeight: 700, color: totalProfit >= 0 ? "#10B981" : "#EF4444" }}>
              {totalProfit >= 0 ? fmt(totalProfit) : `-$${Math.abs(totalProfit).toLocaleString()}`}
            </div>
          </div>
        </div>
      </div>

      {/* Legend */}
      <div
        className="flex items-center gap-4 px-6 py-2 border-b shrink-0"
        style={{ backgroundColor: "var(--muted)", borderColor: "var(--border)" }}
      >
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--muted-foreground)", fontWeight: 500 }}>Legend:</span>
        {(["enroute", "home", "rest", "new_driver"] as CellType[]).map((t) => (
          <span
            key={t}
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600,
              color: CELL_STYLE[t].color, backgroundColor: CELL_STYLE[t].bg,
              borderRadius: 4, padding: "1px 8px",
            }}
          >
            {CELL_STYLE[t].label}
          </span>
        ))}
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-sans)", fontSize: 11, color: "#111827" }}>
          <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, backgroundColor: "#fff", border: "1px solid #E5E7EB" }} />
          Loaded ($ + Load ID)
        </span>
      </div>

      {/* Scrollable table */}
      <div className="flex-1 overflow-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
        <table style={{ borderCollapse: "collapse", tableLayout: "fixed", minWidth: "100%" }}>
          <thead>
            <tr style={{ position: "sticky", top: 0, zIndex: 20, backgroundColor: "#0F172A" }}>
              {/* Fixed left cols */}
              <th style={thLeft({ width: 36 })}>#</th>
              <th style={thLeft({ width: 200, textAlign: "left" })}>Driver Name</th>
              <th style={thLeft({ width: 72 })}>Unit</th>
              {/* Day cols */}
              {DAYS.map((d) => (
                <th key={d} style={{ ...thDay(), minWidth: 110, width: 110 }}>{d}</th>
              ))}
              {/* Right cols */}
              <th style={thRight({ width: 110 })}>Weekly Total</th>
              <th style={thRight({ width: 120, borderRight: "none" })}>Co. Profit</th>
            </tr>
          </thead>
          <tbody>
            {DRIVERS.map((driver, i) => {
              const isEven = i % 2 === 0;
              return (
                <tr key={driver.id} style={{ backgroundColor: isEven ? "#ffffff" : "#F9FAFB" }}>
                  {/* # */}
                  <td style={{
                    padding: "0 8px", textAlign: "center", verticalAlign: "middle",
                    borderRight: "1px solid #E5E7EB", borderBottom: "1px solid #E5E7EB",
                    fontFamily: "var(--font-mono)", fontSize: 11, color: "#9CA3AF",
                    backgroundColor: isEven ? "#ffffff" : "#F9FAFB",
                    position: "sticky", left: 0, zIndex: 10, height: 46,
                  }}>
                    {driver.id}
                  </td>

                  {/* Driver Name */}
                  <td style={{
                    padding: "0 12px", verticalAlign: "middle",
                    borderRight: "1px solid #E5E7EB", borderBottom: "1px solid #E5E7EB",
                    backgroundColor: isEven ? "#ffffff" : "#F9FAFB",
                    position: "sticky", left: 36, zIndex: 10,
                  }}>
                    <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, color: "#111827", whiteSpace: "nowrap" }}>
                      {driver.name}
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#6B7280" }}>
                      ({driver.driverType})
                    </div>
                  </td>

                  {/* Unit */}
                  <td style={{
                    padding: "0 8px", textAlign: "center", verticalAlign: "middle",
                    borderRight: "2px solid #CBD5E1", borderBottom: "1px solid #E5E7EB",
                    fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500, color: "#374151",
                    backgroundColor: isEven ? "#ffffff" : "#F9FAFB",
                    position: "sticky", left: 236, zIndex: 10,
                  }}>
                    {driver.unit}
                  </td>

                  {/* Day cells */}
                  {driver.days.map((cell, di) => (
                    <DayCell key={di} cell={cell} />
                  ))}

                  {/* Weekly Total */}
                  <td style={{
                    padding: "0 12px", textAlign: "right", verticalAlign: "middle",
                    borderLeft: "2px solid #CBD5E1", borderBottom: "1px solid #E5E7EB",
                    backgroundColor: isEven ? "#EFF6FF" : "#DBEAFE",
                    position: "sticky", right: 120, zIndex: 10,
                  }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "#1D4ED8", whiteSpace: "nowrap" }}>
                      {fmt(driver.weeklyTotal)}
                    </div>
                  </td>

                  {/* Company Profit */}
                  <td style={{
                    padding: "0 12px", textAlign: "right", verticalAlign: "middle",
                    borderLeft: "1px solid #E5E7EB", borderBottom: "1px solid #E5E7EB", borderRight: "none",
                    backgroundColor: driver.companyProfit >= 0
                      ? (isEven ? "#F0FDF4" : "#DCFCE7")
                      : (isEven ? "#FFF1F2" : "#FFE4E6"),
                    position: "sticky", right: 0, zIndex: 10,
                  }}>
                    <div style={{
                      fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap",
                      color: driver.companyProfit >= 0 ? "#15803D" : "#DC2626",
                    }}>
                      {driver.companyProfit >= 0
                        ? fmt(driver.companyProfit)
                        : `-$${Math.abs(driver.companyProfit).toLocaleString()}`}
                    </div>
                  </td>
                </tr>
              );
            })}

            {/* Totals row */}
            <tr style={{ backgroundColor: "#0F172A", position: "sticky", bottom: 0, zIndex: 15 }}>
              <td colSpan={3} style={{
                padding: "8px 12px", textAlign: "left",
                borderTop: "2px solid #334155",
                fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 700,
                color: "#CBD5E1", letterSpacing: "0.06em", textTransform: "uppercase",
                position: "sticky", left: 0, zIndex: 16, backgroundColor: "#0F172A",
              }}>
                Weekly Totals
              </td>
              {DAYS.map((d) => {
                const dayTotal = DRIVERS.reduce((sum, dr) => {
                  const cell = dr.days[DAYS.indexOf(d)];
                  return sum + (cell.type === "load" && cell.amount ? cell.amount : 0);
                }, 0);
                return (
                  <td key={d} style={{
                    padding: "8px 8px", textAlign: "center", verticalAlign: "middle",
                    borderTop: "2px solid #334155",
                    fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700,
                    color: dayTotal > 0 ? "#60A5FA" : "#475569",
                  }}>
                    {dayTotal > 0 ? fmt(dayTotal) : "—"}
                  </td>
                );
              })}
              <td style={{
                padding: "8px 12px", textAlign: "right", verticalAlign: "middle",
                borderTop: "2px solid #334155", borderLeft: "2px solid #334155",
                fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "#34D399",
                position: "sticky", right: 120, zIndex: 16, backgroundColor: "#0F172A",
              }}>
                {fmt(totalRevenue)}
              </td>
              <td style={{
                padding: "8px 12px", textAlign: "right", verticalAlign: "middle",
                borderTop: "2px solid #334155", borderLeft: "1px solid #334155",
                fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700,
                color: totalProfit >= 0 ? "#34D399" : "#F87171",
                position: "sticky", right: 0, zIndex: 16, backgroundColor: "#0F172A",
              }}>
                {totalProfit >= 0 ? fmt(totalProfit) : `-$${Math.abs(totalProfit).toLocaleString()}`}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* helpers */
function thLeft(extra: Record<string, unknown>) {
  return {
    padding: "10px 8px",
    textAlign: "center" as const,
    fontFamily: "var(--font-sans)",
    fontSize: 10,
    fontWeight: 700,
    color: "#94A3B8",
    letterSpacing: "0.07em",
    textTransform: "uppercase" as const,
    borderRight: "1px solid #1E293B",
    borderBottom: "2px solid #1E293B",
    position: "sticky" as const,
    zIndex: 21,
    ...extra,
  };
}
function thDay() {
  return {
    padding: "10px 8px",
    textAlign: "center" as const,
    fontFamily: "var(--font-sans)",
    fontSize: 10,
    fontWeight: 700,
    color: "#94A3B8",
    letterSpacing: "0.07em",
    textTransform: "uppercase" as const,
    borderRight: "1px solid #1E293B",
    borderBottom: "2px solid #1E293B",
  };
}
function thRight(extra: Record<string, unknown>) {
  return {
    padding: "10px 12px",
    textAlign: "right" as const,
    fontFamily: "var(--font-sans)",
    fontSize: 10,
    fontWeight: 700,
    color: "#94A3B8",
    letterSpacing: "0.07em",
    textTransform: "uppercase" as const,
    borderLeft: extra.width === 120 ? "1px solid #1E293B" : "2px solid #1E293B",
    borderBottom: "2px solid #1E293B",
    position: "sticky" as const,
    right: extra.width === 120 ? 0 : 120,
    zIndex: 21,
    backgroundColor: "#0F172A",
    ...extra,
  };
}
