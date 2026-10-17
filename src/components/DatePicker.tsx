import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar } from "lucide-react";
import { fmtDate } from "../lib/dates";
import { CAL, calHover } from "./calendar";
import { useLayer } from "../lib/layers";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS   = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

// One day, picked from the app's calendar — the same look and steps as the load form's: today
// marked, and the title steps out from days to months to years. `min` greys out and blocks
// every day (and month, and year) before it — for a date that may not be in the past.
export function DatePicker({ value, onChange, min, label, invalid = false }: {
  value: string;                 // YYYY-MM-DD, or ""
  onChange: (day: string) => void;
  min?: string;                  // YYYY-MM-DD — the earliest day that can be picked
  label: string;
  invalid?: boolean;
}) {
  const btnRef   = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  useLayer(open, { onEscape: () => setOpen(false) });
  const [pos, setPos]   = useState<React.CSSProperties>({});
  const base = value || min || iso(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const [vy, setVy]   = useState(Number(base.slice(0, 4)));
  const [vmo, setVmo] = useState(Number(base.slice(5, 7)) - 1);
  const [view, setView] = useState<"day" | "month" | "year">("day");
  const [yPage, setYPage] = useState(Math.floor(Number(base.slice(0, 4)) / 12) * 12);

  // Below the field when there's room, above it when there isn't.
  const place = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const H = 300, GAP = 4;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - CAL.width - 8));
    const below = window.innerHeight - r.bottom - GAP;
    setPos(below >= H || below >= r.top - GAP ? { top: r.bottom + GAP, left } : { bottom: window.innerHeight - r.top + GAP, left });
  };
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!btnRef.current?.contains(t) && !panelRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("mousedown", away);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  const show = () => {
    setVy(Number(base.slice(0, 4))); setVmo(Number(base.slice(5, 7)) - 1);
    setView("day"); setYPage(Math.floor(Number(base.slice(0, 4)) / 12) * 12);
    place(); setOpen(true);
  };
  const shift = (by: number) => { const n = new Date(vy, vmo + by, 1); setVy(n.getFullYear()); setVmo(n.getMonth()); };

  const firstDow = new Date(vy, vmo, 1).getDay();
  const days     = new Date(vy, vmo + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  // The month before the earliest allowed day has nothing to pick, so ‹ stops there.
  const prevBlocked = !!min && iso(vy, vmo, 1) <= min;
  const now = new Date();
  const today = iso(now.getFullYear(), now.getMonth(), now.getDate());
  const minY = min ? Number(min.slice(0, 4)) : -Infinity;
  const minMo = min ? Number(min.slice(5, 7)) - 1 : 0;
  const hdrBtn: React.CSSProperties = { ...CAL.title, cursor: "pointer" };
  const hdrHover = {
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.backgroundColor = "var(--muted)"; },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => { e.currentTarget.style.backgroundColor = "transparent"; },
  };

  return (
    <>
      <button ref={btnRef} type="button" onClick={() => (open ? setOpen(false) : show())} aria-haspopup="dialog" aria-expanded={open} aria-label={label}
        style={{ display: "flex", alignItems: "center", gap: 7, width: "100%", height: 36, boxSizing: "border-box", padding: "0 10px", borderRadius: 8, cursor: "pointer", textAlign: "left", fontFamily: "var(--font-sans)", fontSize: 13, backgroundColor: "var(--card)", color: value ? "var(--foreground)" : "var(--muted-foreground)", border: `1px solid ${invalid ? "#EF4444" : open ? "var(--primary)" : "var(--border)"}`, boxShadow: open ? "0 0 0 3px var(--primary-soft)" : "none", fontVariantNumeric: "tabular-nums" }}>
        <Calendar size={13} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
        {value ? fmtDate(value) : "Pick a date"}
      </button>
      {open && createPortal(
        <div ref={panelRef} role="dialog" aria-label={label} onMouseDown={(e) => e.stopPropagation()}
          style={{ position: "fixed", ...pos, zIndex: 10000, width: CAL.width, ...CAL.panel }}>
          {view === "day" && (<>
            <div style={CAL.header}>
              <button type="button" aria-label="Previous month" disabled={prevBlocked} onClick={() => shift(-1)} style={{ ...CAL.nav, cursor: prevBlocked ? "not-allowed" : "pointer", opacity: prevBlocked ? 0.35 : 1 }}>‹</button>
              <button type="button" aria-label="Pick a month" style={hdrBtn} onClick={() => setView("month")} {...hdrHover}>{MONTHS[vmo]} {vy}</button>
              <button type="button" aria-label="Next month" onClick={() => shift(1)} style={CAL.nav}>›</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
              {DAYS.map((d) => <div key={d} style={CAL.weekday}>{d}</div>)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", rowGap: 2 }}>
              {cells.map((d, i) => {
                if (!d) return <span key={i} />;
                const day = iso(vy, vmo, d);
                const active = day === value;
                const blocked = !!min && day < min;
                const isToday = day === today;
                return (
                  <button key={i} type="button" disabled={blocked} aria-current={isToday ? "date" : undefined} onClick={() => { onChange(day); setOpen(false); }}
                    style={{ height: 30, border: "none", padding: 0, borderRadius: 6, ...CAL.dayText, fontWeight: active || isToday ? 600 : 400, cursor: blocked ? "not-allowed" : "pointer", opacity: blocked ? 0.3 : 1, backgroundColor: active ? "var(--primary)" : "transparent", color: active ? "#fff" : isToday ? "var(--primary)" : "var(--foreground)" }}
                    {...calHover(active, blocked)}>
                    {d}
                  </button>
                );
              })}
            </div>
          </>)}

          {view === "month" && (<>
            <div style={CAL.header}>
              <button type="button" aria-label="Previous year" disabled={vy <= minY} onClick={() => setVy((y) => y - 1)} style={{ ...CAL.nav, opacity: vy <= minY ? 0.35 : 1 }}>‹</button>
              <button type="button" aria-label="Pick a year" style={hdrBtn} onClick={() => { setYPage(Math.floor(vy / 12) * 12); setView("year"); }} {...hdrHover}>{vy}</button>
              <button type="button" aria-label="Next year" onClick={() => setVy((y) => y + 1)} style={CAL.nav}>›</button>
            </div>
            <div style={CAL.grid}>
              {MONTHS.map((m, mi) => {
                const active = mi === vmo;
                const blocked = vy < minY || (vy === minY && mi < minMo);
                return (
                  <button key={m} type="button" disabled={blocked} onClick={() => { setVmo(mi); setView("day"); }} style={CAL.option(active, blocked)} {...calHover(active, blocked)}>{m.slice(0, 3)}</button>
                );
              })}
            </div>
          </>)}

          {view === "year" && (<>
            <div style={CAL.header}>
              <button type="button" aria-label="Earlier years" disabled={yPage <= minY} onClick={() => setYPage((y) => y - 12)} style={{ ...CAL.nav, opacity: yPage <= minY ? 0.35 : 1 }}>‹</button>
              <span style={CAL.title}>{yPage}–{yPage + 11}</span>
              <button type="button" aria-label="Later years" onClick={() => setYPage((y) => y + 12)} style={CAL.nav}>›</button>
            </div>
            <div style={CAL.grid}>
              {Array.from({ length: 12 }, (_, i) => yPage + i).map((y) => {
                const active = y === vy;
                const blocked = y < minY;
                return (
                  <button key={y} type="button" disabled={blocked} onClick={() => { setVy(y); setView("month"); }} style={CAL.option(active, blocked)} {...calHover(active, blocked)}>{y}</button>
                );
              })}
            </div>
          </>)}
        </div>,
        document.body
      )}
    </>
  );
}
