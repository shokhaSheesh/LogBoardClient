import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronDown, X } from "lucide-react";
import { fmtDateRange } from "../lib/dates";
import { CAL, calHover } from "./calendar";

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
  if (!from && !to) return "";
  return fmtDateRange(from, to || from);
}

interface DateRangePickerProps {
  from: string;
  to: string;
  onChange: (from: string, to: string) => void;
  // What the button says while no range is set.
  placeholder?: string;
  // When given, a set range shows an × that clears it (for a filter that can be "any date").
  onClear?: () => void;
}

export function DateRangePicker({ from, to, onChange, placeholder = "Select range", onClear }: DateRangePickerProps) {
  const [open, setOpen]           = useState(false);
  const [view, setView]           = useState<CalView>("days");
  const [dispYear, setDispYear]   = useState(() => from ? Number(from.slice(0, 4)) : new Date().getFullYear());
  const [dispMonth, setDispMonth] = useState(() => from ? Number(from.slice(5, 7)) - 1 : new Date().getMonth());
  const [pending, setPending]     = useState<string | null>(null);
  const [hover, setHover]         = useState<string | null>(null);
  const [rect, setRect]           = useState<DOMRect | null>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const panelRef  = useRef<HTMLDivElement>(null);

  const navBtn = CAL.nav;
  const hdrBtn: React.CSSProperties = { ...CAL.title, cursor: "pointer" };

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
        <div style={CAL.header}>
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
            <div key={d} style={CAL.weekday}>{d}</div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
          {cells.map(({ iso, inMonth }) => {
            const isS   = iso === rs;
            const isE   = iso === re && re !== rs;
            const inRng = iso > rs && iso < re;
            const d     = Number(iso.slice(8));
            let bg = "transparent", color = inMonth ? "var(--foreground)" : "var(--muted-foreground)", br = "6px", fw: number | string = 400;
            if (inRng) { bg = "var(--primary-soft)"; br = "0"; }
            if (isS)   { bg = "var(--primary)"; color = "#fff"; br = "6px 0 0 6px"; fw = 600; }
            if (isE)   { bg = "var(--primary)"; color = "#fff"; br = "0 6px 6px 0"; fw = 600; }
            if (isS && isE) br = "6px";
            return (
              <div key={iso} style={{ height: 30, backgroundColor: bg, borderRadius: br, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                onMouseDown={(e) => { e.preventDefault(); e.stopPropagation(); if (inMonth) pickDay(iso); }}
                onMouseEnter={() => { if (pending) setHover(iso); }}>
                <span style={{ ...CAL.dayText, color, fontWeight: fw, width: 26, height: 26, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 5 }}>{d}</span>
              </div>
            );
          })}
        </div>

        {pending && (
          <div style={{ marginTop: 8, ...CAL.hint, textAlign: "center" }}>
            Now click an end date
          </div>
        )}
      </>
    );
  }

  function renderMonths() {
    return (
      <>
        <div style={CAL.header}>
          <button style={navBtn} onMouseDown={(e) => { e.preventDefault(); setDispYear(y => y - 1); }}>‹</button>
          <button style={hdrBtn} onMouseDown={(e) => { e.preventDefault(); setView("years"); }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--muted)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}>
            {dispYear}
          </button>
          <button style={navBtn} onMouseDown={(e) => { e.preventDefault(); setDispYear(y => y + 1); }}>›</button>
        </div>
        <div style={CAL.grid}>
          {MONTH_NAMES_SHORT.map((m, idx) => {
            const active = idx === dispMonth;
            return (
              <button key={m}
                onMouseDown={(e) => { e.preventDefault(); setDispMonth(idx); setView("days"); }}
                style={CAL.option(active)} {...calHover(active)}>
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
        <div style={CAL.header}>
          <button style={navBtn} onMouseDown={(e) => { e.preventDefault(); setDispYear(y => y - 12); }}>‹</button>
          <span style={CAL.title}>{dispYear}</span>
          <button style={navBtn} onMouseDown={(e) => { e.preventDefault(); setDispYear(y => y + 12); }}>›</button>
        </div>
        <div style={CAL.grid}>
          {years.map((y) => {
            const active = y === dispYear;
            return (
              <button key={y}
                onMouseDown={(e) => { e.preventDefault(); setDispYear(y); setView("months"); }}
                style={CAL.option(active)} {...calHover(active)}>
                {y}
              </button>
            );
          })}
        </div>
      </>
    );
  }

  const PANEL_W = CAL.width;
  const panelLeft = rect ? Math.min(rect.left, window.innerWidth - PANEL_W - 8) : 0;
  const panelTop  = rect ? rect.bottom + 6 : 0;

  return (
    <>
      <div ref={anchorRef} onClick={openPicker} style={{ flexShrink: 0, position: "relative" }}>
        <button style={{
          display: "inline-flex", alignItems: "center", gap: 7, height: 34, padding: "0 12px",
          fontFamily: "var(--font-sans)", fontSize: 13, fontWeight: 600,
          backgroundColor: "var(--card)",
          border: `1px solid ${open ? "var(--primary)" : "var(--border)"}`,
          borderRadius: 8, color: "var(--foreground)", cursor: "pointer",
          boxShadow: open ? "0 0 0 3px var(--primary-soft)" : "none", outline: "none",
          whiteSpace: "nowrap",
        }}>
          <Calendar size={13} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
          {fmtRange(from, to) || <span style={{ color: "var(--muted-foreground)", fontWeight: 500 }}>{placeholder}</span>}
          {onClear && from
            ? <span style={{ width: 12 }} />
            : <ChevronDown size={12} style={{ color: "var(--muted-foreground)", transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s", marginLeft: 2 }} />}
        </button>
        {/* A sibling of the button, not a child — a button can't contain a button. */}
        {onClear && from && (
          <button type="button" aria-label="Clear dates" title="Clear dates"
            onClick={(e) => { e.stopPropagation(); setOpen(false); onClear(); }}
            style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", display: "flex", padding: 0, border: "none", background: "none", color: "var(--muted-foreground)", cursor: "pointer" }}>
            <X size={13} />
          </button>
        )}
      </div>

      {open && rect && createPortal(
        <div
          ref={panelRef}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "fixed", top: panelTop, left: panelLeft, zIndex: 9999,
            width: PANEL_W, ...CAL.panel,
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
