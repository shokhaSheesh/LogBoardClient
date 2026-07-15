import { useState, useMemo, useEffect, useRef } from "react";
import { Search, Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, AlertCircle, X, Users, Rows3 } from "lucide-react";
import { createPortal } from "react-dom";
import { Status, STATUS_CONFIG, ALL_STATUSES } from "../lib/statuses";
import { api, getCompanyId } from "../lib/api";
import { driverDisplayName } from "../lib/driverName";

type CellType = Status | "load" | "empty";

interface DayCell {
  type: CellType;
  amount?: number;
  loadId?: string;
}

interface DriverRow {
  id: string;
  name: string;
  driverType: "O/O" | "C/D";
  unit: string;
  dateMap: Record<string, DayCell>;
  weeklyTarget?: number;
  companyProfit: number;
  weekTotal?: number;
  miles: number;
  rpm: number; // 0 when miles is 0 — render "—" rather than 0.00
}

// ─── Backend types + mapper ───────────────────────────────────────────────────

interface BackendCell {
  type: string;
  amount?: number;
  load_id?: string | number | (string | number)[]; // array on days with multiple real completed loads
}

interface BackendDriverRow {
  driver_id: string;
  name: string;
  team?: boolean;   // team driver — name2 carries the second driver
  name2?: string;
  driver_type?: string;
  unit?: string;
  weekly_target?: number;
  company_profit?: number;
  week_total?: number; // the row's earnings for the window (load cells only)
  miles?: number;      // mileage of the loads the ledger attributes to this driver
  rpm?: number;        // week_total ÷ miles; 0 when miles is 0
  days?: Record<string, BackendCell>;
}

function toDriverRow(b: BackendDriverRow): DriverRow {
  const dateMap: Record<string, DayCell> = {};
  for (const [date, cell] of Object.entries(b.days ?? {})) {
    dateMap[date] = {
      type: (cell.type as CellType) ?? "empty",
      amount: cell.amount,
      // A day with several real completed loads sends load_id as an array — join with
      // "/" (not the default comma) so it matches the manual multi-select's own save
      // format; both read the same joined-ref shape.
      loadId: Array.isArray(cell.load_id)
        ? cell.load_id.map(String).join("/") || undefined
        : cell.load_id != null ? String(cell.load_id) : undefined,
    };
  }
  return {
    id:            b.driver_id,
    // Combined "Name1 & Name2" for teams; plain name otherwise.
    name:          driverDisplayName({ name: b.name, name2: b.name2, team: b.team }),
    driverType:    (b.driver_type as "O/O" | "C/D") ?? "O/O",
    unit:          b.unit          ?? "",
    weeklyTarget:  b.weekly_target,
    companyProfit: b.company_profit ?? 0,
    weekTotal:     b.week_total,
    miles:         b.miles ?? 0,
    rpm:           b.rpm   ?? 0,
    dateMap,
  };
}

// ─── Date utilities ───────────────────────────────────────────────────────────

function getDatesInRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const end = new Date(to + "T00:00:00");
  const cur = new Date(from + "T00:00:00");
  while (cur <= end) {
    const y = cur.getFullYear(), m = String(cur.getMonth() + 1).padStart(2, "0"), day = String(cur.getDate()).padStart(2, "0");
    dates.push(`${y}-${m}-${day}`);
    cur.setDate(cur.getDate() + 1);
  }
  return dates;
}

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
function colLabel(iso: string) {
  const d = new Date(iso + "T00:00:00");
  return { day: DAY_NAMES[d.getDay()], date: d.getDate() };
}
function fmt(n: number) { return `$${n.toLocaleString()}`; }

// ─── Cell display styles ──────────────────────────────────────────────────────

function cellStyle(type: CellType): { bg: string; color: string; label?: string } {
  if (type === "load")  return { bg: "var(--card)", color: "var(--foreground)" };
  if (type === "empty") return { bg: "var(--muted)", color: "var(--muted-foreground)" };
  const s = STATUS_CONFIG[type as Status];
  return { bg: s.bg, color: s.color, label: s.label.toUpperCase() };
}

const TYPE_OPTIONS: { type: CellType; label: string }[] = [
  { type: "load",  label: "Load"  },
  { type: "empty", label: "Empty" },
  ...ALL_STATUSES.map((s) => ({ type: s as CellType, label: STATUS_CONFIG[s].label })),
];

const DAY_W = 116;

// ─── Day cell display ─────────────────────────────────────────────────────────

function DayCellContent({ cell }: { cell: DayCell }) {
  const s = cellStyle(cell.type);
  if (cell.type === "load") {
    return cell.amount !== undefined ? (
      <>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 700, color: "var(--foreground)", lineHeight: 1.2 }}>{fmt(cell.amount)}</div>
        {/* Full width + inherited text-align:center so the ref sits under the amount,
            not jammed left; truncates within the cell instead of spilling. */}
        <div title={cell.loadId} style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--muted-foreground)", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>{cell.loadId}</div>
      </>
    ) : (
      <div title={cell.loadId} style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted-foreground)" }}>{cell.loadId ?? "—"}</div>
    );
  }
  if (cell.type === "empty") return null;
  return <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 700, color: s.color, letterSpacing: "0.05em", textTransform: "uppercase" }}>{s.label}</span>;
}

// ─── Multi-select load ID picker ───────────────────────────────────────────────
// One cell can reference several of the driver's loads (a day with multiple
// completed loads). The backend's manual-override field is a single free-text
// string, so multiple picks are joined with "/" — the same joined-ref shape the
// backend sends for the automatic (system-tracked) multi-load case.

function LoadMultiSelect({ selected, driverId, onChange }: {
  selected: string[];
  driverId: string;
  onChange: (ids: string[], sumPayout: number) => void;
}) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [items, setItems] = useState<{ id: string; payout: number }[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const reqId = useRef(0);
  // Payouts of every load we've ever loaded — so the amount sum stays correct even
  // for selected loads that have scrolled out of the current page / search results.
  const payoutRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 250);
    return () => clearTimeout(t);
  }, [query]);

  const loadPage = async (pageNum: number, q: string, replace: boolean) => {
    if (!driverId) return;
    const id = ++reqId.current; // guard against a slow stale response clobbering a newer one
    setLoading(true);
    try {
      const { items: rows, total: t } = await api.getList<any>("/loads", { driver_id: driverId, q: q || undefined, page: pageNum, page_size: 20 });
      if (id !== reqId.current) return;
      const opts = (rows ?? []).map((l: any) => ({ id: String(l.load_id ?? l.id), payout: l.payout ?? 0 }));
      opts.forEach((o) => payoutRef.current.set(o.id, o.payout));
      setItems((prev) => (replace ? opts : [...prev, ...opts]));
      setTotal(t);
      setPage(pageNum);
    } catch {
      // leave whatever's loaded in place
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  };

  // Fresh page-1 fetch on mount and whenever the (debounced) search changes.
  useEffect(() => {
    setItems([]); setTotal(0); setPage(1);
    void loadPage(1, debouncedQuery, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [driverId, debouncedQuery]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el || loading) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 48 && items.length < total) {
      void loadPage(page + 1, debouncedQuery, false);
    }
  };

  function toggle(id: string) {
    const isSel = selected.includes(id);
    const nextIds = isSel ? selected.filter((x) => x !== id) : [...selected, id];
    const sum = nextIds.reduce((s, x) => s + (payoutRef.current.get(x) ?? 0), 0);
    onChange(nextIds, sum);
  }

  return (
    <div style={{ position: "relative" }}>
      {selected.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
          {selected.map((id) => (
            <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 6px", borderRadius: 5, backgroundColor: "var(--secondary)", border: "1px solid var(--border)", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--secondary-foreground)" }}>
              {id}
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); toggle(id); }}
                style={{ border: "none", background: "none", cursor: "pointer", color: "var(--secondary-foreground)", display: "flex", padding: 0 }}
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <Search size={12} style={{ position: "absolute", left: 8, color: "var(--muted-foreground)", pointerEvents: "none" }} />
        <input
          type="text"
          placeholder="Search load ID…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: "100%", paddingLeft: 26, paddingRight: 8, height: 30,
            borderRadius: 6, border: "1px solid var(--border)",
            fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--foreground)",
            backgroundColor: "var(--input-background)",
            outline: "none", boxSizing: "border-box",
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.stopPropagation(); }
            if (e.key === "Enter" && items.length === 1) { e.preventDefault(); e.stopPropagation(); toggle(items[0].id); setQuery(""); }
          }}
        />
      </div>
      {/* Inline, bounded list (scrolls internally, infinite-loads on scroll) — never
          an absolute dropdown that could run off the bottom of the screen. */}
      <div
        ref={listRef}
        onScroll={onScroll}
        style={{
          marginTop: 4, border: "1px solid var(--border)", borderRadius: 6, backgroundColor: "var(--card)",
          maxHeight: 150, overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {items.map((load) => {
          const isSel = selected.includes(load.id);
          return (
            <button
              key={load.id}
              onMouseDown={(e) => { e.preventDefault(); toggle(load.id); }}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                width: "100%", padding: "6px 10px", border: "none",
                backgroundColor: isSel ? "var(--secondary)" : "transparent",
                cursor: "pointer", textAlign: "left",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = isSel ? "var(--accent)" : "var(--muted)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = isSel ? "var(--secondary)" : "transparent"; }}
            >
              <span style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${isSel ? "var(--primary)" : "var(--border)"}`, backgroundColor: isSel ? "var(--primary)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                {isSel && <Check size={10} color="#fff" />}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--foreground)", flex: 1 }}>{load.id}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "#10B981" }}>${load.payout.toLocaleString()}</span>
            </button>
          );
        })}
        {loading && (
          <div style={{ padding: "8px 10px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--muted-foreground)" }}>Loading…</div>
        )}
        {!loading && items.length === 0 && (
          <div style={{ padding: "10px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--muted-foreground)" }}>No loads found</div>
        )}
      </div>
    </div>
  );
}

// ─── Cell edit panel (portal) ─────────────────────────────────────────────────

interface EditState {
  driverId: string;
  date: string;
  rect: DOMRect;
  type: CellType;
  amount: string;
  loadIds: string[]; // the day's selected loads — joined with "/" on save
}

function CellEditPanel({
  edit,
  onType,
  onAmount,
  onLoadsChange,
  onSave,
  onCancel,
}: {
  edit: EditState;
  onType: (t: CellType) => void;
  onAmount: (v: string) => void;
  onLoadsChange: (ids: string[], sumPayout: number) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);

  // Focus amount input when switching to load
  useEffect(() => {
    if (edit.type === "load") amountRef.current?.focus();
  }, [edit.type]);

  // Auto-focus amount on mount if load type
  useEffect(() => {
    if (edit.type === "load") amountRef.current?.select();
  }, []);

  // Position the panel so it always fits on screen: open below the cell when there's
  // room, otherwise flip above (whichever side has more space), and cap the height to
  // the space actually available at that top — the panel scrolls internally past that,
  // so the Save/Cancel row is always reachable no matter which row the cell is in.
  const PANEL_W = 248;
  const GAP = 6;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.min(edit.rect.left, vw - PANEL_W - 8);
  const desired    = edit.type === "load" ? 420 : 130;
  const spaceBelow = vh - edit.rect.bottom - GAP;
  const spaceAbove = edit.rect.top - GAP;
  const openUp = spaceBelow < desired && spaceAbove > spaceBelow;
  const top = openUp
    ? Math.max(8, edit.rect.top - Math.min(desired, spaceAbove) - GAP)
    : edit.rect.bottom + GAP;
  const panelMaxHeight = vh - top - 8;

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter")  { e.preventDefault(); onSave(); }
    if (e.key === "Escape") { e.preventDefault(); onCancel(); }
  }

  const s = (type: CellType) => cellStyle(type);

  return createPortal(
    <>
      {/* Invisible backdrop — click outside saves */}
      <div
        style={{ position: "fixed", inset: 0, zIndex: 9998 }}
        onMouseDown={onSave}
      />
      <div
        ref={panelRef}
        onKeyDown={handleKey}
        style={{
          position: "fixed", top, left, zIndex: 9999, width: PANEL_W,
          backgroundColor: "var(--card)", border: "1.5px solid var(--primary)",
          borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.35)",
          padding: 10, display: "flex", flexDirection: "column", gap: 8,
          maxHeight: panelMaxHeight, overflowY: "auto",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Type chips */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {TYPE_OPTIONS.map((opt) => {
            const active = edit.type === opt.type;
            return (
              <button
                key={opt.type}
                onMouseDown={(e) => { e.preventDefault(); onType(opt.type); }}
                style={{
                  padding: "3px 8px", borderRadius: 5, border: active ? "1.5px solid transparent" : "1px solid var(--border)",
                  backgroundColor: active ? s(opt.type).bg : "var(--muted)",
                  color: active ? s(opt.type).color : "var(--foreground)",
                  fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: active ? 700 : 400,
                  cursor: "pointer", outline: "none",
                  boxShadow: active ? "0 0 0 2px var(--primary)" : "none",
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Load fields */}
        {edit.type === "load" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ position: "relative" }}>
              <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted-foreground)", pointerEvents: "none" }}>$</span>
              <input
                ref={amountRef}
                type="number"
                min={0}
                placeholder="Amount"
                value={edit.amount}
                onChange={(e) => onAmount(e.target.value)}
                style={{ width: "100%", paddingLeft: 20, paddingRight: 8, height: 30, borderRadius: 6, border: "1px solid var(--border)", fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--foreground)", backgroundColor: "var(--input-background)", outline: "none", boxSizing: "border-box" }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; }}
                onBlur={(e)  => { e.currentTarget.style.borderColor = "var(--border)"; }}
              />
            </div>
            <LoadMultiSelect
              selected={edit.loadIds}
              driverId={edit.driverId}
              onChange={(ids, sumPayout) => onLoadsChange(ids, sumPayout)}
            />
          </div>
        )}

        {/* Actions — sticky to the panel bottom so they stay reachable if it scrolls */}
        <div style={{ position: "sticky", bottom: -10, backgroundColor: "var(--card)", paddingTop: 8, marginTop: -2, borderTop: "1px solid var(--border)" }}>
          <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
            <button
              onMouseDown={(e) => { e.preventDefault(); onCancel(); }}
              style={{ padding: "4px 12px", borderRadius: 5, border: "1px solid var(--border)", backgroundColor: "var(--muted)", fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", cursor: "pointer", outline: "none" }}
            >
              Cancel
            </button>
            <button
              onMouseDown={(e) => { e.preventDefault(); onSave(); }}
              style={{ padding: "4px 12px", borderRadius: 5, border: "none", backgroundColor: "var(--primary)", fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, color: "var(--primary-foreground)", cursor: "pointer", outline: "none" }}
            >
              Save
            </button>
          </div>
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 10, color: "var(--muted-foreground)", textAlign: "right", marginTop: 4 }}>
            Enter to save · Esc to cancel
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}


// ─── Inline number editor (Target / Co.Profit) ────────────────────────────────

function InlineNumberEdit({ value, onSave, prefix = "$", allowNeg = false, readOnly = false }: {
  value: number | undefined;
  onSave?: (v: number | undefined) => void;
  prefix?: string;
  allowNeg?: boolean;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function open() {
    setDraft(value !== undefined ? String(value) : "");
    setEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  }

  function commit() {
    const n = draft.trim() === "" ? undefined : Number(draft.replace(/[^0-9.-]/g, ""));
    onSave?.(isNaN(n as number) ? undefined : n);
    setEditing(false);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter")  { e.preventDefault(); commit(); }
    if (e.key === "Escape") { setEditing(false); }
  }

  if (editing) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--muted-foreground)" }}>{prefix}</span>
        <input
          ref={inputRef}
          type="number"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKey}
          style={{ width: 72, height: 24, padding: "0 4px", borderRadius: 4, border: "1.5px solid var(--primary)", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--foreground)", backgroundColor: "var(--input-background)", outline: "none", textAlign: "right" }}
        />
      </div>
    );
  }

  const displayInner = (
    <>
      {value !== undefined ? (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>
          {allowNeg && value < 0 ? `-$${Math.abs(value).toLocaleString()}` : fmt(value)}
        </span>
      ) : (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)" }}>—</span>
      )}
    </>
  );

  if (readOnly) {
    return <div style={{ display: "inline-flex", alignItems: "center", gap: 2, padding: "1px 3px" }}>{displayInner}</div>;
  }

  return (
    <div
      onClick={open}
      title="Click to edit"
      style={{ cursor: "text", display: "inline-flex", alignItems: "center", gap: 2, borderRadius: 4, padding: "1px 3px", transition: "background 0.1s" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(59,130,246,0.08)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
    >
      {displayInner}
    </div>
  );
}

// ─── Date range picker ────────────────────────────────────────────────────────

type CalView = "days" | "months" | "years";

const MONTH_NAMES_FULL  = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const MONTH_NAMES_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY_ABBR = ["Su","Mo","Tu","We","Th","Fr","Sa"];

function isoDate(y: number, m: number, d: number) {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function daysInMonth(y: number, m: number) { return new Date(y, m + 1, 0).getDate(); }
function firstDow(y: number, m: number)    { return new Date(y, m, 1).getDay(); }

function fmtRange(from: string, to: string) {
  const f = (iso: string) => {
    const [y, mo, d] = iso.split("-").map(Number);
    return `${MONTH_NAMES_SHORT[mo - 1]} ${d}, ${y}`;
  };
  if (!from && !to) return "Select range";
  if (!to || from === to) return f(from);
  return `${f(from)} – ${f(to)}`;
}

interface DateRangePickerProps {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
}

function DateRangePicker({ from, to, onChange }: DateRangePickerProps) {
  const [open, setOpen]           = useState(false);
  const [view, setView]           = useState<CalView>("days");
  const [dispYear, setDispYear]   = useState(() => from ? Number(from.slice(0, 4)) : new Date().getFullYear());
  const [dispMonth, setDispMonth] = useState(() => from ? Number(from.slice(5, 7)) - 1 : new Date().getMonth());
  const [pending, setPending]     = useState<string | null>(null);
  const [hover, setHover]         = useState<string | null>(null);
  const [rect, setRect]           = useState<DOMRect | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef  = useRef<HTMLDivElement>(null);

  const navBtn: React.CSSProperties = {
    width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
    border: "1px solid var(--border)", borderRadius: 7, backgroundColor: "var(--muted)",
    color: "var(--foreground)", fontSize: 15, cursor: "pointer", lineHeight: 1, flexShrink: 0,
  };
  const hdrBtn: React.CSSProperties = {
    fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 700, color: "var(--foreground)",
    background: "none", border: "none", cursor: "pointer", padding: "3px 10px",
    borderRadius: 6, transition: "background 0.1s",
  };

  function openPicker() {
    const r = anchorRef.current?.getBoundingClientRect();
    if (r) setRect(r);
    setView("days");
    if (from) { setDispYear(Number(from.slice(0, 4))); setDispMonth(Number(from.slice(5, 7)) - 1); }
    setPending(null); setHover(null);
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!anchorRef.current?.contains(e.target as Node) && !panelRef.current?.contains(e.target as Node)) {
        setOpen(false); setPending(null);
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  function pickDay(iso: string) {
    if (!pending) { setPending(iso); }
    else {
      const [s, e] = iso >= pending ? [pending, iso] : [iso, pending];
      onChange(s, e);
      setPending(null); setHover(null); setOpen(false);
    }
  }

  // Effective range to highlight (live while selecting)
  const ps = pending ?? from;
  const pe = pending ? (hover ?? pending) : to;
  const [rs, re] = ps <= pe ? [ps, pe] : [pe, ps];

  function renderDays() {
    const fdow    = firstDow(dispYear, dispMonth);
    const dim     = daysInMonth(dispYear, dispMonth);
    const prevDim = daysInMonth(dispMonth === 0 ? dispYear - 1 : dispYear, dispMonth === 0 ? 11 : dispMonth - 1);
    const cells: { iso: string; inMonth: boolean }[] = [];
    for (let i = fdow - 1; i >= 0; i--) {
      const pm = dispMonth === 0 ? 11 : dispMonth - 1;
      const py = dispMonth === 0 ? dispYear - 1 : dispYear;
      cells.push({ iso: isoDate(py, pm, prevDim - i), inMonth: false });
    }
    for (let d = 1; d <= dim; d++) cells.push({ iso: isoDate(dispYear, dispMonth, d), inMonth: true });
    while (cells.length < 42) {
      const nm = dispMonth === 11 ? 0 : dispMonth + 1;
      const ny = dispMonth === 11 ? dispYear + 1 : dispYear;
      cells.push({ iso: isoDate(ny, nm, cells.length - fdow - dim + 1), inMonth: false });
    }

    function prevM() { if (dispMonth === 0) { setDispMonth(11); setDispYear(y => y - 1); } else setDispMonth(m => m - 1); }
    function nextM() { if (dispMonth === 11) { setDispMonth(0); setDispYear(y => y + 1); } else setDispMonth(m => m + 1); }

    return (
      <>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <button style={navBtn} onMouseDown={(e) => { e.preventDefault(); prevM(); }}>‹</button>
          <button style={hdrBtn} onMouseDown={(e) => { e.preventDefault(); setView("months"); }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--muted)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}>
            {MONTH_NAMES_FULL[dispMonth]} {dispYear}
          </button>
          <button style={navBtn} onMouseDown={(e) => { e.preventDefault(); nextM(); }}>›</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 3 }}>
          {DAY_ABBR.map((d) => (
            <div key={d} style={{ textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 600, color: "var(--muted-foreground)", padding: "0 0 4px", letterSpacing: "0.04em" }}>{d}</div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
          {cells.map(({ iso, inMonth }) => {
            const isS   = iso === rs;
            const isE   = iso === re && re !== rs;
            const inRng = iso > rs && iso < re;
            const d     = Number(iso.slice(8));
            let bg = "transparent", color = inMonth ? "var(--foreground)" : "var(--muted-foreground)", br = "6px", fw: number | string = 400;
            if (inRng) { bg = "var(--secondary)"; color = "var(--secondary-foreground)"; br = "0"; }
            if (isS)   { bg = "#3B82F6"; color = "#fff"; br = "6px 0 0 6px"; fw = 700; }
            if (isE)   { bg = "#3B82F6"; color = "#fff"; br = "0 6px 6px 0"; fw = 700; }
            if (isS && isE) br = "6px";
            return (
              <div key={iso} style={{ height: 30, backgroundColor: bg, borderRadius: br, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); if (inMonth) pickDay(iso); }}
                onMouseEnter={() => { if (pending) setHover(iso); }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color, fontWeight: fw, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 5 }}>{d}</span>
              </div>
            );
          })}
        </div>

        {pending && (
          <div style={{ marginTop: 8, fontFamily: "var(--font-sans)", fontSize: 10, color: "var(--muted-foreground)", textAlign: "center" }}>
            Now click an end date
          </div>
        )}
      </>
    );
  }

  function renderMonths() {
    return (
      <>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <button style={navBtn} onMouseDown={(e) => { e.preventDefault(); setDispYear(y => y - 1); }}>‹</button>
          <button style={hdrBtn} onMouseDown={(e) => { e.preventDefault(); setView("years"); }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--muted)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}>
            {dispYear}
          </button>
          <button style={navBtn} onMouseDown={(e) => { e.preventDefault(); setDispYear(y => y + 1); }}>›</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 5 }}>
          {MONTH_NAMES_SHORT.map((m, idx) => {
            const active = idx === dispMonth;
            return (
              <button key={m}
                onMouseDown={(e) => { e.preventDefault(); setDispMonth(idx); setView("days"); }}
                style={{ padding: "9px 0", borderRadius: 7, border: "none", fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: active ? 700 : 400, backgroundColor: active ? "#3B82F6" : "var(--muted)", color: active ? "#fff" : "var(--foreground)", cursor: "pointer" }}
                onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--border)"; }}
                onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--muted)"; }}>
                {m}
              </button>
            );
          })}
        </div>
      </>
    );
  }

  function renderYears() {
    const base  = Math.floor(dispYear / 12) * 12;
    const years = Array.from({ length: 12 }, (_, i) => base + i);
    return (
      <>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <button style={navBtn} onMouseDown={(e) => { e.preventDefault(); setDispYear(y => y - 12); }}>‹</button>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 700, color: "var(--foreground)" }}>{base} – {base + 11}</span>
          <button style={navBtn} onMouseDown={(e) => { e.preventDefault(); setDispYear(y => y + 12); }}>›</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 5 }}>
          {years.map((y) => {
            const active = y === dispYear;
            return (
              <button key={y}
                onMouseDown={(e) => { e.preventDefault(); setDispYear(y); setView("months"); }}
                style={{ padding: "9px 0", borderRadius: 7, border: "none", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: active ? 700 : 400, backgroundColor: active ? "#3B82F6" : "var(--muted)", color: active ? "#fff" : "var(--foreground)", cursor: "pointer" }}
                onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--border)"; }}
                onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--muted)"; }}>
                {y}
              </button>
            );
          })}
        </div>
      </>
    );
  }

  const PANEL_W = 268;
  const panelLeft = rect ? Math.min(rect.left, window.innerWidth - PANEL_W - 8) : 0;
  const panelTop  = rect ? rect.bottom + 6 : 0;

  return (
    <>
      <div ref={anchorRef} onClick={openPicker} style={{ flexShrink: 0 }}>
        <button style={{
          display: "inline-flex", alignItems: "center", gap: 7, height: 32, padding: "0 12px",
          fontFamily: "var(--font-sans)", fontSize: 13,
          backgroundColor: "var(--input-background)",
          border: `1px solid ${open ? "var(--primary)" : "var(--border)"}`,
          borderRadius: 6, color: "var(--foreground)", cursor: "pointer",
          boxShadow: open ? "0 0 0 3px rgba(59,130,246,0.12)" : "none", outline: "none",
          whiteSpace: "nowrap",
        }}>
          <Calendar size={13} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
          {fmtRange(from, to)}
          <ChevronDown size={12} style={{ color: "var(--muted-foreground)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s", marginLeft: 2 }} />
        </button>
      </div>

      {open && rect && createPortal(
        <div
          ref={panelRef}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "fixed", top: panelTop, left: panelLeft, zIndex: 9999,
            width: PANEL_W, backgroundColor: "var(--card)",
            border: "1.5px solid var(--primary)", borderRadius: 12,
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)", padding: 14,
          }}
        >
          {view === "days"   && renderDays()}
          {view === "months" && renderMonths()}
          {view === "years"  && renderYears()}
        </div>,
        document.body
      )}
    </>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

function getWeekRange(startDay: number): { from: Date; to: Date } {
  const today = new Date();
  const dow    = today.getDay();
  const offset = ((dow - startDay + 7) % 7);
  const from   = new Date(today); from.setDate(today.getDate() - offset);
  const to     = new Date(from);  to.setDate(from.getDate() + 6);
  return { from, to };
}

export function GrossMatrix() {
  const pad  = (n: number) => String(n).padStart(2, "0");
  const fmtD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  // weekStartDay is a sane placeholder until the first /gross response echoes the
  // company's real setting — never persisted or read from localStorage anymore.
  const [weekStartDay, setWeekStartDay] = useState(1);

  const [rows,     setRows]     = useState<DriverRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [loadErr,  setLoadErr]  = useState<string | null>(null); // fetch failure
  const [toast,    setToast]    = useState<string | null>(null); // transient save-error banner
  const [search,   setSearch]   = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");
  const [viewMode, setViewMode] = useState<"all" | "teams">("all"); // one table vs a section per team
  const [teams,    setTeams]    = useState<{ id: string; name: string; driverIds: Set<string>; userNames: string[] }[]>([]);

  // Auto-dismiss the save-error banner.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // Teams (dispatch pods) for the "By team" view — same fetch/shape as the board.
  useEffect(() => {
    const companyId = getCompanyId();
    if (!companyId) return;
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    api.get<{ id: string; name: string; driver_ids?: string[]; user_names?: string[] }[]>(`/owner/companies/${companyId}/teams`)
      .then((data) => {
        setTeams((data ?? []).map((t) => ({
          id: t.id, name: t.name, driverIds: new Set(t.driver_ids ?? []),
          // Drop unresolved names (backend falls back to the raw user id when it can't resolve one).
          userNames: (t.user_names ?? []).filter((n) => !UUID_RE.test(n)),
        })));
      })
      .catch(() => setTeams([]));
  }, []);

  // Fetch gross data. Omit from/to to let the backend pick the default current
  // week (anchored to the company's week_start_day) — we then sync our state
  // from whatever range + week_start_day it echoes back, rather than guessing.
  const loadGross = (from?: string, to?: string, q?: string) => {
    setLoading(true);
    setLoadErr(null);
    const qs = new URLSearchParams();
    if (from && to) { qs.set("from", from); qs.set("to", to); }
    if (q) qs.set("q", q);
    const query = qs.toString();
    api.get<any>(`/gross${query ? `?${query}` : ""}`)
      .then((data) => {
        if (typeof data?.week_start_day === "number") setWeekStartDay(data.week_start_day);
        if (data?.from) setDateFrom(data.from);
        if (data?.to)   setDateTo(data.to);
        const items: BackendDriverRow[] = data?.drivers ?? [];
        // miles/rpm now come straight from the ledger on each row — no client derivation.
        setRows(items.map(toDriverRow));
      })
      .catch((e) => setLoadErr(e instanceof Error ? e.message : "Couldn't load gross data."))
      .finally(() => setLoading(false));
  };

  // Initial load — server picks the default current week
  useEffect(() => { loadGross(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch when the search text changes (once the initial range has loaded)
  useEffect(() => {
    if (!dateFrom || !dateTo) return;
    loadGross(dateFrom, dateTo, search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Re-snap to the current week whenever the Settings tab saves a new week_start_day
  useEffect(() => {
    const handler = (e: Event) => {
      const newStart = (e as CustomEvent<{ weekStartDay: number }>).detail?.weekStartDay;
      if (typeof newStart !== "number") return;
      setWeekStartDay(newStart);
      const range = getWeekRange(newStart);
      loadGross(fmtD(range.from), fmtD(range.to), search);
    };
    window.addEventListener("week-settings-changed", handler);
    return () => window.removeEventListener("week-settings-changed", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  function shiftWeek(dir: -1 | 1) {
    if (!dateFrom) return;
    const d = new Date(dateFrom + "T00:00:00");
    // Snap to the configured week start day first, then shift by 7
    const dow    = d.getDay();
    const offset = ((dow - weekStartDay + 7) % 7);
    d.setDate(d.getDate() - offset + dir * 7);
    const newFrom = fmtD(d);
    d.setDate(d.getDate() + 6);
    const newTo = fmtD(d);
    loadGross(newFrom, newTo, search);
  }

  // Cell editing
  const [editState, setEditState] = useState<EditState | null>(null);

  function openCellEdit(driverId: string, date: string, cell: DayCell, e: React.MouseEvent) {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    // The stored ref is a single "/"-joined string (see toDriverRow) — split it back
    // into individual ids so previously-saved loads show pre-checked in the picker.
    const loadIds = cell.loadId ? cell.loadId.split("/").map((s) => s.trim()).filter(Boolean) : [];
    setEditState({ driverId, date, rect, type: cell.type, amount: cell.amount !== undefined ? String(cell.amount) : "", loadIds });
  }

  function commitCellEdit() {
    if (!editState) return;
    const { driverId, date } = editState;
    const prevCell = rows.find((d) => d.id === driverId)?.dateMap[date]; // for rollback
    const joinedLoadId = editState.loadIds.join("/") || undefined;
    const newCell: DayCell = editState.type === "load"
      ? { type: "load", amount: editState.amount ? Number(editState.amount) : undefined, loadId: joinedLoadId }
      : { type: editState.type };
    // optimistic update
    setRows((prev) => prev.map((d) => d.id === driverId
      ? { ...d, dateMap: { ...d.dateMap, [date]: newCell } }
      : d
    ));
    api.patch("/gross", {
      driver_id: driverId,
      date,
      type:      editState.type,
      amount:    newCell.type === "load" ? newCell.amount : undefined,
      load_id:   newCell.type === "load" ? newCell.loadId : undefined,
    }).catch((e) => {
      // Roll the cell back to its previous value and tell the user
      setRows((prev) => prev.map((d) => {
        if (d.id !== driverId) return d;
        const dateMap = { ...d.dateMap };
        if (prevCell) dateMap[date] = prevCell; else delete dateMap[date];
        return { ...d, dateMap };
      }));
      setToast(e instanceof Error ? e.message : "Couldn't save the change — reverted.");
    });
    setEditState(null);
  }

  function cancelCellEdit() { setEditState(null); }

  // Row-level field saves
  // Date columns
  const dates = useMemo(() => {
    if (!dateFrom || !dateTo || dateFrom > dateTo) return [];
    return getDatesInRange(dateFrom, dateTo).slice(0, 90);
  }, [dateFrom, dateTo]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return q ? rows.filter((d) => d.name.toLowerCase().includes(q) || d.unit.toLowerCase().includes(q)) : rows;
  }, [search, rows]);

  function rangeTotal(driver: DriverRow) {
    return dates.reduce((s, iso) => {
      const cell = driver.dateMap[iso];
      return s + (cell?.type === "load" && cell.amount ? cell.amount : 0);
    }, 0);
  }

  // "By team" view: a separate table per team (plus an "Unassigned" section), each with
  // its own subtotal row — same pattern as the board.
  const teamGroups: { name: string; isUnassigned: boolean; drivers: DriverRow[]; userNames: string[] }[] =
    viewMode === "teams" && teams.length > 0
      ? (() => {
          const gs = teams
            .map((t) => ({ name: t.name, isUnassigned: false, drivers: filtered.filter((d) => t.driverIds.has(d.id)), userNames: t.userNames }))
            .filter((g) => g.drivers.length > 0);
          const unassigned = filtered.filter((d) => !teams.some((t) => t.driverIds.has(d.id)));
          if (unassigned.length) gs.push({ name: "Unassigned", isUnassigned: true, drivers: unassigned, userNames: [] });
          return gs;
        })()
      : [];

  const rangeDays = dates.length;


  const R = { total: 240, target: 120, profit: 0 };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "var(--background)", overflow: "hidden" }}>
      {toast && (
        <div style={{ position: "fixed", top: 20, right: 20, zIndex: 10000, display: "flex", alignItems: "center", gap: 8, padding: "10px 14px", borderRadius: 8, backgroundColor: "var(--card)", border: "1px solid #EF4444", boxShadow: "0 10px 30px rgba(0,0,0,0.16)", maxWidth: 360 }}>
          <AlertCircle size={15} style={{ color: "#EF4444", flexShrink: 0 }} />
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--foreground)" }}>{toast}</span>
        </div>
      )}
      {editState && (
        <CellEditPanel
          edit={editState}
          onType={(t) => setEditState((s) => s ? { ...s, type: t, amount: t === "load" ? s.amount : "", loadIds: t === "load" ? s.loadIds : [] } : s)}
          onAmount={(v) => setEditState((s) => s ? { ...s, amount: v } : s)}
          onLoadsChange={(ids, sumPayout) => setEditState((s) => s ? { ...s, loadIds: ids, amount: String(sumPayout) } : s)}
          onSave={commitCellEdit}
          onCancel={cancelCellEdit}
        />
      )}

      <div style={{ flex: 1, overflow: "hidden", padding: "20px 24px", display: "flex", flexDirection: "column" }}>
        <div style={{ flex: 1, display: "flex", flexDirection: "column", backgroundColor: "var(--card)", borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)" }}>

          {/* Toolbar */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderBottom: "1px solid var(--border)", backgroundColor: "var(--card)", flexShrink: 0 }}>
            <h2 style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 600, color: "var(--foreground)", flexShrink: 0, margin: 0 }}>Gross Revenue Matrix</h2>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted-foreground)", backgroundColor: "var(--muted)", borderRadius: 4, padding: "2px 8px", flexShrink: 0 }}>{filtered.length} drivers</span>
            {rangeDays > 0 && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted-foreground)", backgroundColor: "var(--muted)", borderRadius: 4, padding: "2px 8px", flexShrink: 0 }}>
                {rangeDays} {rangeDays === 1 ? "day" : "days"}
              </span>
            )}

            {/* View toggle: one table vs a section per team */}
            {teams.length > 0 && (
              <div style={{ display: "inline-flex", border: "1px solid var(--border)", borderRadius: 7, overflow: "hidden", flexShrink: 0 }}>
                {([["all", "All drivers", Rows3], ["teams", "By team", Users]] as const).map(([m, label, Icon]) => (
                  <button key={m} onClick={() => setViewMode(m)} title={label}
                    style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 30, height: 28, border: "none", cursor: "pointer", backgroundColor: viewMode === m ? "var(--primary)" : "transparent", color: viewMode === m ? "#fff" : "var(--muted-foreground)" }}>
                    <Icon size={13} />
                  </button>
                ))}
              </div>
            )}

            <div style={{ flex: 1 }} />

            <div style={{ position: "relative", flexShrink: 0 }}>
              <Search size={13} style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground)", pointerEvents: "none" }} />
              <input value={search} onChange={(e) => { setSearch(e.target.value); }} placeholder="Search drivers…"
                style={{ fontFamily: "var(--font-sans)", fontSize: 13, padding: "5px 10px 5px 28px", height: 32, width: 200, borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "var(--input-background)", color: "var(--foreground)", outline: "none" }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.12)"; }}
                onBlur={(e)  => { e.currentTarget.style.borderColor = "var(--border)";  e.currentTarget.style.boxShadow = "none"; }}
              />
            </div>

            <button
              onClick={() => shiftWeek(-1)}
              title="Previous week"
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "var(--input-background)", color: "var(--muted-foreground)", cursor: "pointer", flexShrink: 0, outline: "none" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--muted)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--foreground)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--input-background)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--muted-foreground)"; }}
            >
              <ChevronLeft size={15} />
            </button>

            <DateRangePicker
              from={dateFrom}
              to={dateTo}
              onChange={(f, t) => loadGross(f, t, search)}
            />

            <button
              onClick={() => shiftWeek(1)}
              title="Next week"
              style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 30, height: 30, borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "var(--input-background)", color: "var(--muted-foreground)", cursor: "pointer", flexShrink: 0, outline: "none" }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--muted)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--foreground)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--input-background)"; (e.currentTarget as HTMLButtonElement).style.color = "var(--muted-foreground)"; }}
            >
              <ChevronRight size={15} />
            </button>
          </div>

          {/* Table */}
          <div style={{ flex: 1, overflow: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
            {dates.length === 0 ? (
              <div style={{ padding: "60px 20px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>
                Select a valid date range to display data.
              </div>
            ) : loading ? (
              <div style={{ padding: "60px 20px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>
                Loading…
              </div>
            ) : loadErr ? (
              <div style={{ padding: "60px 20px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                <AlertCircle size={20} style={{ color: "#EF4444" }} />
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "#EF4444" }}>{loadErr}</span>
                <button onClick={() => loadGross(dateFrom, dateTo, search)} style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--primary)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Retry</button>
              </div>
            ) : viewMode === "teams" && teamGroups.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 28, padding: "16px 16px 24px" }}>
                {teamGroups.map((g) => (
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
                      {renderGrossTable(g.drivers)}
                    </div>
                  </div>
                ))}
              </div>
            ) : renderGrossTable(filtered)}
          </div>

        </div>
      </div>
    </div>
  );

  // One full gross table (thead+tbody+totals row) for the given driver list — used for
  // the single "All drivers" table, and once per section in the "By team" view.
  function renderGrossTable(driversList: DriverRow[]) {
    // Footer sums the rows actually on screen, so it reconciles with them under a
    // search filter or a team split. (The backend's `totals` are company-wide and
    // ignore ?q=, which would contradict the visible rows.)
    const groupTotal  = driversList.reduce((s, d) => s + (d.weekTotal ?? rangeTotal(d)), 0);
    const groupProfit = driversList.reduce((s, d) => s + d.companyProfit, 0);
    const groupMiles  = driversList.reduce((s, d) => s + d.miles, 0);
    const groupRpm    = groupMiles > 0 ? groupTotal / groupMiles : null;
    return (
              <table style={{ borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed", minWidth: "100%" }}>
                <thead>
                  <tr style={{ position: "sticky", top: 0, zIndex: 20, backgroundColor: "#0F172A" }}>
                    <th style={thLeft({ width: 200, left: 0, textAlign: "left" })}>Driver Name</th>
                    <th style={thLeft({ width: 72,  left: 200, borderRight: "2px solid #334155" })}>Unit</th>
                    {dates.map((iso) => {
                      const { day, date } = colLabel(iso);
                      const isWeekend = new Date(iso + "T00:00:00").getDay() % 6 === 0;
                      return (
                        <th key={iso} style={{ ...thDay(), width: DAY_W, minWidth: DAY_W, backgroundColor: isWeekend ? "#1E293B" : "#0F172A" }}>
                          <div style={{ lineHeight: 1.2 }}>
                            <div>{day}</div>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#64748B", marginTop: 1 }}>{date}</div>
                          </div>
                        </th>
                      );
                    })}
                    <th style={thStickyRight({ width: 110, right: R.total })}>Total</th>
                    <th style={thStickyRight({ width: 120, right: R.target })}>Target</th>
                    <th style={thStickyRight({ width: 120, right: R.profit, borderRight: "none" })}>Co. Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {driversList.length === 0 ? (
                    <tr>
                      <td colSpan={2 + dates.length + 3} style={{ padding: "48px 20px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>
                        No drivers match your search.
                      </td>
                    </tr>
                  ) : driversList.map((driver, i) => {
                    const isEven   = i % 2 === 0;
                    const rowBg    = isEven ? "var(--card)" : "var(--background)";
                    const total    = driver.weekTotal ?? rangeTotal(driver);
                    // rpm is 0 when the driver earned with no recorded mileage — there's
                    // no meaningful quotient, so show "—" instead of $0.00/mi.
                    const driverRpm = driver.miles > 0 ? driver.rpm : null;
                    // Target may be unset (0/undefined) — keep the same layout regardless: $0 / 0% / empty bar.
                    const targetPct = driver.weeklyTarget ? Math.min(100, Math.round((total / driver.weeklyTarget) * 100)) : 0;
                    const barColor  = targetPct >= 100 ? "#10B981" : targetPct >= 70 ? "#F59E0B" : "#3B82F6";
                    // Blue/neutral/green/red column tints, as low-alpha overlays so they read
                    // over either rowBg, light or dark. They ride as a background *image* on an
                    // opaque background *color*: these three columns are sticky-right, and a
                    // translucent backgroundColor would let the scrolled day cells bleed through.
                    const tint      = (c: string) => `linear-gradient(${c}, ${c})`;
                    const totalBg   = isEven ? tint("rgba(59,130,246,0.07)") : tint("rgba(59,130,246,0.13)");
                    const targetBg  = isEven ? tint("rgba(148,163,184,0.05)") : tint("rgba(148,163,184,0.10)");
                    const profitBg  = driver.companyProfit >= 0
                      ? (isEven ? tint("rgba(16,185,129,0.07)") : tint("rgba(16,185,129,0.13)"))
                      : (isEven ? tint("rgba(239,68,68,0.06)")  : tint("rgba(239,68,68,0.11)"));

                    return (
                      <tr key={driver.id}>
                        {/* Driver Name */}
                        <td style={{ width: 200, minWidth: 200, padding: "0 12px", verticalAlign: "middle", borderRight: "1px solid var(--border)", borderBottom: "1px solid var(--border)", backgroundColor: rowBg, position: "sticky", left: 0, zIndex: 10 }}>
                          <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, color: "var(--foreground)", whiteSpace: "nowrap" }}>{driver.name}</div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--muted-foreground)" }}>({driver.driverType})</div>
                        </td>
                        {/* Unit */}
                        <td style={{ width: 72, minWidth: 72, padding: "0 8px", textAlign: "center", verticalAlign: "middle", borderRight: "2px solid var(--border)", borderBottom: "1px solid var(--border)", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500, color: "var(--foreground)", backgroundColor: rowBg, position: "sticky", left: 200, zIndex: 10 }}>
                          {driver.unit}
                        </td>

                        {/* Day cells — click to edit */}
                        {dates.map((iso) => {
                          const cell = driver.dateMap[iso] ?? { type: "empty" as CellType };
                          const cs   = cellStyle(cell.type);
                          const isActive = editState?.driverId === driver.id && editState?.date === iso;
                          const isLoad   = cell.type === "load";
                          const isBg     = !isLoad && cell.type !== "empty";
                          return (
                            <td
                              key={iso}
                              onClick={(e) => openCellEdit(driver.id, iso, cell, e)}
                              style={{
                                width: DAY_W, minWidth: DAY_W,
                                padding: isLoad ? "6px 6px" : "6px 4px",
                                textAlign: "center", verticalAlign: "middle",
                                borderRight: isBg ? "1px solid rgba(255,255,255,0.15)" : "1px solid var(--border)",
                                borderBottom: "1px solid var(--border)",
                                backgroundColor: cs.bg,
                                cursor: "pointer",
                                outline: isActive ? "2px solid #3B82F6" : "none",
                                outlineOffset: -2,
                                transition: "filter 0.1s",
                              }}
                              onMouseEnter={(e) => { if (!isActive) (e.currentTarget as HTMLElement).style.filter = "brightness(0.93)"; }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = "none"; }}
                            >
                              <DayCellContent cell={cell} />
                            </td>
                          );
                        })}

                        {/* Total */}
                        <td style={{ width: 110, minWidth: 110, padding: "0 12px", textAlign: "right", verticalAlign: "middle", borderLeft: "2px solid var(--border)", borderBottom: "1px solid var(--border)", backgroundColor: rowBg, backgroundImage: totalBg, position: "sticky", right: R.total, zIndex: 10 }}>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "#3B82F6", whiteSpace: "nowrap" }}>{fmt(total)}</div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: driverRpm !== null ? "#10B981" : "var(--muted-foreground)", marginTop: 2, whiteSpace: "nowrap" }}
                            title={driverRpm !== null ? `${driver.miles.toLocaleString()} mi` : "No recorded mileage"}>
                            {driverRpm !== null ? `$${driverRpm.toFixed(2)}/mi` : "—"}
                          </div>
                        </td>

                        {/* Target — inline editable */}
                        <td style={{ width: 120, minWidth: 120, padding: "6px 12px", verticalAlign: "middle", borderLeft: "1px solid var(--border)", borderBottom: "1px solid var(--border)", backgroundColor: rowBg, backgroundImage: targetBg, position: "sticky", right: R.target, zIndex: 10 }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <InlineNumberEdit value={driver.weeklyTarget ?? 0} readOnly />
                              <span style={{ fontFamily: "var(--font-sans)", fontSize: 10, color: targetPct >= 100 ? "#10B981" : "var(--muted-foreground)", fontWeight: 600 }}>{targetPct}%</span>
                            </div>
                            <div style={{ height: 4, borderRadius: 99, backgroundColor: "var(--border)", overflow: "hidden" }}>
                              <div style={{ height: "100%", borderRadius: 99, width: `${targetPct}%`, backgroundColor: barColor, transition: "width 0.3s ease" }} />
                            </div>
                          </div>
                        </td>

                        {/* Co. Profit — inline editable */}
                        <td style={{ width: 120, minWidth: 120, padding: "0 12px", textAlign: "right", verticalAlign: "middle", borderLeft: "1px solid var(--border)", borderBottom: "1px solid var(--border)", borderRight: "none", backgroundColor: rowBg, backgroundImage: profitBg, position: "sticky", right: R.profit, zIndex: 10 }}>
                          <div style={{ display: "flex", justifyContent: "flex-end" }}>
                            <InlineNumberEdit value={driver.companyProfit} allowNeg readOnly />
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {/* Totals row */}
                  <tr style={{ position: "sticky", bottom: 0, zIndex: 15 }}>
                    <td colSpan={2} style={{ padding: "8px 12px", textAlign: "left", borderTop: "2px solid #334155", fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 700, color: "#CBD5E1", letterSpacing: "0.06em", textTransform: "uppercase", position: "sticky", left: 0, zIndex: 16, backgroundColor: "#0F172A" }}>
                      Totals
                    </td>
                    {dates.map((iso) => {
                      const dayTotal = driversList.reduce((sum, dr) => {
                        const cell = dr.dateMap[iso];
                        return sum + (cell?.type === "load" && cell.amount ? cell.amount : 0);
                      }, 0);
                      return (
                        <td key={iso} style={{ padding: "8px 6px", textAlign: "center", verticalAlign: "middle", borderTop: "2px solid #334155", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 700, color: dayTotal > 0 ? "#60A5FA" : "#475569", backgroundColor: "#0F172A" }}>
                          {dayTotal > 0 ? fmt(dayTotal) : "—"}
                        </td>
                      );
                    })}
                    <td style={{ padding: "8px 12px", textAlign: "right", verticalAlign: "middle", borderTop: "2px solid #334155", borderLeft: "2px solid #334155", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "#34D399", position: "sticky", right: R.total, zIndex: 16, backgroundColor: "#0F172A" }}>
                      <div style={{ whiteSpace: "nowrap" }}>{fmt(groupTotal)}</div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: "#64748B", marginTop: 2, whiteSpace: "nowrap" }}
                        title={groupRpm !== null ? `${groupMiles.toLocaleString()} mi` : "No recorded mileage"}>
                        {groupRpm !== null ? `$${groupRpm.toFixed(2)}/mi` : "—"}
                      </div>
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "center", verticalAlign: "middle", borderTop: "2px solid #334155", borderLeft: "1px solid #334155", fontFamily: "var(--font-mono)", fontSize: 11, color: "#475569", position: "sticky", right: R.target, zIndex: 16, backgroundColor: "#0F172A" }}>—</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", verticalAlign: "middle", borderTop: "2px solid #334155", borderLeft: "1px solid #334155", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: groupProfit >= 0 ? "#34D399" : "#F87171", position: "sticky", right: R.profit, zIndex: 16, backgroundColor: "#0F172A" }}>
                      {groupProfit >= 0 ? fmt(groupProfit) : `-$${Math.abs(groupProfit).toLocaleString()}`}
                    </td>
                  </tr>
                </tbody>
              </table>
    );
  }
}

/* ─── Header style helpers ──────────────────────────────────────────────────── */

function thLeft(extra: Record<string, unknown>) {
  return {
    padding: "10px 8px", textAlign: "center" as const,
    fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 700,
    color: "#94A3B8", letterSpacing: "0.07em", textTransform: "uppercase" as const,
    borderRight: "1px solid #1E293B", borderBottom: "2px solid #1E293B",
    position: "sticky" as const, zIndex: 21, backgroundColor: "#0F172A",
    ...extra,
  };
}

function thDay() {
  return {
    padding: "8px 6px", textAlign: "center" as const,
    fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 700,
    color: "#94A3B8", letterSpacing: "0.07em", textTransform: "uppercase" as const,
    borderRight: "1px solid #1E293B", borderBottom: "2px solid #1E293B",
  };
}

function thStickyRight(extra: { width: number; right: number; borderRight?: string }) {
  return {
    padding: "10px 12px", textAlign: "right" as const,
    fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 700,
    color: "#94A3B8", letterSpacing: "0.07em", textTransform: "uppercase" as const,
    borderLeft: extra.right === 240 ? "2px solid #1E293B" : "1px solid #1E293B",
    borderBottom: "2px solid #1E293B",
    position: "sticky" as const, right: extra.right, zIndex: 21,
    backgroundColor: "#0F172A",
    borderRight: extra.borderRight ?? undefined,
    width: extra.width, minWidth: extra.width,
  };
}
