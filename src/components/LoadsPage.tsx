import { useState, useRef, useEffect } from "react";
import { Navigate, useBlocker, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { createPortal } from "react-dom";
import {
  Package, Plus, Pencil, Trash2, X, Check, AlertCircle,
  Search, ChevronDown, ChevronLeft, ChevronRight,
  ClipboardList, Sparkles, Upload, FileText,
  ArrowLeft, ArrowRight, Building2, User, DollarSign, Clock, History, CalendarDays, Navigation, GripVertical,
} from "lucide-react";
import { Status, STATUS_CONFIG as SHARED_STATUS_CONFIG, ALL_STATUSES as SHARED_ALL_STATUSES } from "../lib/statuses";
import { api, ApiError, isForbidden } from "../lib/api";
import { useAuth } from "../lib/auth";
import { hasPerm } from "../lib/permissions";
import { menuPosition } from "../lib/menuPosition";
import { driverDisplayName } from "../lib/driverName";
import { geocodeCity, routeMiles, type LatLng } from "../lib/geo";
import { formatAppt, formatApptParts, normalizeTime, parseAppt, type ApptParts } from "../lib/appt";
import { AsyncSearchableSelect, type SelectOpt } from "./AsyncSelect";
import { PageLoader } from "./PageLoader";
import { FormError, friendlyError, notify } from "./feedback";
import { AddressAutocomplete, type AddressParts } from "./AddressAutocomplete";
import { UncompleteConfirm } from "./UncompleteConfirm";
import { RouteMap, type RoutePoint } from "./RouteMap";
import { Dash } from "./Dash";
import { fmtDateTime } from "../lib/dates";

// ─── Types ────────────────────────────────────────────────────────────────────

// ADR 0023: an address is three fields. `city` holds ONLY the city now; street and
// state sit beside it. The API joins them "street, city, state" (empty parts skipped)
// wherever it renders one line — we mirror that with joinAddress().
interface Stop {
  street?: string;
  city: string;
  state?: string;
  done: boolean;
  appt?: string;
  lat?: number;
  lng?: number;
  location?: { lat: number; lng: number }; // backend coord shape (round-tripped)
  // Client-only: the raw text as typed in the address input. Displaying the parsed →
  // re-joined form would normalize away the ", " the user is mid-typing (making commas
  // and spaces impossible to enter). Never sent to the backend.
  text?: string;
  // Client-only: a stable identity for the row while it's being edited. Never sent.
  k?: string;
}

// Full one-line address (street, city, state) — used in the EDIT input so the dispatcher
// sees exactly what they entered.
function joinAddress(s: { street?: string; city?: string; state?: string }): string {
  return [s.street, s.city, s.state].map((p) => (p ?? "").trim()).filter(Boolean).join(", ");
}

// Short form (city, state) — what we DISPLAY everywhere a load is shown after creation.
function cityState(s: { city?: string; state?: string }): string {
  return [s.city, s.state].map((p) => (p ?? "").trim()).filter(Boolean).join(", ");
}

// Split a typed one-liner back into the three fields. Comma-delimited: the last part is
// the state, the one before it the city, anything earlier the street — the same split
// (on the last comma) the backend's migration used, so typed and picked stay consistent.
function parseAddress(text: string): { street: string; city: string; state: string } {
  const parts = text.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return { street: "", city: "", state: "" };
  if (parts.length === 1) return { street: "", city: parts[0], state: "" };
  return { street: parts.slice(0, -2).join(", "), city: parts[parts.length - 2], state: parts[parts.length - 1] };
}

interface Load {
  id: string;
  loadId: string;
  broker: string;
  driver: string;       // display name, derived from driver_id
  driver_id: string;
  status: Status;
  stops?: Stop[];        // the whole ordered route (stops[0] = pickup, last = delivery)
  payout: number;
  totalMiles: number;      // LOADED miles only — the backend keeps deadhead separate
  deadheadMiles: number;   // empty miles run to reach this load's pickup
  dispatcher: string;
  dispatcher_id: string;
}

interface BackendLoad {
  id: string;
  load_id: string;
  driver_id: string | null; // null on write = clear the assignee (unassigned pool)
  driver?: string;         // read-only resolved driver name (primary for a team)
  driver_team?: boolean;
  driver_name2?: string;
  status: Status;
  payout: number;
  miles: number;              // loaded miles
  deadhead_distance?: number; // empty miles to the pickup; total_miles = miles + this
  broker?: string;
  stops?: Stop[];
  dispatcher_id?: string;
  dispatcher?: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────


const STATUS_FILTER_OPTS: SelectOpt[] = [
  { value: "All", label: "All Statuses" },
  ...SHARED_ALL_STATUSES.map((s) => ({ value: s, label: SHARED_STATUS_CONFIG[s].label })),
];
const STATUS_MODAL_OPTS: SelectOpt[] = SHARED_ALL_STATUSES.map((s) => ({ value: s, label: SHARED_STATUS_CONFIG[s].label }));

// ─── Backend helpers ──────────────────────────────────────────────────────────

function toLoad(b: BackendLoad): Load {
  // The backend resolves the driver name (and the team's second name) directly.
  const driverName = b.driver ? driverDisplayName({ name: b.driver, name2: b.driver_name2, team: b.driver_team }) : "";
  return {
    id: b.id,
    loadId: b.load_id ?? "",
    driver_id: b.driver_id ?? "",
    driver: driverName,
    broker: b.broker ?? "",
    status: b.status as Status,
    payout: b.payout ?? 0,
    totalMiles: b.miles ?? 0,
    deadheadMiles: b.deadhead_distance ?? 0,
    // Backend keeps coords under `location:{lat,lng}`; flatten to lat/lng for the modal
    // so existing geocoded stops keep their coordinates (drives the miles recalc).
    stops: (b.stops ?? []).map((s) => ({
      street: s.street ?? "", city: s.city, state: s.state ?? "",
      done: s.done, appt: formatAppt(s.appt),
      lat: s.location?.lat ?? s.lat,
      lng: s.location?.lng ?? s.lng,
    })),
    dispatcher: b.dispatcher ?? "",
    dispatcher_id: b.dispatcher_id ?? "",
  };
}

function toBackend(l: Partial<Load>, opts: { create?: boolean; omitStatus?: boolean } = {}): Partial<BackendLoad> {
  // The route rides entirely in stops — no origin/destination/*_appt fields.
  // Coords go back as `location:{lat,lng}` (the backend's shape), not flat lat/lng.
  return {
    load_id: l.loadId,
    // An unassigned load is "" on create, but null on update — null is what returns a
    // load to the unassigned pool (and rotates the old driver's deck). "" is only
    // defined as "no assignee" at create time.
    driver_id: l.driver_id || (opts.create ? "" : null),
    stops: (l.stops ?? []).map((s) => ({
      // Send the three fields separately — no longer cram the whole address into city.
      street: (s.street ?? "").trim(),
      city: (s.city ?? "").trim(),
      state: (s.state ?? "").trim(),
      appt: s.appt,
      done: s.done,
      ...(s.lat != null && s.lng != null ? { location: { lat: s.lat, lng: s.lng } } : {}),
    })),
    // A load's status is queue-driven once it has a driver — a queued/next load
    // carries an empty status. Sending "" back on an edit makes the backend
    // coerce it to the default ("reserved"), wrongly activating a queued load.
    // Omit an empty status so the backend keeps it queue-driven; only a real,
    // user-chosen status (or "completed") is sent. omitStatus drops it entirely —
    // see the reassign case in save().
    status: opts.omitStatus ? undefined : (l.status || undefined),
    payout: l.payout ?? 0,
    miles: l.totalMiles ?? 0,
    // Sent separately, never folded into miles — the backend derives
    // total_miles = miles + deadhead_distance, so folding would double-count it.
    deadhead_distance: l.deadheadMiles ?? 0,
    broker: l.broker,
    dispatcher_id: l.dispatcher_id || undefined,
  };
}

// A Completed load has driven its whole route — mark every stop done before persisting.
function withCompletedStops(l: Load): Load {
  if (l.status !== "completed" || !l.stops?.length) return l;
  return { ...l, stops: l.stops.map((s) => ({ ...s, done: true })) };
}


// ─── Custom Select ─────────────────────────────────────────────────────────────

function CustomSelect({
  value, options, onChange, width, compact = false, dropUp = false, plain = false,
}: {
  value: string; options: SelectOpt[]; onChange: (v: string) => void;
  width?: number | string; compact?: boolean; dropUp?: boolean;
  plain?: boolean; // white bordered field (the page form) instead of the grey-filled one
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const selected = options.find((o) => o.value === value);
  const h = compact ? 30 : plain ? 36 : 34;

  return (
    <div ref={ref} style={{ position: "relative", width: width ?? "100%" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%",
          height: h, paddingLeft: 10, paddingRight: 8,
          fontFamily: "var(--font-sans)", fontSize: compact ? 12 : 13,
          backgroundColor: plain ? "var(--card)" : "var(--input-background)",
          border: `1px solid ${open ? "var(--primary)" : "var(--border)"}`,
          borderRadius: plain ? 8 : 7, color: "var(--foreground)", cursor: "pointer",
          boxShadow: open ? "0 0 0 3px var(--primary-soft)" : "none",
          transition: "border-color 0.15s, box-shadow 0.15s", outline: "none",
        }}
      >
        {selected?.dot && (
          <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: selected.dot, flexShrink: 0 }} />
        )}
        <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected?.label ?? "Select…"}
        </span>
        <ChevronDown size={13} style={{ color: "var(--muted-foreground)", flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>

      {open && (
        <div style={{
          position: "absolute",
          ...(dropUp ? { bottom: "calc(100% + 4px)", top: "auto" } : { top: "calc(100% + 4px)", bottom: "auto" }),
          left: 0, minWidth: "100%", width: "max-content",
          backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.10)", zIndex: 200, overflow: "hidden",
        }}>
          {options.map((opt) => {
            const isActive = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  width: "100%", padding: "7px 12px",
                  fontFamily: "var(--font-sans)", fontSize: 13,
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? "var(--primary)" : "var(--foreground)",
                  backgroundColor: isActive ? "var(--accent)" : "transparent",
                  border: "none", cursor: "pointer", textAlign: "left", outline: "none",
                }}
                onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--muted)"; }}
                onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
              >
                {opt.dot && <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: opt.dot, flexShrink: 0 }} />}
                <span style={{ flex: 1 }}>{opt.label}</span>
                {isActive && <Check size={13} style={{ color: "var(--primary)", flexShrink: 0 }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Pagination ────────────────────────────────────────────────────────────────

const PAGE_SIZES = [20, 40, 60, 100];

function Pagination({ page, total, pageSize, onPage, onPageSize, loading = false }: {
  page: number; total: number; pageSize: number;
  onPage: (p: number) => void; onPageSize: (s: number) => void; loading?: boolean;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to   = Math.min(page * pageSize, total);

  const pages: (number | "…")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("…");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push("…");
    pages.push(totalPages);
  }

  const PBtn = ({ children, active = false, disabled = false, onClick }: {
    children: React.ReactNode; active?: boolean; disabled?: boolean; onClick: () => void;
  }) => (
    <button onClick={onClick} disabled={disabled} style={{
      minWidth: 30, height: 30, borderRadius: 6, padding: "0 6px",
      border: active ? "1.5px solid var(--primary)" : "1px solid var(--border)",
      backgroundColor: active ? "var(--primary)" : "transparent",
      color: active ? "#fff" : disabled ? "var(--muted-foreground)" : "var(--foreground)",
      fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: active ? 600 : 400,
      cursor: disabled ? "default" : "pointer",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      opacity: disabled ? 0.38 : 1, outline: "none", transition: "background-color 0.1s",
    }}>
      {children}
    </button>
  );

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 16px", borderTop: "1px solid var(--border)",
      backgroundColor: "var(--card)", flexShrink: 0,
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>
          {loading && <span style={{ width: 12, height: 12, borderRadius: "50%", border: "2px solid var(--border)", borderTopColor: "var(--primary)", animation: "spin 0.7s linear infinite", display: "inline-block" }} />}
          {loading ? "Loading…" : total === 0 ? "No results" : `Showing ${from}–${to} of ${total}`}
        </span>
        <span style={{ color: "var(--border)", userSelect: "none" }}>·</span>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>
          Rows per page
        </span>
        <CustomSelect
          value={String(pageSize)}
          options={PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))}
          onChange={(v) => { onPageSize(Number(v)); onPage(1); }}
          width={72} compact dropUp
        />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <PBtn disabled={loading || page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={14} /></PBtn>
        {pages.map((p, i) =>
          p === "…"
            ? <span key={`e${i}`} style={{ padding: "0 4px", fontSize: 13, color: "var(--muted-foreground)", lineHeight: "30px" }}>…</span>
            : <PBtn key={p} active={p === page} disabled={loading && p !== page} onClick={() => onPage(p as number)}>{p}</PBtn>
        )}
        <PBtn disabled={loading || page >= totalPages} onClick={() => onPage(page + 1)}><ChevronRight size={14} /></PBtn>
      </div>
    </div>
  );
}

// ─── Shared table primitives ───────────────────────────────────────────────────

// `pinned` keeps a column (the row actions) in view when the table scrolls sideways.
const TH = ({ children, width, align = "left", pinned = false }: { children: React.ReactNode; width?: number; align?: string; pinned?: boolean }) => (
  <th style={{
    padding: "8px 14px", textAlign: align as "left" | "center" | "right",
    fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 600,
    color: "var(--muted-foreground)", letterSpacing: "0.07em",
    textTransform: "uppercase", backgroundColor: "var(--muted)",
    borderBottom: "1px solid var(--border)",
    whiteSpace: "nowrap", userSelect: "none",
    width: width ?? "auto", minWidth: width ?? "auto",
    position: "sticky", top: 0, zIndex: 5,
    ...(pinned ? { right: 0, zIndex: 6, boxShadow: "inset 1px 0 0 var(--border)" } : {}),
  }}>
    {children}
  </th>
);

function StatusBadge({ status }: { status: Status }) {
  const c = SHARED_STATUS_CONFIG[status];
  if (!c) return <Dash />;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600,
      color: c.color, backgroundColor: c.bg,
      borderRadius: 20, padding: "2px 10px", whiteSpace: "nowrap",
    }}>
      {c.label}
    </span>
  );
}

function StatusDropdown({ value, onChange, readOnly = false }: { value: Status; onChange: (s: Status) => void | Promise<void>; readOnly?: boolean }) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [busy, setBusy] = useState(false);
  const anchorRef = useRef<HTMLDivElement>(null);
  const dropRef   = useRef<HTMLDivElement>(null);

  const select = (s: Status) => {
    setOpen(false);
    setBusy(true);
    Promise.resolve(onChange(s)).catch(() => {}).finally(() => setBusy(false));
  };

  const toggle = () => {
    const r = anchorRef.current?.getBoundingClientRect();
    if (r) setRect(r);
    setOpen((v) => !v);
  };

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!anchorRef.current?.contains(e.target as Node) && !dropRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const cfg = SHARED_STATUS_CONFIG[value];
  const interactive = cfg && !busy && !readOnly;

  return (
    <>
      <div ref={anchorRef} onClick={interactive ? toggle : undefined} style={{ cursor: interactive ? "pointer" : "default", display: "inline-flex" }}>
        {cfg ? (
          <span style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600,
            color: cfg.color, backgroundColor: cfg.bg,
            borderRadius: 4, padding: "3px 8px", whiteSpace: "nowrap", userSelect: "none",
          }}>
            {cfg.label}
            {busy
              ? <span style={{ width: 9, height: 9, borderRadius: "50%", border: `1.5px solid ${cfg.color}55`, borderTopColor: cfg.color, animation: "spin 0.7s linear infinite", display: "inline-block", marginLeft: 1 }} />
              : !readOnly && <ChevronDown size={10} style={{ opacity: 0.7, marginLeft: 1 }} />}
          </span>
        ) : (
          <Dash />
        )}
      </div>
      {open && rect && (() => {
        const { top, left } = menuPosition(rect, SHARED_ALL_STATUSES.length, 168);
        return createPortal(
        <div ref={dropRef} style={{
          position: "fixed", top, left, zIndex: 9999,
          backgroundColor: "var(--card)", border: "1px solid var(--border)",
          borderRadius: 10, boxShadow: "0 10px 30px rgba(0,0,0,0.16)",
          padding: "5px", minWidth: 168, maxHeight: "calc(100vh - 16px)", overflowY: "auto",
          display: "flex", flexDirection: "column", gap: 1,
        }}>
          {SHARED_ALL_STATUSES.map((s) => {
            const c = SHARED_STATUS_CONFIG[s];
            const active = s === value;
            return (
              <button key={s} onMouseDown={(e) => { e.preventDefault(); select(s); }}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "6px 8px",
                  border: "none", borderRadius: 6,
                  backgroundColor: active ? c.bg : "transparent",
                  cursor: "pointer", width: "100%", textAlign: "left",
                }}
                onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--muted)"; }}
                onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
              >
                <span style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: c.bg, border: `2px solid ${c.bg}`, flexShrink: 0 }} />
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: active ? 600 : 400, color: active ? c.color : "var(--foreground)", flex: 1 }}>
                  {c.label}
                </span>
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

// Row actions stay quiet (grey) until hovered or focused, then take their meaning's colour.
// An icon-only button says nothing to a screen reader (or on hover) without a label.
function ActionBtn({ icon, tone, onClick, label }: { icon: React.ReactNode; tone: "edit" | "delete"; onClick: () => void; label: string }) {
  const hot = tone === "delete"
    ? { color: "#EF4444", bg: "rgba(239,68,68,0.12)" }
    : { color: "var(--primary)", bg: "var(--primary-soft)" };
  const on  = (e: React.SyntheticEvent<HTMLButtonElement>) => { e.currentTarget.style.color = hot.color; e.currentTarget.style.backgroundColor = hot.bg; };
  const off = (e: React.SyntheticEvent<HTMLButtonElement>) => { e.currentTarget.style.color = "var(--muted-foreground)"; e.currentTarget.style.backgroundColor = "transparent"; };
  return (
    <button onClick={onClick} aria-label={label} title={label}
      style={{ width: 30, height: 30, borderRadius: 7, border: "none", backgroundColor: "transparent", color: "var(--muted-foreground)", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", transition: "color 0.12s, background-color 0.12s" }}
      onMouseEnter={on} onMouseLeave={off} onFocus={on} onBlur={off}
    >
      {icon}
    </button>
  );
}

function fmt(n: number) {
  return n === 0 ? "—" : `$${n.toLocaleString()}`;
}

// ─── Add Menu ─────────────────────────────────────────────────────────────────

// ─── AI Smart Extract ─────────────────────────────────────────────────────────

const EXTRACT_ACCEPT = ".pdf,.png,.jpg,.jpeg,.webp,.txt";
const MAX_DOC_BYTES  = 10 * 1024 * 1024; // pdf/image; text is 1 MB but the server judges

// The backend sniffs the bytes, so these messages describe *its* verdict, not ours.
function extractErrorMessage(e: unknown): string {
  const code = e instanceof ApiError ? e.code : undefined;
  switch (code) {
    case "not_configured":        return "AI Smart Extract isn't enabled on this server yet. Ask an admin to configure it.";
    case "ai_unavailable":        return "The model is busy or today's quota is spent. Try again in a moment.";
    case "file_too_large":        return "That file is over the limit (10 MB for a PDF or image, 1 MB for text).";
    case "unsupported_media_type":return "That doesn't look like a PDF, image, or text file.";
    case "invalid_request":       return "The document was empty or unreadable.";
    default:                      return friendlyError(e, "Extraction failed.");
  }
}

function ExtractModal({ onClose, onExtracted }: {
  onClose: () => void;
  onExtracted: (draft: ExtractDraft) => void;
}) {
  const [file, setFile]       = useState<File | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy]       = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  // Closing must ALWAYS work — extraction can run 15s+, and a user who picked the wrong
  // file shouldn't be trapped watching it. Nothing is saved server-side, so cancelling
  // just means ignoring the result when (if) it lands.
  const closedRef = useRef(false);
  const close = () => { closedRef.current = true; onClose(); };

  const pickFile = (f: File | undefined | null) => {
    if (!f) return;
    if (f.size > MAX_DOC_BYTES) { setError("That file is over the 10 MB limit."); return; }
    setError(null);
    setFile(f);
  };

  const canSubmit = !!file;

  const submit = async () => {
    if (!canSubmit || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Extraction reads the document with a reasoning model — a few seconds is normal,
      // longer for a many-page PDF. fetch has no default timeout, so just wait.
      const res = await api.upload<{ draft: ExtractDraft }>("/loads/extract", file);
      if (closedRef.current) return; // user cancelled while it ran — discard the draft
      onExtracted(res?.draft ?? {});
    } catch (e) {
      if (!closedRef.current) setError(extractErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ backgroundColor: "var(--card)", borderRadius: 12, width: 540, boxShadow: "0 20px 60px rgba(0,0,0,0.22)" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border)", backgroundColor: "var(--muted)", borderRadius: "12px 12px 0 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: "rgba(139,92,246,0.14)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Sparkles size={15} color="#8B5CF6" />
            </div>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>AI Smart Extract</span>
          </div>
          <button onClick={close} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", display: "flex" }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
          <div
            onClick={() => !busy && inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); if (!busy) setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); if (!busy) pickFile(e.dataTransfer.files[0]); }}
            style={{
              border: `2px dashed ${dragging ? "#8B5CF6" : file ? "#10B981" : "var(--border)"}`,
              borderRadius: 10, padding: "34px 20px", textAlign: "center",
              backgroundColor: dragging ? "rgba(139,92,246,0.12)" : file ? "rgba(16,185,129,0.10)" : "var(--input-background)",
              cursor: busy ? "default" : "pointer", transition: "all 0.15s",
            }}
          >
            <input ref={inputRef} type="file" accept={EXTRACT_ACCEPT} onChange={(e) => pickFile(e.target.files?.[0])} style={{ display: "none" }} />
            {file ? (
              <>
                <div style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: "rgba(16,185,129,0.16)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                  <FileText size={22} color="#10B981" />
                </div>
                <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>{file.name}</div>
                <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", marginTop: 4 }}>
                  {(file.size / 1024).toFixed(1)} KB · Click to change
                </div>
              </>
            ) : (
              <>
                <div style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                  <Upload size={20} color="var(--muted-foreground)" />
                </div>
                <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 500, color: "var(--foreground)" }}>Drop the rate confirmation here</div>
                <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", marginTop: 4 }}>
                  or <span style={{ color: "#8B5CF6", fontWeight: 500 }}>browse files</span> — PDF, photo/scan, or text (max 10 MB)
                </div>
              </>
            )}
          </div>

          {/* Third-party disclosure — the document leaves our server. */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
            <AlertCircle size={13} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>The document is sent to a third-party AI service to be read. Nothing is saved until you review the draft and create the load.</span>
          </div>

          {busy && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", backgroundColor: "rgba(139,92,246,0.10)", border: "1px solid rgba(139,92,246,0.35)", borderRadius: 8 }}>
              <span style={{ width: 15, height: 15, borderRadius: "50%", border: "2px solid rgba(139,92,246,0.35)", borderTopColor: "#8B5CF6", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />
              <div style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, color: "#8B5CF6", lineHeight: 1.45 }}>
                Reading the document… this usually takes 5–15 seconds.
              </div>
            </div>
          )}

          {error && !busy && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", backgroundColor: "rgba(239,68,68,0.08)", borderRadius: 8, border: "1px solid rgba(239,68,68,0.35)" }}>
              <AlertCircle size={15} color="#EF4444" style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "#EF4444", lineHeight: 1.5 }}>{error}</div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 20px", borderTop: "1px solid var(--border)" }}>
          <button onClick={close} style={{ fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 16px", borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "var(--muted)", color: "var(--foreground)", cursor: "pointer" }}>
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!canSubmit || busy}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "7px 16px",
              borderRadius: 6, border: "none",
              backgroundColor: canSubmit && !busy ? "#7C3AED" : "var(--muted)",
              color: canSubmit && !busy ? "#fff" : "var(--muted-foreground)",
              cursor: canSubmit && !busy ? "pointer" : "not-allowed",
            }}
          >
            <Sparkles size={14} /> {busy ? "Extracting…" : "Extract"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddLoadMenu({ onManual, onExtract }: { onManual: () => void; onExtract: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const items = [
    {
      icon: <ClipboardList size={16} />,
      iconColor: "var(--primary)", iconBg: "var(--secondary)",
      label: "Add Manually",
      desc: "Fill in load details using the form",
      comingSoon: false,
      onClick: onManual,
    },
    {
      icon: <Sparkles size={16} />,
      iconColor: "#8B5CF6", iconBg: "rgba(139,92,246,0.14)",
      label: "AI Smart Extract",
      desc: "Parse load info from a rate confirmation",
      comingSoon: false,
      onClick: onExtract,
    },
  ];

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600,
          height: 34, padding: "0 14px", borderRadius: 7, border: "none",
          backgroundColor: "var(--primary)", color: "#fff", cursor: "pointer", outline: "none",
        }}
      >
        <Plus size={14} />
        Create Load
        <span style={{ width: 1, height: 16, backgroundColor: "rgba(255,255,255,0.25)", margin: "0 2px" }} />
        <ChevronDown size={13} style={{ opacity: 0.85, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", right: 0,
          width: 270, backgroundColor: "var(--card)",
          border: "1px solid var(--border)", borderRadius: 10,
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 200,
          padding: 6, display: "flex", flexDirection: "column", gap: 2,
        }}>
          {items.map((item) => (
            <button
              key={item.label}
              onClick={() => { if (!item.comingSoon) { item.onClick(); setOpen(false); } }}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                width: "100%", padding: "9px 10px", borderRadius: 7,
                border: "none", textAlign: "left", cursor: item.comingSoon ? "default" : "pointer",
                backgroundColor: "transparent", opacity: item.comingSoon ? 0.6 : 1,
                outline: "none", transition: "background-color 0.1s",
              }}
              onMouseEnter={(e) => { if (!item.comingSoon) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--muted)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
            >
              <div style={{
                width: 34, height: 34, borderRadius: 8, flexShrink: 0,
                backgroundColor: "var(--primary-soft)", color: "var(--primary)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {item.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                  <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>
                    {item.label}
                  </span>
                  {item.comingSoon && (
                    <span style={{
                      fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 700,
                      color: "#8B5CF6", backgroundColor: "rgba(139,92,246,0.14)",
                      borderRadius: 4, padding: "1px 6px", letterSpacing: "0.04em",
                    }}>
                      SOON
                    </span>
                  )}
                </div>
                <div style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--muted-foreground)", marginTop: 1 }}>
                  {item.desc}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Calendar picker ─────────────────────────────────────────────────────────

const CAL_MONTHS   = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const CAL_DAYS     = ["Su","Mo","Tu","We","Th","Fr","Sa"];
const NAV_BTN: React.CSSProperties = {
  width: 28, height: 28, border: "none", borderRadius: 6,
  backgroundColor: "transparent", cursor: "pointer",
  fontFamily: "var(--font-sans)", fontSize: 18, color: "var(--foreground)",
  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
};

// The extractor's draft — exactly the fields a load stores. No driver/dispatcher
// (a human assigns those), and draft stops carry no `done` flag.
interface ExtractDraft {
  load_id?: string;
  broker?: string;
  payout?: number;
  miles?: number;
  deadhead_distance?: number; // extractor returns 0 unless the rate con states it
  stops?: { street?: string; city?: string; state?: string; appt?: string }[];
}

// ─── Deadhead anchor ──────────────────────────────────────────────────────────

// Where the truck will be when it STARTS this load — the point deadhead is measured
// from. Walking the driver's chain: the last stop of the last load already queued to
// them, or (if they're running nothing) wherever the driver currently is.
interface DeadheadAnchor { point: LatLng; label: string; from: string }

// The telemetry block on a driver, mirroring the board row's `eld` (ADR 0021/0023).
// GET /drivers/:id now returns it, so deadhead measures from the truck's real position;
// we still geocode the typed `location` as a fallback when the driver isn't ELD-linked.
interface DriverEld { location?: string; lat?: number | null; lng?: number | null }

async function resolveDeadheadAnchor(driverId: string, signal?: AbortSignal): Promise<DeadheadAnchor | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const driver = await api.get<any>(`/drivers/${driverId}`);

  // The load this one follows: the tail of the queue, else the load they're running.
  const queue: { id: string }[] = driver.next_loads ?? [];
  const priorLoadId: string | undefined = queue.length > 0 ? queue[queue.length - 1]?.id : driver.current_load_id || undefined;

  if (priorLoadId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prior = await api.get<any>(`/loads/${priorLoadId}`);
    const stops = prior.stops ?? [];
    const last  = stops[stops.length - 1];
    if (last?.city) {
      const line = joinAddress(last);
      const point = last.location?.lat != null && last.location?.lng != null
        ? { lat: last.location.lat, lng: last.location.lng }
        : await geocodeCity(line, signal);
      if (point) return { point, label: line, from: `${prior.load_id || "previous load"} delivery` };
    }
    return null; // the prior load has no usable delivery point — don't guess
  }

  // No loads on the deck: measure from where the driver actually is.
  const eld: DriverEld | undefined = driver.eld ?? undefined;
  if (eld?.lat != null && eld?.lng != null) {
    return { point: { lat: eld.lat, lng: eld.lng }, label: eld.location || "current position", from: "driver's current location (ELD)" };
  }
  if (driver.location?.trim()) {
    const point = await geocodeCity(driver.location, signal);
    if (point) return { point, label: driver.location, from: "driver's current location" };
  }
  return null;
}

function draftToLoad(d: ExtractDraft): Partial<Load> {
  const stops: Stop[] = (d.stops ?? []).map((s) => ({
    // The extractor splits the address into three fields now — take them as given.
    street: s.street ?? "",
    city: s.city ?? "",
    state: s.state ?? "",
    // Keep the broker's appointment text as printed (e.g. "07/06 0800-1700", "FCFS") —
    // but drop label-only junk: a rate con with no time set makes the model copy the
    // section HEADING ("Appointment", "TBD", …) as the value, which then renders on the
    // board as if it meant something. Empty is honest; a human fills it in.
    appt: formatAppt(s.appt),
    done: false,
  }));
  // The modal expects at least an origin and a destination row.
  while (stops.length < 2) stops.push({ city: "", appt: "", done: false });
  return {
    loadId:     d.load_id ?? "",
    broker:     d.broker  ?? "",
    payout:     d.payout  ?? 0,
    totalMiles: d.miles   ?? 0,
    deadheadMiles: d.deadhead_distance ?? 0,
    stops,
  };
}

// ─── Appointment: a date, and a time or a time window ─────────────────────────
//
// The backend's `appt` is one free-text string, shown as written on the Board and in the
// list. The form edits it as parts — a day or a range of days, a time or a time window —
// and writes it back in the app's one appointment format (see lib/appt), e.g.
// "MM.DD.YY · HH:MM" or "MM.DD-MM.DD.YY · HH:MM-HH:MM". Text the parts can't describe
// (a rate con's "FCFS") is kept as-is until it's replaced.

// These boxes hold load data, not the user's own details. Without this Chrome reads the
// form as a personal one and offers to "save" it (it took a time for a licence plate).
const NO_AUTOFILL = { autoComplete: "off", autoCorrect: "off", spellCheck: false, "data-form-type": "other", "data-lpignore": "true" } as const;

const fieldBox = (active: boolean): React.CSSProperties => ({
  height: 36, borderRadius: 8, boxSizing: "border-box",
  border: `1px solid ${active ? "var(--primary)" : "var(--border)"}`,
  boxShadow: active ? "0 0 0 3px var(--primary-soft)" : "none",
  backgroundColor: "var(--card)", color: "var(--foreground)", outline: "none",
  transition: "border-color 0.15s, box-shadow 0.15s",
});

// One time, typed. Accepts what a dispatcher actually types ("800", "8:30", "1700") and
// tidies it to HH:MM when the field is left.
function TimeField({ value, onChange, placeholder, label, wide = false }: { value: string; onChange: (v: string) => void; placeholder: string; label: string; wide?: boolean }) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(value); }, [value, focused]);
  return (
    <input
      value={text}
      aria-label={label}
      placeholder={placeholder}
      inputMode="numeric"
      {...NO_AUTOFILL}
      onChange={(e) => setText(e.target.value.replace(/[^0-9:.]/g, "").slice(0, 5))}
      onFocus={(e) => { setFocused(true); e.currentTarget.select(); }}
      onBlur={() => {
        setFocused(false);
        const t = text.trim() ? normalizeTime(text) : "";
        // Unreadable input falls back to what was there, rather than silently clearing it.
        if (text.trim() && !t) { setText(value); return; }
        setText(t);
        if (t !== value) onChange(t);
      }}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
      style={{ ...fieldBox(focused), width: wide ? "100%" : 68, padding: "0 8px", textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 13 }}
    />
  );
}

const APPT_POP_W = 296;
const dayNum = (y: number, mo: number, d: number) => y * 10000 + mo * 100 + d;
const NO_DATES = { y: null, mo: null, d: null, y2: null, mo2: null, d2: null };

// The day of an appointment — or a range of days. Click one day; click a later one
// straight after and it becomes a range. The calendar is drawn at a fixed screen position
// worked out from the field — below it when there's room, above it when there isn't — so
// it can't hang off the window or be clipped by a scrolling panel.
function DateRangeField({ p, onDates, label }: { p: ApptParts; onDates: (patch: Partial<ApptParts>) => void; label: string }) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const now = new Date();
  const thisYear = now.getFullYear();
  const [open, setOpen] = useState(false);
  const [pos, setPos]   = useState<React.CSSProperties>({});
  const [vy,  setVy]    = useState(p.y ?? thisYear);
  const [vmo, setVmo]   = useState(p.mo ?? now.getMonth());
  const [view, setView] = useState<"day" | "month" | "year">("day");
  const [yPage, setYPage] = useState(Math.floor(thisYear / 12) * 12);
  // True right after a first day is clicked: the next click on a later day ends the range.
  const [pickingEnd, setPickingEnd] = useState(false);
  const [hover, setHover] = useState<number | null>(null);

  const update = onDates;

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const H = 372, GAP = 4;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - APPT_POP_W - 8));
    const below = window.innerHeight - r.bottom - GAP;
    setPos(below >= H || below >= r.top - GAP
      ? { top: r.bottom + GAP, left, maxHeight: Math.max(180, below - 8) }
      : { bottom: window.innerHeight - r.top + GAP, left, maxHeight: Math.max(180, r.top - GAP - 8) });
  };

  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    place();
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !popRef.current?.contains(t)) close();
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    // Follow the field if the page scrolls or the window changes size under the panel.
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = () => {
    if (open) { close(); return; }
    setVmo(p.mo ?? now.getMonth()); setVy(p.y ?? thisYear);
    setView("day"); setPickingEnd(false); setHover(null);
    setOpen(true);
  };

  const start = p.mo !== null && p.d !== null ? dayNum(p.y ?? thisYear, p.mo, p.d) : null;
  const end   = p.mo2 !== null && p.d2 !== null ? dayNum(p.y2 ?? p.y ?? thisYear, p.mo2, p.d2) : null;

  const pickDay = (day: number) => {
    const n = dayNum(vy, vmo, day);
    if (!pickingEnd || start === null || n < start) {
      // A first click (or one before the day just picked) starts over from this day.
      update({ y: vy, mo: vmo, d: day, y2: null, mo2: null, d2: null });
      setPickingEnd(true);
    } else {
      if (n > start) update({ y2: vy, mo2: vmo, d2: day });
      setPickingEnd(false);
    }
    setHover(null);
  };

  const firstDow = new Date(vy, vmo, 1).getDay();
  const daysInMo = new Date(vy, vmo + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: daysInMo }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);
  // The far end of the highlighted span: the saved last day, or — while one is being
  // chosen — the day under the pointer.
  const spanEnd = end ?? (pickingEnd && hover !== null && start !== null && hover > start ? hover : null);

  const text = formatApptParts({ ...p, from: "", to: "", note: "" });
  const hdrBtn: React.CSSProperties = {
    flex: 1, fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600,
    background: "none", border: "none", cursor: "pointer", color: "var(--foreground)",
    padding: "4px 6px", borderRadius: 6,
  };
  const pickCell = (sel: boolean): React.CSSProperties => ({
    padding: "8px 4px", borderRadius: 6, border: "none", fontFamily: "var(--font-sans)", fontSize: 12,
    backgroundColor: sel ? "var(--primary)" : "transparent", color: sel ? "#fff" : "var(--foreground)",
    fontWeight: sel ? 600 : 400, cursor: "pointer",
  });
  const hint: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 11.5, color: "var(--muted-foreground)", lineHeight: 1.4 };

  return (
    <div style={{ position: "relative" }}>
      <button ref={btnRef} type="button" onClick={toggle} aria-haspopup="dialog" aria-expanded={open} aria-label={label} title={text || undefined}
        style={{ ...fieldBox(open), display: "flex", alignItems: "center", gap: 7, width: "100%", padding: text ? "0 26px 0 9px" : "0 9px", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: 13, textAlign: "left", color: text ? "var(--foreground)" : "var(--muted-foreground)" }}>
        <CalendarDays size={13} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: text ? "var(--font-mono)" : undefined }}>
          {text || "Date"}
        </span>
      </button>
      {/* A sibling of the field's button, not a child — a button can't contain a button. */}
      {text && (
        <button type="button" aria-label="Clear date" title="Clear date" onClick={() => { update(NO_DATES); setOpen(false); }}
          style={{ position: "absolute", right: 7, top: "50%", transform: "translateY(-50%)", display: "flex", padding: 0, border: "none", background: "none", color: "var(--muted-foreground)", cursor: "pointer" }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "#EF4444"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--muted-foreground)"; }}>
          <X size={13} />
        </button>
      )}

      {open && createPortal(
        <div ref={popRef} role="dialog" aria-label={label} style={{
          position: "fixed", ...pos, zIndex: 9000, width: APPT_POP_W, padding: 12, boxSizing: "border-box", overflowY: "auto",
          backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, boxShadow: "0 10px 28px rgba(0,0,0,0.16)",
          display: "flex", flexDirection: "column", gap: 10,
        }}>
          <div>
            {view === "day" && (<>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
                <button type="button" aria-label="Previous month" style={NAV_BTN} onClick={() => { const n = new Date(vy, vmo - 1); setVmo(n.getMonth()); setVy(n.getFullYear()); }}>‹</button>
                <button type="button" style={hdrBtn} onClick={() => setView("month")}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--muted)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >{CAL_MONTHS[vmo]} {vy}</button>
                <button type="button" aria-label="Next month" style={NAV_BTN} onClick={() => { const n = new Date(vy, vmo + 1); setVmo(n.getMonth()); setVy(n.getFullYear()); }}>›</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginBottom: 4 }}>
                {CAL_DAYS.map((n) => <div key={n} style={{ textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 600, color: "var(--muted-foreground)", padding: "2px 0" }}>{n}</div>)}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", rowGap: 2 }} onMouseLeave={() => setHover(null)}>
                {cells.map((day, ci) => {
                  if (!day) return <span key={ci} />;
                  const n = dayNum(vy, vmo, day);
                  const isStart = n === start, isEnd = n === spanEnd;
                  const inSpan  = start !== null && spanEnd !== null && n > start && n < spanEnd;
                  const edge    = isStart || isEnd;
                  const isToday = day === now.getDate() && vmo === now.getMonth() && vy === thisYear;
                  // The span reads as one bar: square where it continues, rounded where it stops.
                  const joinL = (inSpan || isEnd) && spanEnd !== null && ci % 7 !== 0 && n !== start;
                  const joinR = (inSpan || (isStart && spanEnd !== null)) && ci % 7 !== 6;
                  return (
                    <button key={ci} type="button" onClick={() => pickDay(day)} onMouseEnter={() => setHover(n)}
                      aria-pressed={edge || inSpan}
                      style={{ height: 30, border: "none", padding: 0, fontFamily: "var(--font-sans)", fontSize: 12, cursor: "pointer",
                        borderRadius: `${joinL ? 0 : 6}px ${joinR ? 0 : 6}px ${joinR ? 0 : 6}px ${joinL ? 0 : 6}px`,
                        backgroundColor: edge ? "var(--primary)" : inSpan ? "var(--primary-soft)" : hover === n ? "var(--muted)" : "transparent",
                        color: edge ? "#fff" : isToday ? "var(--primary)" : "var(--foreground)",
                        fontWeight: edge || isToday ? 600 : 400,
                      }}
                    >{day}</button>
                  );
                })}
              </div>
            </>)}

            {view === "month" && (<>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
                <button type="button" aria-label="Previous year" style={NAV_BTN} onClick={() => setVy((y) => y - 1)}>‹</button>
                <button type="button" style={hdrBtn} onClick={() => { setYPage(Math.floor(vy / 12) * 12); setView("year"); }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--muted)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >{vy}</button>
                <button type="button" aria-label="Next year" style={NAV_BTN} onClick={() => setVy((y) => y + 1)}>›</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 4 }}>
                {CAL_MONTHS.map((m, mi) => (
                  <button key={m} type="button" onClick={() => { setVmo(mi); setView("day"); }} style={pickCell(mi === vmo)}
                    onMouseEnter={(e) => { if (mi !== vmo) e.currentTarget.style.backgroundColor = "var(--muted)"; }}
                    onMouseLeave={(e) => { if (mi !== vmo) e.currentTarget.style.backgroundColor = "transparent"; }}
                  >{m.slice(0, 3)}</button>
                ))}
              </div>
            </>)}

            {view === "year" && (<>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
                <button type="button" aria-label="Earlier years" style={NAV_BTN} onClick={() => setYPage((y) => y - 12)}>‹</button>
                <span style={{ flex: 1, textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>{yPage}–{yPage + 11}</span>
                <button type="button" aria-label="Later years" style={NAV_BTN} onClick={() => setYPage((y) => y + 12)}>›</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 4 }}>
                {Array.from({ length: 12 }, (_, i) => yPage + i).map((y) => (
                  <button key={y} type="button" onClick={() => { setVy(y); setYPage(Math.floor(y / 12) * 12); setView("month"); }} style={{ ...pickCell(y === vy), fontFamily: "var(--font-mono)" }}
                    onMouseEnter={(e) => { if (y !== vy) e.currentTarget.style.backgroundColor = "var(--muted)"; }}
                    onMouseLeave={(e) => { if (y !== vy) e.currentTarget.style.backgroundColor = "transparent"; }}
                  >{y}</button>
                ))}
              </div>
            </>)}
          </div>

          <div style={hint}>
            {pickingEnd ? "Click a later day to make it a date range — or leave it as one day." : "Click a day. Click a second, later day for a date range."}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <button type="button" onClick={() => { update(NO_DATES); setPickingEnd(false); }} disabled={!text}
              style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, fontWeight: 500, height: 30, padding: "0 10px", borderRadius: 7, border: "none", background: "none", color: "var(--muted-foreground)", cursor: text ? "pointer" : "default", opacity: text ? 1 : 0.5 }}>
              Clear
            </button>
            <button type="button" onClick={close}
              style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, fontWeight: 600, height: 30, padding: "0 16px", borderRadius: 7, border: "none", backgroundColor: "var(--primary)", color: "var(--primary-foreground)", cursor: "pointer" }}>
              Done
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── Number field ─────────────────────────────────────────────────────────────

// A plain text box for an amount, in place of the browser's number input (no spinner
// arrows, no scroll-wheel changes). A zero shows as an empty box with a "0" placeholder,
// so typing into it replaces the value instead of producing "05". While focused it holds
// exactly what was typed; on leaving it shows the number with thousands separators.
function NumberField({ value, onChange, prefix, suffix, decimals = 2, label, busy = false, onClear, mono = true }: {
  value: number | undefined;
  onChange: (n: number) => void;
  prefix?: string; suffix?: string;
  decimals?: number;        // 0 for whole numbers (miles)
  label: string;
  busy?: boolean;           // a background calculation is filling this in
  onClear?: () => void;     // shows an × that empties the field
  mono?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState("");
  const shown = value ? value.toLocaleString("en-US", { maximumFractionDigits: decimals }) : "";
  const clearable = !!onClear && !!value && !busy;

  return (
    <div style={{ ...fieldBox(focused), display: "flex", alignItems: "center", gap: 4, padding: "0 10px", width: "100%" }}>
      {prefix && <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--muted-foreground)", flexShrink: 0 }}>{prefix}</span>}
      <input
        value={focused ? text : shown}
        aria-label={label}
        placeholder="0"
        inputMode={decimals > 0 ? "decimal" : "numeric"}
        autoComplete="off"
        onFocus={(e) => { setText(value ? String(value) : ""); setFocused(true); requestAnimationFrame(() => e.target.select()); }}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          let t = e.target.value.replace(decimals > 0 ? /[^0-9.]/g : /[^0-9]/g, "");
          // One decimal point, and no more decimals than the field holds.
          const dot = t.indexOf(".");
          if (dot !== -1) t = t.slice(0, dot + 1) + t.slice(dot + 1).replace(/\./g, "").slice(0, decimals);
          setText(t);
          onChange(Number(t) || 0);
        }}
        onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
        style={{ flex: 1, minWidth: 0, height: "100%", border: "none", outline: "none", background: "transparent", padding: 0, color: "var(--foreground)", fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)", fontSize: 13 }}
      />
      {suffix && <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", flexShrink: 0 }}>{suffix}</span>}
      {busy && <span style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid var(--border)", borderTopColor: "var(--muted-foreground)", animation: "spin 0.7s linear infinite", flexShrink: 0, boxSizing: "border-box" }} />}
      {clearable && (
        <button type="button" aria-label={`Clear ${label.toLowerCase()}`} title="Clear" onClick={onClear}
          style={{ display: "flex", padding: 0, border: "none", background: "none", color: "var(--muted-foreground)", cursor: "pointer", flexShrink: 0 }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "#EF4444"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "var(--muted-foreground)"; }}>
          <X size={13} />
        </button>
      )}
    </div>
  );
}

function ordinal(n: number): string {
  const s = ["th","st","nd","rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ─── Load form (full page) ────────────────────────────────────────────────────

// Each stop row gets a stable client-side key. Keyed by position, a reorder or a removal
// handed one row's address box (and its open suggestions) to its neighbour.
let stopKeySeq = 0;
const newStopKey = () => `stop-${++stopKeySeq}`;
// The stop row: handle, letter, address, date, time, remove. Shared by the rows and the
// heading above them so the columns line up.
const STOP_COLS = "16px 22px minmax(200px, 1.4fr) minmax(170px, 1fr) minmax(200px, 1fr) 30px";
// A, B, C … — the letter a stop carries in the form, in the summary and on the map.
const stopLetter = (i: number) => String.fromCharCode(65 + (i % 26));

function LoadForm({ load, onCancel, onSave, saving = false, error, startDirty = false, onDirtyChange, onExtract }: {
  load: Partial<Load>;
  onCancel: () => void;
  onSave: (l: Load) => void;
  saving?: boolean;
  error?: string | null;
  startDirty?: boolean;                     // the form opens holding unsaved work (an extracted draft)
  onDirtyChange?: (dirty: boolean) => void; // lets the page guard against leaving with changes
  onExtract?: () => void;                   // offer "fill from a rate confirmation" (create only)
}) {
  const [form, setForm] = useState<Partial<Load>>(load);
  const set = <K extends keyof Load>(k: K, v: Load[K]) => setForm((f) => ({ ...f, [k]: v }));
  const isNew = !load.id;

  // All locations in one unified array: [stop1 (origin), stop2, ..., stopN (destination)].
  // load.stops is the route exactly as the backend sent it; a new load starts with two
  // blank stops (origin + destination placeholders).
  const [stops, setStops] = useState<Stop[]>(() => {
    if (load.stops && load.stops.length > 0) return load.stops.map((s) => ({ ...s, k: newStopKey() }));
    return [
      { city: "", done: false, appt: "", k: newStopKey() },
      { city: "", done: false, appt: "", k: newStopKey() },
    ];
  });

  const [recalcing, setRecalcing]   = useState(false);
  const [milesNote, setMilesNote]   = useState<string | null>(null);

  // ── Deadhead ──────────────────────────────────────────────────────────────
  const [dhBusy, setDhBusy] = useState(false);
  const [dhNote, setDhNote] = useState<string | null>(null);

  const firstStopCity   = (stops[0]?.city ?? "").trim();
  const canCalcDeadhead = !!form.driver_id && !!firstStopCity;

  // Measure the empty run: from wherever the driver will be when they start this load
  // (their previous delivery, or their current position if the deck is empty) to this
  // load's first stop. Never silently overwrites — the dispatcher clicks for it, and the
  // field stays editable afterwards.
  const calcDeadhead = async () => {
    if (!canCalcDeadhead || dhBusy) return;
    setDhBusy(true); setDhNote(null);
    try {
      const anchor = await resolveDeadheadAnchor(form.driver_id!);
      if (!anchor) { setDhNote("Couldn't work out where the driver starts from — enter it manually."); return; }

      const dest = stops[0].lat != null && stops[0].lng != null
        ? { lat: stops[0].lat!, lng: stops[0].lng! }
        : await geocodeCity(firstStopCity);
      if (!dest) { setDhNote("Couldn't locate the first stop — enter it manually."); return; }

      const mi = await routeMiles([anchor.point, dest]);
      if (mi == null) { setDhNote("Couldn't measure the distance — enter it manually."); return; }

      set("deadheadMiles", mi);
      setDhNote(`From: ${anchor.label} — ${anchor.from}`);
    } catch {
      setDhNote("Couldn't measure the distance — enter it manually.");
    } finally {
      setDhBusy(false);
    }
  };

  // Drag-to-reorder stops. grabIdx makes only the grip handle a drag source (so the
  // city inputs stay normally interactive); dragIdx/overIdx drive the visual feedback.
  const [grabIdx, setGrabIdx] = useState<number | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);
  const resetDrag = () => { setGrabIdx(null); setDragIdx(null); setOverIdx(null); };
  // Move the dragged stop to the drop position (shifting the rest); the new order is
  // exactly what we send to the backend as the stops array — no order id needed.
  const moveStop = (from: number, to: number) => {
    if (from === to) return;
    setStops((p) => {
      const next = [...p];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    recalcSoon(); // route order changed → recompute miles
  };

  const addStop    = () => setStops((p) => [...p, { city: "", done: false, appt: "", k: newStopKey() }]);
  const removeStop = (idx: number) => { setStops((p) => p.filter((_, i) => i !== idx)); recalcSoon(); };
  // Free typing: keep the raw text for the input (so ", " survives mid-typing), and
  // split it into street/city/state underneath. Drop the cached coords — the address
  // just changed and they may no longer match.
  const updateAddress = (idx: number, text: string) => {
    const p = parseAddress(text);
    setStops((prev) => prev.map((s, i) => i === idx ? { ...s, ...p, text, lat: undefined, lng: undefined } : s));
  };
  // A picked suggestion gives the fields already split AND precise coords — take both
  // (no need to wait for blur to re-geocode). The display text becomes the clean join.
  const selectAddress = (idx: number, parts: AddressParts, lat: number, lng: number) => {
    setStops((prev) => prev.map((s, i) => i === idx ? { ...s, ...parts, text: joinAddress(parts), lat, lng } : s));
    recalcSoon();
  };
  const updateAppt = (idx: number, val: string) => setStops((p) => p.map((s, i) => i === idx ? { ...s, appt: val } : s));

  // Latest stops, so the debounced calc always reads fresh values (no stale closure).
  const stopsRef = useRef(stops);
  stopsRef.current = stops;

  // The ordered list of non-empty addresses — the only thing a mileage calc depends on.
  // Keyed on the full one-liner so a street/state change re-triggers the recalc, not just
  // a city change (two stops in the same city but different streets are different points).
  const routeSig = (arr: Stop[]) => arr.filter((s) => s.city.trim()).map((s) => joinAddress(s).toLowerCase()).join(" → ");

  // Guards so mileage recalculation is safe to trigger from anywhere:
  //  · runIdRef — only the newest run is allowed to write state (older runs bail out)
  //  · abortRef — the newest run cancels the previous one's in-flight requests
  //  · lastSigRef — skip work entirely when the route hasn't changed since we last computed
  const runIdRef   = useRef(0);
  const abortRef   = useRef<AbortController | null>(null);
  const lastSigRef = useRef(routeSig(stops));

  // Geocode any filled stop missing coords (sequentially — Nominatim throttles bursts),
  // then route them for the miles total. Fully guarded: always clears the spinner, never
  // lets a stale run clobber a newer result, and times out instead of hanging.
  const computeMiles = async () => {
    const filled = stopsRef.current.filter((s) => s.city.trim());
    const sig = routeSig(stopsRef.current);
    if (sig === lastSigRef.current) return;           // route unchanged — nothing to do
    lastSigRef.current = sig;

    // The route changed, so any run still in flight is now stale — cancel it and claim the turn.
    const runId = ++runIdRef.current;
    abortRef.current?.abort();
    const ctl = abortRef.current = new AbortController();
    const isStale = () => runId !== runIdRef.current;

    if (filled.length < 2) { setMilesNote(null); setRecalcing(false); return; }

    setRecalcing(true);
    setMilesNote(null);
    try {
      // Geocode the full one-liner (street + city + state) — far more precise than the
      // bare city, and the key we cache against.
      const resolved: Array<{ key: string; lat: number | null; lng: number | null }> = [];
      for (const s of filled) {
        const key = joinAddress(s);
        if (s.lat != null && s.lng != null) { resolved.push({ key, lat: s.lat, lng: s.lng }); continue; }
        const c = await geocodeCity(key, ctl.signal);
        if (isStale()) return;                          // a newer run superseded us
        resolved.push({ key, lat: c?.lat ?? null, lng: c?.lng ?? null });
      }

      // Cache freshly geocoded coords back onto the stops so we don't re-geocode them.
      setStops((prev) => prev.map((s) => {
        if (s.lat != null || !s.city.trim()) return s;
        const hit = resolved.find((r) => r.lat != null && r.key === joinAddress(s));
        return hit ? { ...s, lat: hit.lat!, lng: hit.lng! } : s;
      }));

      const coords = resolved.filter((r) => r.lat != null).map((r) => ({ lat: r.lat!, lng: r.lng! }));
      if (coords.length < 2) { setMilesNote("Couldn't locate the stops — enter miles manually."); return; }

      const mi = await routeMiles(coords, ctl.signal);
      if (isStale()) return;
      if (mi != null) {
        set("totalMiles", mi);
        setMilesNote(coords.length < filled.length ? "Some stops couldn't be located — distance is approximate." : null);
      } else {
        setMilesNote("Couldn't calculate distance — enter miles manually.");
      }
    } finally {
      if (!isStale()) setRecalcing(false);              // only the newest run owns the spinner
    }
  };

  // Recalc is triggered by discrete events (dropdown pick, blur, stop removed) rather than
  // every keystroke, so an in-progress, unselected city like "Housto" never gets geocoded.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const recalcSoon = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => { void computeMiles(); }, 300);
  };
  useEffect(() => () => { if (debounceRef.current) clearTimeout(debounceRef.current); abortRef.current?.abort(); }, []);


  // What the user has entered, as one comparable string. Coordinates are left out: they
  // are filled in by geocoding in the background, which is not an edit.
  const snapshot = JSON.stringify([form, stops.map((s) => [s.street ?? "", s.city, s.state ?? "", s.appt ?? ""])]);
  const initialSnapshot = useRef(snapshot);
  const dirty = startDirty || snapshot !== initialSnapshot.current;
  useEffect(() => { onDirtyChange?.(dirty); }, [dirty]); // eslint-disable-line react-hooks/exhaustive-deps

  // Required: a load ID, and a pickup and a delivery (the first and last rows).
  const [submitted, setSubmitted] = useState(false);
  const loadIdMissing = !form.loadId?.trim();
  const routeMissing  = !stops[0]?.city.trim() || !stops[stops.length - 1]?.city.trim();

  // Stops that have been located, each with the letter of its row.
  const mapPoints: RoutePoint[] = stops.flatMap((st, i) =>
    st.lat != null && st.lng != null ? [{ lat: st.lat, lng: st.lng, label: stopLetter(i), title: cityState(st) }] : []);

  const handleSave = () => {
    setSubmitted(true);
    if (loadIdMissing || routeMissing) return;
    // Send the full route as one stops array (stops[0] = origin … last = destination).
    // Appointments are free text with no ordering/past rules, so there's nothing to check.
    const filled = stops.filter((s) => s.city.trim());
    onSave({ ...form, loadId: form.loadId!.trim(), stops: filled } as Load);
  };

  const inputStyle: React.CSSProperties = {
    fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 10px",
    borderRadius: 8, height: 36, border: "1px solid var(--border)",
    backgroundColor: "var(--card)", color: "var(--foreground)",
    outline: "none", width: "100%", boxSizing: "border-box",
    transition: "border-color 0.15s, box-shadow 0.15s",
  };
  const labelStyle = { display: "flex" as const, flexDirection: "column" as const, gap: 5, minWidth: 0 };
  const capStyle: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 12.5, fontWeight: 600, color: "var(--foreground)" };
  const hintStyle: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 11.5, color: "var(--muted-foreground)", lineHeight: 1.4 };
  const errStyle: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 11.5, color: "#EF4444" };
  const focusInput = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.boxShadow = "0 0 0 3px var(--primary-soft)"; };
  const blurInput  = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; };
  const cardStyle: React.CSSProperties = { backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 };
  const secTitle: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 700, color: "var(--foreground)" };
  const fieldGrid: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "12px 14px" };
  const btnBase: React.CSSProperties = { display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, height: 34, padding: "0 16px", borderRadius: 8, whiteSpace: "nowrap" };
  const spinner = (
    <span style={{ position: "absolute", right: 10, top: "50%", marginTop: -7, boxSizing: "border-box", width: 14, height: 14, borderRadius: "50%", border: "2px solid var(--border)", borderTopColor: "var(--muted-foreground)", animation: "spin 0.7s linear infinite", display: "block", pointerEvents: "none" }} />
  );

  // Summary figures. Rate per mile divides by the distance actually driven — loaded plus
  // empty — the same span the Gross page and driver pay use.
  const loaded   = form.totalMiles ?? 0;
  const empty    = form.deadheadMiles ?? 0;
  const distance = loaded + empty;
  const rate     = form.payout ?? 0;
  const perMile  = distance > 0 ? rate / distance : 0;
  const kv = (label: string, value: string) => (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, fontFamily: "var(--font-sans)", fontSize: 13 }}>
      <span style={{ color: "var(--muted-foreground)" }}>{label}</span>
      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--foreground)" }}>{value}</span>
    </div>
  );
  const letterBadge = (i: number, size = 20) => (
    <span style={{ width: size, height: size, borderRadius: "50%", backgroundColor: "var(--primary)", color: "#fff", fontFamily: "var(--font-sans)", fontSize: size >= 20 ? 11 : 10.5, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {stopLetter(i)}
    </span>
  );
  const saveLabel = saving ? "Saving…" : isNew ? "Create load" : "Save changes";
  const saveBtn = () => (
    <button onClick={handleSave} disabled={saving}
      style={{ ...btnBase, border: "none", backgroundColor: "var(--primary)", color: "var(--primary-foreground)", cursor: saving ? "default" : "pointer", opacity: saving ? 0.7 : 1 }}>
      <Check size={14} /> {saveLabel}
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "var(--background)", overflow: "hidden" }}>

      {/* Header: where you are, and the two ways out */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "10px 24px", backgroundColor: "var(--card)", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <button onClick={onCancel}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer", padding: "4px 7px", borderRadius: 6 }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--muted)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}>
            <ArrowLeft size={14} /> Loads
          </button>
          <span style={{ color: "var(--border)", userSelect: "none" }}>/</span>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 17, fontWeight: 700, color: "var(--foreground)", letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {isNew ? "New load" : `Edit ${load.loadId || "load"}`}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button onClick={onCancel} disabled={saving}
            style={{ ...btnBase, fontWeight: 500, border: "1px solid var(--border)", backgroundColor: "var(--card)", color: "var(--foreground)", cursor: saving ? "default" : "pointer", opacity: saving ? 0.5 : 1 }}>
            Cancel
          </button>
          {saveBtn()}
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 28px", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1280, margin: "0 auto", minWidth: 0 }}>

          {isNew && onExtract && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px 14px", flexWrap: "wrap", padding: "12px 14px", border: "1px dashed var(--switch-background)", borderRadius: 10, backgroundColor: "var(--card)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <Sparkles size={16} style={{ color: "var(--primary)", flexShrink: 0 }} />
                <div>
                  <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>Have a rate confirmation?</div>
                  <div style={hintStyle}>Upload the PDF and the form fills itself in. You check it before saving.</div>
                </div>
              </div>
              <button onClick={onExtract}
                style={{ ...btnBase, height: 32, fontSize: 12.5, border: "1px solid var(--border)", backgroundColor: "var(--card)", color: "var(--foreground)", cursor: "pointer" }}>
                <Upload size={13} /> Upload PDF
              </button>
            </div>
          )}

          {/* Top row: what the load is and who runs it, with the route map beside it */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]" style={{ gap: 14, alignItems: "stretch" }}>
            {/* Load */}
            <div style={cardStyle}>
              <div style={secTitle}>Load</div>
              <div className="grid grid-cols-1 sm:grid-cols-3" style={{ gap: "12px 14px" }}>
                <label style={labelStyle}>
                  <span style={capStyle}>Load ID <span style={{ color: "#EF4444" }}>*</span></span>
                  <input value={form.loadId ?? ""} onChange={(e) => set("loadId", e.target.value)} placeholder="LD-00000" autoFocus={isNew} {...NO_AUTOFILL}
                    style={{ ...inputStyle, fontFamily: "var(--font-mono)", borderColor: submitted && loadIdMissing ? "#EF4444" : "var(--border)" }}
                    onFocus={focusInput} onBlur={(e) => { blurInput(e); if (submitted && loadIdMissing) e.currentTarget.style.borderColor = "#EF4444"; }} />
                  {submitted && loadIdMissing && <span style={errStyle}>Load ID is required.</span>}
                </label>
                <label style={labelStyle}>
                  <span style={capStyle}>Broker</span>
                  <input value={form.broker ?? ""} onChange={(e) => set("broker", e.target.value)} {...NO_AUTOFILL} style={inputStyle} onFocus={focusInput} onBlur={blurInput} />
                </label>
                <div style={labelStyle}>
                  <span style={capStyle}>Rate</span>
                  <NumberField label="Rate" prefix="$" value={form.payout} onChange={(n) => set("payout", n)} />
                </div>
                {/* Driver + Dispatcher — backend-paginated, infinite-scroll */}
                <div style={labelStyle}>
                  <span style={capStyle}>Driver</span>
                  <AsyncSearchableSelect
                    plain
                    value={form.driver_id ?? ""}
                    valueLabel={form.driver ?? ""}
                    fetchPage={async (q, p) => {
                      const { items, total } = await api.getList<any>("/drivers", { q: q || undefined, page: p, page_size: 20 });
                      return { items: (items ?? []).map((d: any) => ({ value: d.id, label: driverDisplayName(d) })), total };
                    }}
                    onChange={(id, label) => setForm((f) => ({ ...f, driver_id: id, driver: label }))}
                    placeholder="Select driver…"
                    icon={<User size={13} />}
                  />
                </div>
                <div style={labelStyle}>
                  <span style={capStyle}>Dispatcher</span>
                  <AsyncSearchableSelect
                    plain
                    value={form.dispatcher_id ?? ""}
                    valueLabel={form.dispatcher ?? ""}
                    // Company-plane read (users.read) — the owner-only /owner/* surface 403s for
                    // dispatchers, which left this select empty for exactly the people using it.
                    // ?role=dispatcher narrows it to who can actually be assigned: the owner plus
                    // everyone on the built-in Dispatcher role (the backend rejects anyone else).
                    // It's a bounded pick-list and the docs define no ?q=/paging on it, so fetch
                    // the whole list (omitting page_size returns all) and match here — passing a
                    // query the endpoint ignores would look like search while filtering nothing.
                    fetchPage={async (q) => {
                      const rows = await api.get<any[]>("/company/users?role=dispatcher");
                      const needle = q.trim().toLowerCase();
                      const opts = (rows ?? [])
                        .map((u: any) => ({ value: u.id, label: u.full_name ?? u.login ?? u.id }))
                        .filter((o) => !needle || o.label.toLowerCase().includes(needle));
                      return { items: opts, total: opts.length };
                    }}
                    onChange={(id, label) => setForm((f) => ({ ...f, dispatcher_id: id, dispatcher: label }))}
                    placeholder="Select dispatcher…"
                    icon={<User size={13} />}
                  />
                </div>
                {/* Status (hidden on create). A queued/next load has no status — show it
                    blank rather than a fake "reserved", and only send one if the user picks it. */}
                {!isNew && (
                  <div style={labelStyle}>
                    <span style={capStyle}>Status</span>
                    <CustomSelect plain value={form.status ?? ""} options={STATUS_MODAL_OPTS} onChange={(v) => set("status", v as Status)} />
                  </div>
                )}
              </div>
            </div>

            {/* The stops on a map. It takes the height of the card beside it — never more. */}
            <div style={{ minWidth: 0, minHeight: 200 }}>
              <RouteMap points={mapPoints} height="fill" />
            </div>
          </div>

            {/* Route — unified stop list */}
            <div style={cardStyle}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                <span style={secTitle}>Route</span>
                <span style={hintStyle}>Drag the handle to reorder · pick a second day for a date range · fill in "To" for a time window</span>
              </div>

              <div style={{ overflowX: "auto" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, minWidth: 700 }}>
                  {/* One heading per column, instead of a label over every box */}
                  <div style={{ display: "grid", gridTemplateColumns: STOP_COLS, gap: 8, ...capStyle }}>
                    <span /><span />
                    <span>Address <span style={{ color: "#EF4444" }}>*</span></span>
                    <span>Date</span>
                    <span>Time</span>
                    <span />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {stops.map((stop, idx) => {
                      const isFirst = idx === 0;
                      const isLast  = idx === stops.length - 1;
                      const needed  = submitted && (isFirst || isLast) && !stop.city.trim();
                      // The appointment text, as parts — each field edits its own part.
                      const appt    = parseAppt(stop.appt);
                      const setAppt = (patch: Partial<ApptParts>) => updateAppt(idx, formatApptParts({ ...appt, ...patch, note: "" }));

                      return (
                        <div
                          key={stop.k}
                          draggable={grabIdx === idx}
                          onDragStart={() => setDragIdx(idx)}
                          onDragEnd={resetDrag}
                          onDragOver={(e) => { if (dragIdx !== null) { e.preventDefault(); setOverIdx(idx); } }}
                          onDrop={(e) => { e.preventDefault(); if (dragIdx !== null) moveStop(dragIdx, idx); resetDrag(); }}
                          style={{
                            display: "grid", gridTemplateColumns: STOP_COLS, alignItems: "start", gap: 8, borderRadius: 8,
                            opacity: dragIdx === idx ? 0.4 : 1,
                            outline: overIdx === idx && dragIdx !== null && dragIdx !== idx ? "2px dashed var(--primary)" : "none",
                            outlineOffset: 3,
                            transition: "opacity 0.12s",
                          }}
                        >
                          {/* Drag handle */}
                          <div
                            onMouseDown={() => setGrabIdx(idx)}
                            onMouseUp={() => setGrabIdx(null)}
                            title="Drag to reorder"
                            style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 36, cursor: "grab", color: "var(--muted-foreground)" }}
                          >
                            <GripVertical size={14} />
                          </div>

                          {/* Letter — the same one this stop carries on the map */}
                          <div style={{ display: "flex", alignItems: "center", height: 36 }}>{letterBadge(idx)}</div>

                          {/* Location field */}
                          <div style={{ minWidth: 0 }}>
                            <AddressAutocomplete
                              value={stop.text ?? joinAddress(stop)}
                              placeholder={isFirst ? "Pickup address or City, ST" : isLast ? "Delivery address or City, ST" : "Stop address or City, ST"}
                              onChange={(v) => updateAddress(idx, v)}
                              onSelect={(parts, lat, lng) => selectAddress(idx, parts, lat, lng)}
                              style={{ ...inputStyle, borderColor: needed ? "#EF4444" : "var(--border)" }}
                              onFocus={focusInput}
                              onBlur={(e) => { blurInput(e); recalcSoon(); }}
                            />
                          </div>

                          {/* Appointment day — one day, or a range of days */}
                          <div style={{ minWidth: 0 }}>
                            <DateRangeField label={`Appointment date for stop ${stopLetter(idx)}`} p={appt} onDates={setAppt} />
                            {appt.note && (
                              <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, ...hintStyle }}>
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>As written: <span style={{ fontFamily: "var(--font-mono)", color: "var(--foreground)" }}>{appt.note}</span></span>
                                <button type="button" aria-label="Remove this appointment text" title="Remove" onClick={() => updateAppt(idx, "")}
                                  style={{ display: "flex", padding: 0, border: "none", background: "none", color: "var(--muted-foreground)", cursor: "pointer", flexShrink: 0 }}>
                                  <X size={12} />
                                </button>
                              </div>
                            )}
                          </div>

                          {/* Appointment time — one time, or a window when "To" is filled in */}
                          <div style={{ minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <TimeField wide value={appt.from} onChange={(from) => setAppt({ from })} placeholder="From" label={`Appointment time for stop ${stopLetter(idx)}, or the start of a window`} />
                              <span style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-sans)", fontSize: 13 }}>–</span>
                              <TimeField wide value={appt.to} onChange={(to) => setAppt({ to })} placeholder="To" label={`End of the appointment window for stop ${stopLetter(idx)} (optional)`} />
                            </div>
                          </div>

                          {/* Remove */}
                          <button
                            onClick={() => removeStop(idx)}
                            disabled={stops.length <= 2}
                            aria-label={`Remove stop ${stopLetter(idx)}`}
                            title={stops.length <= 2 ? "A load needs at least two stops" : "Remove this stop"}
                            style={{
                              width: 30, height: 36, borderRadius: 7, border: "none", backgroundColor: "transparent",
                              color: "var(--muted-foreground)", cursor: stops.length <= 2 ? "default" : "pointer",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              opacity: stops.length <= 2 ? 0.3 : 1,
                            }}
                            onMouseEnter={(e) => { if (stops.length > 2) { e.currentTarget.style.backgroundColor = "rgba(239,68,68,0.12)"; e.currentTarget.style.color = "#EF4444"; } }}
                            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "var(--muted-foreground)"; }}
                          >
                            <X size={14} />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {submitted && routeMissing && <span style={errStyle}>A load needs a pickup and a delivery.</span>}

                  <div>
                    <button onClick={addStop} style={{
                      display: "inline-flex", alignItems: "center", gap: 6, padding: "6px 12px",
                      border: "1px dashed var(--switch-background)", borderRadius: 8, backgroundColor: "transparent",
                      fontFamily: "var(--font-sans)", fontSize: 12.5, fontWeight: 600, color: "var(--muted-foreground)", cursor: "pointer",
                    }}
                      onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.color = "var(--primary)"; }}
                      onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--switch-background)"; e.currentTarget.style.color = "var(--muted-foreground)"; }}
                    >
                      <Plus size={13} /> Add stop
                    </button>
                  </div>
                </div>
              </div>
            </div>

          {/* The numbers */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]" style={{ gap: 14, alignItems: "stretch" }}>
            {/* Distance */}
            <div style={cardStyle}>
              <div style={secTitle}>Distance</div>
              <div style={fieldGrid}>
                <div style={labelStyle}>
                  <span style={capStyle}>Loaded miles</span>
                  <NumberField label="Loaded miles" suffix="mi" decimals={0} busy={recalcing} value={form.totalMiles} onChange={(n) => set("totalMiles", n)} />
                  <span style={hintStyle}>{milesNote ?? "Worked out from the route when it changes. You can type over it."}</span>
                </div>

                {/* Deadhead — the empty run to this load's pickup. Kept separate from Miles
                    because the backend derives total_miles = miles + deadhead itself. */}
                <div style={labelStyle}>
                  <span style={capStyle}>Deadhead miles</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <NumberField label="Deadhead miles" suffix="mi" decimals={0} busy={dhBusy} value={form.deadheadMiles}
                        onChange={(n) => set("deadheadMiles", n)}
                        // Taking the deadhead off again is one click, and drops the "From: …" note with it.
                        onClear={() => { set("deadheadMiles", 0); setDhNote(null); }} />
                    </div>
                    <button
                      type="button"
                      onClick={calcDeadhead}
                      disabled={!canCalcDeadhead || dhBusy}
                      title={
                        !form.driver_id ? "Pick a driver first — deadhead is measured from where they'll be"
                        : !firstStopCity ? "Enter the pickup first"
                        : "Measure from the driver's previous delivery (or their current location)"
                      }
                      style={{
                        ...btnBase, height: 36, padding: "0 12px", fontSize: 12.5, flexShrink: 0,
                        border: "1px solid var(--border)", backgroundColor: "var(--card)",
                        color: canCalcDeadhead && !dhBusy ? "var(--foreground)" : "var(--muted-foreground)",
                        cursor: canCalcDeadhead && !dhBusy ? "pointer" : "not-allowed",
                        opacity: canCalcDeadhead ? 1 : 0.55,
                      }}
                    >
                      {dhBusy ? "Measuring…" : "Calculate"}
                    </button>
                  </div>
                  <span style={{ ...hintStyle, color: dhNote && !dhNote.startsWith("From:") ? "#D97706" : "var(--muted-foreground)" }}>
                    {dhNote ?? "The empty run to the pickup. Calculate measures it from where the driver will be."}
                  </span>
                </div>
              </div>
            </div>

            <div style={cardStyle}>
              <div style={secTitle}>Summary</div>
              {kv("Loaded", `${loaded.toLocaleString()} mi`)}
              {kv("Deadhead", `${empty.toLocaleString()} mi`)}
              {kv("Total distance", `${distance.toLocaleString()} mi`)}
              <div style={{ height: 1, backgroundColor: "var(--border)" }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>Rate</span>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", color: "var(--foreground)", fontVariantNumeric: "tabular-nums" }}>${rate.toLocaleString()}</span>
              </div>
              {kv("Rate per mile", `$${perMile.toFixed(2)}`)}
            </div>
          </div>

          <FormError message={error} />
        </div>
      </div>
    </div>
  );
}

// ─── Load form page (/workspace/loads/new, /workspace/loads/:id/edit) ─────────

export function LoadFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const isNew = !id;
  const allowed = hasPerm(user, "loads", isNew ? "create" : "update");

  // A draft handed over by the list's "AI Smart Extract" arrives in the navigation state.
  const handedDraft = (location.state as { draft?: ExtractDraft } | null)?.draft;
  const [initial, setInitial]   = useState<Partial<Load> | null>(isNew ? (handedDraft ? draftToLoad(handedDraft) : {}) : null);
  // An extracted draft is unsaved work from the first moment — leaving must ask.
  const [fromDraft, setFromDraft] = useState(!!handedDraft);
  const [formKey, setFormKey]   = useState(0); // bumping it rebuilds the form around a new draft
  const [loadErr, setLoadErr]   = useState<string | null>(null);
  const [saving, setSaving]     = useState(false);
  const [saveErr, setSaveErr]   = useState<string | null>(null);
  const [dirty, setDirty]       = useState(false);
  const [extracting, setExtracting] = useState(false);
  // Set just before navigating away after a successful save, so that navigation isn't blocked.
  const savedRef = useRef(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    api.get<BackendLoad>(`/loads/${id}`)
      .then((b) => { if (!cancelled) setInitial(toLoad(b)); })
      .catch((e) => { if (!cancelled) setLoadErr(isForbidden(e) ? "You can't edit that load." : friendlyError(e, "Couldn't open that load.")); });
    return () => { cancelled = true; };
  }, [id]);

  // Unsaved work is protected two ways: in-app navigation (Back, the sidebar, Cancel) asks
  // first, and closing or reloading the tab triggers the browser's own prompt.
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    dirty && !savedRef.current && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const backToList = () => navigate("/workspace/loads");

  const save = async (l: Load) => {
    setSaving(true);
    setSaveErr(null);
    const load = withCompletedStops(l);
    try {
      if (isNew) {
        await api.post<BackendLoad>("/loads", toBackend(load, { create: true }));
        notify.success(`Load ${load.loadId || ""} created`);
      } else {
        // Changing driver_id is a queue move, not a field edit: the server detaches the
        // old driver (rotating their deck) and slots the load onto the new one, where
        // the slot — not us — decides the status. So don't re-assert the status we're
        // looking at unless the user actually picked a new one. It matters most on a
        // completed load: re-sending status:"completed" alongside a new driver_id is
        // precisely the request that re-attributes the payout to the new driver, and a
        // reassign shouldn't quietly move someone's money.
        const reassigning = load.driver_id !== (initial?.driver_id ?? "");
        const pickedStatus = load.status !== initial?.status;
        const body = toBackend(load, { omitStatus: reassigning && !pickedStatus });
        await api.put<BackendLoad>(`/loads/${load.id}`, body);
        notify.success(`Load ${load.loadId || ""} updated`);
      }
      savedRef.current = true;
      backToList();
    } catch (e) {
      setSaveErr(friendlyError(e, "Save failed")); // stay on the page
    } finally {
      setSaving(false);
    }
  };

  if (!allowed) return <Navigate to="/workspace/loads" replace />;

  if (loadErr) {
    return (
      <div style={{ height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 12, backgroundColor: "var(--background)" }}>
        <FormError message={loadErr} />
        <button onClick={backToList} style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border)", backgroundColor: "var(--card)", color: "var(--foreground)", cursor: "pointer" }}>
          Back to loads
        </button>
      </div>
    );
  }

  if (!initial) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "var(--background)" }}>
        <PageLoader label="load" />
      </div>
    );
  }

  return (
    <>
      <LoadForm
        key={formKey}
        load={initial}
        startDirty={fromDraft}
        onCancel={backToList}
        onSave={save}
        saving={saving}
        error={saveErr}
        onDirtyChange={setDirty}
        onExtract={() => setExtracting(true)}
      />

      {extracting && (
        <ExtractModal
          onClose={() => setExtracting(false)}
          onExtracted={(d) => {
            // The draft replaces whatever is in the form — rebuild it around the new values.
            setExtracting(false);
            setInitial(draftToLoad(d));
            setFromDraft(true);
            setFormKey((k) => k + 1);
          }}
        />
      )}

      {blocker.state === "blocked" && (
        <div role="dialog" aria-modal="true" aria-label="Unsaved changes" style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ backgroundColor: "var(--card)", borderRadius: 12, width: 380, maxWidth: "calc(100vw - 32px)", padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 700, color: "var(--foreground)", marginBottom: 6 }}>Leave without saving?</div>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.55, marginBottom: 20 }}>
              {isNew ? "This load hasn't been created yet. If you leave now, what you've entered is lost." : "Your changes to this load haven't been saved. If you leave now, they're lost."}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => blocker.reset()} autoFocus style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "8px 16px", borderRadius: 8, border: "1px solid var(--border)", backgroundColor: "var(--card)", color: "var(--foreground)", cursor: "pointer" }}>Keep editing</button>
              <button onClick={() => blocker.proceed()} style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "8px 16px", borderRadius: 8, border: "none", backgroundColor: "#EF4444", color: "#fff", cursor: "pointer" }}>Leave</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function DeleteConfirm({ label, onClose, onConfirm, busy = false, error }: { label: string; onClose: () => void; onConfirm: () => void; busy?: boolean; error?: string | null }) {
  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ backgroundColor: "var(--card)", borderRadius: 12, width: 360, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", textAlign: "center" }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", backgroundColor: "rgba(239,68,68,0.14)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
          <Trash2 size={20} color="#EF4444" />
        </div>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 600, color: "var(--foreground)", marginBottom: 6 }}>Delete load?</div>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)", marginBottom: error ? 12 : 20 }}>
          Load <strong>{label}</strong> will be permanently removed.
        </div>
        <FormError message={error} style={{ marginBottom: 16 }} />
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button onClick={onClose} disabled={busy} style={{ fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 20px", borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "var(--muted)", color: "var(--foreground)", cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1 }}>Cancel</button>
          <button onClick={onConfirm} disabled={busy} style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6, minWidth: 96, fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "7px 20px", borderRadius: 6, border: "none", backgroundColor: "#EF4444", color: "#fff", cursor: busy ? "default" : "pointer", opacity: busy ? 0.8 : 1 }}>
            {busy ? <><span style={{ width: 13, height: 13, borderRadius: "50%", border: "2px solid rgba(255,255,255,0.4)", borderTopColor: "#fff", animation: "spin 0.7s linear infinite", display: "inline-block" }} /> Deleting…</> : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Load Detail ──────────────────────────────────────────────────────────────


interface HistoryChange { field: string; from: string | number | null; to: string | number | null; }
interface HistoryEvent {
  id: string; actor_name: string; action: "create" | "update" | "delete";
  changes: HistoryChange[] | null; created_at: string;
}

function LoadDetail({ load, onBack, onEdit }: { load: Load; onBack: () => void; onEdit?: () => void }) {
  const [tab, setTab] = useState<"info" | "log">("info");
  const [log, setLog]         = useState<HistoryEvent[]>([]);
  const [logLoading, setLogLoading] = useState(false);
  const [logError, setLogError]     = useState<string | null>(null);
  const logFetched = useRef(false);

  useEffect(() => {
    if (tab !== "log" || logFetched.current) return;
    logFetched.current = true;
    setLogLoading(true);
    api.get<HistoryEvent[]>(`/board/history?entity_type=load&entity_id=${load.id}&limit=100`)
      .then((data) => setLog(data ?? []))
      .catch((e) => setLogError(friendlyError(e, "Failed to load")))
      .finally(() => setLogLoading(false));
  }, [tab, load.id]);

  const stops = load.stops ?? [];

  // Where each stop is, for the map. Stops saved with coordinates use them; the rest are
  // looked up here, one at a time (the geocoder throttles bursts), keyed by row.
  const [found, setFound] = useState<Record<number, LatLng>>({});
  useEffect(() => {
    const ctl = new AbortController();
    setFound({});
    (async () => {
      for (let i = 0; i < stops.length; i++) {
        const s = stops[i];
        if ((s.lat != null && s.lng != null) || !s.city.trim()) continue;
        const c = await geocodeCity(joinAddress(s), ctl.signal).catch(() => null);
        if (ctl.signal.aborted) return;
        if (c) setFound((p) => ({ ...p, [i]: c }));
      }
    })();
    return () => ctl.abort();
  }, [load.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const mapPoints: RoutePoint[] = stops.flatMap((s, i) => {
    const at = s.lat != null && s.lng != null ? { lat: s.lat, lng: s.lng } : found[i];
    return at ? [{ ...at, label: stopLetter(i), title: cityState(s) }] : [];
  });

  // Rate per mile divides by the distance actually driven — loaded plus empty — the same
  // span the load form, the Gross page and driver pay use.
  const distance = load.totalMiles + load.deadheadMiles;
  const perMile  = distance > 0 ? load.payout / distance : 0;
  const mono: React.CSSProperties = { fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" };
  const facts: { icon: React.ReactNode; label: string; value: React.ReactNode }[] = [
    { icon: <Building2 size={13} />,  label: "Broker",       value: load.broker || <Dash /> },
    { icon: <User size={13} />,       label: "Driver",       value: load.driver || <span style={{ color: "var(--muted-foreground)", fontWeight: 400 }}>Unassigned</span> },
    { icon: <User size={13} />,       label: "Dispatcher",   value: load.dispatcher || <Dash /> },
    { icon: <DollarSign size={13} />, label: "Rate",         value: <span style={mono}>${load.payout.toLocaleString()}</span> },
    { icon: <Navigation size={13} />, label: "Loaded miles", value: <span style={mono}>{load.totalMiles.toLocaleString()} mi</span> },
    { icon: <Navigation size={13} />, label: "Deadhead",     value: <span style={mono}>{load.deadheadMiles.toLocaleString()} mi</span> },
    { icon: <DollarSign size={13} />, label: "Rate per mile", value: <span style={mono}>${perMile.toFixed(2)}</span> },
  ];

  const tabs = [
    { id: "info" as const, label: "Load info",  icon: <Package size={14} /> },
    { id: "log"  as const, label: "Change log", icon: <History size={14} /> },
  ];
  const card: React.CSSProperties = { backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 };
  const secTitle: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 700, color: "var(--foreground)" };
  const quiet: React.CSSProperties = { padding: "48px 20px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" };
  const ACTION: Record<HistoryEvent["action"], { label: string; color: string; bg: string }> = {
    create: { label: "Created", color: "var(--primary)", bg: "var(--primary-soft)" },
    update: { label: "Updated", color: "#2563EB", bg: "rgba(59,130,246,0.12)" },
    delete: { label: "Deleted", color: "#DC2626", bg: "rgba(239,68,68,0.12)" },
  };
  const logValue = (v: string | number | null) => (v === null || v === "" ? <Dash /> : String(v));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", backgroundColor: "var(--background)" }}>
      {/* Header: where you are, what it is, and the way to change it */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap", padding: "10px 24px", backgroundColor: "var(--card)", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <button
            onClick={onBack}
            style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer", padding: "4px 7px", borderRadius: 6 }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--muted)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
          >
            <ArrowLeft size={14} /> Loads
          </button>
          <span style={{ color: "var(--border)", userSelect: "none" }}>/</span>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 17, fontWeight: 700, color: "var(--foreground)", letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {load.loadId || "Load"}
          </span>
          <StatusBadge status={load.status} />
        </div>
        {onEdit && (
          <button onClick={onEdit}
            style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, height: 34, padding: "0 14px", borderRadius: 8, border: "1px solid var(--border)", backgroundColor: "var(--card)", color: "var(--foreground)", cursor: "pointer" }}
            onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--muted)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--card)"; }}>
            <Pencil size={13} /> Edit load
          </button>
        )}
      </div>

      {/* Tabs, on their own row */}
      <div role="tablist" aria-label="Load sections" style={{ display: "flex", alignItems: "flex-end", gap: 2, padding: "0 24px", backgroundColor: "var(--card)", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                padding: "9px 12px",
                fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: active ? 600 : 500,
                color: active ? "var(--primary)" : "var(--muted-foreground)",
                backgroundColor: "transparent", border: "none",
                borderBottom: active ? "2px solid var(--primary)" : "2px solid transparent",
                cursor: "pointer", marginBottom: -1, transition: "color 0.15s",
              }}
            >
              {t.icon}
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: "16px 24px 28px", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>

        {/* ── Load info ── */}
        {tab === "info" && (
          <div role="tabpanel" style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 1280, margin: "0 auto" }}>

            {/* The facts, side by side */}
            <div style={{ ...card, padding: "14px 18px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(128px, 1fr))", gap: "14px 18px" }}>
              {facts.map((f) => (
                <div key={f.label} style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)" }}>
                    {f.icon} {f.label}
                  </span>
                  <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, color: "var(--foreground)", overflowWrap: "anywhere" }}>{f.value}</span>
                </div>
              ))}
            </div>

            {/* Route: the stops in order, and the same stops on a map */}
            <div style={{ ...card, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
                <span style={secTitle}>Route</span>
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)" }}>
                  {stops.length} stop{stops.length !== 1 ? "s" : ""}{stops.length > 0 ? ` · ${stops.filter((s) => s.done).length} done` : ""}
                </span>
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(320px,1.2fr)]" style={{ gap: 18, alignItems: "start" }}>
                <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
                  {stops.length === 0 && <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>No stops on this load.</span>}
                  {stops.map((s, i) => {
                    const last    = i === stops.length - 1;
                    const current = !s.done && (i === 0 || stops[i - 1].done);
                    return (
                      <div key={i} style={{ display: "flex", gap: 12, alignItems: "stretch" }}>
                        {/* Spine: the stop's letter (the one on its map pin), then the line to the next */}
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, width: 24 }}>
                          <span style={{
                            width: 24, height: 24, borderRadius: "50%", boxSizing: "border-box", flexShrink: 0,
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            fontFamily: "var(--font-sans)", fontSize: 11.5, fontWeight: 700,
                            backgroundColor: s.done ? "var(--muted)" : current ? "var(--primary)" : "var(--card)",
                            color: s.done ? "var(--muted-foreground)" : current ? "#fff" : "var(--primary)",
                            border: s.done ? "1px solid var(--border)" : "1.5px solid var(--primary)",
                          }}>
                            {stopLetter(i)}
                          </span>
                          {!last && <div style={{ width: 2, flex: 1, minHeight: 14, backgroundColor: s.done ? "var(--border)" : "var(--primary-soft)", margin: "4px 0" }} />}
                        </div>
                        <div style={{ flex: 1, minWidth: 0, paddingBottom: last ? 0 : 16 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", marginBottom: 2 }}>
                            {i === 0 ? "Pickup" : last ? "Delivery" : `Stop ${stopLetter(i)}`}
                            {s.done && <span style={{ fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", backgroundColor: "var(--muted)", borderRadius: 4, padding: "0 6px" }}>Done</span>}
                            {current && <span style={{ fontSize: 11, fontWeight: 600, color: "var(--primary)", backgroundColor: "var(--primary-soft)", borderRadius: 4, padding: "0 6px" }}>Next</span>}
                          </div>
                          <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, color: s.done ? "var(--muted-foreground)" : "var(--foreground)", overflowWrap: "anywhere" }}>
                            {joinAddress(s) || <Dash />}
                          </div>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 3, fontFamily: "var(--font-mono)", fontSize: 12.5, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>
                            <CalendarDays size={12} /> {s.appt || <span style={{ fontFamily: "var(--font-sans)" }}>No appointment</span>}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <RouteMap points={mapPoints} height={320} />
              </div>
            </div>
          </div>
        )}

        {/* ── Change log ── */}
        {tab === "log" && (
          <div role="tabpanel" style={{ maxWidth: 860, margin: "0 auto" }}>
            <div style={{ ...card, overflow: "hidden" }}>
              {logLoading ? (
                <div style={quiet}>Loading…</div>
              ) : logError ? (
                <div style={{ ...quiet, color: "#EF4444" }}>{logError}</div>
              ) : log.length === 0 ? (
                <div style={quiet}>Nothing has been changed on this load yet.</div>
              ) : log.map((entry, ei) => {
                const time = fmtDateTime(entry.created_at);
                const act = ACTION[entry.action] ?? ACTION.update;
                return (
                  <div key={entry.id} style={{ padding: "12px 18px", borderTop: ei === 0 ? "none" : "1px solid var(--border)", display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>
                        {entry.actor_name || "Unknown"}
                      </span>
                      <span style={{ fontFamily: "var(--font-sans)", fontSize: 11.5, fontWeight: 600, color: act.color, backgroundColor: act.bg, borderRadius: 5, padding: "1px 8px" }}>
                        {act.label}
                      </span>
                      <span style={{ marginLeft: "auto", fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{time}</span>
                    </div>
                    {entry.changes && entry.changes.length > 0 && (
                      <div style={{ display: "grid", gridTemplateColumns: "minmax(90px, 150px) minmax(0, 1fr)", gap: "5px 14px", fontFamily: "var(--font-sans)", fontSize: 12.5 }}>
                        {entry.changes.map((c, i) => (
                          <div key={i} style={{ display: "contents" }}>
                            <span style={{ color: "var(--muted-foreground)" }}>{c.field.replace(/_/g, " ").replace(/^./, (ch) => ch.toUpperCase())}</span>
                            <span style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
                              <span style={{ color: "var(--muted-foreground)", textDecoration: c.from === null || c.from === "" ? "none" : "line-through", overflowWrap: "anywhere" }}>{logValue(c.from)}</span>
                              <ArrowRight size={12} style={{ color: "var(--muted-foreground)", flexShrink: 0, alignSelf: "center" }} />
                              <span style={{ color: "var(--foreground)", fontWeight: 600, overflowWrap: "anywhere" }}>{logValue(c.to)}</span>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function LoadsPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const canCreate = hasPerm(user, "loads", "create");
  const canUpdate = hasPerm(user, "loads", "update");
  const canDelete = hasPerm(user, "loads", "delete");
  const [loads, setLoads]           = useState<Load[]>([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);
  const [fetchKey, setFetchKey]     = useState(0);
  const [extracting, setExtracting] = useState(false);
  const [deleting, setDeleting]     = useState<Load | null>(null);
  const [delBusy, setDelBusy]       = useState(false);
  const [delErr, setDelErr]         = useState<string | null>(null);
  const [filterStatus, setFilter]   = useState("All");
  const [search, setSearch]         = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage]             = useState(1);
  const [pageSize, setPageSize]     = useState(20);
  const [detailLoad, setDetail]     = useState<Load | null>(null);

  // Old deep link: /workspace/loads?edit=<load id>. Editing has its own page now — send
  // any link still in that shape (a bookmark, an open tab) on to it.
  useEffect(() => {
    const id = searchParams.get("edit");
    if (id) navigate(`/workspace/loads/${id}/edit`, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [filterStatus]);

  useEffect(() => {
    setLoading(true);
    api.getList<BackendLoad>("/loads", {
      q: debouncedSearch || undefined,
      status: filterStatus !== "All" ? filterStatus : undefined,
      page,
      page_size: pageSize,
    })
      .then(({ items, total: t }) => {
        const mapped = (items ?? []).map((b) => toLoad(b));
        setLoads(mapped);
        setTotal(t);
        setDetail((prev) => prev ? (mapped.find((l) => l.id === prev.id) ?? null) : null);
      })
      .catch((e) => notify.error(friendlyError(e)))
      .finally(() => setLoading(false));
  }, [fetchKey, debouncedSearch, filterStatus, page, pageSize]);

  const patchLoad = async (id: string, fields: Partial<Load>) => {
    const current = loads.find((l) => l.id === id);
    if (!current) return;
    const updated = withCompletedStops({ ...current, ...fields });
    setLoads((prev) => prev.map((l) => (l.id === id ? updated : l)));
    try {
      await api.put<BackendLoad>(`/loads/${id}`, toBackend(updated));
      notify.success("Status updated");
      setFetchKey((k) => k + 1);
    } catch (e) {
      notify.error(friendlyError(e, "Update failed"));
      setFetchKey((k) => k + 1);
    }
  };

  // Moving a load out of `completed` deletes its payout, so it asks first.
  const [uncompleting, setUncompleting] = useState<{ load: Load; to: Status } | null>(null);

  const requestStatus = (l: Load, s: Status) => {
    if (l.status === "completed" && s !== "completed") { setUncompleting({ load: l, to: s }); return; }
    patchLoad(l.id, { status: s });
  };

  // Creating and editing happen on their own page (LoadFormPage), not in a dialog here.
  const openCreate = () => navigate("/workspace/loads/new");
  const openEdit   = (l: Load) => navigate(`/workspace/loads/${l.id}/edit`);

  // The draft is never persisted by the extractor — hand it to the create page so a human
  // reviews it, assigns driver/dispatcher, and saves via POST /loads.
  const openFromDraft = (draft: ExtractDraft) => {
    setExtracting(false);
    navigate("/workspace/loads/new", { state: { draft } });
  };

  const del = async () => {
    if (!deleting) return;
    const label = deleting.loadId;
    setDelErr(null);
    setDelBusy(true);
    try {
      await api.delete(`/loads/${deleting.id}`);
      setDeleting(null);
      notify.success(`Load ${label} deleted`);
      setFetchKey((k) => k + 1);
    } catch (e) {
      setDelErr(friendlyError(e, "Delete failed"));
    } finally {
      setDelBusy(false);
    }
  };

  const handleSearch = (v: string) => setSearch(v);
  const handleFilter = (v: string) => setFilter(v);

  if (loading && loads.length === 0) return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "var(--background)" }}>
      <PageLoader label="loads" />
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "var(--background)", overflow: "hidden" }}>
      <div style={{ flex: 1, overflow: "hidden", padding: "20px 24px", display: "flex", flexDirection: "column" }}>
        <div style={{
          flex: 1, display: "flex", flexDirection: "column", overflow: "hidden",
          backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 12,
        }}>
          {detailLoad ? (
            <LoadDetail load={detailLoad} onBack={() => setDetail(null)} onEdit={canUpdate ? () => openEdit(detailLoad) : undefined} />
          ) : (<>

          {/* Toolbar */}
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "12px 16px", borderBottom: "1px solid var(--border)",
            backgroundColor: "var(--card)", flexShrink: 0,
          }}>
            {/* Search */}
            <div style={{ position: "relative", width: 260 }}>
              <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground)", pointerEvents: "none" }} />
              <input
                value={search}
                onChange={(e) => handleSearch(e.target.value)}
                placeholder="Search loads, brokers, drivers…"
                style={{
                  width: "100%", height: 34, paddingLeft: 30, paddingRight: 10,
                  fontFamily: "var(--font-sans)", fontSize: 13,
                  backgroundColor: "var(--input-background)", border: "1px solid var(--border)",
                  borderRadius: 7, color: "var(--foreground)", outline: "none", boxSizing: "border-box",
                  transition: "border-color 0.15s, box-shadow 0.15s",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.boxShadow = "0 0 0 3px var(--primary-soft)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
              />
            </div>

            {/* Status filter */}
            <CustomSelect
              value={filterStatus}
              options={STATUS_FILTER_OPTS}
              onChange={handleFilter}
              width={172}
            />

            <div style={{ flex: 1 }} />

            {canCreate && <AddLoadMenu onManual={openCreate} onExtract={() => setExtracting(true)} />}
          </div>

          {/* Table — dim existing rows while a page-change refetch is in flight */}
          <div style={{ flex: 1, overflow: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
            <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "separate", borderSpacing: 0, opacity: loading && loads.length > 0 ? 0.45 : 1, pointerEvents: loading ? "none" : "auto", transition: "opacity 0.15s" }}>
              <thead>
                <tr>
                  <TH width={40}>#</TH>
                  <TH width={110}>Load ID</TH>
                  <TH width={170}>Broker</TH>
                  <TH width={190}>Driver</TH>
                  <TH width={120}>Status</TH>
                  <TH width={240}>Route</TH>
                  <TH width={250}>Appt Times</TH>
                  <TH width={100} align="right">Miles</TH>
                  <TH width={100} align="right">Rate</TH>
                  <TH width={120}>Dispatcher</TH>
                  <TH width={90} align="center" pinned>Actions</TH>
                </tr>
              </thead>
              <tbody>
                {loads.map((l, i) => (
                  <tr
                    key={l.id}
                    style={{ backgroundColor: i % 2 === 0 ? "var(--card)" : "var(--background)" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "var(--primary-faint)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = i % 2 === 0 ? "var(--card)" : "var(--background)"; }}
                  >
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)", textAlign: "center", verticalAlign: "middle" }}>
                      {(page - 1) * pageSize + i + 1}
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", verticalAlign: "middle" }}>
                      <button
                        onClick={() => setDetail(l)}
                        style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--primary)", backgroundColor: "var(--secondary)", borderRadius: 4, padding: "2px 8px", border: "none", cursor: "pointer", outline: "none" }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.textDecoration = "underline"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.textDecoration = "none"; }}
                      >
                        {l.loadId}
                      </button>
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", fontFamily: "var(--font-sans)", fontSize: 12, color: l.broker ? "var(--foreground)" : "var(--muted-foreground)", verticalAlign: "middle" }}>
                      {l.broker || <Dash />}
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", verticalAlign: "middle" }}>
                      <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 500, color: l.driver ? "var(--foreground)" : "var(--muted-foreground)", fontStyle: l.driver ? "normal" : "italic" }}>
                        {l.driver || "Unassigned"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", verticalAlign: "middle" }}>
                      <StatusDropdown value={l.status} onChange={(s) => requestStatus(l, s)} readOnly={!canUpdate} />
                    </td>
                    {/* Route — origin + stops */}
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", verticalAlign: "top", paddingTop: 12, paddingBottom: 12 }}>
                      {(() => {
                        const labelSt: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--muted-foreground)", letterSpacing: "0.06em", textTransform: "uppercase", flexShrink: 0, width: 30 };
                        const route = l.stops ?? [];
                        return (
                          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                            {route.map((stop, si) => {
                              const isDone    = stop.done;
                              const prevDone  = si === 0 || route[si - 1].done;
                              const isCurrent = !stop.done && prevDone;
                              return (
                                <div key={si} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                  <span style={labelSt}>#{si + 1}</span>
                                  <span style={{
                                    fontFamily: "var(--font-sans)", fontSize: 12,
                                    color: isDone ? "var(--muted-foreground)" : isCurrent ? "var(--foreground)" : "var(--muted-foreground)",
                                    textDecoration: isDone ? "line-through" : "none",
                                    fontWeight: isCurrent ? 500 : 400,
                                  }}>
                                    {cityState(stop) || <Dash />}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </td>
                    {/* Appt Times — one row per stop's appointment (#1 = origin … #N = destination) */}
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", verticalAlign: "top", paddingTop: 12, paddingBottom: 12 }}>
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        {(l.stops ?? []).map((stop, si) => {
                          const prevDone  = si === 0 || l.stops![si - 1].done;
                          const isCurrent = !stop.done && prevDone;
                          const isDone    = stop.done;
                          return (
                            <div key={si} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--muted-foreground)", flexShrink: 0, width: 30 }}>#{si + 1}</span>
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, whiteSpace: "nowrap", color: isDone ? "var(--muted-foreground)" : isCurrent ? "var(--primary)" : "var(--foreground)", textDecoration: isDone ? "line-through" : "none" }}>
                                {stop.appt || <Dash />}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", verticalAlign: "middle", textAlign: "right" }}>
                      {l.totalMiles ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 1, alignItems: "flex-end" }}>
                          <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--foreground)" }}>
                            {l.totalMiles.toLocaleString()} mi
                          </span>
                          {l.payout > 0 && (
                            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#10B981" }}>
                              ${(l.payout / l.totalMiles).toFixed(2)}/mi
                            </span>
                          )}
                        </div>
                      ) : (
                        <Dash />
                      )}
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", verticalAlign: "middle", textAlign: "right" }}>
                      <span style={{
                        fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700,
                        color: l.payout === 0 ? "var(--muted-foreground)" : l.status === "re_update" ? "#EF4444" : "#10B981",
                      }}>
                        {l.payout === 0 ? <Dash /> : fmt(l.payout)}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", verticalAlign: "middle" }}>
                      <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: l.dispatcher ? "var(--foreground)" : "var(--muted-foreground)" }}>{l.dispatcher || <Dash />}</span>
                    </td>
                    {/* Pinned right. It carries the row's own stripe colour as a solid fill, so the
                        columns scrolling underneath never show through. */}
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", verticalAlign: "middle", textAlign: "center", position: "sticky", right: 0, backgroundColor: i % 2 === 0 ? "var(--card)" : "var(--background)", boxShadow: "inset 1px 0 0 var(--border)" }}>
                      <div style={{ display: "inline-flex", gap: 2 }}>
                        {canUpdate && <ActionBtn label={`Edit ${l.loadId || "load"}`} tone="edit" icon={<Pencil size={14} />} onClick={() => openEdit(l)} />}
                        {canDelete && <ActionBtn label={`Delete ${l.loadId || "load"}`} tone="delete" icon={<Trash2 size={14} />} onClick={() => setDeleting(l)} />}
                        {!canUpdate && !canDelete && <Dash />}
                      </div>
                    </td>
                  </tr>
                ))}
                {!loading && loads.length === 0 && (
                  <tr>
                    <td colSpan={11} style={{ padding: "40px 20px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>
                      No loads match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <Pagination
            page={page} total={total} pageSize={pageSize}
            onPage={setPage} onPageSize={setPageSize} loading={loading}
          />
          </>)}
        </div>
      </div>

      {extracting && (
        <ExtractModal onClose={() => setExtracting(false)} onExtracted={openFromDraft} />
      )}
      {deleting && (
        <DeleteConfirm label={deleting.loadId} busy={delBusy} error={delErr} onClose={() => { setDeleting(null); setDelErr(null); }} onConfirm={del} />
      )}
      {uncompleting && (
        <UncompleteConfirm
          to={uncompleting.to}
          label={uncompleting.load.loadId}
          onCancel={() => setUncompleting(null)}
          onConfirm={() => {
            patchLoad(uncompleting.load.id, { status: uncompleting.to });
            setUncompleting(null);
          }}
        />
      )}
    </div>
  );
}
