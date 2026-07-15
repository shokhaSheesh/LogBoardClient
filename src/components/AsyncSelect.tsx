import { useState, useRef, useEffect } from "react";
import { Search, Check, ChevronDown, X } from "lucide-react";
import { isForbidden } from "../lib/api";

// A single option in any of the app's selects.
export interface SelectOpt { value: string; label: string; dot?: string }

// ─── Searchable select ────────────────────────────────────────────────────────

// Backend-paginated, searchable select with infinite scroll. Fetches one page at a
// time via fetchPage(query, page), loads more on scroll, and re-queries the backend
// (debounced) as the user types — so it scales whether there are 20 rows or 2,000.
// valueLabel is the already-resolved label for the current value (the caller carries
// it), so the closed button shows the right name even before that page is loaded.
export function AsyncSearchableSelect({ value, valueLabel, fetchPage, onChange, placeholder, icon }: {
  value: string;
  valueLabel?: string;
  fetchPage: (query: string, page: number) => Promise<{ items: SelectOpt[]; total: number }>;
  onChange: (id: string, label: string) => void;
  placeholder?: string; icon?: React.ReactNode;
}) {
  const wrapRef  = useRef<HTMLDivElement>(null);
  const listRef  = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const reqId    = useRef(0);
  const [open,  setOpen]  = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [items, setItems] = useState<SelectOpt[]>([]);
  const [page,  setPage]  = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [denied, setDenied]   = useState(false);
  const [selectedLabel, setSelectedLabel] = useState(valueLabel ?? "");
  useEffect(() => { setSelectedLabel(valueLabel ?? ""); }, [valueLabel]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!wrapRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 0); }, [open]);
  useEffect(() => { const t = setTimeout(() => setDebouncedQuery(query), 250); return () => clearTimeout(t); }, [query]);

  const loadPage = async (pageNum: number, q: string, replace: boolean) => {
    const id = ++reqId.current; // guard against a slow stale response clobbering a newer one
    setLoading(true);
    try {
      const { items: rows, total: t } = await fetchPage(q, pageNum);
      if (id !== reqId.current) return;
      setItems((prev) => (replace ? rows : [...prev, ...rows]));
      setTotal(t);
      setPage(pageNum);
      setDenied(false);
    } catch (e) {
      // 403 → the caller can't read this list; show that instead of "No results".
      if (id === reqId.current && isForbidden(e)) setDenied(true);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  };

  // Fresh page-1 fetch when opened and whenever the (debounced) search changes.
  useEffect(() => {
    if (!open) return;
    setItems([]); setTotal(0); setPage(1);
    void loadPage(1, debouncedQuery, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, debouncedQuery]);

  const onScroll = () => {
    const el = listRef.current;
    if (!el || loading) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 48 && items.length < total) {
      void loadPage(page + 1, debouncedQuery, false);
    }
  };

  const pick = (id: string, label: string) => { onChange(id, label); setSelectedLabel(label); setOpen(false); };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <button type="button" onClick={() => { setOpen(v => !v); setQuery(""); }} style={{
        display: "flex", alignItems: "center", gap: 8, width: "100%", height: 34,
        padding: "0 8px 0 10px", fontFamily: "var(--font-sans)", fontSize: 13,
        border: `1px solid ${open ? "var(--primary)" : "var(--border)"}`,
        borderRadius: 6, backgroundColor: "var(--input-background)",
        color: value ? "var(--foreground)" : "var(--muted-foreground)",
        cursor: "pointer", textAlign: "left", outline: "none",
        boxShadow: open ? "0 0 0 3px rgba(59,130,246,0.12)" : "none",
      }}>
        {icon && <span style={{ color: "var(--muted-foreground)", display: "flex", flexShrink: 0 }}>{icon}</span>}
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value ? (selectedLabel || value) : <span style={{ color: "var(--muted-foreground)" }}>{placeholder ?? "Select…"}</span>}
        </span>
        {value && (
          <span
            role="button"
            title="Clear"
            onClick={(e) => { e.stopPropagation(); onChange("", ""); setSelectedLabel(""); setOpen(false); }}
            style={{ display: "flex", flexShrink: 0, color: "var(--muted-foreground)", cursor: "pointer" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLSpanElement).style.color = "#EF4444"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLSpanElement).style.color = "var(--muted-foreground)"; }}
          >
            <X size={13} />
          </span>
        )}
        <ChevronDown size={13} style={{ color: "var(--muted-foreground)", flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }} />
      </button>

      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 600,
          backgroundColor: "var(--card)", border: "1px solid var(--border)", borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)", overflow: "hidden",
        }}>
          <div style={{ padding: "6px 8px", borderBottom: "1px solid var(--border)" }}>
            <div style={{ position: "relative" }}>
              <Search size={12} style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--muted-foreground)" }} />
              <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
                placeholder="Search…"
                style={{ width: "100%", height: 28, paddingLeft: 26, paddingRight: 8, boxSizing: "border-box",
                  fontFamily: "var(--font-sans)", fontSize: 12, border: "1px solid var(--border)", borderRadius: 5,
                  backgroundColor: "var(--muted)", color: "var(--foreground)", outline: "none" }}
              />
            </div>
          </div>
          <div ref={listRef} onScroll={onScroll} style={{ maxHeight: 180, overflowY: "auto" }}>
            {items.map(opt => {
              const active = opt.value === value;
              return (
                <button key={opt.value} type="button"
                  onMouseDown={e => { e.preventDefault(); pick(opt.value, opt.label); }}
                  style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 12px",
                    border: "none", backgroundColor: active ? "var(--accent)" : "transparent",
                    fontFamily: "var(--font-sans)", fontSize: 13, cursor: "pointer", textAlign: "left",
                    color: active ? "var(--primary)" : "var(--foreground)", fontWeight: active ? 600 : 400,
                  }}
                  onMouseEnter={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--muted)"; }}
                  onMouseLeave={e => { if (!active) (e.currentTarget as HTMLButtonElement).style.backgroundColor = active ? "var(--accent)" : "transparent"; }}
                >
                  <span style={{ flex: 1 }}>{opt.label}</span>
                  {active && <Check size={13} style={{ color: "var(--primary)" }} />}
                </button>
              );
            })}
            {loading && <div style={{ padding: 10, textAlign: "center", fontSize: 12, color: "var(--muted-foreground)" }}>Loading…</div>}
            {!loading && items.length === 0 && (
              <div style={{ padding: 12, textAlign: "center", fontSize: 12, color: "var(--muted-foreground)" }}>
                {denied ? "You don't have access to this list." : "No results"}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

