import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Status, STATUS_CONFIG, ALL_STATUSES } from "../lib/statuses";
import { api, ApiError, isForbidden } from "../lib/api";
import { useAuth } from "../lib/auth";
import { hasPerm } from "../lib/permissions";
import { driverDisplayName } from "../lib/driverName";
import { menuPosition } from "../lib/menuPosition";
import { UncompleteConfirm } from "./UncompleteConfirm";
import { EldModal } from "./EldModal";
import { PageLoader } from "./PageLoader";
import {
  User, Users, Plus, Pencil, Trash2, MapPin, MessageSquare,
  X, Check, Search, ChevronDown, ChevronLeft, ChevronRight,
  ClipboardList, FileSpreadsheet, Radio, Upload, FileText,
  ArrowLeft, Phone, Truck, DollarSign, Route, Package, TrendingUp,
  AlertCircle, GripVertical, ExternalLink,
} from "lucide-react";

type DriverStatus = Status;
type DriverType   = "O/O" | "C/D";

// ─── Types ───────────────────────────────────────────────────────────────────

// One entry in the driver's ordered upcoming-load queue (next_loads[])
interface QueueLoad { id: string; loadId: string }

// How a driver is paid. "" is the backend's default (unconfigured) — pay reports as 0
// rather than being guessed, so we never send a rate without a type.
type PayType = "" | "rpm" | "percent";

const PAY_TYPE_OPTS = [
  { value: "",        label: "Not set" },
  { value: "rpm",     label: "Per mile (RPM)" },
  { value: "percent", label: "% of gross" },
];

interface SoloDriver {
  id: string; name: string; phone: string; type: DriverType;
  status: DriverStatus; truck: string; trailer: string; location: string; comment: string;
  eldLocation?: string; // truck's own location from the ELD (read-only); preferred over the typed one
  eldLat?: number; eldLng?: number; // the truck's coords, for the Google Maps link
  truckId?: string;    // assigned truck's id — settable (tri-state: "" unassigns)
  trailerId?: string;  // assigned trailer's id — settable (tri-state: "" unassigns)
  weeklyGrossTarget?: number;
  payType?: PayType;
  payRate?: number;    // $/mile when rpm, a percentage (0–100) when percent
  currentLoad?: string;
  currentLoadId?: string;
  nextLoad?: string;
  nextLoadId?: string;
  nextLoads?: QueueLoad[];
}

interface TeamDriver {
  id: string; name1: string; name2: string; phone1: string; phone2: string;
  type: DriverType; status: DriverStatus; truck: string; trailer: string; location: string; comment: string;
  eldLocation?: string; // truck's own location from the ELD (read-only); preferred over the typed one
  eldLat?: number; eldLng?: number; // the truck's coords, for the Google Maps link
  truckId?: string;
  trailerId?: string;
  weeklyGrossTarget?: number;
  payType?: PayType;
  payRate?: number;
  currentLoad?: string;
  currentLoadId?: string;
  nextLoad?: string;
  nextLoadId?: string;
  nextLoads?: QueueLoad[];
}

// ─── API ↔ local shape mappers ───────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toSolo(d: any): SoloDriver {
  return {
    id: d.id,
    name: d.name ?? "",
    phone: d.phone ?? "",
    type: (d.type as DriverType) ?? "O/O",
    status: (d.status as DriverStatus) ?? "ready",
    truck: d.truck ?? "",
    trailer: d.trailer ?? "",
    truckId: d.truck_id ?? "",
    trailerId: d.trailer_id ?? "",
    location: d.location ?? "",
    eldLocation: d.eld?.location || undefined,
    eldLat: d.eld?.lat ?? undefined,
    eldLng: d.eld?.lng ?? undefined,
    comment: d.comment ?? "",
    weeklyGrossTarget: d.weekly_gross_target || undefined,
    payType:  (d.pay_type as PayType) ?? "",
    payRate:  d.pay_rate ?? undefined,
    currentLoad:   d.current_load    || undefined,
    currentLoadId: d.current_load_id || undefined,
    nextLoad:      d.next_load       || undefined,
    nextLoadId:    d.next_load_id    || undefined,
    nextLoads:     (d.next_loads ?? []).map((l: any) => ({ id: l.id, loadId: l.load_id ?? l.id })),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toTeam(d: any): TeamDriver {
  return {
    id: d.id,
    name1: d.name ?? "",
    name2: d.name2 ?? "",
    phone1: d.phone ?? "",
    phone2: d.phone2 ?? "",
    type: (d.type as DriverType) ?? "C/D",
    status: (d.status as DriverStatus) ?? "ready",
    truck: d.truck ?? "",
    trailer: d.trailer ?? "",
    truckId: d.truck_id ?? "",
    trailerId: d.trailer_id ?? "",
    location: d.location ?? "",
    eldLocation: d.eld?.location || undefined,
    eldLat: d.eld?.lat ?? undefined,
    eldLng: d.eld?.lng ?? undefined,
    comment: d.comment ?? "",
    weeklyGrossTarget: d.weekly_gross_target || undefined,
    payType:  (d.pay_type as PayType) ?? "",
    payRate:  d.pay_rate ?? undefined,
    currentLoad:   d.current_load    || undefined,
    currentLoadId: d.current_load_id || undefined,
    nextLoad:      d.next_load       || undefined,
    nextLoadId:    d.next_load_id    || undefined,
    nextLoads:     (d.next_loads ?? []).map((l: any) => ({ id: l.id, loadId: l.load_id ?? l.id })),
  };
}

function fromSolo(d: Partial<SoloDriver>) {
  return {
    // Driver names are stored uppercase — the board, payouts and team rosters all key
    // off the raw name, so normalising on write keeps them consistent everywhere.
    name: (d.name ?? "").toUpperCase(),
    phone: d.phone ?? "",
    type: d.type ?? "C/D",
    team: false,
    status: d.status ?? "ready",
    // truck/trailer are read-only derived fields now — assign via id instead.
    // Tri-state, but the modal is a full-form save, so always send a concrete
    // value: "" unassigns, a uuid assigns (never omitted/null, which would mean
    // "leave unchanged" — the form's current value IS the desired end state).
    truck_id: d.truckId ?? "",
    trailer_id: d.trailerId ?? "",
    location: d.location ?? "",
    comment: d.comment ?? "",
    weekly_gross_target: d.weeklyGrossTarget ?? 0,
    pay_type: d.payType ?? "",
    // A rate without a type is meaningless — the backend treats "" as unconfigured and
    // reports pay as 0, so never ship a stale rate alongside it.
    pay_rate: d.payType ? (d.payRate ?? 0) : 0,
    next_load_id: d.nextLoadId || null,
  };
}

function fromTeam(d: Partial<TeamDriver>) {
  return {
    // Uppercase for the same reason as fromSolo — the name is the identity key.
    name: (d.name1 ?? "").toUpperCase(),
    name2: (d.name2 ?? "").toUpperCase(),
    phone: d.phone1 ?? "",
    phone2: d.phone2 ?? "",
    type: d.type ?? "C/D",
    team: true,
    status: d.status ?? "ready",
    truck_id: d.truckId ?? "",
    trailer_id: d.trailerId ?? "",
    location: d.location ?? "",
    comment: d.comment ?? "",
    weekly_gross_target: d.weeklyGrossTarget ?? 0,
    pay_type: d.payType ?? "",
    // A rate without a type is meaningless — the backend treats "" as unconfigured and
    // reports pay as 0, so never ship a stale rate alongside it.
    pay_rate: d.payType ? (d.payRate ?? 0) : 0,
    next_load_id: d.nextLoadId || null,
  };
}

// One Location cell: the truck's ELD location when it's reporting, else the dispatcher's
// typed location, plus a Google Maps Directions button (origin = the truck's coords) when
// the ELD has given us a position — same behaviour as the board's Location column.
function LocationCell({ location, eldLocation, lat, lng }: {
  location?: string; eldLocation?: string; lat?: number; lng?: number;
}) {
  const text = eldLocation || location || "—";
  const hasCoords = lat != null && lng != null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 5, maxWidth: "100%" }}>
      <MapPin size={11} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{text}</span>
      {hasCoords && (
        <button
          type="button"
          title="Directions from here in Google Maps"
          onClick={() => window.open(`https://www.google.com/maps/dir/?api=1&origin=${lat},${lng}`, "_blank", "noopener,noreferrer")}
          style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, width: 20, height: 20, borderRadius: 5, border: "none", backgroundColor: "transparent", cursor: "pointer", color: "var(--muted-foreground)" }}
          onMouseEnter={(e) => { const b = e.currentTarget; b.style.backgroundColor = "var(--muted)"; b.style.color = "var(--primary)"; }}
          onMouseLeave={(e) => { const b = e.currentTarget; b.style.backgroundColor = "transparent"; b.style.color = "var(--muted-foreground)"; }}
        >
          <ExternalLink size={12} />
        </button>
      )}
    </span>
  );
}

// Maps a truck/trailer assignment error to the offending equipment field, so the
// modal can show it inline instead of (or in addition to) a generic toast.
function equipmentFieldError(e: unknown): { truck?: string; trailer?: string } | null {
  if (!(e instanceof ApiError)) return null;
  if (e.code === "invalid_truck" || e.code === "truck_assigned") return { truck: e.message };
  if (e.code === "invalid_trailer" || e.code === "trailer_assigned") return { trailer: e.message };
  return null;
}

// ─── Custom Select ────────────────────────────────────────────────────────────

interface SelectOpt { value: string; label: string; dot?: string; takenBy?: string }

function CustomSelect({
  value, options, onChange, width, compact = false, dropUp = false, searchable = false, disabled = false, error = false,
}: {
  value: string;
  options: SelectOpt[];
  onChange: (v: string) => void;
  width?: number | string;
  compact?: boolean;
  dropUp?: boolean;
  searchable?: boolean;
  disabled?: boolean;
  error?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const selected = options.find((o) => o.value === value);
  const h = compact ? 30 : 34;
  const filtered = searchable && query
    ? options.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
    : options;

  return (
    <div ref={ref} style={{ position: "relative", width: width ?? "100%" }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) { setOpen((v) => !v); setQuery(""); } }}
        style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%",
          height: h, paddingLeft: 10, paddingRight: 8,
          fontFamily: "var(--font-sans)", fontSize: compact ? 12 : 13,
          backgroundColor: disabled ? "var(--muted)" : error ? "rgba(239,68,68,0.04)" : "var(--input-background)",
          border: `1px solid ${error ? "#EF4444" : open ? "var(--primary)" : "var(--border)"}`,
          borderRadius: 7, color: disabled ? "var(--muted-foreground)" : "var(--foreground)",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.55 : 1,
          boxShadow: error ? "0 0 0 3px rgba(239,68,68,0.10)" : open ? "0 0 0 3px rgba(59,130,246,0.12)" : "none",
          transition: "border-color 0.15s, box-shadow 0.15s",
          outline: "none",
        }}
      >
        {selected?.dot && (
          <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: selected.dot, flexShrink: 0 }} />
        )}
        <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {selected?.label ?? "Select…"}
        </span>
        <ChevronDown
          size={13}
          style={{
            color: "var(--muted-foreground)", flexShrink: 0,
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.15s",
          }}
        />
      </button>

      {open && (
        <div style={{
          position: "absolute",
          ...(dropUp
            ? { bottom: "calc(100% + 4px)", top: "auto" }
            : { top: "calc(100% + 4px)", bottom: "auto" }),
          left: 0,
          minWidth: "100%", width: "max-content",
          backgroundColor: "var(--card)",
          border: "1px solid var(--border)", borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.10)",
          zIndex: 200, overflow: "hidden",
        }}>
          {searchable && (
            <div style={{ padding: "8px 8px 4px" }}>
              <div style={{ position: "relative" }}>
                <Search size={12} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground)", pointerEvents: "none" }} />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search…"
                  style={{
                    width: "100%", height: 30, paddingLeft: 26, paddingRight: 8,
                    fontFamily: "var(--font-sans)", fontSize: 12,
                    border: "1px solid var(--border)", borderRadius: 6,
                    backgroundColor: "var(--input-background)", color: "var(--foreground)",
                    outline: "none", boxSizing: "border-box",
                  }}
                />
              </div>
            </div>
          )}
          {filtered.map((opt) => {
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
                  border: "none", cursor: "pointer", textAlign: "left",
                  outline: "none",
                }}
                onMouseEnter={(e) => {
                  if (!isActive)
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--muted)";
                }}
                onMouseLeave={(e) => {
                  if (!isActive)
                    (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
                }}
              >
                {opt.dot && (
                  <span style={{ width: 7, height: 7, borderRadius: "50%", backgroundColor: opt.dot, flexShrink: 0 }} />
                )}
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

// ─── Async paginated unit select (Trucks / Trailers) ───────────────────────────
// /trucks and /trailers are backend-paginated (?page=&page_size=) with a `q`
// search the backend matches against unit/make/model/vin/driver name. Rather
// than pulling the whole fleet into memory, this fetches a page at a time,
// loads more as the user scrolls the option list, and re-queries the backend
// as they type (debounced) — so the dropdown scales the same whether the
// company has 20 trucks or 2,000.
function UnitSelect({ value, label, endpoint, onChange, error = false, disabled = false }: {
  value: string;
  label: string; // known display label for `value` — the driver row's own resolved unit name, so the closed button never depends on this list having loaded that page
  endpoint: "/trucks" | "/trailers";
  onChange: (id: string, label: string) => void;
  error?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [items, setItems] = useState<SelectOpt[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [denied, setDenied] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const loadPage = async (pageNum: number, q: string, replace: boolean) => {
    const id = ++reqId.current; // guards against a slower stale request clobbering a newer one
    setLoading(true);
    try {
      const { items: rows, total: t } = await api.getList<{ id: string; unit?: string; driver?: string; driver_name2?: string; driver_team?: boolean }>(endpoint, { q: q || undefined, page: pageNum, page_size: 20 });
      if (id !== reqId.current) return;
      // The /trucks & /trailers rows already carry their assigned driver (LEFT JOIN),
      // so we can flag "taken" units for free — no extra request.
      const opts = (rows ?? []).map((u) => ({
        value: u.id,
        label: u.unit ?? u.id,
        takenBy: u.driver ? driverDisplayName({ name: u.driver, name2: u.driver_name2, team: u.driver_team }) : undefined,
      }));
      setItems((prev) => (replace ? opts : [...prev, ...opts]));
      setTotal(t);
      setPage(pageNum);
      setDenied(false);
    } catch (e) {
      // A 403 means the caller lacks fleet access — surface that instead of a
      // silently-empty list that reads as "no trucks exist".
      if (id === reqId.current && isForbidden(e)) setDenied(true);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  };

  // Fresh page-1 fetch every time the dropdown opens, and again as the search settles.
  useEffect(() => {
    if (!open) return;
    setItems([]); setTotal(0); setPage(1);
    void loadPage(1, debouncedQuery, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, debouncedQuery]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el || loading) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 48 && items.length < total) {
      void loadPage(page + 1, debouncedQuery, false);
    }
  };

  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => { if (!disabled) { setOpen((v) => !v); setQuery(""); } }}
        style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%",
          height: 34, paddingLeft: 10, paddingRight: 8,
          fontFamily: "var(--font-sans)", fontSize: 13,
          backgroundColor: disabled ? "var(--muted)" : error ? "rgba(239,68,68,0.04)" : "var(--input-background)",
          border: `1px solid ${error ? "#EF4444" : open ? "var(--primary)" : "var(--border)"}`,
          borderRadius: 7, color: disabled ? "var(--muted-foreground)" : "var(--foreground)",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.55 : 1,
          boxShadow: error ? "0 0 0 3px rgba(239,68,68,0.10)" : open ? "0 0 0 3px rgba(59,130,246,0.12)" : "none",
          transition: "border-color 0.15s, box-shadow 0.15s",
          outline: "none",
        }}
      >
        <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: value ? "var(--foreground)" : "var(--muted-foreground)" }}>
          {value ? (label || value) : "Select…"}
        </span>
        {value && !disabled && (
          <span
            role="button"
            title="Clear"
            onClick={(e) => { e.stopPropagation(); onChange("", ""); setOpen(false); }}
            style={{ display: "flex", flexShrink: 0, color: "var(--muted-foreground)", cursor: "pointer", borderRadius: 4 }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLSpanElement).style.color = "#EF4444"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLSpanElement).style.color = "var(--muted-foreground)"; }}
          >
            <X size={13} />
          </span>
        )}
        <ChevronDown size={13} style={{ color: "var(--muted-foreground)", flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0,
          minWidth: "100%", width: "max-content",
          backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.10)", zIndex: 200, overflow: "hidden",
        }}>
          <div style={{ padding: "8px 8px 4px" }}>
            <div style={{ position: "relative" }}>
              <Search size={12} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground)", pointerEvents: "none" }} />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                style={{ width: "100%", height: 30, paddingLeft: 26, paddingRight: 8, fontFamily: "var(--font-sans)", fontSize: 12, border: "1px solid var(--border)", borderRadius: 6, backgroundColor: "var(--input-background)", color: "var(--foreground)", outline: "none", boxSizing: "border-box" }}
              />
            </div>
          </div>
          <div ref={listRef} onScroll={onScroll} style={{ maxHeight: 200, overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
            {items.map((opt) => {
              const isActive = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => { onChange(opt.value, opt.label); setOpen(false); }}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 12px", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: isActive ? 600 : 400, color: isActive ? "var(--primary)" : "var(--foreground)", backgroundColor: isActive ? "var(--accent)" : "transparent", border: "none", cursor: "pointer", textAlign: "left", outline: "none" }}
                  onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--muted)"; }}
                  onMouseLeave={(e) => { if (!isActive) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
                >
                  <span style={{ flexShrink: 0 }}>{opt.label}</span>
                  {/* Taken by another driver — informational; still selectable (mark + allow).
                      Skip it on the active option, which is this driver's own unit. */}
                  {opt.takenBy && !isActive && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 500, color: "#B45309", backgroundColor: "rgba(245,158,11,0.14)", borderRadius: 4, padding: "1px 6px", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 150 }}>
                      <User size={9} style={{ flexShrink: 0 }} /> {opt.takenBy}
                    </span>
                  )}
                  <span style={{ flex: 1 }} />
                  {isActive && <Check size={13} style={{ color: "var(--primary)", flexShrink: 0 }} />}
                </button>
              );
            })}
            {loading && (
              <div style={{ padding: "8px 12px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)" }}>Loading…</div>
            )}
            {!loading && items.length === 0 && (
              <div style={{ padding: "10px 12px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)" }}>
                {denied ? "You don't have access to the fleet list." : "No results"}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Truck/Trailer picker that respects fleet access. Listing /trucks and /trailers
// needs equipments.read; a role without it (e.g. Updater) would otherwise get a
// silently-empty dropdown. When the user can't read the fleet, show the driver's
// current assignment read-only instead of an empty, broken select.
function EquipmentField({ canRead, value, label, endpoint, onChange, error }: {
  canRead: boolean;
  value: string; label: string;
  endpoint: "/trucks" | "/trailers";
  onChange: (id: string, label: string) => void;
  error?: boolean;
}) {
  if (canRead) return <UnitSelect value={value} label={label} endpoint={endpoint} onChange={onChange} error={error} />;
  return (
    <>
      <div style={{
        height: 34, display: "flex", alignItems: "center", padding: "0 10px",
        borderRadius: 7, border: "1px solid var(--border)", backgroundColor: "var(--muted)",
        fontFamily: "var(--font-sans)", fontSize: 13,
        color: label ? "var(--foreground)" : "var(--muted-foreground)",
      }}>
        {label || "—"}
      </div>
      <span style={{ fontFamily: "var(--font-sans)", fontSize: 10, color: "var(--muted-foreground)" }}>
        Requires fleet access to change
      </span>
    </>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

const PAGE_SIZES = [20, 40, 60, 100];

function Pagination({
  page, total, pageSize, onPage, onPageSize, totalPending = false, loading = false,
}: {
  page: number; total: number; pageSize: number; totalPending?: boolean; loading?: boolean;
  onPage: (p: number) => void; onPageSize: (s: number) => void;
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
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        minWidth: 30, height: 30, borderRadius: 6, padding: "0 6px",
        border: active ? "1.5px solid var(--primary)" : "1px solid var(--border)",
        backgroundColor: active ? "var(--primary)" : "transparent",
        color: active ? "#fff" : disabled ? "var(--muted-foreground)" : "var(--foreground)",
        fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: active ? 600 : 400,
        cursor: disabled ? "default" : "pointer",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        opacity: disabled ? 0.38 : 1,
        outline: "none",
        transition: "background-color 0.1s, color 0.1s",
      }}
    >
      {children}
    </button>
  );

  return (
    <div style={{
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "10px 16px", borderTop: "1px solid var(--border)",
      backgroundColor: "var(--card)", flexShrink: 0,
    }}>
      {/* Left: count info + rows-per-page */}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 5 }}>
          {loading && <span style={{ width: 12, height: 12, borderRadius: "50%", border: "2px solid var(--border)", borderTopColor: "var(--primary)", animation: "spin 0.7s linear infinite", display: "inline-block" }} />}
          {loading ? "Loading…" : total === 0 ? "No results" : `Showing ${from}–${to}`}
          {!loading && total > 0 && (totalPending
            ? <span style={{ fontSize: 8, fontWeight: 700, color: "#F59E0B", backgroundColor: "rgba(245,158,11,0.14)", border: "1px solid rgba(245,158,11,0.35)", borderRadius: 4, padding: "1px 4px", letterSpacing: "0.04em", textTransform: "uppercase" }}>total pending</span>
            : <span>of {total}</span>
          )}
        </span>
        <span style={{ color: "var(--border)", userSelect: "none" }}>·</span>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>
          Rows per page
        </span>
        <CustomSelect
          value={String(pageSize)}
          options={PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))}
          onChange={(v) => { onPageSize(Number(v)); onPage(1); }}
          width={72}
          compact
          dropUp
        />
      </div>

      {/* Right: prev / page numbers / next */}
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <PBtn disabled={loading || page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft size={14} />
        </PBtn>
        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`e${i}`} style={{ padding: "0 4px", fontSize: 13, color: "var(--muted-foreground)", lineHeight: "30px" }}>…</span>
          ) : (
            <PBtn key={p} active={p === page} disabled={loading && p !== page} onClick={() => onPage(p as number)}>{p}</PBtn>
          )
        )}
        <PBtn disabled={loading || page >= totalPages} onClick={() => onPage(page + 1)}>
          <ChevronRight size={14} />
        </PBtn>
      </div>
    </div>
  );
}

// ─── Shared table primitives ─────────────────────────────────────────────────

const TH = ({ children, width, align = "left" }: { children: React.ReactNode; width?: number | string; align?: string }) => (
  <th style={{
    padding: "8px 12px", textAlign: align as "left" | "center",
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

const TD = ({ children, mono = false, center = false }: { children: React.ReactNode; mono?: boolean; center?: boolean }) => (
  <td style={{
    padding: "10px 12px",
    fontFamily: mono ? "var(--font-mono)" : "var(--font-sans)",
    fontSize: mono ? 11 : 12,
    color: "var(--foreground)",
    borderBottom: "1px solid var(--border)",
    verticalAlign: "middle",
    textAlign: center ? "center" : "left",
  }}>
    {children}
  </td>
);

function StatusBadge({ status }: { status: DriverStatus }) {
  const c = STATUS_CONFIG[status];
  return (
    <span style={{
      display: "inline-flex", alignItems: "center",
      fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600,
      color: c.color, backgroundColor: c.bg, borderRadius: 4,
      padding: "2px 8px", whiteSpace: "nowrap",
    }}>
      {c.label}
    </span>
  );
}

function StatusDropdown({ value, onChange }: { value: Status; onChange: (s: Status) => void | Promise<void> }) {
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

  const cfg = STATUS_CONFIG[value];

  return (
    <>
      <div ref={anchorRef} onClick={busy ? undefined : toggle} style={{ cursor: busy ? "default" : "pointer", display: "inline-flex" }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600,
          color: cfg.color, backgroundColor: cfg.bg,
          borderRadius: 4, padding: "3px 8px", whiteSpace: "nowrap", userSelect: "none",
        }}>
          {cfg.label}
          {busy
            ? <span style={{ width: 9, height: 9, borderRadius: "50%", border: `1.5px solid ${cfg.color}55`, borderTopColor: cfg.color, animation: "spin 0.7s linear infinite", display: "inline-block", marginLeft: 1 }} />
            : <ChevronDown size={10} style={{ opacity: 0.7, marginLeft: 1 }} />}
        </span>
      </div>
      {open && rect && (() => {
        const { top, left } = menuPosition(rect, ALL_STATUSES.length, 168);
        return createPortal(
        <div ref={dropRef} style={{
          position: "fixed", top, left, zIndex: 9999,
          backgroundColor: "var(--card)", border: "1px solid var(--border)",
          borderRadius: 10, boxShadow: "0 10px 30px rgba(0,0,0,0.16)",
          padding: "5px", minWidth: 168, maxHeight: "calc(100vh - 16px)", overflowY: "auto",
          display: "flex", flexDirection: "column", gap: 1,
        }}>
          {ALL_STATUSES.map((s) => {
            const c = STATUS_CONFIG[s];
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

function TypeBadge({ type }: { type: DriverType }) {
  return (
    <span style={{
      fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600,
      color: type === "O/O" ? "#3B82F6" : "#8B5CF6",
      backgroundColor: type === "O/O" ? "rgba(59,130,246,0.14)" : "rgba(139,92,246,0.14)",
      borderRadius: 4, padding: "2px 7px",
    }}>
      {type}
    </span>
  );
}

function ActionBtn({ icon, color, bg, onClick }: { icon: React.ReactNode; color: string; bg: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 28, height: 28, borderRadius: 6, border: "none",
        backgroundColor: bg, color, cursor: "pointer",
        display: "inline-flex", alignItems: "center", justifyContent: "center",
        transition: "opacity 0.15s",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "0.7"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
    >
      {icon}
    </button>
  );
}

// ─── Shared select option sets ────────────────────────────────────────────────

const STATUS_OPTS: SelectOpt[] = [
  { value: "All", label: "All Statuses" },
  ...ALL_STATUSES.map((s) => ({ value: s, label: STATUS_CONFIG[s].label })),
];

const STATUS_MODAL_OPTS: SelectOpt[] = STATUS_OPTS.slice(1);

const TYPE_OPTS: SelectOpt[] = [
  { value: "O/O", label: "O/O — Owner Operator" },
  { value: "C/D", label: "C/D — Company Driver"  },
];

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ msg, type, onClose }: { msg: string; type: "success" | "error"; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, []);
  return (
    <div style={{
      position: "fixed", top: 24, right: 24, zIndex: 9999,
      backgroundColor: type === "success" ? "#10B981" : "#EF4444",
      color: "#fff", borderRadius: 8, padding: "10px 16px",
      display: "flex", alignItems: "center", gap: 8,
      boxShadow: "0 4px 20px rgba(0,0,0,0.18)",
      fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500,
    }}>
      {type === "success" ? <Check size={15} /> : <AlertCircle size={15} />}
      {msg}
      <button onClick={onClose} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.75)", cursor: "pointer", display: "flex", padding: 0, marginLeft: 4 }}>
        <X size={13} />
      </button>
    </div>
  );
}

// ─── Field label ─────────────────────────────────────────────────────────────

const PendingBadge = () => (
  <span style={{ fontSize: 8, fontWeight: 700, color: "#F59E0B", backgroundColor: "rgba(245,158,11,0.14)", border: "1px solid rgba(245,158,11,0.35)", borderRadius: 4, padding: "1px 4px", letterSpacing: "0.04em", textTransform: "uppercase" as const, marginLeft: 4 }}>
    backend pending
  </span>
);

const FieldLabel = ({ children, required, pending, error }: { children: React.ReactNode; required?: boolean; pending?: boolean; error?: boolean }) => (
  <span style={{
    display: "flex", alignItems: "center",
    fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600,
    color: error ? "#EF4444" : "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em",
  }}>
    {children}
    {required && <span style={{ color: "#EF4444", marginLeft: 2 }}>*</span>}
    {pending && <PendingBadge />}
  </span>
);

const FieldInput = ({ value, onChange, onBlur, placeholder, error, disabled }: {
  value: string; onChange: (v: string) => void; onBlur?: () => void; placeholder?: string; error?: boolean; disabled?: boolean;
}) => (
  <input
    value={value}
    onChange={(e) => onChange(e.target.value)}
    placeholder={placeholder}
    disabled={disabled}
    style={{
      fontFamily: "var(--font-sans)", fontSize: 13,
      padding: "7px 10px", borderRadius: 6, height: 34,
      border: `1px solid ${error ? "#EF4444" : "var(--border)"}`,
      backgroundColor: disabled ? "var(--muted)" : error ? "rgba(239,68,68,0.04)" : "var(--input-background)",
      color: disabled ? "var(--muted-foreground)" : "var(--foreground)",
      boxShadow: error ? "0 0 0 3px rgba(239,68,68,0.10)" : "none",
      outline: "none", width: "100%", boxSizing: "border-box" as const,
      cursor: disabled ? "not-allowed" : undefined,
      opacity: disabled ? 0.55 : 1,
      transition: "border-color 0.15s, box-shadow 0.15s",
    }}
    onFocus={(e) => {
      if (!disabled && !error) {
        e.currentTarget.style.borderColor = "var(--primary)";
        e.currentTarget.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.12)";
      }
    }}
    onBlur={(e) => {
      onBlur?.();
      if (!disabled) {
        e.currentTarget.style.borderColor = error ? "#EF4444" : "var(--border)";
        e.currentTarget.style.boxShadow = error ? "0 0 0 3px rgba(239,68,68,0.10)" : "none";
      }
    }}
  />
);

// ─── Load queue (drag & drop) ─────────────────────────────────────────────────

// The driver's loads as one list: what they're running now, then what's queued.
// An idle driver has no deck, so the list is just the queue.
function deckOrder(d: { currentLoad?: string; currentLoadId?: string; nextLoads?: QueueLoad[] }): QueueLoad[] {
  const queue = d.nextLoads ?? [];
  if (!d.currentLoadId) return queue;
  return [{ id: d.currentLoadId, loadId: d.currentLoad || d.currentLoadId }, ...queue];
}

// Compares a driver's edited load order against its original to work out what to send
// on Save. The list reads as one thing but the backend keeps the deck and the queue
// apart, and only Save should touch either — not the drag itself:
//
//   PUT /drivers/:id  { current_load_id }  — swap the deck. The named load becomes
//     current and inherits the SLOT's status (a driver mid-enroute stays enroute, now
//     running the other load); the load it replaces is demoted to the head of the queue.
//   PUT /drivers/:id/queue  { load_ids }   — reorder the queue. load_ids must be an
//     exact permutation of the queued loads, so the current load may never appear in it.
//
// Demote-to-head is why a plain drag maps so cleanly: dragging C to the top of
// [A,B,C,D] leaves the server at [C, A,B,D] — exactly what the drag meant. The queue
// call then fixes up the tail for the drags where it doesn't land right on its own
// (e.g. dragging the current load to the bottom).
function loadOrderPatch(
  edited: { currentLoadId?: string; nextLoads?: QueueLoad[] },
  original: { currentLoadId?: string; nextLoads?: QueueLoad[] } | undefined,
) {
  const swapped = !!original && edited.currentLoadId !== original.currentLoadId;
  const origTailIds = (original?.nextLoads ?? []).map((q) => q.id);
  const newTailIds  = (edited.nextLoads   ?? []).map((q) => q.id);
  const queueChanged = newTailIds.length > 0 &&
    (origTailIds.length !== newTailIds.length || origTailIds.some((id, i) => id !== newTailIds[i]));
  return { swapped, queueChanged, newTailIds };
}

// One list: the load the driver is running (top) followed by the queue. Drag any row
// anywhere. Dropping a row into the top slot means "run this one now" — but nothing is
// sent to the server until the modal's Save button is clicked; a drag only rearranges
// local state, same as any other field in the form.
function LoadQueue({ items, hasDeck, readOnly, onChange }: {
  items: QueueLoad[];             // [current, ...queued] when hasDeck, else just the queue
  hasDeck: boolean;               // is the driver running a load right now?
  readOnly?: boolean;
  onChange: (next: QueueLoad[]) => void;
}) {
  const [order,   setOrder]   = useState<QueueLoad[]>(items);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [overIdx, setOverIdx] = useState<number | null>(null);

  useEffect(() => { setOrder(items); }, [items]);

  const handleDrop = (dropIdx: number) => {
    const from = dragIdx;
    setDragIdx(null); setOverIdx(null);
    if (from === null || from === dropIdx) return;
    // MOVE, not swap: dragging a load to the top must mean "run this one now, and push
    // the rest down" — which is exactly what the server does when it demotes the load
    // being replaced to the head of the queue. A swap would reorder the others too.
    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(dropIdx, 0, moved);
    setOrder(next);
    onChange(next);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {order.map((q, idx) => {
        const isDragging = dragIdx === idx;
        const isOver     = overIdx === idx && dragIdx !== idx;
        const isCurrent  = hasDeck && idx === 0;
        const isNext     = hasDeck ? idx === 1 : idx === 0;
        const draggable  = !readOnly && order.length > 1;
        return (
          <div
            key={q.id}
            draggable={draggable}
            onDragStart={() => draggable && setDragIdx(idx)}
            onDragEnd={() => { setDragIdx(null); setOverIdx(null); }}
            onDragOver={(e) => { if (draggable) { e.preventDefault(); setOverIdx(idx); } }}
            onDrop={() => handleDrop(idx)}
            style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "8px 10px", borderRadius: 6,
              border: `1px solid ${isOver ? "var(--primary)" : isCurrent ? "var(--primary)" : "var(--border)"}`,
              backgroundColor: isDragging ? "var(--muted)" : isOver ? "var(--secondary)" : isCurrent ? "var(--secondary)" : "var(--input-background)",
              opacity: isDragging ? 0.5 : 1,
              cursor: draggable ? "grab" : "default",
              transition: "border-color 0.12s, background-color 0.12s, opacity 0.12s",
            }}
          >
            <GripVertical size={14} style={{ color: "var(--muted-foreground)", flexShrink: 0, opacity: draggable ? 1 : 0.3 }} />
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: isCurrent ? "var(--primary)" : "var(--muted-foreground)", minWidth: 20 }}>
              #{idx + 1}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--foreground)", flex: 1 }}>
              {q.loadId}
            </span>
            {isCurrent && (
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 9, fontWeight: 700, color: "var(--primary)", backgroundColor: "var(--card)", border: "1px solid var(--primary)", borderRadius: 4, padding: "2px 6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Current
              </span>
            )}
            {isNext && (
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 9, fontWeight: 700, color: "var(--muted-foreground)", backgroundColor: "var(--muted)", borderRadius: 4, padding: "2px 6px", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Next
              </span>
            )}
          </div>
        );
      })}
      <div style={{ minHeight: 14, fontFamily: "var(--font-sans)", fontSize: 11 }}>
        {!readOnly && order.length > 1 && (
          <span style={{ color: "var(--muted-foreground)" }}>
            {hasDeck ? "Drag a load to the top to run it now — applies when you Save." : "Drag to reorder — applies when you Save."}
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Modals ───────────────────────────────────────────────────────────────────

// Payout type + its one rate field. The rate only appears once a type is picked, and it
// changes meaning with it: $/mile for RPM (paid on total distance, deadhead included),
// or a 0–100 share of gross for percent. Clamped to 100 for percent because the backend
// rejects more (55 mistyped as 5500 would otherwise skew every gross week it touched).
function PayFields({ payType, payRate, onChange }: {
  payType: PayType;
  payRate?: number;
  onChange: (patch: { payType?: PayType; payRate?: number }) => void;
}) {
  const isPercent = payType === "percent";
  const numStyle: React.CSSProperties = {
    fontFamily: "var(--font-sans)", fontSize: 13, height: 34, borderRadius: 6,
    border: "1px solid var(--border)", backgroundColor: "var(--input-background)",
    color: "var(--foreground)", outline: "none", width: "100%", boxSizing: "border-box",
    padding: isPercent ? "7px 26px 7px 10px" : "7px 10px 7px 22px",
  };
  return (
    <>
      <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
        <FieldLabel>Payout Type</FieldLabel>
        <CustomSelect
          value={payType}
          options={PAY_TYPE_OPTS}
          // Clearing the type drops the rate — a rate with no type means nothing.
          onChange={(v) => onChange(v ? { payType: v as PayType } : { payType: "", payRate: undefined })}
        />
      </label>

      {payType !== "" && (
        <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <FieldLabel>{isPercent ? "Percent of Gross" : "Rate per Mile"}</FieldLabel>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", [isPercent ? "right" : "left"]: 10, top: "50%", transform: "translateY(-50%)", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)", pointerEvents: "none" }}>
              {isPercent ? "%" : "$"}
            </span>
            <input
              type="number" min={0} max={isPercent ? 100 : undefined} step={isPercent ? 1 : 0.01}
              value={payRate ?? ""}
              onChange={(e) => {
                if (e.target.value === "") { onChange({ payRate: undefined }); return; }
                const n = Number(e.target.value);
                onChange({ payRate: isPercent ? Math.min(100, Math.max(0, n)) : Math.max(0, n) });
              }}
              placeholder={isPercent ? "e.g. 25" : "e.g. 0.55"}
              style={numStyle}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.12)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
            />
          </div>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--muted-foreground)" }}>
            {isPercent ? "Share of the driver's gross." : "Paid on total distance driven — deadhead included."}
          </span>
        </label>
      )}
    </>
  );
}

function SoloModal({ driver, onClose, onSave, canReorderLoads, saving, fieldErrors, canEditEquipment }: {
  driver: Partial<SoloDriver>; onClose: () => void; onSave: (d: SoloDriver) => void;
  canReorderLoads?: boolean;
  saving?: boolean;
  fieldErrors?: { truck?: string; trailer?: string };
  canEditEquipment: boolean;
}) {
  const [form, setForm] = useState<Partial<SoloDriver>>(driver);
  const [touched, setTouched] = useState<Partial<Record<keyof SoloDriver, boolean>>>({});
  const set = (k: keyof SoloDriver, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const touch = (k: keyof SoloDriver) => setTouched((t) => ({ ...t, [k]: true }));
  const isNew = !driver.id;

  const err = (k: keyof SoloDriver) => touched[k] && !form[k]?.toString().trim();

  const handleSave = () => {
    setTouched({ name: true, phone: true });
    if (!form.name?.trim() || !form.phone?.trim()) return;
    onSave(form as SoloDriver);
  };

  const loadOrder = deckOrder(form);

  // A drag only rearranges the modal's own state — nothing reaches the server until
  // Save. Rewriting current/nextLoads from the dropped order covers both a swap (the
  // head changed) and a plain reorder (the head is the same, the tail moved) alike.
  const handleQueueChange = (next: QueueLoad[]) => {
    setForm((f) => {
      if (!f.currentLoadId) return { ...f, nextLoads: next, nextLoadId: next[0]?.id };
      const [head, ...tail] = next;
      return { ...f, currentLoad: head.loadId, currentLoadId: head.id, nextLoads: tail, nextLoadId: tail[0]?.id };
    });
  };

  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ backgroundColor: "var(--card)", borderRadius: 12, width: 560, boxShadow: "0 20px 60px rgba(0,0,0,0.22)", overflow: "visible" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border)", backgroundColor: "var(--muted)", borderRadius: "12px 12px 0 0" }}>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>
            {isNew ? "Add Solo Driver" : "Edit Solo Driver"}
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", display: "flex", alignItems: "center" }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <FieldLabel required error={!!err("name")}>Full Name</FieldLabel>
            <FieldInput value={form.name ?? ""} onChange={(v) => set("name", v)} onBlur={() => touch("name")} error={!!err("name")} />
            {err("name") && <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "#EF4444" }}>Name is required</span>}
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <FieldLabel required error={!!err("phone")}>Phone Number</FieldLabel>
            <FieldInput value={form.phone ?? ""} onChange={(v) => set("phone", v)} onBlur={() => touch("phone")} error={!!err("phone")} />
            {err("phone") && <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "#EF4444" }}>Phone is required</span>}
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <FieldLabel error={!!fieldErrors?.truck}>Truck Unit</FieldLabel>
            <EquipmentField canRead={canEditEquipment} value={form.truckId ?? ""} label={form.truck ?? ""} endpoint="/trucks" onChange={(id, lbl) => setForm((f) => ({ ...f, truckId: id, truck: lbl }))} error={!!fieldErrors?.truck} />
            {fieldErrors?.truck && <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "#EF4444" }}>{fieldErrors.truck}</span>}
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <FieldLabel error={!!fieldErrors?.trailer}>Trailer Unit</FieldLabel>
            <EquipmentField canRead={canEditEquipment} value={form.trailerId ?? ""} label={form.trailer ?? ""} endpoint="/trailers" onChange={(id, lbl) => setForm((f) => ({ ...f, trailerId: id, trailer: lbl }))} error={!!fieldErrors?.trailer} />
            {fieldErrors?.trailer && <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "#EF4444" }}>{fieldErrors.trailer}</span>}
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <FieldLabel>Type</FieldLabel>
            <CustomSelect value={form.type ?? "C/D"} options={TYPE_OPTS} onChange={(v) => set("type", v)} />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <FieldLabel>Status</FieldLabel>
            <CustomSelect value={form.status ?? "ready"} options={STATUS_MODAL_OPTS} onChange={(v) => set("status", v)} />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <FieldLabel>Weekly Gross Target ($)</FieldLabel>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)", pointerEvents: "none" }}>$</span>
              <input
                type="number" min={0} value={form.weeklyGrossTarget ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, weeklyGrossTarget: e.target.value === "" ? undefined : Number(e.target.value) }))}
                placeholder="e.g. 5000"
                style={{ fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 10px 7px 22px", borderRadius: 6, height: 34, border: "1px solid var(--border)", backgroundColor: "var(--input-background)", color: "var(--foreground)", outline: "none", width: "100%", boxSizing: "border-box" }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.12)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
              />
            </div>
          </label>

          <PayFields
            payType={form.payType ?? ""}
            payRate={form.payRate}
            onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
          />

          {!isNew && loadOrder.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 5, gridColumn: "1 / -1" }}>
              <FieldLabel>Loads</FieldLabel>
              <LoadQueue
                items={loadOrder}
                hasDeck={!!form.currentLoadId}
                readOnly={!canReorderLoads}
                onChange={handleQueueChange}
              />
            </div>
          )}

          <label style={{ display: "flex", flexDirection: "column", gap: 5, gridColumn: "1 / -1" }}>
            <FieldLabel>Comment</FieldLabel>
            <FieldInput value={form.comment ?? ""} onChange={(v) => set("comment", v)} />
          </label>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 20px", borderTop: "1px solid var(--border)" }}>
          <button onClick={onClose} style={{ fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 16px", borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "var(--muted)", color: "var(--foreground)", cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "7px 16px", borderRadius: 6, border: "none", backgroundColor: saving ? "var(--muted)" : "var(--primary)", color: saving ? "var(--muted-foreground)" : "#fff", cursor: saving ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <Check size={14} /> {saving ? "Saving…" : isNew ? "Create Driver" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TeamModal({ driver, onClose, onSave, canReorderLoads, saving, fieldErrors, canEditEquipment }: {
  driver: Partial<TeamDriver>; onClose: () => void; onSave: (d: TeamDriver) => void;
  canReorderLoads?: boolean;
  saving?: boolean;
  fieldErrors?: { truck?: string; trailer?: string };
  canEditEquipment: boolean;
}) {
  const [form, setForm] = useState<Partial<TeamDriver>>(driver);
  const [touched, setTouched] = useState<Partial<Record<keyof TeamDriver, boolean>>>({});
  const set = (k: keyof TeamDriver, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const touch = (k: keyof TeamDriver) => setTouched((t) => ({ ...t, [k]: true }));
  const isNew = !driver.id;

  const err = (k: keyof TeamDriver) => touched[k] && !form[k]?.toString().trim();

  const handleSave = () => {
    setTouched({ name1: true, phone1: true, name2: true, phone2: true });
    if (!form.name1?.trim() || !form.phone1?.trim() || !form.name2?.trim() || !form.phone2?.trim()) return;
    onSave(form as TeamDriver);
  };

  const loadOrder = deckOrder(form);

  // A drag only rearranges the modal's own state — nothing reaches the server until
  // Save. Rewriting current/nextLoads from the dropped order covers both a swap (the
  // head changed) and a plain reorder (the head is the same, the tail moved) alike.
  const handleQueueChange = (next: QueueLoad[]) => {
    setForm((f) => {
      if (!f.currentLoadId) return { ...f, nextLoads: next, nextLoadId: next[0]?.id };
      const [head, ...tail] = next;
      return { ...f, currentLoad: head.loadId, currentLoadId: head.id, nextLoads: tail, nextLoadId: tail[0]?.id };
    });
  };

  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ backgroundColor: "var(--card)", borderRadius: 12, width: 600, boxShadow: "0 20px 60px rgba(0,0,0,0.22)", overflow: "visible" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border)", backgroundColor: "var(--muted)", borderRadius: "12px 12px 0 0" }}>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>
            {isNew ? "Add Team" : "Edit Team"}
          </span>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", display: "flex", alignItems: "center" }}>
            <X size={16} />
          </button>
        </div>

        <div style={{ padding: "20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <FieldLabel required error={!!err("name1")}>Driver 1 Name</FieldLabel>
            <FieldInput value={form.name1 ?? ""} onChange={(v) => set("name1", v)} onBlur={() => touch("name1")} error={!!err("name1")} />
            {err("name1") && <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "#EF4444" }}>Driver 1 name is required</span>}
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <FieldLabel required error={!!err("phone1")}>Driver 1 Phone</FieldLabel>
            <FieldInput value={form.phone1 ?? ""} onChange={(v) => set("phone1", v)} onBlur={() => touch("phone1")} error={!!err("phone1")} />
            {err("phone1") && <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "#EF4444" }}>Driver 1 phone is required</span>}
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <FieldLabel required error={!!err("name2")}>Driver 2 Name</FieldLabel>
            <FieldInput value={form.name2 ?? ""} onChange={(v) => set("name2", v)} onBlur={() => touch("name2")} error={!!err("name2")} />
            {err("name2") && <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "#EF4444" }}>Driver 2 name is required</span>}
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <FieldLabel required error={!!err("phone2")}>Driver 2 Phone</FieldLabel>
            <FieldInput value={form.phone2 ?? ""} onChange={(v) => set("phone2", v)} onBlur={() => touch("phone2")} error={!!err("phone2")} />
            {err("phone2") && <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "#EF4444" }}>Driver 2 phone is required</span>}
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <FieldLabel error={!!fieldErrors?.truck}>Truck Unit</FieldLabel>
            <EquipmentField canRead={canEditEquipment} value={form.truckId ?? ""} label={form.truck ?? ""} endpoint="/trucks" onChange={(id, lbl) => setForm((f) => ({ ...f, truckId: id, truck: lbl }))} error={!!fieldErrors?.truck} />
            {fieldErrors?.truck && <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "#EF4444" }}>{fieldErrors.truck}</span>}
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <FieldLabel error={!!fieldErrors?.trailer}>Trailer Unit</FieldLabel>
            <EquipmentField canRead={canEditEquipment} value={form.trailerId ?? ""} label={form.trailer ?? ""} endpoint="/trailers" onChange={(id, lbl) => setForm((f) => ({ ...f, trailerId: id, trailer: lbl }))} error={!!fieldErrors?.trailer} />
            {fieldErrors?.trailer && <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "#EF4444" }}>{fieldErrors.trailer}</span>}
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <FieldLabel>Type</FieldLabel>
            <CustomSelect value={form.type ?? "C/D"} options={TYPE_OPTS} onChange={(v) => set("type", v)} />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <FieldLabel>Status</FieldLabel>
            <CustomSelect value={form.status ?? "ready"} options={STATUS_MODAL_OPTS} onChange={(v) => set("status", v)} />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <FieldLabel>Weekly Gross Target ($)</FieldLabel>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)", pointerEvents: "none" }}>$</span>
              <input
                type="number" min={0} value={form.weeklyGrossTarget ?? ""}
                onChange={(e) => setForm((f) => ({ ...f, weeklyGrossTarget: e.target.value === "" ? undefined : Number(e.target.value) }))}
                placeholder="e.g. 7000"
                style={{ fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 10px 7px 22px", borderRadius: 6, height: 34, border: "1px solid var(--border)", backgroundColor: "var(--input-background)", color: "var(--foreground)", outline: "none", width: "100%", boxSizing: "border-box" }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.12)"; }}
                onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
              />
            </div>
          </label>

          <PayFields
            payType={form.payType ?? ""}
            payRate={form.payRate}
            onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
          />

          {!isNew && loadOrder.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 5, gridColumn: "1 / -1" }}>
              <FieldLabel>Loads</FieldLabel>
              <LoadQueue
                items={loadOrder}
                hasDeck={!!form.currentLoadId}
                readOnly={!canReorderLoads}
                onChange={handleQueueChange}
              />
            </div>
          )}

          <label style={{ display: "flex", flexDirection: "column", gap: 5, gridColumn: "1 / -1" }}>
            <FieldLabel>Comment</FieldLabel>
            <FieldInput value={form.comment ?? ""} onChange={(v) => set("comment", v)} />
          </label>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 20px", borderTop: "1px solid var(--border)" }}>
          <button onClick={onClose} style={{ fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 16px", borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "var(--muted)", color: "var(--foreground)", cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving} style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "7px 16px", borderRadius: 6, border: "none", backgroundColor: saving ? "var(--muted)" : "var(--primary)", color: saving ? "var(--muted-foreground)" : "#fff", cursor: saving ? "not-allowed" : "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <Check size={14} /> {saving ? "Saving…" : isNew ? "Create Team" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeleteConfirm({ label, onClose, onConfirm, busy = false, error }: { label: string; onClose: () => void; onConfirm: () => void; busy?: boolean; error?: string | null }) {
  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ backgroundColor: "var(--card)", borderRadius: 12, width: 380, padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,0.22)", textAlign: "center" }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", backgroundColor: "rgba(239,68,68,0.14)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
          <Trash2 size={20} color="#EF4444" />
        </div>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 600, color: "var(--foreground)", marginBottom: 6 }}>Delete driver?</div>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)", marginBottom: error ? 12 : 22 }}>
          <strong>{label}</strong> will be permanently removed.
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

// ─── Import Modal ─────────────────────────────────────────────────────────────

interface ImportResult { created: number; failed: number; errors: { row: number; message: string }[] }

function ImportModal({ entityLabel, endpoint, templateEndpoint, templateFile, onClose, onImported }: {
  entityLabel: string; endpoint: string; templateEndpoint: string; templateFile: string;
  onClose: () => void; onImported?: () => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const downloadTemplate = async () => {
    if (downloading) return;
    setDownloading(true); setError(null);
    try {
      await api.download(`${templateEndpoint}?format=csv`, templateFile);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't download the template.");
    } finally {
      setDownloading(false);
    }
  };

  const pickFile = (f: File | undefined | null) => {
    if (!f) return;
    if (!/\.(csv|xlsx)$/i.test(f.name)) { setError("Only CSV or Excel (.xlsx) files are supported."); return; }
    setError(null); setFile(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    pickFile(e.dataTransfer.files[0]);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => pickFile(e.target.files?.[0]);

  const submit = async () => {
    if (!file) return;
    setSubmitting(true); setError(null);
    try {
      const res = await api.upload<ImportResult>(endpoint, file);
      setResult(res);
      if (res.created > 0) onImported?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ backgroundColor: "var(--card)", borderRadius: 12, width: 520, boxShadow: "0 20px 60px rgba(0,0,0,0.22)" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border)", backgroundColor: "var(--muted)", borderRadius: "12px 12px 0 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: "rgba(16,185,129,0.08)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <FileSpreadsheet size={15} color="#10B981" />
            </div>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, color: "var(--foreground)" }}>
              Import {entityLabel}s
            </span>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted-foreground)", display: "flex" }}>
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Drop zone */}
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            style={{
              border: `2px dashed ${dragging ? "var(--primary)" : file ? "#10B981" : "var(--border)"}`,
              borderRadius: 10, padding: "36px 20px", textAlign: "center",
              backgroundColor: dragging ? "var(--accent)" : file ? "rgba(16,185,129,0.10)" : "var(--input-background)",
              cursor: "pointer", transition: "all 0.15s",
            }}
          >
            <input ref={inputRef} type="file" accept=".csv,.xlsx" onChange={handleFile} style={{ display: "none" }} />
            {file ? (
              <>
                <div style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: "rgba(16,185,129,0.14)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                  <FileText size={22} color="#10B981" />
                </div>
                <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, color: "#10B981" }}>{file.name}</div>
                <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", marginTop: 4 }}>
                  {(file.size / 1024).toFixed(1)} KB · Click to change
                </div>
              </>
            ) : (
              <>
                <div style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                  <Upload size={20} color="var(--muted-foreground)" />
                </div>
                <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 500, color: "var(--foreground)" }}>
                  Drag & drop your file here
                </div>
                <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", marginTop: 4 }}>
                  or <span style={{ color: "var(--primary)", fontWeight: 500 }}>browse files</span> — CSV or Excel (max 5 MB)
                </div>
              </>
            )}
          </div>

          {/* Template row */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", backgroundColor: "var(--muted)", borderRadius: 8 }}>
            <div>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--foreground)" }}>
                Need a template?
              </div>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--muted-foreground)", marginTop: 1 }}>
                Pre-formatted CSV with all required columns
              </div>
            </div>
            <button onClick={downloadTemplate} disabled={downloading} style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "var(--card)", color: "var(--foreground)", cursor: downloading ? "default" : "pointer", opacity: downloading ? 0.6 : 1 }}>
              {downloading ? "…" : "Download"}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", backgroundColor: "rgba(239,68,68,0.08)", borderRadius: 8, border: "1px solid rgba(239,68,68,0.35)" }}>
              <AlertCircle size={15} color="#EF4444" style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "#EF4444", lineHeight: 1.5 }}>{error}</div>
            </div>
          )}

          {/* Result */}
          {result && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px 14px", backgroundColor: result.failed > 0 ? "rgba(245,158,11,0.08)" : "rgba(16,185,129,0.10)", borderRadius: 8, border: `1px solid ${result.failed > 0 ? "rgba(245,158,11,0.35)" : "rgba(16,185,129,0.35)"}` }}>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: result.failed > 0 ? "#F59E0B" : "#10B981" }}>
                Imported {result.created} {entityLabel.toLowerCase()}{result.created !== 1 ? "s" : ""}{result.failed > 0 ? ` · ${result.failed} row${result.failed !== 1 ? "s" : ""} failed` : ""}
              </div>
              {result.errors.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 3, maxHeight: 140, overflowY: "auto" }}>
                  {result.errors.map((er, i) => (
                    <div key={i} style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "#F59E0B" }}>
                      <span style={{ fontFamily: "var(--font-mono)", fontWeight: 700 }}>Row {er.row}:</span> {er.message}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 20px", borderTop: "1px solid var(--border)" }}>
          <button onClick={onClose} style={{ fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 16px", borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "var(--muted)", color: "var(--foreground)", cursor: "pointer" }}>
            {result ? "Done" : "Cancel"}
          </button>
          {!result && (
            <button
              disabled={!file || submitting}
              onClick={submit}
              style={{
                fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "7px 16px",
                borderRadius: 6, border: "none",
                backgroundColor: file && !submitting ? "#10B981" : "var(--muted)",
                color: file && !submitting ? "#fff" : "var(--muted-foreground)",
                cursor: file && !submitting ? "pointer" : "not-allowed",
                display: "flex", alignItems: "center", gap: 6,
                transition: "background-color 0.15s",
              }}
            >
              <Upload size={14} /> {submitting ? "Importing…" : "Submit for Import"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Add Menu ─────────────────────────────────────────────────────────────────

function AddMenu({ entityLabel, onManual, onImport, onEld, canEld = true }: {
  entityLabel: string;
  onManual: () => void;
  onImport: () => void;
  onEld: () => void;
  canEld?: boolean; // hide the ELD entry from users without the eld.read key
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

  const items = [
    {
      icon: <ClipboardList size={16} />,
      iconColor: "var(--primary)", iconBg: "var(--secondary)",
      label: "Add Manually",
      desc: "Fill in driver details using the form",
      comingSoon: false,
      onClick: onManual,
    },
    {
      icon: <FileSpreadsheet size={16} />,
      iconColor: "#10B981", iconBg: "rgba(16,185,129,0.08)",
      label: "Import from File",
      desc: "Upload a CSV or Excel roster",
      comingSoon: false,
      onClick: onImport,
    },
    ...(canEld ? [{
      icon: <Radio size={16} />,
      iconColor: "#22D3EE", iconBg: "rgba(34,211,238,0.10)",
      label: "Sync from ELD",
      desc: "Pull driver records from your ELD provider",
      comingSoon: false,
      onClick: onEld,
    }] : []),
  ];

  return (
    <div ref={ref} style={{ position: "relative", flexShrink: 0 }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600,
          height: 34, padding: "0 14px", borderRadius: 7, border: "none",
          backgroundColor: "var(--primary)", color: "#fff", cursor: "pointer",
          outline: "none",
        }}
      >
        <Plus size={14} />
        Add {entityLabel}
        <span style={{ width: 1, height: 16, backgroundColor: "rgba(255,255,255,0.25)", margin: "0 2px" }} />
        <ChevronDown
          size={13}
          style={{ opacity: 0.85, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
        />
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
              onClick={() => {
                if (!item.comingSoon) { item.onClick(); setOpen(false); }
              }}
              style={{
                display: "flex", alignItems: "center", gap: 12,
                width: "100%", padding: "9px 10px", borderRadius: 7,
                border: "none", textAlign: "left", cursor: item.comingSoon ? "default" : "pointer",
                backgroundColor: "transparent",
                opacity: item.comingSoon ? 0.6 : 1,
                outline: "none", transition: "background-color 0.1s",
              }}
              onMouseEnter={(e) => {
                if (!item.comingSoon)
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--muted)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
              }}
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
                      color: "#8B5CF6", backgroundColor: "rgba(139,92,246,0.10)",
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

// ─── Driver Detail ────────────────────────────────────────────────────────────

// ─── Weekly recap (GET /drivers/:id/detail) ───────────────────────────────────

interface WeekSummary {
  gross: number; miles: number; loads: number; rpm: number;
  weekly_target: number; target_pct: number | null;
  deadhead_miles: number; total_miles: number;
  driver_pay: number; pay_type?: string; pay_rate?: number;
}
interface DetailLoad {
  id: string; load_id: string; origin: string; destination: string;
  miles: number; payout: number; status: string; completed_at?: string;
}
interface DriverWeek { week: { from: string; to: string }; summary: WeekSummary; loads: DetailLoad[] }

// Shift an ISO date by whole days in pure UTC — never touches the local calendar.
function shiftISO(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86_400_000;
  const n = new Date(t);
  return `${n.getUTCFullYear()}-${String(n.getUTCMonth() + 1).padStart(2, "0")}-${String(n.getUTCDate()).padStart(2, "0")}`;
}

function fmtISORange(from: string, to: string): string {
  const f = new Date(`${from}T00:00:00Z`), t = new Date(`${to}T00:00:00Z`);
  const opt: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", timeZone: "UTC" };
  return `${f.toLocaleDateString("en-US", opt)} – ${t.toLocaleDateString("en-US", opt)}`;
}

// The driver's week, computed by the server: earnings, distance (deadhead included),
// their own pay, and the completed loads behind it. Bucketed by COMPLETION date, so it
// matches the gross matrix rather than anything derived here.
//
// The first request sends no range — the server decides which work week is current (in
// the business timezone) and returns it. Paging shifts that server-given window by whole
// weeks, so the browser clock never defines a boundary.
function useDriverWeek(driverId: string) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [data, setData]       = useState<DriverWeek | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const anchorRef = useRef<{ from: string; to: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true); setError(null);
    const a = anchorRef.current;
    const qs = a ? `?from=${shiftISO(a.from, weekOffset * 7)}&to=${shiftISO(a.to, weekOffset * 7)}` : "";
    api.get<DriverWeek>(`/drivers/${driverId}/detail${qs}`)
      .then((d) => {
        if (cancelled) return;
        if (!anchorRef.current && d?.week) anchorRef.current = d.week; // the server's "this week"
        setData(d ?? null);
      })
      .catch((e) => {
        if (cancelled) return;
        setData(null);
        // The recap exposes per-load revenue, so it needs loads.read on top of drivers.read.
        setError(isForbidden(e) ? "You don't have access to this driver's earnings." : (e instanceof Error ? e.message : "Couldn't load this week."));
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [driverId, weekOffset]);

  return { weekOffset, setWeekOffset, data, loading, error };
}

function DriverDetail({ driver, onBack }: { driver: SoloDriver; onBack: () => void }) {
  const { weekOffset, setWeekOffset, data, loading: loadingLoads, error } = useDriverWeek(driver.id);
  const summary = data?.summary;
  const loads   = data?.loads ?? [];
  const targetPct = summary?.target_pct ?? null;
  const target    = summary?.weekly_target ?? driver.weeklyGrossTarget;

  const initials = driver.name.split(" ").slice(0, 2).map((w) => w[0]).join("");

  // How this driver is paid, as one readable line. "" (unconfigured) reads as blank so
  // the row renders "—" like any other unset field.
  const payLabel =
    driver.payType === "rpm"     ? `$${(driver.payRate ?? 0).toFixed(2)} / mile`
  : driver.payType === "percent" ? `${driver.payRate ?? 0}% of gross`
  : "";

  // Straight from the server's recap — no client arithmetic. Total Miles is the distance
  // actually driven (deadhead included), which is the span rpm and driver pay divide by.
  const metrics: { label: string; value: string; icon: React.ReactNode; color: string; bg: string; note?: string }[] = [
    { label: "Week Gross",  value: `$${(summary?.gross ?? 0).toLocaleString()}`,      icon: <DollarSign size={16} />, color: "#10B981", bg: "rgba(16,185,129,0.14)" },
    { label: "Total Miles", value: (summary?.total_miles ?? 0).toLocaleString(),      icon: <Route      size={16} />, color: "#3B82F6", bg: "rgba(59,130,246,0.14)",
      note: (summary?.deadhead_miles ?? 0) > 0 ? `incl. ${summary!.deadhead_miles.toLocaleString()} empty` : undefined },
    { label: "Loads",       value: String(summary?.loads ?? 0),                        icon: <Package    size={16} />, color: "#8B5CF6", bg: "rgba(139,92,246,0.14)" },
    { label: "Avg $/Mile",  value: `$${(summary?.rpm ?? 0).toFixed(2)}`,               icon: <TrendingUp size={16} />, color: "#F59E0B", bg: "rgba(245,158,11,0.14)" },
    { label: "Week Payout", value: `$${(summary?.driver_pay ?? 0).toLocaleString()}`,  icon: <DollarSign size={16} />, color: "#22D3EE", bg: "rgba(34,211,238,0.14)",
      note: summary?.pay_type ? undefined : "No pay type set" },
  ];

  const infoRows: { icon: React.ReactNode; label: string; value: string; mono?: boolean; highlight?: boolean }[] = [
    { icon: <Phone        size={13} />, label: "Phone",        value: driver.phone,          mono: true },
    { icon: <DollarSign   size={13} />, label: "Pay",          value: payLabel                    },
    { icon: <Package      size={13} />, label: "Current Load", value: driver.currentLoad ?? "", mono: true, highlight: true },
    { icon: <Package      size={13} />, label: "Next Load",    value: driver.nextLoad    ?? "", mono: true },
    { icon: <Truck        size={13} />, label: "Truck",        value: driver.truck,          mono: true },
    { icon: <Truck        size={13} />, label: "Trailer",      value: driver.trailer,        mono: true },
    { icon: <MapPin       size={13} />, label: "Location",     value: driver.eldLocation || driver.location },
    { icon: <MessageSquare size={13}/>, label: "Note",         value: driver.comment              },
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
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500,
            color: "var(--muted-foreground)",
            background: "none", border: "none", cursor: "pointer",
            padding: "3px 7px", borderRadius: 6, outline: "none",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--border)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
        >
          <ArrowLeft size={14} /> Drivers
        </button>
        <span style={{ color: "var(--border)", fontSize: 14, userSelect: "none" }}>/</span>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>
          {driver.name}
        </span>
        <StatusBadge status={driver.status} />
        <TypeBadge type={driver.type} />
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto", padding: 20, display: "flex", gap: 18, alignItems: "flex-start" }}>

        {/* ── Left profile sidebar ── */}
        <div style={{ width: 240, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12 }}>
          {/* Avatar card */}
          <div style={{
            backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 12,
            padding: "22px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 12, textAlign: "center",
          }}>
            <div style={{
              width: 60, height: 60, borderRadius: "50%",
              background: "linear-gradient(135deg, #2563EB 0%, #7C3AED 100%)",
              color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontFamily: "var(--font-sans)", fontSize: 20, fontWeight: 700, letterSpacing: "0.03em",
              boxShadow: "0 4px 12px rgba(37,99,235,0.30)",
            }}>
              {initials}
            </div>
            <div>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 700, color: "var(--foreground)" }}>
                {driver.name}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                <StatusBadge status={driver.status} />
                <TypeBadge type={driver.type} />
              </div>
            </div>
          </div>

          {/* Info rows */}
          <div style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
            {infoRows.map((row, i) => (
              <div key={row.label} style={{
                display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 14px",
                borderBottom: i < infoRows.length - 1 ? "1px solid var(--border)" : "none",
              }}>
                <div style={{ color: "var(--muted-foreground)", marginTop: 1, flexShrink: 0 }}>{row.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>
                    {row.label}
                  </div>
                  <div style={{ fontFamily: row.mono ? "var(--font-mono)" : "var(--font-sans)", fontSize: 12, wordBreak: "break-word" }}>
                    {row.value ? (
                      row.highlight ? (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "var(--primary)", backgroundColor: "var(--secondary)", borderRadius: 4, padding: "2px 7px" }}>
                          {row.value}
                        </span>
                      ) : <span style={{ color: "var(--foreground)" }}>{row.value}</span>
                    ) : <span style={{ color: "var(--muted-foreground)" }}>—</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right: metrics + loads ── */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Week label + nav */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 700, color: "var(--foreground)" }}>
                {weekOffset === 0 ? "This Week" : weekOffset === -1 ? "Last Week" : `${Math.abs(weekOffset)} Weeks Ago`}
              </div>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", marginTop: 3 }}>
                {data?.week ? fmtISORange(data.week.from, data.week.to) : "—"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <button
                onClick={() => setWeekOffset((o) => o - 1)}
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, border: "1px solid var(--border)", borderRadius: 6, background: "var(--card)", cursor: "pointer", color: "var(--foreground)" }}
              ><ChevronLeft size={14} /></button>
              <button
                onClick={() => setWeekOffset((o) => o + 1)}
                disabled={weekOffset >= 0}
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, border: "1px solid var(--border)", borderRadius: 6, background: "var(--card)", cursor: weekOffset >= 0 ? "default" : "pointer", color: weekOffset >= 0 ? "var(--muted-foreground)" : "var(--foreground)", opacity: weekOffset >= 0 ? 0.4 : 1 }}
              ><ChevronRight size={14} /></button>
            </div>
          </div>

          {/* Metric cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
            {metrics.map((m) => {
              const isGross = m.label === "Week Gross";
              return (
                <div key={m.label} style={{
                  backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 10,
                  padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10,
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                      {m.label}
                    </span>
                    <div style={{ width: 28, height: 28, borderRadius: 7, backgroundColor: m.bg, color: m.color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {m.icon}
                    </div>
                  </div>
                  <div style={{ fontFamily: "var(--font-sans)", fontSize: 24, fontWeight: 700, color: "var(--foreground)", lineHeight: 1 }}>
                    {m.value}
                  </div>
                  {m.note && (
                    <span style={{ alignSelf: "flex-start", fontFamily: "var(--font-sans)", fontSize: 10, color: "var(--muted-foreground)" }}>
                      {m.note}
                    </span>
                  )}
                  {isGross && targetPct !== null && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: -2 }}>
                      <div style={{ height: 5, borderRadius: 99, backgroundColor: "var(--muted)", overflow: "hidden" }}>
                        <div style={{
                          height: "100%", borderRadius: 99, width: `${targetPct}%`,
                          backgroundColor: targetPct >= 100 ? "#10B981" : targetPct >= 70 ? "#F59E0B" : "#3B82F6",
                          transition: "width 0.4s ease",
                        }} />
                      </div>
                      <span style={{ fontFamily: "var(--font-sans)", fontSize: 10, color: "var(--muted-foreground)" }}>
                        {targetPct}% of ${target!.toLocaleString()} target
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Loads table */}
          <div style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>
                {weekOffset === 0 ? "Loads This Week" : "Loads"}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)", backgroundColor: "var(--muted)", borderRadius: 6, padding: "2px 8px" }}>
                {loadingLoads ? "…" : `${loads.length} ${loads.length === 1 ? "load" : "loads"}`}
              </span>
            </div>

            {loadingLoads ? (
              <div style={{ padding: "48px 20px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>
                Loading…
              </div>
            ) : error ? (
              <div style={{ padding: "48px 20px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "#EF4444" }}>
                {error}
              </div>
            ) : loads.length === 0 ? (
              <div style={{ padding: "48px 20px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>
                No loads for this week.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
                  <thead>
                    <tr>
                      <TH>Load #</TH>
                      <TH>Origin</TH>
                      <TH>Destination</TH>
                      <TH width={80} align="center">Miles</TH>
                      <TH width={100} align="center">Payout</TH>
                      <TH width={110} align="center">Completed</TH>
                      <TH width={110} align="center">Status</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {loads.map((load, i) => {
                      const sc = STATUS_CONFIG[load.status as Status];
                      return (
                        <tr
                          key={load.id}
                          style={{ backgroundColor: i % 2 === 0 ? "var(--card)" : "var(--background)" }}
                        >
                          <TD mono>{load.load_id || load.id}</TD>
                          <TD>{load.origin}</TD>
                          <TD>{load.destination}</TD>
                          <TD mono center>{load.miles.toLocaleString()}</TD>
                          <TD mono center>${load.payout.toLocaleString()}</TD>
                          <TD center>{load.completed_at ? new Date(load.completed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</TD>
                          <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", verticalAlign: "middle", textAlign: "center" }}>
                            {sc ? (
                              <span style={{
                                display: "inline-block",
                                fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600,
                                color: sc.color, backgroundColor: sc.bg, borderRadius: 4, padding: "2px 8px",
                              }}>
                                {sc.label}
                              </span>
                            ) : <span style={{ color: "var(--muted-foreground)" }}>—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Team Detail ─────────────────────────────────────────────────────────────

function TeamDetail({ team, onBack }: { team: TeamDriver; onBack: () => void }) {
  // A team is a driver row, so it uses the same recap endpoint.
  const { weekOffset, setWeekOffset, data, loading: loadingLoads, error } = useDriverWeek(team.id);
  const summary = data?.summary;
  const loads   = data?.loads ?? [];
  const targetPct = summary?.target_pct ?? null;
  const target    = summary?.weekly_target ?? team.weeklyGrossTarget;

  const initials1 = team.name1.split(" ").slice(0, 2).map((w) => w[0]).join("");
  const initials2 = team.name2.split(" ").slice(0, 2).map((w) => w[0]).join("");

  const payLabel =
    team.payType === "rpm"     ? `$${(team.payRate ?? 0).toFixed(2)} / mile`
  : team.payType === "percent" ? `${team.payRate ?? 0}% of gross`
  : "";

  // Server-computed, same as DriverDetail.
  const metrics: { label: string; value: string; icon: React.ReactNode; color: string; bg: string; note?: string }[] = [
    { label: "Week Gross",  value: `$${(summary?.gross ?? 0).toLocaleString()}`,     icon: <DollarSign size={16} />, color: "#10B981", bg: "rgba(16,185,129,0.14)" },
    { label: "Total Miles", value: (summary?.total_miles ?? 0).toLocaleString(),     icon: <Route      size={16} />, color: "#3B82F6", bg: "rgba(59,130,246,0.14)",
      note: (summary?.deadhead_miles ?? 0) > 0 ? `incl. ${summary!.deadhead_miles.toLocaleString()} empty` : undefined },
    { label: "Loads",       value: String(summary?.loads ?? 0),                       icon: <Package    size={16} />, color: "#8B5CF6", bg: "rgba(139,92,246,0.14)" },
    { label: "Avg $/Mile",  value: `$${(summary?.rpm ?? 0).toFixed(2)}`,              icon: <TrendingUp size={16} />, color: "#F59E0B", bg: "rgba(245,158,11,0.14)" },
    { label: "Week Payout", value: `$${(summary?.driver_pay ?? 0).toLocaleString()}`, icon: <DollarSign size={16} />, color: "#22D3EE", bg: "rgba(34,211,238,0.14)",
      note: summary?.pay_type ? undefined : "No pay type set" },
  ];

  const avatarGradients = [
    "linear-gradient(135deg, #2563EB 0%, #7C3AED 100%)",
    "linear-gradient(135deg, #0891B2 0%, #059669 100%)",
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
          style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500,
            color: "var(--muted-foreground)",
            background: "none", border: "none", cursor: "pointer",
            padding: "3px 7px", borderRadius: 6, outline: "none",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--border)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
        >
          <ArrowLeft size={14} /> Teams
        </button>
        <span style={{ color: "var(--border)", fontSize: 14, userSelect: "none" }}>/</span>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>
          {team.name1} & {team.name2}
        </span>
        <StatusBadge status={team.status} />
        <TypeBadge type={team.type} />
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: "auto", padding: 20, display: "flex", gap: 18, alignItems: "flex-start" }}>

        {/* ── Left profile sidebar ── */}
        <div style={{ width: 240, flexShrink: 0, display: "flex", flexDirection: "column", gap: 12 }}>

          {/* Dual avatar card */}
          <div style={{
            backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 12,
            padding: "20px 16px", display: "flex", flexDirection: "column", gap: 16,
          }}>
            {[
              { initials: initials1, name: team.name1, phone: team.phone1, grad: avatarGradients[0] },
              { initials: initials2, name: team.name2, phone: team.phone2, grad: avatarGradients[1] },
            ].map((driver, idx) => (
              <div key={idx} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
                  background: driver.grad, color: "#fff",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 700, letterSpacing: "0.02em",
                  boxShadow: "0 3px 8px rgba(0,0,0,0.18)",
                }}>
                  {driver.initials}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>
                    {driver.name}
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)", marginTop: 2 }}>
                    {driver.phone}
                  </div>
                </div>
              </div>
            ))}

            {/* divider between drivers */}
            <div style={{ height: 1, backgroundColor: "var(--border)", margin: "-4px 0" }} />

            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, paddingTop: 2 }}>
              <StatusBadge status={team.status} />
              <TypeBadge type={team.type} />
            </div>
          </div>

          {/* Truck / trailer / comment */}
          <div style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
            {[
              { icon: <DollarSign    size={13} />, label: "Pay",          value: payLabel                          },
              { icon: <Package       size={13} />, label: "Current Load", value: team.currentLoad ?? "", mono: true, highlight: true },
              { icon: <Package       size={13} />, label: "Next Load",    value: team.nextLoad    ?? "", mono: true },
              { icon: <Truck         size={13} />, label: "Truck",        value: team.truck,            mono: true  },
              { icon: <Truck         size={13} />, label: "Trailer",      value: team.trailer,          mono: true  },
              { icon: <MapPin        size={13} />, label: "Location",     value: team.eldLocation || team.location },
              { icon: <MessageSquare size={13} />, label: "Note",         value: team.comment                       },
            ].map((row, i, arr) => (
              <div key={row.label} style={{
                display: "flex", alignItems: "flex-start", gap: 10, padding: "11px 14px",
                borderBottom: i < arr.length - 1 ? "1px solid var(--border)" : "none",
              }}>
                <div style={{ color: "var(--muted-foreground)", marginTop: 1, flexShrink: 0 }}>{row.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 2 }}>
                    {row.label}
                  </div>
                  <div style={{ fontSize: 12, wordBreak: "break-word" }}>
                    {row.value ? (
                      (row as { highlight?: boolean }).highlight ? (
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "var(--primary)", backgroundColor: "var(--secondary)", borderRadius: 4, padding: "2px 7px" }}>
                          {row.value}
                        </span>
                      ) : <span style={{ fontFamily: row.mono ? "var(--font-mono)" : "var(--font-sans)", color: "var(--foreground)" }}>{row.value}</span>
                    ) : <span style={{ fontFamily: "var(--font-sans)", color: "var(--muted-foreground)" }}>—</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right: metrics + loads ── */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Week label + nav */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 700, color: "var(--foreground)" }}>
                {weekOffset === 0 ? "This Week" : weekOffset === -1 ? "Last Week" : `${Math.abs(weekOffset)} Weeks Ago`}
              </div>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", marginTop: 3 }}>
                {data?.week ? fmtISORange(data.week.from, data.week.to) : "—"}
              </div>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <button
                onClick={() => setWeekOffset((o) => o - 1)}
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, border: "1px solid var(--border)", borderRadius: 6, background: "var(--card)", cursor: "pointer", color: "var(--foreground)" }}
              ><ChevronLeft size={14} /></button>
              <button
                onClick={() => setWeekOffset((o) => o + 1)}
                disabled={weekOffset >= 0}
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, border: "1px solid var(--border)", borderRadius: 6, background: "var(--card)", cursor: weekOffset >= 0 ? "default" : "pointer", color: weekOffset >= 0 ? "var(--muted-foreground)" : "var(--foreground)", opacity: weekOffset >= 0 ? 0.4 : 1 }}
              ><ChevronRight size={14} /></button>
            </div>
          </div>

          {/* Metric cards */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12 }}>
            {metrics.map((m) => {
              const isGross = m.label === "Week Gross";
              return (
                <div key={m.label} style={{
                  backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 10,
                  padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10,
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.07em" }}>
                      {m.label}
                    </span>
                    <div style={{ width: 28, height: 28, borderRadius: 7, backgroundColor: m.bg, color: m.color, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {m.icon}
                    </div>
                  </div>
                  <div style={{ fontFamily: "var(--font-sans)", fontSize: 24, fontWeight: 700, color: "var(--foreground)", lineHeight: 1 }}>
                    {m.value}
                  </div>
                  {m.note && (
                    <span style={{ alignSelf: "flex-start", fontFamily: "var(--font-sans)", fontSize: 10, color: "var(--muted-foreground)" }}>
                      {m.note}
                    </span>
                  )}
                  {isGross && targetPct !== null && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: -2 }}>
                      <div style={{ height: 5, borderRadius: 99, backgroundColor: "var(--muted)", overflow: "hidden" }}>
                        <div style={{
                          height: "100%", borderRadius: 99, width: `${targetPct}%`,
                          backgroundColor: targetPct >= 100 ? "#10B981" : targetPct >= 70 ? "#F59E0B" : "#3B82F6",
                          transition: "width 0.4s ease",
                        }} />
                      </div>
                      <span style={{ fontFamily: "var(--font-sans)", fontSize: 10, color: "var(--muted-foreground)" }}>
                        {targetPct}% of ${target!.toLocaleString()} target
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Loads table */}
          <div style={{ backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", borderBottom: "1px solid var(--border)" }}>
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: "var(--foreground)" }}>
                {weekOffset === 0 ? "Loads This Week" : "Loads"}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)", backgroundColor: "var(--muted)", borderRadius: 6, padding: "2px 8px" }}>
                {loadingLoads ? "…" : `${loads.length} ${loads.length === 1 ? "load" : "loads"}`}
              </span>
            </div>

            {loadingLoads ? (
              <div style={{ padding: "48px 20px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>
                Loading…
              </div>
            ) : error ? (
              <div style={{ padding: "48px 20px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "#EF4444" }}>
                {error}
              </div>
            ) : loads.length === 0 ? (
              <div style={{ padding: "48px 20px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>
                No loads for this week.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
                  <thead>
                    <tr>
                      <TH>Load #</TH>
                      <TH>Origin</TH>
                      <TH>Destination</TH>
                      <TH width={80} align="center">Miles</TH>
                      <TH width={100} align="center">Payout</TH>
                      <TH width={110} align="center">Completed</TH>
                      <TH width={110} align="center">Status</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {loads.map((load, i) => {
                      const sc = STATUS_CONFIG[load.status as Status];
                      return (
                        <tr key={load.id} style={{ backgroundColor: i % 2 === 0 ? "var(--card)" : "var(--background)" }}>
                          <TD mono>{load.load_id || load.id}</TD>
                          <TD>{load.origin}</TD>
                          <TD>{load.destination}</TD>
                          <TD mono center>{load.miles.toLocaleString()}</TD>
                          <TD mono center>${load.payout.toLocaleString()}</TD>
                          <TD center>{load.completed_at ? new Date(load.completed_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</TD>
                          <td style={{ padding: "10px 12px", borderBottom: "1px solid var(--border)", verticalAlign: "middle", textAlign: "center" }}>
                            {sc ? (
                              <span style={{
                                display: "inline-block",
                                fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600,
                                color: sc.color, backgroundColor: sc.bg, borderRadius: 4, padding: "2px 8px",
                              }}>
                                {sc.label}
                              </span>
                            ) : <span style={{ color: "var(--muted-foreground)" }}>—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Toolbar ─────────────────────────────────────────────────────────────────

function Toolbar({
  search, onSearch, statusFilter, onStatus,
  entityLabel, onManual, onImport, onEld, placeholder, canCreate = true, canEld = true,
}: {
  search: string; onSearch: (v: string) => void;
  statusFilter: string; onStatus: (v: string) => void;
  entityLabel: string; onManual: () => void; onImport: () => void; onEld: () => void;
  placeholder: string; canCreate?: boolean; canEld?: boolean;
}) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      padding: "12px 16px", borderBottom: "1px solid var(--border)",
      backgroundColor: "var(--card)", flexShrink: 0,
    }}>
      <div style={{ position: "relative", width: 250 }}>
        <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground)", pointerEvents: "none" }} />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={placeholder}
          style={{
            width: "100%", height: 34, paddingLeft: 30, paddingRight: 10,
            fontFamily: "var(--font-sans)", fontSize: 13,
            backgroundColor: "var(--input-background)", border: "1px solid var(--border)",
            borderRadius: 7, color: "var(--foreground)", outline: "none", boxSizing: "border-box" as const,
            transition: "border-color 0.15s, box-shadow 0.15s",
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "var(--primary)";
            e.currentTarget.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.12)";
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "var(--border)";
            e.currentTarget.style.boxShadow = "none";
          }}
        />
      </div>

      <CustomSelect
        value={statusFilter}
        options={STATUS_OPTS}
        onChange={onStatus}
        width={168}
      />

      <div style={{ flex: 1 }} />

      {canCreate && <AddMenu entityLabel={entityLabel} onManual={onManual} onImport={onImport} onEld={onEld} canEld={canEld} />}
    </div>
  );
}

// ─── Solo Tab ─────────────────────────────────────────────────────────────────

function SoloTab({ onSelectDriver, onCountChange }: { onSelectDriver: (d: SoloDriver) => void; onCountChange: (n: number) => void }) {
  const { user } = useAuth();
  const canCreate    = hasPerm(user, "drivers", "create");
  const canUpdate    = hasPerm(user, "drivers", "update");
  const canDelete    = hasPerm(user, "drivers", "delete");
  const canReadFleet = hasPerm(user, "equipments", "read");
  const canEld       = hasPerm(user, "eld", "read");   // see the ELD roster
  const canManageEld = hasPerm(user, "eld", "update"); // link / unlink / sync
  const [rows, setRows]               = useState<SoloDriver[]>([]);
  const [total, setTotal]             = useState(0);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [modal, setModal]             = useState<"create" | "edit" | null>(null);
  const [editing, setEditing]         = useState<Partial<SoloDriver>>({});
  const [deleting, setDeleting]       = useState<SoloDriver | null>(null);
  const [delBusy, setDelBusy]         = useState(false);
  const [delErr, setDelErr]           = useState<string | null>(null);
  const [saving, setSaving]           = useState(false);
  const [search, setSearch]                   = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatus]             = useState("All");
  const [page, setPage]                       = useState(1);
  const [pageSize, setPageSize]               = useState(20);
  const [importing, setImporting]             = useState(false);
  const [eldOpen, setEldOpen]                 = useState(false);
  const [toast, setToast]                     = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [fetchKey, setFetchKey]               = useState(0);
  const [fieldErrors, setFieldErrors]         = useState<{ truck?: string; trailer?: string }>({});

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [statusFilter]);

  useEffect(() => {
    setLoading(true);
    api.getList<any>("/drivers", {
      q: debouncedSearch || undefined,
      status: statusFilter !== "All" ? statusFilter : undefined,
      team: "false",
      page,
      page_size: pageSize,
    })
      .then(({ items, total: t }) => {
        setRows((items ?? []).map(toSolo));
        setTotal(t);
        onCountChange(t);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [fetchKey, debouncedSearch, statusFilter, page, pageSize]);

  const patchRow = async (id: string, fields: Partial<SoloDriver>) => {
    const existing = rows.find((d) => d.id === id);
    if (!existing) return;
    const updated = { ...existing, ...fields };
    setRows((prev) => prev.map((d) => (d.id === id ? updated : d)));
    try {
      await api.put(`/drivers/${id}`, fromSolo(updated));
      setToast({ type: "success", msg: "Status updated" });
      setFetchKey((k) => k + 1);
    } catch (e) {
      setRows((prev) => prev.map((d) => (d.id === id ? existing : d)));
      setToast({ type: "error", msg: e instanceof Error ? e.message : "Update failed" });
    }
  };

  // Setting status to Completed completes the driver's current load — same lifecycle as
  // Board/Loads: one PUT /loads with status=completed AND every stop done (the backend
  // derives the driver's status to covered/ready from that; it doesn't mark stops done on
  // its own). No current load → just a normal driver status change.
  const completeLoad = async (driverId: string, loadId?: string) => {
    if (!loadId) { await patchRow(driverId, { status: "completed" }); return; }
    try {
      const load = await api.get<any>(`/loads/${loadId}`);
      const stops = (load.stops ?? []).map((s: any) => ({ ...s, done: true }));
      await api.put(`/loads/${loadId}`, { ...load, status: "completed", stops });
      setToast({ type: "success", msg: "Status updated" });
      setFetchKey((k) => k + 1);
    } catch (e) {
      setToast({ type: "error", msg: e instanceof Error ? e.message : "Update failed" });
    }
  };

  // A driver's status mirrors onto the load they're running, so dropping them out of
  // `completed` un-completes it — which deletes its payout. Ask first.
  const [uncompleting, setUncompleting] = useState<{ driver: SoloDriver; to: DriverStatus } | null>(null);

  const applyStatus = (d: SoloDriver, s: DriverStatus) => {
    if (s === "completed") completeLoad(d.id, d.currentLoadId);
    else patchRow(d.id, { status: s });
  };

  const requestStatus = (d: SoloDriver, s: DriverStatus) => {
    if (d.status === "completed" && s !== "completed") { setUncompleting({ driver: d, to: s }); return; }
    applyStatus(d, s);
  };

  // New drivers start as Company Driver — the common case.
  const openCreate = () => { setEditing({ type: "C/D" }); setFieldErrors({}); setModal("create"); };
  const openEdit   = (d: SoloDriver) => { setEditing(d); setFieldErrors({}); setModal("edit"); };
  const save = async (d: SoloDriver) => {
    setSaving(true);
    setFieldErrors({});
    try {
      if (modal === "create") {
        await api.post<any>("/drivers", fromSolo(d));
        setToast({ type: "success", msg: `${d.name} added successfully` });
      } else {
        // The modal only rearranges its own state on drag — the load order the user
        // left it in reaches the server here, folded into the same Save click as
        // every other field.
        const { swapped, queueChanged, newTailIds } = loadOrderPatch(d, editing);
        let body: Record<string, unknown> = fromSolo(d);
        if (swapped) {
          // next_load_id is deliberately dropped: the server re-points it at the
          // demoted load, so our now-stale value would override that — and if the
          // promoted load happens to BE the current next load, naming it would
          // contradict the swap outright.
          const { next_load_id: _drop, ...rest } = body;
          body = { ...rest, current_load_id: d.currentLoadId };
        }
        await api.put<any>(`/drivers/${d.id}`, body);
        if (queueChanged) await api.put(`/drivers/${d.id}/queue`, { load_ids: newTailIds });
        setToast({ type: "success", msg: `${d.name} updated successfully` });
      }
      setModal(null);
      setFetchKey((k) => k + 1);
    } catch (e) {
      const fieldErr = equipmentFieldError(e);
      if (fieldErr) {
        // Keep the modal open so the user can fix the truck/trailer select
        setFieldErrors(fieldErr);
      } else {
        setToast({ type: "error", msg: e instanceof Error ? e.message : "Save failed" });
      }
    } finally {
      setSaving(false);
    }
  };
  const del = async () => {
    if (!deleting) return;
    setDelErr(null);
    setDelBusy(true);
    try {
      await api.delete(`/drivers/${deleting.id}`);
      setToast({ type: "success", msg: `${deleting.name} removed` });
      setFetchKey((k) => k + 1);
      setDeleting(null);
    } catch (e) {
      setDelErr(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDelBusy(false);
    }
  };

  const handleSearch = (v: string) => setSearch(v);
  const handleStatus = (v: string) => setStatus(v);

  if (loading && rows.length === 0) return <PageLoader label="drivers" />;

  if (error) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "#ef4444" }}>
      {error}
    </div>
  );

  return (
    <>
      <Toolbar
        search={search} onSearch={handleSearch}
        statusFilter={statusFilter} onStatus={handleStatus}
        entityLabel="Driver" onManual={openCreate} onImport={() => setImporting(true)} onEld={() => setEldOpen(true)} canEld={canEld}
        placeholder="Search drivers, trucks…" canCreate={canCreate}
      />

      <div style={{ flex: 1, overflow: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
        <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "collapse", opacity: loading ? 0.45 : 1, pointerEvents: loading ? "none" : "auto", transition: "opacity 0.15s" }}>
          <thead>
            <tr>
              <TH width={36}>#</TH>
              <TH width={190}>Name</TH>
              <TH width={150}>Phone</TH>
              <TH width={72}>Type</TH>
              <TH width={110}>Status</TH>
              <TH width={120}>Current Load</TH>
              <TH width={120}>Next Load</TH>
              <TH width={110}>Truck</TH>
              <TH width={110}>Trailer</TH>
              <TH width={230}>Location</TH>
              <TH width={240}>Comment</TH>
              <TH width={90} align="center">Actions</TH>
            </tr>
          </thead>
          <tbody>
            {rows.map((d, i) => (
              <tr
                key={d.id}
                style={{ backgroundColor: i % 2 === 0 ? "var(--card)" : "var(--background)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "rgba(59,130,246,0.03)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = i % 2 === 0 ? "var(--card)" : "var(--background)"; }}
              >
                <TD mono center>{i + 1 + (page - 1) * pageSize}</TD>
                <TD>
                  <button
                    onClick={() => onSelectDriver(d)}
                    style={{
                      fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600,
                      color: "var(--primary)", background: "none", border: "none",
                      cursor: "pointer", padding: 0, textAlign: "left", outline: "none",
                    }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.textDecoration = "underline"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.textDecoration = "none"; }}
                  >
                    {d.name}
                  </button>
                </TD>
                <TD mono>{d.phone || "—"}</TD>
                <TD><TypeBadge type={d.type} /></TD>
                <TD><StatusDropdown value={d.status} onChange={(s) => requestStatus(d, s)} /></TD>
                <TD mono>
                  {d.currentLoad ? (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "var(--primary)", backgroundColor: "var(--secondary)", borderRadius: 4, padding: "2px 7px" }}>
                      {d.currentLoad}
                    </span>
                  ) : (
                    <span style={{ color: "var(--muted-foreground)" }}>—</span>
                  )}
                </TD>
                <TD mono>
                  {(d.nextLoads?.length ?? 0) > 0 ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {d.nextLoads!.map((q, i) => (
                        <span key={q.id} title={i === 0 ? "Next up" : `Queue position ${i + 1}`}
                          style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "#F59E0B", backgroundColor: "rgba(245,158,11,0.14)", borderRadius: 4, padding: "2px 7px", opacity: i === 0 ? 1 : 0.6 }}>
                          {q.loadId}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span style={{ color: "var(--muted-foreground)" }}>—</span>
                  )}
                </TD>
                <TD mono>{d.truck || "—"}</TD>
                <TD mono>{d.trailer || "—"}</TD>
                <TD>
                  <LocationCell location={d.location} eldLocation={d.eldLocation} lat={d.eldLat} lng={d.eldLng} />
                </TD>
                <TD>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <MessageSquare size={11} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200, display: "inline-block" }}>{d.comment || "—"}</span>
                  </span>
                </TD>
                <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", verticalAlign: "middle", textAlign: "center" }}>
                  <div style={{ display: "inline-flex", gap: 5 }}>
                    {canUpdate && <ActionBtn icon={<Pencil size={13} />} color="#3B82F6" bg="rgba(59,130,246,0.14)" onClick={() => openEdit(d)} />}
                    {canDelete && <ActionBtn icon={<Trash2 size={13} />} color="#EF4444" bg="rgba(239,68,68,0.14)" onClick={() => setDeleting(d)} />}
                    {!canUpdate && !canDelete && <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)" }}>—</span>}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={11} style={{ padding: "40px 20px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>
                  No drivers match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page} total={total} pageSize={pageSize} loading={loading}
        onPage={setPage} onPageSize={(s) => { setPageSize(s); setPage(1); }}
      />

      {(modal === "create" || modal === "edit") && (
        <SoloModal driver={editing} onClose={() => setModal(null)} onSave={save} canReorderLoads={canUpdate} saving={saving} fieldErrors={fieldErrors} canEditEquipment={canReadFleet} />
      )}
      {deleting && (
        <DeleteConfirm label={deleting.name} busy={delBusy} error={delErr} onClose={() => { setDeleting(null); setDelErr(null); }} onConfirm={del} />
      )}
      {uncompleting && (
        <UncompleteConfirm
          to={uncompleting.to}
          label={uncompleting.driver.currentLoad || uncompleting.driver.name}
          onCancel={() => setUncompleting(null)}
          onConfirm={() => { applyStatus(uncompleting.driver, uncompleting.to); setUncompleting(null); }}
        />
      )}
      {importing && (
        <ImportModal entityLabel="Driver" endpoint="/drivers/import" templateEndpoint="/drivers/import/template" templateFile="drivers-template.csv" onClose={() => setImporting(false)} onImported={() => setFetchKey((k) => k + 1)} />
      )}
      {eldOpen && (
        <EldModal canManage={canManageEld} onClose={() => setEldOpen(false)} onLinked={() => setFetchKey((k) => k + 1)} />
      )}
      {toast && <Toast type={toast.type} msg={toast.msg} onClose={() => setToast(null)} />}
    </>
  );
}

// ─── Team Tab ─────────────────────────────────────────────────────────────────

function TeamTab({ onSelectTeam, onCountChange }: { onSelectTeam: (d: TeamDriver) => void; onCountChange: (n: number) => void }) {
  const { user } = useAuth();
  const canCreate    = hasPerm(user, "drivers", "create");
  const canUpdate    = hasPerm(user, "drivers", "update");
  const canDelete    = hasPerm(user, "drivers", "delete");
  const canReadFleet = hasPerm(user, "equipments", "read");
  const canEld       = hasPerm(user, "eld", "read");   // see the ELD roster
  const canManageEld = hasPerm(user, "eld", "update"); // link / unlink / sync
  const [rows, setRows]               = useState<TeamDriver[]>([]);
  const [total, setTotal]             = useState(0);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [modal, setModal]             = useState<"create" | "edit" | null>(null);
  const [editing, setEditing]         = useState<Partial<TeamDriver>>({});
  const [deleting, setDeleting]       = useState<TeamDriver | null>(null);
  const [delBusy, setDelBusy]         = useState(false);
  const [delErr, setDelErr]           = useState<string | null>(null);
  const [saving, setSaving]           = useState(false);
  const [search, setSearch]                   = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatus]             = useState("All");
  const [page, setPage]                       = useState(1);
  const [pageSize, setPageSize]               = useState(20);
  const [importing, setImporting]             = useState(false);
  const [eldOpen, setEldOpen]                 = useState(false);
  const [toast, setToast]                     = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [fetchKey, setFetchKey]               = useState(0);
  const [fieldErrors, setFieldErrors]         = useState<{ truck?: string; trailer?: string }>({});

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [statusFilter]);

  useEffect(() => {
    setLoading(true);
    api.getList<any>("/drivers", {
      q: debouncedSearch || undefined,
      status: statusFilter !== "All" ? statusFilter : undefined,
      team: "true",
      page,
      page_size: pageSize,
    })
      .then(({ items, total: t }) => {
        setRows((items ?? []).map(toTeam));
        setTotal(t);
        onCountChange(t);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [fetchKey, debouncedSearch, statusFilter, page, pageSize]);

  const patchRow = async (id: string, fields: Partial<TeamDriver>) => {
    const existing = rows.find((d) => d.id === id);
    if (!existing) return;
    const updated = { ...existing, ...fields };
    setRows((prev) => prev.map((d) => (d.id === id ? updated : d)));
    try {
      await api.put(`/drivers/${id}`, fromTeam(updated));
      setToast({ type: "success", msg: "Status updated" });
      setFetchKey((k) => k + 1);
    } catch (e) {
      setRows((prev) => prev.map((d) => (d.id === id ? existing : d)));
      setToast({ type: "error", msg: e instanceof Error ? e.message : "Update failed" });
    }
  };

  // Same lifecycle as Board/Loads/Solo: completing the current load is a PUT /loads with
  // status=completed + every stop done, not a plain driver status change.
  const completeLoad = async (driverId: string, loadId?: string) => {
    if (!loadId) { await patchRow(driverId, { status: "completed" }); return; }
    try {
      const load = await api.get<any>(`/loads/${loadId}`);
      const stops = (load.stops ?? []).map((s: any) => ({ ...s, done: true }));
      await api.put(`/loads/${loadId}`, { ...load, status: "completed", stops });
      setToast({ type: "success", msg: "Status updated" });
      setFetchKey((k) => k + 1);
    } catch (e) {
      setToast({ type: "error", msg: e instanceof Error ? e.message : "Update failed" });
    }
  };

  // See the solo table — un-completing deletes the load's payout, so it asks first.
  const [uncompleting, setUncompleting] = useState<{ driver: TeamDriver; to: DriverStatus } | null>(null);

  const applyStatus = (d: TeamDriver, s: DriverStatus) => {
    if (s === "completed") completeLoad(d.id, d.currentLoadId);
    else patchRow(d.id, { status: s });
  };

  const requestStatus = (d: TeamDriver, s: DriverStatus) => {
    if (d.status === "completed" && s !== "completed") { setUncompleting({ driver: d, to: s }); return; }
    applyStatus(d, s);
  };

  // New drivers start as Company Driver — the common case.
  const openCreate = () => { setEditing({ type: "C/D" }); setFieldErrors({}); setModal("create"); };
  const openEdit   = (d: TeamDriver) => { setEditing(d); setFieldErrors({}); setModal("edit"); };
  const save = async (d: TeamDriver) => {
    setSaving(true);
    setFieldErrors({});
    try {
      if (modal === "create") {
        await api.post<any>("/drivers", fromTeam(d));
        setToast({ type: "success", msg: `${d.name1} & ${d.name2} added successfully` });
      } else {
        // See the solo table's save() for why this reorder rides along with the field
        // save instead of firing on drag.
        const { swapped, queueChanged, newTailIds } = loadOrderPatch(d, editing);
        let body: Record<string, unknown> = fromTeam(d);
        if (swapped) {
          const { next_load_id: _drop, ...rest } = body;
          body = { ...rest, current_load_id: d.currentLoadId };
        }
        await api.put<any>(`/drivers/${d.id}`, body);
        if (queueChanged) await api.put(`/drivers/${d.id}/queue`, { load_ids: newTailIds });
        setToast({ type: "success", msg: `Team updated successfully` });
      }
      setModal(null);
      setFetchKey((k) => k + 1);
    } catch (e) {
      const fieldErr = equipmentFieldError(e);
      if (fieldErr) {
        setFieldErrors(fieldErr);
      } else {
        setToast({ type: "error", msg: e instanceof Error ? e.message : "Save failed" });
      }
    } finally {
      setSaving(false);
    }
  };
  const del = async () => {
    if (!deleting) return;
    setDelErr(null);
    setDelBusy(true);
    try {
      await api.delete(`/drivers/${deleting.id}`);
      setToast({ type: "success", msg: `${deleting.name1} & ${deleting.name2} removed` });
      setFetchKey((k) => k + 1);
      setDeleting(null);
    } catch (e) {
      setDelErr(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDelBusy(false);
    }
  };

  const handleSearch = (v: string) => setSearch(v);
  const handleStatus = (v: string) => setStatus(v);

  if (loading && rows.length === 0) return <PageLoader label="teams" />;

  if (error) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "#ef4444" }}>
      {error}
    </div>
  );

  return (
    <>
      <Toolbar
        search={search} onSearch={handleSearch}
        statusFilter={statusFilter} onStatus={handleStatus}
        entityLabel="Team" onManual={openCreate} onImport={() => setImporting(true)} onEld={() => setEldOpen(true)} canEld={canEld}
        placeholder="Search teams, trucks…" canCreate={canCreate}
      />

      <div style={{ flex: 1, overflow: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
        <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "collapse", opacity: loading ? 0.45 : 1, pointerEvents: loading ? "none" : "auto", transition: "opacity 0.15s" }}>
          <thead>
            <tr>
              <TH width={36}>#</TH>
              <TH width={180}>Driver 1</TH>
              <TH width={150}>Phone 1</TH>
              <TH width={180}>Driver 2</TH>
              <TH width={150}>Phone 2</TH>
              <TH width={72}>Type</TH>
              <TH width={110}>Status</TH>
              <TH width={120}>Current Load</TH>
              <TH width={120}>Next Load</TH>
              <TH width={110}>Truck</TH>
              <TH width={110}>Trailer</TH>
              <TH width={230}>Location</TH>
              <TH width={240}>Comment</TH>
              <TH width={90} align="center">Actions</TH>
            </tr>
          </thead>
          <tbody>
            {rows.map((d, i) => (
              <tr
                key={d.id}
                style={{ backgroundColor: i % 2 === 0 ? "var(--card)" : "var(--background)" }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "rgba(59,130,246,0.03)"; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = i % 2 === 0 ? "var(--card)" : "var(--background)"; }}
              >
                <TD mono center>{i + 1 + (page - 1) * pageSize}</TD>
                <TD>
                  <button
                    onClick={() => onSelectTeam(d)}
                    style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, color: "var(--primary)", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left", outline: "none" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.textDecoration = "underline"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.textDecoration = "none"; }}
                  >{d.name1}</button>
                </TD>
                <TD mono>{d.phone1 || "—"}</TD>
                <TD>
                  <button
                    onClick={() => onSelectTeam(d)}
                    style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, color: "var(--primary)", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left", outline: "none" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.textDecoration = "underline"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.textDecoration = "none"; }}
                  >{d.name2}</button>
                </TD>
                <TD mono>{d.phone2 || "—"}</TD>
                <TD><TypeBadge type={d.type} /></TD>
                <TD><StatusDropdown value={d.status} onChange={(s) => requestStatus(d, s)} /></TD>
                <TD mono>
                  {d.currentLoad ? (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "var(--primary)", backgroundColor: "var(--secondary)", borderRadius: 4, padding: "2px 7px" }}>
                      {d.currentLoad}
                    </span>
                  ) : (
                    <span style={{ color: "var(--muted-foreground)" }}>—</span>
                  )}
                </TD>
                <TD mono>
                  {(d.nextLoads?.length ?? 0) > 0 ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {d.nextLoads!.map((q, i) => (
                        <span key={q.id} title={i === 0 ? "Next up" : `Queue position ${i + 1}`}
                          style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "#F59E0B", backgroundColor: "rgba(245,158,11,0.14)", borderRadius: 4, padding: "2px 7px", opacity: i === 0 ? 1 : 0.6 }}>
                          {q.loadId}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <span style={{ color: "var(--muted-foreground)" }}>—</span>
                  )}
                </TD>
                <TD mono>{d.truck || "—"}</TD>
                <TD mono>{d.trailer || "—"}</TD>
                <TD>
                  <LocationCell location={d.location} eldLocation={d.eldLocation} lat={d.eldLat} lng={d.eldLng} />
                </TD>
                <TD>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <MessageSquare size={11} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200, display: "inline-block" }}>{d.comment || "—"}</span>
                  </span>
                </TD>
                <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", verticalAlign: "middle", textAlign: "center" }}>
                  <div style={{ display: "inline-flex", gap: 5 }}>
                    {canUpdate && <ActionBtn icon={<Pencil size={13} />} color="#3B82F6" bg="rgba(59,130,246,0.14)" onClick={() => openEdit(d)} />}
                    {canDelete && <ActionBtn icon={<Trash2 size={13} />} color="#EF4444" bg="rgba(239,68,68,0.14)" onClick={() => setDeleting(d)} />}
                    {!canUpdate && !canDelete && <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)" }}>—</span>}
                  </div>
                </td>
              </tr>
            ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={14} style={{ padding: "40px 20px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>
                  No teams match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page} total={total} pageSize={pageSize} loading={loading}
        onPage={setPage} onPageSize={(s) => { setPageSize(s); setPage(1); }}
      />

      {(modal === "create" || modal === "edit") && (
        <TeamModal driver={editing} onClose={() => setModal(null)} onSave={save} canReorderLoads={canUpdate} saving={saving} fieldErrors={fieldErrors} canEditEquipment={canReadFleet} />
      )}
      {deleting && (
        <DeleteConfirm label={`${deleting.name1} & ${deleting.name2}`} busy={delBusy} error={delErr} onClose={() => { setDeleting(null); setDelErr(null); }} onConfirm={del} />
      )}
      {uncompleting && (
        <UncompleteConfirm
          to={uncompleting.to}
          label={uncompleting.driver.currentLoad || uncompleting.driver.name1}
          onCancel={() => setUncompleting(null)}
          onConfirm={() => { applyStatus(uncompleting.driver, uncompleting.to); setUncompleting(null); }}
        />
      )}
      {importing && (
        <ImportModal entityLabel="Team" endpoint="/drivers/import" templateEndpoint="/drivers/import/template" templateFile="drivers-template.csv" onClose={() => setImporting(false)} onImported={() => setFetchKey((k) => k + 1)} />
      )}
      {eldOpen && (
        <EldModal canManage={canManageEld} onClose={() => setEldOpen(false)} onLinked={() => setFetchKey((k) => k + 1)} />
      )}
      {toast && <Toast type={toast.type} msg={toast.msg} onClose={() => setToast(null)} />}
    </>
  );
}

// ─── Page shell ───────────────────────────────────────────────────────────────

type TabId = "solo" | "team";

export function DriversPage() {
  const [tab, setTab]               = useState<TabId>("solo");
  const [detailDriver, setDetail]   = useState<SoloDriver | null>(null);
  const [detailTeam, setDetailTeam] = useState<TeamDriver | null>(null);
  const [soloCount, setSoloCount]   = useState<number | null>(null);
  const [teamCount, setTeamCount]   = useState<number | null>(null);
  const inDetail = detailDriver !== null || detailTeam !== null;

  const tabs: { id: TabId; label: string; count: number | null; icon: React.ReactNode; color: string; bg: string }[] = [
    { id: "solo", label: "Solo Drivers", count: soloCount, icon: <User size={15} />,  color: "#3B82F6", bg: "rgba(59,130,246,0.14)" },
    { id: "team", label: "Team Drivers", count: teamCount, icon: <Users size={15} />, color: "#8B5CF6", bg: "rgba(139,92,246,0.14)" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "var(--background)", overflow: "hidden" }}>

      {/* Tab bar — hidden while in detail view */}
      {!inDetail && (
        <div style={{ backgroundColor: "var(--card)", borderBottom: "1px solid var(--border)", padding: "0 24px", flexShrink: 0, display: "flex", alignItems: "flex-end", gap: 2 }}>
          {tabs.map((t) => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "12px 18px",
                  fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: active ? 600 : 400,
                  color: active ? t.color : "var(--muted-foreground)",
                  backgroundColor: "transparent",
                  border: "none", borderBottom: active ? `2px solid ${t.color}` : "2px solid transparent",
                  cursor: "pointer", transition: "all 0.15s", marginBottom: -1, outline: "none",
                }}
              >
                <span style={{ color: active ? t.color : "var(--muted-foreground)", opacity: active ? 1 : 0.6 }}>{t.icon}</span>
                {t.label}
                {t.count !== null && (
                  <span style={{
                    fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700,
                    color: active ? t.color : "var(--muted-foreground)",
                    backgroundColor: active ? t.bg : "var(--muted)",
                    borderRadius: 10, padding: "1px 7px",
                  }}>
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Content */}
      <div style={{ flex: 1, overflow: "hidden", padding: "20px 24px", display: "flex", flexDirection: "column" }}>
        <div style={{
          flex: 1, display: "flex", flexDirection: "column", overflow: "hidden",
          backgroundColor: "var(--card)",
          border: "1px solid var(--border)",
          borderRadius: 12,
        }}>
          {detailDriver ? (
            <DriverDetail driver={detailDriver} onBack={() => setDetail(null)} />
          ) : detailTeam ? (
            <TeamDetail team={detailTeam} onBack={() => setDetailTeam(null)} />
          ) : (
            <>
              <div style={{ display: tab === "solo" ? "contents" : "none" }}>
                <SoloTab onSelectDriver={setDetail} onCountChange={setSoloCount} />
              </div>
              <div style={{ display: tab === "team" ? "contents" : "none" }}>
                <TeamTab onSelectTeam={setDetailTeam} onCountChange={setTeamCount} />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
