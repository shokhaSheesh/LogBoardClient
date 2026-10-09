import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar } from "lucide-react";
import { fmtDate } from "../lib/dates";
import { CAL } from "./calendar";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS   = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

// One day, picked from the app's calendar (the shared CAL look). `min` greys out and blocks
// every day before it — for a date that may not be in the past.
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
  const [pos, setPos]   = useState<React.CSSProperties>({});
  const base = value || min || iso(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const [vy, setVy]   = useState(Number(base.slice(0, 4)));
  const [vmo, setVmo] = useState(Number(base.slice(5, 7)) - 1);

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
    // Escape closes the calendar only — not the dialog it sits in.
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc, true);
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc, true);
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  const show = () => {
    setVy(Number(base.slice(0, 4))); setVmo(Number(base.slice(5, 7)) - 1);
    place(); setOpen(true);
  };
  const shift = (by: number) => { const n = new Date(vy, vmo + by, 1); setVy(n.getFullYear()); setVmo(n.getMonth()); };

  const firstDow = new Date(vy, vmo, 1).getDay();
  const days     = new Date(vy, vmo + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDow).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  // The month before the earliest allowed day has nothing to pick, so ‹ stops there.
  const prevBlocked = !!min && iso(vy, vmo, 1) <= min;

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
          <div style={CAL.header}>
            <button type="button" aria-label="Previous month" disabled={prevBlocked} onClick={() => shift(-1)} style={{ ...CAL.nav, cursor: prevBlocked ? "not-allowed" : "pointer", opacity: prevBlocked ? 0.35 : 1 }}>‹</button>
            <span style={CAL.title}>{MONTHS[vmo]} {vy}</span>
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
              return (
                <button key={i} type="button" disabled={blocked} onClick={() => { onChange(day); setOpen(false); }}
                  style={{ height: 30, border: "none", padding: 0, borderRadius: 6, ...CAL.dayText, fontWeight: active ? 600 : 400, cursor: blocked ? "not-allowed" : "pointer", opacity: blocked ? 0.3 : 1, backgroundColor: active ? "var(--primary)" : "transparent", color: active ? "#fff" : "var(--foreground)" }}
                  onMouseEnter={(e) => { if (!active && !blocked) e.currentTarget.style.backgroundColor = "var(--muted)"; }}
                  onMouseLeave={(e) => { if (!active) e.currentTarget.style.backgroundColor = "transparent"; }}>
                  {d}
                </button>
              );
            })}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
