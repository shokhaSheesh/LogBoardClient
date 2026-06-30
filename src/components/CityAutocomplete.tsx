import { useEffect, useRef, useState } from "react";

declare const google: any; // loaded dynamically via script tag

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_KEY as string;

let scriptPromise: Promise<void> | null = null;

function loadMapsScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    if (typeof google !== "undefined" && google.maps?.places) {
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${MAPS_KEY}&libraries=places`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps"));
    document.head.appendChild(script);
  });
  return scriptPromise;
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
  const inputRef = useRef<HTMLInputElement>(null);
  const acRef    = useRef<any>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    loadMapsScript().then(() => setReady(true)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!ready || !inputRef.current || acRef.current) return;

    const ac = new google.maps.places.Autocomplete(inputRef.current, {
      types: ["(cities)"],
      componentRestrictions: { country: "us" },
      fields: ["address_components"],
    });

    ac.addListener("place_changed", () => {
      const place = ac.getPlace();
      const comps: any[] = place.address_components ?? [];
      const city  = comps.find((c) => c.types.includes("locality"))?.long_name
                 ?? comps.find((c) => c.types.includes("sublocality"))?.long_name
                 ?? "";
      const state = comps.find((c) => c.types.includes("administrative_area_level_1"))?.short_name ?? "";
      if (city && state) onChange(`${city}, ${state}`);
      else if (city)     onChange(city);
    });

    acRef.current = ac;
  }, [ready]);

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={style}
      onFocus={onFocus}
      onBlur={onBlur}
      autoComplete="off"
    />
  );
}
