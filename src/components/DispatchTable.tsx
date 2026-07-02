import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { MapPin, Lock, MessageSquare, ChevronDown, Search, Navigation, Check, ArrowRight, History, X, AlertCircle } from "lucide-react";
import { Status, STATUS_CONFIG, ALL_STATUSES } from "../lib/statuses";
import { api, getCompanyId } from "../lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

type DriverType = "O/O" | "C/D";

interface Stop { city: string; done: boolean; appt?: string; }

// What the backend returns for GET /board
interface BoardRow {
  driver_id: string;
  load_id: string;
  name: string;
  phone: string;
  unit: string;
  type: string;
  status: string;
  origin: string;
  destination: string;
  pickup_appt: string;
  drop_appt: string;
  location: string;
  eta_km: number | null;
  speed_mph: number | null;
  comments: string;
  last_update: string;
}

// UI row (superset of backend — keep all fields so UI never loses columns)
interface Driver {
  driverId: string;      // UUID — used as key for API calls
  loadId: string;        // display ref like "LD-00481"
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
  speedMph: number | null;
  comments: string;
  lastUpdate: string;
}

// Backend history event
interface HistoryEvent {
  id: string;
  actor_name: string;
  entity_type: string;
  entity_id: string;
  entity_ref: string;
  action: "create" | "update" | "delete";
  changes: { field: string; from: unknown; to: unknown }[] | null;
  created_at: string;
}

// Backend lock
interface BoardLock {
  entity_type: string;
  entity_id: string;
  field?: string;
  holder_id: string;
  holder_name: string;
  expires_at: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TYPE_CONFIG: Record<DriverType, { color: string; bg: string }> = {
  "O/O": { color: "#1D4ED8", bg: "#DBEAFE" },
  "C/D": { color: "#5B21B6", bg: "#EDE9FE" },
};

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  if (!iso) return "—";
  const d = Date.now() - new Date(iso).getTime();
  if (d < 60000)     return "just now";
  if (d < 3600000)   return `${Math.floor(d / 60000)}m ago`;
  if (d < 86400000)  return `${Math.floor(d / 3600000)}h ago`;
  if (d < 172800000) return "yesterday";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fromBoardRow(r: BoardRow): Driver {
  return {
    driverId:    r.driver_id,
    loadId:      r.load_id      || "—",
    name:        r.name         || "—",
    phone:       r.phone        || "—",
    unit:        r.unit         || "—",
    type:        (r.type as DriverType) || "O/O",
    status:      (r.status as Status)   || "ready",
    origin:      r.origin       || "—",
    destination: r.destination  || "—",
    pickupAppt:  r.pickup_appt  || "—",
    dropAppt:    r.drop_appt    || "—",
    location:    r.location     || "—",
    etaKm:       r.eta_km,
    speedMph:    r.speed_mph,
    comments:    r.comments     || "",
    lastUpdate:  timeAgo(r.last_update),
  };
}

function etaColor(km: number | null): string {
  if (km === null) return "var(--muted-foreground)";
  if (km <= 0)    return "#10B981";
  if (km < 200)   return "#10B981";
  if (km < 400)   return "#F59E0B";
  return "#EF4444";
}

function getWsBase(): string {
  const base = import.meta.env.VITE_API_BASE ?? "http://localhost:8080";
  return base.replace(/^https/, "wss").replace(/^http/, "ws");
}

// ─── Portal dropdown hook ─────────────────────────────────────────────────────

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
      if (!anchorRef.current?.contains(e.target as Node) && !dropRef.current?.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return { open, setOpen, rect, anchorRef, dropRef, toggle };
}

// ─── Status dropdown ──────────────────────────────────────────────────────────

function StatusDropdown({ value, onChange }: { value: Status; onChange: (s: Status) => void }) {
  const { open, setOpen, rect, anchorRef, dropRef, toggle } = useDropdown();
  const cfg = STATUS_CONFIG[value];

  return (
    <>
      <div ref={anchorRef} onClick={toggle} style={{ cursor: "pointer", display: "inline-flex" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600, color: cfg.color, backgroundColor: cfg.bg, borderRadius: 4, padding: "3px 8px", whiteSpace: "nowrap", userSelect: "none" }}>
          {cfg.label}
          <ChevronDown size={10} style={{ opacity: 0.7, marginLeft: 1 }} />
        </span>
      </div>
      {open && rect && createPortal(
        <div ref={dropRef} style={{ position: "fixed", top: rect.bottom + 5, left: rect.left, zIndex: 9999, backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 10px 30px rgba(0,0,0,0.16)", padding: "5px", minWidth: 168, display: "flex", flexDirection: "column", gap: 1 }}>
          {ALL_STATUSES.map((s) => {
            const c = STATUS_CONFIG[s];
            const active = s === value;
            return (
              <button key={s} onMouseDown={(e) => { e.preventDefault(); onChange(s); setOpen(false); }}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", border: "none", borderRadius: 6, backgroundColor: active ? c.bg : "transparent", cursor: "pointer", width: "100%", textAlign: "left" }}
                onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--muted)"; }}
                onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}>
                <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: c.bg, border: `2px solid ${c.bg}`, flexShrink: 0, boxShadow: active ? `0 0 0 2px ${c.bg}44` : "none" }} />
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: active ? 600 : 400, color: active ? c.color : "var(--foreground)", flex: 1 }}>{c.label}</span>
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

// ─── Type dropdown ────────────────────────────────────────────────────────────

function TypeDropdown({ value, onChange }: { value: DriverType; onChange: (t: DriverType) => void }) {
  const { open, setOpen, rect, anchorRef, dropRef, toggle } = useDropdown();
  const cfg = TYPE_CONFIG[value];

  return (
    <>
      <div ref={anchorRef} onClick={toggle} style={{ cursor: "pointer", display: "inline-flex" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: cfg.color, backgroundColor: cfg.bg, borderRadius: 4, padding: "3px 7px", whiteSpace: "nowrap", userSelect: "none" }}>
          {value}
          <ChevronDown size={10} style={{ opacity: 0.7 }} />
        </span>
      </div>
      {open && rect && createPortal(
        <div ref={dropRef} style={{ position: "fixed", top: rect.bottom + 5, left: rect.left, zIndex: 9999, backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 10px 30px rgba(0,0,0,0.16)", padding: "5px", minWidth: 110, display: "flex", flexDirection: "column", gap: 1 }}>
          {(["O/O", "C/D"] as DriverType[]).map((t) => {
            const c = TYPE_CONFIG[t];
            const active = t === value;
            return (
              <button key={t} onMouseDown={(e) => { e.preventDefault(); onChange(t); setOpen(false); }}
                style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", border: "none", borderRadius: 6, backgroundColor: active ? c.bg : "transparent", cursor: "pointer", width: "100%", textAlign: "left" }}
                onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--muted)"; }}
                onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: active ? 700 : 400, color: active ? c.color : "var(--foreground)", flex: 1 }}>{t}</span>
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

// ─── Inline text input ────────────────────────────────────────────────────────

function InlineCell({ value, onCommit, mono, fontSize = 12, color = "var(--foreground)", placeholder }: {
  value: string; onCommit: (v: string) => void;
  mono?: boolean; fontSize?: number; color?: string; placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); ref.current?.select(); }, []);
  return (
    <input ref={ref} value={draft} placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); onCommit(draft); }
        if (e.key === "Escape") { e.stopPropagation(); onCommit(value); }
      }}
      style={{ width: "100%", border: "none", outline: "none", background: "transparent", fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)", fontSize, color, padding: 0, margin: 0, borderBottom: "1.5px solid var(--primary)" }}
    />
  );
}

// ─── Stop list display ────────────────────────────────────────────────────────

function StopList({ origin, originDone, destination, stops, onToggleStop, onEditStop, onToggleOrigin, onEditOrigin }: {
  origin: string; originDone?: boolean; destination: string; stops?: Stop[];
  onToggleStop?: (idx: number) => void; onEditStop?: (idx: number, city: string) => void;
  onToggleOrigin?: () => void; onEditOrigin?: (city: string) => void;
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
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={labelStyle}>#1</span>
        <button onClick={() => onToggleOrigin?.()} title={originDone ? "Mark incomplete" : "Mark complete"}
          style={{ width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: "none", background: "none", cursor: onToggleOrigin ? "pointer" : "default", padding: 0 }}>
          {originDone
            ? <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, borderRadius: "50%", backgroundColor: "#D1FAE5" }}><Check size={9} style={{ color: "#10B981" }} /></span>
            : <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, borderRadius: "50%", backgroundColor: "var(--secondary)" }}><ArrowRight size={9} style={{ color: "var(--primary)" }} /></span>
          }
        </button>
        {editingOrigin
          ? <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
              onBlur={() => { onEditOrigin?.(draft); setEditingOrigin(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onEditOrigin?.(draft); setEditingOrigin(false); } if (e.key === "Escape") setEditingOrigin(false); }}
              style={{ border: "none", outline: "none", background: "transparent", fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--foreground)", padding: 0, flex: 1, borderBottom: "1.5px solid var(--primary)" }} />
          : <span onClick={() => { setDraft(origin); setEditingOrigin(true); }}
              style={{ fontFamily: "var(--font-sans)", fontSize: 12, cursor: "text", color: originDone ? "var(--muted-foreground)" : "var(--foreground)", textDecoration: originDone ? "line-through" : "none" }}>
              {origin}
            </span>
        }
      </div>
      {stops.map((stop, idx) => {
        const prevDone = idx === 0 || stops[idx - 1].done;
        const isCurrent = !stop.done && prevDone;
        const isEditingThis = editingStop === idx;
        return (
          <div key={idx} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ ...labelStyle }}>#{idx + 2}</span>
            <button onClick={() => onToggleStop?.(idx)} title={stop.done ? "Mark incomplete" : "Mark complete"}
              style={{ width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: "none", background: "none", cursor: onToggleStop ? "pointer" : "default", padding: 0 }}>
              {stop.done
                ? <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, borderRadius: "50%", backgroundColor: "#D1FAE5" }}><Check size={9} style={{ color: "#10B981" }} /></span>
                : isCurrent
                  ? <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, borderRadius: "50%", backgroundColor: "var(--secondary)" }}><ArrowRight size={9} style={{ color: "var(--primary)" }} /></span>
                  : <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "var(--border)", display: "inline-block" }} />
              }
            </button>
            {isEditingThis
              ? <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
                  onBlur={() => { onEditStop?.(idx, draft); setEditingStop(null); }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); onEditStop?.(idx, draft); setEditingStop(null); }
                    if (e.key === "Escape") setEditingStop(null);
                  }}
                  style={{ border: "none", outline: "none", background: "transparent", fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--foreground)", padding: 0, flex: 1, borderBottom: "1.5px solid var(--primary)" }} />
              : <span onClick={() => { setDraft(stop.city); setEditingStop(idx); }}
                  style={{ fontFamily: "var(--font-sans)", fontSize: 12, cursor: "text", color: stop.done ? "var(--muted-foreground)" : isCurrent ? "var(--foreground)" : "var(--muted-foreground)", textDecoration: stop.done ? "line-through" : "none", fontWeight: isCurrent ? 500 : 400 }}>
                  {stop.city}
                </span>
            }
          </div>
        );
      })}
    </div>
  );
}

// ─── History panel ────────────────────────────────────────────────────────────

function HistoryPanel({ events, loading, onClose }: { events: HistoryEvent[]; loading: boolean; onClose: () => void }) {
  const fmtTime = (iso: string) => {
    const d = Date.now() - new Date(iso).getTime();
    if (d < 60000)     return "just now";
    if (d < 3600000)   return `${Math.floor(d / 60000)}m ago`;
    if (d < 86400000)  return `${Math.floor(d / 3600000)}h ago`;
    if (d < 172800000) return "yesterday";
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const actionColor = (a: string) => a === "create" ? "#10B981" : a === "delete" ? "#EF4444" : "#3B82F6";
  const actionBg    = (a: string) => a === "create" ? "#D1FAE5" : a === "delete" ? "#FEE2E2" : "#DBEAFE";

  const entityColor = (t: string) => {
    if (t === "load")   return { color: "#7C3AED", bg: "#EDE9FE" };
    if (t === "driver") return { color: "#0369A1", bg: "#E0F2FE" };
    return { color: "#374151", bg: "var(--muted)" };
  };

  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 9000 }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ position: "absolute", top: 0, right: 0, bottom: 0, width: 420, backgroundColor: "var(--card)", borderLeft: "1px solid var(--border)", boxShadow: "-8px 0 32px rgba(0,0,0,0.12)", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", padding: "16px 20px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <History size={16} style={{ color: "var(--primary)", marginRight: 8 }} />
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 700, color: "var(--foreground)", flex: 1 }}>Change History</span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 4, borderRadius: 6, color: "var(--muted-foreground)", display: "flex" }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--muted)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent")}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
          {loading ? (
            <div style={{ padding: "48px 20px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>Loading…</div>
          ) : events.length === 0 ? (
            <div style={{ padding: "48px 20px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>No history yet.</div>
          ) : (
            <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
              {events.map((ev) => {
                const ec = entityColor(ev.entity_type);
                return (
                  <div key={ev.id} style={{ backgroundColor: "var(--background)", border: "1px solid var(--border)", borderRadius: 10, padding: "12px 14px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {/* Header row */}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, color: "var(--foreground)" }}>{ev.actor_name || "Unknown"}</span>
                      <span style={{ fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 700, color: actionColor(ev.action), backgroundColor: actionBg(ev.action), borderRadius: 4, padding: "1px 6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>{ev.action}</span>
                      <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600, color: ec.color, backgroundColor: ec.bg, borderRadius: 4, padding: "1px 6px" }}>{ev.entity_ref || ev.entity_type}</span>
                      <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{fmtTime(ev.created_at)}</span>
                    </div>
                    {/* Changes */}
                    {ev.changes && ev.changes.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {ev.changes.map((c, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-sans)", fontSize: 12 }}>
                            <span style={{ color: "var(--muted-foreground)", minWidth: 80, textTransform: "capitalize", fontSize: 11 }}>{c.field.replace(/_/g, " ")}</span>
                            <span style={{ color: "#EF4444", backgroundColor: "#FEE2E2", borderRadius: 3, padding: "0 5px", fontFamily: "var(--font-mono)", fontSize: 11, textDecoration: "line-through" }}>{String(c.from ?? "—")}</span>
                            <span style={{ color: "var(--muted-foreground)", fontSize: 10 }}>→</span>
                            <span style={{ color: "#10B981", backgroundColor: "#D1FAE5", borderRadius: 3, padding: "0 5px", fontFamily: "var(--font-mono)", fontSize: 11 }}>{String(c.to ?? "—")}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function DispatchTable() {
  const companyId = getCompanyId();

  const [rows,           setRows]           = useState<Driver[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState<string | null>(null);
  const [search,         setSearch]         = useState("");
  const [statusFilter,   setStatusFilter]   = useState<Status | "all">("all");
  const [filterOpen,     setFilterOpen]     = useState(false);
  const [editCell,       setEditCell]       = useState<{ driverId: string; field: string } | null>(null);
  const [historyEvents,  setHistoryEvents]  = useState<HistoryEvent[]>([]);
  const [historyBadge,   setHistoryBadge]   = useState(0);
  const [historyOpen,    setHistoryOpen]    = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [locks,          setLocks]          = useState<Record<string, BoardLock>>({}); // keyed by driver_id

  const wsRef         = useRef<WebSocket | null>(null);
  const reconnectRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsBackoff     = useRef(2000);
  const filterRef     = useRef<HTMLDivElement>(null);
  // Cache of full driver records (for PUT body construction)
  const driverCache   = useRef<Record<string, Record<string, unknown>>>({});
  // Heartbeat intervals per driverId
  const heartbeats    = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  // ── Fetch board ────────────────────────────────────────────────────────────

  const fetchBoard = async () => {
    try {
      const data = await api.get<BoardRow[]>("/board");
      setRows((data ?? []).map(fromBoardRow));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load board");
    } finally {
      setLoading(false);
    }
  };

  // ── Fetch history ──────────────────────────────────────────────────────────

  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const data = await api.get<HistoryEvent[]>("/board/history?limit=100");
      setHistoryEvents(data ?? []);
      setHistoryBadge(0); // clear badge once panel is opened
    } catch { /* silently ignore */ }
    finally { setHistoryLoading(false); }
  };

  // ── Fetch locks ────────────────────────────────────────────────────────────

  const fetchLocks = async () => {
    try {
      const data = await api.get<BoardLock[]>("/board/locks");
      const map: Record<string, BoardLock> = {};
      (data ?? []).forEach((l) => { map[l.entity_id] = l; });
      setLocks(map);
    } catch { /* silently ignore */ }
  };

  // ── WebSocket ──────────────────────────────────────────────────────────────

  const connectWs = () => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    if (!companyId) return;

    const token = localStorage.getItem("auth_token") ?? "";
    const url   = `${getWsBase()}/api/v1/ws/boards/${companyId}?token=${encodeURIComponent(token)}&company_id=${encodeURIComponent(companyId)}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      wsBackoff.current = 2000; // reset backoff on successful connect
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string);
        switch (msg.type) {
          case "board.snapshot":
            setRows((msg.rows ?? []).map(fromBoardRow));
            break;
          case "board.history":
            setHistoryBadge((n) => n + 1);
            setHistoryEvents((prev) => [msg.event, ...prev].slice(0, 200));
            break;
          case "board.lock":
            setLocks((prev) => {
              const next = { ...prev };
              if (msg.action === "acquired" && msg.lock) {
                next[msg.lock.entity_id] = msg.lock;
              } else if (msg.action === "released" && msg.lock) {
                delete next[msg.lock.entity_id];
              }
              return next;
            });
            break;
        }
      } catch { /* ignore malformed */ }
    };

    ws.onclose = () => {
      // Guard: if connectWs() was called again and replaced this instance, do nothing.
      // This prevents React StrictMode double-invoke or manual reconnect from spawning
      // multiple competing reconnect loops.
      if (wsRef.current !== ws) return;
      wsRef.current = null;

      const delay = wsBackoff.current;
      wsBackoff.current = Math.min(wsBackoff.current * 2, 30_000);
      reconnectRef.current = setTimeout(connectWs, delay);
    };

    ws.onerror = () => { ws.close(); };
  };

  // ── Mount / company switch ─────────────────────────────────────────────────

  useEffect(() => {
    fetchBoard().then(() => { connectWs(); fetchLocks(); });
    return () => {
      if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      Object.values(heartbeats.current).forEach(clearInterval);
      heartbeats.current = {};
    };
  }, [companyId]);

  // ── Close filter on outside click ──────────────────────────────────────────

  useEffect(() => {
    const h = (e: MouseEvent) => { if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false); };
    if (filterOpen) document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [filterOpen]);

  // ── Claim / release lock ───────────────────────────────────────────────────

  const claimLock = async (driverId: string) => {
    try {
      await api.post("/board/locks", { entity_type: "driver", entity_id: driverId });
      // Start heartbeat (re-POST every 20s)
      if (!heartbeats.current[driverId]) {
        heartbeats.current[driverId] = setInterval(() => {
          api.post("/board/locks", { entity_type: "driver", entity_id: driverId }).catch(() => {});
        }, 20_000);
      }
    } catch { /* 409 = someone else holds it — UI will show lock indicator */ }
  };

  const releaseLock = async (driverId: string) => {
    clearInterval(heartbeats.current[driverId]);
    delete heartbeats.current[driverId];
    try { await api.delete(`/board/locks?entity_type=driver&entity_id=${driverId}`); } catch { /* ignore */ }
  };

  // ── Patch (optimistic + API call) ──────────────────────────────────────────

  const patch = async (driverId: string, fields: Partial<Driver>) => {
    const driver = rows.find((d) => d.driverId === driverId);
    if (!driver) return;

    // Optimistic update
    setRows((prev) => prev.map((d) => d.driverId === driverId ? { ...d, ...fields } : d));

    // Build PUT body — use cached full driver record if available, else fill safe defaults
    const cached = driverCache.current[driverId] ?? {};
    const merged = { ...driver, ...fields };
    const body = {
      name:                cached.name                ?? merged.name,
      phone:               cached.phone               ?? merged.phone,
      type:                cached.type                ?? merged.type,
      team:                cached.team                ?? false,
      status:              merged.status,
      location:            merged.location,
      comment:             merged.comments,           // API field is "comment"
      truck:               cached.truck               ?? "",
      trailer:             cached.trailer             ?? "",
      weekly_gross_target: cached.weekly_gross_target ?? 0,
      next_load_id:        cached.next_load_id        ?? null,
    };

    try {
      await api.put(`/drivers/${driverId}`, body);
      // WS snapshot will push the authoritative state back
    } catch {
      // Roll back optimistic update on failure
      setRows((prev) => prev.map((d) => d.driverId === driverId ? driver : d));
    }
  };

  // Pre-fetch full driver record when edit starts (for safe PUT body)
  const startEdit = (driverId: string, field: string) => {
    setEditCell({ driverId, field });
    claimLock(driverId);
    if (!driverCache.current[driverId]) {
      api.get<Record<string, unknown>>(`/drivers/${driverId}`)
        .then((data) => { driverCache.current[driverId] = data ?? {}; })
        .catch(() => {});
    }
  };

  const stopEdit = (driverId?: string) => {
    if (driverId) releaseLock(driverId);
    setEditCell(null);
  };

  const isEdit = (driverId: string, field: string) => editCell?.driverId === driverId && editCell?.field === field;

  const editableText = (driverId: string, field: string, val: string, opts?: { mono?: boolean; color?: string; fontSize?: number; style?: React.CSSProperties }) =>
    isEdit(driverId, field)
      ? <InlineCell value={val} mono={opts?.mono} color={opts?.color} fontSize={opts?.fontSize}
          onCommit={(v) => { patch(driverId, { [field]: v }); stopEdit(driverId); }} />
      : <span onClick={() => startEdit(driverId, field)} style={{ cursor: "text", display: "block", fontFamily: opts?.mono ? "var(--font-mono)" : "var(--font-sans)", fontSize: opts?.fontSize ?? 12, color: opts?.color ?? "var(--foreground)", ...opts?.style }}>{val}</span>;

  // ── Filtered rows ──────────────────────────────────────────────────────────

  const q = search.trim().toLowerCase();
  const visible = rows.filter((d) => {
    const ms = statusFilter === "all" || d.status === statusFilter;
    const mq = !q || d.name.toLowerCase().includes(q) || d.loadId.toLowerCase().includes(q) || d.unit.toLowerCase().includes(q) || d.location.toLowerCase().includes(q);
    return ms && mq;
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {historyOpen && (
        <HistoryPanel
          events={historyEvents}
          loading={historyLoading}
          onClose={() => setHistoryOpen(false)}
        />
      )}

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
            <button onClick={() => setFilterOpen((p) => !p)}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-sans)", fontSize: 12, color: statusFilter === "all" ? "var(--muted-foreground)" : STATUS_CONFIG[statusFilter].color, backgroundColor: statusFilter === "all" ? "var(--muted)" : STATUS_CONFIG[statusFilter].bg, border: "1px solid var(--border)", borderRadius: 7, padding: "5px 10px", cursor: "pointer", whiteSpace: "nowrap" }}>
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
                {ALL_STATUSES.map((s) => {
                  const active = statusFilter === s;
                  return (
                    <button key={s} onClick={() => { setStatusFilter(s); setFilterOpen(false); }}
                      style={{ width: "100%", textAlign: "left", padding: "7px 12px", fontFamily: "var(--font-sans)", fontSize: 12, color: active ? STATUS_CONFIG[s].color : "var(--foreground)", backgroundColor: active ? `${STATUS_CONFIG[s].bg}22` : "transparent", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
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

        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button
            onClick={() => { setHistoryOpen(true); fetchHistory(); }}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", backgroundColor: "var(--muted)", border: "1px solid var(--border)", borderRadius: 7, padding: "5px 12px", cursor: "pointer", position: "relative" }}>
            <History size={12} /> History
            {historyBadge > 0 && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "#fff", backgroundColor: "var(--primary)", borderRadius: 10, padding: "1px 5px", marginLeft: 2 }}>
                {historyBadge}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* ── Table ── */}
      <div style={{ flex: 1, overflow: "auto", position: "relative", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
        {loading ? (
          <div style={{ padding: "64px 20px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>Loading board…</div>
        ) : error ? (
          <div style={{ padding: "64px 20px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <AlertCircle size={20} style={{ color: "#EF4444" }} />
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "#EF4444" }}>{error}</span>
            <button onClick={() => { setLoading(true); fetchBoard(); }} style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--primary)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Retry</button>
          </div>
        ) : (
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
                    backgroundColor: "var(--muted)", borderBottom: "1px solid var(--border)",
                    borderRight: i < COLUMNS.length - 1 ? "1px solid var(--border)" : "none",
                    whiteSpace: "nowrap", userSelect: "none",
                    ...(col.sticky ? { position: "sticky" as const, left: col.left, zIndex: 16, boxShadow: i === 1 ? "2px 0 5px rgba(0,0,0,0.07)" : undefined } : {}),
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
                    {rows.length === 0 ? "No drivers on the board yet." : "No drivers match your filters."}
                  </td>
                </tr>
              )}
              {visible.map((driver, i) => {
                const lock    = locks[driver.driverId];
                const isLocked = !!lock;
                const lockColor = isLocked ? "#8B5CF6" : undefined;
                const isEven   = i % 2 === 0;
                const kmColor  = etaColor(driver.etaKm);
                const rowBg    = isLocked ? "#F5F3FF" : isEven ? "var(--card)" : "var(--background)";
                const border   = "1px solid var(--border)";

                const td = (extra: React.CSSProperties = {}): React.CSSProperties => ({
                  padding: "10px 14px", backgroundColor: rowBg,
                  borderBottom: border, verticalAlign: "middle", ...extra,
                });

                return (
                  <tr key={driver.driverId}>

                    {/* Load ID — sticky, read-only */}
                    <td style={td({ position: "sticky", left: LOAD_ID_LEFT, zIndex: 3, width: 110, minWidth: 110, borderRight: border })}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500, color: "var(--primary)" }}>
                        {driver.loadId}
                      </span>
                    </td>

                    {/* Driver Name — sticky, editable */}
                    <td style={td({ position: "sticky", left: DRIVER_NM_LEFT, zIndex: 3, width: 180, minWidth: 180, borderRight: border, boxShadow: "2px 0 5px rgba(0,0,0,0.07)" })}>
                      {editableText(driver.driverId, "name", driver.name, { style: { fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } })}
                    </td>

                    {/* Phone */}
                    <td style={td({ borderRight: border })}>
                      {editableText(driver.driverId, "phone", driver.phone, { mono: true, fontSize: 11, color: "var(--muted-foreground)" })}
                    </td>

                    {/* Unit */}
                    <td style={td({ borderRight: border })}>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        {isLocked && <Lock size={10} style={{ color: lockColor, flexShrink: 0 }} />}
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 500, color: isLocked ? lockColor : "var(--foreground)" }}>
                          {driver.unit}
                        </span>
                      </div>
                    </td>

                    {/* Type */}
                    <td style={td({ borderRight: border })}>
                      <TypeDropdown value={driver.type} onChange={(t) => patch(driver.driverId, { type: t })} />
                    </td>

                    {/* Status */}
                    <td style={td({ borderRight: border })}>
                      <StatusDropdown value={driver.status} onChange={(s) => patch(driver.driverId, { status: s })} />
                    </td>

                    {/* Origin / Dest with stops */}
                    <td style={td({ borderRight: border, verticalAlign: "top", paddingTop: 12, paddingBottom: 12 })}>
                      <StopList
                        origin={driver.origin}
                        originDone={driver.originDone}
                        destination={driver.destination}
                        stops={driver.stops}
                        onToggleOrigin={() => patch(driver.driverId, { originDone: !driver.originDone })}
                        onEditOrigin={(city) => patch(driver.driverId, { origin: city })}
                        onToggleStop={(idx) => {
                          const updated = driver.stops!.map((s, i) => i === idx ? { ...s, done: !s.done } : s);
                          patch(driver.driverId, { stops: updated });
                        }}
                        onEditStop={(idx, city) => {
                          const updated = driver.stops!.map((s, i) => i === idx ? { ...s, city } : s);
                          patch(driver.driverId, { stops: updated });
                        }}
                      />
                    </td>

                    {/* Appt. Times */}
                    {(() => {
                      const stops = driver.stops;
                      const pickupDone = stops ? stops[0]?.done === true : false;
                      const labelStyle: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" as const, flexShrink: 0, width: 30 };
                      return (
                        <td style={td({ borderRight: border, verticalAlign: "top", paddingTop: 12, paddingBottom: 12 })}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{ ...labelStyle, color: "var(--muted-foreground)" }}>#1</span>
                              {isEdit(driver.driverId, "pickupAppt")
                                ? <InlineCell value={driver.pickupAppt} mono onCommit={(v) => { patch(driver.driverId, { pickupAppt: v }); stopEdit(driver.driverId); }} />
                                : <span onClick={() => startEdit(driver.driverId, "pickupAppt")} style={{ cursor: "text", fontFamily: "var(--font-mono)", fontSize: 11, color: driver.pickupAppt === "—" || pickupDone ? "var(--muted-foreground)" : "var(--foreground)", textDecoration: pickupDone ? "line-through" : "none" }}>{driver.pickupAppt}</span>
                              }
                            </div>
                            {stops?.map((stop, idx) => {
                              const prevDone  = idx === 0 || stops[idx - 1].done;
                              const isCurrent = !stop.done && prevDone;
                              const fieldKey  = `stopAppt_${idx}`;
                              return (
                                <div key={idx} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                  <span style={{ ...labelStyle, color: "var(--muted-foreground)" }}>#{idx + 2}</span>
                                  {isEdit(driver.driverId, fieldKey)
                                    ? <InlineCell value={stop.appt ?? ""} mono placeholder="MM/DD · HH:MM"
                                        onCommit={(v) => { const updated = stops.map((s, i) => i === idx ? { ...s, appt: v } : s); patch(driver.driverId, { stops: updated }); stopEdit(driver.driverId); }} />
                                    : <span onClick={() => startEdit(driver.driverId, fieldKey)}
                                        style={{ cursor: "text", fontFamily: "var(--font-mono)", fontSize: 11, color: stop.done || !stop.appt ? "var(--muted-foreground)" : isCurrent ? "var(--foreground)" : "var(--muted-foreground)", textDecoration: stop.done ? "line-through" : "none", fontWeight: isCurrent ? 500 : 400 }}>
                                        {stop.appt ?? "—"}
                                      </span>
                                  }
                                </div>
                              );
                            })}
                            {!stops && (
                              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <span style={{ ...labelStyle, color: "var(--muted-foreground)" }}>#2</span>
                                {isEdit(driver.driverId, "dropAppt")
                                  ? <InlineCell value={driver.dropAppt} mono onCommit={(v) => { patch(driver.driverId, { dropAppt: v }); stopEdit(driver.driverId); }} />
                                  : <span onClick={() => startEdit(driver.driverId, "dropAppt")} style={{ cursor: "text", fontFamily: "var(--font-mono)", fontSize: 11, color: driver.dropAppt === "—" ? "var(--muted-foreground)" : "var(--foreground)" }}>{driver.dropAppt}</span>
                                }
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    })()}

                    {/* Current Location */}
                    <td style={td({ borderRight: border })}>
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <MapPin size={11} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
                        {isEdit(driver.driverId, "location")
                          ? <InlineCell value={driver.location} onCommit={(v) => { patch(driver.driverId, { location: v }); stopEdit(driver.driverId); }} />
                          : <span onClick={() => startEdit(driver.driverId, "location")} style={{ cursor: "text", fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--foreground)" }}>{driver.location}</span>
                        }
                      </div>
                    </td>

                    {/* ETA / Dist. — always null from backend for now */}
                    <td style={td({ borderRight: border, verticalAlign: "top", paddingTop: 12, paddingBottom: 12 })}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        {driver.etaKm === null ? (
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted-foreground)" }}>—</span>
                        ) : driver.etaKm === 0 ? (
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "#10B981" }}>At dest.</span>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                            <Navigation size={11} style={{ color: kmColor, flexShrink: 0 }} />
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: kmColor, whiteSpace: "nowrap" }}>~{driver.etaKm} km</span>
                          </div>
                        )}
                        {driver.speedMph != null && (
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{driver.speedMph} mph</span>
                        )}
                      </div>
                    </td>

                    {/* Comments */}
                    <td style={td()}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                        <MessageSquare size={11} style={{ color: "var(--muted-foreground)", marginTop: 2, flexShrink: 0 }} />
                        <div style={{ minWidth: 0, flex: 1 }}>
                          {isEdit(driver.driverId, "comments")
                            ? <InlineCell value={driver.comments} onCommit={(v) => { patch(driver.driverId, { comments: v }); stopEdit(driver.driverId); }} />
                            : <span onClick={() => startEdit(driver.driverId, "comments")} style={{ cursor: "text", fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--foreground)", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{driver.comments || "—"}</span>
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
        )}
      </div>

    </div>
  );
}
