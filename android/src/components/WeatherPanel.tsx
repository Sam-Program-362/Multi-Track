"use client";

import { useCallback, useEffect, useState } from "react";
import type { Settings, WeatherPayload } from "@/lib/types";
import { fetchWeather, getCachedWeather } from "@/lib/weather";
import { searchPlaces, type GeoOption } from "@/lib/geocode";
import { getCurrentPosition, isNative } from "@/lib/native";
import { Panel, SectionTitle, StatTile, Touchable } from "./ui";

function compass(deg: number) {
  const dirs = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
  return dirs[Math.round(deg / 22.5) % 16];
}

export default function WeatherPanel({
  settings,
  onLocationChange,
}: {
  settings: Settings;
  onLocationChange: (patch: Partial<Settings>) => Promise<void>;
}) {
  const [data, setData] = useState<WeatherPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<GeoOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [locating, setLocating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchWeather({
        latitude: settings.latitude,
        longitude: settings.longitude,
        name: settings.locationName,
      });
      setData(payload);
      setOffline(false);
    } catch (e) {
      // No network: fall back to whatever was cached the last time it worked.
      const cached = await getCachedWeather();
      if (cached) {
        setData(cached);
        setOffline(true);
      } else {
        setError(e instanceof Error ? e.message : "Unable to load weather");
      }
    } finally {
      setLoading(false);
    }
  }, [settings.latitude, settings.longitude, settings.locationName]);

  useEffect(() => {
    const initial = window.setTimeout(load, 0);
    const t = window.setInterval(load, 10 * 60 * 1000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(t);
    };
  }, [load]);

  const runSearch = async () => {
    if (query.trim().length < 2) return;
    setSearching(true);
    try {
      setOptions(await searchPlaces(query));
    } finally {
      setSearching(false);
    }
  };

  const useDeviceLocation = async () => {
    setLocating(true);
    setError(null);
    const position = await getCurrentPosition();
    setLocating(false);
    if (!position) {
      setError("Location permission denied or unavailable — search a city instead.");
      return;
    }
    await onLocationChange({
      latitude: Number(position.latitude.toFixed(4)),
      longitude: Number(position.longitude.toFixed(4)),
      locationName: "My location",
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    setSearch(false);
  };

  const cur = data?.current;

  return (
    <Panel className="p-4 sm:p-5" delay={240}>
      <SectionTitle
        icon="☁️"
        title="Live Weather"
        subtitle={`${settings.locationName} · ${settings.latitude.toFixed(2)}°, ${settings.longitude.toFixed(2)}°`}
        right={
          <div className="flex gap-1">
            <Touchable
              onClick={() => setSearch((s) => !s)}
              className="h-9 rounded-xl border px-3 text-[11px] font-semibold"
              style={{ borderColor: "var(--panel-border)", background: "rgba(255,255,255,0.08)" }}
            >
              📍 Place
            </Touchable>
            <Touchable
              onClick={load}className="h-9 w-9 rounded-xl border text-sm"
                style={{ borderColor: "var(--panel-border)", background: "rgba(255,255,255,0.08)" }}
                aria-label="Refresh weather"
                disabled={loading}
            >
              ⟳
            </Touchable>
          </div>
        }
      />

      {search ? (
        <div className="pop mb-3 rounded-2xl border p-3" style={{ borderColor: "var(--panel-border)", background: "rgba(0,0,0,0.25)" }}>
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runSearch()}
              placeholder="Search a city…"
              className="flex-1 rounded-xl border bg-white/10 px-3 py-2 text-sm outline-none"
              style={{ borderColor: "var(--panel-border)" }}
            />
            <Touchable
              onClick={runSearch}
              className="rounded-xl px-3 py-2 text-sm font-semibold"
              style={{ background: "var(--accent)", color: "#0b1020" }}
            >
              {searching ? "…" : "Find"}
            </Touchable>
          </div>
          <Touchable
            onClick={useDeviceLocation}
            disabled={locating}
            className="mt-2 w-full rounded-xl border px-3 py-2 text-xs font-medium"
            style={{ borderColor: "var(--panel-border)", background: "rgba(255,255,255,0.07)" }}
          >
            {locating
              ? "📡 Finding you…"
              : isNative()
                ? "📡 Use my current location"
                : "📡 Use my device location"}
          </Touchable>
          {options.length > 0 ? (
            <div className="mt-2 max-h-44 overflow-y-auto rounded-xl border" style={{ borderColor: "var(--panel-border)" }}>
              {options.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className="press block w-full border-b px-3 py-2 text-left text-xs last:border-b-0"
                  style={{ borderColor: "rgba(255,255,255,0.08)" }}
                  onClick={async () => {
                    await onLocationChange({
                      locationName: o.label,
                      latitude: o.latitude,
                      longitude: o.longitude,
                      timezone: o.timezone,
                    });
                    setSearch(false);
                    setOptions([]);
                  }}
                >
                  {o.label}
                  <span className="ml-2" style={{ color: "var(--muted)" }}>
                    {o.timezone}
                  </span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {loading && !data ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="shimmer h-16 rounded-2xl bg-white/10" />
          ))}
        </div>
      ) : null}

      {error && !data ? (
        <div className="rounded-2xl border border-dashed p-4 text-center text-xs" style={{ borderColor: "var(--panel-border)", color: "var(--muted)" }}>
          ⚠️ {error}
          <div className="mt-2">
            <Touchable onClick={load} className="rounded-xl border px-3 py-1.5 text-[11px]" style={{ borderColor: "var(--panel-border)" }}>
              Retry
            </Touchable>
          </div>
        </div>
      ) : null}

      {cur && data ? (
        <>
          <div
            className="fade relative overflow-hidden rounded-2xl border p-4"
            style={{ borderColor: "var(--panel-border)", background: "rgba(255,255,255,0.07)" }}
          >
            <div className="orb" style={{ width: 160, height: 160, right: -30, top: -50, background: "var(--accent)" }} />
            <div className="relative flex items-center gap-4">
              <div className="text-5xl sm:text-6xl">{cur.icon}</div>
              <div className="flex-1">
                <div className="flex items-end gap-2">
                  <span className="text-4xl font-bold tabular-nums sm:text-5xl">{Math.round(cur.temperature)}°</span>
                  <span className="pb-1 text-sm" style={{ color: "var(--muted)" }}>
                    feels {Math.round(cur.apparent)}°C
                  </span>
                </div>
                <div className="text-sm font-medium">{cur.condition}</div>
                <div className="text-[11px]" style={{ color: "var(--muted)" }}>
                  {offline ? (
                    <>
                      Offline — last updated {new Date(data.updatedAt).toLocaleTimeString()}
                    </>
                  ) : (
                    <>
                      Updated {new Date(data.updatedAt).toLocaleTimeString()} ·{" "}
                      {cur.isDay ? "Daytime" : "Night"}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatTile icon="💨" label="Wind" value={`${cur.windSpeed.toFixed(1)} km/h`} sub={`${compass(cur.windDirection)} · gust ${Math.round(cur.windGust)}`} />
            <StatTile icon="💧" label="Humidity" value={`${Math.round(cur.humidity)}%`} sub={`Rain ${cur.precipitation.toFixed(1)} mm`} />
            <StatTile icon="🌡️" label="Pressure" value={`${Math.round(cur.pressure)} hPa`} sub={`Cloud ${Math.round(cur.cloudCover)}%`} />
            <StatTile icon="🔆" label="UV index" value={`${cur.uvIndex.toFixed(1)}`} sub={cur.uvIndex > 7 ? "Very high" : cur.uvIndex > 5 ? "High" : "Moderate"} />
          </div>

          {data.air ? (
            <div
              className="mt-3 rounded-2xl border p-3"
              style={{ borderColor: "var(--panel-border)", background: "rgba(255,255,255,0.06)" }}
            >
              <div className="flex items-center justify-between">
                <div className="text-xs uppercase tracking-[0.2em]" style={{ color: "var(--muted)" }}>
                  Air quality (EU AQI)
                </div>
                <span
                  className="rounded-full px-2.5 py-1 text-[11px] font-semibold"
                  style={{ background: data.air.color, color: "#07101f" }}
                >
                  {data.air.aqi ?? "–"} · {data.air.category}
                </span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/12">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${Math.min(100, ((data.air.aqi ?? 0) / 120) * 100)}%`,
                    background: data.air.color,
                  }}
                />
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] sm:grid-cols-6">
                {[
                  ["PM2.5", data.air.pm25, "µg"],
                  ["PM10", data.air.pm10, "µg"],
                  ["O₃", data.air.ozone, "µg"],
                  ["NO₂", data.air.no2, "µg"],
                  ["SO₂", data.air.so2, "µg"],
                  ["Dust", data.air.dust, "µg"],
                ].map(([label, value, unit]) => (
                  <div key={String(label)} className="rounded-xl bg-white/8 px-2 py-1.5 text-center">
                    <div style={{ color: "var(--muted)" }}>{label}</div>
                    <div className="font-semibold tabular-nums">
                      {value === null || value === undefined ? "–" : Math.round(Number(value))}
                      <span className="ml-0.5 text-[9px] opacity-70">{unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {data.hourly.length > 0 ? (
            <div className="scroll-x mt-3 flex gap-2 overflow-x-auto pb-1">
              {data.hourly.map((h) => (
                <div
                  key={h.time}
                  className="min-w-[68px] shrink-0 rounded-2xl border px-2 py-2 text-center"
                  style={{ borderColor: "var(--panel-border)", background: "rgba(255,255,255,0.06)" }}
                >
                  <div className="text-[10px]" style={{ color: "var(--muted)" }}>
                    {new Date(h.time).toLocaleTimeString([], { hour: "numeric" })}
                  </div>
                  <div className="text-lg leading-tight">{iconFor(h.code)}</div>
                  <div className="text-sm font-semibold tabular-nums">{Math.round(h.temp)}°</div>
                  <div className="text-[9px]" style={{ color: "var(--muted)" }}>
                    💧{h.precipitation}%
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="mt-3 grid gap-1.5">
            {data.daily.slice(0, 5).map((d, i) => (
              <div
                key={d.date}
                className="flex items-center gap-3 rounded-xl border px-3 py-2 text-xs"
                style={{ borderColor: "var(--panel-border)", background: "rgba(255,255,255,0.05)" }}
              >
                <span className="w-12 shrink-0 font-medium">
                  {i === 0 ? "Today" : new Date(d.date).toLocaleDateString([], { weekday: "short" })}
                </span>
                <span className="text-base">{d.icon}</span>
                <span className="flex-1 truncate" style={{ color: "var(--muted)" }}>
                  {d.condition}
                </span>
                <span className="tabular-nums" style={{ color: "var(--muted)" }}>
                  💧{d.precipitationProbability}%
                </span>
                <span className="w-16 shrink-0 text-right font-semibold tabular-nums">
                  {Math.round(d.max)}° / {Math.round(d.min)}°
                </span>
              </div>
            ))}
          </div>
        </>
      ) : null}
    </Panel>
  );
}

function iconFor(code: number) {
  if (code === 0) return "☀️";
  if (code <= 2) return "🌤️";
  if (code === 3) return "☁️";
  if (code <= 48) return "🌫️";
  if (code <= 67) return "🌧️";
  if (code <= 77) return "❄️";
  if (code <= 82) return "🌦️";
  if (code <= 86) return "🌨️";
  return "⛈️";
}
