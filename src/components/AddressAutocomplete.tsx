import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { suggestAddresses, type PlaceAddress } from "../lib/places";

export interface AddressParts { street: string; city: string; state: string }

// One row of the list. A Google suggestion is only a line of text until it is picked — its
// address fields and point are fetched then (`resolve`). An OpenStreetMap one arrives whole.
interface Suggestion {
  key: string;
  display: string;   // "8900 N Sarival Ave, Waddell, AZ" — or just "Waddell, AZ" for a city match
  resolve: () => Promise<PlaceAddress | null>;
}

interface Props {
  value: string;
  onChange: (val: string) => void;
  // Fired when a suggestion is picked — carries the address already split into fields
  // (ADR 0023), so the caller doesn't have to parse the display string back apart.
  onSelect?: (parts: AddressParts, lat: number, lng: number) => void;
  onCoords?: (lat: number, lng: number) => void;
  // Told when the field starts and stops working — looking up suggestions for what was
  // typed, or fetching the picked address — so the caller can show a spinner in the field.
  onBusy?: (busy: boolean) => void;
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
//
// Suggestions come from Google when a key is configured — it knows street numbers, suites
// and facility names, so a full address pasted from a rate con is found — and from
// OpenStreetMap otherwise, or whenever Google can't be reached.
export function AddressAutocomplete({ value, onChange, onSelect, onCoords, onBusy, placeholder = "Address or City, ST", style, onFocus, onBlur }: Props) {
  const inputRef                      = useRef<HTMLInputElement>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen]               = useState(false);
  const [activeIdx, setActiveIdx]     = useState(-1);
  const [dropPos, setDropPos]         = useState<React.CSSProperties>({});
  const debounceRef                   = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ignoreBlurRef                 = useRef(false);

  // The latest search wins: a slow answer to an earlier keystroke must not replace the
  // list for what is in the box now.
  const searchSeq = useRef(0);
  const [fromGoogle, setFromGoogle] = useState(false);
  // Busy from the first keystroke, not from when the request leaves: the pause before a
  // search is sent is part of the wait as far as the person typing is concerned.
  const [busy, setBusyState] = useState(false);
  const onBusyRef = useRef(onBusy);
  onBusyRef.current = onBusy;
  const setBusy = (b: boolean) => { setBusyState(b); onBusyRef.current?.(b); };

  const search = (q: string) => {
    clearTimeout(debounceRef.current!);
    if (q.trim().length < 2) { searchSeq.current++; setSuggestions([]); setOpen(false); setBusy(false); return; }

    const seq = ++searchSeq.current;
    setBusy(true);
    debounceRef.current = setTimeout(async () => {
      const google = await suggestAddresses(q);
      const results = google
        ? google.map((g) => ({ key: g.id, display: g.text, resolve: g.resolve }))
        : await searchOpenStreetMap(q);
      if (seq !== searchSeq.current) return;
      setBusy(false);
      setFromGoogle(!!google);
      setSuggestions(results);
      setOpen(results.length > 0);
      setActiveIdx(-1);
    }, 250);
  };

  const pick = async (s: Suggestion) => {
    setSuggestions([]);
    setOpen(false);
    setActiveIdx(-1);
    onChange(s.display); // show the choice at once; the fields follow when they arrive
    const seq = ++searchSeq.current; // also drops any search still in flight
    setBusy(true);
    const place = await s.resolve();
    if (seq === searchSeq.current) setBusy(false);
    if (!place) return;  // the text stays as typed; the form's own lookup will locate it
    if (onSelect) onSelect({ street: place.street, city: place.city, state: place.state }, place.lat, place.lng);
    onCoords?.(place.lat, place.lng);
  };

  // Where the list goes, in screen coordinates: under the field when there's room, above it
  // when there isn't, and never taller than the space on that side — so it scrolls inside
  // itself instead of running off the window or over the field it belongs to.
  const updateDropPos = () => {
    if (!inputRef.current) return;
    const r = inputRef.current.getBoundingClientRect();
    const GAP = 4, MAX = 232;
    const below = window.innerHeight - r.bottom - GAP - 8;
    const above = r.top - GAP - 8;
    setDropPos(below >= 140 || below >= above
      ? { top: r.bottom + GAP, left: r.left, width: r.width, maxHeight: Math.min(MAX, Math.max(96, below)) }
      : { bottom: window.innerHeight - r.top + GAP, left: r.left, width: r.width, maxHeight: Math.min(MAX, Math.max(96, above)) });
  };

  // The field can move while the list is open (the form scrolls, the window resizes).
  useEffect(() => {
    if (!open) return;
    updateDropPos();
    window.addEventListener("scroll", updateDropPos, true);
    window.addEventListener("resize", updateDropPos);
    return () => {
      window.removeEventListener("scroll", updateDropPos, true);
      window.removeEventListener("resize", updateDropPos);
    };
  }, [open]);

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

  useEffect(() => () => { clearTimeout(debounceRef.current!); onBusyRef.current?.(false); }, []);

  const dropdown = open && suggestions.length > 0 && createPortal(
    <ul
      onMouseDown={() => { ignoreBlurRef.current = true; }}
      style={{
        position: "fixed",
        ...dropPos,
        zIndex: 99999,
        margin: 0, padding: 0, listStyle: "none",
        backgroundColor: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        boxShadow: "0 8px 32px rgba(0,0,0,0.16)",
        overflowY: "auto", overscrollBehavior: "contain",
        scrollbarWidth: "thin", scrollbarColor: "var(--border) transparent",
      }}
    >
      {suggestions.map((s, i) => (
        <li
          key={s.key}
          onMouseDown={() => { ignoreBlurRef.current = true; pick(s); }}
          style={{
            padding: "8px 12px",
            fontFamily: "var(--font-sans)", fontSize: 13,
            color: "var(--foreground)",
            cursor: "pointer",
            backgroundColor: i === activeIdx ? "var(--primary-tint)" : "transparent",
            borderTop: i > 0 ? "1px solid var(--border)" : "none",
          }}
        >
          {s.display}
        </li>
      ))}
      {/* Google's terms ask for this line wherever its suggestions are listed. */}
      {fromGoogle && (
        <li aria-hidden style={{ padding: "5px 12px", textAlign: "right", fontFamily: "var(--font-sans)", fontSize: 10.5, color: "var(--muted-foreground)", borderTop: "1px solid var(--border)", cursor: "default" }}>
          powered by Google
        </li>
      )}
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
        aria-busy={busy || undefined}
      />
      {dropdown}
    </>
  );
}

// The fallback search: OpenStreetMap's public geocoder. Returns [] on any failure.
async function searchOpenStreetMap(q: string): Promise<Suggestion[]> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?` +
      new URLSearchParams({ q, format: "json", addressdetails: "1", countrycodes: "us", limit: "7" }),
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
      const place: PlaceAddress = { ...parts, lat: parseFloat(item.lat), lng: parseFloat(item.lon) };
      results.push({ key: display, display, resolve: async () => place });
    }
    return results;
  } catch {
    return [];
  }
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
