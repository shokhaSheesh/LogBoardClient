import { useState, useMemo, useEffect, useRef } from "react";
import { Search, Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, AlertCircle, X, Users, Rows3, CircleDollarSign, Wallet, TrendingUp, Gauge } from "lucide-react";
import { createPortal } from "react-dom";
import { Status, STATUS_CONFIG, ALL_STATUSES } from "../lib/statuses";
import { api, getCompanyId } from "../lib/api";
import { PageLoader } from "./PageLoader";
import { friendlyError, notify } from "./feedback";
import { driverDisplayName } from "../lib/driverName";
import { useAuth } from "../lib/auth";
import { hasPerm } from "../lib/permissions";
import { useTheme } from "../lib/theme";
import { Dash } from "./Dash";
import { Kpi } from "./Kpi";
import { DateRangePicker } from "./DateRangePicker";
import { fmtDate, fmtDateRange } from "../lib/dates";

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
  driverPay?: number; // what the DRIVER earns this window; reported by the backend, undefined until it sends it
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
  driver_pay?: number; // what the driver earns this window (rpm×miles or %×gross); reported, never nets off revenue
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
    driverPay:     b.driver_pay,
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

const DAY_W = 104;

// ─── Day cell display ─────────────────────────────────────────────────────────

// A status day is a soft chip — the status colour as a tint behind darker text of the same
// hue — instead of a full-bleed colour block, so a week of statuses doesn't drown out the
// money. The hue still comes straight from STATUS_CONFIG, so it matches the Board.
function chipColors(status: Status, dark: boolean): { bg: string; color: string } {
  const c = STATUS_CONFIG[status].bg;
  return dark
    ? { bg: `color-mix(in srgb, ${c} 24%, var(--card))`, color: `color-mix(in srgb, ${c} 55%, #fff)` }
    : { bg: `color-mix(in srgb, ${c} 15%, var(--card))`, color: `color-mix(in srgb, ${c} 72%, #000)` };
}

function StatusChip({ status, dark, block = false }: { status: Status; dark: boolean; block?: boolean }) {
  const c = chipColors(status, dark);
  return (
    <span style={{
      display: block ? "block" : "inline-block", textAlign: "center",
      fontFamily: "var(--font-sans)", fontSize: 11.5, fontWeight: 700, whiteSpace: "nowrap",
      padding: block ? "7px 0" : "3px 10px", borderRadius: 6,
      backgroundColor: c.bg, color: c.color,
    }}>
      {STATUS_CONFIG[status].label}
    </span>
  );
}

function DayCellContent({ cell, dark }: { cell: DayCell; dark: boolean }) {
  if (cell.type === "load") {
    return cell.amount !== undefined ? (
      <>
        <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 700, color: "var(--foreground)", lineHeight: 1.25, fontVariantNumeric: "tabular-nums" }}>{fmt(cell.amount)}</div>
        {/* Truncates within the cell instead of spilling; the full ref is in the tooltip. */}
        <div title={cell.loadId} style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)", lineHeight: 1.25, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%" }}>{cell.loadId}</div>
      </>
    ) : (
      <div title={cell.loadId} style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)" }}>{cell.loadId ?? <Dash />}</div>
    );
  }
  if (cell.type === "empty") return <span style={{ color: "var(--border)" }}>·</span>;
  return <StatusChip status={cell.type as Status} dark={dark} />;
}

// ─── Multi-select load ID picker ───────────────────────────────────────────────
// One cell can reference several of the driver's loads (a day with multiple
// completed loads). The backend's manual-override field is a single free-text
// string, so multiple picks are joined with "/" — the same joined-ref shape the
// backend sends for the automatic (system-tracked) multi-load case.

interface LoadOpt { id: string; payout: number; route: string; }

// "Dallas, TX → Atlanta, GA" from a load's first and last stop; "" when it has no usable stops.
function loadRoute(l: any): string {
  const stops: any[] = Array.isArray(l?.stops) ? l.stops : [];
  const place = (s: any) => [s?.city, s?.state].filter(Boolean).join(", ");
  if (stops.length < 2) return "";
  const from = place(stops[0]), to = place(stops[stops.length - 1]);
  return from && to ? `${from} → ${to}` : "";
}

// Closed, it is one field showing what's picked. Clicking it opens the list in place
// (search on top, results scrolling inside, more pages loading as you reach the bottom).
// Nothing is fetched until it is opened.
function LoadMultiSelect({ selected, driverId, onChange, open, onOpenChange }: {
  selected: string[];
  driverId: string;
  onChange: (ids: string[], sumPayout: number) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [items, setItems] = useState<LoadOpt[]>([]);
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
      const opts: LoadOpt[] = (rows ?? []).map((l: any) => ({ id: String(l.load_id ?? l.id), payout: l.payout ?? 0, route: loadRoute(l) }));
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

  const searchRef = useRef<HTMLInputElement>(null);

  // Fresh page-1 fetch when the list opens and whenever the (debounced) search changes.
  useEffect(() => {
    if (!open) return;
    setItems([]); setTotal(0); setPage(1);
    void loadPage(1, debouncedQuery, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, driverId, debouncedQuery]);

  useEffect(() => { if (open) searchRef.current?.focus(); }, [open]);

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
    <div>
      {/* The field */}
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => { onOpenChange(!open); setQuery(""); }}
        style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%", minHeight: 36, padding: "5px 10px",
          borderRadius: 8, border: `1px solid ${open ? "var(--primary)" : "var(--border)"}`,
          boxShadow: open ? "0 0 0 3px var(--primary-soft)" : "none",
          backgroundColor: "var(--card)", cursor: "pointer", textAlign: "left",
          transition: "border-color 0.15s, box-shadow 0.15s", outline: "none",
        }}
      >
        <span style={{ flex: 1, minWidth: 0, display: "flex", flexWrap: "wrap", gap: 4 }}>
          {selected.length === 0 ? (
            <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>Select loads…</span>
          ) : selected.map((id) => (
            <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 4, maxWidth: "100%", padding: "2px 5px 2px 8px", borderRadius: 5, backgroundColor: "var(--primary-soft)", fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--secondary-foreground)" }}>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{id}</span>
              {/* A span, not a button: this sits inside the field's own button. */}
              <span role="button" tabIndex={0} aria-label={`Remove ${id}`}
                onClick={(e) => { e.stopPropagation(); toggle(id); }}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); toggle(id); } }}
                style={{ display: "flex", cursor: "pointer", flexShrink: 0 }}>
                <X size={11} />
              </span>
            </span>
          ))}
        </span>
        <ChevronDown size={14} style={{ color: "var(--muted-foreground)", flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>

      {open && (<>
      <div style={{ position: "relative", display: "flex", alignItems: "center", margin: "6px 0" }}>
        <Search size={13} style={{ position: "absolute", left: 10, color: "var(--muted-foreground)", pointerEvents: "none" }} />
        <input
          ref={searchRef}
          type="text"
          placeholder="Search load…"
          aria-label="Search this driver's loads"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: "100%", paddingLeft: 30, paddingRight: 10, height: 34,
            borderRadius: 8, border: "1px solid var(--border)",
            fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--foreground)",
            backgroundColor: "var(--card)", outline: "none", boxSizing: "border-box",
          }}
          onKeyDown={(e) => {
            // Enter here picks a load (when the search has narrowed to one) — it must never
            // bubble up and save the whole cell. Escape clears the search first.
            if (e.key === "Enter") {
              e.preventDefault(); e.stopPropagation();
              if (items.length === 1) { toggle(items[0].id); setQuery(""); }
            }
            // Escape steps back one level at a time: clear the search, then close the list —
            // only an Escape with the list closed cancels the whole edit.
            if (e.key === "Escape") { e.stopPropagation(); if (query) setQuery(""); else onOpenChange(false); }
          }}
        />
      </div>

      {/* Inline, bounded list (scrolls internally, infinite-loads on scroll) — never
          an absolute dropdown that could run off the bottom of the screen. */}
      <div
        ref={listRef}
        onScroll={onScroll}
        style={{
          border: "1px solid var(--border)", borderRadius: 8, backgroundColor: "var(--card)",
          maxHeight: 200, overflowY: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent",
        }}
      >
        {items.map((load, i) => {
          const isSel = selected.includes(load.id);
          return (
            <button
              key={load.id}
              type="button"
              role="checkbox"
              aria-checked={isSel}
              onClick={() => toggle(load.id)}
              style={{
                display: "grid", gridTemplateColumns: "16px minmax(0, 1fr) auto", alignItems: "center", gap: 9,
                width: "100%", padding: "8px 11px", border: "none",
                borderTop: i === 0 ? "none" : "1px solid var(--border)",
                backgroundColor: isSel ? "var(--primary-soft)" : "transparent",
                cursor: "pointer", textAlign: "left",
              }}
              onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.backgroundColor = "var(--muted)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = isSel ? "var(--primary-soft)" : "transparent"; }}
            >
              <span style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${isSel ? "var(--primary)" : "var(--switch-background)"}`, backgroundColor: isSel ? "var(--primary)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {isSel && <Check size={11} color="#fff" strokeWidth={3} />}
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{load.id}</span>
                {load.route && <span style={{ display: "block", fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{load.route}</span>}
              </span>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600, color: "var(--foreground)" }}>${load.payout.toLocaleString()}</span>
            </button>
          );
        })}
        {loading && (
          <div style={{ padding: "10px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)" }}>Loading…</div>
        )}
        {!loading && items.length === 0 && (
          <div style={{ padding: "12px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)" }}>
            {query ? "No loads match that search" : "This driver has no loads yet"}
          </div>
        )}
      </div>
      </>)}
    </div>
  );
}

// ─── Cell edit panel (portal) ─────────────────────────────────────────────────

// What a day holds: money from loads, a status, or nothing.
type EditMode = "load" | "status" | "clear";

interface EditState {
  driverId: string;
  driverName: string;
  date: string;
  rect: DOMRect;
  mode: EditMode;
  status: Status | null; // the picked status (mode "status"); null until one is chosen
  amount: string;
  loadIds: string[]; // the day's selected loads — joined with "/" on save
}

const MODE_TABS: { mode: EditMode; label: string }[] = [
  { mode: "load", label: "Load" }, { mode: "status", label: "Status" }, { mode: "clear", label: "Clear" },
];

const editCap: React.CSSProperties = {
  fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600, letterSpacing: "0.06em",
  textTransform: "uppercase", color: "var(--muted-foreground)", marginBottom: 6,
};

function CellEditPanel({
  edit, dark, onMode, onStatus, onAmount, onLoadsChange, onSave, onCancel,
}: {
  edit: EditState;
  dark: boolean;
  onMode: (m: EditMode) => void;
  onStatus: (s: Status) => void;
  onAmount: (v: string) => void;
  onLoadsChange: (ids: string[], sumPayout: number) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [loadsOpen, setLoadsOpen] = useState(false);
  // Nothing to save in Status mode until a status is picked.
  const canSave = edit.mode !== "status" || edit.status !== null;

  // Take focus on open so Enter / Esc work straight away.
  useEffect(() => { panelRef.current?.focus(); }, []);

  // Position the panel so it always fits on screen: open below the cell when there's
  // room, otherwise flip above (whichever side has more space), and cap the height to
  // the space actually available at that top — the panel scrolls internally past that,
  // so the Save/Cancel row is always reachable no matter which row the cell is in.
  const PANEL_W = 328;
  const GAP = 6;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const left = Math.max(8, Math.min(edit.rect.left, vw - PANEL_W - 8));
  const desired    = edit.mode === "load" ? (loadsOpen ? 520 : 290) : edit.mode === "status" ? 360 : 190;
  const spaceBelow = vh - edit.rect.bottom - GAP;
  const spaceAbove = edit.rect.top - GAP;
  const openUp = spaceBelow < desired && spaceAbove > spaceBelow;
  // Opening upward anchors the panel's BOTTOM to the cell, so it hugs the cell whatever
  // its height turns out to be (it grows when the load list opens).
  const place: React.CSSProperties = openUp
    ? { bottom: vh - edit.rect.top + GAP, maxHeight: spaceAbove - 8 }
    : { top: edit.rect.bottom + GAP, maxHeight: spaceBelow - 8 };

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === "Escape") { e.preventDefault(); onCancel(); return; }
    // Enter saves from the panel or the amount field — but on a button (a tab, a status,
    // Cancel, the load field) it must do what that button does, not save the cell.
    if (e.key === "Enter" && !(e.target as HTMLElement).closest('button, [role="button"]')) {
      e.preventDefault();
      if (canSave) onSave();
    }
  }
  // Leaving Load mode closes its list, so coming back starts from the closed field.
  useEffect(() => { if (edit.mode !== "load") setLoadsOpen(false); }, [edit.mode]);

  const dayLabel = `${DAY_NAMES[new Date(edit.date + "T00:00:00").getDay()]} · ${fmtDate(edit.date)}`;

  return createPortal(
    <>
      {/* Invisible backdrop — a click outside DISCARDS the edit. It used to save, which
          turned every stray click into a change nobody meant to make. */}
      <div style={{ position: "fixed", inset: 0, zIndex: 9998 }} onMouseDown={onCancel} />
      <div
        ref={panelRef}
        role="dialog"
        aria-label={`Edit ${edit.driverName}, ${dayLabel}`}
        tabIndex={-1}
        onKeyDown={handleKey}
        style={{
          position: "fixed", ...place, left, zIndex: 9999, width: PANEL_W,
          backgroundColor: "var(--card)", border: "1px solid var(--border)",
          borderRadius: 12, boxShadow: "0 16px 40px rgba(0,0,0,0.22)",
          padding: 14, display: "flex", flexDirection: "column", gap: 12,
          overflowY: "auto", outline: "none",
        }}
      >
        {/* Who and when */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 14, fontWeight: 700, color: "var(--foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{edit.driverName}</span>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)", flexShrink: 0 }}>{dayLabel}</span>
        </div>

        {/* Mode */}
        <div role="tablist" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 3, padding: 3, borderRadius: 8, backgroundColor: "var(--muted)" }}>
          {MODE_TABS.map(({ mode, label }) => {
            const active = edit.mode === mode;
            return (
              <button key={mode} type="button" role="tab" aria-selected={active} onClick={() => onMode(mode)}
                style={{
                  padding: "6px 0", borderRadius: 6, border: "none", cursor: "pointer",
                  fontFamily: "var(--font-sans)", fontSize: 12.5, fontWeight: 600,
                  backgroundColor: active ? "var(--card)" : "transparent",
                  color: active ? "var(--foreground)" : "var(--muted-foreground)",
                  boxShadow: active ? "0 1px 2px rgba(0,0,0,0.12)" : "none",
                }}>
                {label}
              </button>
            );
          })}
        </div>

        {edit.mode === "load" && (
          <>
            <div>
              <div style={editCap}>Loads completed that day</div>
              <LoadMultiSelect selected={edit.loadIds} driverId={edit.driverId} onChange={onLoadsChange} open={loadsOpen} onOpenChange={setLoadsOpen} />
            </div>
            <div>
              <div style={editCap}>Amount</div>
              <div style={{ position: "relative" }}>
                <span style={{ position: "absolute", left: 11, top: "50%", transform: "translateY(-50%)", fontFamily: "var(--font-mono)", fontSize: 13, color: "var(--muted-foreground)", pointerEvents: "none" }}>$</span>
                <input
                  type="number"
                  min={0}
                  placeholder="0"
                  aria-label="Amount"
                  value={edit.amount}
                  onChange={(e) => onAmount(e.target.value)}
                  style={{ width: "100%", paddingLeft: 24, paddingRight: 10, height: 36, borderRadius: 8, border: "1px solid var(--border)", fontFamily: "var(--font-mono)", fontSize: 13, fontWeight: 600, color: "var(--foreground)", backgroundColor: "var(--card)", outline: "none", boxSizing: "border-box" }}
                  onFocus={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.boxShadow = "0 0 0 3px var(--primary-soft)"; }}
                  onBlur={(e)  => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.boxShadow = "none"; }}
                />
              </div>
              <div style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--muted-foreground)", marginTop: 5 }}>
                {edit.loadIds.length > 0
                  ? `Filled from the ${edit.loadIds.length === 1 ? "load" : `${edit.loadIds.length} loads`} you ticked — you can change it.`
                  : "Tick loads above to fill this in, or type an amount."}
              </div>
            </div>
          </>
        )}

        {edit.mode === "status" && (
          <div>
            <div style={editCap}>What the driver was doing</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
              {ALL_STATUSES.map((s) => {
                const active = edit.status === s;
                return (
                  <button key={s} type="button" aria-pressed={active} onClick={() => onStatus(s)}
                    style={{ padding: 0, border: "none", borderRadius: 6, background: "none", cursor: "pointer", boxShadow: active ? "0 0 0 2px var(--primary)" : "none" }}>
                    <StatusChip status={s} dark={dark} block />
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {edit.mode === "clear" && (
          <div style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)", lineHeight: 1.5 }}>
            Saving will empty this day: no load, no amount and no status.
          </div>
        )}

        {/* Actions — sticky to the panel bottom so they stay reachable if it scrolls */}
        <div style={{ position: "sticky", bottom: -14, backgroundColor: "var(--card)", paddingTop: 10, paddingBottom: 2, borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, color: "var(--muted-foreground)" }}>Enter saves · Esc cancels</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={onCancel}
              style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid var(--border)", backgroundColor: "var(--card)", fontFamily: "var(--font-sans)", fontSize: 12.5, fontWeight: 600, color: "var(--foreground)", cursor: "pointer" }}>
              Cancel
            </button>
            <button type="button" onClick={onSave} disabled={!canSave}
              style={{ padding: "7px 14px", borderRadius: 8, border: "none", backgroundColor: canSave ? "var(--primary)" : "var(--muted)", fontFamily: "var(--font-sans)", fontSize: 12.5, fontWeight: 600, color: canSave ? "var(--primary-foreground)" : "var(--muted-foreground)", cursor: canSave ? "pointer" : "default" }}>
              Save
            </button>
          </div>
        </div>
      </div>
    </>,
    document.body
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

const MAX_DAYS = 90;

// Column widths. The driver column is pinned left and the four summary columns are pinned
// right; R holds each summary column's distance from the right edge, left→right:
// Total · Driver pay · Target · Co. profit.
const DRV_W = 200;
const SUM_W = { total: 104, pay: 104, target: 124, profit: 104 };
const R = { profit: 0, target: SUM_W.profit, pay: SUM_W.profit + SUM_W.target, total: SUM_W.profit + SUM_W.target + SUM_W.pay };

const money = (n: number) => (n < 0 ? `-$${Math.abs(n).toLocaleString()}` : fmt(n));

// A tint over an opaque base. Pinned (sticky) cells must stay opaque or the scrolled day
// cells show through them, so the tint rides as a background *image* on a solid colour.
const tintOver = (c: string) => `linear-gradient(${c}, ${c})`;

export function GrossMatrix() {
  const { user } = useAuth();
  const { theme } = useTheme();
  const dark = theme === "dark";
  // Reading the matrix and changing it are separate permissions — without gross.update the
  // cells aren't clickable at all, rather than opening an editor whose save is refused.
  const canEdit = hasPerm(user, "gross", "update");

  const pad  = (n: number) => String(n).padStart(2, "0");
  const fmtD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const todayIso = fmtD(new Date());

  // weekStartDay is a sane placeholder until the first /gross response echoes the
  // company's real setting — never persisted or read from localStorage anymore.
  const [weekStartDay, setWeekStartDay] = useState(1);

  const [rows,     setRows]     = useState<DriverRow[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [loadErr,  setLoadErr]  = useState<string | null>(null); // fetch failure
  const [search,   setSearch]   = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo,   setDateTo]   = useState("");
  const [viewMode, setViewMode] = useState<"all" | "teams">("all"); // one table vs a section per team
  const [teams,    setTeams]    = useState<{ id: string; name: string; driverIds: Set<string>; userNames: string[] }[]>([]);

  // Teams (dispatch pods) for the "By team" view — same fetch/shape as the board: the
  // company-plane /company/teams (gated on teams.read), not the owner-only /owner/* surface,
  // which 403s for a dispatcher and used to leave them with no "By team" toggle at all.
  useEffect(() => {
    const companyId = getCompanyId();
    if (!companyId) return;
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    api.get<{ id: string; name: string; driver_ids?: string[]; user_names?: string[] }[]>("/company/teams")
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
  //
  // Only the latest request may write: week changes and typing can outrun the server,
  // and a slow earlier answer must not overwrite a newer one. `silent` refreshes the
  // numbers in place (after a cell save) without the loading state.
  const reqId = useRef(0);
  const loadGross = (from?: string, to?: string, q?: string, silent = false) => {
    const id = ++reqId.current;
    if (!silent) { setLoading(true); setLoadErr(null); }
    const qs = new URLSearchParams();
    if (from && to) { qs.set("from", from); qs.set("to", to); }
    if (q) qs.set("q", q);
    const query = qs.toString();
    api.get<any>(`/gross${query ? `?${query}` : ""}`)
      .then((data) => {
        if (id !== reqId.current) return;
        if (typeof data?.week_start_day === "number") setWeekStartDay(data.week_start_day);
        if (data?.from) setDateFrom(data.from);
        if (data?.to)   setDateTo(data.to);
        const items: BackendDriverRow[] = data?.drivers ?? [];
        // miles/rpm now come straight from the ledger on each row — no client derivation.
        setRows(items.map(toDriverRow));
      })
      .catch((e) => { if (id === reqId.current && !silent) setLoadErr(friendlyError(e, "Couldn't load gross data.")); })
      .finally(() => { if (id === reqId.current) setLoading(false); });
  };

  // Initial load — server picks the default current week
  useEffect(() => { loadGross(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // The rows filter instantly as you type; the server is only asked once typing pauses.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!dateFrom || !dateTo) return;
    loadGross(dateFrom, dateTo, debouncedSearch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  // Re-snap to the current week whenever the Settings tab saves a new week_start_day
  useEffect(() => {
    const handler = (e: Event) => {
      const newStart = (e as CustomEvent<{ weekStartDay: number }>).detail?.weekStartDay;
      if (typeof newStart !== "number") return;
      setWeekStartDay(newStart);
      const range = getWeekRange(newStart);
      loadGross(fmtD(range.from), fmtD(range.to), debouncedSearch);
    };
    window.addEventListener("week-settings-changed", handler);
    return () => window.removeEventListener("week-settings-changed", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

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
    loadGross(newFrom, newTo, debouncedSearch);
  }

  const thisWeek = getWeekRange(weekStartDay);
  const isThisWeek = dateFrom === fmtD(thisWeek.from) && dateTo === fmtD(thisWeek.to);

  // Cell editing
  const [editState, setEditState] = useState<EditState | null>(null);

  function openCellEdit(driver: DriverRow, date: string, cell: DayCell, el: HTMLElement) {
    if (!canEdit) return;
    // The stored ref is a single "/"-joined string (see toDriverRow) — split it back
    // into individual ids so previously-saved loads show pre-checked in the picker.
    const loadIds = cell.loadId ? cell.loadId.split("/").map((s) => s.trim()).filter(Boolean) : [];
    const isStatus = cell.type !== "load" && cell.type !== "empty";
    setEditState({
      driverId: driver.id, driverName: driver.name, date, rect: el.getBoundingClientRect(),
      // An empty day opens on Load — entering money is what the grid is mostly used for.
      mode: isStatus ? "status" : "load",
      status: isStatus ? (cell.type as Status) : null,
      amount: cell.amount !== undefined ? String(cell.amount) : "",
      loadIds,
    });
  }

  function commitCellEdit() {
    if (!editState) return;
    if (editState.mode === "status" && !editState.status) return;
    const { driverId, date } = editState;
    const prevCell = rows.find((d) => d.id === driverId)?.dateMap[date]; // for rollback
    const joinedLoadId = editState.loadIds.join("/") || undefined;
    const newCell: DayCell =
      editState.mode === "load"   ? { type: "load", amount: editState.amount ? Number(editState.amount) : undefined, loadId: joinedLoadId }
      : editState.mode === "status" ? { type: editState.status as Status }
      : { type: "empty" };
    // optimistic update
    setRows((prev) => prev.map((d) => d.id === driverId
      ? { ...d, dateMap: { ...d.dateMap, [date]: newCell } }
      : d
    ));
    api.patch("/gross", {
      driver_id: driverId,
      date,
      type:      newCell.type,
      amount:    newCell.type === "load" ? newCell.amount : undefined,
      load_id:   newCell.type === "load" ? newCell.loadId : undefined,
    }).then(() => {
      // The row's Total, Driver pay, Co. profit and rate per mile are computed by the
      // backend — pull them again so they agree with the cell that just changed.
      loadGross(dateFrom, dateTo, debouncedSearch, true);
    }).catch((e) => {
      // Roll the cell back to its previous value and tell the user
      setRows((prev) => prev.map((d) => {
        if (d.id !== driverId) return d;
        const dateMap = { ...d.dateMap };
        if (prevCell) dateMap[date] = prevCell; else delete dateMap[date];
        return { ...d, dateMap };
      }));
      notify.error(friendlyError(e, "Couldn't save the change — reverted."));
    });
    setEditState(null);
  }

  function cancelCellEdit() { setEditState(null); }

  // Date columns. A very long range is capped — and says so (see the notice below).
  const allDates = useMemo(() => {
    if (!dateFrom || !dateTo || dateFrom > dateTo) return [];
    return getDatesInRange(dateFrom, dateTo);
  }, [dateFrom, dateTo]);
  const dates = useMemo(() => allDates.slice(0, MAX_DAYS), [allDates]);
  const truncated = allDates.length > MAX_DAYS;

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

  // Sums over a set of rows — the summary strip uses it for everything on screen, each
  // table for its own rows. (The backend's `totals` are company-wide and ignore ?q=, which
  // would contradict the visible rows under a search or a team split.)
  function summarize(list: DriverRow[]) {
    const gross  = list.reduce((s, d) => s + (d.weekTotal ?? rangeTotal(d)), 0);
    const profit = list.reduce((s, d) => s + d.companyProfit, 0);
    const miles  = list.reduce((s, d) => s + d.miles, 0);
    // Driver pay is optional (backend may not send it yet) — only total the rows that have it.
    const anyPay = list.some((d) => d.driverPay != null);
    const pay    = list.reduce((s, d) => s + (d.driverPay ?? 0), 0);
    return { gross, profit, miles, rpm: miles > 0 ? gross / miles : null, anyPay, pay };
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

  const all = summarize(filtered);
  const navBtn: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", justifyContent: "center", width: 34, height: 34,
    borderRadius: 8, border: "1px solid var(--border)", backgroundColor: "var(--card)",
    color: "var(--muted-foreground)", cursor: "pointer", flexShrink: 0,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", backgroundColor: "var(--background)", overflow: "hidden" }}>
      {editState && (
        <CellEditPanel
          edit={editState}
          dark={dark}
          onMode={(m) => setEditState((s) => s ? { ...s, mode: m } : s)}
          onStatus={(st) => setEditState((s) => s ? { ...s, status: st } : s)}
          onAmount={(v) => setEditState((s) => s ? { ...s, amount: v } : s)}
          onLoadsChange={(ids, sumPayout) => setEditState((s) => s ? { ...s, loadIds: ids, amount: String(sumPayout) } : s)}
          onSave={commitCellEdit}
          onCancel={cancelCellEdit}
        />
      )}

      <div style={{ flex: 1, overflow: "hidden", padding: "14px 24px", display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Summary of the rows on screen */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, flexShrink: 0 }}>
          <Kpi icon={<CircleDollarSign size={18} />} label="Gross" value={money(all.gross)} note={`${filtered.length} ${filtered.length === 1 ? "driver" : "drivers"}`} />
          <Kpi icon={<Wallet size={18} />} label="Driver pay" value={all.anyPay ? money(all.pay) : <Dash />} />
          <Kpi icon={<TrendingUp size={18} />} label="Company profit" value={money(all.profit)} tone={all.profit < 0 ? "bad" : "plain"} />
          <Kpi icon={<Gauge size={18} />} label="Rate per mile" value={`$${(all.rpm ?? 0).toFixed(2)}`} note={`${all.miles.toLocaleString()} mi`} />
        </div>

        {truncated && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px", borderRadius: 8, backgroundColor: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.35)", fontFamily: "var(--font-sans)", fontSize: 12.5, color: "var(--foreground)", flexShrink: 0 }}>
            <AlertCircle size={14} style={{ color: "#D97706", flexShrink: 0 }} />
            This range is {allDates.length} days long. Only the first {MAX_DAYS} days are shown — pick a shorter range to see the rest.
          </div>
        )}

        {/* Matrix */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", backgroundColor: "var(--card)", borderRadius: 12, overflow: "hidden", border: "1px solid var(--border)" }}>
          {/* Toolbar — same place and order as every other list: search, then the view, then the dates */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "10px 16px", borderBottom: "1px solid var(--border)", flexShrink: 0 }}>
            <div style={{ position: "relative", flexShrink: 0 }}>
              <Search size={13} style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground)", pointerEvents: "none" }} />
              <input value={search} onChange={(e) => { setSearch(e.target.value); }} placeholder="Search drivers…" aria-label="Search drivers"
                style={{ fontFamily: "var(--font-sans)", fontSize: 13, padding: "0 10px 0 30px", height: 34, width: 200, borderRadius: 8, border: "1px solid var(--border)", backgroundColor: "var(--card)", color: "var(--foreground)", outline: "none", transition: "border-color 0.15s, box-shadow 0.15s" }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.boxShadow = "0 0 0 3px var(--primary-soft)"; }}
                onBlur={(e)  => { e.currentTarget.style.borderColor = "var(--border)";  e.currentTarget.style.boxShadow = "none"; }}
              />
            </div>

            {/* View toggle: one table vs a section per team */}
            {teams.length > 0 && (
              <div role="group" aria-label="View" style={{ display: "inline-flex", height: 34, boxSizing: "border-box", padding: 3, gap: 2, border: "1px solid var(--border)", borderRadius: 8, backgroundColor: "var(--card)", flexShrink: 0 }}>
                {([["all", "All drivers", Rows3], ["teams", "By team", Users]] as const).map(([m, label, Icon]) => (
                  <button key={m} onClick={() => setViewMode(m)} aria-pressed={viewMode === m}
                    style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "0 11px", border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, backgroundColor: viewMode === m ? "var(--primary)" : "transparent", color: viewMode === m ? "var(--primary-foreground)" : "var(--muted-foreground)", outline: "none" }}>
                    <Icon size={14} /> {label}
                  </button>
                ))}
              </div>
            )}

            <div style={{ display: "inline-flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <button onClick={() => shiftWeek(-1)} aria-label="Previous week" title="Previous week" style={navBtn}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--muted)"; e.currentTarget.style.color = "var(--foreground)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--card)"; e.currentTarget.style.color = "var(--muted-foreground)"; }}>
                <ChevronLeft size={15} />
              </button>
              <DateRangePicker from={dateFrom} to={dateTo} onChange={(f, t) => loadGross(f, t, debouncedSearch)} />
              <button onClick={() => shiftWeek(1)} aria-label="Next week" title="Next week" style={navBtn}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "var(--muted)"; e.currentTarget.style.color = "var(--foreground)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "var(--card)"; e.currentTarget.style.color = "var(--muted-foreground)"; }}>
                <ChevronRight size={15} />
              </button>
            </div>

            <button onClick={() => loadGross(fmtD(thisWeek.from), fmtD(thisWeek.to), debouncedSearch)} disabled={isThisWeek}
              style={{ height: 34, padding: "0 12px", borderRadius: 8, border: "1px solid var(--border)", backgroundColor: "var(--card)", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, color: isThisWeek ? "var(--muted-foreground)" : "var(--foreground)", cursor: isThisWeek ? "default" : "pointer", opacity: isThisWeek ? 0.6 : 1, flexShrink: 0 }}>
              This week
            </button>
          </div>

          {/* The loader lives in here, so the controls above stay put (and keep focus) while a
              week change or a search is in flight. With rows on screen they're dimmed instead. */}
          <div style={{ flex: 1, overflow: "auto", scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent", opacity: loading && rows.length > 0 ? 0.5 : 1, pointerEvents: loading ? "none" : "auto", transition: "opacity 0.15s" }}>
            {loading && rows.length === 0 ? (
              <PageLoader label="gross" />
            ) : loadErr ? (
              <div style={{ padding: "60px 20px", textAlign: "center", display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                <AlertCircle size={20} style={{ color: "#EF4444" }} />
                <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, color: "#EF4444" }}>{loadErr}</span>
                <button onClick={() => loadGross(dateFrom, dateTo, debouncedSearch)} style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, padding: "6px 14px", borderRadius: 6, border: "1px solid var(--border)", backgroundColor: "var(--card)", color: "var(--foreground)", cursor: "pointer" }}>Try again</button>
              </div>
            ) : dates.length === 0 ? (
              <div style={{ padding: "60px 20px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>
                Select a valid date range to display data.
              </div>
            ) : viewMode === "teams" && teamGroups.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 20, padding: 16 }}>
                {teamGroups.map((g) => (
                  <div key={g.name} style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                    {/* Section header — plain block above the table, so it never scrolls
                        horizontally with the table's own scroll. */}
                    <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <Users size={14} style={{ color: "var(--primary)", flexShrink: 0 }} />
                      <span style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 700, color: "var(--foreground)" }}>{g.name}</span>
                      {!g.isUnassigned && g.userNames.length > 0 && (
                        <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {g.userNames.join(", ")}
                        </span>
                      )}
                      <span style={{ fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", marginLeft: "auto" }}>
                        {g.drivers.length} {g.drivers.length === 1 ? "driver" : "drivers"}
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
    const g = summarize(driversList);
    const edge = "1px solid var(--border)";
    const todayTint = tintOver("var(--primary-faint)");

    const th: React.CSSProperties = {
      height: 40, padding: "0 10px", textAlign: "center", whiteSpace: "nowrap",
      fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase",
      color: "var(--muted-foreground)", backgroundColor: "var(--card)", borderBottom: edge,
      position: "sticky", top: 0, zIndex: 20,
    };
    const sumTh = (right: number, width: number, first = false): React.CSSProperties => ({
      ...th, textAlign: "right", padding: "0 12px", width, minWidth: width, right, zIndex: 22,
      backgroundColor: "var(--background)", borderLeft: first ? edge : "none",
    });
    const sumTd = (right: number, width: number, first = false): React.CSSProperties => ({
      width, minWidth: width, padding: "0 12px", textAlign: "right", verticalAlign: "middle",
      borderBottom: edge, borderLeft: first ? edge : "none",
      backgroundColor: "var(--background)", position: "sticky", right, zIndex: 9,
    });
    const totTd: React.CSSProperties = {
      height: 44, padding: "0 10px", textAlign: "center", verticalAlign: "middle", whiteSpace: "nowrap",
      fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 700, color: "var(--foreground)", fontVariantNumeric: "tabular-nums",
      backgroundColor: "var(--card)", boxShadow: "inset 0 1px 0 var(--border)",
      position: "sticky", bottom: 0, zIndex: 15,
    };
    const sumAmount: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 13.5, fontWeight: 700, color: "var(--foreground)", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" };
    const sumNote: React.CSSProperties = { fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)", whiteSpace: "nowrap" };

    return (
      <table style={{ borderCollapse: "separate", borderSpacing: 0, tableLayout: "fixed", minWidth: "100%" }}>
        <thead>
          <tr>
            <th style={{ ...th, width: DRV_W, minWidth: DRV_W, textAlign: "left", padding: "0 14px", left: 0, zIndex: 22, borderRight: edge }}>Driver</th>
            {dates.map((iso) => {
              const { day, date } = colLabel(iso);
              const isToday = iso === todayIso;
              return (
                <th key={iso} style={{ ...th, width: DAY_W, minWidth: DAY_W, backgroundImage: isToday ? todayTint : undefined }}>
                  <div style={{ lineHeight: 1.25 }}>
                    <div>{day}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, letterSpacing: 0, color: isToday ? "var(--primary)" : "var(--foreground)" }}>{date}</div>
                  </div>
                </th>
              );
            })}
            <th style={sumTh(R.total, SUM_W.total, true)}>Total</th>
            <th style={sumTh(R.pay, SUM_W.pay)}>Driver pay</th>
            <th style={sumTh(R.target, SUM_W.target)}>Target</th>
            <th style={sumTh(R.profit, SUM_W.profit)}>Co. profit</th>
          </tr>
        </thead>
        <tbody>
          {driversList.length === 0 ? (
            <tr>
              <td colSpan={1 + dates.length + 4} style={{ padding: "48px 20px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>
                No drivers match your search.
              </td>
            </tr>
          ) : driversList.map((driver) => {
            const total    = driver.weekTotal ?? rangeTotal(driver);
            // rpm is 0 when the driver has no recorded mileage — shown as $0.00/mi.
            const driverRpm = driver.miles > 0 ? driver.rpm : null;
            // Target may be unset (0/undefined) — keep the same layout regardless: $0 / 0% / empty bar.
            const targetPct = driver.weeklyTarget ? Math.min(100, Math.round((total / driver.weeklyTarget) * 100)) : 0;

            return (
              <tr key={driver.id}>
                {/* Driver — name, with unit and type on the second line */}
                <td style={{ width: DRV_W, minWidth: DRV_W, height: 46, padding: "0 14px", verticalAlign: "middle", borderRight: edge, borderBottom: edge, backgroundColor: "var(--card)", position: "sticky", left: 0, zIndex: 10 }}>
                  <div title={driver.name} style={{ fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, color: "var(--foreground)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{driver.name}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--muted-foreground)", whiteSpace: "nowrap" }}>
                    {[driver.unit, driver.driverType].filter(Boolean).join(" · ")}
                  </div>
                </td>

                {/* Day cells — click (or Enter) to edit, when allowed */}
                {dates.map((iso) => {
                  const cell = driver.dateMap[iso] ?? { type: "empty" as CellType };
                  const isActive = editState?.driverId === driver.id && editState?.date === iso;
                  const base = isActive ? "var(--primary-soft)" : iso === todayIso ? "var(--primary-faint)" : "transparent";
                  return (
                    <td
                      key={iso}
                      tabIndex={canEdit ? 0 : undefined}
                      aria-label={canEdit ? `Edit ${driver.name}, ${iso}` : undefined}
                      onClick={canEdit ? (e) => openCellEdit(driver, iso, cell, e.currentTarget) : undefined}
                      onKeyDown={canEdit ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openCellEdit(driver, iso, cell, e.currentTarget); } } : undefined}
                      style={{
                        width: DAY_W, minWidth: DAY_W, height: 46, padding: "0 6px",
                        textAlign: "center", verticalAlign: "middle", overflow: "hidden",
                        borderRight: "1px solid color-mix(in srgb, var(--border) 55%, transparent)",
                        borderBottom: edge,
                        backgroundColor: base,
                        cursor: canEdit ? "pointer" : "default",
                        outline: isActive ? "2px solid var(--primary)" : "none",
                        outlineOffset: -2,
                      }}
                      onMouseEnter={canEdit ? (e) => { if (!isActive) e.currentTarget.style.backgroundColor = "var(--muted)"; } : undefined}
                      onMouseLeave={canEdit ? (e) => { e.currentTarget.style.backgroundColor = base; } : undefined}
                      onFocus={canEdit ? (e) => { if (!isActive) e.currentTarget.style.outline = "2px solid var(--primary-glow)"; } : undefined}
                      onBlur={canEdit ? (e) => { if (!isActive) e.currentTarget.style.outline = "none"; } : undefined}
                    >
                      <DayCellContent cell={cell} dark={dark} />
                    </td>
                  );
                })}

                {/* Total, with the rate per mile under it */}
                <td style={sumTd(R.total, SUM_W.total, true)}>
                  <div style={sumAmount}>{fmt(total)}</div>
                  <div style={sumNote} title={`${driver.miles.toLocaleString()} mi`}>
                    ${(driverRpm ?? 0).toFixed(2)}/mi
                  </div>
                </td>

                {/* Driver pay — what the driver earns this window (from the backend) */}
                <td style={sumTd(R.pay, SUM_W.pay)}>
                  {driver.driverPay != null
                    ? <div style={sumAmount}>{fmt(driver.driverPay)}</div>
                    : <Dash />}
                </td>

                {/* Target — set on the driver; shown here with progress toward it */}
                <td style={{ ...sumTd(R.target, SUM_W.target), textAlign: "left" }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 6 }}>
                      <span style={{ fontFamily: "var(--font-sans)", fontSize: 12.5, fontWeight: 600, color: "var(--foreground)", fontVariantNumeric: "tabular-nums" }}>{fmt(driver.weeklyTarget ?? 0)}</span>
                      <span style={{ fontFamily: "var(--font-sans)", fontSize: 11.5, fontWeight: 600, color: targetPct >= 100 ? "var(--primary)" : "var(--muted-foreground)" }}>{targetPct}%</span>
                    </div>
                    <div style={{ height: 4, borderRadius: 99, backgroundColor: "var(--border)", overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 99, width: `${targetPct}%`, backgroundColor: "var(--primary)", transition: "width 0.3s ease" }} />
                    </div>
                  </div>
                </td>

                {/* Co. profit */}
                <td style={sumTd(R.profit, SUM_W.profit)}>
                  <div style={{ ...sumAmount, color: driver.companyProfit < 0 ? "#DC2626" : "var(--foreground)" }}>{money(driver.companyProfit)}</div>
                </td>
              </tr>
            );
          })}

          {/* Totals row — pinned to the bottom of the table */}
          <tr>
            <td style={{ ...totTd, textAlign: "left", padding: "0 14px", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-foreground)", left: 0, zIndex: 17, borderRight: edge }}>
              Totals
            </td>
            {dates.map((iso) => {
              const dayTotal = driversList.reduce((sum, dr) => {
                const cell = dr.dateMap[iso];
                return sum + (cell?.type === "load" && cell.amount ? cell.amount : 0);
              }, 0);
              return (
                <td key={iso} style={{ ...totTd, color: dayTotal > 0 ? "var(--foreground)" : "var(--border)", backgroundImage: iso === todayIso ? todayTint : undefined }}>
                  {dayTotal > 0 ? fmt(dayTotal) : <Dash />}
                </td>
              );
            })}
            <td style={{ ...totTd, textAlign: "right", padding: "0 12px", backgroundColor: "var(--background)", borderLeft: edge, right: R.total, zIndex: 17 }}>
              <div>{fmt(g.gross)}</div>
              <div style={{ ...sumNote, fontWeight: 500 }} title={`${g.miles.toLocaleString()} mi`}>
                ${(g.rpm ?? 0).toFixed(2)}/mi
              </div>
            </td>
            <td style={{ ...totTd, textAlign: "right", padding: "0 12px", backgroundColor: "var(--background)", right: R.pay, zIndex: 17 }}>
              {g.anyPay ? fmt(g.pay) : <Dash />}
            </td>
            <td style={{ ...totTd, textAlign: "right", padding: "0 12px", backgroundColor: "var(--background)", right: R.target, zIndex: 17 }}><Dash /></td>
            <td style={{ ...totTd, textAlign: "right", padding: "0 12px", backgroundColor: "var(--background)", color: g.profit < 0 ? "#DC2626" : "var(--foreground)", right: R.profit, zIndex: 17 }}>
              {money(g.profit)}
            </td>
          </tr>
        </tbody>
      </table>
    );
  }
}
