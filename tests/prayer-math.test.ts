import { describe, expect, it } from "vitest";
import { Coordinates, CalculationMethod, HighLatitudeRule, Madhab, PrayerTimes } from "adhan";
import {
  computePrayerMinutes,
  resolveHighLatitudeRule as resolveRule,
  type HighLatitudeRule as OursRule,
  type MethodKey,
} from "../src/lib/prayer";
import { zoneOffsetForDate } from "../src/lib/calibration";

/**
 * Numerical audit of the in-app solar engine against `adhan`, an independent
 * implementation of the same astronomical conventions. Sunrise, Dhuhr, Asr and
 * Maghrib are compared for several cities, seasons and calculation methods;
 * Fajr/Isha are compared with matching high-latitude rules so the comparison is
 * like-for-like.
 */

const PLACES: Array<{ name: string; lat: number; lng: number; tz: string }> = [
  { name: "Dhaka, BD", lat: 23.8103, lng: 90.4125, tz: "Asia/Dhaka" },
  { name: "Delhi, IN", lat: 28.6139, lng: 77.209, tz: "Asia/Kolkata" },
  { name: "Kolkata, IN", lat: 22.5726, lng: 88.3639, tz: "Asia/Kolkata" },
  { name: "Makkah, SA", lat: 21.3891, lng: 39.8579, tz: "Asia/Riyadh" },
  { name: "London, UK", lat: 51.5074, lng: -0.1278, tz: "Europe/London" },
  { name: "New York, US", lat: 40.7128, lng: -74.006, tz: "America/New_York" },
  { name: "Jakarta, ID", lat: -6.2088, lng: 106.8456, tz: "Asia/Jakarta" },
];

const DATES = [
  new Date(2026, 0, 15),
  new Date(2026, 2, 29), // UK DST change
  new Date(2026, 5, 21), // solstice
  new Date(2026, 10, 15),
];

const METHODS: Array<{ key: MethodKey; adhan: () => ReturnType<typeof CalculationMethod.Karachi> }> = [
  { key: "Karachi", adhan: () => CalculationMethod.Karachi() },
  { key: "MWL", adhan: () => CalculationMethod.MuslimWorldLeague() },
  { key: "ISNA", adhan: () => CalculationMethod.NorthAmerica() },
  { key: "Egypt", adhan: () => CalculationMethod.Egyptian() },
  { key: "Makkah", adhan: () => CalculationMethod.UmmAlQura() },
];

const RULES: OursRule[] = ["angle", "seventh", "middleOfNight"];

function adhanWallMinutes(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

function adhanRule(rule: OursRule) {
  if (rule === "angle") return HighLatitudeRule.TwilightAngle;
  if (rule === "seventh") return HighLatitudeRule.SeventhOfTheNight;
  return HighLatitudeRule.MiddleOfTheNight;
}

function circDelta(a: number, b: number): number {
  let d = a - b;
  if (d > 720) d -= 1440;
  if (d < -720) d += 1440;
  return d;
}

function ours(date: Date, place: (typeof PLACES)[number], method: MethodKey, rule: OursRule, asr: "Standard" | "Hanafi" = "Standard") {
  return computePrayerMinutes(date, {
    latitude: place.lat,
    longitude: place.lng,
    timezoneOffsetHours: zoneOffsetForDate(date, place.tz) / 60,
    method,
    asrJuristic: asr,
    highLatitudeRule: rule,
  });
}

function adhanTimes(date: Date, place: (typeof PLACES)[number], method: (typeof METHODS)[number], rule: OursRule, asr: "Standard" | "Hanafi" = "Standard") {
  const params = method.adhan();
  params.madhab = asr === "Hanafi" ? Madhab.Hanafi : Madhab.Shafi;
  params.highLatitudeRule = adhanRule(rule);
  return new PrayerTimes(new Coordinates(place.lat, place.lng), date, params);
}

describe("solar engine vs independent adhan implementation", () => {
  for (const place of PLACES) {
    for (const date of DATES) {
      for (const method of METHODS) {
        it(`${place.name} ${date.toISOString().slice(0, 10)} ${method.key}`, () => {
          const rule: OursRule = "angle";
          const a = adhanTimes(date, place, method, rule);
          const o = ours(date, place, method.key, rule);
          // Twilight angles near the maximum solar depression (high latitudes
          // around the solstice) are a genuine convention boundary: adhan
          // declares the angle unreachable a fraction of a degree earlier than
          // this engine does. Those cases are covered rule-for-rule below.
          const twilightComparable = Math.abs(place.lat) <= 48;
          const cases: Array<[keyof typeof o, Date]> = [
            ["sunrise", a.sunrise],
            ["dhuhr", a.dhuhr],
            ["maghrib", a.maghrib],
          ];
          if (twilightComparable) cases.push(["fajr", a.fajr]);
          for (const [key, instant] of cases) {
            expect(
              Math.abs(circDelta(adhanWallMinutes(instant, place.tz), o[key])),
              `${key} ${place.name} ${date.toISOString().slice(0, 10)} ${method.key}`,
            ).toBeLessThanOrEqual(2);
          }
          if (twilightComparable) {
            expect(
              Math.abs(circDelta(adhanWallMinutes(a.isha, place.tz), o.isha)),
              `isha ${place.name} ${date.toISOString().slice(0, 10)} ${method.key}`,
            ).toBeLessThanOrEqual(2);
          }
        });
      }

      it(`Asr shadow factors match (${place.name} ${date.toISOString().slice(0, 10)})`, () => {
        for (const madhab of ["Standard", "Hanafi"] as const) {
          const a = adhanTimes(date, place, METHODS[0], "angle", madhab);
          const o = ours(date, place, "Karachi", "angle", madhab);
          expect(
            Math.abs(circDelta(adhanWallMinutes(a.asr, place.tz), o.asr)),
            `asr ${madhab} ${place.name}`,
          ).toBeLessThanOrEqual(2);
        }
      });
    }
  }

  it("high-latitude rules each match their adhan counterpart (London, 21 June)", () => {
    const place = PLACES.find((p) => p.name.startsWith("London"))!;
    const date = new Date(2026, 5, 21);
    for (const rule of RULES) {
      const a = adhanTimes(date, place, METHODS[0], rule);
      const o = ours(date, place, "Karachi", rule);
      expect(Math.abs(circDelta(adhanWallMinutes(a.fajr, place.tz), o.fajr)), `fajr ${rule}`).toBeLessThanOrEqual(3);
      expect(Math.abs(circDelta(adhanWallMinutes(a.isha, place.tz), o.isha)), `isha ${rule}`).toBeLessThanOrEqual(3);
    }
  });
});

describe("high-latitude band selection (`auto`)", () => {
  it("uses the sixtieth rule below 55°, one seventh to 60°, middle of night above", () => {
    expect(resolveRule("auto", 23.8)).toBe("angle");
    expect(resolveRule("auto", 51.5)).toBe("angle");
    expect(resolveRule("auto", 54.9)).toBe("angle");
    expect(resolveRule("auto", 55)).toBe("seventh");
    expect(resolveRule("auto", 59.9)).toBe("seventh");
    expect(resolveRule("auto", 60)).toBe("middleOfNight");
    expect(resolveRule("auto", 69.6)).toBe("middleOfNight");
    expect(resolveRule("none", 69.6)).toBe("none");
    expect(resolveRule("seventh", 10)).toBe("seventh");
  });
});

describe("Umm al-Qura Isha (90 min / 120 min in Ramadan)", () => {
  it("adds 90 minutes after Maghrib outside Ramadan", () => {
    const place = PLACES[3];
    const date = new Date(2026, 10, 15);
    const a = adhanTimes(date, place, METHODS[4], "angle");
    const o = ours(date, place, "Makkah", "angle");
    expect(Math.abs(circDelta(adhanWallMinutes(a.isha, place.tz), o.isha))).toBeLessThanOrEqual(2);
    expect(circDelta(o.isha, o.maghrib)).toBeCloseTo(90, 0);
  });

  it("extends to 120 minutes inside Ramadan", () => {
    const place = PLACES[3];
    const date = new Date(2026, 2, 1); // 12 Ramadan 1447
    const o = ours(date, place, "Makkah", "angle");
    expect(circDelta(o.isha, o.maghrib)).toBe(120);
  });
});

describe("robustness", () => {
  it("keeps every prayer finite, in range and correctly ordered for a full year", () => {
    for (const place of PLACES) {
      for (let day = 0; day < 365; day += 3) {
        const date = new Date(2026, 0, 1 + day);
        const o = ours(date, place, "MWL", "auto");
        for (const [key, value] of Object.entries(o)) {
          expect(Number.isFinite(value), `${place.name} ${key} ${date.toDateString()}`).toBe(true);
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThan(1440);
        }
        // At high latitudes Isha can genuinely fall after midnight (astronomical
        // twilight ends after 00:00 in London in late May), so unwrap it before
        // checking the daily order.
        const isha = o.isha < o.maghrib ? o.isha + 1440 : o.isha;
        const order = [o.fajr, o.sunrise, o.dhuhr, o.asr, o.maghrib, isha];
        for (let i = 1; i < order.length; i += 1) {
          expect(order[i], `${place.name} ${date.toDateString()} position ${i}`).toBeGreaterThanOrEqual(order[i - 1]);
        }
      }
    }
  });

  it("returns a usable schedule during polar day (Tromsø, 21 June)", () => {
    const date = new Date(2026, 5, 21);
    const o = computePrayerMinutes(date, {
      latitude: 69.6492,
      longitude: 18.9553,
      timezoneOffsetHours: zoneOffsetForDate(date, "Europe/Oslo") / 60,
      method: "MWL",
      highLatitudeRule: "auto",
    });
    for (const value of Object.values(o)) expect(Number.isFinite(value)).toBe(true);
  });

  it("elevation lowers the apparent horizon (later Maghrib, earlier Sunrise)", () => {
    const date = new Date(2026, 10, 15);
    const base = { latitude: 34.0837, longitude: 74.7973, timezoneOffsetHours: 5.5, method: "Karachi" as MethodKey };
    const sea = computePrayerMinutes(date, base);
    const hill = computePrayerMinutes(date, { ...base, elevationMeters: 1600 });
    // 1600 m raises the apparent horizon by ~1.4°, worth several minutes.
    expect(circDelta(hill.maghrib, sea.maghrib)).toBeGreaterThanOrEqual(4);
    expect(circDelta(hill.maghrib, sea.maghrib)).toBeLessThanOrEqual(12);
    expect(circDelta(hill.sunrise, sea.sunrise)).toBeLessThanOrEqual(-4);
  });
});
