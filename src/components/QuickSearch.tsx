import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";
import { Clock, Search } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { hasPerm } from "../lib/permissions";
import { useLayer } from "../lib/layers";
import { modKey } from "../lib/platform";
import { STATUS_CONFIG, type Status } from "../lib/statuses";
import { showShortcuts } from "./Shortcuts";

// ⌘/Ctrl + K, from any page: find a load by its number, broker or driver and open it. The
// same box opens from the "Search…" button in the top bar. ↑/↓ move, Enter opens, Esc closes;
// with nothing typed it offers the loads opened from here last.

interface Hit { id: string; ref: string; broker: string; driver: string; status: string; route: string }

const RECENT_KEY = "brelo.quicksearch.recent";
// The last few loads opened from here, newest first — never more than RECENT_MAX, on the way
// in and on the way out.
const RECENT_MAX = 5;
const readRecent = (): Hit[] => {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? (v as Hit[]).slice(0, RECENT_MAX) : [];
  } catch { return []; }
};
const remember = (h: Hit) => {
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([h, ...readRecent().filter((r) => r.id !== h.id)].slice(0, RECENT_MAX))); } catch { /* private window */ }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toHit = (l: any): Hit => {
  const stops = (l.stops ?? []) as { city?: string; state?: string }[];
  const place = (s?: { city?: string; state?: string }) => [s?.city, s?.state].filter(Boolean).join(", ");
  const route = stops.length ? [place(stops[0]), place(stops[stops.length - 1])].filter(Boolean).join(" → ") : "";
  return { id: String(l.id), ref: String(l.load_id ?? ""), broker: l.broker ?? "", driver: l.driver ?? "", status: l.status ?? "", route };
};

// Results line up like the Loads table: Load # | Broker | Driver | Route | Status.
const gridRow: React.CSSProperties = { display: "grid", gridTemplateColumns: "140px minmax(0,1.3fr) minmax(0,1.1fr) minmax(0,1.4fr) 100px", alignItems: "center", gap: 20 };

// The typed text, picked out where it appears in a value (ignoring case).
function mark(text: string, query: string): React.ReactNode {
  const q = query.trim();
  const at = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (at < 0) return text;
  return <>{text.slice(0, at)}<mark style={{ backgroundColor: "var(--primary-soft)", color: "inherit", borderRadius: 3, padding: "0 1px" }}>{text.slice(at, at + q.length)}</mark>{text.slice(at + q.length)}</>;
}

export function QuickSearch() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const allowed = hasPerm(user, "loads", "read");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // ⌘/Ctrl + K opens it from anywhere — even from inside a field.
  useEffect(() => {
    if (!allowed) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        // Not over a form someone is filling in: opening a load would leave it behind.
        if (!document.querySelector('[role=dialog][aria-modal="true"]:not([aria-label="Search loads"])')) setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [allowed]);

  const close = () => { setOpen(false); setQuery(""); setHits([]); setActive(0); };
  useLayer(open, { onEscape: close });
  useEffect(() => { if (open) requestAnimationFrame(() => inputRef.current?.focus()); }, [open]);

  // What's typed, looked up as you type (a short pause first, so a fast typist sends one request).
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) { setHits([]); setLoading(false); setActive(0); return; }
    let gone = false;
    setLoading(true);
    const t = setTimeout(() => {
      api.getList("/loads", { q, page: 1, page_size: 8 })
        .then(({ items }) => { if (!gone) { setHits(items.map(toHit)); setActive(0); } })
        .catch(() => { if (!gone) setHits([]); })
        .finally(() => { if (!gone) setLoading(false); });
    }, 200);
    return () => { gone = true; clearTimeout(t); };
  }, [query, open]);

  const showing = query.trim() ? hits : readRecent();
  const go = (h: Hit) => {
    remember(h);
    close();
    navigate(`/workspace/loads?open=${encodeURIComponent(h.id)}`);
  };

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, showing.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); const h = showing[active]; if (h) go(h); }
  };
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!allowed) return null;

  const hint: React.CSSProperties = { display: "inline-flex", alignItems: "center", gap: 6 };
  const kbd: React.CSSProperties = { fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600, color: "var(--muted-foreground)", border: "1px solid var(--border)", borderRadius: 5, padding: "2px 6px", backgroundColor: "var(--card)", whiteSpace: "nowrap" };

  return (
    <>
      {/* The way in for anyone who doesn't know the shortcut yet */}
      <button type="button" onClick={() => setOpen(true)} aria-label="Search loads"
        style={{ display: "inline-flex", alignItems: "center", gap: 8, height: 34, padding: "0 8px 0 10px", minWidth: 210, borderRadius: 8, border: "1px solid var(--border)", backgroundColor: "var(--input-background)", color: "var(--muted-foreground)", cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: 13 }}
        onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--primary)"; }}
        onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border)"; }}>
        <Search size={14} />
        <span style={{ flex: 1, textAlign: "left" }}>Search loads…</span>
        <span style={kbd}>{modKey} K</span>
      </button>

      {open && createPortal(
        <div role="dialog" aria-modal="true" aria-label="Search loads"
          onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}
          style={{ position: "fixed", inset: 0, zIndex: 10040, backgroundColor: "rgba(0,0,0,0.35)", display: "flex", justifyContent: "center", alignItems: "flex-start", paddingTop: "12vh" }}>
          <div style={{ width: 860, maxWidth: "calc(100vw - 32px)", backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "0 24px 70px rgba(0,0,0,0.3)", overflow: "hidden", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 20px", borderBottom: "1px solid var(--border)" }}>
              <Search size={16} style={{ color: "var(--muted-foreground)", flexShrink: 0 }} />
              <input ref={inputRef} value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={onInputKey}
                placeholder="Load #, broker or driver…" aria-label="Search loads" autoComplete="off" spellCheck={false}
                role="combobox" aria-expanded={showing.length > 0} aria-controls="quick-search-list"
                aria-activedescendant={showing[active] ? `qs-${showing[active].id}` : undefined}
                style={{ flex: 1, minWidth: 0, border: "none", outline: "none", background: "transparent", fontFamily: "var(--font-sans)", fontSize: 16, color: "var(--foreground)" }} />
              {loading && <span style={{ width: 14, height: 14, borderRadius: "50%", border: "2px solid var(--border)", borderTopColor: "var(--primary)", animation: "spin 0.7s linear infinite", flexShrink: 0 }} />}
              <span style={kbd}>Esc</span>
            </div>

            <div ref={listRef} id="quick-search-list" role="listbox" style={{ maxHeight: "50vh", overflowY: "auto", padding: "10px 12px 12px" }}>
              {!query.trim() && showing.length > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 14px 10px", fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-foreground)" }}>
                  <Clock size={12} /> Recently opened
                </div>
              )}
              {showing.length > 0 && (
                <div style={{ ...gridRow, padding: "0 14px 8px", fontFamily: "var(--font-sans)", fontSize: 10.5, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--muted-foreground)" }}>
                  <span>Load #</span><span>Broker</span><span>Driver</span><span>Route</span><span style={{ textAlign: "right" }}>Status</span>
                </div>
              )}
              {showing.map((h, i) => {
                const st = STATUS_CONFIG[h.status as Status];
                const on = i === active;
                const cell: React.CSSProperties = { minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontFamily: "var(--font-sans)", fontSize: 12.5, color: "var(--foreground)" };
                return (
                  <div key={h.id} id={`qs-${h.id}`} data-i={i} role="option" aria-selected={on}
                    onMouseMove={() => setActive(i)} onClick={() => go(h)}
                    style={{ ...gridRow, padding: "13px 14px", marginTop: 2, borderRadius: 8, cursor: "pointer", backgroundColor: on ? "var(--primary-faint)" : "transparent", boxShadow: on ? "inset 3px 0 0 var(--primary)" : "none" }}>
                    <span style={{ ...cell, fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--primary)" }}>{mark(h.ref || "—", query)}</span>
                    <span style={cell} title={h.broker}>{h.broker ? mark(h.broker, query) : <span style={{ color: "var(--muted-foreground)" }}>—</span>}</span>
                    <span style={{ ...cell, color: h.driver ? "var(--foreground)" : "var(--muted-foreground)", fontStyle: h.driver ? "normal" : "italic" }} title={h.driver}>{h.driver ? mark(h.driver, query) : "Unassigned"}</span>
                    <span style={{ ...cell, color: "var(--muted-foreground)" }} title={h.route}>{h.route || "—"}</span>
                    <span style={{ textAlign: "right" }}>
                      {st && <span style={{ fontFamily: "var(--font-sans)", fontSize: 11, fontWeight: 600, color: st.color, backgroundColor: st.bg, borderRadius: 4, padding: "2px 8px", whiteSpace: "nowrap" }}>{st.label}</span>}
                    </span>
                  </div>
                );
              })}
              {query.trim() && !loading && hits.length === 0 && (
                <div style={{ padding: "36px 16px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>No loads match “{query.trim()}”.</div>
              )}
              {!query.trim() && showing.length === 0 && (
                <div style={{ padding: "36px 16px", textAlign: "center", fontFamily: "var(--font-sans)", fontSize: 13, color: "var(--muted-foreground)" }}>Type a load number, broker or driver.</div>
              )}
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 20, padding: "12px 20px", borderTop: "1px solid var(--border)", fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)" }}>
              <span style={hint}><span style={kbd}>↑</span><span style={kbd}>↓</span> move</span>
              <span style={hint}><span style={kbd}>Enter</span> open</span>
              <span style={hint}><span style={kbd}>Esc</span> close</span>
              <span style={{ flex: 1 }} />
              <button type="button" onClick={() => { close(); showShortcuts(); }}
                style={{ border: "none", background: "none", padding: 0, cursor: "pointer", fontFamily: "var(--font-sans)", fontSize: 12, color: "var(--muted-foreground)", textDecoration: "underline" }}>
                <span style={hint}>All shortcuts <span style={kbd}>?</span></span>
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
