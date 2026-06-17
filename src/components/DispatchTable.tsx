import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { MapPin, Lock, MessageSquare, ChevronDown, RefreshCw, Search, Navigation, Check, ArrowRight } from "lucide-react";
import { Status, STATUS_CONFIG, ALL_STATUSES } from "../lib/statuses";

type DriverType = "O/O" | "C/D";

interface Stop {
  city: string;
  done: boolean;
  appt?: string;
}

interface Driver {
  loadId: string;
  name: string;
  phone: string;
  unit: string;
  type: DriverType;
  status: Status;
  origin: string;
  originDone?: boolean;
  destination: string;
  stops?: Stop[];
  pickupAppt: string;
  dropAppt: string;
  location: string;
  etaKm: number | null;
  speedMph?: number | null;
  comments: string;
  lastUpdate: string;
}

const TYPE_CONFIG: Record<DriverType, { color: string; bg: string }> = {
  "O/O": { color: "#1D4ED8", bg: "#DBEAFE" },
  "C/D": { color: "#5B21B6", bg: "#EDE9FE" },
};

const INIT_DRIVERS: Driver[] = [
  {
    loadId: "LD-00481", name: "Carlos Mendez", phone: "(214) 555-0132", unit: "TRK-4481", type: "O/O", status: "enroute",
    origin: "Dallas, TX", destination: "Memphis, TN",
    stops: [
      { city: "Texarkana, TX", done: true,  appt: "06/12 · 10:30" },
      { city: "Little Rock, AR", done: true, appt: "06/12 · 13:00" },
      { city: "Memphis, TN",    done: false, appt: "06/12 · 17:30" },
    ],
    pickupAppt: "06/12 · 08:00", dropAppt: "06/12 · 17:30",
    location: "Little Rock, AR", etaKm: 235, speedMph: 62, comments: "Fuel stop needed at Mile 220", lastUpdate: "2m ago",
  },
  {
    loadId: "LD-00290", name: "Angela Torres", phone: "(312) 555-0871", unit: "TRK-2290", type: "C/D", status: "home",
    origin: "Chicago, IL", destination: "—",
    pickupAppt: "—", dropAppt: "—",
    location: "Chicago, IL", etaKm: null, speedMph: null, comments: "Available from 06:00 tomorrow", lastUpdate: "18m ago",
  },
  {
    loadId: "LD-00813", name: "Darnell Washington", phone: "(404) 555-0344", unit: "TRK-8813", type: "O/O", status: "ready",
    origin: "Atlanta, GA", destination: "Nashville, TN",
    pickupAppt: "06/12 · 11:00", dropAppt: "06/12 · 16:00",
    location: "Chattanooga, TN", etaKm: 170, speedMph: 58, comments: "Waiting for load assignment", lastUpdate: "5m ago",
  },
  {
    loadId: "LD-00577", name: "Priya Sharma", phone: "(713) 555-0209", unit: "TRK-5577", type: "C/D", status: "dispatched",
    origin: "Houston, TX", destination: "San Antonio, TX",
    pickupAppt: "06/12 · 14:30", dropAppt: "06/13 · 07:00",
    location: "Houston, TX", etaKm: 320, speedMph: 65, comments: "Dock #7 — ETA 14:30", lastUpdate: "1m ago",
  },
  {
    loadId: "LD-00342", name: "Marcus Webb", phone: "(602) 555-0518", unit: "TRK-3342", type: "O/O", status: "delivered",
    origin: "Phoenix, AZ", destination: "Los Angeles, CA",
    stops: [
      { city: "Tucson, AZ",       done: true, appt: "06/11 · 11:00" },
      { city: "Los Angeles, CA",  done: true, appt: "06/12 · 10:45" },
    ],
    pickupAppt: "06/11 · 09:00", dropAppt: "06/12 · 10:45",
    location: "Los Angeles, CA", etaKm: 0, speedMph: null, comments: "POD signed, heading back empty", lastUpdate: "12m ago",
  },
  {
    loadId: "LD-00610", name: "Linda Okafor", phone: "(720) 555-0763", unit: "TRK-6610", type: "C/D", status: "enroute",
    origin: "Denver, CO", destination: "Kansas City, MO",
    stops: [
      { city: "Salina, KS",       done: true,  appt: "06/12 · 10:00" },
      { city: "Topeka, KS",       done: false, appt: "06/12 · 13:30" },
      { city: "Kansas City, MO",  done: false, appt: "06/12 · 19:00" },
    ],
    pickupAppt: "06/12 · 06:30", dropAppt: "06/12 · 19:00",
    location: "Hays, KS", etaKm: 415, speedMph: 70, comments: "Weather delay — I-70 construction", lastUpdate: "7m ago",
  },
  {
    loadId: "LD-00924", name: "Ray Kowalski", phone: "(702) 555-0487", unit: "TRK-9924", type: "O/O", status: "ready",
    origin: "Las Vegas, NV", destination: "Salt Lake City, UT",
    pickupAppt: "06/13 · 08:00", dropAppt: "06/13 · 15:30",
    location: "St. George, UT", etaKm: 430, speedMph: 55, comments: "Call before dispatching", lastUpdate: "34m ago",
  },
  {
    loadId: "LD-00157", name: "Tomás García", phone: "(305) 555-0622", unit: "TRK-1157", type: "C/D", status: "home",
    origin: "Miami, FL", destination: "—",
    pickupAppt: "—", dropAppt: "—",
    location: "Miami, FL", etaKm: null, speedMph: null, comments: "Day off — return Monday", lastUpdate: "3h ago",
  },
];

const LOCKED_ROW = "LD-00813";
const LOCKED_BY  = { name: "Sofia R.", color: "#8B5CF6" };

const LOAD_ID_LEFT   = 0;
const DRIVER_NM_LEFT = 110;

const COLUMNS = [
  { label: "Load ID",        width: 110, sticky: true,  left: LOAD_ID_LEFT   },
  { label: "Driver Name",    width: 180, sticky: true,  left: DRIVER_NM_LEFT },
  { label: "Phone",          width: 148, sticky: false                        },
  { label: "Unit",           width: 116, sticky: false                        },
  { label: "Type",           width: 72,  sticky: false                        },
  { label: "Status",         width: 130, sticky: false                        },
  { label: "Origin / Dest.", width: 230, sticky: false                        },
  { label: "Appt. Times",   width: 178,  sticky: false                        },
  { label: "Curr. Location", width: 158, sticky: false                        },
  { label: "ETA / Dist.",    width: 108, sticky: false                        },
  { label: "Comments",       width: 280, sticky: false                        },
];

function etaColor(km: number | null): string {
  if (km === null) return "var(--muted-foreground)";
  if (km <= 0)   return "#10B981";
  if (km < 200)  return "#10B981";
  if (km < 400)  return "#F59E0B";
  return "#EF4444";
}

const BOARD_STATUSES = ALL_STATUSES.filter((s) => INIT_DRIVERS.some((d) => d.status === s));

// ── Portal dropdown helpers ──────────────────────────────────────────────────

function useDropdown() {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const dropRef   = useRef<HTMLDivElement>(null);

  const toggle = () => {
    const r = anchorRef.current?.getBoundingClientRect();
    if (r) setRect(r);
    setOpen((v) => !v);
  };

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (
        !anchorRef.current?.contains(e.target as Node) &&
        !dropRef.current?.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return { open, setOpen, rect, anchorRef, dropRef, toggle };
}

// ── Status dropdown ──────────────────────────────────────────────────────────

function StatusDropdown({ value, onChange }: { value: Status; onChange: (s: Status) => void }) {
  const { open, setOpen, rect, anchorRef, dropRef, toggle } = useDropdown();
  const cfg = STATUS_CONFIG[value];

  return (
    <>
      <div ref={anchorRef} onClick={toggle} style={{ cursor: "pointer", display: "inline-flex" }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600,
          color: cfg.color, backgroundColor: cfg.bg,
          borderRadius: 4, padding: "3px 8px", whiteSpace: "nowrap",
          userSelect: "none",
        }}>
          {cfg.label}
          <ChevronDown size={10} style={{ opacity: 0.7, marginLeft: 1 }} />
        </span>
      </div>

      {open && rect && createPortal(
        <div
          ref={dropRef}
          style={{
            position: "fixed",
            top: rect.bottom + 5,
            left: rect.left,
            zIndex: 9999,
            backgroundColor: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            boxShadow: "0 10px 30px rgba(0,0,0,0.16)",
            padding: "5px",
            minWidth: 168,
            display: "flex", flexDirection: "column", gap: 1,
          }}
        >
          {ALL_STATUSES.map((s) => {
            const c = STATUS_CONFIG[s];
            const active = s === value;
            return (
              <button
                key={s}
                onMouseDown={(e) => { e.preventDefault(); onChange(s); setOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "6px 8px", border: "none", borderRadius: 6,
                  backgroundColor: active ? c.bg : "transparent",
                  cursor: "pointer", width: "100%", textAlign: "left",
                }}
                onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--muted)"; }}
                onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
              >
                <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: c.bg, border: `2px solid ${c.bg}`, flexShrink: 0, boxShadow: active ? `0 0 0 2px ${c.bg}44` : "none" }} />
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: active ? 600 : 400, color: active ? c.color : "var(--foreground)", flex: 1 }}>
                  {c.label}
                </span>
                {active && <Check size={12} style={{ color: c.color, flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}

// ── Type dropdown ────────────────────────────────────────────────────────────

function TypeDropdown({ value, onChange }: { value: DriverType; onChange: (t: DriverType) => void }) {
  const { open, setOpen, rect, anchorRef, dropRef, toggle } = useDropdown();
  const cfg = TYPE_CONFIG[value];

  return (
    <>
      <div ref={anchorRef} onClick={toggle} style={{ cursor: "pointer", display: "inline-flex" }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 4,
          fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600,
          color: cfg.color, backgroundColor: cfg.bg,
          borderRadius: 4, padding: "3px 7px", whiteSpace: "nowrap",
          userSelect: "none",
        }}>
          {value}
          <ChevronDown size={10} style={{ opacity: 0.7 }} />
        </span>
      </div>

      {open && rect && createPortal(
        <div
          ref={dropRef}
          style={{
            position: "fixed",
            top: rect.bottom + 5,
            left: rect.left,
            zIndex: 9999,
            backgroundColor: "var(--card)",
            border: "1px solid var(--border)",
            borderRadius: 10,
            boxShadow: "0 10px 30px rgba(0,0,0,0.16)",
            padding: "5px",
            minWidth: 110,
            display: "flex", flexDirection: "column", gap: 1,
          }}
        >
          {(["O/O", "C/D"] as DriverType[]).map((t) => {
            const c = TYPE_CONFIG[t];
            const active = t === value;
            return (
              <button
                key={t}
                onMouseDown={(e) => { e.preventDefault(); onChange(t); setOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "7px 8px", border: "none", borderRadius: 6,
                  backgroundColor: active ? c.bg : "transparent",
                  cursor: "pointer", width: "100%", textAlign: "left",
                }}
                onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--muted)"; }}
                onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
              >
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: active ? 700 : 400, color: active ? c.color : "var(--foreground)", flex: 1 }}>
                  {t}
                </span>
                {active && <Check size={12} style={{ color: c.color, flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}

// ── Inline text input ────────────────────────────────────────────────────────

function InlineCell({ value, onCommit, mono, fontSize = 12, color = "var(--foreground)", placeholder }: {
  value: string; onCommit: (v: string) => void;
  mono?: boolean; fontSize?: number; color?: string; placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <input
      ref={ref}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); onCommit(draft); }
        if (e.key === "Escape") { e.stopPropagation(); onCommit(value); }
      }}
      style={{
        width: "100%", border: "none", outline: "none", background: "transparent",
        fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
        fontSize, color, padding: 0, margin: 0,
        borderBottom: "1.5px solid var(--primary)",
      }}
    />
  );
}

// ── Stop list display ────────────────────────────────────────────────────────

function StopList({ origin, originDone, destination, stops, onToggleStop, onEditStop, onToggleOrigin, onEditOrigin }: {
  origin: string;
  originDone?: boolean;
  destination: string;
  stops?: Stop[];
  onToggleStop?: (idx: number) => void;
  onEditStop?: (idx: number, city: string) => void;
  onToggleOrigin?: () => void;
  onEditOrigin?: (city: string) => void;
}) {
  const [editingStop, setEditingStop] = useState<number | null>(null);
  const [editingOrigin, setEditingOrigin] = useState(false);
  const [draft, setDraft] = useState("");

  const labelStyle: React.CSSProperties = {
    fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
    color: "var(--muted-foreground)", letterSpacing: "0.06em",
    textTransform: "uppercase", flexShrink: 0, width: 30,
  };

  if (!stops || stops.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={labelStyle}>#1</span>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--foreground)" }}>{origin}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={labelStyle}>#2</span>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: destination === "—" ? "var(--muted-foreground)" : "var(--foreground)" }}>{destination}</span>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      {/* Origin — stop #1 */}
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={labelStyle}>#1</span>
        <button
          onClick={() => onToggleOrigin?.()}
          title={originDone ? "Mark incomplete" : "Mark complete"}
          style={{ width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: "none", background: "none", cursor: onToggleOrigin ? "pointer" : "default", padding: 0 }}
        >
          {originDone ? (
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, borderRadius: "50%", backgroundColor: "#D1FAE5" }}>
              <Check size={9} style={{ color: "#10B981" }} />
            </span>
          ) : (
            <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, borderRadius: "50%", backgroundColor: "var(--secondary)" }}>
              <ArrowRight size={9} style={{ color: "var(--primary)" }} />
            </span>
          )}
        </button>
        {editingOrigin ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => { onEditOrigin?.(draft); setEditingOrigin(false); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); onEditOrigin?.(draft); setEditingOrigin(false); }
              if (e.key === "Escape") setEditingOrigin(false);
            }}
            style={{ border: "none", outline: "none", background: "transparent", fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--foreground)", padding: 0, flex: 1, borderBottom: "1.5px solid var(--primary)" }}
          />
        ) : (
          <span
            onClick={() => { setDraft(origin); setEditingOrigin(true); }}
            style={{ fontFamily: "var(--font-sans)", fontSize: 12, cursor: "text", color: originDone ? "var(--muted-foreground)" : "var(--foreground)", textDecoration: originDone ? "line-through" : "none" }}
          >
            {origin}
          </span>
        )}
      </div>

      {/* Stops */}
      {stops.map((stop, idx) => {
        const prevDone = idx === 0 || stops[idx - 1].done;
        const isCurrent = !stop.done && prevDone;
        const isEditingThis = editingStop === idx;

        return (
          <div key={idx} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            {/* Stop number label */}
            <span style={{ ...labelStyle }}>#{idx + 2}</span>
            {/* Clickable icon — toggles done */}
            <button
              onClick={() => onToggleStop?.(idx)}
              title={stop.done ? "Mark incomplete" : "Mark complete"}
              style={{
                width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0, border: "none", background: "none",
                cursor: onToggleStop ? "pointer" : "default", padding: 0,
              }}
            >
              {stop.done ? (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, borderRadius: "50%", backgroundColor: "#D1FAE5" }}>
                  <Check size={9} style={{ color: "#10B981" }} />
                </span>
              ) : isCurrent ? (
                <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, borderRadius: "50%", backgroundColor: "var(--secondary)" }}>
                  <ArrowRight size={9} style={{ color: "var(--primary)" }} />
                </span>
              ) : (
                <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "var(--border)", display: "inline-block" }} />
              )}
            </button>

            {/* City — click to edit inline */}
            {isEditingThis ? (
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={() => { onEditStop?.(idx, draft); setEditingStop(null); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); onEditStop?.(idx, draft); setEditingStop(null); }
                  if (e.key === "Escape") setEditingStop(null);
                }}
                style={{
                  border: "none", outline: "none", background: "transparent",
                  fontFamily: "var(--font-sans)", fontSize: 12,
                  color: "var(--foreground)", padding: 0, flex: 1,
                  borderBottom: "1.5px solid var(--primary)",
                }}
              />
            ) : (
              <span
                onClick={() => { setDraft(stop.city); setEditingStop(idx); }}
                style={{
                  fontFamily: "var(--font-sans)", fontSize: 12, cursor: "text",
                  color: stop.done ? "var(--muted-foreground)" : isCurrent ? "var(--foreground)" : "var(--muted-foreground)",
                  textDecoration: stop.done ? "line-through" : "none",
                  fontWeight: isCurrent ? 500 : 400,
                }}
              >
                {stop.city}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function DispatchTable() {
  const [rows, setRows]           = useState<Driver[]>(INIT_DRIVERS);
  const [search, setSearch]       = useState("");
  const [statusFilter, setStatusFilter] = useState<Status | "all">("all");
  const [filterOpen, setFilterOpen]     = useState(false);
  const [editCell, setEditCell]   = useState<{ loadId: string; field: string } | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false); };
    if (filterOpen) document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [filterOpen]);

  const patch = (loadId: string, fields: Partial<Driver>) =>
    setRows((prev) => prev.map((d) => (d.loadId === loadId ? { ...d, ...fields } : d)));

  const isEdit = (loadId: string, field: string) => editCell?.loadId === loadId && editCell?.field === field;
  const startEdit = (loadId: string, field: string) => setEditCell({ loadId, field });
  const stopEdit  = () => setEditCell(null);

  const q = search.trim().toLowerCase();
  const visible = rows.filter((d) => {
    const ms = statusFilter === "all" || d.status === statusFilter;
    const mq = !q || d.name.toLowerCase().includes(q) || d.loadId.toLowerCase().includes(q) || d.unit.toLowerCase().includes(q);
    return ms && mq;
  });

  const editableText = (loadId: string, field: string, val: string, opts?: { mono?: boolean; color?: string; fontSize?: number; style?: React.CSSProperties }) =>
    isEdit(loadId, field)
      ? <InlineCell value={val} mono={opts?.mono} color={opts?.color} fontSize={opts?.fontSize} onCommit={(v) => { patch(loadId, { [field]: v }); stopEdit(); }} />
      : <span onClick={() => startEdit(loadId, field)} style={{ cursor: "text", display: "block", fontFamily: opts?.mono ? "var(--font-mono)" : "var(--font-sans)", fontSize: opts?.fontSize ?? 12, color: opts?.color ?? "var(--foreground)", ...opts?.style }}>{val}</span>;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* ── Toolbar ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", flexShrink: 0, backgroundColor: "var(--card)", borderBottom: "1px solid var(--border)", height: 52, gap: 10, borderRadius: "12px 12px 0 0" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Search */}
          <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
            <Search size={13} style={{ position: "absolute", left: 9, color: "var(--muted-foreground)", pointerEvents: "none" }} />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search driver, load, unit…"
              style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--foreground)", backgroundColor: "var(--muted)", border: "1px solid var(--border)", borderRadius: 7, padding: "5px 10px 5px 30px", outline: "none", width: 220 }} />
          </div>

          {/* Status filter */}
          <div ref={filterRef} style={{ position: "relative" }}>
            <button onClick={() => setFilterOpen((p) => !p)} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-sans)", fontSize: 12, color: statusFilter === "all" ? "var(--muted-foreground)" : STATUS_CONFIG[statusFilter].color, backgroundColor: statusFilter === "all" ? "var(--muted)" : STATUS_CONFIG[statusFilter].bg, border: "1px solid var(--border)", borderRadius: 7, padding: "5px 10px", cursor: "pointer", whiteSpace: "nowrap" }}>
              {statusFilter === "all" ? "All Statuses" : STATUS_CONFIG[statusFilter].label}
              <ChevronDown size={11} />
            </button>
            {filterOpen && (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 100, backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", minWidth: 180, padding: "4px 0" }}>
                <button onClick={() => { setStatusFilter("all"); setFilterOpen(false); }} style={{ width: "100%", textAlign: "left", padding: "7px 12px", fontFamily: "var(--font-sans)", fontSize: 12, color: statusFilter === "all" ? "var(--primary)" : "var(--foreground)", backgroundColor: statusFilter === "all" ? "var(--secondary)" : "transparent", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>All Statuses</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted-foreground)" }}>{rows.length}</span>
                </button>
                <div style={{ height: 1, backgroundColor: "var(--border)", margin: "3px 0" }} />
                {BOARD_STATUSES.map((s) => {
                  const active = statusFilter === s;
                  return (
                    <button key={s} onClick={() => { setStatusFilter(s); setFilterOpen(false); }} style={{ width: "100%", textAlign: "left", padding: "7px 12px", fontFamily: "var(--font-sans)", fontSize: 12, color: active ? STATUS_CONFIG[s].color : "var(--foreground)", backgroundColor: active ? `${STATUS_CONFIG[s].bg}22` : "transparent", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: STATUS_CONFIG[s].bg, flexShrink: 0 }} />
                        {STATUS_CONFIG[s].label}
                      </div>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted-foreground)" }}>{rows.filter((d) => d.status === s).length}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)" }}>{visible.length} / {rows.length}</span>
        </div>

        <button style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--primary)", backgroundColor: "var(--secondary)", border: "none", borderRadius: 7, padding: "5px 12px", cursor: "pointer" }}>
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* ── Table ── */}
      <div style={{ flex: 1, overflow: "auto", position: "relative", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>

        <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed" }}>
          <colgroup>
            {COLUMNS.map((c) => <col key={c.label} style={{ width: c.width, minWidth: c.width }} />)}
          </colgroup>
          <thead>
            <tr style={{ position: "sticky", top: 0, zIndex: 15 }}>
              {COLUMNS.map((col, i) => (
                <th key={col.label} style={{
                  padding: "10px 14px", textAlign: "left",
                  fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 600,
                  color: "var(--muted-foreground)", letterSpacing: "0.07em", textTransform: "uppercase",
                  backgroundColor: "var(--muted)",
                  borderBottom: "1px solid var(--border)",
                  borderRight: i < COLUMNS.length - 1 ? "1px solid var(--border)" : "none",
                  whiteSpace: "nowrap", userSelect: "none",
                  ...(col.sticky ? {
                    position: "sticky" as const, left: col.left, zIndex: 16,
                    boxShadow: i === 1 ? "2px 0 5px rgba(0,0,0,0.07)" : undefined,
                  } : {}),
                }}>
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} style={{ padding: "48px 20px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>
                  No drivers match your filters.
                </td>
              </tr>
            )}
            {visible.map((driver, i) => {
              const isLocked = driver.loadId === LOCKED_ROW;
              const isEven   = i % 2 === 0;
              const kmColor  = etaColor(driver.etaKm);
              const rowBg    = isLocked ? "#F5F3FF" : isEven ? "var(--card)" : "var(--background)";
              const border   = "1px solid var(--border)";

              const td = (extra: React.CSSProperties = {}): React.CSSProperties => ({
                padding: "10px 14px",
                backgroundColor: rowBg,
                borderBottom: border,
                verticalAlign: "middle",
                ...extra,
              });

              return (
                <tr key={driver.loadId}>

                  {/* Load ID — sticky, read-only */}
                  <td style={td({ position: "sticky", left: LOAD_ID_LEFT, zIndex: 3, width: 110, minWidth: 110, borderRight: border })}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500, color: "var(--primary)" }}>
                      {driver.loadId}
                    </span>
                  </td>

                  {/* Driver Name — sticky, editable */}
                  <td style={td({ position: "sticky", left: DRIVER_NM_LEFT, zIndex: 3, width: 180, minWidth: 180, borderRight: border, boxShadow: "2px 0 5px rgba(0,0,0,0.07)" })}>
                    {editableText(driver.loadId, "name", driver.name, { style: { fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } })}
                  </td>

                  {/* Phone */}
                  <td style={td({ borderRight: border })}>
                    {editableText(driver.loadId, "phone", driver.phone, { mono: true, fontSize: 11, color: "var(--muted-foreground)" })}
                  </td>

                  {/* Unit */}
                  <td style={td({ borderRight: border })}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      {isLocked && <Lock size={10} style={{ color: LOCKED_BY.color, flexShrink: 0 }} />}
                      {editableText(driver.loadId, "unit", driver.unit, { mono: true, fontSize: 11, color: isLocked ? LOCKED_BY.color : "var(--foreground)", style: { fontWeight: 500 } })}
                    </div>
                  </td>

                  {/* Type */}
                  <td style={td({ borderRight: border })}>
                    <TypeDropdown value={driver.type} onChange={(t) => patch(driver.loadId, { type: t })} />
                  </td>

                  {/* Status */}
                  <td style={td({ borderRight: border })}>
                    <StatusDropdown value={driver.status} onChange={(s) => patch(driver.loadId, { status: s })} />
                  </td>

                  {/* Origin / Dest with stops */}
                  <td style={td({ borderRight: border, verticalAlign: "top", paddingTop: 12, paddingBottom: 12 })}>
                    <StopList
                      origin={driver.origin}
                      originDone={driver.originDone}
                      destination={driver.destination}
                      stops={driver.stops}
                      onToggleOrigin={() => patch(driver.loadId, { originDone: !driver.originDone })}
                      onEditOrigin={(city) => patch(driver.loadId, { origin: city })}
                      onToggleStop={(idx) => {
                        const updated = driver.stops!.map((s, i) => i === idx ? { ...s, done: !s.done } : s);
                        patch(driver.loadId, { stops: updated });
                      }}
                      onEditStop={(idx, city) => {
                        const updated = driver.stops!.map((s, i) => i === idx ? { ...s, city } : s);
                        patch(driver.loadId, { stops: updated });
                      }}
                    />
                  </td>

                  {/* Appt. Times */}
                  {(() => {
                    const stops = driver.stops;
                    const pickupDone = stops ? stops[0]?.done === true : false;

                    const labelStyle: React.CSSProperties = {
                      fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                      letterSpacing: "0.06em", textTransform: "uppercase" as const,
                      flexShrink: 0, width: 30,
                    };

                    return (
                      <td style={td({ borderRight: border, verticalAlign: "top", paddingTop: 12, paddingBottom: 12 })}>
                        <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>

                          {/* Pickup row — always present */}
                          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <span style={{ ...labelStyle, color: "var(--muted-foreground)" }}>#1</span>
                            {isEdit(driver.loadId, "pickupAppt")
                              ? <InlineCell value={driver.pickupAppt} mono onCommit={(v) => { patch(driver.loadId, { pickupAppt: v }); stopEdit(); }} />
                              : <span onClick={() => startEdit(driver.loadId, "pickupAppt")} style={{ cursor: "text", fontFamily: "var(--font-mono)", fontSize: 11, color: driver.pickupAppt === "—" || pickupDone ? "var(--muted-foreground)" : "var(--foreground)", textDecoration: pickupDone ? "line-through" : "none" }}>{driver.pickupAppt}</span>
                            }
                          </div>

                          {/* Per-stop appt rows */}
                          {stops?.map((stop, idx) => {
                            const prevDone  = idx === 0 || stops[idx - 1].done;
                            const isCurrent = !stop.done && prevDone;
                            const fieldKey  = `stopAppt_${idx}`;

                            return (
                              <div key={idx} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <span style={{ ...labelStyle, color: "var(--muted-foreground)" }}>#{idx + 2}</span>
                                {isEdit(driver.loadId, fieldKey)
                                  ? <InlineCell value={stop.appt ?? ""} mono placeholder="MM/DD · HH:MM"
                                      onCommit={(v) => {
                                        const updated = stops.map((s, i) => i === idx ? { ...s, appt: v } : s);
                                        patch(driver.loadId, { stops: updated });
                                        stopEdit();
                                      }}
                                    />
                                  : <span
                                      onClick={() => startEdit(driver.loadId, fieldKey)}
                                      style={{ cursor: "text", fontFamily: "var(--font-mono)", fontSize: 11, color: stop.done || !stop.appt ? "var(--muted-foreground)" : isCurrent ? "var(--foreground)" : "var(--muted-foreground)", textDecoration: stop.done ? "line-through" : "none", fontWeight: isCurrent ? 500 : 400 }}
                                    >
                                      {stop.appt ?? "—"}
                                    </span>
                                }
                              </div>
                            );
                          })}

                          {/* Fallback DR row for drivers without stops */}
                          {!stops && (() => {
                            const dropDone = false;
                            return (
                              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <span style={{ ...labelStyle, color: "var(--muted-foreground)" }}>#2</span>
                                {isEdit(driver.loadId, "dropAppt")
                                  ? <InlineCell value={driver.dropAppt} mono onCommit={(v) => { patch(driver.loadId, { dropAppt: v }); stopEdit(); }} />
                                  : <span onClick={() => startEdit(driver.loadId, "dropAppt")} style={{ cursor: "text", fontFamily: "var(--font-mono)", fontSize: 11, color: driver.dropAppt === "—" ? "var(--muted-foreground)" : "var(--foreground)" }}>{driver.dropAppt}</span>
                                }
                              </div>
                            );
                          })()}

                        </div>
                      </td>
                    );
                  })()}

                  {/* Current Location */}
                  <td style={td({ borderRight: border })}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <MapPin size={11} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
                      {isEdit(driver.loadId, "location")
                        ? <InlineCell value={driver.location} onCommit={(v) => { patch(driver.loadId, { location: v }); stopEdit(); }} />
                        : <span onClick={() => startEdit(driver.loadId, "location")} style={{ cursor: "text", fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--foreground)" }}>{driver.location}</span>
                      }
                    </div>
                  </td>

                  {/* ETA */}
                  <td style={td({ borderRight: border, verticalAlign: "top", paddingTop: 12, paddingBottom: 12 })}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                      {/* Distance */}
                      {isEdit(driver.loadId, "etaKm") ? (
                        <InlineCell value={driver.etaKm === null ? "" : String(driver.etaKm)} mono placeholder="km"
                          onCommit={(v) => { patch(driver.loadId, { etaKm: v === "" ? null : Number(v) }); stopEdit(); }} />
                      ) : driver.etaKm === null ? (
                        <span onClick={() => startEdit(driver.loadId, "etaKm")} style={{ cursor: "text", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted-foreground)" }}>—</span>
                      ) : driver.etaKm === 0 ? (
                        <span onClick={() => startEdit(driver.loadId, "etaKm")} style={{ cursor: "text", fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "#10B981" }}>At dest.</span>
                      ) : (
                        <div onClick={() => startEdit(driver.loadId, "etaKm")} style={{ cursor: "text", display: "flex", alignItems: "center", gap: 5 }}>
                          <Navigation size={11} style={{ color: kmColor, flexShrink: 0 }} />
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: kmColor, whiteSpace: "nowrap" }}>~{driver.etaKm} km</span>
                        </div>
                      )}
                      {/* Speed */}
                      {isEdit(driver.loadId, "speedMph") ? (
                        <InlineCell value={driver.speedMph == null ? "" : String(driver.speedMph)} mono placeholder="mph"
                          onCommit={(v) => { patch(driver.loadId, { speedMph: v === "" ? null : Number(v) }); stopEdit(); }} />
                      ) : driver.speedMph != null ? (
                        <span onClick={() => startEdit(driver.loadId, "speedMph")} style={{ cursor: "text", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>
                          {driver.speedMph} mph
                        </span>
                      ) : driver.etaKm !== null && driver.etaKm !== 0 ? (
                        <span onClick={() => startEdit(driver.loadId, "speedMph")} style={{ cursor: "text", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--border)" }}>— mph</span>
                      ) : null}
                    </div>
                  </td>

                  {/* Comments */}
                  <td style={td()}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                      <MessageSquare size={11} style={{ color: "var(--muted-foreground)", marginTop: 2, flexShrink: 0 }} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        {isEdit(driver.loadId, "comments")
                          ? <InlineCell value={driver.comments} onCommit={(v) => { patch(driver.loadId, { comments: v }); stopEdit(); }} />
                          : <span onClick={() => startEdit(driver.loadId, "comments")} style={{ cursor: "text", fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--foreground)", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{driver.comments}</span>
                        }
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted-foreground)", display: "block", marginTop: 1 }}>{driver.lastUpdate}</span>
                      </div>
                    </div>
                  </td>

                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Status bar ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 16px", flexShrink: 0, height: 36, backgroundColor: "var(--card)", borderTop: "1px solid var(--border)", borderRadius: "0 0 12px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)" }}>
            <span style={{ color: "#8B5CF6", fontWeight: 600 }}>●</span> Sofia R. is editing row LD-00813
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)" }}>Marcus T. viewing</span>
        </div>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted-foreground)" }}>
          Last sync: just now · ws://dispatch.internal
        </span>
      </div>
    </div>
  );
}
