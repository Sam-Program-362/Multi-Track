/**
 * City search via the Open-Meteo geocoding API.
 *
 * Client-side now that the backend is gone; the query string, timeout and
 * response shape match what `/api/geocode` used to return.
 */

const TIMEOUT_MS = 9000;

export type GeoOption = {
  id: number;
  label: string;
  latitude: number;
  longitude: number;
  timezone: string;
};

type GeoResult = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
  timezone?: string;
};

/** Search for places by name. Returns `[]` when the lookup fails. */
export async function searchPlaces(query: string): Promise<GeoOption[]> {
  const q = query.trim();
  if (q.length < 2) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=en&format=json`,
      { signal: controller.signal, cache: "no-store" },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: GeoResult[] };
    return (data.results ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      label: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
      latitude: r.latitude,
      longitude: r.longitude,
      timezone: r.timezone ?? "UTC",
    }));
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}