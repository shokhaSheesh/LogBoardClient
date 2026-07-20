import { useState, useRef, useEffect } from "react";
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
import { AsyncSearchableSelect, type SelectOpt } from "./AsyncSelect";
import { AddressAutocomplete } from "./AddressAutocomplete";
import { UncompleteConfirm } from "./UncompleteConfirm";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Stop {
  city: string;
  done: boolean;
  appt?: string;
  lat?: number;
  lng?: number;
  location?: { lat: number; lng: number }; // backend coord shape (round-tripped)
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
      city: s.city, done: s.done, appt: s.appt,
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
      city: s.city,
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
  value, options, onChange, width, compact = false, dropUp = false,
}: {
  value: string; options: SelectOpt[]; onChange: (v: string) => void;
  width?: number | string; compact?: boolean; dropUp?: boolean;
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
  const h = compact ? 30 : 34;

  return (
    <div ref={ref} style={{ position: "relative", width: width ?? "100%" }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%",
          height: h, paddingLeft: 10, paddingRight: 8,
          fontFamily: "var(--font-sans)", fontSize: compact ? 12 : 13,
          backgroundColor: "var(--input-background)",
          border: `1px solid ${open ? "var(--primary)" : "var(--border)"}`,
          borderRadius: 7, color: "var(--foreground)", cursor: "pointer",
          boxShadow: open ? "0 0 0 3px rgba(59,130,246,0.12)" : "none",
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

const TH = ({ children, width, align = "left" }: { children: React.ReactNode; width?: number; align?: string }) => (
  <th style={{
    padding: "8px 14px", textAlign: align as "left" | "center" | "right",
    fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 600,
    color: "var(--muted-foreground)", letterSpacing: "0.07em",
    textTransform: "uppercase", backgroundColor: "var(--muted)",
    borderBottom: "1px solid var(--border)",
    whiteSpace: "nowrap", userSelect: "none",
    width: width ?? "auto", minWidth: width ?? "auto",
    position: "sticky", top: 0, zIndex: 5,
  }}>
    {children}
  </th>
);

function StatusBadge({ status }: { status: Status }) {
  const c = SHARED_STATUS_CONFIG[status];
  if (!c) return <span style={{ color: "var(--muted-foreground)", fontFamily: "var(--font-sans)", fontSize: 13 }}>—</span>;
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
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)", userSelect: "none" }}>—</span>
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

function ActionBtn({ icon, color, bg, onClick }: { icon: React.ReactNode; color: string; bg: string; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      width: 28, height: 28, borderRadius: 6, border: "none",
      backgroundColor: bg, color, cursor: "pointer",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      transition: "opacity 0.15s",
    }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.72"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
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
    default:                      return e instanceof Error ? e.message : "Extraction failed.";
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
      // Extraction reads the document with a reasoning model — 8–35s is normal,
      // longer for a many-page PDF. fetch has no default timeout, so just wait.
      const res = await api.upload<{ draft: ExtractDraft }>("/loads/extract", file);
      onExtracted(res?.draft ?? {});
    } catch (e) {
      setError(extractErrorMessage(e));
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
          <button onClick={onClose} disabled={busy} style={{ background: "none", border: "none", cursor: busy ? "default" : "pointer", color: "var(--muted-foreground)", display: "flex", opacity: busy ? 0.4 : 1 }}>
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
            <span>The document is sent to Google's Gemini API to be read. Nothing is saved until you review the draft and create the load.</span>
          </div>

          {busy && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 14px", backgroundColor: "rgba(139,92,246,0.10)", border: "1px solid rgba(139,92,246,0.35)", borderRadius: 8 }}>
              <span style={{ width: 15, height: 15, borderRadius: "50%", border: "2px solid rgba(139,92,246,0.35)", borderTopColor: "#8B5CF6", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />
              <div style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, color: "#8B5CF6", lineHeight: 1.45 }}>
                Reading the document… this usually takes 10–35 seconds.
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
          <button onClick={onClose} disabled={busy} style={{ fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 16px", borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "var(--muted)", color: "var(--foreground)", cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1 }}>
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
                backgroundColor: item.iconBg, color: item.iconColor,
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

function parseAppt(v: string): { y: number; mo: number; d: number; t: string } | null {
  const m = v.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s*[·\-]?\s*(\d{1,2}:\d{2})?/);
  if (!m) return null;
  const now = new Date();
  return { mo: parseInt(m[1], 10) - 1, d: parseInt(m[2], 10), y: m[3] ? parseInt(m[3], 10) : now.getFullYear(), t: m[4] ?? "08:00" };
}
function fmtAppt(mo: number, d: number, y: number, t: string) {
  return `${String(mo + 1).padStart(2,"0")}/${String(d).padStart(2,"0")} · ${t}`;
}

// The extractor's draft — exactly the fields a load stores. No driver/dispatcher
// (a human assigns those), and draft stops carry no `done` flag.
interface ExtractDraft {
  load_id?: string;
  broker?: string;
  payout?: number;
  miles?: number;
  deadhead_distance?: number; // extractor returns 0 unless the rate con states it
  stops?: { city?: string; appt?: string }[];
}

// ─── Deadhead anchor ──────────────────────────────────────────────────────────

// Where the truck will be when it STARTS this load — the point deadhead is measured
// from. Walking the driver's chain: the last stop of the last load already queued to
// them, or (if they're running nothing) wherever the driver currently is.
interface DeadheadAnchor { point: LatLng; label: string; from: string }

// The telemetry block we expect on a driver, mirroring the board row's `eld` exactly.
// ⚠️ Not served on GET /drivers/:id yet — written now so precise coordinates start
// being used the moment the backend adds it. Until then we fall back to geocoding the
// dispatcher-typed `location`, which is vaguer but works.
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
      const point = last.location?.lat != null && last.location?.lng != null
        ? { lat: last.location.lat, lng: last.location.lng }
        : await geocodeCity(last.city, signal);
      if (point) return { point, label: last.city, from: `${prior.load_id || "previous load"} delivery` };
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
    city: s.city ?? "",
    // Keep the broker's appointment text as printed (e.g. "07/06 0800-1700", "FCFS") —
    // the field is free-form, so there's nothing to normalize it into.
    appt: s.appt ?? "",
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

// Calendar-only picker, same as before — but with no restriction on which date/time can
// be picked (no past-day disabling, no "must be after the earlier stop" clamping). The
// backend's appt field is free text with no ordering rule, so the UI shouldn't invent one.
function AppointmentInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen]   = useState(false);
  const now = new Date();
  const p   = parseAppt(value);
  const [vy,  setVy]  = useState(p?.y  ?? now.getFullYear());
  const [vmo, setVmo] = useState(p?.mo ?? now.getMonth());
  const [vd,  setVd]  = useState(p?.d  ?? now.getDate());
  const [vt,  setVt]  = useState(p?.t  ?? "08:00");
  const [view, setView]     = useState<"day"|"month"|"year">("day");
  const [yPage, setYPage]   = useState(Math.floor((p?.y ?? now.getFullYear()) / 12) * 12);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const commit = (y: number, mo: number, d: number, t: string) => onChange(fmtAppt(mo, d, y, t));

  const firstDow   = new Date(vy, vmo, 1).getDay();
  const daysInMo   = new Date(vy, vmo + 1, 0).getDate();
  const cells: (number|null)[] = [...Array(firstDow).fill(null), ...Array.from({length: daysInMo}, (_,i) => i+1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const hdrBtn: React.CSSProperties = {
    flex: 1, fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600,
    background: "none", border: "none", cursor: "pointer", color: "var(--foreground)",
    padding: "4px 6px", borderRadius: 6,
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen(v => !v)} style={{
        display: "flex", alignItems: "center", gap: 8, width: "100%", height: 34, padding: "0 10px",
        border: `1px solid ${open ? "var(--primary)" : "var(--border)"}`,
        borderRadius: 6, backgroundColor: "var(--input-background)", cursor: "pointer",
        fontFamily: "var(--font-mono)", fontSize: 13,
        color: value ? "var(--foreground)" : "var(--muted-foreground)",
        boxShadow: open ? "0 0 0 3px rgba(59,130,246,0.12)" : "none",
        outline: "none", textAlign: "left",
      }}>
        <CalendarDays size={13} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
        <span style={{ flex: 1 }}>{value || "MM/DD · HH:MM"}</span>
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 600,
          backgroundColor: "var(--card)", border: "1px solid var(--border)",
          borderRadius: 10, boxShadow: "0 10px 28px rgba(0,0,0,0.16)", width: 272, padding: 12,
        }}>

          {/* ── Day view ── */}
          {view === "day" && (<>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
              <button style={NAV_BTN} onClick={() => { const d = new Date(vy, vmo-1); setVmo(d.getMonth()); setVy(d.getFullYear()); }}>‹</button>
              <button style={hdrBtn} onClick={() => setView("month")}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = "var(--muted)")}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
              >{CAL_MONTHS[vmo]} {vy}</button>
              <button style={NAV_BTN} onClick={() => { const d = new Date(vy, vmo+1); setVmo(d.getMonth()); setVy(d.getFullYear()); }}>›</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginBottom: 4 }}>
              {CAL_DAYS.map(d => <div key={d} style={{ textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 600, color: "var(--muted-foreground)", padding: "2px 0" }}>{d}</div>)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 1 }}>
              {cells.map((day, ci) => {
                const isSel   = day === vd;
                const isToday = day === now.getDate() && vmo === now.getMonth() && vy === now.getFullYear();
                return (
                  <button key={ci} disabled={!day} onClick={() => {
                    if (!day) return;
                    setVd(day);
                    commit(vy, vmo, day, vt);
                  }}
                    style={{ height: 30, borderRadius: 6, border: "none", fontFamily: "var(--font-sans)", fontSize: 12,
                      backgroundColor: isSel ? "var(--primary)" : "transparent",
                      color: !day ? "transparent" : isSel ? "#fff" : isToday ? "var(--primary)" : "var(--foreground)",
                      fontWeight: isSel || isToday ? 600 : 400, cursor: !day ? "default" : "pointer",
                    }}
                    onMouseEnter={e => { if (day && !isSel) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--muted)"; }}
                    onMouseLeave={e => { if (day && !isSel) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
                  >{day ?? ""}</button>
                );
              })}
            </div>
            <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
              <Clock size={12} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
              <input type="time" value={vt}
                onChange={e => { const t = e.target.value; setVt(t); commit(vy, vmo, vd, t); }}
                style={{ fontFamily: "var(--font-mono)", fontSize: 13, border: "1px solid var(--border)", borderRadius: 6, padding: "3px 8px", backgroundColor: "var(--input-background)", color: "var(--foreground)", outline: "none" }}
              />
            </div>
          </>)}

          {/* ── Month view ── */}
          {view === "month" && (<>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
              <button style={NAV_BTN} onClick={() => setVy(y => y-1)}>‹</button>
              <button style={hdrBtn} onClick={() => { setYPage(Math.floor(vy/12)*12); setView("year"); }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = "var(--muted)")}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = "transparent")}
              >{vy}</button>
              <button style={NAV_BTN} onClick={() => setVy(y => y+1)}>›</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 4 }}>
              {CAL_MONTHS.map((m, mi) => {
                const isSel = mi === vmo;
                return (
                  <button key={m} onClick={() => { setVmo(mi); setView("day"); }}
                    style={{ padding: "8px 4px", borderRadius: 6, border: "none", fontFamily: "var(--font-sans)", fontSize: 12,
                      backgroundColor: isSel ? "var(--primary)" : "transparent",
                      color: isSel ? "#fff" : "var(--foreground)", fontWeight: isSel ? 600 : 400, cursor: "pointer",
                    }}
                    onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--muted)"; }}
                    onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
                  >{m.slice(0,3)}</button>
                );
              })}
            </div>
          </>)}

          {/* ── Year view ── */}
          {view === "year" && (<>
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
              <button style={NAV_BTN} onClick={() => setYPage(y => y-12)}>‹</button>
              <span style={{ flex: 1, textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>{yPage}–{yPage+11}</span>
              <button style={NAV_BTN} onClick={() => setYPage(y => y+12)}>›</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 4 }}>
              {Array.from({length: 12}, (_,i) => yPage+i).map(y => {
                const isSel = y === vy;
                return (
                  <button key={y} onClick={() => { setVy(y); setYPage(Math.floor(y/12)*12); setView("month"); }}
                    style={{ padding: "8px 4px", borderRadius: 6, border: "none", fontFamily: "var(--font-mono)", fontSize: 12,
                      backgroundColor: isSel ? "var(--primary)" : "transparent",
                      color: isSel ? "#fff" : "var(--foreground)", fontWeight: isSel ? 600 : 400, cursor: "pointer",
                    }}
                    onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--muted)"; }}
                    onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
                  >{y}</button>
                );
              })}
            </div>
          </>)}

        </div>
      )}
    </div>
  );
}

function ordinal(n: number): string {
  const s = ["th","st","nd","rd"], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function LoadModal({ load, onClose, onSave, saving = false }: {
  load: Partial<Load>; onClose: () => void; onSave: (l: Load) => void;
  saving?: boolean;
}) {
  const [form, setForm] = useState<Partial<Load>>(load);
  const set = <K extends keyof Load>(k: K, v: Load[K]) => setForm((f) => ({ ...f, [k]: v }));
  const isNew = !load.id;

  // All locations in one unified array: [stop1 (origin), stop2, ..., stopN (destination)].
  // load.stops is the route exactly as the backend sent it; a new load starts with two
  // blank stops (origin + destination placeholders).
  const [stops, setStops] = useState<Stop[]>(() => {
    if (load.stops && load.stops.length > 0) return load.stops.map((s) => ({ ...s }));
    return [
      { city: "", done: false, appt: "" },
      { city: "", done: false, appt: "" },
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

  const addStop    = () => setStops((p) => [...p, { city: "", done: false, appt: "" }]);
  const removeStop = (idx: number) => { setStops((p) => p.filter((_, i) => i !== idx)); recalcSoon(); };
  const updateCity = (idx: number, val: string) => setStops((p) => p.map((s, i) => i === idx ? { ...s, city: val, lat: undefined, lng: undefined } : s));
  const updateAppt = (idx: number, val: string) => setStops((p) => p.map((s, i) => i === idx ? { ...s, appt: val } : s));

  // A suggestion pick caches the stop's coords (precise — no need to wait for blur to recalc).
  const updateCoords = (idx: number, lat: number, lng: number) => {
    setStops((prev) => prev.map((s, i) => i === idx ? { ...s, lat, lng } : s));
    recalcSoon();
  };

  // Latest stops, so the debounced calc always reads fresh values (no stale closure).
  const stopsRef = useRef(stops);
  stopsRef.current = stops;

  // The ordered list of non-empty cities — the only thing a mileage calc depends on.
  const routeSig = (arr: Stop[]) => arr.filter((s) => s.city.trim()).map((s) => s.city.trim().toLowerCase()).join(" → ");

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
      const resolved: Array<{ city: string; lat: number | null; lng: number | null }> = [];
      for (const s of filled) {
        if (s.lat != null && s.lng != null) { resolved.push({ city: s.city, lat: s.lat, lng: s.lng }); continue; }
        const c = await geocodeCity(s.city, ctl.signal);
        if (isStale()) return;                          // a newer run superseded us
        resolved.push({ city: s.city, lat: c?.lat ?? null, lng: c?.lng ?? null });
      }

      // Cache freshly geocoded coords back onto the stops so we don't re-geocode them.
      setStops((prev) => prev.map((s) => {
        if (s.lat != null || !s.city.trim()) return s;
        const hit = resolved.find((r) => r.lat != null && r.city === s.city);
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

  const handleSave = () => {
    // Send the full route as one stops array (stops[0] = origin … last = destination).
    // Appointments are free text with no ordering/past rules, so there's nothing to check.
    const filled = stops.filter((s) => s.city.trim());
    onSave({ ...form, stops: filled } as Load);
  };

  const inputStyle: React.CSSProperties = {
    fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 10px",
    borderRadius: 6, height: 34, border: "1px solid var(--border)",
    backgroundColor: "var(--input-background)", color: "var(--foreground)",
    outline: "none", width: "100%", boxSizing: "border-box",
  };
  const labelStyle = { display: "flex" as const, flexDirection: "column" as const, gap: 5 };
  const capStyle: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em" };
  const focusInput = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.12)"; };
  const blurInput  = (e: React.FocusEvent<HTMLInputElement>) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; };

  return (
    <div
      // Deliberately NOT closed by a backdrop click. This form can hold an AI-extracted
      // draft (8-35s to produce) or a half-filled load, and a stray click on the backdrop
      // — e.g. the one you make clicking back into the browser window — would silently
      // discard it. Close via the X / Cancel button, like every other modal in the app.
      style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 300, overflowY: "auto", display: "flex", justifyContent: "center", alignItems: "flex-start", padding: "40px 20px" }}
    >
      <div style={{ backgroundColor: "var(--card)", borderRadius: 12, width: 660, boxShadow: "0 20px 60px rgba(0,0,0,0.25)", flexShrink: 0 }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border)", backgroundColor: "var(--muted)", borderRadius: "12px 12px 0 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Package size={16} style={{ color: "var(--primary)" }} />
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>
              {isNew ? "Create Load" : `Edit ${load.loadId}`}
            </span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", display: "flex" }}><X size={16} /></button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Load ID + Broker */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <label style={labelStyle}>
              <span style={capStyle}>Load ID <span style={{ color: "#EF4444" }}>*</span></span>
              <input value={form.loadId ?? ""} onChange={(e) => set("loadId", e.target.value)} style={{ ...inputStyle, fontFamily: "var(--font-mono)" }} placeholder="LD-00000" onFocus={focusInput} onBlur={blurInput} />
            </label>
            <label style={labelStyle}>
              <span style={capStyle}>Broker</span>
              <input value={form.broker ?? ""} onChange={(e) => set("broker", e.target.value)} style={inputStyle} onFocus={focusInput} onBlur={blurInput} />
            </label>
          </div>

          {/* Driver + Dispatcher — backend-paginated, infinite-scroll */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <label style={labelStyle}>
              <span style={capStyle}>Driver</span>
              <AsyncSearchableSelect
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
            </label>
            <label style={labelStyle}>
              <span style={capStyle}>Dispatcher</span>
              <AsyncSearchableSelect
                value={form.dispatcher_id ?? ""}
                valueLabel={form.dispatcher ?? ""}
                // Company-plane read (users.read) — the owner-only /owner/* surface 403s for
                // dispatchers, which left this select empty for exactly the people using it.
                // It's a bounded pick-list and the docs define no ?q=/paging on it, so fetch
                // the whole list (omitting page_size returns all) and match here — passing a
                // query the endpoint ignores would look like search while filtering nothing.
                fetchPage={async (q) => {
                  const rows = await api.get<any[]>("/company/users");
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
            </label>
          </div>

          {/* Status (hidden on create). A queued/next load has no status — show it
              blank rather than a fake "reserved", and only send one if the user picks it. */}
          {!isNew && (
            <label style={labelStyle}>
              <span style={capStyle}>Status</span>
              <CustomSelect value={form.status ?? ""} options={STATUS_MODAL_OPTS} onChange={(v) => set("status", v as Status)} />
            </label>
          )}

          {/* Payout + Miles */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <label style={labelStyle}>
              <span style={capStyle}>Rate ($)</span>
              <input type="number" value={form.payout ?? ""} onChange={(e) => set("payout", Number(e.target.value))} style={{ ...inputStyle, fontFamily: "var(--font-mono)" }} placeholder="0" onFocus={focusInput} onBlur={blurInput} />
            </label>
            <label style={labelStyle}>
              <span style={capStyle}>Miles</span>
              <div style={{ position: "relative" }}>
                <input type="number" value={form.totalMiles ?? ""} onChange={(e) => set("totalMiles", e.target.value ? Number(e.target.value) : 0)} style={{ ...inputStyle, fontFamily: "var(--font-mono)", paddingRight: recalcing ? 30 : undefined }} placeholder="0" onFocus={focusInput} onBlur={blurInput} />
                {recalcing && (
                  <span style={{ position: "absolute", right: 10, top: "50%", marginTop: -7, boxSizing: "border-box", width: 14, height: 14, borderRadius: "50%", border: "2px solid var(--border)", borderTopColor: "var(--muted-foreground)", animation: "spin 0.7s linear infinite", pointerEvents: "none" }} />
                )}
              </div>
              {milesNote && <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--muted-foreground)" }}>{milesNote}</span>}
            </label>
          </div>

          {/* Deadhead — the empty run to this load's pickup. Kept separate from Miles
              because the backend derives total_miles = miles + deadhead itself. */}
          <label style={labelStyle}>
            <span style={capStyle}>Deadhead (mi)</span>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <div style={{ position: "relative", flex: 1 }}>
                <input
                  type="number" min={0}
                  value={form.deadheadMiles ?? ""}
                  onChange={(e) => set("deadheadMiles", e.target.value ? Math.max(0, Number(e.target.value)) : 0)}
                  style={{ ...inputStyle, fontFamily: "var(--font-mono)", paddingRight: dhBusy ? 30 : undefined }}
                  placeholder="0" onFocus={focusInput} onBlur={blurInput}
                />
                {dhBusy && (
                  <span style={{ position: "absolute", right: 10, top: "50%", marginTop: -7, boxSizing: "border-box", width: 14, height: 14, borderRadius: "50%", border: "2px solid var(--border)", borderTopColor: "var(--muted-foreground)", animation: "spin 0.7s linear infinite", pointerEvents: "none" }} />
                )}
              </div>
              <button
                type="button"
                onClick={calcDeadhead}
                disabled={!canCalcDeadhead || dhBusy}
                title={
                  !form.driver_id ? "Pick a driver first — deadhead is measured from where they'll be"
                  : !firstStopCity ? "Enter the first stop first"
                  : "Measure from the driver's previous delivery (or their current location)"
                }
                style={{
                  flexShrink: 0, height: 34, padding: "0 12px", borderRadius: 6, border: "1px solid var(--border)",
                  backgroundColor: canCalcDeadhead && !dhBusy ? "var(--muted)" : "transparent",
                  color: canCalcDeadhead && !dhBusy ? "var(--foreground)" : "var(--muted-foreground)",
                  cursor: canCalcDeadhead && !dhBusy ? "pointer" : "not-allowed",
                  fontFamily: "var(--font-sans)", fontSize: 12.5, fontWeight: 600,
                  opacity: canCalcDeadhead ? 1 : 0.55,
                }}
              >
                {dhBusy ? "Measuring…" : "Calculate"}
              </button>
            </div>
            {dhNote && (
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: dhNote.startsWith("From:") ? "var(--muted-foreground)" : "#F59E0B" }}>{dhNote}</span>
            )}
            {/* The figure RPM and driver pay actually divide by. */}
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--muted-foreground)" }}>
              Total distance: {((form.totalMiles ?? 0) + (form.deadheadMiles ?? 0)).toLocaleString()} mi
              {(form.deadheadMiles ?? 0) > 0 && ` (${(form.totalMiles ?? 0).toLocaleString()} loaded + ${(form.deadheadMiles ?? 0).toLocaleString()} empty)`}
            </span>
          </label>

          {/* Route — unified stop list */}
          <div style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "visible" }}>
            <div style={{ padding: "10px 14px", backgroundColor: "var(--muted)", borderBottom: "1px solid var(--border)", borderRadius: "10px 10px 0 0" }}>
              <span style={capStyle}>Stops / Route</span>
            </div>

            <div style={{ padding: 14, display: "flex", flexDirection: "column", gap: 0 }}>
              {stops.map((stop, idx) => {
                const isFirst = idx === 0;
                const isLast  = idx === stops.length - 1;
                const dotColor = isFirst ? "#10B981" : isLast ? "#EF4444" : "var(--primary)";

                return (
                  <div key={idx}>
                    {/* Stop row */}
                    <div
                      draggable={grabIdx === idx}
                      onDragStart={() => setDragIdx(idx)}
                      onDragEnd={resetDrag}
                      onDragOver={(e) => { if (dragIdx !== null) { e.preventDefault(); setOverIdx(idx); } }}
                      onDrop={(e) => { e.preventDefault(); if (dragIdx !== null) moveStop(dragIdx, idx); resetDrag(); }}
                      style={{
                        display: "flex", alignItems: "flex-end", gap: 10, borderRadius: 8,
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
                        style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 34, cursor: "grab", color: "var(--muted-foreground)", flexShrink: 0 }}
                      >
                        <GripVertical size={14} />
                      </div>

                      {/* Spine */}
                      <div style={{ width: 20, display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, paddingBottom: 4 }}>
                        <div style={{ width: 10, height: 10, borderRadius: "50%", backgroundColor: dotColor, border: "2px solid var(--card)", boxShadow: `0 0 0 2px ${dotColor}`, marginTop: 22, flexShrink: 0 }} />
                      </div>

                      {/* Location field */}
                      <div style={{ flex: 2, minWidth: 0 }}>
                        <div style={{ ...capStyle, fontSize: 10, marginBottom: 4 }}>
                          {ordinal(idx + 1)} Stop
                          {(isFirst || isLast) && <span style={{ color: "#EF4444", marginLeft: 2 }}>*</span>}
                        </div>
                        <AddressAutocomplete
                          value={stop.city}
                          onChange={(v) => updateCity(idx, v)}
                          onCoords={(lat, lng) => updateCoords(idx, lat, lng)}
                          style={inputStyle}
                          onFocus={focusInput}
                          onBlur={(e) => { blurInput(e); recalcSoon(); }}
                        />
                      </div>

                      {/* Appt — calendar picker */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ ...capStyle, fontSize: 10, marginBottom: 4 }}>Appointment</div>
                        <AppointmentInput value={stop.appt ?? ""} onChange={(v) => updateAppt(idx, v)} />
                      </div>

                      {/* Remove */}
                      <button
                        onClick={() => removeStop(idx)}
                        disabled={stops.length <= 2}
                        style={{
                          width: 30, height: 30, borderRadius: 6, border: "1px solid var(--border)",
                          backgroundColor: "var(--muted)", color: "var(--muted-foreground)",
                          cursor: stops.length <= 2 ? "default" : "pointer",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          opacity: stops.length <= 2 ? 0.3 : 1, flexShrink: 0,
                        }}
                        onMouseEnter={(e) => { if (stops.length > 2) { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor="rgba(239,68,68,0.14)"; b.style.color="#EF4444"; b.style.borderColor="#EF4444"; } }}
                        onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor="var(--muted)"; b.style.color="var(--muted-foreground)"; b.style.borderColor="var(--border)"; }}
                      >
                        <X size={13} />
                      </button>
                    </div>

                    {/* Connector — aligned under the dot (grip 14 + gap + spine 20) */}
                    {!isLast && (
                      <div style={{ display: "flex", gap: 10 }}>
                        <div style={{ width: 14, flexShrink: 0 }} />
                        <div style={{ width: 20, display: "flex", justifyContent: "center" }}>
                          <div style={{ width: 2, height: 12, backgroundColor: "var(--border)" }} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Add stop */}
              <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
                <div style={{ width: 14, flexShrink: 0 }} />
                <div style={{ width: 20, display: "flex", justifyContent: "center" }}>
                  <div style={{ width: 2, height: 10, backgroundColor: "var(--border)" }} />
                </div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <button onClick={addStop} style={{
                    display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 12px",
                    border: "1px dashed var(--border)", borderRadius: 6, backgroundColor: "transparent",
                    fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", cursor: "pointer",
                  }}
                    onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor="var(--primary)"; b.style.color="var(--primary)"; }}
                    onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor="var(--border)"; b.style.color="var(--muted-foreground)"; }}
                  >
                    <Plus size={12} /> Add Stop
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 10, padding: "14px 20px", borderTop: "1px solid var(--border)" }}>
          <button onClick={onClose} style={{ fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 16px", borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "var(--muted)", color: "var(--foreground)", cursor: "pointer" }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "7px 16px", borderRadius: 6, border: "none", backgroundColor: "var(--primary)", color: "#fff", cursor: saving ? "default" : "pointer", display: "flex", alignItems: "center", gap: 6, opacity: saving ? 0.7 : 1 }}>
            <Check size={14} /> {saving ? "Saving…" : isNew ? "Create Load" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
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
        {error && <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "#EF4444", marginBottom: 16 }}>{error}</div>}
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

function LoadDetail({ load, onBack }: { load: Load; onBack: () => void }) {
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
      .catch((e) => setLogError(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => setLogLoading(false));
  }, [tab, load.id]);

  const infoRows: { icon: React.ReactNode; label: string; value: React.ReactNode }[] = [
    { icon: <Building2 size={13} />, label: "Broker",     value: load.broker },
    {
      icon: <User size={13} />,
      label: "Driver",
      value: load.driver === "—"
        ? <span style={{ color: "var(--muted-foreground)", fontStyle: "italic" }}>Unassigned</span>
        : load.driver,
    },
    {
      icon: <User size={13} />,
      label: "Dispatcher",
      value: load.dispatcher || <span style={{ color: "var(--muted-foreground)" }}>—</span>,
    },
    {
      icon: <DollarSign size={13} />,
      label: "Rate",
      value: (
        <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: load.payout === 0 ? "var(--muted-foreground)" : "#10B981" }}>
          {load.payout === 0 ? "—" : `$${load.payout.toLocaleString()}`}
        </span>
      ),
    },
    {
      icon: <Navigation size={13} />,
      label: "Total Miles",
      value: load.totalMiles ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>{load.totalMiles.toLocaleString()} mi</span>
          {load.payout > 0 && (
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#10B981", backgroundColor: "rgba(16,185,129,0.14)", borderRadius: 4, padding: "1px 6px" }}>
              ${(load.payout / load.totalMiles).toFixed(2)}/mi RPM
            </span>
          )}
        </div>
      ) : <span style={{ color: "var(--muted-foreground)", fontStyle: "italic" }}>Not set</span>,
    },
  ];

  const tabs = [
    { id: "info" as const, label: "Load Info",  icon: <Package size={14} /> },
    { id: "log"  as const, label: "Change Log", icon: <History size={14} /> },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Sub-header */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "11px 16px", borderBottom: "1px solid var(--border)",
        backgroundColor: "var(--muted)", flexShrink: 0,
      }}>
        <button
          onClick={onBack}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--muted-foreground)", background: "none", border: "none", cursor: "pointer", padding: "3px 7px", borderRadius: 6, outline: "none" }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--border)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
        >
          <ArrowLeft size={14} /> Loads
        </button>
        <span style={{ color: "var(--border)", fontSize: 14, userSelect: "none" }}>/</span>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "var(--primary)", backgroundColor: "var(--secondary)", borderRadius: 4, padding: "2px 8px" }}>
          {load.loadId}
        </span>
        <StatusBadge status={load.status} />
      </div>

      {/* Tab bar */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 2, padding: "0 16px", backgroundColor: "var(--card)", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: "inline-flex", alignItems: "center", gap: 7,
                padding: "10px 14px",
                fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: active ? 600 : 400,
                color: active ? "var(--primary)" : "var(--muted-foreground)",
                backgroundColor: "transparent", border: "none",
                borderBottom: active ? "2px solid var(--primary)" : "2px solid transparent",
                cursor: "pointer", marginBottom: -1, outline: "none", transition: "all 0.15s",
              }}
            >
              <span style={{ opacity: active ? 1 : 0.6 }}>{t.icon}</span>
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: 20 }}>

        {/* ── Load Info tab ── */}
        {tab === "info" && (
          <div style={{ display: "flex", gap: 18, alignItems: "flex-start" }}>

            {/* Left: people & financials */}
            <div style={{ width: 240, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                {infoRows.map((row, i) => (
                  <div key={row.label} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 14px", borderBottom: i < infoRows.length - 1 ? "1px solid var(--border)" : "none" }}>
                    <div style={{ color: "var(--muted-foreground)", marginTop: 1, flexShrink: 0 }}>{row.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>
                        {row.label}
                      </div>
                      <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--foreground)" }}>
                        {row.value}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: route + appointments */}
            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>

              {/* Route card */}
              {(() => {
                const waypoints = (load.stops ?? []).map((s) => ({ city: s.city, appt: s.appt, done: s.done ?? false }));
                const isLast = (i: number) => i === waypoints.length - 1;
                return (
                  <div style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, padding: "20px 24px" }}>
                    <div style={{ fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 16 }}>
                      Route · {waypoints.length} stop{waypoints.length !== 1 ? "s" : ""}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      {waypoints.map((wp, i) => (
                        <div key={i} style={{ display: "flex", gap: 14, alignItems: "stretch" }}>
                          {/* Timeline spine */}
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0, width: 16 }}>
                            <div style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: wp.done ? "#10B981" : isLast(i) ? "#EF4444" : i === 0 ? "#10B981" : "#94A3B8", flexShrink: 0, marginTop: 3 }} />
                            {!isLast(i) && <div style={{ width: 2, flex: 1, backgroundColor: "var(--border)", marginTop: 4, marginBottom: 4 }} />}
                          </div>
                          {/* Content */}
                          <div style={{ flex: 1, paddingBottom: isLast(i) ? 0 : 14 }}>
                            <div style={{ fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>
                              Stop {i + 1}
                            </div>
                            <div style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 700, color: wp.done ? "var(--muted-foreground)" : "var(--foreground)", textDecoration: wp.done ? "line-through" : "none" }}>
                              {wp.city || "—"}
                            </div>
                            {wp.appt && (
                              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>{wp.appt}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}

            </div>
          </div>
        )}

        {/* ── Change Log tab ── */}
        {tab === "log" && (
          <div style={{ maxWidth: 640 }}>
            {logLoading ? (
              <div style={{ padding: "48px 20px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>Loading…</div>
            ) : logError ? (
              <div style={{ padding: "48px 20px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "#EF4444" }}>{logError}</div>
            ) : log.length === 0 ? (
              <div style={{ padding: "48px 20px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>No change log entries.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                {log.map((entry) => {
                  const time = new Date(entry.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
                  const actionColor = entry.action === "create" ? "#10B981" : entry.action === "delete" ? "#EF4444" : "#3B82F6";
                  const actionBg    = entry.action === "create" ? "rgba(16,185,129,0.14)" : entry.action === "delete" ? "rgba(239,68,68,0.14)" : "rgba(59,130,246,0.14)";
                  return (
                    <div key={entry.id} style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: "13px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                      {/* Header */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, color: "var(--foreground)" }}>
                          {entry.actor_name || "Unknown"}
                        </span>
                        <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 700, color: actionColor, backgroundColor: actionBg, borderRadius: 4, padding: "1px 7px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                          {entry.action}
                        </span>
                        <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)" }}>{time}</span>
                      </div>
                      {/* Changes */}
                      {entry.changes && entry.changes.length > 0 && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          {entry.changes.map((c, i) => (
                            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: "var(--font-sans)", fontSize: 12 }}>
                              <span style={{ color: "var(--muted-foreground)", minWidth: 90, textTransform: "capitalize" }}>{c.field.replace(/_/g, " ")}</span>
                              <span style={{ color: "#EF4444", backgroundColor: "rgba(239,68,68,0.14)", borderRadius: 3, padding: "0 5px", fontFamily: "var(--font-mono)", fontSize: 11, textDecoration: "line-through" }}>
                                {String(c.from ?? "—")}
                              </span>
                              <span style={{ color: "var(--muted-foreground)" }}>→</span>
                              <span style={{ color: "#10B981", backgroundColor: "rgba(16,185,129,0.14)", borderRadius: 3, padding: "0 5px", fontFamily: "var(--font-mono)", fontSize: 11 }}>
                                {String(c.to ?? "—")}
                              </span>
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
        )}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function LoadsPage() {
  const { user } = useAuth();
  const canCreate = hasPerm(user, "loads", "create");
  const canUpdate = hasPerm(user, "loads", "update");
  const canDelete = hasPerm(user, "loads", "delete");
  const [loads, setLoads]           = useState<Load[]>([]);
  const [total, setTotal]           = useState(0);
  const [loading, setLoading]       = useState(true);
  const [fetchKey, setFetchKey]     = useState(0);
  const [modal, setModal]           = useState<"create" | "edit" | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving]         = useState(false);
  const [editing, setEditing]       = useState<Partial<Load>>({});
  const [deleting, setDeleting]     = useState<Load | null>(null);
  const [delBusy, setDelBusy]       = useState(false);
  const [delErr, setDelErr]         = useState<string | null>(null);
  const [filterStatus, setFilter]   = useState("All");
  const [search, setSearch]         = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage]             = useState(1);
  const [pageSize, setPageSize]     = useState(20);
  const [detailLoad, setDetail]     = useState<Load | null>(null);
  const [toast, setToast]           = useState<{ type: "success" | "error"; msg: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

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
      .catch((e) => setToast({ type: "error", msg: String(e) }))
      .finally(() => setLoading(false));
  }, [fetchKey, debouncedSearch, filterStatus, page, pageSize]);

  const patchLoad = async (id: string, fields: Partial<Load>) => {
    const current = loads.find((l) => l.id === id);
    if (!current) return;
    const updated = withCompletedStops({ ...current, ...fields });
    setLoads((prev) => prev.map((l) => (l.id === id ? updated : l)));
    try {
      await api.put<BackendLoad>(`/loads/${id}`, toBackend(updated));
      setToast({ type: "success", msg: "Status updated" });
      setFetchKey((k) => k + 1);
    } catch (e) {
      setToast({ type: "error", msg: e instanceof Error ? e.message : "Update failed" });
      setFetchKey((k) => k + 1);
    }
  };

  // Moving a load out of `completed` deletes its payout, so it asks first.
  const [uncompleting, setUncompleting] = useState<{ load: Load; to: Status } | null>(null);

  const requestStatus = (l: Load, s: Status) => {
    if (l.status === "completed" && s !== "completed") { setUncompleting({ load: l, to: s }); return; }
    patchLoad(l.id, { status: s });
  };

  const openCreate = () => { setEditing({}); setModal("create"); };
  const openEdit   = (l: Load) => { setEditing(l); setModal("edit"); };

  // The draft is never persisted by the extractor — drop it into the normal create
  // modal so a human reviews it, assigns driver/dispatcher, and saves via POST /loads.
  const openFromDraft = (draft: ExtractDraft) => {
    setExtracting(false);
    setEditing(draftToLoad(draft));
    setModal("create");
  };

  const save = async (l: Load) => {
    setSaving(true);
    const load = withCompletedStops(l);
    try {
      if (modal === "create") {
        await api.post<BackendLoad>("/loads", toBackend(load, { create: true }));
        setToast({ type: "success", msg: `Load ${load.loadId || ""} created` });
      } else {
        // Changing driver_id is a queue move, not a field edit: the server detaches the
        // old driver (rotating their deck) and slots the load onto the new one, where
        // the slot — not us — decides the status. So don't re-assert the status we're
        // looking at unless the user actually picked a new one. It matters most on a
        // completed load: re-sending status:"completed" alongside a new driver_id is
        // precisely the request that re-attributes the payout to the new driver, and a
        // reassign shouldn't quietly move someone's money.
        const reassigning = load.driver_id !== (editing.driver_id ?? "");
        const pickedStatus = load.status !== editing.status;
        const body = toBackend(load, { omitStatus: reassigning && !pickedStatus });
        await api.put<BackendLoad>(`/loads/${load.id}`, body);
        setToast({ type: "success", msg: `Load ${load.loadId || ""} updated` });
      }
      setModal(null);
      setFetchKey((k) => k + 1);
    } catch (e) {
      setToast({ type: "error", msg: String(e) });
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!deleting) return;
    const label = deleting.loadId;
    setDelErr(null);
    setDelBusy(true);
    try {
      await api.delete(`/loads/${deleting.id}`);
      setDeleting(null);
      setToast({ type: "success", msg: `Load ${label} deleted` });
      setFetchKey((k) => k + 1);
    } catch (e) {
      setDelErr(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDelBusy(false);
    }
  };

  const handleSearch = (v: string) => setSearch(v);
  const handleFilter = (v: string) => setFilter(v);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "var(--background)", overflow: "hidden" }}>
      {toast && (
        <div style={{
          position: "fixed", top: 24, right: 24, zIndex: 9999,
          backgroundColor: toast.type === "success" ? "#10B981" : "#EF4444",
          color: "#fff", borderRadius: 8, padding: "10px 16px",
          fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500,
          boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
          display: "flex", alignItems: "center", gap: 8,
        }}>
          {toast.type === "success" ? <Check size={15} /> : <AlertCircle size={15} />}
          {toast.msg}
          <button onClick={() => setToast(null)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.75)", cursor: "pointer", display: "flex", padding: 0, marginLeft: 4 }}>
            <X size={13} />
          </button>
        </div>
      )}
      <div style={{ flex: 1, overflow: "hidden", padding: "20px 24px", display: "flex", flexDirection: "column" }}>
        <div style={{
          flex: 1, display: "flex", flexDirection: "column", overflow: "hidden",
          backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 12,
        }}>
          {detailLoad ? (
            <LoadDetail load={detailLoad} onBack={() => setDetail(null)} />
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
                onFocus={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.12)"; }}
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
            <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "collapse", opacity: loading && loads.length > 0 ? 0.45 : 1, pointerEvents: loading ? "none" : "auto", transition: "opacity 0.15s" }}>
              <thead>
                <tr>
                  <TH width={40}>#</TH>
                  <TH width={110}>Load ID</TH>
                  <TH width={170}>Broker</TH>
                  <TH width={190}>Driver</TH>
                  <TH width={120}>Status</TH>
                  <TH width={240}>Route</TH>
                  <TH width={190}>Appt Times</TH>
                  <TH width={100} align="right">Miles</TH>
                  <TH width={100} align="right">Rate</TH>
                  <TH width={120}>Dispatcher</TH>
                  <TH width={90} align="center">Actions</TH>
                </tr>
              </thead>
              <tbody>
                {loads.map((l, i) => (
                  <tr
                    key={l.id}
                    style={{ backgroundColor: i % 2 === 0 ? "var(--card)" : "var(--background)" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "rgba(59,130,246,0.03)"; }}
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
                      {l.broker || "—"}
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
                                    {stop.city || "—"}
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
                              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: isDone ? "var(--muted-foreground)" : isCurrent ? "#2563EB" : "var(--foreground)", textDecoration: isDone ? "line-through" : "none" }}>
                                {stop.appt || "—"}
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
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted-foreground)" }}>—</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", verticalAlign: "middle", textAlign: "right" }}>
                      <span style={{
                        fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700,
                        color: l.payout === 0 ? "var(--muted-foreground)" : l.status === "re_update" ? "#EF4444" : "#10B981",
                      }}>
                        {fmt(l.payout)}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", verticalAlign: "middle" }}>
                      <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: l.dispatcher ? "var(--foreground)" : "var(--muted-foreground)" }}>{l.dispatcher || "—"}</span>
                    </td>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", verticalAlign: "middle", textAlign: "center" }}>
                      <div style={{ display: "inline-flex", gap: 5 }}>
                        {canUpdate && <ActionBtn icon={<Pencil size={13} />} color="#3B82F6" bg="rgba(59,130,246,0.14)" onClick={() => openEdit(l)} />}
                        {canDelete && <ActionBtn icon={<Trash2 size={13} />} color="#EF4444" bg="rgba(239,68,68,0.14)" onClick={() => setDeleting(l)} />}
                        {!canUpdate && !canDelete && <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)" }}>—</span>}
                      </div>
                    </td>
                  </tr>
                ))}
                {loading && loads.length === 0 && (
                  <tr>
                    <td colSpan={11} style={{ padding: "40px 20px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>
                      Loading…
                    </td>
                  </tr>
                )}
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
      {(modal === "create" || modal === "edit") && (
        <LoadModal load={editing} onClose={() => setModal(null)} onSave={save} saving={saving} />
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
