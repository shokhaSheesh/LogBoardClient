import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface AddressParts { street: string; city: string; state: string }

interface Suggestion extends AddressParts {
  display: string;   // "8900 N Sarival Ave, Waddell, AZ" — or just "Waddell, AZ" for a city match
  lat: number;
  lng: number;
}

interface Props {
  value: string;
  onChange: (val: string) => void;
  // Fired when a suggestion is picked — carries the address already split into fields
  // (ADR 0023), so the caller doesn't have to parse the display string back apart.
  onSelect?: (parts: AddressParts, lat: number, lng: number) => void;
  onCoords?: (lat: number, lng: number) => void;
  placeholder?: string;
  style?: React.CSSProperties;
  onFocus?: React.FocusEventHandler<HTMLInputElement>;
  onBlur?: React.FocusEventHandler<HTMLInputElement>;
}

// Free-text stop location with address suggestions. Rate cons print detailed pickup /
// delivery addresses ("8900 N SARIVAL AVE WADDELL, AZ"), so this suggests full street
// addresses, not just "City, ST" — while still letting the user type anything, since the
// backend's stop `city` is free text. A picked suggestion also hands back coordinates so
// mileage can be routed without a second geocode.
export function AddressAutocomplete({ value, onChange, onSelect, onCoords, placeholder = "Address or City, ST", style, onFocus, onBlur }: Props) {
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
            limit: "7",
          }),
          { headers: { "Accept-Language": "en" } }
        );
        const data: any[] = await res.json();
        const seen = new Set<string>();
        const results: Suggestion[] = [];
        for (const item of data) {
          const parts = composeAddress(item.address);
          if (!parts) continue;
          const display = joinParts(parts);
          if (seen.has(display)) continue;
          seen.add(display);
          results.push({ ...parts, display, lat: parseFloat(item.lat), lng: parseFloat(item.lon) });
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
    if (onSelect) onSelect({ street: s.street, city: s.city, state: s.state }, s.lat, s.lng);
    else onChange(s.display); // back-compat for callers that only take a string
    onCoords?.(s.lat, s.lng);
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
        maxHeight: 260, overflowY: "auto",
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
          {s.display}
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

// Split Nominatim's structured address into the three fields the load stops now store
// (ADR 0023). Null when it lacks a city + state — the board's origin/destination and
// per-state reporting need both.
function composeAddress(a: any): AddressParts | null {
  if (!a) return null;
  const street = [a.house_number, a.road].filter(Boolean).join(" ");
  const city   = a.city || a.town || a.village || a.hamlet || a.suburb || a.county || "";
  const state  = STATE_ABBR[a.state] ?? a.state ?? "";
  return city && state ? { street, city, state } : null;
}

// The one-line form — must match how the backend joins a stop (street, city, state).
function joinParts(p: AddressParts): string {
  return [p.street, p.city, p.state].filter(Boolean).join(", ");
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
