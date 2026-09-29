import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type GeoResult = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country?: string;
  admin1?: string;
  timezone?: string;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const res = await fetch(
      `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=8&language=en&format=json`,
      { signal: controller.signal, cache: "no-store" },
    );
    if (!res.ok) return NextResponse.json({ results: [] });
    const data = (await res.json()) as { results?: GeoResult[] };
    const results = (data.results ?? []).map((r) => ({
      id: r.id,
      name: r.name,
      label: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
      latitude: r.latitude,
      longitude: r.longitude,
      timezone: r.timezone ?? "UTC",
    }));
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [], error: "Geocoding unavailable" });
  } finally {
    clearTimeout(timer);
  }
}
