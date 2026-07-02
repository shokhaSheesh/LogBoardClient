import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Status, STATUS_CONFIG, ALL_STATUSES } from "../lib/statuses";
import { api } from "../lib/api";
import {
  User, Users, Plus, Pencil, Trash2, MapPin, MessageSquare,
  X, Check, Search, ChevronDown, ChevronLeft, ChevronRight,
  ClipboardList, FileSpreadsheet, Radio, Upload, FileText,
  ArrowLeft, Phone, Truck, DollarSign, Route, Package, TrendingUp,
  AlertCircle,
} from "lucide-react";

type DriverStatus = Status;
type DriverType   = "O/O" | "C/D";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SoloDriver {
  id: string; name: string; phone: string; type: DriverType;
  status: DriverStatus; truck: string; trailer: string; location: string; comment: string;
  weeklyGrossTarget?: number;
  currentLoad?: string;
  currentLoadId?: string;
  nextLoad?: string;
  nextLoadId?: string;
}

interface TeamDriver {
  id: string; name1: string; name2: string; phone1: string; phone2: string;
  type: DriverType; status: DriverStatus; truck: string; trailer: string; comment: string;
  weeklyGrossTarget?: number;
  currentLoad?: string;
  currentLoadId?: string;
  nextLoad?: string;
  nextLoadId?: string;
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
    location: d.location ?? "",
    comment: d.comment ?? "",
    weeklyGrossTarget: d.weekly_gross_target || undefined,
    currentLoad:   d.current_load    || undefined,
    currentLoadId: d.current_load_id || undefined,
    nextLoad:      d.next_load       || undefined,
    nextLoadId:    d.next_load_id    || undefined,
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
    comment: d.comment ?? "",
    weeklyGrossTarget: d.weekly_gross_target || undefined,
    currentLoad:   d.current_load    || undefined,
    currentLoadId: d.current_load_id || undefined,
    nextLoad:      d.next_load       || undefined,
    nextLoadId:    d.next_load_id    || undefined,
  };
}

function fromSolo(d: Partial<SoloDriver>) {
  return {
    name: d.name ?? "",
    phone: d.phone ?? "",
    type: d.type ?? "O/O",
    team: false,
    status: d.status ?? "ready",
    truck: d.truck ?? "",
    trailer: d.trailer ?? "",
    location: d.location ?? "",
    comment: d.comment ?? "",
    weekly_gross_target: d.weeklyGrossTarget ?? 0,
    next_load_id: d.nextLoadId || null,
  };
}

function fromTeam(d: Partial<TeamDriver>) {
  return {
    name: d.name1 ?? "",
    name2: d.name2 ?? "",
    phone: d.phone1 ?? "",
    phone2: d.phone2 ?? "",
    type: d.type ?? "C/D",
    team: true,
    status: d.status ?? "ready",
    truck: d.truck ?? "",
    trailer: d.trailer ?? "",
    comment: d.comment ?? "",
    weekly_gross_target: d.weeklyGrossTarget ?? 0,
    next_load_id: d.nextLoadId || null,
  };
}

// ─── Custom Select ────────────────────────────────────────────────────────────

interface SelectOpt { value: string; label: string; dot?: string }

function CustomSelect({
  value, options, onChange, width, compact = false, dropUp = false, searchable = false, disabled = false,
}: {
  value: string;
  options: SelectOpt[];
  onChange: (v: string) => void;
  width?: number | string;
  compact?: boolean;
  dropUp?: boolean;
  searchable?: boolean;
  disabled?: boolean;
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
          backgroundColor: disabled ? "var(--muted)" : "var(--input-background)",
          border: `1px solid ${open ? "var(--primary)" : "var(--border)"}`,
          borderRadius: 7, color: disabled ? "var(--muted-foreground)" : "var(--foreground)",
          cursor: disabled ? "not-allowed" : "pointer",
          opacity: disabled ? 0.55 : 1,
          boxShadow: open ? "0 0 0 3px rgba(59,130,246,0.12)" : "none",
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
          <div style={{ maxHeight: 180, overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
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
        </div>
      )}
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

const PAGE_SIZES = [20, 40, 60, 100];

function Pagination({
  page, total, pageSize, onPage, onPageSize, totalPending = false,
}: {
  page: number; total: number; pageSize: number; totalPending?: boolean;
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
          {total === 0 ? "No results" : `Showing ${from}–${to}`}
          {total > 0 && (totalPending
            ? <span style={{ fontSize: 8, fontWeight: 700, color: "#D97706", backgroundColor: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 4, padding: "1px 4px", letterSpacing: "0.04em", textTransform: "uppercase" }}>total pending</span>
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
        <PBtn disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft size={14} />
        </PBtn>
        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`e${i}`} style={{ padding: "0 4px", fontSize: 13, color: "var(--muted-foreground)", lineHeight: "30px" }}>…</span>
          ) : (
            <PBtn key={p} active={p === page} onClick={() => onPage(p as number)}>{p}</PBtn>
          )
        )}
        <PBtn disabled={page >= totalPages} onClick={() => onPage(page + 1)}>
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

function StatusDropdown({ value, onChange }: { value: Status; onChange: (s: Status) => void }) {
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
      if (!anchorRef.current?.contains(e.target as Node) && !dropRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const cfg = STATUS_CONFIG[value];

  return (
    <>
      <div ref={anchorRef} onClick={toggle} style={{ cursor: "pointer", display: "inline-flex" }}>
        <span style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600,
          color: cfg.color, backgroundColor: cfg.bg,
          borderRadius: 4, padding: "3px 8px", whiteSpace: "nowrap", userSelect: "none",
        }}>
          {cfg.label}
          <ChevronDown size={10} style={{ opacity: 0.7, marginLeft: 1 }} />
        </span>
      </div>
      {open && rect && createPortal(
        <div ref={dropRef} style={{
          position: "fixed", top: rect.bottom + 5, left: rect.left, zIndex: 9999,
          backgroundColor: "var(--card)", border: "1px solid var(--border)",
          borderRadius: 10, boxShadow: "0 10px 30px rgba(0,0,0,0.16)",
          padding: "5px", minWidth: 168, display: "flex", flexDirection: "column", gap: 1,
        }}>
          {ALL_STATUSES.map((s) => {
            const c = STATUS_CONFIG[s];
            const active = s === value;
            return (
              <button key={s} onMouseDown={(e) => { e.preventDefault(); onChange(s); setOpen(false); }}
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
      )}
    </>
  );
}

function TypeBadge({ type }: { type: DriverType }) {
  return (
    <span style={{
      fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600,
      color: type === "O/O" ? "#1D4ED8" : "#5B21B6",
      backgroundColor: type === "O/O" ? "#DBEAFE" : "#EDE9FE",
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

// Truck/trailer options are fetched per-tab from /trucks and /trailers
const EMPTY_OPTS: SelectOpt[] = [];

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
  <span style={{ fontSize: 8, fontWeight: 700, color: "#D97706", backgroundColor: "#FEF3C7", border: "1px solid #FDE68A", borderRadius: 4, padding: "1px 4px", letterSpacing: "0.04em", textTransform: "uppercase" as const, marginLeft: 4 }}>
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

// ─── Modals ───────────────────────────────────────────────────────────────────

function SoloModal({ driver, onClose, onSave, truckOpts, trailerOpts, saving }: {
  driver: Partial<SoloDriver>; onClose: () => void; onSave: (d: SoloDriver) => void;
  truckOpts: SelectOpt[]; trailerOpts: SelectOpt[]; saving?: boolean;
}) {
  const [form, setForm] = useState<Partial<SoloDriver>>(driver);
  const [touched, setTouched] = useState<Partial<Record<keyof SoloDriver, boolean>>>({});
  const [loadOpts, setLoadOpts] = useState<SelectOpt[]>([]);
  const set = (k: keyof SoloDriver, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const touch = (k: keyof SoloDriver) => setTouched((t) => ({ ...t, [k]: true }));
  const isNew = !driver.id;

  useEffect(() => {
    if (!driver.id) return;
    api.getList<any>("/loads", { driver_id: driver.id, page_size: 100 })
      .then(({ items }) => {
        const opts = (items ?? [])
          .filter((l: any) => l.status !== "completed" && l.id !== driver.currentLoadId)
          .map((l: any) => ({ value: l.id, label: l.load_id ?? l.id }));
        setLoadOpts([{ value: "", label: "— None —" }, ...opts]);
      })
      .catch(() => {});
  }, [driver.id]);

  const err = (k: keyof SoloDriver) => touched[k] && !form[k]?.toString().trim();

  const handleSave = () => {
    setTouched({ name: true, phone: true });
    if (!form.name?.trim() || !form.phone?.trim()) return;
    onSave(form as SoloDriver);
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
            <FieldLabel>Truck Unit</FieldLabel>
            <CustomSelect value={form.truck ?? ""} options={truckOpts} onChange={(v) => set("truck", v)} searchable />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <FieldLabel>Trailer Unit</FieldLabel>
            <CustomSelect value={form.trailer ?? ""} options={trailerOpts} onChange={(v) => set("trailer", v)} searchable />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <FieldLabel>Type</FieldLabel>
            <CustomSelect value={form.type ?? "O/O"} options={TYPE_OPTS} onChange={(v) => set("type", v)} />
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

          {!isNew && (
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <FieldLabel>Current Load</FieldLabel>
              <div style={{ height: 34, display: "flex", alignItems: "center", padding: "0 10px", borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: 12, color: form.currentLoad ? "var(--foreground)" : "var(--muted-foreground)" }}>
                {form.currentLoad ?? "—"}
              </div>
            </label>
          )}

          {!isNew && (
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <FieldLabel>Next Load</FieldLabel>
              <CustomSelect value={form.nextLoadId ?? ""} options={loadOpts} onChange={(v) => set("nextLoadId", v)} searchable />
            </label>
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

function TeamModal({ driver, onClose, onSave, truckOpts, trailerOpts, saving }: {
  driver: Partial<TeamDriver>; onClose: () => void; onSave: (d: TeamDriver) => void;
  truckOpts: SelectOpt[]; trailerOpts: SelectOpt[]; saving?: boolean;
}) {
  const [form, setForm] = useState<Partial<TeamDriver>>(driver);
  const [touched, setTouched] = useState<Partial<Record<keyof TeamDriver, boolean>>>({});
  const set = (k: keyof TeamDriver, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const touch = (k: keyof TeamDriver) => setTouched((t) => ({ ...t, [k]: true }));
  const isNew = !driver.id;

  const [loadOpts, setLoadOpts] = useState<SelectOpt[]>([]);

  useEffect(() => {
    if (!driver.id) return;
    api.getList<any>("/loads", { driver_id: driver.id, page_size: 100 })
      .then(({ items }) => {
        const opts = (items ?? [])
          .filter((l: any) => l.status !== "completed" && l.id !== driver.currentLoadId)
          .map((l: any) => ({ value: l.id, label: l.load_id ?? l.id }));
        setLoadOpts([{ value: "", label: "— None —" }, ...opts]);
      })
      .catch(() => {});
  }, [driver.id]);

  const err = (k: keyof TeamDriver) => touched[k] && !form[k]?.toString().trim();

  const handleSave = () => {
    setTouched({ name1: true, phone1: true, name2: true, phone2: true });
    if (!form.name1?.trim() || !form.phone1?.trim() || !form.name2?.trim() || !form.phone2?.trim()) return;
    onSave(form as TeamDriver);
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
            <FieldLabel>Truck Unit</FieldLabel>
            <CustomSelect value={form.truck ?? ""} options={truckOpts} onChange={(v) => set("truck", v)} searchable />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <FieldLabel>Trailer Unit</FieldLabel>
            <CustomSelect value={form.trailer ?? ""} options={trailerOpts} onChange={(v) => set("trailer", v)} searchable />
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

          {!isNew && (
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <FieldLabel>Current Load</FieldLabel>
              <div style={{ height: 34, display: "flex", alignItems: "center", padding: "0 10px", borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "var(--muted)", fontFamily: "var(--font-mono)", fontSize: 12, color: form.currentLoad ? "var(--foreground)" : "var(--muted-foreground)" }}>
                {form.currentLoad ?? "—"}
              </div>
            </label>
          )}

          {!isNew && (
            <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <FieldLabel>Next Load</FieldLabel>
              <CustomSelect value={form.nextLoadId ?? ""} options={loadOpts} onChange={(v) => set("nextLoadId", v)} searchable />
            </label>
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

function DeleteConfirm({ label, onClose, onConfirm }: { label: string; onClose: () => void; onConfirm: () => void }) {
  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ backgroundColor: "var(--card)", borderRadius: 12, width: 380, padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,0.22)", textAlign: "center" }}>
        <div style={{ width: 44, height: 44, borderRadius: "50%", backgroundColor: "#FEE2E2", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
          <Trash2 size={20} color="#EF4444" />
        </div>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 600, color: "var(--foreground)", marginBottom: 6 }}>Delete driver?</div>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)", marginBottom: 22 }}>
          <strong>{label}</strong> will be permanently removed.
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button onClick={onClose} style={{ fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 20px", borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "var(--muted)", color: "var(--foreground)", cursor: "pointer" }}>Cancel</button>
          <button onClick={onConfirm} style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "7px 20px", borderRadius: 6, border: "none", backgroundColor: "#EF4444", color: "#fff", cursor: "pointer" }}>Delete</button>
        </div>
      </div>
    </div>
  );
}

// ─── Import Modal ─────────────────────────────────────────────────────────────

function ImportModal({ entityLabel, onClose }: { entityLabel: string; onClose: () => void }) {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) setFile(f);
  };

  return (
    <div style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ backgroundColor: "var(--card)", borderRadius: 12, width: 520, boxShadow: "0 20px 60px rgba(0,0,0,0.22)" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--border)", backgroundColor: "var(--muted)", borderRadius: "12px 12px 0 0" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <div style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: "#ECFDF5", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <FileSpreadsheet size={15} color="#059669" />
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
              backgroundColor: dragging ? "var(--accent)" : file ? "#F0FDF4" : "var(--input-background)",
              cursor: "pointer", transition: "all 0.15s",
            }}
          >
            <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls,.pdf" onChange={handleFile} style={{ display: "none" }} />
            {file ? (
              <>
                <div style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: "#D1FAE5", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px" }}>
                  <FileText size={22} color="#059669" />
                </div>
                <div style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, color: "#065F46" }}>{file.name}</div>
                <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "#6B7280", marginTop: 4 }}>
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
                  or <span style={{ color: "var(--primary)", fontWeight: 500 }}>browse files</span> — CSV, Excel, PDF
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
            <button style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, padding: "5px 12px", borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "var(--card)", color: "var(--foreground)", cursor: "pointer" }}>
              Download
            </button>
          </div>

          {/* Coming-soon notice */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", backgroundColor: "#FFF7ED", borderRadius: 8, border: "1px solid #FED7AA" }}>
            <span style={{ fontSize: 15, lineHeight: 1, marginTop: 1 }}>🚧</span>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "#92400E", lineHeight: 1.5 }}>
              <strong>Automated parsing is finishing up.</strong> You can upload your file now and our team will process it within 24 h, or add drivers manually in the meantime.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "14px 20px", borderTop: "1px solid var(--border)" }}>
          <button onClick={onClose} style={{ fontFamily: "var(--font-sans)", fontSize: 13, padding: "7px 16px", borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "var(--muted)", color: "var(--foreground)", cursor: "pointer" }}>
            Cancel
          </button>
          <button
            disabled={!file}
            style={{
              fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "7px 16px",
              borderRadius: 6, border: "none",
              backgroundColor: file ? "#059669" : "var(--muted)",
              color: file ? "#fff" : "var(--muted-foreground)",
              cursor: file ? "pointer" : "not-allowed",
              display: "flex", alignItems: "center", gap: 6,
              transition: "background-color 0.15s",
            }}
          >
            <Upload size={14} /> Submit for Import
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Menu ─────────────────────────────────────────────────────────────────

function AddMenu({ entityLabel, onManual, onImport, onEld }: {
  entityLabel: string;
  onManual: () => void;
  onImport: () => void;
  onEld: () => void;
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
      iconColor: "#059669", iconBg: "#ECFDF5",
      label: "Import from File",
      desc: "Upload a CSV, Excel or PDF roster",
      comingSoon: false,
      onClick: onImport,
    },
    {
      icon: <Radio size={16} />,
      iconColor: "#0891B2", iconBg: "#ECFEFF",
      label: "Sync from ELD",
      desc: "Pull driver records from your ELD provider",
      comingSoon: false,
      onClick: onEld,
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
                      color: "#7C3AED", backgroundColor: "#F5F3FF",
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

function DriverDetail({ driver, onBack }: { driver: SoloDriver; onBack: () => void }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [loads, setLoads]           = useState<WeekLoad[]>([]);
  const [loadingLoads, setLoadingLoads] = useState(true);

  useEffect(() => {
    setLoadingLoads(true);
    fetchWeekLoads(driver.id, weekOffset)
      .then(setLoads)
      .catch(() => setLoads([]))
      .finally(() => setLoadingLoads(false));
  }, [driver.id, weekOffset]);

  const { start: weekStart, end: weekEnd } = getWeekBounds(weekOffset);
  const totalGross = loads.reduce((s, l) => s + l.payout, 0);
  const totalMiles = loads.reduce((s, l) => s + l.miles, 0);
  const avgRate    = totalMiles > 0 ? totalGross / totalMiles : 0;
  const target     = driver.weeklyGrossTarget;
  const targetPct  = target ? Math.min(100, Math.round((totalGross / target) * 100)) : null;

  const initials = driver.name.split(" ").slice(0, 2).map((w) => w[0]).join("");

  const metrics = [
    { label: "Week Gross",  value: `$${totalGross.toLocaleString()}`,                            icon: <DollarSign size={16} />, color: "#065F46", bg: "#D1FAE5" },
    { label: "Total Miles", value: totalMiles > 0 ? totalMiles.toLocaleString() : "—",           icon: <Route      size={16} />, color: "#1D4ED8", bg: "#DBEAFE" },
    { label: "Loads",       value: String(loads.length),                                          icon: <Package    size={16} />, color: "#5B21B6", bg: "#EDE9FE" },
    { label: "Avg $/Mile",  value: totalMiles > 0 ? `$${avgRate.toFixed(2)}` : "—",              icon: <TrendingUp size={16} />, color: "#92400E", bg: "#FEF3C7" },
  ];

  const infoRows: { icon: React.ReactNode; label: string; value: string; mono?: boolean; highlight?: boolean }[] = [
    { icon: <Phone        size={13} />, label: "Phone",        value: driver.phone,          mono: true },
    { icon: <Package      size={13} />, label: "Current Load", value: driver.currentLoad ?? "", mono: true, highlight: true },
    { icon: <Package      size={13} />, label: "Next Load",    value: driver.nextLoad    ?? "", mono: true },
    { icon: <Truck        size={13} />, label: "Truck",        value: driver.truck,          mono: true },
    { icon: <Truck        size={13} />, label: "Trailer",      value: driver.trailer,        mono: true },
    { icon: <MapPin       size={13} />, label: "Location",     value: driver.location             },
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
                {fmtWeekRange(weekStart, weekEnd)}
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
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
                      <TH width={110} align="center">Pickup</TH>
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
                          <TD mono>{load.loadId || load.id}</TD>
                          <TD>{load.origin}</TD>
                          <TD>{load.destination}</TD>
                          <TD mono center>{load.miles.toLocaleString()}</TD>
                          <TD mono center>${load.payout.toLocaleString()}</TD>
                          <TD center>{load.pickupAppt ? new Date(load.pickupAppt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</TD>
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

// ─── Week helpers ────────────────────────────────────────────────────────────

function getWeekBounds(offset: number): { start: Date; end: Date } {
  const now = new Date();
  const day = now.getDay();
  const mon = new Date(now);
  mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1) + offset * 7);
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);
  return { start: mon, end: sun };
}

function fmtWeekRange(start: Date, end: Date): string {
  const o: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${start.toLocaleDateString("en-US", o)} – ${end.toLocaleDateString("en-US", o)}, ${end.getFullYear()}`;
}

interface WeekLoad {
  id: string; loadId: string; origin: string; destination: string;
  miles: number; payout: number; pickupAppt: string; status: string;
}

// Backend sends pickup_appt as "MM/DD · HH:mm" from /loads, "MM/DD HH:mm" from /board
function parseAppt(raw: string): Date | null {
  const m = raw.match(/^(\d{1,2})\/(\d{1,2})\s*(?:·\s*)?(\d{2}):(\d{2})$/);
  if (!m) return null;
  const year = new Date().getFullYear();
  return new Date(year, Number(m[1]) - 1, Number(m[2]), Number(m[3]), Number(m[4]));
}

function fetchWeekLoads(driverId: string, offset: number): Promise<WeekLoad[]> {
  const { start, end } = getWeekBounds(offset);
  return api.getList<any>("/loads", { driver_id: driverId, page_size: 200 }).then(({ items }) =>
    (items ?? [])
      .filter((l: any) => {
        const d = parseAppt(l.pickup_appt ?? "");
        return d !== null && d >= start && d <= end;
      })
      .map((l: any) => ({
        id: l.id, loadId: l.load_id ?? "",
        origin: l.origin ?? "", destination: l.destination ?? "",
        miles: l.miles ?? 0, payout: l.payout ?? 0,
        pickupAppt: l.pickup_appt ?? "", status: l.status ?? "",
      }))
  );
}

// ─── Team Detail ─────────────────────────────────────────────────────────────

function TeamDetail({ team, onBack }: { team: TeamDriver; onBack: () => void }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [loads, setLoads]           = useState<WeekLoad[]>([]);
  const [loadingLoads, setLoadingLoads] = useState(true);

  useEffect(() => {
    setLoadingLoads(true);
    fetchWeekLoads(team.id, weekOffset)
      .then(setLoads)
      .catch(() => setLoads([]))
      .finally(() => setLoadingLoads(false));
  }, [team.id, weekOffset]);

  const { start: weekStart, end: weekEnd } = getWeekBounds(weekOffset);
  const totalGross = loads.reduce((s, l) => s + l.payout, 0);
  const totalMiles = loads.reduce((s, l) => s + l.miles, 0);
  const avgRate    = totalMiles > 0 ? totalGross / totalMiles : 0;
  const target     = team.weeklyGrossTarget;
  const targetPct  = target ? Math.min(100, Math.round((totalGross / target) * 100)) : null;

  const initials1 = team.name1.split(" ").slice(0, 2).map((w) => w[0]).join("");
  const initials2 = team.name2.split(" ").slice(0, 2).map((w) => w[0]).join("");

  const metrics = [
    { label: "Week Gross",  value: `$${totalGross.toLocaleString()}`,                   icon: <DollarSign size={16} />, color: "#065F46", bg: "#D1FAE5" },
    { label: "Total Miles", value: totalMiles > 0 ? totalMiles.toLocaleString() : "—",  icon: <Route      size={16} />, color: "#1D4ED8", bg: "#DBEAFE" },
    { label: "Loads",       value: String(loads.length),                                 icon: <Package    size={16} />, color: "#5B21B6", bg: "#EDE9FE" },
    { label: "Avg $/Mile",  value: totalMiles > 0 ? `$${avgRate.toFixed(2)}` : "—",     icon: <TrendingUp size={16} />, color: "#92400E", bg: "#FEF3C7" },
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
              { icon: <Package       size={13} />, label: "Current Load", value: team.currentLoad ?? "", mono: true, highlight: true },
              { icon: <Package       size={13} />, label: "Next Load",    value: team.nextLoad    ?? "", mono: true },
              { icon: <Truck         size={13} />, label: "Truck",        value: team.truck,            mono: true  },
              { icon: <Truck         size={13} />, label: "Trailer",      value: team.trailer,          mono: true  },
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
                {fmtWeekRange(weekStart, weekEnd)}
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
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
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
                      <TH width={110} align="center">Pickup</TH>
                      <TH width={110} align="center">Status</TH>
                    </tr>
                  </thead>
                  <tbody>
                    {loads.map((load, i) => {
                      const sc = STATUS_CONFIG[load.status as Status];
                      return (
                        <tr key={load.id} style={{ backgroundColor: i % 2 === 0 ? "var(--card)" : "var(--background)" }}>
                          <TD mono>{load.loadId || load.id}</TD>
                          <TD>{load.origin}</TD>
                          <TD>{load.destination}</TD>
                          <TD mono center>{load.miles.toLocaleString()}</TD>
                          <TD mono center>${load.payout.toLocaleString()}</TD>
                          <TD center>{load.pickupAppt ? new Date(load.pickupAppt).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</TD>
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
  entityLabel, onManual, onImport, onEld, placeholder,
}: {
  search: string; onSearch: (v: string) => void;
  statusFilter: string; onStatus: (v: string) => void;
  entityLabel: string; onManual: () => void; onImport: () => void; onEld: () => void;
  placeholder: string;
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

      <AddMenu entityLabel={entityLabel} onManual={onManual} onImport={onImport} onEld={onEld} />
    </div>
  );
}

// ─── Solo Tab ─────────────────────────────────────────────────────────────────

function SoloTab({ onSelectDriver, onCountChange }: { onSelectDriver: (d: SoloDriver) => void; onCountChange: (n: number) => void }) {
  const [rows, setRows]               = useState<SoloDriver[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [truckOpts, setTruckOpts]     = useState<SelectOpt[]>(EMPTY_OPTS);
  const [trailerOpts, setTrailerOpts] = useState<SelectOpt[]>(EMPTY_OPTS);
  const [modal, setModal]             = useState<"create" | "edit" | null>(null);
  const [editing, setEditing]         = useState<Partial<SoloDriver>>({});
  const [deleting, setDeleting]       = useState<SoloDriver | null>(null);
  const [saving, setSaving]           = useState(false);
  const [search, setSearch]                   = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatus]             = useState("All");
  const [page, setPage]                       = useState(1);
  const [pageSize, setPageSize]               = useState(20);
  const [importing, setImporting]             = useState(false);
  const [toast, setToast]                     = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [fetchKey, setFetchKey]               = useState(0);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [statusFilter]);

  useEffect(() => {
    Promise.all([api.get<any[]>("/trucks"), api.get<any[]>("/trailers")])
      .then(([trucks, trailers]) => {
        setTruckOpts((trucks ?? []).map((tr) => ({ value: tr.unit ?? tr.id, label: tr.unit ?? tr.id })));
        setTrailerOpts((trailers ?? []).map((tr) => ({ value: tr.unit ?? tr.id, label: tr.unit ?? tr.id })));
      }).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    api.getList<any>("/drivers", {
      q: debouncedSearch || undefined,
      status: statusFilter !== "All" ? statusFilter : undefined,
    })
      .then(({ items }) => {
        const solo = (items ?? []).filter((d) => !d.team).map(toSolo);
        setRows(solo);
        onCountChange(solo.length);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [fetchKey, debouncedSearch, statusFilter]);

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

  const openCreate = () => { setEditing({}); setModal("create"); };
  const openEdit   = (d: SoloDriver) => { setEditing(d); setModal("edit"); };
  const save = async (d: SoloDriver) => {
    setSaving(true);
    try {
      if (modal === "create") {
        await api.post<any>("/drivers", fromSolo(d));
        setToast({ type: "success", msg: `${d.name} added successfully` });
      } else {
        await api.put<any>(`/drivers/${d.id}`, fromSolo(d));
        setToast({ type: "success", msg: `${d.name} updated successfully` });
      }
      setModal(null);
      setFetchKey((k) => k + 1);
    } catch (e) {
      setToast({ type: "error", msg: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  };
  const del = async () => {
    if (!deleting) return;
    try {
      await api.delete(`/drivers/${deleting.id}`);
      setToast({ type: "success", msg: `${deleting.name} removed` });
      setFetchKey((k) => k + 1);
    } catch (e) {
      setToast({ type: "error", msg: e instanceof Error ? e.message : "Delete failed" });
    }
    setDeleting(null);
  };

  const paged = rows.slice((page - 1) * pageSize, page * pageSize);

  const handleSearch = (v: string) => setSearch(v);
  const handleStatus = (v: string) => setStatus(v);

  if (loading) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>
      Loading drivers…
    </div>
  );

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
        entityLabel="Driver" onManual={openCreate} onImport={() => setImporting(true)} onEld={() => {}}
        placeholder="Search drivers, trucks…"
      />

      <div style={{ flex: 1, overflow: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
        <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "collapse" }}>
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
              <TH width={160}>Location</TH>
              <TH width={240}>Comment</TH>
              <TH width={90} align="center">Actions</TH>
            </tr>
          </thead>
          <tbody>
            {paged.map((d, i) => (
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
                <TD mono>{d.phone}</TD>
                <TD><TypeBadge type={d.type} /></TD>
                <TD><StatusDropdown value={d.status} onChange={(s) => patchRow(d.id, { status: s })} /></TD>
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
                  {d.nextLoad ? (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "#F59E0B", backgroundColor: "#FEF3C7", borderRadius: 4, padding: "2px 7px" }}>
                      {d.nextLoad}
                    </span>
                  ) : (
                    <span style={{ color: "var(--muted-foreground)" }}>—</span>
                  )}
                </TD>
                <TD mono>{d.truck}</TD>
                <TD mono>{d.trailer}</TD>
                <TD>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <MapPin size={11} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
                    {d.location}
                  </span>
                </TD>
                <TD>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <MessageSquare size={11} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200, display: "inline-block" }}>{d.comment}</span>
                  </span>
                </TD>
                <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", verticalAlign: "middle", textAlign: "center" }}>
                  <div style={{ display: "inline-flex", gap: 5 }}>
                    <ActionBtn icon={<Pencil size={13} />} color="#1D4ED8" bg="#DBEAFE" onClick={() => openEdit(d)} />
                    <ActionBtn icon={<Trash2 size={13} />} color="#DC2626" bg="#FEE2E2" onClick={() => setDeleting(d)} />
                  </div>
                </td>
              </tr>
            ))}
            {paged.length === 0 && (
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
        page={page} total={rows.length} pageSize={pageSize}
        onPage={setPage} onPageSize={(s) => { setPageSize(s); setPage(1); }}
      />

      {(modal === "create" || modal === "edit") && (
        <SoloModal driver={editing} onClose={() => setModal(null)} onSave={save} truckOpts={truckOpts} trailerOpts={trailerOpts} saving={saving} />
      )}
      {deleting && (
        <DeleteConfirm label={deleting.name} onClose={() => setDeleting(null)} onConfirm={del} />
      )}
      {importing && (
        <ImportModal entityLabel="Driver" onClose={() => setImporting(false)} />
      )}
      {toast && <Toast type={toast.type} msg={toast.msg} onClose={() => setToast(null)} />}
    </>
  );
}

// ─── Team Tab ─────────────────────────────────────────────────────────────────

function TeamTab({ onSelectTeam, onCountChange }: { onSelectTeam: (d: TeamDriver) => void; onCountChange: (n: number) => void }) {
  const [rows, setRows]               = useState<TeamDriver[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [truckOpts, setTruckOpts]     = useState<SelectOpt[]>(EMPTY_OPTS);
  const [trailerOpts, setTrailerOpts] = useState<SelectOpt[]>(EMPTY_OPTS);
  const [modal, setModal]             = useState<"create" | "edit" | null>(null);
  const [editing, setEditing]         = useState<Partial<TeamDriver>>({});
  const [deleting, setDeleting]       = useState<TeamDriver | null>(null);
  const [saving, setSaving]           = useState(false);
  const [search, setSearch]                   = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatus]             = useState("All");
  const [page, setPage]                       = useState(1);
  const [pageSize, setPageSize]               = useState(20);
  const [importing, setImporting]             = useState(false);
  const [toast, setToast]                     = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [fetchKey, setFetchKey]               = useState(0);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [statusFilter]);

  useEffect(() => {
    Promise.all([api.get<any[]>("/trucks"), api.get<any[]>("/trailers")])
      .then(([trucks, trailers]) => {
        setTruckOpts((trucks ?? []).map((tr) => ({ value: tr.unit ?? tr.id, label: tr.unit ?? tr.id })));
        setTrailerOpts((trailers ?? []).map((tr) => ({ value: tr.unit ?? tr.id, label: tr.unit ?? tr.id })));
      }).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    api.getList<any>("/drivers", {
      q: debouncedSearch || undefined,
      status: statusFilter !== "All" ? statusFilter : undefined,
    })
      .then(({ items }) => {
        const teams = (items ?? []).filter((d) => d.team).map(toTeam);
        setRows(teams);
        onCountChange(teams.length);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [fetchKey, debouncedSearch, statusFilter]);

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

  const openCreate = () => { setEditing({}); setModal("create"); };
  const openEdit   = (d: TeamDriver) => { setEditing(d); setModal("edit"); };
  const save = async (d: TeamDriver) => {
    setSaving(true);
    try {
      if (modal === "create") {
        await api.post<any>("/drivers", fromTeam(d));
        setToast({ type: "success", msg: `${d.name1} & ${d.name2} added successfully` });
      } else {
        await api.put<any>(`/drivers/${d.id}`, fromTeam(d));
        setToast({ type: "success", msg: `Team updated successfully` });
      }
      setModal(null);
      setFetchKey((k) => k + 1);
    } catch (e) {
      setToast({ type: "error", msg: e instanceof Error ? e.message : "Save failed" });
    } finally {
      setSaving(false);
    }
  };
  const del = async () => {
    if (!deleting) return;
    try {
      await api.delete(`/drivers/${deleting.id}`);
      setToast({ type: "success", msg: `${deleting.name1} & ${deleting.name2} removed` });
      setFetchKey((k) => k + 1);
    } catch (e) {
      setToast({ type: "error", msg: e instanceof Error ? e.message : "Delete failed" });
    }
    setDeleting(null);
  };

  const paged = rows.slice((page - 1) * pageSize, page * pageSize);

  const handleSearch = (v: string) => setSearch(v);
  const handleStatus = (v: string) => setStatus(v);

  if (loading) return (
    <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>
      Loading teams…
    </div>
  );

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
        entityLabel="Team" onManual={openCreate} onImport={() => setImporting(true)} onEld={() => {}}
        placeholder="Search teams, trucks…"
      />

      <div style={{ flex: 1, overflow: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
        <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "collapse" }}>
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
              <TH width={240}>Comment</TH>
              <TH width={90} align="center">Actions</TH>
            </tr>
          </thead>
          <tbody>
            {paged.map((d, i) => (
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
                <TD mono>{d.phone1}</TD>
                <TD>
                  <button
                    onClick={() => onSelectTeam(d)}
                    style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, color: "var(--primary)", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left", outline: "none" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.textDecoration = "underline"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.textDecoration = "none"; }}
                  >{d.name2}</button>
                </TD>
                <TD mono>{d.phone2}</TD>
                <TD><TypeBadge type={d.type} /></TD>
                <TD><StatusDropdown value={d.status} onChange={(s) => patchRow(d.id, { status: s })} /></TD>
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
                  {d.nextLoad ? (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "#F59E0B", backgroundColor: "#FEF3C7", borderRadius: 4, padding: "2px 7px" }}>
                      {d.nextLoad}
                    </span>
                  ) : (
                    <span style={{ color: "var(--muted-foreground)" }}>—</span>
                  )}
                </TD>
                <TD mono>{d.truck}</TD>
                <TD mono>{d.trailer}</TD>
                <TD>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <MessageSquare size={11} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 200, display: "inline-block" }}>{d.comment}</span>
                  </span>
                </TD>
                <td style={{ padding: "8px 10px", borderBottom: "1px solid var(--border)", verticalAlign: "middle", textAlign: "center" }}>
                  <div style={{ display: "inline-flex", gap: 5 }}>
                    <ActionBtn icon={<Pencil size={13} />} color="#1D4ED8" bg="#DBEAFE" onClick={() => openEdit(d)} />
                    <ActionBtn icon={<Trash2 size={13} />} color="#DC2626" bg="#FEE2E2" onClick={() => setDeleting(d)} />
                  </div>
                </td>
              </tr>
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={13} style={{ padding: "40px 20px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>
                  No teams match your filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Pagination
        page={page} total={rows.length} pageSize={pageSize}
        onPage={setPage} onPageSize={(s) => { setPageSize(s); setPage(1); }}
      />

      {(modal === "create" || modal === "edit") && (
        <TeamModal driver={editing} onClose={() => setModal(null)} onSave={save} truckOpts={truckOpts} trailerOpts={trailerOpts} saving={saving} />
      )}
      {deleting && (
        <DeleteConfirm label={`${deleting.name1} & ${deleting.name2}`} onClose={() => setDeleting(null)} onConfirm={del} />
      )}
      {importing && (
        <ImportModal entityLabel="Team" onClose={() => setImporting(false)} />
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
    { id: "solo", label: "Solo Drivers", count: soloCount, icon: <User size={15} />,  color: "#1D4ED8", bg: "#DBEAFE" },
    { id: "team", label: "Team Drivers", count: teamCount, icon: <Users size={15} />, color: "#5B21B6", bg: "#EDE9FE" },
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
