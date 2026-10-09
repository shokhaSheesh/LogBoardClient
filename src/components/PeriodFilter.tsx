import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, Check, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { fmtDateRange } from "../lib/dates";
import { CAL, calHover } from "./calendar";
import { DateRangePicker } from "./DateRangePicker";

// ─── Period filter ────────────────────────────────────────────────────────────
//
// "Which stretch of time?" — the same control on every page that asks it (Dashboard,
// Payouts): pick the unit (Week / Month / Year / Range / All time), then the week, month,
// year or range itself from the button beside it. ‹ › step one unit at a time.
//
// A period is its mode plus the inclusive days it covers. All time has no days.

export type PeriodMode = "week" | "month" | "year" | "custom" | "all";
export interface Period { mode: PeriodMode; from: string; to: string }

export const ALL_TIME: Period = { mode: "all", from: "", to: "" };

const MODES: { id: PeriodMode; label: string }[] = [
  { id: "week", label: "Week" }, { id: "month", label: "Month" }, { id: "year", label: "Year" },
  { id: "custom", label: "Range" }, { id: "all", label: "All time" },
];
const MONTHS_FULL  = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseDay = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); };

// The work week containing `day`, for a company whose week starts on weekStartDay.
export function weekOf(day: Date, weekStartDay: number): Period {
  const start = new Date(day.getFullYear(), day.getMonth(), day.getDate() - ((day.getDay() - weekStartDay + 7) % 7));
  return { mode: "week", from: isoDay(start), to: isoDay(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)) };
}

// The calendar month / year around `anchor`, never running past today: one that is still
// going is measured up to now, so it compares with an equally long stretch before.
function calendarSpan(mode: "month" | "year", anchor: Date, whole = false): Period {
  const first = mode === "month" ? new Date(anchor.getFullYear(), anchor.getMonth(), 1) : new Date(anchor.getFullYear(), 0, 1);
  const last  = mode === "month" ? new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0) : new Date(anchor.getFullYear(), 11, 31);
  const today = new Date();
  return { mode, from: isoDay(first), to: isoDay(!whole && last > today ? today : last) };
}

// The weeks of a month, as the company counts them: every day the work week starts on that
// falls inside the month begins one. So each week belongs to exactly one month, and
// "Week 1" is the first week that starts in it.
function weeksOfMonth(year: number, month: number, weekStartDay: number): { n: number; start: string; end: string }[] {
  const out: { n: number; start: string; end: string }[] = [];
  const days = new Date(year, month + 1, 0).getDate();
  for (let d = 1; d <= days; d++) {
    const day = new Date(year, month, d);
    if (day.getDay() !== weekStartDay) continue;
    out.push({ n: out.length + 1, start: isoDay(day), end: isoDay(new Date(year, month, d + 6)) });
  }
  return out;
}

// The button that names the period in view and opens the list to pick another one. The
// list is drawn at a fixed screen position under the button, so nothing can clip it.
function Menu({ label, children }: { label: string; children: (close: () => void) => React.ReactNode }) {
  const btnRef   = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos]   = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - CAL.width - 8)) });
  };
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  return (
    <>
      <button ref={btnRef} onClick={() => { if (!open) place(); setOpen((v) => !v); }} aria-haspopup="dialog" aria-expanded={open}
        style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 34, padding: "0 12px", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600, backgroundColor: "var(--card)", border: `1px solid ${open ? "var(--primary)" : "var(--border)"}`, borderRadius: 8, color: "var(--foreground)", cursor: "pointer", boxShadow: open ? "0 0 0 3px var(--primary-soft)" : "none", whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
        <Calendar size={13} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
        {label}
        <ChevronDown size={12} style={{ color: "var(--muted-foreground)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s", marginLeft: 2 }} />
      </button>
      {open && createPortal(
        <div ref={panelRef} role="dialog" aria-label="Pick a period"
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999, width: CAL.width, maxHeight: "min(70vh, 420px)", overflowY: "auto", ...CAL.panel }}>
          {children(() => setOpen(false))}
        </div>,
        document.body
      )}
    </>
  );
}

// ‹ title › — pages the months (for the week list), the years (for the month grid), or the
// dozen years on show (for the year grid).
function Header({ title, onPrev, onNext, nextDisabled }: { title: string; onPrev: () => void; onNext: () => void; nextDisabled: boolean }) {
  return (
    <div style={CAL.header}>
      <button onClick={onPrev} aria-label="Earlier" style={CAL.nav}>‹</button>
      <span style={CAL.title}>{title}</span>
      <button onClick={onNext} disabled={nextDisabled} aria-label="Later" style={{ ...CAL.nav, cursor: nextDisabled ? "not-allowed" : "pointer", opacity: nextDisabled ? 0.35 : 1 }}>›</button>
    </div>
  );
}

export function PeriodFilter({ value, onChange, weekStartDay, thisWeek, modes, future = false }: {
  value: Period;
  onChange: (p: Period) => void;
  weekStartDay: number;       // 0=Sunday … 6=Saturday — the company's work-week anchor
  thisWeek?: Period;          // the current week as the server reckons it, when the page knows it
  modes?: PeriodMode[];       // which units to offer; all five when left out
  // A page that plans ahead (Gross) can go past today: whole months, and weeks and months
  // that haven't started. Pages that report what happened stop at today.
  future?: boolean;
}) {
  const now = new Date();
  const currentWeek = thisWeek ?? weekOf(now, weekStartDay);
  const { mode, from, to } = value;
  const start = from ? parseDay(from) : now;

  // What the lists are showing — independent of what's selected until something is picked.
  const [listMonth, setListMonth] = useState(() => new Date(start.getFullYear(), start.getMonth(), 1));
  const [listYear, setListYear]   = useState(start.getFullYear());
  const [yearPage, setYearPage]   = useState(Math.floor(start.getFullYear() / 12) * 12);
  useEffect(() => {
    setListMonth(new Date(start.getFullYear(), start.getMonth(), 1));
    setListYear(start.getFullYear());
    setYearPage(Math.floor(start.getFullYear() / 12) * 12);
  }, [from, mode]); // eslint-disable-line react-hooks/exhaustive-deps

  // Choosing a unit goes to the current one; it does not open anything — the button
  // beside it does that.
  const pickMode = (m: PeriodMode) => {
    if (m === mode) return;
    if (m === "week") onChange(currentWeek);
    else if (m === "month" || m === "year") onChange(calendarSpan(m, now, future));
    else if (m === "all") onChange(ALL_TIME);
    else onChange({ mode: "custom", from: from || currentWeek.from, to: to || currentWeek.to });
  };

  const atLatest = future ? false :
    mode === "week" ? from >= currentWeek.from
    : mode === "month" ? start.getFullYear() === now.getFullYear() && start.getMonth() === now.getMonth()
    : mode === "year" ? start.getFullYear() === now.getFullYear()
    : true;
  const canStep = mode === "week" || mode === "month" || mode === "year";
  const step = (dir: -1 | 1) => {
    if (dir === 1 && atLatest) return;
    if (mode === "week") onChange(weekOf(new Date(start.getFullYear(), start.getMonth(), start.getDate() + dir * 7), weekStartDay));
    else if (mode === "month") onChange(calendarSpan("month", new Date(start.getFullYear(), start.getMonth() + dir, 1), future));
    else if (mode === "year") onChange(calendarSpan("year", new Date(start.getFullYear() + dir, 0, 1), future));
  };

  const weeks  = weeksOfMonth(listMonth.getFullYear(), listMonth.getMonth(), weekStartDay);
  const weekNo = mode === "week" ? weeksOfMonth(start.getFullYear(), start.getMonth(), weekStartDay).find((w) => w.start === from)?.n : undefined;
  const stepBtn: React.CSSProperties = { width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, border: "1px solid var(--border)", backgroundColor: "var(--card)", color: "var(--muted-foreground)", flexShrink: 0 };
  const unit = mode === "week" ? "week" : mode === "month" ? "month" : "year";

  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <div role="group" aria-label="Period" style={{ display: "inline-flex", height: 34, boxSizing: "border-box", padding: 3, gap: 2, border: "1px solid var(--border)", borderRadius: 8, backgroundColor: "var(--card)", flexShrink: 0 }}>
        {MODES.filter((m) => !modes || modes.includes(m.id)).map((m) => (
          <button key={m.id} onClick={() => pickMode(m.id)} aria-pressed={mode === m.id}
            style={{ padding: "0 12px", border: "none", borderRadius: 6, cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 500, backgroundColor: mode === m.id ? "var(--primary)" : "transparent", color: mode === m.id ? "var(--primary-foreground)" : "var(--muted-foreground)", whiteSpace: "nowrap" }}>
            {m.label}
          </button>
        ))}
      </div>

      {mode !== "all" && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          {canStep && (
            <button onClick={() => step(-1)} aria-label={`Previous ${unit}`} title={`Previous ${unit}`} style={{ ...stepBtn, cursor: "pointer" }}>
              <ChevronLeft size={15} />
            </button>
          )}

          {mode === "week" && (
            <Menu label={`${weekNo ? `Week ${weekNo} · ` : ""}${from ? fmtDateRange(from, to) : "…"}`}>
              {(close) => (<>
                <Header title={`${MONTHS_FULL[listMonth.getMonth()]} ${listMonth.getFullYear()}`}
                  onPrev={() => setListMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
                  onNext={() => setListMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
                  nextDisabled={!future && listMonth.getFullYear() === now.getFullYear() && listMonth.getMonth() === now.getMonth()} />
                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  {weeks.map((w) => {
                    const active = w.start === from;
                    const ahead = !future && w.start > currentWeek.from;
                    return (
                      <button key={w.start} disabled={ahead} onClick={() => { onChange({ mode: "week", from: w.start, to: w.end }); close(); }}
                        style={{ ...CAL.option(active, ahead), display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", textAlign: "left" }} {...calHover(active, ahead)}>
                        <span style={{ fontWeight: 600, width: 50 }}>Week {w.n}</span>
                        <span style={{ flex: 1, whiteSpace: "nowrap", opacity: active ? 0.9 : 0.7 }}>{fmtDateRange(w.start, w.end)}</span>
                        {w.start === currentWeek.from && <span style={{ fontSize: 11, fontWeight: 600, opacity: 0.8 }}>Now</span>}
                        {active && <Check size={13} />}
                      </button>
                    );
                  })}
                </div>
              </>)}
            </Menu>
          )}

          {mode === "month" && (
            <Menu label={`${MONTHS_FULL[start.getMonth()]} ${start.getFullYear()}`}>
              {(close) => (<>
                <Header title={String(listYear)} onPrev={() => setListYear((y) => y - 1)} onNext={() => setListYear((y) => y + 1)} nextDisabled={!future && listYear >= now.getFullYear()} />
                <div style={CAL.grid}>
                  {MONTHS_SHORT.map((name, mi) => {
                    const active = start.getFullYear() === listYear && start.getMonth() === mi;
                    const ahead = !future && (listYear > now.getFullYear() || (listYear === now.getFullYear() && mi > now.getMonth()));
                    return (
                      <button key={name} disabled={ahead} onClick={() => { onChange(calendarSpan("month", new Date(listYear, mi, 1), future)); close(); }}
                        style={CAL.option(active, ahead)} {...calHover(active, ahead)}>
                        {name}
                      </button>
                    );
                  })}
                </div>
              </>)}
            </Menu>
          )}

          {mode === "year" && (
            <Menu label={String(start.getFullYear())}>
              {(close) => (<>
                <Header title={String(start.getFullYear())} onPrev={() => setYearPage((p) => p - 12)} onNext={() => setYearPage((p) => p + 12)} nextDisabled={!future && yearPage + 12 > now.getFullYear()} />
                <div style={CAL.grid}>
                  {Array.from({ length: 12 }, (_, i) => yearPage + i).map((y) => {
                    const active = start.getFullYear() === y;
                    const ahead = !future && y > now.getFullYear();
                    return (
                      <button key={y} disabled={ahead} onClick={() => { onChange(calendarSpan("year", new Date(y, 0, 1), future)); close(); }}
                        style={CAL.option(active, ahead)} {...calHover(active, ahead)}>
                        {y}
                      </button>
                    );
                  })}
                </div>
              </>)}
            </Menu>
          )}

          {mode === "custom" && (
            <DateRangePicker from={from} to={to} onChange={(f, t) => onChange({ mode: "custom", from: f, to: t })} />
          )}

          {canStep && (
            <button onClick={() => step(1)} disabled={atLatest} aria-label={`Next ${unit}`} title={`Next ${unit}`} style={{ ...stepBtn, cursor: atLatest ? "not-allowed" : "pointer", opacity: atLatest ? 0.4 : 1 }}>
              <ChevronRight size={15} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
