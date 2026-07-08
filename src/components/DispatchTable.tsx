import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { MapPin, Lock, MessageSquare, ChevronDown, Search, Navigation, Check, ArrowRight, History, X, AlertCircle, RotateCcw, Users } from "lucide-react";
import { Status, STATUS_CONFIG, ALL_STATUSES } from "../lib/statuses";
import { api, getCompanyId } from "../lib/api";
import { menuPosition } from "../lib/menuPosition";
import { driverDisplayName } from "../lib/driverName";

// ─── Types ────────────────────────────────────────────────────────────────────

type DriverType = "O/O" | "C/D";

interface Stop { city: string; done: boolean; appt?: string; location?: { lat: number; lng: number }; }

// The full current load carried on each board row (same shape as GET /loads)
interface BoardLoad {
  id: string;
  stops?: Stop[];
  broker?: string;
  payout?: number;
  miles?: number;
  dispatcher?: string;
  [k: string]: unknown; // passed back verbatim on PUT /loads/:id
}

// What the backend returns for GET /board
interface BoardRow {
  driver_id: string;
  load_id: string;
  name: string;
  phone: string;
  team?: boolean;   // two-person driver (name2/phone2 carry the second contact)
  name2?: string;
  phone2?: string;
  unit: string;
  trailer?: string;
  type: string;
  status: string;
  origin: string;         // derived: current load's first stop
  destination: string;    // derived: current load's last stop
  pickup_appt: string;    // derived: first stop's appt
  drop_appt: string;      // derived: last stop's appt
  load?: BoardLoad | null; // full current load (null when idle) — holds the ordered stops
  location: string;
  eta_km: number | null;
  speed_mph: number | null;
  comments: string;
  last_update: string;
}

// UI row (superset of backend — keep all fields so UI never loses columns)
interface Driver {
  driverId: string;      // UUID — used as key for driver API calls
  loadId: string;        // display ref like "LD-00481"
  loadUuid?: string;     // actual UUID for PUT /loads/:id
  loadRaw?: BoardLoad;   // full load object — PUT base for stop toggles (no refetch)
  name: string;          // raw first-driver name — kept separate for inline editing
  phone: string;
  team?: boolean;
  name2?: string;
  phone2?: string;
  unit: string;
  trailer?: string;
  type: DriverType;
  status: Status;
  origin: string;
  originDone?: boolean;
  destination: string;
  destinationDone?: boolean;
  stops?: Stop[];        // INTERMEDIATE stops only (between origin and destination)
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
  { label: "Unit / Trailer", width: 116, sticky: false                        },
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
  // The route lives in load.stops (full, ordered). Split it for the StopList:
  // stops[0] = origin, stops[last] = destination, the middle = intermediate stops.
  const route = r.load?.stops ?? [];
  const first = route[0];
  const last  = route.length > 1 ? route[route.length - 1] : undefined;
  return {
    driverId:    r.driver_id,
    loadId:      r.load_id      || "—",
    loadUuid:    r.load?.id,
    loadRaw:     r.load ?? undefined,
    name:        r.name         || "—",
    phone:       r.phone        || "—",
    team:        r.team         ?? false,
    name2:       r.name2        || undefined,
    phone2:      r.phone2       || undefined,
    unit:        r.unit         || "—",
    trailer:     r.trailer      || "—",
    type:        (r.type as DriverType) || "O/O",
    status:      (r.status as Status)   || "ready",
    origin:          (first?.city ?? r.origin) || "—",
    originDone:      first?.done ?? false,
    destination:     (last?.city ?? r.destination) || "—",
    destinationDone: last?.done ?? false,
    stops:           route.slice(1, -1),
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

function StatusDropdown({ value, onChange }: { value: Status; onChange: (s: Status) => void | Promise<void> }) {
  const { open, setOpen, rect, anchorRef, dropRef, toggle } = useDropdown();
  const [busy, setBusy] = useState(false);
  const cfg = STATUS_CONFIG[value];

  const select = (s: Status) => {
    setOpen(false);
    setBusy(true);
    Promise.resolve(onChange(s)).catch(() => {}).finally(() => setBusy(false));
  };

  return (
    <>
      <div ref={anchorRef} onClick={busy ? undefined : toggle} style={{ cursor: busy ? "default" : "pointer", display: "inline-flex" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600, color: cfg.color, backgroundColor: cfg.bg, borderRadius: 4, padding: "3px 8px", whiteSpace: "nowrap", userSelect: "none" }}>
          {cfg.label}
          {busy
            ? <span style={{ width: 9, height: 9, borderRadius: "50%", border: `1.5px solid ${cfg.color}55`, borderTopColor: cfg.color, animation: "spin 0.7s linear infinite", display: "inline-block", marginLeft: 1 }} />
            : <ChevronDown size={10} style={{ opacity: 0.7, marginLeft: 1 }} />}
        </span>
      </div>
      {open && rect && (() => {
        const { top, left } = menuPosition(rect, ALL_STATUSES.length, 168);
        return createPortal(
        <div ref={dropRef} style={{ position: "fixed", top, left, zIndex: 9999, backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 10px 30px rgba(0,0,0,0.16)", padding: "5px", minWidth: 168, maxHeight: "calc(100vh - 16px)", overflowY: "auto", display: "flex", flexDirection: "column", gap: 1 }}>
          {ALL_STATUSES.map((s) => {
            const c = STATUS_CONFIG[s];
            const active = s === value;
            return (
              <button key={s} onMouseDown={(e) => { e.preventDefault(); select(s); }}
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
        );
      })()}
    </>
  );
}

// ─── Type dropdown ────────────────────────────────────────────────────────────

function TypeDropdown({ value, onChange }: { value: DriverType; onChange: (t: DriverType) => void | Promise<void> }) {
  const { open, setOpen, rect, anchorRef, dropRef, toggle } = useDropdown();
  const [busy, setBusy] = useState(false);
  const cfg = TYPE_CONFIG[value];

  const select = (t: DriverType) => {
    setOpen(false);
    setBusy(true);
    Promise.resolve(onChange(t)).catch(() => {}).finally(() => setBusy(false));
  };

  return (
    <>
      <div ref={anchorRef} onClick={busy ? undefined : toggle} style={{ cursor: busy ? "default" : "pointer", display: "inline-flex" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: cfg.color, backgroundColor: cfg.bg, borderRadius: 4, padding: "3px 7px", whiteSpace: "nowrap", userSelect: "none" }}>
          {value}
          {busy
            ? <span style={{ width: 9, height: 9, borderRadius: "50%", border: `1.5px solid ${cfg.color}55`, borderTopColor: cfg.color, animation: "spin 0.7s linear infinite", display: "inline-block" }} />
            : <ChevronDown size={10} style={{ opacity: 0.7 }} />}
        </span>
      </div>
      {open && rect && (() => {
        const { top, left } = menuPosition(rect, 2, 110);
        return createPortal(
        <div ref={dropRef} style={{ position: "fixed", top, left, zIndex: 9999, backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 10px 30px rgba(0,0,0,0.16)", padding: "5px", minWidth: 110, maxHeight: "calc(100vh - 16px)", overflowY: "auto", display: "flex", flexDirection: "column", gap: 1 }}>
          {(["O/O", "C/D"] as DriverType[]).map((t) => {
            const c = TYPE_CONFIG[t];
            const active = t === value;
            return (
              <button key={t} onMouseDown={(e) => { e.preventDefault(); select(t); }}
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
        );
      })()}
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

function TickBtn({ done, isCurrent, canToggle, onToggle }: { done: boolean; isCurrent: boolean; canToggle: boolean; onToggle?: () => void }) {
  const active = canToggle && !!onToggle;
  return (
    <button
      onClick={() => { if (active) onToggle?.(); }}
      disabled={!active}
      title={!canToggle ? "Complete the previous stop first" : done ? "Mark incomplete" : "Mark complete"}
      style={{ width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, border: "none", background: "none", cursor: active ? "pointer" : "default", padding: 0, opacity: !done && !canToggle ? 0.5 : 1 }}
    >
      {done ? (
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
  );
}

function StopList({ origin, originDone, destination, destinationDone, stops, onToggleOrigin, onToggleDestination, onToggleStop, onEditStop, onEditOrigin }: {
  origin: string; originDone?: boolean;
  destination: string; destinationDone?: boolean;
  stops?: Stop[];
  onToggleOrigin?: () => void; onToggleDestination?: () => void;
  onToggleStop?: (idx: number) => void;
  onEditStop?: (idx: number, city: string) => void;
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

  const textStyle = (done: boolean, isCurrent = true): React.CSSProperties => ({
    fontFamily: "var(--font-sans)", fontSize: 12,
    color: done ? "var(--muted-foreground)" : isCurrent ? "var(--foreground)" : "var(--muted-foreground)",
    textDecoration: done ? "line-through" : "none",
    fontWeight: isCurrent && !done ? 500 : 400,
  });

  // All stops as a flat list: origin, ...intermediates, destination
  const allStops = [
    { city: origin,      done: originDone ?? false,      onToggle: onToggleOrigin,      isOrigin: true  },
    ...(stops ?? []).map((s, i) => ({ city: s.city, done: s.done, onToggle: () => onToggleStop?.(i), isOrigin: false })),
    { city: destination, done: destinationDone ?? false, onToggle: onToggleDestination, isOrigin: false },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {allStops.map((stop, idx) => {
        const prevDone  = idx === 0 || allStops[idx - 1].done;
        const isCurrent = !stop.done && prevDone;
        const isEditingThis = stop.isOrigin && editingOrigin;
        // Can mark done only if every earlier stop is done; can always un-mark a done stop.
        const canToggle = stop.done || prevDone;

        return (
          <div key={idx} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={labelStyle}>#{idx + 1}</span>
            <TickBtn done={stop.done} isCurrent={isCurrent} canToggle={canToggle} onToggle={stop.onToggle} />
            {isEditingThis ? (
              <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
                onBlur={() => { onEditOrigin?.(draft); setEditingOrigin(false); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); onEditOrigin?.(draft); setEditingOrigin(false); }
                  if (e.key === "Escape") setEditingOrigin(false);
                }}
                style={{ border: "none", outline: "none", background: "transparent", fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--foreground)", padding: 0, flex: 1, borderBottom: "1.5px solid var(--primary)" }} />
            ) : editingStop === idx - 1 && !stop.isOrigin && idx > 0 && idx < allStops.length - 1 ? (
              <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
                onBlur={() => { onEditStop?.(idx - 1, draft); setEditingStop(null); }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") { e.preventDefault(); onEditStop?.(idx - 1, draft); setEditingStop(null); }
                  if (e.key === "Escape") setEditingStop(null);
                }}
                style={{ border: "none", outline: "none", background: "transparent", fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--foreground)", padding: 0, flex: 1, borderBottom: "1.5px solid var(--primary)" }} />
            ) : (
              <span
                onClick={() => {
                  if (stop.isOrigin) { setDraft(stop.city); setEditingOrigin(true); }
                  else if (idx > 0 && idx < allStops.length - 1) { setDraft(stop.city); setEditingStop(idx - 1); }
                }}
                style={{ ...textStyle(stop.done, isCurrent), cursor: idx < allStops.length - 1 || stop.isOrigin ? "text" : "default" }}
              >
                {stop.city || "—"}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── History panel ────────────────────────────────────────────────────────────

function HistoryPanel({ events, loading, onClose, onRevert }: {
  events: HistoryEvent[]; loading: boolean; onClose: () => void;
  onRevert: (ev: HistoryEvent) => Promise<void>;
}) {
  const [confirm, setConfirm]     = useState<HistoryEvent | null>(null);
  const [reverting, setReverting] = useState(false);
  const [revertErr, setRevertErr] = useState<string | null>(null);

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

  const revertable = (ev: HistoryEvent) => ev.action === "update" && !!ev.changes && ev.changes.length > 0;

  // For each field the event changed, find the NEWEST later event (same entity) that
  // touched the same field — reverting will overwrite that newer value, so warn.
  const laterOverrides = (ev: HistoryEvent): { field: string; discarded: string }[] => {
    const idx = events.findIndex((e) => e.id === ev.id);
    const out: { field: string; discarded: string }[] = [];
    for (const c of ev.changes ?? []) {
      // Scan from the newest end down to ev; first hit is the current (to be discarded) value.
      for (let j = 0; j < idx; j++) { // events[0..idx-1] are newer (list is newest-first)
        const e2 = events[j];
        if (e2.entity_id !== ev.entity_id) continue;
        const hit = (e2.changes ?? []).find((x) => x.field === c.field);
        if (hit) { out.push({ field: c.field, discarded: String(hit.to ?? "—") }); break; }
      }
    }
    return out;
  };

  const doRevert = async () => {
    if (!confirm) return;
    setReverting(true); setRevertErr(null);
    try {
      await onRevert(confirm);
      setConfirm(null);
    } catch (e) {
      setRevertErr(e instanceof Error ? e.message : "Revert failed");
    } finally {
      setReverting(false);
    }
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
                    {/* Revert */}
                    {revertable(ev) && (
                      <button onClick={() => { setRevertErr(null); setConfirm(ev); }}
                        style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 5, marginTop: 2, padding: "3px 9px", borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "transparent", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)" }}
                        onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = "var(--primary)"; b.style.color = "var(--primary)"; }}
                        onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = "var(--border)"; b.style.color = "var(--muted-foreground)"; }}>
                        <RotateCcw size={11} /> Revert
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Revert confirm */}
      {confirm && (() => {
        const overrides = laterOverrides(confirm);
        return (
          <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 9500, display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={(e) => { if (e.target === e.currentTarget && !reverting) setConfirm(null); }}>
            <div style={{ backgroundColor: "var(--card)", borderRadius: 12, width: 400, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: "var(--secondary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <RotateCcw size={15} style={{ color: "var(--primary)" }} />
                </div>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>
                  Revert this change?
                </span>
              </div>
              <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
                  On <strong style={{ color: "var(--foreground)" }}>{confirm.entity_ref || confirm.entity_type}</strong> this will restore:
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  {(confirm.changes ?? []).map((c, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-sans)", fontSize: 12 }}>
                      <span style={{ color: "var(--muted-foreground)", minWidth: 74, textTransform: "capitalize", fontSize: 11 }}>{c.field.replace(/_/g, " ")}</span>
                      <span style={{ color: "var(--muted-foreground)", fontSize: 10 }}>→</span>
                      <span style={{ color: "#10B981", backgroundColor: "#D1FAE5", borderRadius: 3, padding: "1px 6px", fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600 }}>{String(c.from ?? "—")}</span>
                    </div>
                  ))}
                </div>
                {overrides.length > 0 && (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "9px 12px", backgroundColor: "#FFFBEB", border: "1px solid #FDE68A", borderRadius: 8 }}>
                    <AlertCircle size={14} color="#D97706" style={{ flexShrink: 0, marginTop: 1 }} />
                    <div style={{ fontFamily: "var(--font-sans)", fontSize: 11.5, color: "#92400E", lineHeight: 1.5 }}>
                      This also discards {overrides.length === 1 ? "a later change" : "later changes"} to{" "}
                      {overrides.map((o, i) => (
                        <span key={o.field}>
                          {i > 0 && ", "}
                          <strong style={{ textTransform: "capitalize" }}>{o.field.replace(/_/g, " ")}</strong> (now <strong>{o.discarded}</strong>)
                        </span>
                      ))}.
                    </div>
                  </div>
                )}
                {revertErr && (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "9px 12px", backgroundColor: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 8 }}>
                    <AlertCircle size={14} color="#DC2626" style={{ flexShrink: 0, marginTop: 1 }} />
                    <div style={{ fontFamily: "var(--font-sans)", fontSize: 11.5, color: "#991B1B", lineHeight: 1.5 }}>{revertErr}</div>
                  </div>
                )}
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 20px", borderTop: "1px solid var(--border)" }}>
                <button onClick={() => setConfirm(null)} disabled={reverting}
                  style={{ fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 16px", borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "var(--muted)", color: "var(--foreground)", cursor: reverting ? "default" : "pointer" }}>
                  Cancel
                </button>
                <button onClick={doRevert} disabled={reverting}
                  style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "7px 16px", borderRadius: 6, border: "none", backgroundColor: reverting ? "var(--muted)" : "var(--primary)", color: reverting ? "var(--muted-foreground)" : "#fff", cursor: reverting ? "default" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                  <RotateCcw size={13} /> {reverting ? "Reverting…" : "Revert"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
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
  const [teams,          setTeams]          = useState<{ id: string; name: string; driverIds: Set<string> }[]>([]);
  const [teamFilter,     setTeamFilter]     = useState<string>("all"); // team id or "all"
  const [teamOpen,       setTeamOpen]       = useState(false);
  const [editCell,       setEditCell]       = useState<{ driverId: string; field: string } | null>(null);
  const [historyEvents,  setHistoryEvents]  = useState<HistoryEvent[]>([]);
  const [historyBadge,   setHistoryBadge]   = useState(0);
  const [historyOpen,    setHistoryOpen]    = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [locks,          setLocks]          = useState<Record<string, BoardLock>>({}); // keyed by driver_id
  const [toast,          setToast]          = useState<string | null>(null); // transient error banner

  const wsRef         = useRef<WebSocket | null>(null);
  const reconnectRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsBackoff     = useRef(2000);
  const filterRef     = useRef<HTMLDivElement>(null);
  const teamRef       = useRef<HTMLDivElement>(null);
  // Cache of full driver records (for PUT body construction)
  const driverCache   = useRef<Record<string, Record<string, unknown>>>({});
  // Heartbeat intervals per driverId
  const heartbeats    = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  // Auto-dismiss the error banner.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

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

  // ── Revert a history event ─────────────────────────────────────────────────
  // The endpoint only RETURNS the prior field values (no server-side write); we
  // re-apply them by merging into the entity's current record and PUTting it —
  // which the board picks up via a board.snapshot push. Throws on failure so the
  // panel can surface 409 locked / 400 not_revertable inline.
  const revertEvent = async (ev: HistoryEvent) => {
    const res = await api.post<{ entity_type: string; entity_id: string; fields: Record<string, unknown> }>(
      `/board/history/${ev.id}/revert`
    );
    const fields = { ...(res.fields ?? {}) };
    delete fields.route; // legacy label on old events — not applyable; stops carries the real route
    if (Object.keys(fields).length === 0) return; // nothing to re-apply

    const path = `/${res.entity_type}s/${res.entity_id}`;
    const current = await api.get<Record<string, unknown>>(path);
    await api.put(path, { ...current, ...fields });
    fetchHistory(); // pull in the fresh "revert" audit entry
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

  // ── Fetch teams (dispatch pods) for the board filter ───────────────────────
  // Realtime board.snapshot is still whole-company, so we filter rows to the team's
  // drivers client-side. Teams live under /owner/* — non-owners get 403, which just
  // means no team filter is shown.
  const fetchTeams = async () => {
    if (!companyId) return;
    try {
      const data = await api.get<{ id: string; name: string; driver_ids?: string[] }[]>(`/owner/companies/${companyId}/teams`);
      setTeams((data ?? []).map((t) => ({ id: t.id, name: t.name, driverIds: new Set(t.driver_ids ?? []) })));
    } catch { setTeams([]); }
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
    fetchTeams();
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

  useEffect(() => {
    const h = (e: MouseEvent) => { if (teamRef.current && !teamRef.current.contains(e.target as Node)) setTeamOpen(false); };
    if (teamOpen) document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [teamOpen]);

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
    try { await api.delete("/board/locks", { entity_type: "driver", entity_id: driverId }); } catch { /* ignore */ }
  };

  // ── Patch (optimistic + API call) ──────────────────────────────────────────

  const patch = async (driverId: string, fields: Partial<Driver>) => {
    const driver = rows.find((d) => d.driverId === driverId);
    if (!driver) return;

    // Optimistic update
    setRows((prev) => prev.map((d) => d.driverId === driverId ? { ...d, ...fields } : d));

    // Build PUT body. PUT /drivers/:id is a FULL REPLACE, so every editable field must be
    // sent or the backend resets it — critically team/name2/phone2 (a false/omitted team
    // clears the co-driver). Prefer the cached full record when we have it (inline edits
    // pre-fetch it), else fall back to the board row, which already carries these fields.
    // truck/trailer are read-only derived — never send them; omitting truck_id/trailer_id
    // leaves the assignment untouched (tri-state).
    const cached = driverCache.current[driverId] ?? {};
    const merged = { ...driver, ...fields };
    const body = {
      name:                cached.name   ?? merged.name,
      phone:               cached.phone  ?? merged.phone,
      type:                cached.type   ?? merged.type,
      team:                (cached.team   ?? merged.team) ?? false,
      name2:               (cached.name2  ?? merged.name2)  ?? "",
      phone2:              (cached.phone2 ?? merged.phone2) ?? "",
      status:              merged.status,
      location:            merged.location,
      comment:             merged.comments,           // API field is "comment"
      weekly_gross_target: cached.weekly_gross_target ?? 0,
      next_load_id:        cached.next_load_id        ?? null,
    };

    try {
      await api.put(`/drivers/${driverId}`, body);
      // WS snapshot will push the authoritative state back
    } catch (e) {
      // Roll back optimistic update on failure and tell the user (the revert is otherwise silent)
      setRows((prev) => prev.map((d) => d.driverId === driverId ? driver : d));
      setToast(e instanceof Error ? e.message : "Couldn't save the change — reverted.");
    }
  };

  // ── Patch load (stop done toggles) ────────────────────────────────────────

  const patchLoad = async (driverId: string, updatedStops: Stop[], updatedOriginDone: boolean, updatedDestinationDone: boolean) => {
    const driver = rows.find((d) => d.driverId === driverId);
    if (!driver) return;

    // Optimistic update first — UI always responds immediately regardless of whether API succeeds
    setRows((prev) => prev.map((d) => d.driverId === driverId
      ? { ...d, stops: updatedStops, originDone: updatedOriginDone, destinationDone: updatedDestinationDone }
      : d
    ));

    const rollback = () => setRows((prev) => prev.map((d) => d.driverId === driverId ? driver : d));

    // The board row already carries the full load — no fetch needed.
    const load = driver.loadRaw;
    if (!load?.id) { rollback(); return; } // driver has no active load to persist against

    // Rebuild the full ordered route from the load's own stops, applying the toggled
    // done flags (preserves each stop's city/appt/location).
    const raw = load.stops ?? [];
    const fullStops: Stop[] = raw.length === 0 ? [] : [
      { ...raw[0], done: updatedOriginDone },
      ...updatedStops,
      ...(raw.length > 1 ? [{ ...raw[raw.length - 1], done: updatedDestinationDone }] : []),
    ];

    try {
      await api.put(`/loads/${load.id}`, { ...load, stops: fullStops });
      // WS snapshot pushes the authoritative row (with load.stops) back
    } catch {
      rollback();
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
  // Team scoping is filtered client-side (the realtime snapshot is whole-company).
  const activeTeam = teamFilter === "all" ? null : teams.find((t) => t.id === teamFilter) ?? null;
  const visible = rows.filter((d) => {
    const ms = statusFilter === "all" || d.status === statusFilter;
    const mq = !q || d.name.toLowerCase().includes(q) || (d.name2 ?? "").toLowerCase().includes(q) || d.loadId.toLowerCase().includes(q) || d.unit.toLowerCase().includes(q) || d.location.toLowerCase().includes(q);
    const mt = !activeTeam || activeTeam.driverIds.has(d.driverId);
    return ms && mq && mt;
  });

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {toast && (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 10000, display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 8, backgroundColor: "var(--card)", border: "1px solid #EF4444", boxShadow: "0 10px 30px rgba(0,0,0,0.16)", maxWidth: 360 }}>
          <AlertCircle size={15} style={{ color: "#EF4444", flexShrink: 0 }} />
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--foreground)" }}>{toast}</span>
        </div>
      )}
      {historyOpen && (
        <HistoryPanel
          events={historyEvents}
          loading={historyLoading}
          onClose={() => setHistoryOpen(false)}
          onRevert={revertEvent}
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

          {/* Team filter (only shown when the company has dispatch pods) */}
          {teams.length > 0 && (
            <div ref={teamRef} style={{ position: "relative" }}>
              <button onClick={() => setTeamOpen((p) => !p)}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-sans)", fontSize: 12, color: activeTeam ? "var(--primary)" : "var(--muted-foreground)", backgroundColor: activeTeam ? "var(--secondary)" : "var(--muted)", border: "1px solid var(--border)", borderRadius: 7, padding: "5px 10px", cursor: "pointer", whiteSpace: "nowrap" }}>
                <Users size={12} />
                {activeTeam ? activeTeam.name : "All Teams"}
                <ChevronDown size={11} />
              </button>
              {teamOpen && (
                <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 100, backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", minWidth: 180, padding: "4px 0", maxHeight: 320, overflowY: "auto" }}>
                  <button onClick={() => { setTeamFilter("all"); setTeamOpen(false); }} style={{ width: "100%", textAlign: "left", padding: "7px 12px", fontFamily: "var(--font-sans)", fontSize: 12, color: teamFilter === "all" ? "var(--primary)" : "var(--foreground)", backgroundColor: teamFilter === "all" ? "var(--secondary)" : "transparent", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>All Teams</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted-foreground)" }}>{rows.length}</span>
                  </button>
                  <div style={{ height: 1, backgroundColor: "var(--border)", margin: "3px 0" }} />
                  {teams.map((t) => {
                    const active = teamFilter === t.id;
                    return (
                      <button key={t.id} onClick={() => { setTeamFilter(t.id); setTeamOpen(false); }}
                        style={{ width: "100%", textAlign: "left", padding: "7px 12px", fontFamily: "var(--font-sans)", fontSize: 12, color: active ? "var(--primary)" : "var(--foreground)", backgroundColor: active ? "var(--secondary)" : "transparent", border: "none", cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted-foreground)" }}>{rows.filter((d) => t.driverIds.has(d.driverId)).length}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

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

                // No active load → route/appointment cells are empty and non-interactive.
                const hasLoad = !!driver.loadRaw?.id;
                const emptyDash = <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)" }}>—</span>;

                return (
                  <tr key={driver.driverId}>

                    {/* Load ID — sticky, read-only */}
                    <td style={td({ position: "sticky", left: LOAD_ID_LEFT, zIndex: 3, width: 110, minWidth: 110, borderRight: border })}>
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500, color: "var(--primary)" }}>
                        {driver.loadId}
                      </span>
                    </td>

                    {/* Driver Name — sticky. Team drivers show "Name1 & Name2" and aren't
                        inline-editable here (there's no single field to write that back to). */}
                    <td style={td({ position: "sticky", left: DRIVER_NM_LEFT, zIndex: 3, width: 180, minWidth: 180, borderRight: border, boxShadow: "2px 0 5px rgba(0,0,0,0.07)" })}>
                      {driver.team ? (
                        <span style={{ fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", display: "block", fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--foreground)" }}>
                          {driverDisplayName({ name: driver.name, name2: driver.name2, team: driver.team })}
                        </span>
                      ) : (
                        editableText(driver.driverId, "name", driver.name, { style: { fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" } })
                      )}
                    </td>

                    {/* Phone — team drivers show both contacts (read-only) */}
                    <td style={td({ borderRight: border })}>
                      {driver.team ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{driver.phone}</span>
                          {driver.phone2 && <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{driver.phone2}</span>}
                        </div>
                      ) : (
                        editableText(driver.driverId, "phone", driver.phone, { mono: true, fontSize: 11, color: "var(--muted-foreground)" })
                      )}
                    </td>

                    {/* Unit / Trailer */}
                    <td style={td({ borderRight: border })}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                          {isLocked && <Lock size={10} style={{ color: lockColor, flexShrink: 0 }} />}
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 500, color: isLocked ? lockColor : "var(--foreground)" }}>
                            {driver.unit}
                          </span>
                        </div>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>
                          {driver.trailer}
                        </span>
                      </div>
                    </td>

                    {/* Type */}
                    <td style={td({ borderRight: border })}>
                      <TypeDropdown value={driver.type} onChange={(t) => patch(driver.driverId, { type: t })} />
                    </td>

                    {/* Status */}
                    <td style={td({ borderRight: border })}>
                      <StatusDropdown value={driver.status} onChange={async (s) => {
                        await patch(driver.driverId, { status: s });
                        // Completing a load marks its whole route done (persisted to the load).
                        if (s === "completed" && driver.loadRaw?.id) {
                          await patchLoad(driver.driverId, (driver.stops ?? []).map((st) => ({ ...st, done: true })), true, true);
                        }
                      }} />
                    </td>

                    {/* Origin / Dest with stops — only when the driver has a load */}
                    <td style={td({ borderRight: border, verticalAlign: hasLoad ? "top" : "middle", paddingTop: 12, paddingBottom: 12 })}>
                      {!hasLoad ? emptyDash : (
                      <StopList
                        origin={driver.origin}
                        originDone={driver.originDone}
                        destination={driver.destination}
                        destinationDone={driver.destinationDone}
                        stops={driver.stops}
                        onToggleOrigin={() => patchLoad(driver.driverId, driver.stops ?? [], !driver.originDone, driver.destinationDone ?? false)}
                        onToggleDestination={() => patchLoad(driver.driverId, driver.stops ?? [], driver.originDone ?? false, !driver.destinationDone)}
                        onEditOrigin={(city) => patch(driver.driverId, { origin: city })}
                        onToggleStop={(idx) => {
                          const updated = (driver.stops ?? []).map((s, i) => i === idx ? { ...s, done: !s.done } : s);
                          patchLoad(driver.driverId, updated, driver.originDone ?? false, driver.destinationDone ?? false);
                        }}
                        onEditStop={(idx, city) => {
                          const updated = (driver.stops ?? []).map((s, i) => i === idx ? { ...s, city } : s);
                          patch(driver.driverId, { stops: updated });
                        }}
                      />
                      )}
                    </td>

                    {/* Appt. Times — #1 pickup, intermediate stops, then destination */}
                    {!hasLoad ? (
                      <td style={td({ borderRight: border })}>{emptyDash}</td>
                    ) : (() => {
                      const stops = driver.stops ?? [];
                      const labelStyle: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" as const, flexShrink: 0, width: 30 };
                      const pickupDone = driver.originDone ?? false;
                      const destDone   = driver.destinationDone ?? false;
                      const destNum    = stops.length + 2;
                      return (
                        <td style={td({ borderRight: border, verticalAlign: "top", paddingTop: 12, paddingBottom: 12 })}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            {/* #1 pickup */}
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{ ...labelStyle, color: "var(--muted-foreground)" }}>#1</span>
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: driver.pickupAppt === "—" || pickupDone ? "var(--muted-foreground)" : "var(--foreground)", textDecoration: pickupDone ? "line-through" : "none" }}>{driver.pickupAppt}</span>
                            </div>
                            {/* intermediate stops */}
                            {stops.map((stop, idx) => {
                              const prevDone  = idx === 0 ? pickupDone : stops[idx - 1].done;
                              const isCurrent = !stop.done && prevDone;
                              return (
                                <div key={idx} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                  <span style={{ ...labelStyle, color: "var(--muted-foreground)" }}>#{idx + 2}</span>
                                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: stop.done || !stop.appt ? "var(--muted-foreground)" : isCurrent ? "var(--foreground)" : "var(--muted-foreground)", textDecoration: stop.done ? "line-through" : "none", fontWeight: isCurrent ? 500 : 400 }}>
                                    {stop.appt ?? "—"}
                                  </span>
                                </div>
                              );
                            })}
                            {/* destination (only when there is a distinct last stop) */}
                            {driver.dropAppt !== "—" && (
                              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <span style={{ ...labelStyle, color: "var(--muted-foreground)" }}>#{destNum}</span>
                                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: destDone ? "var(--muted-foreground)" : "var(--foreground)", textDecoration: destDone ? "line-through" : "none" }}>{driver.dropAppt}</span>
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
