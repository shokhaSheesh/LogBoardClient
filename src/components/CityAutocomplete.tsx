import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface Suggestion {
  display: string;
  city: string;
  state: string;
}

interface Props {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
}

export function CityAutocomplete({ value, onChange, placeholder = "City, ST", style, onFocus, onBlur }: Props) {
  const inputRef                      = useRef<HTMLInputElement>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen]               = useState(false);
  const [activeIdx, setActiveIdx]     = useState(-1);
  const [dropPos, setDropPos]         = useState({ top: 0, left: 0, width: 0 });
  const debounceRef                   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ignoreBlurRef                 = useRef(false);

  const search = (q: string) => {
    if (q.trim().length < 2) { setSuggestions([]); setOpen(false); return; }

    clearTimeout(debounceRef.current!);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?` +
          new URLSearchParams({
            q,
            format: "json",
            addressdetails: "1",
            countrycodes: "us",
            featuretype: "city",
            limit: "6",
          }),
          { headers: { "Accept-Language": "en" } }
        );
        const data: any[] = await res.json();
        const seen = new Set<string>();
        const results: Suggestion[] = [];
        for (const item of data) {
          const city  = item.address?.city ?? item.address?.town ?? item.address?.village ?? item.address?.county ?? "";
          const state = item.address?.state ?? "";
          const abbr  = STATE_ABBR[state] ?? state;
          if (!city || !abbr) continue;
          const key = `${city},${abbr}`;
          if (seen.has(key)) continue;
          seen.add(key);
          results.push({ display: `${city}, ${abbr}`, city, state: abbr });
        }
        setSuggestions(results);
        setOpen(results.length > 0);
        setActiveIdx(-1);
      } catch {
        setSuggestions([]);
        setOpen(false);
      }
    }, 250);
  };

  const pick = (s: Suggestion) => {
    onChange(s.display);
    setSuggestions([]);
    setOpen(false);
    setActiveIdx(-1);
  };

  const updateDropPos = () => {
    if (!inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    setDropPos({ top: r.bottom + window.scrollY + 4, left: r.left + window.scrollX, width: r.width });
  };

  const handleFocus: React.FocusEventHandler<HTMLInputElement> = (e) => {
    updateDropPos();
    onFocus?.(e);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, suggestions.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, -1)); }
    if (e.key === "Enter" && activeIdx >= 0) { e.preventDefault(); pick(suggestions[activeIdx]); }
    if (e.key === "Escape")    { setOpen(false); }
  };

  useEffect(() => () => clearTimeout(debounceRef.current!), []);

  const dropdown = open && suggestions.length > 0 && createPortal(
    <ul
      onMouseDown={() => { ignoreBlurRef.current = true; }}
      style={{
        position: "absolute",
        top: dropPos.top, left: dropPos.left, width: dropPos.width,
        zIndex: 99999,
        margin: 0, padding: 0, listStyle: "none",
        backgroundColor: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        boxShadow: "0 8px 32px rgba(0,0,0,0.16)",
        overflow: "hidden",
      }}
    >
      {suggestions.map((s, i) => (
        <li
          key={s.display}
          onMouseDown={() => { ignoreBlurRef.current = true; pick(s); }}
          style={{
            padding: "8px 12px",
            fontFamily: "var(--font-sans)", fontSize: 13,
            color: "var(--foreground)",
            cursor: "pointer",
            backgroundColor: i === activeIdx ? "rgba(59,130,246,0.08)" : "transparent",
            borderTop: i > 0 ? "1px solid var(--border)" : "none",
          }}
        >
          <span style={{ fontWeight: 600 }}>{s.city}</span>
          <span style={{ color: "var(--muted-foreground)" }}>, {s.state}</span>
        </li>
      ))}
    </ul>,
    document.body
  );

  return (
    <>
      <input
        ref={inputRef}
        value={value}
        onChange={(e) => { onChange(e.target.value); search(e.target.value); updateDropPos(); }}
        onFocus={handleFocus}
        onBlur={(e) => {
          if (ignoreBlurRef.current) { ignoreBlurRef.current = false; return; }
          setOpen(false);
          onBlur?.(e);
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        style={style}
        autoComplete="off"
      />
      {dropdown}
    </>
  );
}

const STATE_ABBR: Record<string, string> = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA",
  Colorado: "CO", Connecticut: "CT", Delaware: "DE", Florida: "FL", Georgia: "GA",
  Hawaii: "HI", Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA",
  Kansas: "KS", Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
  Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS",
  Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV", "New Hampshire": "NH",
  "New Jersey": "NJ", "New Mexico": "NM", "New York": "NY", "North Carolina": "NC",
  "North Dakota": "ND", Ohio: "OH", Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA",
  "Rhode Island": "RI", "South Carolina": "SC", "South Dakota": "SD", Tennessee: "TN",
  Texas: "TX", Utah: "UT", Vermont: "VT", Virginia: "VA", Washington: "WA",
  "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY", "District of Columbia": "DC",
};
