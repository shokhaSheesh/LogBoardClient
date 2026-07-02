import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X, Search, ChevronDown, DollarSign,
  ChevronLeft, ChevronRight, Pencil, Check,
  CalendarDays, FileText,
} from "lucide-react";
import { api, getCompanyId } from "../lib/api";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BackendPayout {
  id: string;
  load_ref: string;
  driver_name: string;
  broker: string;
  origin: string;
  destination: string;
  dispatcher: string;
  rate: number;
  added: number;
  deducted: number;
  net: number;
  notes: string;
  completed_at: string;
}

interface Payout {
  id: string;
  loadRef: string;
  driverName: string;
  broker: string;
  origin: string;
  destination: string;
  dispatcher: string;
  rate: number;
  added: number;
  deducted: number;
  net: number;
  notes: string;
  completedAt: string;
}

interface Totals { rate: number; added: number; deducted: number; net: number; }
interface DispatcherOpt { id: string; name: string; }

function toPayout(b: BackendPayout): Payout {
  return {
    id:          b.id,
    loadRef:     b.load_ref   ?? "",
    driverName:  b.driver_name ?? "",
    broker:      b.broker      ?? "",
    origin:      b.origin      ?? "",
    destination: b.destination ?? "",
    dispatcher:  b.dispatcher  ?? "",
    rate:        b.rate        ?? 0,
    added:       b.added       ?? 0,
    deducted:    b.deducted    ?? 0,
    net:         b.net         ?? 0,
    notes:       b.notes       ?? "",
    completedAt: b.completed_at ?? "",
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMoney(n: number) { return `$${Math.abs(n).toLocaleString()}`; }

function fmtDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

type DateMode = "day" | "week" | "month";

function startOfWeek(d: Date): Date {
  const r = new Date(d);
  const dow = r.getDay();
  r.setDate(r.getDate() + (dow === 0 ? -6 : 1 - dow));
  r.setHours(0, 0, 0, 0);
  return r;
}

function toApiRange(mode: DateMode, anchor: Date): { from: string; to: string } {
  const fmt = (d: Date) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  };
  if (mode === "day") return { from: fmt(anchor), to: fmt(anchor) };
  if (mode === "week") {
    const mon = startOfWeek(anchor);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return { from: fmt(mon), to: fmt(sun) };
  }
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const last  = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  return { from: fmt(first), to: fmt(last) };
}

function fmtDateLabel(mode: DateMode, anchor: Date): string {
  const M = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  if (mode === "day") return `${M[anchor.getMonth()]} ${anchor.getDate()}, ${String(anchor.getFullYear()).slice(2)}'`;
  if (mode === "week") {
    const mon = startOfWeek(anchor);
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const sameMo = mon.getMonth() === sun.getMonth();
    return sameMo
      ? `${M[mon.getMonth()]} ${mon.getDate()}–${sun.getDate()}, ${String(anchor.getFullYear()).slice(2)}'`
      : `${M[mon.getMonth()]} ${mon.getDate()} – ${M[sun.getMonth()]} ${sun.getDate()}, ${String(anchor.getFullYear()).slice(2)}'`;
  }
  return `${M[anchor.getMonth()]} ${anchor.getFullYear()}`;
}

function shiftAnchor(mode: DateMode, anchor: Date, dir: -1 | 1): Date {
  const d = new Date(anchor);
  if (mode === "day")   d.setDate(d.getDate() + dir);
  if (mode === "week")  d.setDate(d.getDate() + dir * 7);
  if (mode === "month") d.setMonth(d.getMonth() + dir);
  return d;
}

// ─── Edit modal (add/deduct/notes only) ───────────────────────────────────────

function AdjustModal({ payout, onSave, onClose, saving }: {
  payout: Payout; onSave: (added: number, deducted: number, notes: string) => void;
  onClose: () => void; saving: boolean;
}) {
  const [added,    setAdded]    = useState(String(payout.added));
  const [deducted, setDeducted] = useState(String(payout.deducted));
  const [notes,    setNotes]    = useState(payout.notes);

  const previewNet = payout.rate + (Number(added) || 0) - (Number(deducted) || 0);

  const inputStyle = {
    padding: "7px 10px", borderRadius: 7, border: "1px solid var(--border)",
    backgroundColor: "var(--input-background)", fontFamily: "var(--font-mono)",
    fontSize: 13, color: "var(--foreground)", outline: "none",
    width: "100%", boxSizing: "border-box" as const,
  };
  const labelStyle = { fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600 as const, color: "var(--muted-foreground)", textTransform: "uppercase" as const, letterSpacing: "0.06em" };

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.35)", zIndex: 400 }} />
      <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 401, width: 480, backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, boxShadow: "0 24px 64px rgba(0,0,0,0.22)", display: "flex", flexDirection: "column", maxHeight: "90vh", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: "#D1FAE5", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <DollarSign size={17} style={{ color: "#10B981" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 700, color: "var(--foreground)" }}>Adjust Payout</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)" }}>{payout.loadRef} · {payout.driverName}</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: 7, backgroundColor: "transparent", cursor: "pointer", color: "var(--muted-foreground)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--muted)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}>
            <X size={16} />
          </button>
        </div>

        {/* Context row */}
        <div style={{ padding: "12px 20px", backgroundColor: "var(--muted)", borderBottom: "1px solid var(--border)", display: "flex", gap: 20 }}>
          {[
            { label: "Broker", value: payout.broker },
            { label: "Route",  value: payout.origin && payout.destination ? `${payout.origin} → ${payout.destination}` : "—" },
            { label: "Rate",   value: fmtMoney(payout.rate) },
          ].map(({ label, value }) => (
            <div key={label}>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--foreground)", marginTop: 2 }}>{value}</div>
            </div>
          ))}
        </div>

        {/* Body */}
        <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <label style={labelStyle}>Added ($)</label>
              <input type="number" min={0} value={added} onChange={(e) => setAdded(e.target.value)} placeholder="0" style={inputStyle} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <label style={labelStyle}>Deducted ($)</label>
              <input type="number" min={0} value={deducted} onChange={(e) => setDeducted(e.target.value)} placeholder="0" style={inputStyle} />
            </div>
          </div>

          {/* Net preview */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, padding: "8px 12px", borderRadius: 8, backgroundColor: "var(--muted)", border: "1px solid var(--border)" }}>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)" }}>Net Payout:</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 700, color: previewNet >= 0 ? "#10B981" : "#EF4444" }}>{fmtMoney(previewNet)}</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label style={{ ...labelStyle, fontFamily: "var(--font-sans)" }}>Notes</label>
            <input
              value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes…"
              style={{ ...inputStyle, fontFamily: "var(--font-sans)" }}
            />
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "14px 20px", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
          <button onClick={onClose}
            style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid var(--border)", backgroundColor: "var(--card)", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--foreground)", cursor: "pointer" }}>
            Cancel
          </button>
          <button onClick={() => onSave(Number(added) || 0, Number(deducted) || 0, notes.trim())}
            disabled={saving}
            style={{ padding: "8px 20px", borderRadius: 8, border: "none", backgroundColor: saving ? "var(--muted)" : "var(--primary)", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: saving ? "var(--muted-foreground)" : "#fff", cursor: saving ? "not-allowed" : "pointer" }}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}

// ─── Table header cell ────────────────────────────────────────────────────────

function TH({ children, width, align = "left" }: { children: React.ReactNode; width?: number; align?: "left" | "right" | "center" }) {
  return (
    <th style={{ width, minWidth: width, padding: "8px 14px", textAlign: align, fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap", borderBottom: "1px solid var(--border)", backgroundColor: "var(--muted)", position: "sticky", top: 0, zIndex: 2 }}>
      {children}
    </th>
  );
}

// ─── Compact select (rows per page) ──────────────────────────────────────────

function CompactSelect({ value, options, onChange }: { value: number; options: number[]; onChange: (v: number) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen((v) => !v)}
        style={{ display: "flex", alignItems: "center", gap: 5, height: 30, padding: "0 8px 0 10px", fontFamily: "var(--font-sans)", fontSize: 12, backgroundColor: "var(--input-background)", border: `1px solid ${open ? "var(--primary)" : "var(--border)"}`, borderRadius: 7, color: "var(--foreground)", cursor: "pointer", outline: "none" }}>
        {value}
        <ChevronDown size={12} style={{ color: "var(--muted-foreground)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>
      {open && (
        <div style={{ position: "absolute", bottom: "calc(100% + 4px)", left: 0, backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.10)", zIndex: 200, overflow: "hidden", minWidth: 72 }}>
          {options.map((o) => (
            <button key={o} type="button" onClick={() => { onChange(o); setOpen(false); }}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, width: "100%", padding: "7px 12px", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: o === value ? 600 : 400, color: o === value ? "var(--primary)" : "var(--foreground)", backgroundColor: o === value ? "var(--accent)" : "transparent", border: "none", cursor: "pointer", outline: "none" }}
              onMouseEnter={(e) => { if (o !== value) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--muted)"; }}
              onMouseLeave={(e) => { if (o !== value) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}>
              {o}
              {o === value && <Check size={12} style={{ color: "var(--primary)" }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function Pagination({ page, total, pageSize, onPage, onPageSize }: {
  page: number; total: number; pageSize: number;
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

  const PBtn = ({ children, active = false, disabled = false, onClick }: { children: React.ReactNode; active?: boolean; disabled?: boolean; onClick: () => void }) => (
    <button onClick={onClick} disabled={disabled} style={{ minWidth: 30, height: 30, borderRadius: 6, padding: "0 6px", border: active ? "1.5px solid var(--primary)" : "1px solid var(--border)", backgroundColor: active ? "var(--primary)" : "transparent", color: active ? "#fff" : disabled ? "var(--muted-foreground)" : "var(--foreground)", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: active ? 600 : 400, cursor: disabled ? "default" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", opacity: disabled ? 0.38 : 1, outline: "none" }}>
      {children}
    </button>
  );

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderTop: "1px solid var(--border)", backgroundColor: "var(--card)", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>
          {total === 0 ? "No results" : `Showing ${from}–${to} of ${total}`}
        </span>
        <span style={{ color: "var(--border)", userSelect: "none" }}>·</span>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>Rows per page</span>
        <CompactSelect value={pageSize} options={PAGE_SIZES as unknown as number[]} onChange={(v) => { onPageSize(v); onPage(1); }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <PBtn disabled={page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={14} /></PBtn>
        {pages.map((p, i) =>
          p === "…"
            ? <span key={`e${i}`} style={{ padding: "0 4px", fontSize: 13, color: "var(--muted-foreground)", lineHeight: "30px" }}>…</span>
            : <PBtn key={p} active={p === page} onClick={() => onPage(p as number)}>{p}</PBtn>
        )}
        <PBtn disabled={page >= totalPages} onClick={() => onPage(page + 1)}><ChevronRight size={14} /></PBtn>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const PAGE_SIZES = [20, 40, 60, 100] as const;
type PageSize = (typeof PAGE_SIZES)[number];

export function PayoutsPage() {
  const today = new Date(); today.setHours(0, 0, 0, 0);

  const [payouts, setPayouts]           = useState<Payout[]>([]);
  const [total, setTotal]               = useState(0);
  const [totals, setTotals]             = useState<Totals>({ rate: 0, added: 0, deducted: 0, net: 0 });
  const [loading, setLoading]           = useState(true);
  const [fetchKey, setFetchKey]         = useState(0);

  const [search, setSearch]             = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dispatchers, setDispatchers]   = useState<DispatcherOpt[]>([]);
  const [dispFilter, setDispFilter]     = useState<DispatcherOpt | null>(null);
  const [filterOpen, setFilterOpen]     = useState(false);
  const [dateMode, setDateMode]         = useState<DateMode | null>(null);
  const [anchor, setAnchor]             = useState<Date>(today);

  const [editing, setEditing]           = useState<Payout | null>(null);
  const [saving, setSaving]             = useState(false);

  const [page, setPage]                 = useState(1);
  const [pageSize, setPageSize]         = useState<PageSize>(20);
  const filterRef = useRef<HTMLDivElement>(null);

  // Fetch dispatchers (board users) once on mount
  useEffect(() => {
    const companyId = getCompanyId();
    api.get<any[]>(`/owner/companies/${companyId}/users`)
      .then((users) => {
        setDispatchers((users ?? []).map((u: any) => ({
          id: u.id,
          name: u.full_name ?? u.login ?? u.id,
        })));
      })
      .catch(() => {});
  }, []);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 250);
    return () => clearTimeout(t);
  }, [search]);

  // Dismiss filter dropdown on outside click
  useEffect(() => {
    if (!filterOpen) return;
    const h = (e: MouseEvent) => { if (!filterRef.current?.contains(e.target as Node)) setFilterOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [filterOpen]);

  // Fetch payouts
  useEffect(() => {
    setLoading(true);
    const dateRange = dateMode ? toApiRange(dateMode, anchor) : { from: undefined, to: undefined };
    api.getPayouts<BackendPayout>({
      q:             debouncedSearch || undefined,
      dispatcher_id: dispFilter?.id || undefined,
      from:          dateRange.from,
      to:            dateRange.to,
      page,
      page_size:     pageSize,
    }).then(({ items, total: t, totals: tots }) => {
      setPayouts((items ?? []).map(toPayout));
      setTotal(t);
      setTotals(tots);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [fetchKey, debouncedSearch, dispFilter, dateMode, anchor, page, pageSize]);

  const handleSave = async (added: number, deducted: number, notes: string) => {
    if (!editing) return;
    setSaving(true);
    try {
      const updated = await api.patch<BackendPayout>(`/payouts/${editing.id}`, { added, deducted, notes });
      setPayouts((prev) => prev.map((p) => p.id === editing.id ? toPayout(updated as BackendPayout) : p));
      setFetchKey((k) => k + 1); // refetch totals
      setEditing(null);
    } catch {
      // keep modal open on error
    } finally {
      setSaving(false);
    }
  };

  const selectMode = (m: DateMode) => {
    if (dateMode === m) { setDateMode(null); } else { setDateMode(m); setAnchor(today); }
    setPage(1);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "var(--background)", overflow: "hidden" }}>

      {editing && (
        <AdjustModal
          payout={editing}
          onSave={handleSave}
          onClose={() => setEditing(null)}
          saving={saving}
        />
      )}

      <div style={{ flex: 1, overflow: "hidden", padding: "20px 24px", display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }}>

      {/* ── Toolbar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", borderBottom: "1px solid var(--border)", backgroundColor: "var(--card)", flexShrink: 0, flexWrap: "wrap" }}>
        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 300 }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground)", pointerEvents: "none" }} />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search driver, load, broker…"
            style={{ width: "100%", height: 34, paddingLeft: 30, paddingRight: 10, borderRadius: 7, border: "1px solid var(--border)", backgroundColor: "var(--input-background)", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--foreground)", outline: "none", boxSizing: "border-box" }} />
        </div>

        {/* Dispatcher filter */}
        <div ref={filterRef} style={{ position: "relative" }}>
          <button onClick={() => setFilterOpen((v) => !v)}
            style={{ display: "flex", alignItems: "center", gap: 6, height: 34, padding: "0 12px", borderRadius: 7, border: "1px solid var(--border)", backgroundColor: dispFilter ? "var(--primary)" : "var(--card)", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: dispFilter ? "#fff" : "var(--foreground)", cursor: "pointer", whiteSpace: "nowrap", outline: "none" }}>
            {dispFilter ? dispFilter.name.split(" ")[0] : "All Dispatchers"}
            <ChevronDown size={13} style={{ color: dispFilter ? "#ffffffaa" : "var(--muted-foreground)" }} />
          </button>
          {filterOpen && (
            <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 9, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 100, minWidth: 180, overflow: "hidden" }}>
              {[null, ...dispatchers].map((d) => {
                const label = d ? d.name : "All Dispatchers";
                const active = d ? dispFilter?.id === d.id : dispFilter === null;
                return (
                  <div key={d?.id ?? "all"} onMouseDown={() => { setDispFilter(d); setFilterOpen(false); setPage(1); }}
                    style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 14px", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--foreground)", cursor: "pointer", backgroundColor: active ? "var(--muted)" : "transparent" }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = "var(--muted)"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.backgroundColor = active ? "var(--muted)" : "transparent"; }}>
                    {active && <Check size={12} style={{ color: "var(--primary)", flexShrink: 0 }} />}
                    <span style={{ marginLeft: active ? 0 : 19 }}>{label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Date range picker */}
        <div style={{ display: "flex", alignItems: "center", gap: 0, borderRadius: 8, border: "1px solid var(--border)", overflow: "hidden", flexShrink: 0 }}>
          {(["day", "week", "month"] as DateMode[]).map((m) => (
            <button key={m} onClick={() => selectMode(m)}
              style={{ padding: "8px 14px", fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: dateMode === m ? 700 : 500, color: dateMode === m ? "#fff" : "var(--muted-foreground)", backgroundColor: dateMode === m ? "var(--primary)" : "transparent", border: "none", borderRight: m !== "month" ? "1px solid var(--border)" : "none", cursor: "pointer", textTransform: "capitalize", outline: "none", transition: "background-color 0.12s" }}>
              {m.charAt(0).toUpperCase() + m.slice(1)}
            </button>
          ))}
        </div>

        {/* Date nav */}
        {dateMode && (
          <div style={{ display: "flex", alignItems: "center", gap: 0, borderRadius: 8, border: "1px solid var(--border)", overflow: "hidden", flexShrink: 0 }}>
            <button onClick={() => { setAnchor((a) => shiftAnchor(dateMode, a, -1)); setPage(1); }}
              style={{ width: 32, height: 34, display: "flex", alignItems: "center", justifyContent: "center", border: "none", borderRight: "1px solid var(--border)", backgroundColor: "transparent", cursor: "pointer", color: "var(--foreground)", outline: "none" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--muted)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}>
              <ChevronLeft size={14} />
            </button>
            <div style={{ padding: "0 14px", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--foreground)", whiteSpace: "nowrap", lineHeight: "34px" }}>
              {fmtDateLabel(dateMode, anchor)}
            </div>
            <button onClick={() => { setAnchor((a) => shiftAnchor(dateMode, a, 1)); setPage(1); }}
              style={{ width: 32, height: 34, display: "flex", alignItems: "center", justifyContent: "center", border: "none", borderLeft: "1px solid var(--border)", backgroundColor: "transparent", cursor: "pointer", color: "var(--foreground)", outline: "none" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--muted)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}>
              <ChevronRight size={14} />
            </button>
          </div>
        )}

        <div style={{ flex: 1 }} />
      </div>

      {/* ── Table ── */}
      <div style={{ flex: 1, overflow: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: 150 }} />{/* Dispatcher */}
            <col style={{ width: 170 }} />{/* Driver */}
            <col style={{ width: 110 }} />{/* Load Ref */}
            <col style={{ width: 150 }} />{/* Broker */}
            <col style={{ width: 220 }} />{/* Route */}
            <col style={{ width: 100 }} />{/* Rate */}
            <col style={{ width: 90 }} /> {/* Added */}
            <col style={{ width: 100 }} />{/* Deducted */}
            <col style={{ width: 110 }} />{/* Net */}
            <col style={{ width: 200 }} />{/* Notes */}
            <col style={{ width: 110 }} />{/* Date */}
            <col style={{ width: 60 }} /> {/* Actions */}
          </colgroup>
          <thead>
            <tr>
              <TH>Dispatcher</TH>
              <TH>Driver</TH>
              <TH>Load Ref</TH>
              <TH>Broker</TH>
              <TH>Route</TH>
              <TH align="right">Rate</TH>
              <TH align="right">Added</TH>
              <TH align="right">Deducted</TH>
              <TH align="right">Net</TH>
              <TH>Notes</TH>
              <TH>Completed</TH>
              <TH align="center">Edit</TH>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={12} style={{ padding: "56px 20px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--muted-foreground)" }}>
                  Loading…
                </td>
              </tr>
            )}
            {!loading && payouts.length === 0 && (
              <tr>
                <td colSpan={12} style={{ padding: "56px 20px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--muted-foreground)" }}>
                  No payouts found.
                </td>
              </tr>
            )}
            {!loading && payouts.map((p, idx) => {
              const TD = ({ children, align, noOverflow }: { children: React.ReactNode; align?: string; noOverflow?: boolean }) => (
                <td style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", verticalAlign: "middle", textAlign: (align as "left" | "right" | "center") ?? "left", ...(noOverflow ? {} : { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }) }}>
                  {children}
                </td>
              );
              return (
                <tr key={p.id}
                  style={{ backgroundColor: idx % 2 === 0 ? "var(--card)" : "var(--background)" }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "rgba(59,130,246,0.03)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = idx % 2 === 0 ? "var(--card)" : "var(--background)"; }}>

                  <TD><span style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 500, color: "var(--foreground)" }}>{p.dispatcher || "—"}</span></TD>
                  <TD><span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--foreground)" }}>{p.driverName}</span></TD>
                  <TD noOverflow><span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--primary)", backgroundColor: "var(--secondary)", borderRadius: 4, padding: "2px 8px" }}>{p.loadRef || "—"}</span></TD>
                  <TD><span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--foreground)" }}>{p.broker || "—"}</span></TD>
                  <TD>
                    {p.origin && p.destination
                      ? <span style={{ fontFamily: "var(--font-sans)", fontSize: 12 }}>
                          <span style={{ color: "var(--foreground)" }}>{p.origin}</span>
                          <span style={{ margin: "0 5px", color: "var(--muted-foreground)", opacity: 0.5 }}>→</span>
                          <span style={{ color: "var(--foreground)" }}>{p.destination}</span>
                        </span>
                      : <span style={{ color: "var(--muted-foreground)" }}>—</span>}
                  </TD>
                  <TD align="right"><span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--foreground)" }}>{fmtMoney(p.rate)}</span></TD>
                  <TD align="right">
                    {p.added > 0 ? <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "#3B82F6" }}>+{fmtMoney(p.added)}</span> : <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted-foreground)" }}>—</span>}
                  </TD>
                  <TD align="right">
                    {p.deducted > 0 ? <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "#EF4444" }}>-{fmtMoney(p.deducted)}</span> : <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted-foreground)" }}>—</span>}
                  </TD>
                  <TD align="right"><span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: p.net >= p.rate ? "#10B981" : "#F59E0B" }}>{fmtMoney(p.net)}</span></TD>
                  <TD>
                    {p.notes
                      ? <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <FileText size={11} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
                          <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)" }}>{p.notes}</span>
                        </span>
                      : <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted-foreground)" }}>—</span>}
                  </TD>
                  <TD noOverflow>
                    <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <CalendarDays size={11} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted-foreground)" }}>{fmtDate(p.completedAt)}</span>
                    </span>
                  </TD>
                  <TD align="center" noOverflow>
                    <button onClick={() => setEditing(p)}
                      style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "transparent", cursor: "pointer", color: "var(--muted-foreground)", outline: "none" }}
                      onMouseEnter={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "var(--muted)"; b.style.color = "var(--foreground)"; }}
                      onMouseLeave={(e) => { const b = e.currentTarget as HTMLButtonElement; b.style.backgroundColor = "transparent"; b.style.color = "var(--muted-foreground)"; }}>
                      <Pencil size={12} />
                    </button>
                  </TD>
                </tr>
              );
            })}
          </tbody>

          {/* Totals footer — from server, covers all pages */}
          {!loading && total > 0 && (
            <tfoot>
              <tr style={{ backgroundColor: "var(--card)" }}>
                <td colSpan={5} style={{ padding: "10px 14px", borderTop: "2px solid var(--border)", fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, color: "var(--muted-foreground)" }}>
                  Totals ({total} records)
                </td>
                <td style={{ padding: "10px 14px", borderTop: "2px solid var(--border)", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--foreground)" }}>{fmtMoney(totals.rate)}</td>
                <td style={{ padding: "10px 14px", borderTop: "2px solid var(--border)", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "#3B82F6" }}>{totals.added > 0 ? `+${fmtMoney(totals.added)}` : "—"}</td>
                <td style={{ padding: "10px 14px", borderTop: "2px solid var(--border)", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "#EF4444" }}>{totals.deducted > 0 ? `-${fmtMoney(totals.deducted)}` : "—"}</td>
                <td style={{ padding: "10px 14px", borderTop: "2px solid var(--border)", textAlign: "right", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "#10B981" }}>{fmtMoney(totals.net)}</td>
                <td colSpan={3} style={{ borderTop: "2px solid var(--border)" }} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <Pagination page={page} total={total} pageSize={pageSize} onPage={setPage} onPageSize={(s) => setPageSize(s as PageSize)} />

      </div>
      </div>
    </div>
  );
}
