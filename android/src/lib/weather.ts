/**
 * Weather, straight from Open-Meteo.
 *
 * The old app proxied these calls through `/api/weather`. The standalone Android
 * build has no backend, so the same requests go out from the device instead.
 * The last successful response is cached on the phone so the panel still has
 * something to show when the network is gone.
 */
import { readJSON, writeJSON } from "./storage";
import { aqiCategory, describeCode } from "./weatherCodes";
import type { WeatherPayload } from "./types";

const CACHE_KEY = "multitrack:weather-cache:v1";
const TIMEOUT_MS = 9000;

type ForecastResponse = {
  current?: Record<string, number>;
  daily?: Record<string, (number | string)[]>;
  hourly?: Record<string, (number | string)[]>;
};

type AirResponse = { current?: Record<string, number> };

export type WeatherLocation = {
  latitude: number;
  longitude: number;
  name: string;
};

async function fetchJson<T>(url: string, timeoutMs = TIMEOUT_MS): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function numOrNull(v: number | undefined): number | null {
  return v === undefined || v === null || Number.isNaN(v) ? null : Number(v);
}

/** Fetch current conditions, a 7 day forecast and air quality for a point. */
export async function fetchWeather(
  location: WeatherLocation,
): Promise<WeatherPayload> {
  const { latitude: lat, longitude: lon, name } = location;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    throw new Error("Invalid coordinates");
  }

  const forecastUrl =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    "&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day," +
    "precipitation,weather_code,cloud_cover,pressure_msl,wind_speed_10m," +
    "wind_direction_10m,wind_gusts_10m" +
    "&hourly=temperature_2m,weather_code,precipitation_probability" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset," +
    "precipitation_probability_max,uv_index_max" +
    "&timezone=auto&forecast_days=7";

  const airUrl =
    `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${lat}&longitude=${lon}` +
    "&current=european_aqi,pm10,pm2_5,carbon_monoxide,nitrogen_dioxide," +
    "sulphur_dioxide,ozone,dust&timezone=auto";

  const [forecast, air] = await Promise.all([
    fetchJson<ForecastResponse>(forecastUrl),
    fetchJson<AirResponse>(airUrl),
  ]);

  if (!forecast?.current) {
    throw new Error("Weather service unavailable. Check network connectivity.");
  }

  const cur = forecast.current;
  const code = Number(cur.weather_code ?? 0);
  const desc = describeCode(code);

  const dailyLen = forecast.daily?.time?.length ?? 0;
  const daily: WeatherPayload["daily"] = [];
  for (let i = 0; i < dailyLen; i += 1) {
    const dCode = Number(forecast.daily!.weather_code[i] ?? 0);
    const info = describeCode(dCode);
    daily.push({
      date: String(forecast.daily!.time[i]),
      max: Number(forecast.daily!.temperature_2m_max[i]),
      min: Number(forecast.daily!.temperature_2m_min[i]),
      code: dCode,
      condition: info.label,
      icon: info.icon,
      sunrise: String(forecast.daily!.sunrise?.[i] ?? ""),
      sunset: String(forecast.daily!.sunset?.[i] ?? ""),
      precipitationProbability: Number(
        forecast.daily!.precipitation_probability_max?.[i] ?? 0,
      ),
    });
  }

  const hourly: WeatherPayload["hourly"] = [];
  if (forecast.hourly?.time) {
    const now = Date.now();
    const times = forecast.hourly.time as string[];
    let startIdx = times.findIndex((t) => new Date(t).getTime() >= now);
    if (startIdx < 0) startIdx = 0;
    for (let i = startIdx; i < Math.min(startIdx + 12, times.length); i += 1) {
      hourly.push({
        time: String(times[i]),
        temp: Number(forecast.hourly.temperature_2m[i]),
        code: Number(forecast.hourly.weather_code[i] ?? 0),
        precipitation: Number(forecast.hourly.precipitation_probability?.[i] ?? 0),
      });
    }
  }

  const aqiValue =
    air?.current?.european_aqi !== undefined ? Number(air.current.european_aqi) : null;
  const { category, color } = aqiCategory(aqiValue);

  const payload: WeatherPayload = {
    location: name,
    updatedAt: new Date().toISOString(),
    current: {
      temperature: Number(cur.temperature_2m ?? 0),
      apparent: Number(cur.apparent_temperature ?? 0),
      humidity: Number(cur.relative_humidity_2m ?? 0),
      windSpeed: Number(cur.wind_speed_10m ?? 0),
      windDirection: Number(cur.wind_direction_10m ?? 0),
      windGust: Number(cur.wind_gusts_10m ?? 0),
      pressure: Number(cur.pressure_msl ?? 0),
      cloudCover: Number(cur.cloud_cover ?? 0),
      precipitation: Number(cur.precipitation ?? 0),
      uvIndex: Number(forecast.daily?.uv_index_max?.[0] ?? 0),
      isDay: Number(cur.is_day ?? 1) === 1,
      weatherCode: code,
      condition: desc.label,
      icon: desc.icon,
    },
    daily,
    hourly,
    air: air?.current
      ? {
          aqi: aqiValue,
          category,
          color,
          pm25: numOrNull(air.current.pm2_5),
          pm10: numOrNull(air.current.pm10),
          ozone: numOrNull(air.current.ozone),
          no2: numOrNull(air.current.nitrogen_dioxide),
          co: numOrNull(air.current.carbon_monoxide),
          so2: numOrNull(air.current.sulphur_dioxide),
          dust: numOrNull(air.current.dust),
        }
      : null,
  };

  await writeJSON(CACHE_KEY, payload);
  return payload;
}

/**
 * Load the cached forecast. Used as the first paint and as the fallback when
 * the live request fails, so the panel is never empty when offline.
 */
export async function getCachedWeather(): Promise<WeatherPayload | null> {
  return readJSON<WeatherPayload>(CACHE_KEY);
}