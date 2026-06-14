import { useState, useEffect } from "react";
import { MapPin, Lock, MessageSquare, ChevronDown, Filter, RefreshCw } from "lucide-react";

type StatusType = "Enroute" | "Home" | "Empty" | "Loading" | "Delivered";
type DriverType = "O/O" | "C/D";

interface Driver {
  loadId: string;
  name: string;
  phone: string;
  unit: string;
  type: DriverType;
  status: StatusType;
  origin: string;
  destination: string;
  pickupAppt: string;
  dropAppt: string;
  location: string;
  comments: string;
  lastUpdate: string;
}

const STATUS_CONFIG: Record<StatusType, { label: string; color: string; bg: string; dot: string }> = {
  Enroute:   { label: "Enroute",   color: "#1D4ED8", bg: "#DBEAFE", dot: "#3B82F6" },
  Home:      { label: "Home",      color: "#065F46", bg: "#D1FAE5", dot: "#10B981" },
  Empty:     { label: "Empty",     color: "#92400E", bg: "#FEF3C7", dot: "#F59E0B" },
  Loading:   { label: "Loading",   color: "#5B21B6", bg: "#EDE9FE", dot: "#8B5CF6" },
  Delivered: { label: "Delivered", color: "#166534", bg: "#DCFCE7", dot: "#22C55E" },
};

const TYPE_CONFIG: Record<DriverType, { color: string; bg: string }> = {
  "O/O": { color: "#1D4ED8", bg: "#DBEAFE" },
  "C/D": { color: "#5B21B6", bg: "#EDE9FE" },
};

const DRIVERS: Driver[] = [
  {
    loadId: "LD-00481",
    name: "Carlos Mendez",
    phone: "(214) 555-0132",
    unit: "TRK-4481",
    type: "O/O",
    status: "Enroute",
    origin: "Dallas, TX",
    destination: "Memphis, TN",
    pickupAppt: "06/12 · 08:00",
    dropAppt:   "06/12 · 17:30",
    location: "Texarkana, TX",
    comments: "Fuel stop needed at Mile 220",
    lastUpdate: "2m ago",
  },
  {
    loadId: "LD-00290",
    name: "Angela Torres",
    phone: "(312) 555-0871",
    unit: "TRK-2290",
    type: "C/D",
    status: "Home",
    origin: "Chicago, IL",
    destination: "—",
    pickupAppt: "—",
    dropAppt:   "—",
    location: "Chicago, IL",
    comments: "Available from 06:00 tomorrow",
    lastUpdate: "18m ago",
  },
  {
    loadId: "LD-00813",
    name: "Darnell Washington",
    phone: "(404) 555-0344",
    unit: "TRK-8813",
    type: "O/O",
    status: "Empty",
    origin: "Atlanta, GA",
    destination: "Nashville, TN",
    pickupAppt: "06/12 · 11:00",
    dropAppt:   "06/12 · 16:00",
    location: "Chattanooga, TN",
    comments: "Waiting for load assignment",
    lastUpdate: "5m ago",
  },
  {
    loadId: "LD-00577",
    name: "Priya Sharma",
    phone: "(713) 555-0209",
    unit: "TRK-5577",
    type: "C/D",
    status: "Loading",
    origin: "Houston, TX",
    destination: "San Antonio, TX",
    pickupAppt: "06/12 · 14:30",
    dropAppt:   "06/13 · 07:00",
    location: "Houston, TX",
    comments: "Dock #7 — ETA 14:30",
    lastUpdate: "1m ago",
  },
  {
    loadId: "LD-00342",
    name: "Marcus Webb",
    phone: "(602) 555-0518",
    unit: "TRK-3342",
    type: "O/O",
    status: "Delivered",
    origin: "Phoenix, AZ",
    destination: "Los Angeles, CA",
    pickupAppt: "06/11 · 09:00",
    dropAppt:   "06/12 · 10:45",
    location: "Los Angeles, CA",
    comments: "POD signed, heading back empty",
    lastUpdate: "12m ago",
  },
  {
    loadId: "LD-00610",
    name: "Linda Okafor",
    phone: "(720) 555-0763",
    unit: "TRK-6610",
    type: "C/D",
    status: "Enroute",
    origin: "Denver, CO",
    destination: "Kansas City, MO",
    pickupAppt: "06/12 · 06:30",
    dropAppt:   "06/12 · 19:00",
    location: "Hays, KS",
    comments: "Weather delay — I-70 construction",
    lastUpdate: "7m ago",
  },
  {
    loadId: "LD-00924",
    name: "Ray Kowalski",
    phone: "(702) 555-0487",
    unit: "TRK-9924",
    type: "O/O",
    status: "Empty",
    origin: "Las Vegas, NV",
    destination: "Salt Lake City, UT",
    pickupAppt: "06/13 · 08:00",
    dropAppt:   "06/13 · 15:30",
    location: "St. George, UT",
    comments: "Call before dispatching",
    lastUpdate: "34m ago",
  },
  {
    loadId: "LD-00157",
    name: "Tomás García",
    phone: "(305) 555-0622",
    unit: "TRK-1157",
    type: "C/D",
    status: "Home",
    origin: "Miami, FL",
    destination: "—",
    pickupAppt: "—",
    dropAppt:   "—",
    location: "Miami, FL",
    comments: "Day off — return Monday",
    lastUpdate: "3h ago",
  },
];

const LOCKED_ROW = "LD-00813";
const LOCKED_BY = { name: "Sofia R.", color: "#8B5CF6" };

const COLUMNS = [
  { label: "Load ID",         width: 110 },
  { label: "Driver Name",     width: 180 },
  { label: "Phone",           width: 150 },
  { label: "Unit",            width: 120 },
  { label: "Type",            width: 80  },
  { label: "Status",          width: 120 },
  { label: "Origin / Dest.",  width: 220 },
  { label: "Appt. Times",     width: 180 },
  { label: "Curr. Location",  width: 160 },
  { label: "Comments",        width: 280 },
];

export function DispatchTable() {
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0, visible: false });

  useEffect(() => {
    let frame: number;
    let t = 0;
    const animate = () => {
      t += 0.012;
      setCursorPos({
        x: 540 + Math.sin(t) * 100,
        y: 199 + Math.cos(t * 0.6) * 6,
        visible: true,
      });
      frame = requestAnimationFrame(animate);
    };
    animate();
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div className="flex flex-col h-full" style={{ backgroundColor: "var(--background)" }}>
      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-6 py-3 border-b shrink-0"
        style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-3">
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--foreground)" }}>
            All Drivers
          </span>
          <span
            className="rounded-full px-2 py-0.5"
            style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted-foreground)", backgroundColor: "var(--muted)" }}
          >
            {DRIVERS.length} records
          </span>
          <div className="flex items-center gap-1">
            {(["Enroute", "Empty", "Home", "Loading", "Delivered"] as StatusType[]).map((s) => (
              <button
                key={s}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  fontFamily: "var(--font-sans)",
                  fontSize: 11,
                  color: STATUS_CONFIG[s].color,
                  backgroundColor: STATUS_CONFIG[s].bg,
                  border: "none",
                  borderRadius: 6,
                  padding: "2px 8px",
                  cursor: "pointer",
                }}
              >
                <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: STATUS_CONFIG[s].dot, display: "inline-block" }} />
                {s} {DRIVERS.filter((d) => d.status === s).length}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              fontFamily: "var(--font-sans)", fontSize: 12,
              color: "var(--muted-foreground)", backgroundColor: "var(--muted)",
              border: "1px solid var(--border)", borderRadius: 6,
              padding: "4px 10px", cursor: "pointer",
            }}
          >
            <Filter size={12} /> Filter <ChevronDown size={11} />
          </button>
          <button
            style={{
              display: "inline-flex", alignItems: "center", gap: 5,
              fontFamily: "var(--font-sans)", fontSize: 12,
              color: "var(--primary)", backgroundColor: "var(--secondary)",
              border: "none", borderRadius: 6,
              padding: "4px 10px", cursor: "pointer",
            }}
          >
            <RefreshCw size={12} /> Refresh
          </button>
        </div>
      </div>

      {/* Scrollable table */}
      <div className="flex-1 overflow-auto relative" style={{ scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>

        {/* Flying cursor */}
        {cursorPos.visible && (
          <div
            style={{
              position: "absolute",
              left: cursorPos.x,
              top: cursorPos.y,
              pointerEvents: "none",
              zIndex: 50,
              transform: "translate(-2px, -2px)",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M4 2L16 10L9.5 11.5L7 18L4 2Z" fill={LOCKED_BY.color} stroke="#fff" strokeWidth="1.5" />
            </svg>
            <div
              style={{
                fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600,
                color: "#fff", backgroundColor: LOCKED_BY.color,
                borderRadius: 4, padding: "1px 6px", marginTop: 2,
                whiteSpace: "nowrap", boxShadow: "0 2px 6px rgba(0,0,0,0.25)",
              }}
            >
              {LOCKED_BY.name}
            </div>
          </div>
        )}

        <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <colgroup>
            {COLUMNS.map((c) => <col key={c.label} style={{ width: c.width, minWidth: c.width }} />)}
          </colgroup>
          <thead>
            <tr style={{ backgroundColor: "var(--muted)", position: "sticky", top: 0, zIndex: 10 }}>
              {COLUMNS.map((col, i) => (
                <th
                  key={col.label}
                  style={{
                    padding: "8px 12px",
                    textAlign: "left",
                    fontFamily: "var(--font-sans)",
                    fontSize: 10,
                    fontWeight: 600,
                    color: "var(--muted-foreground)",
                    letterSpacing: "0.07em",
                    textTransform: "uppercase",
                    borderBottom: "1px solid var(--border)",
                    borderRight: i < COLUMNS.length - 1 ? "1px solid var(--border)" : "none",
                    whiteSpace: "nowrap",
                    userSelect: "none",
                  }}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {DRIVERS.map((driver, i) => {
              const isLocked = driver.loadId === LOCKED_ROW;
              const isEven = i % 2 === 0;
              return (
                <tr
                  key={driver.loadId}
                  style={{
                    backgroundColor: isLocked
                      ? "rgba(139,92,246,0.04)"
                      : isEven ? "var(--card)" : "var(--background)",
                    borderBottom: "1px solid var(--border)",
                    outline: isLocked ? `2px solid ${LOCKED_BY.color}` : "none",
                    outlineOffset: isLocked ? "-2px" : "0",
                    boxShadow: isLocked
                      ? `0 0 0 2px ${LOCKED_BY.color}44, inset 0 0 20px rgba(139,92,246,0.05)`
                      : "none",
                    transition: "background-color 0.12s",
                  }}
                  onMouseEnter={(e) => {
                    if (!isLocked)
                      (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "rgba(59,130,246,0.03)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isLocked)
                      (e.currentTarget as HTMLTableRowElement).style.backgroundColor =
                        isEven ? "var(--card)" : "var(--background)";
                  }}
                >
                  {/* Load ID */}
                  <td style={{ padding: "9px 12px", borderRight: "1px solid var(--border)" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500, color: "var(--primary)" }}>
                      {driver.loadId}
                    </span>
                  </td>

                  {/* Driver Name */}
                  <td style={{ padding: "9px 12px", borderRight: "1px solid var(--border)" }}>
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 500, color: "var(--foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block" }}>
                      {driver.name}
                    </span>
                  </td>

                  {/* Phone */}
                  <td style={{ padding: "9px 12px", borderRight: "1px solid var(--border)" }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)" }}>
                      {driver.phone}
                    </span>
                  </td>

                  {/* Unit */}
                  <td style={{ padding: "9px 12px", borderRight: "1px solid var(--border)" }}>
                    <div className="flex items-center gap-1">
                      {isLocked && <Lock size={10} style={{ color: LOCKED_BY.color, flexShrink: 0 }} />}
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 500, color: isLocked ? LOCKED_BY.color : "var(--foreground)" }}>
                        {driver.unit}
                      </span>
                    </div>
                  </td>

                  {/* Type */}
                  <td style={{ padding: "9px 12px", borderRight: "1px solid var(--border)" }}>
                    <span
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 11,
                        fontWeight: 600,
                        color: TYPE_CONFIG[driver.type].color,
                        backgroundColor: TYPE_CONFIG[driver.type].bg,
                        borderRadius: 4,
                        padding: "1px 6px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {driver.type}
                    </span>
                  </td>

                  {/* Status */}
                  <td style={{ padding: "9px 12px", borderRight: "1px solid var(--border)" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        fontFamily: "var(--font-sans)",
                        fontSize: 11,
                        fontWeight: 600,
                        color: STATUS_CONFIG[driver.status].color,
                        backgroundColor: STATUS_CONFIG[driver.status].bg,
                        borderRadius: 4,
                        padding: "2px 7px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <span style={{ width: 6, height: 6, borderRadius: "50%", backgroundColor: STATUS_CONFIG[driver.status].dot, display: "inline-block", flexShrink: 0 }} />
                      {driver.status}
                    </span>
                  </td>

                  {/* Origin / Destination */}
                  <td style={{ padding: "9px 12px", borderRight: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600, color: "var(--muted-foreground)", letterSpacing: "0.06em", textTransform: "uppercase", flexShrink: 0 }}>FROM</span>
                        <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{driver.origin}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600, color: "var(--muted-foreground)", letterSpacing: "0.06em", textTransform: "uppercase", flexShrink: 0 }}>TO</span>
                        <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: driver.destination === "—" ? "var(--muted-foreground)" : "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{driver.destination}</span>
                      </div>
                    </div>
                  </td>

                  {/* Appt. Times */}
                  <td style={{ padding: "9px 12px", borderRight: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600, color: "#10B981", letterSpacing: "0.06em", textTransform: "uppercase", flexShrink: 0 }}>PU</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: driver.pickupAppt === "—" ? "var(--muted-foreground)" : "var(--foreground)", whiteSpace: "nowrap" }}>{driver.pickupAppt}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600, color: "#EF4444", letterSpacing: "0.06em", textTransform: "uppercase", flexShrink: 0 }}>DR</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: driver.dropAppt === "—" ? "var(--muted-foreground)" : "var(--foreground)", whiteSpace: "nowrap" }}>{driver.dropAppt}</span>
                      </div>
                    </div>
                  </td>

                  {/* Current Location */}
                  <td style={{ padding: "9px 12px", borderRight: "1px solid var(--border)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <MapPin size={11} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
                      <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {driver.location}
                      </span>
                    </div>
                  </td>

                  {/* Comments */}
                  <td style={{ padding: "9px 12px" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 5 }}>
                      <MessageSquare size={11} style={{ color: "var(--muted-foreground)", marginTop: 1, flexShrink: 0 }} />
                      <div style={{ minWidth: 0 }}>
                        <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "block" }}>
                          {driver.comments}
                        </span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted-foreground)" }}>
                          {driver.lastUpdate}
                        </span>
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Status bar */}
      <div
        className="flex items-center justify-between px-6 py-2 border-t shrink-0"
        style={{ backgroundColor: "var(--card)", borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-4">
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)" }}>
            <span style={{ color: "#8B5CF6", fontWeight: 600 }}>●</span> Sofia R. is editing row LD-00813
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)" }}>
            Marcus T. viewing
          </span>
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted-foreground)" }}>
          Last sync: just now · ws://dispatch.internal
        </span>
      </div>
    </div>
  );
}
