import { useState, useMemo, useEffect, useRef } from "react";
import { Search, Calendar, Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { createPortal } from "react-dom";
import { Status, STATUS_CONFIG, ALL_STATUSES } from "../lib/statuses";
import { api } from "../lib/api";
import { getWeekStartDay } from "./SettingsPage";

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
}

// ─── Backend types + mapper ───────────────────────────────────────────────────

interface BackendCell {
  type: string;
  amount?: number;
  load_id?: string;
}

interface BackendDriverRow {
  driver_id: string;
  name: string;
  driver_type?: string;
  unit?: string;
  weekly_target?: number;
  company_profit?: number;
  days?: Record<string, BackendCell>;
}

function toDriverRow(b: BackendDriverRow): DriverRow {
  const dateMap: Record<string, DayCell> = {};
  for (const [date, cell] of Object.entries(b.days ?? {})) {
    dateMap[date] = {
      type: (cell.type as CellType) ?? "empty",
      amount: cell.amount,
      loadId: cell.load_id,
    };
  }
  return {
    id:            b.driver_id,
    name:          b.name          ?? "",
    driverType:    (b.driver_type as "O/O" | "C/D") ?? "O/O",
    unit:          b.unit          ?? "",
    weeklyTarget:  b.weekly_target,
    companyProfit: b.company_profit ?? 0,
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

// miles lookup is now derived from fetched rows — kept as a ref updated after each fetch
const grossMilesMapRef = new Map<string, number>();
function getLoadMiles(loadId: string): number {
  return loadId.split("/").reduce((s, id) => s + (grossMilesMapRef.get(id.trim()) ?? 0), 0);
}

// ─── Cell display styles ──────────────────────────────────────────────────────

function cellStyle(type: CellType): { bg: string; color: string; label?: string } {
  if (type === "load")  return { bg: "#ffffff", color: "#111827" };
  if (type === "empty") return { bg: "#F9FAFB", color: "#9CA3AF" };
  const s = STATUS_CONFIG[type as Status];
  return { bg: s.bg, color: s.color, label: s.label.toUpperCase() };
}

const TYPE_OPTIONS: { type: CellType; label: string }[] = [
  { type: "load",  label: "Load"  },
  { type: "empty", label: "Empty" },
  ...ALL_STATUSES.map((s) => ({ type: s as CellType, label: STATUS_CONFIG[s].label })),
];

const DAY_W = 95;

// ─── Day cell display ─────────────────────────────────────────────────────────

function DayCellContent({ cell }: { cell: DayCell }) {
  const s = cellStyle(cell.type);
  if (cell.type === "load") {
    return cell.amount !== undefined ? (
      <>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 700, color: "#111827", lineHeight: 1.2 }}>{fmt(cell.amount)}</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#6B7280", marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: DAY_W - 12 }}>{cell.loadId}</div>
      </>
    ) : (
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#9CA3AF" }}>{cell.loadId ?? "—"}</div>
    );
  }
  if (cell.type === "empty") return null;
  return <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 700, color: s.color, letterSpacing: "0.05em", textTransform: "uppercase" }}>{s.label}</span>;
}

// ─── Searchable load ID selector ──────────────────────────────────────────────

function LoadIdSelect({ value, driverId, onSelect }: {
  value: string;
  driverId: string;
  onSelect: (id: string, payout: string) => void;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen]   = useState(false);
  const [allLoads, setAllLoads] = useState<{ id: string; payout: number }[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  // Fetch driver's loads on mount and open dropdown
  useEffect(() => {
    if (!driverId) return;
    setOpen(true);
    api.getList<any>("/loads", { driver_id: driverId, page_size: 100 })
      .then(({ items }) => {
        setAllLoads((items ?? []).map((l: any) => ({ id: l.load_id ?? l.id, payout: l.payout ?? 0 })));
      })
      .catch(() => {});
  }, [driverId]);

  const filtered = query.trim()
    ? allLoads.filter((l) => l.id.toLowerCase().includes(query.toLowerCase()))
    : allLoads;

  function pick(load: { id: string; payout: number }) {
    onSelect(load.id, String(load.payout));
    setQuery(load.id);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <Search size={12} style={{ position: "absolute", left: 8, color: "#9CA3AF", pointerEvents: "none" }} />
        <input
          type="text"
          placeholder="Search load ID…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          style={{
            width: "100%", paddingLeft: 26, paddingRight: 8, height: 30,
            borderRadius: 6, border: "1px solid #D1D5DB",
            fontFamily: "var(--font-mono)", fontSize: 12, color: "#374151",
            outline: "none", boxSizing: "border-box",
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Escape") { setOpen(false); e.stopPropagation(); }
            if (e.key === "Enter" && filtered.length === 1) { e.preventDefault(); pick(filtered[0]); }
          }}
        />
      </div>
      {open && filtered.length > 0 && (
        <div
          style={{
            position: "absolute", top: "calc(100% + 3px)", left: 0, right: 0, zIndex: 10,
            backgroundColor: "#fff", border: "1px solid #D1D5DB", borderRadius: 6,
            boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
            maxHeight: 160, overflowY: "auto",
            scrollbarWidth: "thin", scrollbarColor: "#D1D5DB transparent",
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {filtered.map((load) => (
            <button
              key={load.id}
              onMouseDown={(e) => { e.preventDefault(); pick(load); }}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                width: "100%", padding: "6px 10px", border: "none",
                backgroundColor: load.id === query ? "#EFF6FF" : "transparent",
                cursor: "pointer", textAlign: "left",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#F0F9FF"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = load.id === query ? "#EFF6FF" : "transparent"; }}
            >
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#374151" }}>{load.id}</span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 600, color: "#10B981" }}>${load.payout.toLocaleString()}</span>
            </button>
          ))}
        </div>
      )}
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
  loadId: string;
}

function CellEditPanel({
  edit,
  onType,
  onAmount,
  onLoadId,
  onSave,
  onCancel,
}: {
  edit: EditState;
  onType: (t: CellType) => void;
  onAmount: (v: string) => void;
  onLoadId: (v: string) => void;
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

  // Position: below the cell, shifted left if near right edge
  const PANEL_W = 248;
  const vw = window.innerWidth;
  const left = Math.min(edit.rect.left, vw - PANEL_W - 8);
  const top  = edit.rect.bottom + 4;

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
          backgroundColor: "#fff", border: "1.5px solid #3B82F6",
          borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          padding: 10, display: "flex", flexDirection: "column", gap: 8,
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
                  padding: "3px 8px", borderRadius: 5, border: active ? "1.5px solid transparent" : "1px solid #E5E7EB",
                  backgroundColor: active ? s(opt.type).bg : "#F9FAFB",
                  color: active ? s(opt.type).color : "#374151",
                  fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: active ? 700 : 400,
                  cursor: "pointer", outline: "none",
                  boxShadow: active ? "0 0 0 2px #3B82F6" : "none",
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
              <span style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", fontFamily: "var(--font-mono)", fontSize: 12, color: "#6B7280", pointerEvents: "none" }}>$</span>
              <input
                ref={amountRef}
                type="number"
                min={0}
                placeholder="Amount"
                value={edit.amount}
                onChange={(e) => onAmount(e.target.value)}
                style={{ width: "100%", paddingLeft: 20, paddingRight: 8, height: 30, borderRadius: 6, border: "1px solid #D1D5DB", fontFamily: "var(--font-mono)", fontSize: 13, color: "#111827", outline: "none", boxSizing: "border-box" }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "#3B82F6"; }}
                onBlur={(e)  => { e.currentTarget.style.borderColor = "#D1D5DB"; }}
              />
            </div>
            <LoadIdSelect
              value={edit.loadId}
              driverId={edit.driverId}
              onSelect={(id, payout) => { onLoadId(id); onAmount(payout); }}
            />
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
          <button
            onMouseDown={(e) => { e.preventDefault(); onCancel(); }}
            style={{ padding: "4px 12px", borderRadius: 5, border: "1px solid #E5E7EB", backgroundColor: "#F9FAFB", fontFamily: "var(--font-sans)", fontSize: 12, color: "#6B7280", cursor: "pointer", outline: "none" }}
          >
            Cancel
          </button>
          <button
            onMouseDown={(e) => { e.preventDefault(); onSave(); }}
            style={{ padding: "4px 12px", borderRadius: 5, border: "none", backgroundColor: "#3B82F6", fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, color: "#fff", cursor: "pointer", outline: "none" }}
          >
            Save
          </button>
        </div>

        <div style={{ fontFamily: "var(--font-sans)", fontSize: 10, color: "#9CA3AF", textAlign: "right" }}>
          Enter to save · Esc to cancel
        </div>
      </div>
    </>,
    document.body
  );
}


// ─── Inline number editor (Target / Co.Profit) ────────────────────────────────

function InlineNumberEdit({ value, onSave, prefix = "$", allowNeg = false }: {
  value: number | undefined;
  onSave: (v: number | undefined) => void;
  prefix?: string;
  allowNeg?: boolean;
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
    onSave(isNaN(n as number) ? undefined : n);
    setEditing(false);
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Enter")  { e.preventDefault(); commit(); }
    if (e.key === "Escape") { setEditing(false); }
  }

  if (editing) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "#6B7280" }}>{prefix}</span>
        <input
          ref={inputRef}
          type="number"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={handleKey}
          style={{ width: 72, height: 24, padding: "0 4px", borderRadius: 4, border: "1.5px solid #3B82F6", fontFamily: "var(--font-mono)", fontSize: 12, color: "#111827", outline: "none", textAlign: "right" }}
        />
      </div>
    );
  }

  return (
    <div
      onClick={open}
      title="Click to edit"
      style={{ cursor: "text", display: "inline-flex", alignItems: "center", gap: 2, borderRadius: 4, padding: "1px 3px", transition: "background 0.1s" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "rgba(59,130,246,0.08)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
    >
      {value !== undefined ? (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>
          {allowNeg && value < 0 ? `-$${Math.abs(value).toLocaleString()}` : fmt(value)}
        </span>
      ) : (
        <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "#9CA3AF" }}>—</span>
      )}
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
    border: "1px solid #E5E7EB", borderRadius: 7, backgroundColor: "#F9FAFB",
    color: "#374151", fontSize: 15, cursor: "pointer", lineHeight: 1, flexShrink: 0,
  };
  const hdrBtn: React.CSSProperties = {
    fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 700, color: "#111827",
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
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#F3F4F6"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}>
            {MONTH_NAMES_FULL[dispMonth]} {dispYear}
          </button>
          <button style={navBtn} onMouseDown={(e) => { e.preventDefault(); nextM(); }}>›</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", marginBottom: 3 }}>
          {DAY_ABBR.map((d) => (
            <div key={d} style={{ textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 10, fontWeight: 600, color: "#9CA3AF", padding: "0 0 4px", letterSpacing: "0.04em" }}>{d}</div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
          {cells.map(({ iso, inMonth }) => {
            const isS   = iso === rs;
            const isE   = iso === re && re !== rs;
            const inRng = iso > rs && iso < re;
            const d     = Number(iso.slice(8));
            let bg = "transparent", color = inMonth ? "#374151" : "#D1D5DB", br = "6px", fw: number | string = 400;
            if (inRng) { bg = "#DBEAFE"; color = "#1D4ED8"; br = "0"; }
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
          <div style={{ marginTop: 8, fontFamily: "var(--font-sans)", fontSize: 10, color: "#9CA3AF", textAlign: "center" }}>
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
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#F3F4F6"; }}
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
                style={{ padding: "9px 0", borderRadius: 7, border: "none", fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: active ? 700 : 400, backgroundColor: active ? "#3B82F6" : "#F3F4F6", color: active ? "#fff" : "#374151", cursor: "pointer" }}
                onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#E5E7EB"; }}
                onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#F3F4F6"; }}>
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
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 700, color: "#111827" }}>{base} – {base + 11}</span>
          <button style={navBtn} onMouseDown={(e) => { e.preventDefault(); setDispYear(y => y + 12); }}>›</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 5 }}>
          {years.map((y) => {
            const active = y === dispYear;
            return (
              <button key={y}
                onMouseDown={(e) => { e.preventDefault(); setDispYear(y); setView("months"); }}
                style={{ padding: "9px 0", borderRadius: 7, border: "none", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: active ? 700 : 400, backgroundColor: active ? "#3B82F6" : "#F3F4F6", color: active ? "#fff" : "#374151", cursor: "pointer" }}
                onMouseEnter={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#E5E7EB"; }}
                onMouseLeave={(e) => { if (!active) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "#F3F4F6"; }}>
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
            width: PANEL_W, backgroundColor: "#fff",
            border: "1.5px solid #3B82F6", borderRadius: 12,
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

  const [weekStartDay, setWeekStartDay] = useState(getWeekStartDay);
  const initialRange = getWeekRange(weekStartDay);

  const [rows,     setRows]     = useState<DriverRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState("");
  const [dateFrom, setDateFrom] = useState(fmtD(initialRange.from));
  const [dateTo,   setDateTo]   = useState(fmtD(initialRange.to));

  // Re-snap to current week whenever the user changes the week setting
  useEffect(() => {
    const handler = () => {
      const newStart = getWeekStartDay();
      setWeekStartDay(newStart);
      const range = getWeekRange(newStart);
      setDateFrom(fmtD(range.from));
      setDateTo(fmtD(range.to));
    };
    window.addEventListener("week-settings-changed", handler);
    return () => window.removeEventListener("week-settings-changed", handler);
  }, []);

  // Fetch gross data from backend
  useEffect(() => {
    if (!dateFrom || !dateTo) return;
    setLoading(true);
    api.get<any>(`/gross?from=${dateFrom}&to=${dateTo}${search ? `&q=${encodeURIComponent(search)}` : ""}`)
      .then((data) => {
        const items: BackendDriverRow[] = data?.drivers ?? [];
        const mapped = items.map(toDriverRow);
        // update miles lookup from fresh load data
        grossMilesMapRef.clear();
        for (const row of mapped) {
          for (const cell of Object.values(row.dateMap)) {
            if (cell.type === "load" && cell.loadId && cell.amount) {
              grossMilesMapRef.set(cell.loadId, grossMilesMapRef.get(cell.loadId) ?? 0);
            }
          }
        }
        setRows(mapped);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [dateFrom, dateTo, search]);

  function shiftWeek(dir: -1 | 1) {
    const d = new Date(dateFrom + "T00:00:00");
    // Snap to the configured week start day first, then shift by 7
    const dow    = d.getDay();
    const offset = ((dow - weekStartDay + 7) % 7);
    d.setDate(d.getDate() - offset + dir * 7);
    setDateFrom(fmtD(d));
    d.setDate(d.getDate() + 6);
    setDateTo(fmtD(d));
  }

  // Cell editing
  const [editState, setEditState] = useState<EditState | null>(null);

  function openCellEdit(driverId: string, date: string, cell: DayCell, e: React.MouseEvent) {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setEditState({ driverId, date, rect, type: cell.type, amount: cell.amount !== undefined ? String(cell.amount) : "", loadId: cell.loadId ?? "" });
  }

  function commitCellEdit() {
    if (!editState) return;
    const newCell: DayCell = editState.type === "load"
      ? { type: "load", amount: editState.amount ? Number(editState.amount) : undefined, loadId: editState.loadId || undefined }
      : { type: editState.type };
    // optimistic update
    setRows((prev) => prev.map((d) => d.id === editState.driverId
      ? { ...d, dateMap: { ...d.dateMap, [editState.date]: newCell } }
      : d
    ));
    api.patch("/gross", {
      driver_id: editState.driverId,
      date:      editState.date,
      type:      editState.type,
      amount:    newCell.type === "load" ? newCell.amount : undefined,
      load_id:   newCell.type === "load" ? newCell.loadId : undefined,
    }).catch(() => {});
    setEditState(null);
  }

  function cancelCellEdit() { setEditState(null); }

  // Row-level field saves
  function saveTarget(driverId: string, value: number | undefined) {
    setRows((prev) => prev.map((d) => d.id === driverId ? { ...d, weeklyTarget: value } : d));
    api.patch("/gross", { driver_id: driverId, weekly_target: value ?? null }).catch(() => {});
  }
  function saveProfit(driverId: string, value: number | undefined) {
    setRows((prev) => prev.map((d) => d.id === driverId ? { ...d, companyProfit: value ?? 0 } : d));
    api.patch("/gross", { driver_id: driverId, company_profit: value ?? 0 }).catch(() => {});
  }

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

  const grandTotal  = filtered.reduce((s, d) => s + rangeTotal(d), 0);
  const grandProfit = filtered.reduce((s, d) => s + d.companyProfit, 0);
  const rangeDays   = dates.length;


  const R = { total: 240, target: 120, profit: 0 };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "var(--background)", overflow: "hidden" }}>
      {editState && (
        <CellEditPanel
          edit={editState}
          onType={(t) => setEditState((s) => s ? { ...s, type: t, amount: t === "load" ? s.amount : "", loadId: t === "load" ? s.loadId : "" } : s)}
          onAmount={(v) => setEditState((s) => s ? { ...s, amount: v } : s)}
          onLoadId={(v) => setEditState((s) => s ? { ...s, loadId: v } : s)}
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
              onChange={(f, t) => { setDateFrom(f); setDateTo(t); }}
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
            ) : (
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
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={2 + dates.length + 3} style={{ padding: "48px 20px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>
                        No drivers match your search.
                      </td>
                    </tr>
                  ) : filtered.map((driver, i) => {
                    const isEven   = i % 2 === 0;
                    const rowBg    = isEven ? "#ffffff" : "#F9FAFB";
                    const total    = rangeTotal(driver);
                    const driverMiles = dates.reduce((s, iso) => {
                      const cell = driver.dateMap[iso];
                      return s + (cell?.type === "load" && cell.loadId ? getLoadMiles(cell.loadId) : 0);
                    }, 0);
                    const driverRpm = driverMiles > 0 && total > 0 ? total / driverMiles : null;
                    const targetPct = driver.weeklyTarget ? Math.min(100, Math.round((total / driver.weeklyTarget) * 100)) : null;
                    const barColor  = targetPct === null ? "#3B82F6" : targetPct >= 100 ? "#10B981" : targetPct >= 70 ? "#F59E0B" : "#3B82F6";

                    return (
                      <tr key={driver.id}>
                        {/* Driver Name */}
                        <td style={{ width: 200, minWidth: 200, padding: "0 12px", verticalAlign: "middle", borderRight: "1px solid #E5E7EB", borderBottom: "1px solid #E5E7EB", backgroundColor: rowBg, position: "sticky", left: 0, zIndex: 10 }}>
                          <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, color: "#111827", whiteSpace: "nowrap" }}>{driver.name}</div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#6B7280" }}>({driver.driverType})</div>
                        </td>
                        {/* Unit */}
                        <td style={{ width: 72, minWidth: 72, padding: "0 8px", textAlign: "center", verticalAlign: "middle", borderRight: "2px solid #CBD5E1", borderBottom: "1px solid #E5E7EB", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500, color: "#374151", backgroundColor: rowBg, position: "sticky", left: 200, zIndex: 10 }}>
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
                                borderRight: isBg ? "1px solid rgba(255,255,255,0.15)" : "1px solid #E5E7EB",
                                borderBottom: "1px solid #E5E7EB",
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
                        <td style={{ width: 110, minWidth: 110, padding: "0 12px", textAlign: "right", verticalAlign: "middle", borderLeft: "2px solid #CBD5E1", borderBottom: "1px solid #E5E7EB", backgroundColor: isEven ? "#EFF6FF" : "#DBEAFE", position: "sticky", right: R.total, zIndex: 10 }}>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: "#1D4ED8", whiteSpace: "nowrap" }}>{fmt(total)}</div>
                          {driverRpm !== null && (
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#10B981", marginTop: 2, whiteSpace: "nowrap" }}>
                              ${driverRpm.toFixed(2)}/mi
                            </div>
                          )}
                        </td>

                        {/* Target — inline editable */}
                        <td style={{ width: 120, minWidth: 120, padding: "6px 12px", verticalAlign: "middle", borderLeft: "1px solid #E5E7EB", borderBottom: "1px solid #E5E7EB", backgroundColor: isEven ? "#FAFAFA" : "#F3F4F6", position: "sticky", right: R.target, zIndex: 10 }}>
                          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                              <InlineNumberEdit
                                value={driver.weeklyTarget}
                                onSave={(v) => saveTarget(driver.id, v)}
                              />
                              {targetPct !== null && (
                                <span style={{ fontFamily: "var(--font-sans)", fontSize: 10, color: targetPct >= 100 ? "#15803D" : "#6B7280", fontWeight: 600 }}>{targetPct}%</span>
                              )}
                            </div>
                            {driver.weeklyTarget && (
                              <div style={{ height: 4, borderRadius: 99, backgroundColor: "#E5E7EB", overflow: "hidden" }}>
                                <div style={{ height: "100%", borderRadius: 99, width: `${targetPct}%`, backgroundColor: barColor, transition: "width 0.3s ease" }} />
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Co. Profit — inline editable */}
                        <td style={{ width: 120, minWidth: 120, padding: "0 12px", textAlign: "right", verticalAlign: "middle", borderLeft: "1px solid #E5E7EB", borderBottom: "1px solid #E5E7EB", borderRight: "none", backgroundColor: driver.companyProfit >= 0 ? (isEven ? "#F0FDF4" : "#DCFCE7") : (isEven ? "#FFF1F2" : "#FFE4E6"), position: "sticky", right: R.profit, zIndex: 10 }}>
                          <div style={{ display: "flex", justifyContent: "flex-end" }}>
                            <InlineNumberEdit
                              value={driver.companyProfit}
                              onSave={(v) => saveProfit(driver.id, v)}
                              allowNeg
                            />
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
                      const dayTotal = filtered.reduce((sum, dr) => {
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
                      {fmt(grandTotal)}
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "center", verticalAlign: "middle", borderTop: "2px solid #334155", borderLeft: "1px solid #334155", fontFamily: "var(--font-mono)", fontSize: 11, color: "#475569", position: "sticky", right: R.target, zIndex: 16, backgroundColor: "#0F172A" }}>—</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", verticalAlign: "middle", borderTop: "2px solid #334155", borderLeft: "1px solid #334155", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 700, color: grandProfit >= 0 ? "#34D399" : "#F87171", position: "sticky", right: R.profit, zIndex: 16, backgroundColor: "#0F172A" }}>
                      {grandProfit >= 0 ? fmt(grandProfit) : `-$${Math.abs(grandProfit).toLocaleString()}`}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>

        </div>
      </div>
    </div>
  );
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
