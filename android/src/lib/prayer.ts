/**
 * Self-contained prayer time calculation (PrayTimes-style astronomy).
 * No network needed – works offline in the browser or on the server.
 */
import { toHijri } from "./calendars";

export type PrayerKey =
  | "fajr"
  | "sunrise"
  | "dhuhr"
  | "asr"
  | "maghrib"
  | "isha";

export const PRAYER_ORDER: PrayerKey[] = [
  "fajr",
  "sunrise",
  "dhuhr",
  "asr",
  "maghrib",
  "isha",
];

export const PRAYER_META: Record<
  PrayerKey,
  { label: string; arabic: string; bangla: string; icon: string; isPrayer: boolean }
> = {
  fajr: { label: "Fajr", arabic: "الفجر", bangla: "ফজর", icon: "🌄", isPrayer: true },
  sunrise: { label: "Sunrise", arabic: "الشروق", bangla: "সূর্যোদয়", icon: "🌅", isPrayer: false },
  dhuhr: { label: "Dhuhr", arabic: "الظهر", bangla: "যোহর", icon: "☀️", isPrayer: true },
  asr: { label: "Asr", arabic: "العصر", bangla: "আসর", icon: "🌤️", isPrayer: true },
  maghrib: { label: "Maghrib", arabic: "المغرب", bangla: "মাগরিব", icon: "🌇", isPrayer: true },
  isha: { label: "Isha", arabic: "العشاء", bangla: "এশা", icon: "🌙", isPrayer: true },
};

export type MethodKey =
  | "MWL"
  | "ISNA"
  | "Egypt"
  | "Makkah"
  | "Karachi"
  | "Tehran";

export const METHODS: Record<
  MethodKey,
  { name: string; fajr: number; isha: number; ishaMinutes?: number; maghrib?: number }
> = {
  MWL: { name: "Muslim World League", fajr: 18, isha: 17 },
  ISNA: { name: "Islamic Society of North America", fajr: 15, isha: 15 },
  Egypt: { name: "Egyptian General Authority", fajr: 19.5, isha: 17.5 },
  Makkah: { name: "Umm al-Qura, Makkah", fajr: 18.5, isha: 0, ishaMinutes: 90 },
  Karachi: { name: "University of Islamic Sciences, Karachi", fajr: 18, isha: 18 },
  Tehran: { name: "Institute of Geophysics, Tehran", fajr: 17.7, isha: 14, maghrib: 4.5 },
};

const dtr = (d: number) => (d * Math.PI) / 180;
const rtd = (r: number) => (r * 180) / Math.PI;
const sin = (d: number) => Math.sin(dtr(d));
const cos = (d: number) => Math.cos(dtr(d));
const tan = (d: number) => Math.tan(dtr(d));
const arcsin = (x: number) => rtd(Math.asin(x));
const arccos = (x: number) => rtd(Math.acos(x));
const arctan2 = (y: number, x: number) => rtd(Math.atan2(y, x));
const arccot = (x: number) => rtd(Math.atan(1 / x));

function fixAngle(a: number) {
  return ((a % 360) + 360) % 360;
}
function fixHour(a: number) {
  return ((a % 24) + 24) % 24;
}

function julian(year: number, month: number, day: number): number {
  let y = year;
  let m = month;
  if (m <= 2) {
    y -= 1;
    m += 12;
  }
  const a = Math.floor(y / 100);
  const b = 2 - a + Math.floor(a / 4);
  return (
    Math.floor(365.25 * (y + 4716)) +
    Math.floor(30.6001 * (m + 1)) +
    day +
    b -
    1524.5
  );
}

function sunPosition(jd: number) {
  const D = jd - 2451545.0;
  const g = fixAngle(357.529 + 0.98560028 * D);
  const q = fixAngle(280.459 + 0.98564736 * D);
  const L = fixAngle(q + 1.915 * sin(g) + 0.02 * sin(2 * g));
  const e = 23.439 - 0.00000036 * D;
  const RA = fixHour(arctan2(cos(e) * sin(L), cos(L)) / 15);
  const declination = arcsin(sin(e) * sin(L));
  const equation = q / 15 - RA;
  return { declination, equation };
}

/** Juristic shadow ratio for Asr: 1 = Shafi'i/Maliki/Hanbali, 2 = Hanafi. */
export type AsrJuristic = "Standard" | "Hanafi";

/**
 * What to do when the sun never reaches a twilight depression angle (high
 * latitudes in summer). `auto` picks a sensible band from the latitude,
 * `none` keeps the clamped (solar-noon-ish) result.
 */
export type HighLatitudeRule =
  | "auto"
  | "angle"
  | "seventh"
  | "middleOfNight"
  | "none";

export type PrayerOptions = {
  latitude: number;
  longitude: number;
  timezoneOffsetHours: number; // offset from UTC for the given date
  method: MethodKey;
  asrJuristic?: AsrJuristic;
  /** Observer height above sea level in metres (horizon dip). */
  elevationMeters?: number;
  /** High-latitude twilight fallback, see `HighLatitudeRule`. */
  highLatitudeRule?: HighLatitudeRule;
};

export type ComputedTimes = Record<PrayerKey, number>; // decimal hours, local

/**
 * Apparent horizon: solar semi-diameter + refraction + the dip caused by the
 * observer's elevation (spec equation for α0).
 */
export function horizonAngle(elevationMeters = 0): number {
  const h = Number.isFinite(elevationMeters) ? Math.max(0, elevationMeters) : 0;
  return 0.833 + 0.0347 * Math.sqrt(h);
}

/**
 * 48°–55°: sixtieth rule, 55°–60°: one seventh of the night, above 60°: middle
 * of the night. Chosen by latitude because the spec's latitude bands overlap.
 */
export function resolveHighLatitudeRule(
  rule: HighLatitudeRule,
  latitude: number,
): Exclude<HighLatitudeRule, "auto"> {
  if (rule !== "auto") return rule;
  const absLat = Math.abs(latitude);
  if (absLat >= 60) return "middleOfNight";
  if (absLat >= 55) return "seventh";
  return "angle";
}

/** Portion of the night used by the fallback formulas. */
function nightPortion(angle: number, rule: Exclude<HighLatitudeRule, "auto">): number {
  if (rule === "none") return 0;
  if (rule === "seventh") return 1 / 7;
  if (rule === "middleOfNight") return 0.5;
  // Sixtieth rule: α ÷ 60 of the night.
  return Math.min(0.5, Math.max(0, angle / 60));
}

/** Ramadan (Hijri month 9) — Umm al-Qura extends Isha to 120 minutes then. */
function isRamadan(date: Date): boolean {
  try {
    return toHijri(date).month === 9;
  } catch {
    return false;
  }
}

export function computePrayerTimes(date: Date, opts: PrayerOptions): ComputedTimes {
  const { latitude: lat, longitude: lng, timezoneOffsetHours: tz } = opts;
  const params = METHODS[opts.method] ?? METHODS.MWL;
  const asrFactor = opts.asrJuristic === "Hanafi" ? 2 : 1;
  const horizon = horizonAngle(opts.elevationMeters);
  // Umm al-Qura measures Isha in minutes after Maghrib: 90 normally, 120 in Ramadan.
  const ishaMinutes =
    params.ishaMinutes === undefined
      ? undefined
      : params.ishaMinutes + (opts.method === "Makkah" && isRamadan(date) ? 30 : 0);
  const jDate =
    julian(date.getFullYear(), date.getMonth() + 1, date.getDate()) - lng / (15 * 24);

  const midDay = (t: number) => {
    const { equation } = sunPosition(jDate + t);
    return fixHour(12 - equation);
  };

  type AngleResult = { hours: number; reachable: boolean };

  const sunAngleTime = (angle: number, t: number, ccw = false): AngleResult => {
    const { declination } = sunPosition(jDate + t);
    const noon = midDay(t);
    const inner =
      (-sin(angle) - sin(declination) * sin(lat)) / (cos(declination) * cos(lat));
    // |cos H| > 1 means the sun never reaches the angle that day: this is the
    // high-latitude case the fallback rules exist for.
    const reachable = inner >= -1 && inner <= 1;
    const clamped = Math.max(-1, Math.min(1, inner));
    const delta = arccos(clamped) / 15;
    return { hours: noon + (ccw ? -delta : delta), reachable };
  };

  const asrTime = (factor: number, t: number): AngleResult => {
    const { declination } = sunPosition(jDate + t);
    const angle = -arccot(factor + tan(Math.abs(lat - declination)));
    return sunAngleTime(angle, t);
  };

  // Iterate to refine (times feed back into the day fraction).
  let times: ComputedTimes = {
    fajr: 5 / 24,
    sunrise: 6 / 24,
    dhuhr: 12 / 24,
    asr: 13 / 24,
    maghrib: 18 / 24,
    isha: 19 / 24,
  };

  let reachable: Record<"fajr" | "sunrise" | "maghrib" | "isha", boolean> = {
    fajr: true,
    sunrise: true,
    maghrib: true,
    isha: true,
  };

  for (let i = 0; i < 3; i += 1) {
    const fajr = sunAngleTime(params.fajr, times.fajr, true);
    const sunrise = sunAngleTime(horizon, times.sunrise, true);
    const dhuhr = midDay(times.dhuhr) + 1 / 60;
    const asr = asrTime(asrFactor, times.asr);
    const maghrib = params.maghrib
      ? sunAngleTime(params.maghrib, times.maghrib)
      : sunAngleTime(horizon, times.maghrib);
    const isha = ishaMinutes
      ? { hours: maghrib.hours + ishaMinutes / 60, reachable: true }
      : sunAngleTime(params.isha, times.isha);
    reachable = {
      fajr: fajr.reachable,
      sunrise: sunrise.reachable,
      maghrib: maghrib.reachable,
      isha: isha.reachable,
    };
    times = {
      fajr: fajr.hours / 24,
      sunrise: sunrise.hours / 24,
      dhuhr: dhuhr / 24,
      asr: asr.hours / 24,
      maghrib: maghrib.hours / 24,
      isha: isha.hours / 24,
    };
  }

  const hours = {} as ComputedTimes;
  (Object.keys(times) as PrayerKey[]).forEach((k) => {
    hours[k] = times[k] * 24;
  });

  // High-latitude fallback: replace only the angles the sun never reached.
  const rule = resolveHighLatitudeRule(opts.highLatitudeRule ?? "auto", lat);
  const needsFajrFallback = !reachable.fajr;
  const needsIshaFallback = !reachable.isha && !params.ishaMinutes;
  if (rule !== "none" && (needsFajrFallback || needsIshaFallback)) {
    // Night length = next sunrise − tonight's sunset. When the sun neither
    // rises nor sets (polar day/night) there is no night to divide, so the
    // fallback collapses onto sunrise/sunset instead of inventing hours.
    let night = 0;
    if (reachable.sunrise && reachable.maghrib) {
      const span = 24 - (hours.maghrib - hours.sunrise);
      if (Number.isFinite(span) && span > 0 && span <= 24) night = span;
    }
    if (needsFajrFallback) {
      hours.fajr = hours.sunrise - nightPortion(params.fajr, rule) * night;
    }
    if (needsIshaFallback) {
      hours.isha = hours.maghrib + nightPortion(params.isha, rule) * night;
    }
  }

  const out = {} as ComputedTimes;
  (Object.keys(hours) as PrayerKey[]).forEach((k) => {
    // Convert from the longitude-local solar scale to civil clock time.
    let v = hours[k] + tz - lng / 15;
    if (!Number.isFinite(v)) v = 0;
    out[k] = fixHour(v);
  });
  return out;
}

/** Same as `computePrayerTimes` but rounded to minutes past local midnight. */
export function computePrayerMinutes(
  date: Date,
  opts: PrayerOptions,
): Record<PrayerKey, number> {
  const times = computePrayerTimes(date, opts);
  const out = {} as Record<PrayerKey, number>;
  (Object.keys(times) as PrayerKey[]).forEach((key) => {
    out[key] = hoursToMinutes(times[key]);
  });
  return out;
}

export function hoursToMinutes(hours: number): number {
  return Math.round(hours * 60);
}

export function formatMinutes(totalMinutes: number, use24 = false): string {
  const m = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mi = m % 60;
  if (use24) return `${`${h}`.padStart(2, "0")}:${`${mi}`.padStart(2, "0")}`;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${`${mi}`.padStart(2, "0")} ${suffix}`;
}

export function parseTimeToMinutes(value: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return h * 60 + mi;
}

export function minutesToInputValue(totalMinutes: number): string {
  const m = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  return `${`${Math.floor(m / 60)}`.padStart(2, "0")}:${`${m % 60}`.padStart(2, "0")}`;
}
