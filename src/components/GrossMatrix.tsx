import { useState, useMemo, useEffect, useRef } from "react";
import { Search, Calendar, ChevronLeft, ChevronRight, Check, ChevronDown } from "lucide-react";
import { createPortal } from "react-dom";
import { Status, STATUS_CONFIG, ALL_STATUSES } from "../lib/statuses";

type CellType = Status | "load" | "empty";

interface DayCell {
  type: CellType;
  amount?: number;
  loadId?: string;
}

interface DriverRow {
  id: number;
  name: string;
  driverType: "O/O" | "C/D";
  unit: string;
  dateMap: Record<string, DayCell>;
  weeklyTarget?: number;
  companyProfit: number;
}

// ─── Seed helpers ─────────────────────────────────────────────────────────────

function mkLoad(amount: number, loadId: string): DayCell { return { type: "load", amount, loadId }; }
const enroute: DayCell = { type: "enroute" };
const home: DayCell    = { type: "home" };
const rest: DayCell    = { type: "rest" };
const nd: DayCell      = { type: "ready" };

function toDateMap(weekStart: string, days: DayCell[]): Record<string, DayCell> {
  const map: Record<string, DayCell> = {};
  const base = new Date(weekStart + "T00:00:00");
  days.forEach((cell, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    map[d.toISOString().split("T")[0]] = cell;
  });
  return map;
}

const W = "2026-06-09";

const INITIAL_DRIVERS: DriverRow[] = [
  { id: 1,  name: "Carlos Mendez",        driverType: "C/D", unit: "001", weeklyTarget: 4000,  companyProfit: -4500, dateMap: toDateMap(W, [mkLoad(1250,"57760165"), mkLoad(1250,"57760191"), home, home, home, home, home]) },
  { id: 2,  name: "Angela Torres",         driverType: "C/D", unit: "002", weeklyTarget: 3500,  companyProfit: -7000, dateMap: toDateMap(W, [nd, nd, nd, nd, nd, nd, nd]) },
  { id: 3,  name: "Darnell Washington",    driverType: "O/O", unit: "003", weeklyTarget: 4000,  companyProfit: -5650, dateMap: toDateMap(W, [mkLoad(550,"4332979"), mkLoad(800,"4367209"), home, home, home, home, home]) },
  { id: 4,  name: "Priya Sharma",          driverType: "C/D", unit: "004", weeklyTarget: 4500,  companyProfit: -7000, dateMap: toDateMap(W, [nd, nd, nd, nd, nd, nd, nd]) },
  { id: 5,  name: "Marcus Webb",           driverType: "O/O", unit: "100", weeklyTarget: 9000,  companyProfit:  3000, dateMap: toDateMap(W, [rest, enroute, mkLoad(3500,"126185/5777218"), mkLoad(1000,"35101523"), mkLoad(2500,"35241535"), mkLoad(1500,"127218503"), mkLoad(1500,"QUICKFREIGHT")]) },
  { id: 6,  name: "Linda Okafor",          driverType: "C/D", unit: "101",                      companyProfit: -7000, dateMap: toDateMap(W, [home, home, home, home, home, home, home]) },
  { id: 7,  name: "Ray Kowalski",          driverType: "O/O", unit: "102", weeklyTarget: 4500,  companyProfit: -6100, dateMap: toDateMap(W, [mkLoad(900,"G064863703"), home, home, home, home, home, home]) },
  { id: 8,  name: "Tomás García",          driverType: "C/D", unit: "103", weeklyTarget: 8000,  companyProfit:  2550, dateMap: toDateMap(W, [enroute, mkLoad(1550,"35132250"), mkLoad(2000,"35189864"), mkLoad(1450,"0245461"), mkLoad(1450,"0245328"), mkLoad(1550,"142896"), mkLoad(1550,"142901")]) },
  { id: 9,  name: "Jean Eddy Simon",       driverType: "C/D", unit: "104", weeklyTarget: 8000,  companyProfit:  2315, dateMap: toDateMap(W, [mkLoad(1250,"57760155"), mkLoad(2000,"0118551"), mkLoad(1250,"57760203"), mkLoad(565,"127197643"), mkLoad(1250,"57760228"), mkLoad(1500,"T01359997"), mkLoad(1500,"QUICKFREIGHT")]) },
  { id: 10, name: "Jean Wesly Herard",     driverType: "O/O", unit: "105", weeklyTarget: 7000,  companyProfit:   750, dateMap: toDateMap(W, [mkLoad(1250,"57760157"), mkLoad(1250,"57760175"), mkLoad(1250,"57760173"), mkLoad(1250,"57760177"), mkLoad(1250,"57760233"), mkLoad(1500,"T01358372"), { type: "empty" }]) },
  { id: 11, name: "Keavis Dyer",           driverType: "C/D", unit: "701", weeklyTarget: 8000,  companyProfit:  1250, dateMap: toDateMap(W, [enroute, mkLoad(1450,"127120603"), mkLoad(750,"4338260"), mkLoad(1250,"57760202"), mkLoad(1800,"T01356218"), enroute, mkLoad(1500,"57790748")]) },
  { id: 12, name: "James Alan Schwein",    driverType: "C/D", unit: "702",                      companyProfit: -7000, dateMap: toDateMap(W, [home, home, home, home, home, home, home]) },
  { id: 13, name: "Shokhnurbek Komilov",   driverType: "O/O", unit: "104", weeklyTarget: 7000,  companyProfit:  -150, dateMap: toDateMap(W, [rest, mkLoad(1250,"57760154"), mkLoad(1250,"57760151"), mkLoad(1250,"57760172"), { type: "load", amount: undefined, loadId: "?" }, mkLoad(1200,"57760179/577601"), mkLoad(1900,"35243285")]) },
  { id: 14, name: "Umarkhon Kholmirzaev",  driverType: "C/D", unit: "465", weeklyTarget: 7000,  companyProfit:   365, dateMap: toDateMap(W, [mkLoad(550,"4332793"), mkLoad(3200,"127129288"), mkLoad(825,"4349224"), mkLoad(1000,"374553/437455"), mkLoad(1040,"4375926/4359065"), mkLoad(1250,"57760207"), { type: "empty" }]) },
  { id: 15, name: "Bakhodir Azamov",       driverType: "O/O", unit: "10",  weeklyTarget: 7500,  companyProfit:   500, dateMap: toDateMap(W, [mkLoad(1250,"57760149"), mkLoad(1250,"57760170"), mkLoad(1250,"57760194"), mkLoad(1250,"57760198"), mkLoad(1250,"57760174"), mkLoad(1250,"57760213"), { type: "empty" }]) },
];

// ─── Date utilities ───────────────────────────────────────────────────────────

function getDatesInRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const end = new Date(to + "T00:00:00");
  const cur = new Date(from + "T00:00:00");
  while (cur <= end) {
    dates.push(cur.toISOString().split("T")[0]);
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

// ─── Cell edit panel (portal) ─────────────────────────────────────────────────

interface EditState {
  driverId: number;
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
            <input
              type="text"
              placeholder="Load ID"
              value={edit.loadId}
              onChange={(e) => onLoadId(e.target.value)}
              style={{ width: "100%", padding: "0 8px", height: 30, borderRadius: 6, border: "1px solid #D1D5DB", fontFamily: "var(--font-mono)", fontSize: 12, color: "#374151", outline: "none", boxSizing: "border-box" }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "#3B82F6"; }}
              onBlur={(e)  => { e.currentTarget.style.borderColor = "#D1D5DB"; }}
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

// ─── Mini select (rows per page) ──────────────────────────────────────────────

const PAGE_SIZES = [10, 20, 40, 100];

function MiniSelect({ value, options, onChange }: {
  value: string; options: { value: string; label: string }[]; onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 6, height: 30, padding: "0 8px 0 10px", fontFamily: "var(--font-sans)", fontSize: 12, backgroundColor: "var(--input-background)", border: `1px solid ${open ? "var(--primary)" : "var(--border)"}`, borderRadius: 6, color: "var(--foreground)", cursor: "pointer", boxShadow: open ? "0 0 0 3px rgba(59,130,246,0.12)" : "none", outline: "none" }}>
        {selected?.label}
        <ChevronDown size={12} style={{ color: "var(--muted-foreground)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>
      {open && (
        <div onMouseLeave={() => setOpen(false)} style={{ position: "absolute", bottom: "calc(100% + 4px)", left: 0, minWidth: "100%", backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 7, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 9999, overflow: "hidden" }}>
          {options.map((opt) => {
            const isActive = opt.value === value;
            return (
              <button key={opt.value} onClick={() => { onChange(opt.value); setOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "6px 10px", border: "none", backgroundColor: isActive ? "rgba(59,130,246,0.06)" : "transparent", fontFamily: "var(--font-sans)", fontSize: 12, color: isActive ? "var(--primary)" : "var(--foreground)", cursor: "pointer", textAlign: "left" }}>
                <span style={{ flex: 1 }}>{opt.label}</span>
                {isActive && <Check size={11} style={{ color: "var(--primary)" }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Pagination ───────────────────────────────────────────────────────────────

function PaginationBar({ total, page, pageSize, onPage, onPageSize }: {
  total: number; page: number; pageSize: number;
  onPage: (p: number) => void; onPageSize: (s: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to   = Math.min(page * pageSize, total);

  const pages: (number | "…")[] = [];
  if (totalPages <= 7) { for (let i = 1; i <= totalPages; i++) pages.push(i); }
  else {
    pages.push(1);
    if (page > 3) pages.push("…");
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push("…");
    pages.push(totalPages);
  }

  const PBtn = ({ children, active = false, disabled = false, onClick }: { children: React.ReactNode; active?: boolean; disabled?: boolean; onClick: () => void }) => (
    <button onClick={onClick} disabled={disabled} style={{ minWidth: 30, height: 30, borderRadius: 6, padding: "0 6px", border: active ? "1.5px solid var(--primary)" : "1px solid var(--border)", backgroundColor: active ? "var(--primary)" : "transparent", color: active ? "#fff" : disabled ? "var(--muted-foreground)" : "var(--foreground)", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: active ? 600 : 400, cursor: disabled ? "default" : "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", opacity: disabled ? 0.38 : 1, outline: "none" }}>{children}</button>
  );

  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 16px", borderTop: "1px solid var(--border)", backgroundColor: "var(--card)", flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>{total === 0 ? "No results" : `Showing ${from}–${to} of ${total}`}</span>
        <span style={{ color: "var(--border)", userSelect: "none" }}>·</span>
        <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>Rows per page</span>
        <MiniSelect value={String(pageSize)} options={PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))} onChange={(v) => { onPageSize(Number(v)); onPage(1); }} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        <PBtn disabled={page === 1} onClick={() => onPage(page - 1)}><ChevronLeft size={14} /></PBtn>
        {pages.map((p, i) => p === "…"
          ? <span key={`e${i}`} style={{ minWidth: 30, textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>…</span>
          : <PBtn key={p} active={p === page} onClick={() => onPage(p as number)}>{p}</PBtn>
        )}
        <PBtn disabled={page === totalPages} onClick={() => onPage(page + 1)}><ChevronRight size={14} /></PBtn>
      </div>
    </div>
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

// ─── Date input style ─────────────────────────────────────────────────────────

const dateInputStyle: React.CSSProperties = {
  fontFamily: "var(--font-sans)", fontSize: 13,
  padding: "5px 10px", height: 32, borderRadius: 6,
  border: "1px solid var(--border)", backgroundColor: "var(--input-background)",
  color: "var(--foreground)", outline: "none", cursor: "pointer",
};

// ─── Main component ───────────────────────────────────────────────────────────

export function GrossMatrix() {
  const [rows,     setRows]     = useState<DriverRow[]>(INITIAL_DRIVERS);
  const [search,   setSearch]   = useState("");
  const [dateFrom, setDateFrom] = useState("2026-06-09");
  const [dateTo,   setDateTo]   = useState("2026-06-15");
  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Cell editing
  const [editState, setEditState] = useState<EditState | null>(null);

  function openCellEdit(driverId: number, date: string, cell: DayCell, e: React.MouseEvent) {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setEditState({ driverId, date, rect, type: cell.type, amount: cell.amount !== undefined ? String(cell.amount) : "", loadId: cell.loadId ?? "" });
  }

  function commitCellEdit() {
    if (!editState) return;
    const newCell: DayCell = editState.type === "load"
      ? { type: "load", amount: editState.amount ? Number(editState.amount) : undefined, loadId: editState.loadId || undefined }
      : { type: editState.type };
    setRows((prev) => prev.map((d) => d.id === editState.driverId
      ? { ...d, dateMap: { ...d.dateMap, [editState.date]: newCell } }
      : d
    ));
    setEditState(null);
  }

  function cancelCellEdit() { setEditState(null); }

  // Row-level field saves
  function saveTarget(driverId: number, value: number | undefined) {
    setRows((prev) => prev.map((d) => d.id === driverId ? { ...d, weeklyTarget: value } : d));
  }
  function saveProfit(driverId: number, value: number | undefined) {
    setRows((prev) => prev.map((d) => d.id === driverId ? { ...d, companyProfit: value ?? 0 } : d));
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

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage   = Math.min(page, totalPages);
  const paged      = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  function rangeTotal(driver: DriverRow) {
    return dates.reduce((s, iso) => {
      const cell = driver.dateMap[iso];
      return s + (cell?.type === "load" && cell.amount ? cell.amount : 0);
    }, 0);
  }

  const grandTotal  = paged.reduce((s, d) => s + rangeTotal(d), 0);
  const grandProfit = paged.reduce((s, d) => s + d.companyProfit, 0);
  const rangeDays   = dates.length;
  const formatDate  = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

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
              <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search drivers…"
                style={{ fontFamily: "var(--font-sans)", fontSize: 13, padding: "5px 10px 5px 28px", height: 32, width: 200, borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "var(--input-background)", color: "var(--foreground)", outline: "none" }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.boxShadow = "0 0 0 3px rgba(59,130,246,0.12)"; }}
                onBlur={(e)  => { e.currentTarget.style.borderColor = "var(--border)";  e.currentTarget.style.boxShadow = "none"; }}
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <Calendar size={14} style={{ color: "var(--muted-foreground)" }} />
              <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} style={dateInputStyle}
                onFocus={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; }}
                onBlur={(e)  => { e.currentTarget.style.borderColor = "var(--border)"; }}
              />
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>–</span>
              <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} style={dateInputStyle}
                onFocus={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; }}
                onBlur={(e)  => { e.currentTarget.style.borderColor = "var(--border)"; }}
              />
            </div>
            {dateFrom && dateTo && dateFrom <= dateTo && (
              <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", flexShrink: 0, whiteSpace: "nowrap" }}>
                {formatDate(dateFrom)} – {formatDate(dateTo)}
              </span>
            )}
          </div>

          {/* Table */}
          <div style={{ flex: 1, overflow: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent" }}>
            {dates.length === 0 ? (
              <div style={{ padding: "60px 20px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>
                Select a valid date range to display data.
              </div>
            ) : (
              <table style={{ borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed", minWidth: "100%" }}>
                <thead>
                  <tr style={{ position: "sticky", top: 0, zIndex: 20, backgroundColor: "#0F172A" }}>
                    <th style={thLeft({ width: 36,  left: 0   })}>#</th>
                    <th style={thLeft({ width: 200, left: 36,  textAlign: "left" })}>Driver Name</th>
                    <th style={thLeft({ width: 72,  left: 236, borderRight: "2px solid #334155" })}>Unit</th>
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
                  {paged.length === 0 ? (
                    <tr>
                      <td colSpan={3 + dates.length + 3} style={{ padding: "48px 20px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>
                        No drivers match your search.
                      </td>
                    </tr>
                  ) : paged.map((driver, i) => {
                    const isEven   = i % 2 === 0;
                    const rowBg    = isEven ? "#ffffff" : "#F9FAFB";
                    const total    = rangeTotal(driver);
                    const targetPct = driver.weeklyTarget ? Math.min(100, Math.round((total / driver.weeklyTarget) * 100)) : null;
                    const barColor  = targetPct === null ? "#3B82F6" : targetPct >= 100 ? "#10B981" : targetPct >= 70 ? "#F59E0B" : "#3B82F6";

                    return (
                      <tr key={driver.id}>
                        {/* # */}
                        <td style={{ width: 36, minWidth: 36, padding: "0 8px", textAlign: "center", verticalAlign: "middle", borderRight: "1px solid #E5E7EB", borderBottom: "1px solid #E5E7EB", fontFamily: "var(--font-mono)", fontSize: 11, color: "#9CA3AF", backgroundColor: rowBg, position: "sticky", left: 0, zIndex: 10, height: 46 }}>
                          {driver.id}
                        </td>
                        {/* Driver Name */}
                        <td style={{ width: 200, minWidth: 200, padding: "0 12px", verticalAlign: "middle", borderRight: "1px solid #E5E7EB", borderBottom: "1px solid #E5E7EB", backgroundColor: rowBg, position: "sticky", left: 36, zIndex: 10 }}>
                          <div style={{ fontFamily: "var(--font-sans)", fontSize: 12, fontWeight: 600, color: "#111827", whiteSpace: "nowrap" }}>{driver.name}</div>
                          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#6B7280" }}>({driver.driverType})</div>
                        </td>
                        {/* Unit */}
                        <td style={{ width: 72, minWidth: 72, padding: "0 8px", textAlign: "center", verticalAlign: "middle", borderRight: "2px solid #CBD5E1", borderBottom: "1px solid #E5E7EB", fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 500, color: "#374151", backgroundColor: rowBg, position: "sticky", left: 236, zIndex: 10 }}>
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
                    <td colSpan={3} style={{ padding: "8px 12px", textAlign: "left", borderTop: "2px solid #334155", fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 700, color: "#CBD5E1", letterSpacing: "0.06em", textTransform: "uppercase", position: "sticky", left: 0, zIndex: 16, backgroundColor: "#0F172A" }}>
                      Totals
                    </td>
                    {dates.map((iso) => {
                      const dayTotal = paged.reduce((sum, dr) => {
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

          <PaginationBar total={filtered.length} page={safePage} pageSize={pageSize} onPage={setPage} onPageSize={setPageSize} />
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
