import type { TrackingMode } from "./calibration";
import type { MethodKey } from "./prayer";

export type Settings = {
  id: number;
  locationName: string;
  latitude: number;
  longitude: number;
  timezone: string;
  method: MethodKey;
  asrJuristic: "Standard" | "Hanafi";
  use24Hour: boolean;
  remindersEnabled: boolean;
  reminderSound: string;
};

export type WorldClock = {
  id: number;
  label: string;
  timezone: string;
  accent: string;
  sortOrder: number;
};

/**
 * One prayer's calibration state.
 *
 * `offsetMinutes` is Δuser(p) — the difference between the time the user
 * entered and the astronomical baseline on `calibratedAt` — and is what makes
 * the timer follow the seasons. `customTime` is kept only as an audit trail of
 * the clock time the user typed; it is never used to schedule anything.
 */
export type PrayerPref = {
  prayerKey: string;
  mode: TrackingMode;
  offsetMinutes: number;
  stepMinutes: number;
  fixedTime: string | null;
  customTime: string | null;
  calibratedAt: string | null;
  reminderEnabled: boolean;
};

export type WeatherPayload = {
  location: string;
  updatedAt: string;
  current: {
    temperature: number;
    apparent: number;
    humidity: number;
    windSpeed: number;
    windDirection: number;
    windGust: number;
    pressure: number;
    cloudCover: number;
    precipitation: number;
    uvIndex: number;
    isDay: boolean;
    weatherCode: number;
    condition: string;
    icon: string;
  };
  daily: Array<{
    date: string;
    max: number;
    min: number;
    code: number;
    condition: string;
    icon: string;
    sunrise: string;
    sunset: string;
    precipitationProbability: number;
  }>;
  hourly: Array<{ time: string; temp: number; code: number; precipitation: number }>;
  air: {
    aqi: number | null;
    category: string;
    color: string;
    pm25: number | null;
    pm10: number | null;
    ozone: number | null;
    no2: number | null;
    co: number | null;
    so2: number | null;
    dust: number | null;
  } | null;
};
