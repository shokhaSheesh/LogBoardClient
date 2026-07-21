import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { createPortal } from "react-dom";
import { MapPin, Lock, MessageSquare, ChevronDown, Search, Navigation, Check, ArrowRight, History, X, AlertCircle, RotateCcw, Users, Rows3, ExternalLink, Copy } from "lucide-react";
import { Status, STATUS_CONFIG, ALL_STATUSES } from "../lib/statuses";
import { api, getCompanyId, ApiError } from "../lib/api";
import { useAuth } from "../lib/auth";
import { hasPerm } from "../lib/permissions";
import { menuPosition } from "../lib/menuPosition";
import { driverDisplayName } from "../lib/driverName";
import { boardWsUrl } from "../lib/ws";
import { cleanAppt } from "../lib/appt";
import { UncompleteConfirm } from "./UncompleteConfirm";

// ─── Types ────────────────────────────────────────────────────────────────────

type DriverType = "O/O" | "C/D";

// ADR 0023: a stop's address is street/city/state; `city` is the city alone. The board
// only DISPLAYS loads (never edits the route), so it shows the short city, state form.
interface Stop { street?: string; city: string; state?: string; done: boolean; appt?: string; location?: { lat: number; lng: number }; }
function cityState(s?: { city?: string; state?: string } | null): string {
  if (!s) return "";
  return [s.city, s.state].map((p) => (p ?? "").trim()).filter(Boolean).join(", ");
}
// Full address (street, city, state) — what a stop's copy button yields. Falls back to
// city, state when no street was entered.
function joinFull(s?: { street?: string; city?: string; state?: string } | null): string {
  if (!s) return "";
  return [s.street, s.city, s.state].map((p) => (p ?? "").trim()).filter(Boolean).join(", ");
}

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

// The truck's own telemetry, straight from the ELD (ADR 0021). This is the vehicle's
// reality — kept entirely separate from the dispatcher's `status`/`location`, which are
// human intent. Present only when the company has an ELD connected and this driver is
// linked and reporting; null otherwise.
interface EldBlock {
  duty_status: string;          // provider's HOS status, verbatim: DRIVING | SLEEPER | ON_DUTY | OFF_DUTY
  duty_since: string | null;
  location: string;             // provider's place name, e.g. "9mi E from Banning, CA"
  lat: number | null;
  lng: number | null;
  odometer: number | null;
  engine_hours: number | null;
  fuel_level: number | null;    // percent
  vehicle_number: string;       // the unit per the ELD — may disagree with the board's `unit`
  reported_at: string | null;   // when the truck says this was true
  synced_at: string | null;     // when we last fetched it — the gap tells you the feed went quiet
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
  eld?: EldBlock | null;
  comments: string;
  next_loads?: { id: string; load_id: string; broker?: string; origin?: string; destination?: string; pickup_appt?: string; drop_appt?: string }[];
  last_update: string;
}

// UI row (superset of backend — keep all fields so UI never loses columns)
interface Driver {
  driverId: string;      // UUID — used as key for driver API calls
  loadId: string;        // display ref like "LD-00481"
  loadUuid?: string;     // actual UUID for PUT /loads/:id
  loadRaw?: BoardLoad;   // full load object — PUT base for stop toggles (no refetch)
  nextLoads?: { id: string; loadId: string; broker?: string; origin?: string; destination?: string }[]; // upcoming queue, from the board row directly
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
  eld?: EldBlock | null;   // truck telemetry, read-only display (never PUT back)
  comments: string;
  lastUpdate: string;
}

// One field-level before→after on an update event. A load's `stops` change is
// reported as a derived `route` label; `revert_field`/`revert_from` carry the
// structured value the undo endpoint actually restores.
interface HistoryChange {
  field: string;
  from: unknown;
  to: unknown;
  revert_field?: string;
  revert_from?: unknown;
}

// Backend history event. The server decides whether an undo would work
// (`revertable` + `revert_reason`) — all four limits including the stale check —
// so the panel never has to discover a refusal on click.
interface HistoryEvent {
  id: string;
  actor_name: string;
  entity_type: string;
  entity_id: string;
  entity_ref: string;
  action: "create" | "update" | "delete";
  changes: HistoryChange[] | null;
  created_at: string;
  revertable?: boolean;
  revert_reason?: string;
  reverted_at?: string | null;
  reverted_by?: string | null;
  revert_of?: string | null; // set when this event IS an undo (undoing it = redo)
}

// What POST /board/history/:id/revert gives back once the server has applied it.
interface RevertResult {
  entity_type: string;
  entity_id: string;
  entity_ref: string;
  action: string;
  applied: string[];  // fields actually restored
  skipped: string[];  // what could not be put back (e.g. a truck someone else now holds)
  event_id: string;   // the history event this undo recorded
}

// Why the server says an undo is unavailable → what we tell the user.
const REVERT_REASON_TEXT: Record<string, string> = {
  not_revertable: "There's nothing to undo on this change.",
  expired:        "Too old to undo — the window is 24 hours.",
  stale:          "Something changed since — undoing this would overwrite the newer edit.",
  gone:           "That row has been deleted. Undo the delete first.",
  restored:       "This delete has already been undone.",
  forbidden:      "You don't have permission to undo this.",
};

// Failures the undo endpoint can return once it's actually running.
const REVERT_ERROR_TEXT: Record<string, string> = {
  revert_expired:   "Too old to undo — the window is 24 hours.",
  already_reverted: "Someone else already undid this change.",
  revert_stale:     "Something changed since you opened this. Undo was refused rather than overwrite it — reopen the panel to see what's different.",
  revert_rejected:  "The undo was refused: the restored values are no longer valid.",
  not_revertable:   "There's nothing to undo on this change.",
  locked:           "Someone is editing this row right now. Try again in a moment.",
  forbidden:        "You don't have permission to undo this.",
};

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
  "O/O": { color: "#3B82F6", bg: "rgba(59,130,246,0.14)" },
  "C/D": { color: "#8B5CF6", bg: "rgba(139,92,246,0.14)" },
};

const LOAD_ID_LEFT   = 0;
const DRIVER_NM_LEFT = 200; // = Load ID width, so Driver Name sticks right after it

const COLUMNS = [
  { label: "Load ID",        width: 200, sticky: true,  left: LOAD_ID_LEFT   },
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
    nextLoads:   (r.next_loads ?? []).map((q) => ({ id: q.id, loadId: q.load_id, broker: q.broker, origin: q.origin, destination: q.destination })),
    name:        r.name         || "—",
    phone:       r.phone        || "—",
    team:        r.team         ?? false,
    name2:       r.name2        || undefined,
    phone2:      r.phone2       || undefined,
    unit:        r.unit         || "—",
    trailer:     r.trailer      || "—",
    type:        (r.type as DriverType) || "O/O",
    status:      (r.status as Status)   || "ready",
    // Show city, state only (not the street the dispatcher entered on create).
    origin:          (cityState(first) || r.origin) || "—",
    originDone:      first?.done ?? false,
    destination:     (cityState(last) || r.destination) || "—",
    destinationDone: last?.done ?? false,
    stops:           route.slice(1, -1),
    pickupAppt:  cleanAppt(r.pickup_appt)  || "—",
    dropAppt:    cleanAppt(r.drop_appt)    || "—",
    location:    r.location     || "—",
    etaKm:       r.eta_km,
    speedMph:    r.speed_mph,
    eld:         r.eld ?? null,
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

// Board display order: by status (the fixed status order — Re-Update first … Home last),
// then driver name, then id as a stable tiebreaker. This mirrors how the backend orders
// GET /board, so we can apply it ourselves on every render — an optimistic status change
// re-sorts the row into its new group immediately, without waiting for the board.snapshot
// push to come back. (One bounded sort per render; the board is one row per live driver.)
const STATUS_RANK: Record<string, number> = Object.fromEntries(ALL_STATUSES.map((s, i) => [s, i]));
function byBoardOrder(a: Driver, b: Driver): number {
  const ra = STATUS_RANK[a.status] ?? 999;
  const rb = STATUS_RANK[b.status] ?? 999;
  if (ra !== rb) return ra - rb;
  const n = a.name.localeCompare(b.name);
  if (n !== 0) return n;
  return a.driverId.localeCompare(b.driverId);
}

// HOS duty status → a compact badge. These are the provider's own vocabulary (verbatim),
// NOT the board's dispatcher status — they mean different things and never mix.
const DUTY_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  DRIVING:  { label: "Driving",  color: "#10B981", bg: "rgba(16,185,129,0.14)" },
  ON_DUTY:  { label: "On duty",  color: "#3B82F6", bg: "rgba(59,130,246,0.14)" },
  SLEEPER:  { label: "Sleeper",  color: "#8B5CF6", bg: "rgba(139,92,246,0.14)" },
  OFF_DUTY: { label: "Off duty", color: "var(--muted-foreground)", bg: "var(--muted)" },
};
function dutyConfig(s: string) {
  return DUTY_CONFIG[s] ?? { label: s.replace(/_/g, " ").toLowerCase(), color: "var(--muted-foreground)", bg: "var(--muted)" };
}

// A telemetry feed that hasn't reported in a while is stale — a dispatcher needs to see
// that the truck's position is old, not trust it as live. Returns the freshness colour
// for the "reported X ago" line.
function eldFreshColor(reportedAt: string | null): string {
  if (!reportedAt) return "var(--muted-foreground)";
  const age = Date.now() - new Date(reportedAt).getTime();
  if (age < 10 * 60000)  return "#10B981"; // < 10 min — live
  if (age < 60 * 60000)  return "#F59E0B"; // < 1 hr — getting stale
  return "#EF4444";                        // over an hour — cold
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

function StatusDropdown({ value, onChange, disabled = false, onOpenChange }: { value: Status; onChange: (s: Status) => void | Promise<void>; disabled?: boolean; onOpenChange?: (open: boolean) => void }) {
  const { open, setOpen, rect, anchorRef, dropRef, toggle } = useDropdown();
  const [busy, setBusy] = useState(false);
  const cfg = STATUS_CONFIG[value];

  // Claim/release the row lock as the menu opens/closes — but not on the initial mount
  // (open starts false, which would otherwise fire a spurious release for every row).
  const didMount = useRef(false);
  useEffect(() => { if (!didMount.current) { didMount.current = true; return; } onOpenChange?.(open); }, [open]);

  // If this unmounts while still open (e.g. the table re-renders into a different
  // shape), the "closed" event never fires and the row's lock would leak — held
  // alive forever by its heartbeat. Hand it back on the way out.
  const openRef = useRef(open);
  openRef.current = open;
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  useEffect(() => () => { if (openRef.current) onOpenChangeRef.current?.(false); }, []);

  const select = (s: Status) => {
    setOpen(false);
    setBusy(true);
    Promise.resolve(onChange(s)).catch(() => {}).finally(() => setBusy(false));
  };

  const inactive = busy || disabled;
  return (
    <>
      <div ref={anchorRef} onClick={inactive ? undefined : toggle} style={{ cursor: inactive ? "default" : "pointer", display: "inline-flex", opacity: disabled ? 0.55 : 1 }}>
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

function TypeDropdown({ value, onChange, disabled = false, onOpenChange }: { value: DriverType; onChange: (t: DriverType) => void | Promise<void>; disabled?: boolean; onOpenChange?: (open: boolean) => void }) {
  const { open, setOpen, rect, anchorRef, dropRef, toggle } = useDropdown();
  const [busy, setBusy] = useState(false);
  const cfg = TYPE_CONFIG[value];

  // Skip the initial mount so we don't fire a spurious lock-release for every row.
  const didMount = useRef(false);
  useEffect(() => { if (!didMount.current) { didMount.current = true; return; } onOpenChange?.(open); }, [open]);

  // If this unmounts while still open (e.g. the table re-renders into a different
  // shape), the "closed" event never fires and the row's lock would leak — held
  // alive forever by its heartbeat. Hand it back on the way out.
  const openRef = useRef(open);
  openRef.current = open;
  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;
  useEffect(() => () => { if (openRef.current) onOpenChangeRef.current?.(false); }, []);

  const select = (t: DriverType) => {
    setOpen(false);
    setBusy(true);
    Promise.resolve(onChange(t)).catch(() => {}).finally(() => setBusy(false));
  };

  const inactive = busy || disabled;
  return (
    <>
      <div ref={anchorRef} onClick={inactive ? undefined : toggle} style={{ cursor: inactive ? "default" : "pointer", display: "inline-flex", opacity: disabled ? 0.55 : 1 }}>
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

// Inline-editable appointment (free-text, e.g. "07/08 · 08:00"). Read-only when disabled.
// Read-only appointment display. The route (stops + appts) is edited on the Loads page,
// not the board — the board only shows it and ticks stops off as done.
function ApptText({ value, color, done }: { value: string; color: string; done?: boolean }) {
  return (
    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color, textDecoration: done ? "line-through" : "none" }}>{value || "—"}</span>
  );
}

// Keep the broker short on the board: just its first word, then "…". If that first word
// is itself long (a run-on name with no spaces), cut it at 10 characters. The full name
// is always in the tooltip.
function shortBroker(b: string): string {
  const t = b.trim();
  const sp = t.indexOf(" ");
  if (sp === -1) return t.length > 10 ? t.slice(0, 10) + "…" : t;      // one word
  const first = t.slice(0, sp);
  return (first.length > 10 ? first.slice(0, 10) : first) + "…";       // first word of many
}

// "<broker> - <load id>", broker shortened via shortBroker so the id is never crowded
// out. Sized by the caller's font styles; used for the current load and each queued one.
// When onOpen is given, clicking it jumps to that load's edit modal on the Loads page.
function BrokerLoadId({ broker, loadId, color, size, weight, onOpen }: {
  broker?: string; loadId: string; color: string; size: number; weight: number; onOpen?: () => void;
}) {
  return (
    <span title={broker ? `${broker} - ${loadId}` : loadId}
      onClick={onOpen}
      style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontFamily: "var(--font-mono)", fontSize: size, fontWeight: weight, color, cursor: onOpen ? "pointer" : "default", textDecoration: onOpen ? "underline" : "none", textDecorationColor: "transparent", transition: "text-decoration-color 0.12s" }}
      onMouseEnter={onOpen ? (e) => { (e.currentTarget as HTMLElement).style.textDecorationColor = "currentColor"; } : undefined}
      onMouseLeave={onOpen ? (e) => { (e.currentTarget as HTMLElement).style.textDecorationColor = "transparent"; } : undefined}>
      {broker && <span style={{ color: "var(--muted-foreground)", fontWeight: 400 }}>{shortBroker(broker)} - </span>}
      {loadId}
    </span>
  );
}

// A copy-to-clipboard affordance that stays hidden until you hover the value (the board
// is dense — always-on icons would be noise). Opacity is driven by the `.cp-*` CSS rules
// below, not inline, so the :hover rule can win. Flips to a green check for a moment.
function CopyBtn({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(value)
      .then(() => { setDone(true); setTimeout(() => setDone(false), 1100); })
      .catch(() => {});
  };
  return (
    <button type="button" title="Copy" onClick={copy}
      className={`cp-btn${done ? " cp-done" : ""}`}
      style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", border: "none", background: "none", cursor: "pointer", padding: 0, color: done ? "#10B981" : "var(--muted-foreground)" }}>
      {done ? <Check size={11} /> : <Copy size={11} />}
    </button>
  );
}

// One value + its hover copy button, laid out so the value truncates and the button never
// does. `mono`/size/color/weight style the value text.
function Copyable({ value, display, size = 12, color = "var(--foreground)", weight = 400, mono = false }: {
  value: string; display?: string; size?: number; color?: string; weight?: number; mono?: boolean;
}) {
  return (
    <span className="cp-wrap" style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)", fontSize: size, fontWeight: weight, color }}>
        {display ?? value}
      </span>
      <CopyBtn value={value} />
    </span>
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
        <span style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, borderRadius: "50%", backgroundColor: "rgba(16,185,129,0.14)" }}>
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

// The board shows the route read-only — stops are ticked off as done, but their
// addresses are edited on the Loads page, not here (ADR 0023: the full address is three
// fields, and the board only ever shows city, state).
function StopList({ origin, originDone, destination, destinationDone, stops, originStop, destinationStop, onToggleOrigin, onToggleDestination, onToggleStop, disabled = false }: {
  origin: string; originDone?: boolean;
  destination: string; destinationDone?: boolean;
  stops?: Stop[];
  // Full origin/destination stops (with street) — the intermediates already carry it.
  // Used only for the copy value; display stays city, state.
  originStop?: Stop; destinationStop?: Stop;
  onToggleOrigin?: () => void; onToggleDestination?: () => void;
  onToggleStop?: (idx: number) => void;
  disabled?: boolean;
}) {
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

  // All stops as a flat list: origin, ...intermediates, destination. `copy` is the FULL
  // address (street, city, state), `city` the short form we show.
  const allStops = [
    { city: origin,      copy: joinFull(originStop) || origin,           done: originDone ?? false,      onToggle: onToggleOrigin },
    ...(stops ?? []).map((s, i) => ({ city: cityState(s) || s.city, copy: joinFull(s) || s.city, done: s.done, onToggle: () => onToggleStop?.(i) })),
    { city: destination, copy: joinFull(destinationStop) || destination, done: destinationDone ?? false, onToggle: onToggleDestination },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {allStops.map((stop, idx) => {
        const prevDone  = idx === 0 || allStops[idx - 1].done;
        const isCurrent = !stop.done && prevDone;
        // Can mark done only if every earlier stop is done; can always un-mark a done stop.
        const canToggle = !disabled && (stop.done || prevDone);

        return (
          <div key={idx} className="cp-wrap" style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0 }}>
            <span style={labelStyle}>#{idx + 1}</span>
            <TickBtn done={stop.done} isCurrent={isCurrent} canToggle={canToggle} onToggle={canToggle ? stop.onToggle : undefined} />
            <span style={{ ...textStyle(stop.done, isCurrent), flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{stop.city || "—"}</span>
            {stop.city && stop.city !== "—" && <CopyBtn value={stop.copy} />}
          </div>
        );
      })}
    </div>
  );
}

// ─── History panel ────────────────────────────────────────────────────────────

function HistoryPanel({ events, loading, onClose, onRevert }: {
  events: HistoryEvent[]; loading: boolean; onClose: () => void;
  onRevert: (ev: HistoryEvent, fields?: string[]) => Promise<RevertResult>;
}) {
  const [confirm, setConfirm]     = useState<HistoryEvent | null>(null);
  const [reverting, setReverting] = useState(false);
  const [revertErr, setRevertErr] = useState<string | null>(null);
  const [skipped, setSkipped]     = useState<string[] | null>(null);
  // Which of the event's fields to undo. Empty set = the whole event.
  const [picked, setPicked]       = useState<Set<string>>(new Set());

  const fmtTime = (iso: string) => {
    const d = Date.now() - new Date(iso).getTime();
    if (d < 60000)     return "just now";
    if (d < 3600000)   return `${Math.floor(d / 60000)}m ago`;
    if (d < 86400000)  return `${Math.floor(d / 3600000)}h ago`;
    if (d < 172800000) return "yesterday";
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const actionColor = (a: string) => a === "create" ? "#10B981" : a === "delete" ? "#EF4444" : "#3B82F6";
  const actionBg    = (a: string) => a === "create" ? "rgba(16,185,129,0.14)" : a === "delete" ? "rgba(239,68,68,0.14)" : "rgba(59,130,246,0.14)";

  const entityColor = (t: string) => {
    if (t === "load")   return { color: "#8B5CF6", bg: "rgba(139,92,246,0.14)" };
    if (t === "driver") return { color: "#22D3EE", bg: "rgba(34,211,238,0.14)" };
    return { color: "var(--foreground)", bg: "var(--muted)" };
  };

  // The server works out whether an undo would actually succeed — the 24h window, the
  // already-undone claim, the stale check, the permission of the undone action — and
  // says so per event. Undoing an undo is a redo, so those are offered too. (Older
  // payloads without the flag fall back to the previous update-only rule.)
  const canUndo = (ev: HistoryEvent) =>
    ev.revertable ?? (ev.action === "update" && !!ev.changes && ev.changes.length > 0);

  const undoLabel = (ev: HistoryEvent) =>
    ev.revert_of ? "Redo" : ev.action === "delete" ? "Restore" : "Undo";

  // Field name to send to the undo endpoint. A load's `stops` edit shows as a derived
  // `route` label, but `revert_field` names the field the server actually restores.
  const undoField = (c: HistoryChange) => c.revert_field ?? c.field;

  const prettyField = (f: string) => f.replace(/_/g, " ");

  const openConfirm = (ev: HistoryEvent) => {
    setRevertErr(null);
    setSkipped(null);
    setPicked(new Set((ev.changes ?? []).map(undoField))); // default: the whole event
    setConfirm(ev);
  };

  const togglePicked = (f: string) => setPicked((prev) => {
    const next = new Set(prev);
    if (next.has(f)) next.delete(f); else next.add(f);
    return next;
  });

  const doRevert = async () => {
    if (!confirm) return;
    const all = (confirm.changes ?? []).map(undoField);
    // Omit `fields` when every field is picked (or there are none, as on a delete):
    // that asks the server to undo the whole event.
    const partial = all.length > 0 && picked.size < all.length;
    if (partial && picked.size === 0) { setRevertErr("Pick at least one field to undo."); return; }

    setReverting(true); setRevertErr(null); setSkipped(null);
    try {
      const res = await onRevert(confirm, partial ? [...picked] : undefined);
      // A restore can leave things behind — a truck a dispatcher has since handed to
      // someone else stays put. Say so instead of silently claiming success.
      if (res.skipped && res.skipped.length > 0) { setSkipped(res.skipped); return; }
      setConfirm(null);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : undefined;
      setRevertErr(
        (code && REVERT_ERROR_TEXT[code]) ||
        (e instanceof Error ? e.message : "Undo failed")
      );
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
                      {ev.revert_of && (
                        <span style={{ fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 700, color: "#F59E0B", backgroundColor: "rgba(245,158,11,0.14)", borderRadius: 4, padding: "1px 6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Undo</span>
                      )}
                      {ev.reverted_at && (
                        <span style={{ fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 700, color: "var(--muted-foreground)", backgroundColor: "var(--muted)", borderRadius: 4, padding: "1px 6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Undone</span>
                      )}
                      <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{fmtTime(ev.created_at)}</span>
                    </div>
                    {/* Changes */}
                    {ev.changes && ev.changes.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {ev.changes.map((c, i) => (
                          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-sans)", fontSize: 12 }}>
                            <span style={{ color: "var(--muted-foreground)", minWidth: 80, textTransform: "capitalize", fontSize: 11 }}>{c.field.replace(/_/g, " ")}</span>
                            <span style={{ color: "#EF4444", backgroundColor: "rgba(239,68,68,0.14)", borderRadius: 3, padding: "0 5px", fontFamily: "var(--font-mono)", fontSize: 11, textDecoration: "line-through" }}>{String(c.from ?? "—")}</span>
                            <span style={{ color: "var(--muted-foreground)", fontSize: 10 }}>→</span>
                            <span style={{ color: "#10B981", backgroundColor: "rgba(16,185,129,0.14)", borderRadius: 3, padding: "0 5px", fontFamily: "var(--font-mono)", fontSize: 11 }}>{String(c.to ?? "—")}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* Undo — enabled/disabled by the server, so it never discovers a refusal on click */}
                    {canUndo(ev) ? (
                      <button onClick={() => openConfirm(ev)}
                        style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 5, marginTop: 2, padding: "3px 9px", borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "transparent", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)" }}
                        onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = "var(--primary)"; b.style.color = "var(--primary)"; }}
                        onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = "var(--border)"; b.style.color = "var(--muted-foreground)"; }}>
                        <RotateCcw size={11} /> {undoLabel(ev)}
                      </button>
                    ) : ev.revert_reason && ev.revert_reason !== "not_revertable" ? (
                      <button disabled title={REVERT_REASON_TEXT[ev.revert_reason] ?? ev.revert_reason}
                        style={{ alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 5, marginTop: 2, padding: "3px 9px", borderRadius: 6, border: "1px dashed var(--border)", backgroundColor: "transparent", cursor: "not-allowed", fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", opacity: 0.55 }}>
                        <RotateCcw size={11} /> {undoLabel(ev)}
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Undo confirm */}
      {confirm && (() => {
        const changes = confirm.changes ?? [];
        const isRestore = confirm.action === "delete";
        return (
          <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 9500, display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={(e) => { if (e.target === e.currentTarget && !reverting) setConfirm(null); }}>
            <div style={{ backgroundColor: "var(--card)", borderRadius: 12, width: 400, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", overflow: "hidden" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: "var(--secondary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <RotateCcw size={15} style={{ color: "var(--primary)" }} />
                </div>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>
                  {isRestore ? "Restore this row?" : confirm.revert_of ? "Redo this change?" : "Undo this change?"}
                </span>
              </div>
              <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
                  {isRestore ? (
                    <>This brings <strong style={{ color: "var(--foreground)" }}>{confirm.entity_ref || confirm.entity_type}</strong> back, with whatever is still free. Anything since handed to someone else stays where it is.</>
                  ) : changes.length > 1 ? (
                    <>On <strong style={{ color: "var(--foreground)" }}>{confirm.entity_ref || confirm.entity_type}</strong>, restore these — untick any you want to leave alone:</>
                  ) : (
                    <>On <strong style={{ color: "var(--foreground)" }}>{confirm.entity_ref || confirm.entity_type}</strong> this will restore:</>
                  )}
                </div>
                {changes.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {changes.map((c, i) => {
                      const f = undoField(c);
                      const on = picked.has(f);
                      // One field can't be partially undone — with a single change the
                      // tickbox would just be a way to disable the button. Show it plain.
                      const pickable = changes.length > 1;
                      return (
                        <label key={i}
                          style={{ display: "flex", alignItems: "center", gap: 7, fontFamily: "var(--font-sans)", fontSize: 12, cursor: pickable ? "pointer" : "default", opacity: pickable && !on ? 0.45 : 1 }}>
                          {pickable && (
                            <input type="checkbox" checked={on} disabled={reverting} onChange={() => togglePicked(f)}
                              style={{ accentColor: "var(--primary)", cursor: "pointer", margin: 0 }} />
                          )}
                          <span style={{ color: "var(--muted-foreground)", minWidth: 74, textTransform: "capitalize", fontSize: 11 }}>{prettyField(c.field)}</span>
                          <span style={{ color: "var(--muted-foreground)", fontSize: 10 }}>→</span>
                          <span style={{ color: "#10B981", backgroundColor: "rgba(16,185,129,0.14)", borderRadius: 3, padding: "1px 6px", fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600 }}>{String(c.from ?? "—")}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
                {skipped && skipped.length > 0 && (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "9px 12px", backgroundColor: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.35)", borderRadius: 8 }}>
                    <AlertCircle size={14} color="#F59E0B" style={{ flexShrink: 0, marginTop: 1 }} />
                    <div style={{ fontFamily: "var(--font-sans)", fontSize: 11.5, color: "#F59E0B", lineHeight: 1.5 }}>
                      Done, but {skipped.length === 1 ? "one thing" : `${skipped.length} things`} couldn't be put back — someone else holds{" "}
                      {skipped.map((f, i) => (
                        <span key={f}>{i > 0 && ", "}<strong style={{ textTransform: "capitalize" }}>{prettyField(f)}</strong></span>
                      ))}{" "}now.
                    </div>
                  </div>
                )}
                {revertErr && (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "9px 12px", backgroundColor: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.35)", borderRadius: 8 }}>
                    <AlertCircle size={14} color="#EF4444" style={{ flexShrink: 0, marginTop: 1 }} />
                    <div style={{ fontFamily: "var(--font-sans)", fontSize: 11.5, color: "#EF4444", lineHeight: 1.5 }}>{revertErr}</div>
                  </div>
                )}
              </div>
              {/* Once it has run and left something behind, the only thing left to do is read it and close. */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 20px", borderTop: "1px solid var(--border)" }}>
                {skipped ? (
                  <button onClick={() => setConfirm(null)}
                    style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "7px 16px", borderRadius: 6, border: "none", backgroundColor: "var(--primary)", color: "#fff", cursor: "pointer" }}>
                    Close
                  </button>
                ) : (
                  <>
                    <button onClick={() => setConfirm(null)} disabled={reverting}
                      style={{ fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 16px", borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "var(--muted)", color: "var(--foreground)", cursor: reverting ? "default" : "pointer" }}>
                      Cancel
                    </button>
                    <button onClick={doRevert} disabled={reverting}
                      style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "7px 16px", borderRadius: 6, border: "none", backgroundColor: reverting ? "var(--muted)" : "var(--primary)", color: reverting ? "var(--muted-foreground)" : "#fff", cursor: reverting ? "default" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                      <RotateCcw size={13} /> {reverting ? "Working…" : isRestore ? "Restore" : confirm.revert_of ? "Redo" : "Undo"}
                    </button>
                  </>
                )}
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
  const { user } = useAuth();
  const currentUserId = user?.id;
  const navigate = useNavigate();
  // Click a load on the board → open it in the Loads page edit modal (route edits live
  // there now, not on the board). Needs the load's UUID, not its display ref.
  const openLoad = (loadUuid?: string) => { if (loadUuid) navigate(`/workspace/loads?edit=${loadUuid}`); };
  // The board reads on board.read, but its inline edits write to /drivers and /loads —
  // so gate the driver-field controls (status, type, comment) on drivers.update and the
  // route/appt controls on loads.update. Without this a read-only role sees editable
  // controls that just 403 on save.
  const canEditDriver = hasPerm(user, "drivers", "update");
  const canEditLoad   = hasPerm(user, "loads", "update");

  const [rows,           setRows]           = useState<Driver[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState<string | null>(null);
  const [search,         setSearch]         = useState("");
  const [statusFilter,   setStatusFilter]   = useState<Status | "all">("all");
  const [filterOpen,     setFilterOpen]     = useState(false);
  const [teams,          setTeams]          = useState<{ id: string; name: string; driverIds: Set<string>; userNames: string[] }[]>([]);
  const [teamFilter,     setTeamFilter]     = useState<string>("all"); // team id or "all"
  const [teamOpen,       setTeamOpen]       = useState(false);
  const [viewMode,       setViewMode]       = useState<"all" | "teams">("all"); // one table vs a section per team
  const [editCell,       setEditCell]       = useState<{ driverId: string; field: string } | null>(null);
  const [historyEvents,  setHistoryEvents]  = useState<HistoryEvent[]>([]);
  const [historyBadge,   setHistoryBadge]   = useState(0);
  const [historyOpen,    setHistoryOpen]    = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [locks,          setLocks]          = useState<Record<string, BoardLock>>({}); // keyed by driver_id
  const [toast,          setToast]          = useState<string | null>(null); // transient error banner

  const wsRef         = useRef<WebSocket | null>(null);
  // The websocket handler is bound once; read the panel's open state through a ref
  // rather than resubscribing the socket every time it opens.
  const historyOpenRef = useRef(false);
  const reconnectRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsBackoff     = useRef(2000);
  const filterRef     = useRef<HTMLDivElement>(null);
  const teamRef       = useRef<HTMLDivElement>(null);
  // Both filter menus render in a portal (see below), so they need their own panel
  // refs for outside-click and an anchor rect to position against.
  const filterPanelRef = useRef<HTMLDivElement>(null);
  const teamPanelRef   = useRef<HTMLDivElement>(null);
  const [filterRect, setFilterRect] = useState<DOMRect | null>(null);
  const [teamRect,   setTeamRect]   = useState<DOMRect | null>(null);
  // Cache of full driver records (for PUT body construction)
  const driverCache   = useRef<Record<string, Record<string, unknown>>>({});
  // Heartbeat intervals per driverId
  const heartbeats    = useRef<Record<string, ReturnType<typeof setInterval>>>({});
  const lockWanted    = useRef<Record<string, boolean>>({}); // intent, so a release can cancel an in-flight claim

  useEffect(() => { historyOpenRef.current = historyOpen; }, [historyOpen]);

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
      setRows((data ?? []).map(fromBoardRow).sort(byBoardOrder));
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
  // The SERVER applies the undo, through the entity's own write path — it rotates
  // the driver's queue and maintains the payout ledger exactly as a dispatcher's
  // edit would. So we just call it: no read-modify-write here. (Re-applying the
  // returned values with our own PUT would be a second write landing on top of the
  // undo, and the server's compare-and-set would refuse it as `revert_stale`.)
  //
  // `fields` undoes only part of an event; omit it to undo all of it. Throws on
  // failure so the panel can surface the refusal inline.
  const revertEvent = async (ev: HistoryEvent, fields?: string[]) => {
    const res = await api.post<RevertResult>(
      `/board/history/${ev.id}/revert`,
      fields && fields.length > 0 ? { fields } : undefined
    );
    fetchHistory(); // pull in the fresh "undo" audit entry (and everyone's revertable flags)
    fetchBoard();   // the board.snapshot push covers this too; refresh so it never lags
    return res;
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
  // drivers client-side. Read via the company-plane /company/teams (gated on teams.read)
  // rather than the owner-only /owner/* surface — a dispatcher holds the read key but
  // 403s on /owner/*, which used to leave them with no team filter at all.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const fetchTeams = async () => {
    if (!companyId) return;
    try {
      const data = await api.get<{ id: string; name: string; driver_ids?: string[]; user_names?: string[] }[]>("/company/teams");
      setTeams((data ?? []).map((t) => ({
        id: t.id, name: t.name, driverIds: new Set(t.driver_ids ?? []),
        // Drop unresolved names (backend falls back to the raw user id when it can't resolve one).
        userNames: (t.user_names ?? []).filter((n) => !UUID_RE.test(n)),
      })));
    } catch { setTeams([]); }
  };

  // ── WebSocket ──────────────────────────────────────────────────────────────

  const connectWs = () => {
    if (wsRef.current) { wsRef.current.close(); wsRef.current = null; }
    if (!companyId) return;

    const ws = new WebSocket(boardWsUrl(companyId));
    wsRef.current = ws;

    ws.onopen = () => {
      wsBackoff.current = 2000; // reset backoff on successful connect
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data as string);
        switch (msg.type) {
          case "board.snapshot":
            setRows((msg.rows ?? []).map(fromBoardRow).sort(byBoardOrder));
            break;
          case "board.history":
            setHistoryBadge((n) => n + 1);
            setHistoryEvents((prev) => [msg.event, ...prev].slice(0, 200));
            // A new change can make an OLDER event un-undoable (its field moved on, so
            // undoing it would overwrite the newer edit). The push only carries the new
            // event, so the rest of the list's `revertable` flags are now guesses — and
            // the pushed one's own flag is computed without a viewer, so it ignores
            // permissions. Refetch while the panel is open so what's greyed out is true.
            if (historyOpenRef.current) fetchHistory();
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
      // Actually hand back any locks we still hold — stopping the heartbeat alone
      // would leave the row looking "locked" to everyone else until it expires.
      Object.keys(heartbeats.current).forEach((driverId) => {
        clearInterval(heartbeats.current[driverId]);
        api.delete("/board/locks", { entity_type: "driver", entity_id: driverId }).catch(() => {});
      });
      heartbeats.current = {};
      lockWanted.current = {};
    };
  }, [companyId]);

  // ── Close filter on outside click ──────────────────────────────────────────

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!filterRef.current?.contains(e.target as Node) && !filterPanelRef.current?.contains(e.target as Node))
        setFilterOpen(false);
    };
    if (filterOpen) document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [filterOpen]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!teamRef.current?.contains(e.target as Node) && !teamPanelRef.current?.contains(e.target as Node))
        setTeamOpen(false);
    };
    if (teamOpen) document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [teamOpen]);

  // ── Claim / release lock ───────────────────────────────────────────────────

  const claimLock = async (driverId: string) => {
    // Record the intent BEFORE awaiting. Without this, releasing while the POST is
    // still in flight leaves an orphaned heartbeat: release's clearInterval finds
    // nothing (the interval isn't created yet), then the POST resolves and starts a
    // 20s heartbeat that renews the lock forever — the row shows as "being edited"
    // indefinitely and /board/locks fires on a loop.
    lockWanted.current[driverId] = true;
    try {
      await api.post("/board/locks", { entity_type: "driver", entity_id: driverId });
      if (!lockWanted.current[driverId]) {
        // Released while we were awaiting — drop the lock we just took, no heartbeat.
        api.delete("/board/locks", { entity_type: "driver", entity_id: driverId }).catch(() => {});
        return;
      }
      // Start heartbeat (re-POST every 20s)
      if (!heartbeats.current[driverId]) {
        heartbeats.current[driverId] = setInterval(() => {
          api.post("/board/locks", { entity_type: "driver", entity_id: driverId }).catch(() => {});
        }, 20_000);
      }
    } catch { /* 409 = someone else holds it — UI will show lock indicator */ }
  };

  const releaseLock = async (driverId: string) => {
    delete lockWanted.current[driverId]; // cancels an in-flight claim (see above)
    clearInterval(heartbeats.current[driverId]);
    delete heartbeats.current[driverId];
    try { await api.delete("/board/locks", { entity_type: "driver", entity_id: driverId }); } catch { /* ignore */ }
  };

  // Re-sort the rows into board order. Called only after a write SUCCEEDS (or when
  // authoritative data lands), so a row moves to its new group on confirmation — not on
  // the optimistic edit, and never on a save that then fails.
  const resort = () => setRows((prev) => [...prev].sort(byBoardOrder));

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
      resort(); // now that it's confirmed, move the row into its new status group
      // WS snapshot will also push the authoritative state back
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

  // ── Complete the driver's load ────────────────────────────────────────────
  // Setting the status to "completed" on the board completes the current load. Per the
  // API, completing a load runs the whole lifecycle (stamps completed_at, writes a
  // payout, rotates the queue, lands the driver on covered/ready via WS) — so we do it
  // as ONE PUT that sets the load to completed AND marks every stop done. Doing it as a
  // driver-status PUT + a second load PUT would resend the load's old status and revert
  // the completion (deleting the payout). No load → just set the driver status.
  const completeLoad = async (driverId: string) => {
    const driver = rows.find((d) => d.driverId === driverId);
    if (!driver) return;
    const load = driver.loadRaw;
    if (!load?.id) { await patch(driverId, { status: "completed" }); return; }

    const allDone = (load.stops ?? []).map((s) => ({ ...s, done: true }));
    // Optimistic: reflect the completion + all stops done immediately.
    setRows((prev) => prev.map((d) => d.driverId === driverId
      ? { ...d, status: "completed" as Status, stops: allDone.slice(1, -1), originDone: true, destinationDone: true }
      : d));
    const rollback = () => setRows((prev) => prev.map((d) => d.driverId === driverId ? driver : d));

    try {
      await api.put(`/loads/${load.id}`, { ...load, status: "completed", stops: allDone });
      resort(); // confirmed — move the row into its new group
      // WS snapshot pushes the authoritative rows (driver → covered/ready, queue rotated).
    } catch (e) {
      rollback();
      setToast(e instanceof Error ? e.message : "Couldn't complete the load — reverted.");
    }
  };

  // A driver's status mirrors onto the load they're running, so dropping them out of
  // `completed` un-completes it — which deletes its payout. Ask first.
  const [uncompleting, setUncompleting] = useState<{ driver: Driver; to: Status } | null>(null);

  // Return the write promise so the StatusDropdown can await it and show its spinner
  // while the save is in flight (and, now, until the row reorders on success).
  const applyStatus = (driver: Driver, s: Status): Promise<void> =>
    s === "completed" ? completeLoad(driver.driverId) : patch(driver.driverId, { status: s });

  const requestStatus = (driver: Driver, s: Status): Promise<void> | void => {
    if (driver.status === "completed" && s !== "completed") { setUncompleting({ driver, to: s }); return; }
    return applyStatus(driver, s);
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

  // ── Filtered rows ──────────────────────────────────────────────────────────

  const q = search.trim().toLowerCase();
  // Team scoping is filtered client-side (the realtime snapshot is whole-company).
  const activeTeam = teamFilter === "all" ? null : teams.find((t) => t.id === teamFilter) ?? null;
  // No sort here — the row order is baked into `rows`, re-sorted only at authoritative
  // moments (fetch, snapshot, and after a write SUCCEEDS via resort()), never on the
  // optimistic edit. So a status change updates the cell in place and the row only moves
  // once the backend confirms it — a failed save reverts without the row ever jumping.
  const visible = rows.filter((d) => {
    const ms = statusFilter === "all" || d.status === statusFilter;
    const mq = !q || d.name.toLowerCase().includes(q) || (d.name2 ?? "").toLowerCase().includes(q) || d.loadId.toLowerCase().includes(q) || d.unit.toLowerCase().includes(q) || d.location.toLowerCase().includes(q);
    const mt = !activeTeam || activeTeam.driverIds.has(d.driverId);
    return ms && mq && mt;
  });

  // "By team" view: a separate table per team (plus an "Unassigned" section) instead of
  // one shared table — each section gets its own non-scrolling header bar with the
  // team's name and member names, so the header never scrolls away with the table's
  // own horizontal scroll.
  const teamGroups: { name: string; isUnassigned: boolean; drivers: Driver[]; userNames: string[] }[] =
    viewMode === "teams" && teams.length > 0
      ? (() => {
          const gs = teams
            .map((t) => ({ name: t.name, isUnassigned: false, drivers: visible.filter((d) => t.driverIds.has(d.driverId)), userNames: t.userNames }))
            .filter((g) => g.drivers.length > 0);
          const unassigned = visible.filter((d) => !teams.some((t) => t.driverIds.has(d.driverId)));
          if (unassigned.length) gs.push({ name: "Unassigned", isUnassigned: true, drivers: unassigned, userNames: [] });
          return gs;
        })()
      : [];

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Copy buttons stay hidden until their value is hovered — via CSS so :hover beats
          the default (inline opacity would win and never let the rule show it). */}
      <style>{`.cp-btn{opacity:0;transition:opacity .12s} .cp-wrap:hover .cp-btn{opacity:1} .cp-btn.cp-done{opacity:1}`}</style>
      {toast && (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 10000, display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 8, backgroundColor: "var(--card)", border: "1px solid #EF4444", boxShadow: "0 10px 30px rgba(0,0,0,0.16)", maxWidth: 360 }}>
          <AlertCircle size={15} style={{ color: "#EF4444", flexShrink: 0 }} />
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--foreground)" }}>{toast}</span>
        </div>
      )}
      {uncompleting && (
        <UncompleteConfirm
          to={uncompleting.to}
          label={uncompleting.driver.loadId || uncompleting.driver.name}
          onCancel={() => setUncompleting(null)}
          onConfirm={() => {
            applyStatus(uncompleting.driver, uncompleting.to);
            setUncompleting(null);
          }}
        />
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
            <button onClick={() => { const r = filterRef.current?.getBoundingClientRect(); if (r) setFilterRect(r); setFilterOpen((p) => !p); }}
              style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-sans)", fontSize: 12, color: statusFilter === "all" ? "var(--muted-foreground)" : STATUS_CONFIG[statusFilter].color, backgroundColor: statusFilter === "all" ? "var(--muted)" : STATUS_CONFIG[statusFilter].bg, border: "1px solid var(--border)", borderRadius: 7, padding: "5px 10px", cursor: "pointer", whiteSpace: "nowrap" }}>
              {statusFilter === "all" ? "All Statuses" : STATUS_CONFIG[statusFilter].label}
              <ChevronDown size={11} />
            </button>
            {/* Portal + fixed: the board card clips its overflow, so an absolutely-positioned
                menu gets cut off whenever the table is short (e.g. a filter matched nothing). */}
            {filterOpen && filterRect && createPortal(
              <div ref={filterPanelRef} style={{ position: "fixed", ...menuPosition(filterRect, ALL_STATUSES.length + 1, 180), zIndex: 9999, backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.28)", minWidth: 180, padding: "4px 0", maxHeight: "min(60vh, 420px)", overflowY: "auto" }}>
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
              </div>,
              document.body
            )}
          </div>

          {/* Team filter (only shown when the company has dispatch pods) */}
          {teams.length > 0 && (
            <div ref={teamRef} style={{ position: "relative" }}>
              <button onClick={() => { const r = teamRef.current?.getBoundingClientRect(); if (r) setTeamRect(r); setTeamOpen((p) => !p); }}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-sans)", fontSize: 12, color: activeTeam ? "var(--primary)" : "var(--muted-foreground)", backgroundColor: activeTeam ? "var(--secondary)" : "var(--muted)", border: "1px solid var(--border)", borderRadius: 7, padding: "5px 10px", cursor: "pointer", whiteSpace: "nowrap" }}>
                <Users size={12} />
                {activeTeam ? activeTeam.name : "All Teams"}
                <ChevronDown size={11} />
              </button>
              {/* Portalled for the same reason as the status filter — see above. */}
              {teamOpen && teamRect && createPortal(
                <div ref={teamPanelRef} style={{ position: "fixed", ...menuPosition(teamRect, teams.length + 1, 180), zIndex: 9999, backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.28)", minWidth: 180, padding: "4px 0", maxHeight: "min(60vh, 420px)", overflowY: "auto" }}>
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
                </div>,
                document.body
              )}
            </div>
          )}

          {/* View toggle: one table vs a section per team */}
          {teams.length > 0 && (
            <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 7, overflow: "hidden" }}>
              {([["all", "All drivers", Rows3], ["teams", "By team", Users]] as const).map(([m, label, Icon]) => (
                <button key={m} onClick={() => setViewMode(m)} title={label}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 28, border: "none", cursor: "pointer", backgroundColor: viewMode === m ? "var(--primary)" : "transparent", color: viewMode === m ? "#fff" : "var(--muted-foreground)" }}>
                  <Icon size={13} />
                </button>
              ))}
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

      {/* ── Table(s) ── */}
      <div style={{ flex: 1, overflow: "auto", position: "relative", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
        {loading ? (
          <div style={{ padding: "64px 20px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>Loading board…</div>
        ) : error ? (
          <div style={{ padding: "64px 20px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <AlertCircle size={20} style={{ color: "#EF4444" }} />
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "#EF4444" }}>{error}</span>
            <button onClick={() => { setLoading(true); fetchBoard(); }} style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--primary)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Retry</button>
          </div>
        ) : viewMode === "teams" && teamGroups.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 28, padding: "16px 16px 24px" }}>
            {teamGroups.map((g) => {
              return (
                <div key={g.name} style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                  {/* Section header — plain block above the table, so it never scrolls
                      horizontally with the table's own scroll. */}
                  <div style={{ padding: "10px 14px", backgroundColor: "var(--muted)", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Users size={13} style={{ color: "var(--primary)", flexShrink: 0 }} />
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 700, color: "var(--foreground)" }}>{g.name}</span>
                    {!g.isUnassigned && g.userNames.length > 0 && (
                      <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        ({g.userNames.join(", ")})
                      </span>
                    )}
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, color: "var(--muted-foreground)", backgroundColor: "var(--secondary)", borderRadius: 10, padding: "1px 7px", marginLeft: "auto" }}>
                      {g.drivers.length}
                    </span>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    {renderBoardTable(g.drivers, "No drivers match your filters.")}
                  </div>
                </div>
              );
            })}
          </div>
        ) : renderBoardTable(visible, rows.length === 0 ? "No drivers on the board yet." : "No drivers match your filters.")}
      </div>
    </div>
  );

  // One full board table (colgroup+thead+tbody) for the given driver list — used for the
  // single "All drivers" table, and once per section in the "By team" view.
  function renderBoardTable(driversList: Driver[], emptyMessage: string) {
    return (
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
              {driversList.length === 0 && (
                <tr>
                  <td colSpan={COLUMNS.length} style={{ padding: "48px 20px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>
                    {emptyMessage}
                  </td>
                </tr>
              )}
              {driversList.map((driver, i) => {
                const lock    = locks[driver.driverId];
                // Only SOMEONE ELSE's lock disables the row; your own lock never blocks you,
                // but still gets its own (blue) tint so you can see the lock is active.
                const isLockedByOther = !!lock && lock.holder_id !== currentUserId;
                const isLockedByMe    = !!lock && lock.holder_id === currentUserId;
                // A control is inert if someone else holds the row OR the user can't write it.
                const noDriverEdit = isLockedByOther || !canEditDriver;
                const noLoadEdit   = isLockedByOther || !canEditLoad;
                const lockColor = isLockedByOther ? "#8B5CF6" : isLockedByMe ? "#3B82F6" : undefined;
                const isEven   = i % 2 === 0;
                const kmColor  = etaColor(driver.etaKm);
                // The lock highlight rides as a background *image* layer over an opaque
                // background *color*. It must not be a translucent backgroundColor: td()
                // paints the sticky Load ID / Driver Name columns too, and a see-through
                // sticky cell lets the horizontally-scrolled cells bleed through it.
                const rowBg    = isEven ? "var(--card)" : "var(--background)";
                const tint     = (c: string) => `linear-gradient(${c}, ${c})`;
                const rowTint  = isLockedByOther ? tint("rgba(139,92,246,0.14)")
                               : isLockedByMe    ? tint("rgba(59,130,246,0.14)")
                               : undefined;
                const border   = "1px solid var(--border)";
                // Claim the row lock on any edit interaction; release when it ends.
                const lockOnOpen = (o: boolean) => (o ? claimLock(driver.driverId) : releaseLock(driver.driverId));

                const td = (extra: React.CSSProperties = {}): React.CSSProperties => ({
                  padding: "10px 14px", backgroundColor: rowBg, backgroundImage: rowTint,
                  borderBottom: border, verticalAlign: "middle", ...extra,
                });

                // No active load → route/appointment cells are empty and non-interactive.
                const hasLoad = !!driver.loadRaw?.id;
                const emptyDash = <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)" }}>—</span>;

                return (
                  <tr key={driver.driverId}>

                    {/* Load ID — sticky, read-only. Upcoming queued loads render below,
                        smaller and muted, so they read as "next" rather than current. */}
                    <td style={td({ position: "sticky", left: LOAD_ID_LEFT, zIndex: 3, width: 200, minWidth: 200, borderRight: border })}>
                      <span className="cp-wrap" style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <BrokerLoadId broker={driver.loadRaw?.broker} loadId={driver.loadId} color="var(--primary)" size={12} weight={500} onOpen={driver.loadUuid ? () => openLoad(driver.loadUuid) : undefined} />
                        </span>
                        {/* Copy the FULL broker (no "…" truncation) + id, even though the
                            cell shows a shortened broker. */}
                        {driver.loadId && driver.loadId !== "—" && (
                          <CopyBtn value={driver.loadRaw?.broker ? `${driver.loadRaw.broker} - ${driver.loadId}` : driver.loadId} />
                        )}
                      </span>
                      {(() => {
                        const queue = driver.nextLoads ?? [];
                        if (queue.length === 0) return null;
                        const SHOWN = 2;
                        const shown = queue.slice(0, SHOWN);
                        const overflow = queue.length - shown.length;
                        return (
                          <div style={{ marginTop: 2, display: "flex", flexDirection: "column", gap: 1 }}>
                            {shown.map((q) => (
                              <BrokerLoadId key={q.id} broker={q.broker} loadId={q.loadId} color="#F59E0B" size={11} weight={600} onOpen={() => openLoad(q.id)} />
                            ))}
                            {overflow > 0 && (
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted-foreground)", opacity: 0.75 }}>+{overflow} more</span>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* Driver Name — sticky, read-only. Shows a "being edited by X" note when locked. */}
                    <td style={td({ position: "sticky", left: DRIVER_NM_LEFT, zIndex: 3, width: 180, minWidth: 180, borderRight: border, boxShadow: "2px 0 5px rgba(0,0,0,0.07)" })}>
                      {/* Team drivers show each name on its own copyable line. */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <Copyable value={driver.name} size={12} weight={500} />
                        {driver.team && driver.name2 && <Copyable value={driver.name2} size={12} weight={500} />}
                      </div>
                      {isLockedByOther && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, marginTop: 2, fontFamily: "var(--font-sans)", fontSize: 10, color: lockColor, whiteSpace: "nowrap" }}>
                          <Lock size={9} /> Editing by {lock!.holder_name}
                        </span>
                      )}
                      {isLockedByMe && (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 3, marginTop: 2, fontFamily: "var(--font-sans)", fontSize: 10, color: lockColor, whiteSpace: "nowrap" }}>
                          <Lock size={9} /> You're editing
                        </span>
                      )}
                    </td>

                    {/* Phone — read-only (team drivers show both contacts, each copyable) */}
                    <td style={td({ borderRight: border })}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <Copyable value={driver.phone} size={11} color="var(--muted-foreground)" mono />
                        {driver.team && driver.phone2 && <Copyable value={driver.phone2} size={11} color="var(--muted-foreground)" mono />}
                      </div>
                    </td>

                    {/* Unit (+ trailer below) — each copyable when it's a real value */}
                    <td style={td({ borderRight: border })}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, minWidth: 0 }}>
                          {isLockedByOther && <Lock size={10} style={{ color: lockColor, flexShrink: 0 }} />}
                          {driver.unit && driver.unit !== "—"
                            ? <Copyable value={driver.unit} size={11} weight={500} color={isLockedByOther ? lockColor : "var(--foreground)"} mono />
                            : <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)" }}>—</span>}
                        </div>
                        {driver.trailer && driver.trailer !== "—" && (
                          <Copyable value={driver.trailer} size={10} color="var(--muted-foreground)" mono />
                        )}
                      </div>
                    </td>

                    {/* Type */}
                    <td style={td({ borderRight: border })}>
                      <TypeDropdown value={driver.type} disabled={noDriverEdit} onOpenChange={lockOnOpen} onChange={(t) => patch(driver.driverId, { type: t })} />
                    </td>

                    {/* Status */}
                    <td style={td({ borderRight: border })}>
                      <StatusDropdown value={driver.status} disabled={noDriverEdit} onOpenChange={lockOnOpen}
                        onChange={(s) => requestStatus(driver, s)} />
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
                        originStop={driver.loadRaw?.stops?.[0]}
                        destinationStop={(driver.loadRaw?.stops?.length ?? 0) > 1 ? driver.loadRaw!.stops![driver.loadRaw!.stops!.length - 1] : undefined}
                        disabled={noLoadEdit}
                        onToggleOrigin={() => patchLoad(driver.driverId, driver.stops ?? [], !driver.originDone, driver.destinationDone ?? false)}
                        onToggleDestination={() => patchLoad(driver.driverId, driver.stops ?? [], driver.originDone ?? false, !driver.destinationDone)}
                        onToggleStop={(idx) => {
                          const updated = (driver.stops ?? []).map((s, i) => i === idx ? { ...s, done: !s.done } : s);
                          patchLoad(driver.driverId, updated, driver.originDone ?? false, driver.destinationDone ?? false);
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
                            {/* #1 pickup → route index 0 */}
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{ ...labelStyle, color: "var(--muted-foreground)" }}>#1</span>
                              <ApptText value={driver.pickupAppt} color={driver.pickupAppt === "—" || pickupDone ? "var(--muted-foreground)" : "var(--foreground)"} done={pickupDone} />
                            </div>
                            {/* intermediate stops → route index idx+1 */}
                            {stops.map((stop, idx) => {
                              const prevDone  = idx === 0 ? pickupDone : stops[idx - 1].done;
                              const isCurrent = !stop.done && prevDone;
                              return (
                                <div key={idx} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                  <span style={{ ...labelStyle, color: "var(--muted-foreground)" }}>#{idx + 2}</span>
                                  <ApptText value={cleanAppt(stop.appt) || "—"} color={stop.done || !stop.appt ? "var(--muted-foreground)" : isCurrent ? "var(--foreground)" : "var(--muted-foreground)"} done={stop.done} />
                                </div>
                              );
                            })}
                            {/* destination → route index stops.length+1 (only when there's a distinct last stop) */}
                            {driver.dropAppt !== "—" && (
                              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <span style={{ ...labelStyle, color: "var(--muted-foreground)" }}>#{destNum}</span>
                                <ApptText value={driver.dropAppt} color={destDone ? "var(--muted-foreground)" : "var(--foreground)"} done={destDone} />
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    })()}

                    {/* Current Location — the truck's real ELD position when it's reporting,
                        else the dispatcher's typed location. Shown next to the pin, with the
                        ELD freshness beneath. */}
                    <td style={td({ borderRight: border, verticalAlign: "top", paddingTop: 10, paddingBottom: 10 })}>
                      {(() => {
                        const eld  = driver.eld;
                        const loc  = eld?.location || driver.location;
                        const fresh = eld ? eldFreshColor(eld.reported_at) : "var(--muted-foreground)";
                        // Google Maps Directions with the truck's exact position as the
                        // starting point (destination left blank) — click to open in a new
                        // tab, type the other end, read the distance. Only when we have coords.
                        const hasCoords = eld?.lat != null && eld?.lng != null;
                        return (
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <MapPin size={11} style={{ color: fresh, flexShrink: 0 }} />
                              <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>{loc || "—"}</span>
                              {hasCoords && (
                                <button
                                  type="button"
                                  title="Directions from here in Google Maps"
                                  onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&origin=${eld!.lat},${eld!.lng}`, "_blank", "noopener,noreferrer")}
                                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, width: 20, height: 20, borderRadius: 5, border: "none", backgroundColor: "transparent", cursor: "pointer", color: "var(--muted-foreground)" }}
                                  onMouseEnter={(e) => { const b = e.currentTarget; b.style.backgroundColor = "var(--muted)"; b.style.color = "var(--primary)"; }}
                                  onMouseLeave={(e) => { const b = e.currentTarget; b.style.backgroundColor = "transparent"; b.style.color = "var(--muted-foreground)"; }}
                                >
                                  <ExternalLink size={12} />
                                </button>
                              )}
                            </div>
                            {eld?.reported_at && (
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: fresh, whiteSpace: "nowrap", paddingLeft: 16 }}>ELD · {timeAgo(eld.reported_at)}</span>
                            )}
                          </div>
                        );
                      })()}
                    </td>

                    {/* ETA / Dist. — eta_km is always null (no ELD reports an ETA), so it
                        stays "—". Speed and HOS duty status come live from the ELD. */}
                    <td style={td({ borderRight: border, verticalAlign: "top", paddingTop: 10, paddingBottom: 10 })}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
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
                        {driver.eld?.duty_status && (() => {
                          const dc = dutyConfig(driver.eld.duty_status);
                          return (
                            <span title={driver.eld.duty_since ? `since ${timeAgo(driver.eld.duty_since)}` : undefined}
                              style={{ alignSelf: "flex-start", fontFamily: "var(--font-sans)", fontSize: 9, fontWeight: 700, color: dc.color, backgroundColor: dc.bg, borderRadius: 4, padding: "1px 6px", textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>
                              {dc.label}
                            </span>
                          );
                        })()}
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
                            : <span onClick={noDriverEdit ? undefined : () => startEdit(driver.driverId, "comments")} style={{ cursor: noDriverEdit ? "default" : "text", fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--foreground)", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{driver.comments || "—"}</span>
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
    );
  }
}
