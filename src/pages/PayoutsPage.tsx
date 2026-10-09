import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X, Search, ChevronDown, DollarSign,
  ChevronLeft, ChevronRight, Pencil, Check,
  CalendarDays, FileText, AlertCircle, Info, CirclePlus, CircleMinus, Wallet, HandCoins,
} from "lucide-react";
import { api } from "../lib/api";
import { PageLoader } from "../components/PageLoader";
import { FormError, formErrorInModal, friendlyError, notify } from "../components/feedback";
import { useAuth } from "../lib/auth";
import { hasPerm } from "../lib/permissions";
import { Dash } from "../components/Dash";
import { Kpi } from "../components/Kpi";
import { PeriodFilter, ALL_TIME, type Period } from "../components/PeriodFilter";
import { useNavigate } from "react-router";
import { fmtDate, fmtDateRange } from "../lib/dates";

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

// Sign-aware: a negative net must read "-$50", not "$50".
function fmtMoney(n: number) { return `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString()}`; }

// ─── Edit modal (add/deduct/notes only) ───────────────────────────────────────

function AdjustModal({ payout, onSave, onClose, saving, error }: {
  payout: Payout; onSave: (added: number, deducted: number, notes: string) => void;
  onClose: () => void; saving: boolean; error?: string | null;
}) {
  const [added,    setAdded]    = useState(String(payout.added));
  const [deducted, setDeducted] = useState(String(payout.deducted));
  const [notes,    setNotes]    = useState(payout.notes);

  const previewNet = payout.rate + (Number(added) || 0) - (Number(deducted) || 0);
  const negative = Number(added) < 0 || Number(deducted) < 0;

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape" && !saving) onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [saving, onClose]);

  const inputStyle = {
    padding: "7px 10px", borderRadius: 8, height: 36, border: "1px solid var(--border)",
    backgroundColor: "var(--card)", fontFamily: "var(--font-mono)",
    fontSize: 13, color: "var(--foreground)", outline: "none",
    width: "100%", boxSizing: "border-box" as const,
  };
  const labelStyle = { fontFamily: "var(--font-sans)", fontSize: 12.5, fontWeight: 600 as const, color: "var(--foreground)" };

  return createPortal(
    <>
      <div onClick={() => { if (!saving) onClose(); }} style={{ position: "fixed", inset: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 400 }} />
      <div role="dialog" aria-modal="true" aria-label="Adjust payout" style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", zIndex: 401, width: 480, backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 14, boxShadow: "0 24px 64px rgba(0,0,0,0.22)", display: "flex", flexDirection: "column", maxHeight: "90vh", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "16px 20px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: "var(--primary-soft)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <DollarSign size={17} style={{ color: "var(--primary)" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--font-sans)", fontSize: 15, fontWeight: 700, color: "var(--foreground)", letterSpacing: "-0.01em" }}>Adjust payout</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)" }}>{payout.loadRef} · {payout.driverName}</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", border: "none", borderRadius: 7, backgroundColor: "transparent", cursor: "pointer", color: "var(--muted-foreground)" }}
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
              <label htmlFor="payout-added" style={labelStyle}>Added</label>
              <input id="payout-added" autoFocus type="number" min={0} value={added} onChange={(e) => setAdded(e.target.value)} placeholder="0" style={inputStyle} />
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              <label htmlFor="payout-deducted" style={labelStyle}>Deducted</label>
              <input id="payout-deducted" type="number" min={0} value={deducted} onChange={(e) => setDeducted(e.target.value)} placeholder="0" style={inputStyle} />
            </div>
          </div>

          {negative && (
            <span style={{ marginTop: -6, fontFamily: "var(--font-sans)", fontSize: 11, color: "#EF4444" }}>
              Enter amounts as positive numbers — use Deducted to take money off.
            </span>
          )}

          {/* Net preview */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, padding: "8px 12px", borderRadius: 8, backgroundColor: "var(--muted)", border: "1px solid var(--border)" }}>
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, color: "var(--muted-foreground)" }}>Net payout</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 15, fontWeight: 700, color: previewNet >= 0 ? "var(--foreground)" : "#EF4444" }}>{fmtMoney(previewNet)}</span>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <label htmlFor="payout-notes" style={{ ...labelStyle, fontFamily: "var(--font-sans)" }}>Notes</label>
            <input
              id="payout-notes"
              value={notes} onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes…"
              style={{ ...inputStyle, fontFamily: "var(--font-sans)" }}
            />
          </div>

          {/* An adjustment belongs to the LOAD, not to this row. Un-completing the load
              deletes the payout, which looks like the money is gone — say plainly that
              it isn't, so nobody re-keys figures they never actually lost. */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "9px 12px", borderRadius: 8, backgroundColor: "var(--muted)", border: "1px solid var(--border)" }}>
            <Info size={13} style={{ color: "var(--muted-foreground)", flexShrink: 0, marginTop: 1 }} />
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 11.5, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
              These stay with the load. If it's un-completed the payout disappears from this
              list, but the figures are kept — and come back if the load is completed again.
            </span>
          </div>
        </div>

        {/* Footer */}
        <FormError message={error} style={formErrorInModal} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8, padding: "14px 20px", borderTop: "1px solid var(--border)", flexShrink: 0 }}>
          <button onClick={onClose} disabled={saving}
            style={{ padding: "8px 18px", borderRadius: 8, border: "1px solid var(--border)", backgroundColor: "var(--card)", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--foreground)", cursor: saving ? "default" : "pointer", opacity: saving ? 0.5 : 1 }}>
            Cancel
          </button>
          <button onClick={() => onSave(Number(added) || 0, Number(deducted) || 0, notes.trim())}
            disabled={saving || negative}
            style={{ padding: "8px 20px", borderRadius: 8, border: "none", backgroundColor: saving || negative ? "var(--muted)" : "var(--primary)", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: saving || negative ? "var(--muted-foreground)" : "#fff", cursor: saving || negative ? "not-allowed" : "pointer" }}>
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}

// ─── Table header cell ────────────────────────────────────────────────────────

function TH({ children, width, align = "left", pinned = false }: { children: React.ReactNode; width?: number; align?: "left" | "right" | "center"; pinned?: boolean }) {
  return (
    <th style={{ width, minWidth: width, padding: "8px 14px", textAlign: align, fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", textTransform: "uppercase", letterSpacing: "0.07em", whiteSpace: "nowrap", borderBottom: "1px solid var(--border)", backgroundColor: "var(--card)", position: "sticky", top: 0, zIndex: 2, ...(pinned ? { right: 0, zIndex: 6, boxShadow: "inset 1px 0 0 var(--border)" } : {}) }}>
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

const PBtn = ({ children, active = false, disabled = false, onClick, label }: { children: React.ReactNode; active?: boolean; disabled?: boolean; onClick: () => void; label?: string }) => (
  <button onClick={onClick} disabled={disabled} aria-label={label} aria-current={active ? "page" : undefined} style={{ minWidth: 30, height: 30, borderRadius: 6, padding: "0 6px", border: active ? "1.5px solid var(--primary)" : "1px solid var(--border)", backgroundColor: active ? "var(--primary)" : "transparent", color: active ? "#fff" : disabled ? "var(--muted-foreground)" : "var(--foreground)", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: active ? 600 : 400, cursor: disabled ? "default" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", opacity: disabled ? 0.38 : 1, outline: "none" }}>
    {children}
  </button>
);

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

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderTop: "1px solid var(--border)", backgroundColor: "var(--card)", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7, fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>
          {loading && <span style={{ width: 12, height: 12, borderRadius: "50%", border: "2px solid var(--border)", borderTopColor: "var(--primary)", animation: "spin 0.7s linear infinite", display: "inline-block" }} />}
          {loading ? "Loading…" : total === 0 ? "No results" : `Showing ${from}–${to} of ${total}`}
        </span>
        <span style={{ color: "var(--border)", userSelect: "none" }}>·</span>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>Rows per page</span>
        <CompactSelect value={pageSize} options={PAGE_SIZES as unknown as number[]} onChange={(v) => { onPageSize(v); onPage(1); }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <PBtn label="Previous page" disabled={loading || page <= 1} onClick={() => onPage(page - 1)}><ChevronLeft size={14} /></PBtn>
        {pages.map((p, i) =>
          p === "…"
            ? <span key={`e${i}`} style={{ padding: "0 4px", fontSize: 13, color: "var(--muted-foreground)", lineHeight: "30px" }}>…</span>
            : <PBtn key={p} active={p === page} disabled={loading && p !== page} onClick={() => onPage(p as number)}>{p}</PBtn>
        )}
        <PBtn label="Next page" disabled={loading || page >= totalPages} onClick={() => onPage(page + 1)}><ChevronRight size={14} /></PBtn>
      </div>
    </div>
  );
}

// ─── Table body cell ──────────────────────────────────────────────────────────

const TD = ({ children, align, noOverflow, pinned }: { children: React.ReactNode; align?: string; noOverflow?: boolean; pinned?: boolean }) => (
  <td style={{ padding: "8px 14px", borderBottom: "1px solid var(--border)", verticalAlign: "middle", textAlign: (align as "left" | "right" | "center") ?? "left", ...(noOverflow ? {} : { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }), ...(pinned ? { position: "sticky", right: 0, backgroundColor: "var(--card)", boxShadow: "inset 1px 0 0 var(--border)" } : {}) }}>
    {children}
  </td>
);

// ─── Page ─────────────────────────────────────────────────────────────────────

const PAGE_SIZES = [20, 40, 60, 100] as const;
type PageSize = (typeof PAGE_SIZES)[number];

export function PayoutsPage() {
  const { user } = useAuth();
  const canAdjust = hasPerm(user, "payouts", "update");
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const weekStart = user?.company?.week_start_day ?? 1;

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
  // Which stretch of completion dates to list. All time = no date filter.
  const [period, setPeriod]             = useState<Period>(ALL_TIME);
  const navigate = useNavigate();

  const [loadErr, setLoadErr]           = useState<string | null>(null);
  const [editing, setEditing]           = useState<Payout | null>(null);
  const [saving, setSaving]             = useState(false);
  const [saveErr, setSaveErr]           = useState<string | null>(null);

  const [page, setPage]                 = useState(1);
  const [pageSize, setPageSize]         = useState<PageSize>(20);
  const filterRef = useRef<HTMLDivElement>(null);

  // The dispatcher filter offers two groups, merged: everyone who can dispatch today (the
  // owner + the built-in Dispatcher role), and everyone named on a past payout — so someone
  // who has since changed role can still be filtered for. Either request may be refused
  // (users.read is not implied by payouts.read); the other still fills the list.
  useEffect(() => {
    let cancelled = false;
    Promise.allSettled([
      api.get<any[]>("/company/users?role=dispatcher"),
      api.get<{ id: string; name: string }[]>("/payouts/dispatchers"),
    ]).then(([current, past]) => {
      if (cancelled) return;
      const byId = new Map<string, DispatcherOpt>();
      // Past first, so a current user's live name wins over an older payout's snapshot.
      if (past.status === "fulfilled") for (const d of past.value ?? []) byId.set(d.id, { id: d.id, name: d.name || d.id });
      if (current.status === "fulfilled") for (const u of current.value ?? []) byId.set(u.id, { id: u.id, name: u.full_name ?? u.login ?? u.id });
      setDispatchers([...byId.values()].sort((a, b) => a.name.localeCompare(b.name)));
    });
    return () => { cancelled = true; };
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
    // Filters can change faster than the server answers — only the latest request may
    // write to the table, or a slow earlier answer would overwrite a newer one.
    let cancelled = false;
    setLoading(true);
    setLoadErr(null);
    api.getPayouts<BackendPayout>({
      q:             debouncedSearch || undefined,
      dispatcher_id: dispFilter?.id || undefined,
      from:          period.from || undefined,
      to:            period.to || undefined,
      page,
      page_size:     pageSize,
    }).then(({ items, total: t, totals: tots }) => {
      if (cancelled) return;
      setPayouts((items ?? []).map(toPayout));
      setTotal(t);
      setTotals(tots);
    }).catch((e) => { if (!cancelled) setLoadErr(friendlyError(e, "Couldn't load payouts.")); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [fetchKey, debouncedSearch, dispFilter, period, page, pageSize]);

  const handleSave = async (added: number, deducted: number, notes: string) => {
    if (!editing) return;
    setSaveErr(null);
    setSaving(true);
    try {
      const updated = await api.patch<BackendPayout>(`/payouts/${editing.id}`, { added, deducted, notes });
      setPayouts((prev) => prev.map((p) => p.id === editing.id ? toPayout(updated as BackendPayout) : p));
      setFetchKey((k) => k + 1); // refetch totals
      setEditing(null);
      notify.success("Payout updated");
    } catch (e) {
      setSaveErr(friendlyError(e, "Couldn't save the adjustment.")); // keep modal open
    } finally {
      setSaving(false);
    }
  };



  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "var(--background)", overflow: "hidden" }}>

      {editing && (
        <AdjustModal
          payout={editing}
          onSave={handleSave}
          onClose={() => { setEditing(null); setSaveErr(null); }}
          saving={saving}
          error={saveErr}
        />
      )}

      <div style={{ flex: 1, overflow: "hidden", padding: "14px 24px", display: "flex", flexDirection: "column", gap: 12 }}>

      {/* Totals for the whole filtered period — from the server, so they cover every page */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, flexShrink: 0 }}>
        <Kpi icon={<DollarSign size={18} />}  label="Rate"       value={fmtMoney(totals.rate)} note={`${total} ${total === 1 ? "load" : "loads"}`} />
        <Kpi icon={<CirclePlus size={18} />}  label="Added"      value={totals.added > 0 ? `+${fmtMoney(totals.added)}` : fmtMoney(0)} tone={totals.added > 0 ? "good" : "plain"} />
        <Kpi icon={<CircleMinus size={18} />} label="Deducted"   value={totals.deducted > 0 ? `-${fmtMoney(totals.deducted)}` : fmtMoney(0)} tone={totals.deducted > 0 ? "bad" : "plain"} />
        <Kpi icon={<Wallet size={18} />}      label="Net payout" value={fmtMoney(totals.net)} />
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }}>

      {/* ── Toolbar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", borderBottom: "1px solid var(--border)", backgroundColor: "var(--card)", flexShrink: 0, flexWrap: "wrap" }}>
        {/* Search */}
        <div style={{ position: "relative", flex: "1 1 220px", maxWidth: 300 }}>
          <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground)", pointerEvents: "none" }} />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search driver, load, broker…" aria-label="Search payouts"
            style={{ width: "100%", height: 34, paddingLeft: 30, paddingRight: 10, borderRadius: 7, border: "1px solid var(--border)", backgroundColor: "var(--input-background)", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--foreground)", outline: "none", boxSizing: "border-box" }} />
        </div>

        {/* Dispatcher filter */}
        <div ref={filterRef} style={{ position: "relative" }}>
          <button onClick={() => setFilterOpen((v) => !v)} aria-haspopup="listbox" aria-expanded={filterOpen}
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

        {/* Period — the same control as the Dashboard */}
        <PeriodFilter value={period} onChange={(p) => { setPeriod(p); setPage(1); }} weekStartDay={weekStart} />

        <div style={{ flex: 1 }} />

        {/* What these loads earn each dispatcher — opens its own page, on the period picked above */}
        <button onClick={() => navigate(`/workspace/payouts/kpi${period.mode === "all" ? "" : `?mode=${period.mode}&from=${period.from}&to=${period.to}`}`)}
          style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 34, padding: "0 14px", borderRadius: 8, border: "none", backgroundColor: "var(--primary)", color: "var(--primary-foreground)", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0 }}>
          <HandCoins size={15} /> Generate KPI
        </button>
      </div>

      {/* ── Table — dim existing rows while a page-change refetch is in flight ── */}
      <div style={{ flex: 1, overflow: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed", opacity: loading && payouts.length > 0 ? 0.45 : 1, pointerEvents: loading ? "none" : "auto", transition: "opacity 0.15s" }}>
          <colgroup>
            <col style={{ width: 150 }} />{/* Dispatcher */}
            <col style={{ width: 170 }} />{/* Driver */}
            <col style={{ width: 172 }} />{/* Load Ref */}
            <col style={{ width: 150 }} />{/* Broker */}
            <col style={{ width: 220 }} />{/* Route */}
            <col style={{ width: 100 }} />{/* Rate */}
            <col style={{ width: 90 }} /> {/* Added */}
            <col style={{ width: 100 }} />{/* Deducted */}
            <col style={{ width: 110 }} />{/* Net */}
            <col style={{ width: 200 }} />{/* Notes */}
            <col style={{ width: 132 }} />{/* Date */}
            <col style={{ width: 80 }} /> {/* Actions */}
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
              <TH align="center" pinned>Adjust</TH>
            </tr>
          </thead>
          <tbody>
            {/* The loader lives in the table: the toolbar stays put (and keeps focus) while
                a filter change is in flight. With rows on screen they're dimmed instead. */}
            {loading && payouts.length === 0 && (
              <tr><td colSpan={12} style={{ padding: 0 }}><PageLoader label="payouts" /></td></tr>
            )}
            {!loading && loadErr && payouts.length === 0 && (
              <tr>
                <td colSpan={12} style={{ padding: "48px 20px" }}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                    <AlertCircle size={20} style={{ color: "#EF4444" }} />
                    <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "#EF4444" }}>{loadErr}</span>
                    <button onClick={() => setFetchKey((k) => k + 1)} style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--primary)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Retry</button>
                  </div>
                </td>
              </tr>
            )}
            {!loading && !loadErr && payouts.length === 0 && (
              <tr>
                <td colSpan={12} style={{ padding: "56px 20px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 14, color: "var(--muted-foreground)" }}>
                  No payouts found.
                </td>
              </tr>
            )}
            {payouts.map((p) => {
              return (
                <tr key={p.id}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = "var(--primary-faint)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.backgroundColor = ""; }}>

                  <TD><span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: "var(--foreground)" }}>{p.dispatcher || <Dash />}</span></TD>
                  <TD><span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--foreground)" }}>{p.driverName}</span></TD>
                  <TD noOverflow><span style={{ display: "inline-block", whiteSpace: "nowrap", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--primary)", backgroundColor: "var(--secondary)", borderRadius: 4, padding: "2px 8px" }}>{p.loadRef || <Dash />}</span></TD>
                  <TD><span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--foreground)" }}>{p.broker || <Dash />}</span></TD>
                  <TD>
                    {p.origin && p.destination
                      ? <span style={{ fontFamily: "var(--font-sans)", fontSize: 13 }}>
                          <span style={{ color: "var(--foreground)" }}>{p.origin}</span>
                          <span style={{ margin: "0 5px", color: "var(--muted-foreground)", opacity: 0.5 }}>→</span>
                          <span style={{ color: "var(--foreground)" }}>{p.destination}</span>
                        </span>
                      : <Dash />}
                  </TD>
                  <TD align="right"><span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--foreground)" }}>{fmtMoney(p.rate)}</span></TD>
                  <TD align="right">
                    {p.added > 0 ? <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--primary)" }}>+{fmtMoney(p.added)}</span> : <Dash />}
                  </TD>
                  <TD align="right">
                    {p.deducted > 0 ? <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "#EF4444" }}>-{fmtMoney(p.deducted)}</span> : <Dash />}
                  </TD>
                  <TD align="right"><span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: "var(--foreground)" }}>{fmtMoney(p.net)}</span></TD>
                  <TD>
                    {p.notes
                      ? <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <FileText size={11} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
                          <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>{p.notes}</span>
                        </span>
                      : <Dash />}
                  </TD>
                  <TD noOverflow>
                    <span style={{ display: "flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}>
                      <CalendarDays size={11} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
                      <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted-foreground)" }}>{fmtDate(p.completedAt) || p.completedAt || <Dash />}</span>
                    </span>
                  </TD>
                  <TD align="center" noOverflow pinned>
                    {canAdjust ? (
                      <button onClick={() => { setSaveErr(null); setEditing(p); }} aria-label={`Adjust payout for ${p.loadRef || p.driverName}`} title="Adjust payout"
                        style={{ width: 30, height: 30, display: "inline-flex", alignItems: "center", justifyContent: "center", borderRadius: 7, border: "none", backgroundColor: "transparent", cursor: "pointer", color: "var(--muted-foreground)", transition: "color 0.12s, background-color 0.12s" }}
                        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--primary-soft)"; e.currentTarget.style.color = "var(--primary)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; e.currentTarget.style.color = "var(--muted-foreground)"; }}>
                        <Pencil size={14} />
                      </button>
                    ) : (
                      <Dash />
                    )}
                  </TD>
                </tr>
              );
            })}
          </tbody>

        </table>
      </div>

      <Pagination page={page} total={total} pageSize={pageSize} loading={loading} onPage={setPage} onPageSize={(s) => setPageSize(s as PageSize)} />

      </div>
      </div>
    </div>
  );
}
