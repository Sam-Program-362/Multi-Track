/**
 * Self-contained prayer time calculation (PrayTimes-style astronomy).
 * No network needed – works offline in the browser or on the server.
 */

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

export type PrayerOptions = {
  latitude: number;
  longitude: number;
  timezoneOffsetHours: number; // offset from UTC for the given date
  method: MethodKey;
  asrJuristic?: "Standard" | "Hanafi";
};

export type ComputedTimes = Record<PrayerKey, number>; // decimal hours, local

export function computePrayerTimes(date: Date, opts: PrayerOptions): ComputedTimes {
  const { latitude: lat, longitude: lng, timezoneOffsetHours: tz } = opts;
  const params = METHODS[opts.method] ?? METHODS.MWL;
  const asrFactor = opts.asrJuristic === "Hanafi" ? 2 : 1;
  const jDate =
    julian(date.getFullYear(), date.getMonth() + 1, date.getDate()) - lng / (15 * 24);

  const midDay = (t: number) => {
    const { equation } = sunPosition(jDate + t);
    return fixHour(12 - equation);
  };

  const sunAngleTime = (angle: number, t: number, ccw = false) => {
    const { declination } = sunPosition(jDate + t);
    const noon = midDay(t);
    const inner =
      (-sin(angle) - sin(declination) * sin(lat)) / (cos(declination) * cos(lat));
    const clamped = Math.max(-1, Math.min(1, inner));
    const delta = arccos(clamped) / 15;
    return noon + (ccw ? -delta : delta);
  };

  const asrTime = (factor: number, t: number) => {
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

  for (let i = 0; i < 3; i += 1) {
    const fajr = sunAngleTime(params.fajr, times.fajr, true);
    const sunrise = sunAngleTime(0.833, times.sunrise, true);
    const dhuhr = midDay(times.dhuhr) + 1 / 60;
    const asr = asrTime(asrFactor, times.asr);
    const maghrib = params.maghrib
      ? sunAngleTime(params.maghrib, times.maghrib)
      : sunAngleTime(0.833, times.maghrib);
    const isha = params.ishaMinutes
      ? maghrib + params.ishaMinutes / 60
      : sunAngleTime(params.isha, times.isha);
    times = {
      fajr: fajr / 24,
      sunrise: sunrise / 24,
      dhuhr: dhuhr / 24,
      asr: asr / 24,
      maghrib: maghrib / 24,
      isha: isha / 24,
    };
  }

  const out = {} as ComputedTimes;
  (Object.keys(times) as PrayerKey[]).forEach((k) => {
    // Convert from the longitude-local solar scale to civil clock time.
    let v = times[k] * 24 + tz - lng / 15;
    if (!Number.isFinite(v)) v = 0;
    out[k] = fixHour(v);
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
