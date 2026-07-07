// Geocoding + routing helpers (OpenStreetMap Nominatim + OSRM public demo servers).
//
// These are public, rate-limited community servers, so every request is given a hard
// timeout and can be cancelled via an external AbortSignal — a slow or hung request must
// never leave the UI spinning. Callers should geocode *sequentially* (not in parallel):
// Nominatim throttles bursts from a single client.

export interface LatLng { lat: number; lng: number }

const REQUEST_TIMEOUT_MS = 8000;

// fetch → JSON with a hard timeout and optional external cancellation. Returns null on any
// failure (network error, non-2xx, timeout, abort) so callers never have to catch.
async function fetchJson(url: string, external?: AbortSignal): Promise<any | null> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), REQUEST_TIMEOUT_MS);
  const relay = () => ctl.abort();
  external?.addEventListener("abort", relay);
  try {
    const res = await fetch(url, { headers: { "Accept-Language": "en" }, signal: ctl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", relay);
  }
}

// Resolve a free-text "City, ST" string to coordinates. Returns null when nothing matches.
export async function geocodeCity(q: string, signal?: AbortSignal): Promise<LatLng | null> {
  if (!q.trim()) return null;
  const data: Array<{ lat: string; lon: string }> | null = await fetchJson(
    "https://nominatim.openstreetmap.org/search?" +
      new URLSearchParams({ q, format: "json", countrycodes: "us", limit: "1" }),
    signal
  );
  if (!data?.length) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
}

// Total driving distance in miles through the given coordinates in order. Null on failure.
export async function routeMiles(coords: LatLng[], signal?: AbortSignal): Promise<number | null> {
  if (coords.length < 2) return null;
  const path = coords.map((c) => `${c.lng},${c.lat}`).join(";");
  const data = await fetchJson(
    `https://router.project-osrm.org/route/v1/driving/${path}?overview=false`,
    signal
  );
  const meters = data?.routes?.[0]?.distance;
  return meters ? Math.round(meters / 1609.344) : null;
}
