import { describe, expect, it } from "vitest";
import {
  buildSchedule,
  captureOffsetMinutes,
  calibrate,
  defaultIqamah,
  HIGH_LATITUDE_CHOICES,
  describeIqamah,
  describeScheduleItem,
  normalizeIqamah,
  normalizeStoredRule,
  projectMinutes,
  resolveIqamah,
  sanitizeOffset,
  stepJumpMinutes,
  wrapMinutes,
  MAX_IQAMAH_TABLE,
  type CalibrationContext,
  type SchedulePref,
} from "../src/lib/calibration";

const DHAKA: CalibrationContext = {
  latitude: 23.8103,
  longitude: 90.4125,
  timezone: "Asia/Dhaka",
  method: "Karachi",
  asrJuristic: "Standard",
};

const dhakaDate = (month: number, day: number, year = 2026) => new Date(year, month - 1, day);

describe("Δuser capture and projection", () => {
  it("measures the offset of an entered time from the astronomical baseline", () => {
    const astro = 4 * 60 + 55; // Fajr 04:55 in Dhaka, 15 Nov 2026
    expect(captureOffsetMinutes(5 * 60 + 18, astro)).toBe(23);
    expect(captureOffsetMinutes(4 * 60 + 30, astro)).toBe(-25);
  });

  it("wraps across midnight instead of producing ±24h jumps", () => {
    expect(captureOffsetMinutes(5, 1435)).toBe(10); // 00:05 vs 23:55
    expect(wrapMinutes(-5)).toBe(1435);
    expect(wrapMinutes(1445)).toBe(5);
  });

  it("clamps implausible offsets to ±180 minutes", () => {
    expect(sanitizeOffset(1000)).toBe(180);
    expect(sanitizeOffset(-1000)).toBe(-180);
    const rule = calibrate(
      { mode: "dynamicOffset", offsetMin: 0, stepMin: 0, fixedClock: null, calibratedAt: null },
      12 * 60,
      4 * 60 + 55,
      dhakaDate(11, 15),
    );
    expect(rule.offsetMin).toBe(180);
  });

  it("keeps Δuser constant while the astronomical time drifts across the year", () => {
    const rule = calibrate(
      { mode: "dynamicOffset", offsetMin: 0, stepMin: 0, fixedClock: null, calibratedAt: null },
      5 * 60 + 18,
      4 * 60 + 55,
      dhakaDate(11, 15),
    );
    expect(rule.offsetMin).toBe(23);
    expect(rule.calibratedAt).toBe("2026-11-15");
    // A month later the sun is later, and the user's offset rides along.
    const later = projectMinutes(5 * 60 + 12, rule);
    expect(later).toBe(5 * 60 + 35);
  });
});

describe("stepped board times", () => {
  it("rounds up to the next multiple of the step", () => {
    expect(stepJumpMinutes(5 * 60 + 1, 15)).toBe(5 * 60 + 15);
    expect(stepJumpMinutes(5 * 60 + 15, 15)).toBe(5 * 60 + 15);
    expect(stepJumpMinutes(5 * 60 + 16, 15)).toBe(5 * 60 + 30);
    expect(stepJumpMinutes(5 * 60 + 1, 0)).toBe(5 * 60 + 1);
  });

  it("wraps past midnight", () => {
    expect(stepJumpMinutes(23 * 60 + 58, 15)).toBe(0);
  });

  it("applies the step after the offset", () => {
    const rule = { mode: "steppedOffset" as const, offsetMin: 23, stepMin: 15, fixedClock: null, calibratedAt: "2026-11-15" };
    expect(projectMinutes(4 * 60 + 55, rule)).toBe(5 * 60 + 30);
  });
});

describe("DST and timezone drift", () => {
  it("changes the wall clock while Δuser stays put (London, 28→29 March 2026)", () => {
    const london: CalibrationContext = {
      latitude: 51.5074,
      longitude: -0.1278,
      timezone: "Europe/London",
      method: "MWL",
      asrJuristic: "Standard",
    };
    const rule = calibrate(
      { mode: "dynamicOffset", offsetMin: 0, stepMin: 0, fixedClock: null, calibratedAt: null },
      12 * 60 + 30,
      12 * 60 + 7,
      dhakaDate(3, 28),
    );
    expect(rule.offsetMin).toBe(23);
    const pref: SchedulePref = {
      prayerKey: "dhuhr", offsetMinutes: rule.offsetMin, mode: "dynamicOffset",
      stepMinutes: 0, fixedTime: null, customTime: "12:30", calibratedAt: rule.calibratedAt,
    };
    const before = buildSchedule(dhakaDate(3, 28), london, [pref]);
    const after = buildSchedule(dhakaDate(3, 29), london, [pref]);
    expect(before[2].offsetMinutes).toBe(23);
    expect(after[2].offsetMinutes).toBe(23);
    expect(after[2].azanMinutes - before[2].azanMinutes).toBeGreaterThanOrEqual(50);
    expect(after[2].azanMinutes - before[2].azanMinutes).toBeLessThanOrEqual(70);
  });
});

describe("legacy stored rows", () => {
  const now = dhakaDate(11, 15);

  it("recovers Δuser from a pre-calibration custom time", () => {
    const rule = normalizeStoredRule(
      "fajr",
      { customTime: "05:18", offsetMinutes: 0, mode: null, stepMinutes: null, fixedTime: null, calibratedAt: null },
      DHAKA,
      now,
    );
    expect(rule.mode).toBe("dynamicOffset");
    expect(rule.offsetMin).toBe(23);
    expect(rule.calibratedAt).toBe("2026-11-15");
  });

  it("keeps a v2 calibration untouched", () => {
    const rule = normalizeStoredRule(
      "fajr",
      { customTime: "05:18", offsetMinutes: 23, mode: "dynamicOffset", stepMinutes: 0, fixedTime: null, calibratedAt: "2026-11-15" },
      DHAKA,
      now,
    );
    expect(rule.offsetMin).toBe(23);
    expect(rule.calibratedAt).toBe("2026-11-15");
  });

  it("never resurrects a stale customTime when no offset is stored", () => {
    const rule = normalizeStoredRule("isha", { customTime: null }, DHAKA, now);
    expect(rule.offsetMin).toBe(0);
  });
});

describe("jamaat / iqamah policy", () => {
  const date = dhakaDate(11, 15);
  const azan = 5 * 60 + 18;

  it("defaults to no jamaat time", () => {
    expect(normalizeIqamah(undefined)).toEqual(defaultIqamah());
    expect(resolveIqamah(azan, defaultIqamah(), date)).toBeNull();
  });

  it("resolves a constant delay after the azan", () => {
    const rule = normalizeIqamah({ mode: "delay", delayMin: 15 });
    expect(resolveIqamah(azan, rule, date)?.minutes).toBe(5 * 60 + 33);
    expect(describeIqamah(rule, resolveIqamah(azan, rule, date))).toBe("+15m");
  });

  it("resolves a fixed clock time", () => {
    const rule = normalizeIqamah({ mode: "clock", clock: "13:30" });
    expect(resolveIqamah(11 * 60 + 50, rule, date)?.minutes).toBe(13 * 60 + 30);
  });

  it("returns null rather than inventing a time when the policy is incomplete", () => {
    expect(resolveIqamah(azan, normalizeIqamah({ mode: "clock" }), date)).toBeNull();
    expect(resolveIqamah(azan, normalizeIqamah({ mode: "delay", delayMin: 0 }), date)).toBeNull();
    expect(resolveIqamah(azan, normalizeIqamah({ mode: "table", table: [] }), date)).toBeNull();
  });

  it("applies the seasonal table entry in force, including before the first date", () => {
    const rule = normalizeIqamah({
      mode: "table",
      table: [
        { from: "2026-04-01", clock: "13:45" },
        { from: "2026-01-01", clock: "13:30" },
        { from: "2026-10-01", clock: "13:15" },
      ],
    });
    expect(rule.table.map((e) => e.from)).toEqual(["2026-01-01", "2026-04-01", "2026-10-01"]);
    expect(resolveIqamah(11 * 60 + 50, rule, dhakaDate(2, 1))?.minutes).toBe(13 * 60 + 30);
    expect(resolveIqamah(11 * 60 + 50, rule, dhakaDate(12, 31))?.minutes).toBe(13 * 60 + 15);
    // Before the earliest row the earliest row still applies.
    expect(resolveIqamah(11 * 60 + 50, rule, dhakaDate(1, 1, 2025))?.minutes).toBe(13 * 60 + 30);
  });

  it("supports delay rows inside a table and carries the entry in force", () => {
    const rule = normalizeIqamah({
      mode: "table",
      table: [{ from: "2026-01-01", delayMin: 20 }],
    });
    const resolved = resolveIqamah(azan, rule, date);
    expect(resolved?.minutes).toBe(azan + 20);
    expect(resolved?.entry?.from).toBe("2026-01-01");
  });

  it("drops invalid rows, dedupes dates (last wins) and caps the table", () => {
    const rule = normalizeIqamah({
      mode: "table",
      table: [
        { from: "not-a-date", clock: "10:00" },
        { from: "2026-03-01", clock: "13:00" },
        { from: "2026-03-01", clock: "14:00" },
        { from: "2026-05-01", clock: "25:99" },
        { from: "2026-05-01", delayMin: 10 },
      ],
    });
    expect(rule.table).toHaveLength(2);
    expect(rule.table[0]).toEqual({ from: "2026-03-01", clock: "14:00", delayMin: null });
    expect(rule.table[1]).toEqual({ from: "2026-05-01", clock: null, delayMin: 10 });
    const many = Array.from({ length: MAX_IQAMAH_TABLE + 20 }, (_, i) => ({
      from: `2026-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 27) + 1).padStart(2, "0")}`,
      clock: "13:00",
    }));
    expect(normalizeIqamah({ mode: "table", table: many }).table.length).toBeLessThanOrEqual(MAX_IQAMAH_TABLE);
  });

  it("accepts JSON strings (the database representation)", () => {
    const rule = normalizeIqamah('{"mode":"delay","delayMin":10}');
    expect(rule.mode).toBe("delay");
    expect(rule.delayMin).toBe(10);
    expect(normalizeIqamah("{broken").mode).toBe("none");
  });
});

describe("calculation settings feed the engine", () => {
  const date = dhakaDate(6, 21);

  it("applies the configured elevation to sunrise/maghrib", () => {
    const sea = buildSchedule(date, DHAKA, [])[4].astroMinutes;
    const hill = buildSchedule(date, { ...DHAKA, elevationMeters: 1600 }, [])[4].astroMinutes;
    expect(hill).toBeGreaterThan(sea - 1);
    expect(Math.abs(hill - sea)).toBeGreaterThanOrEqual(3);
  });

  it("honours the high-latitude rule for a London summer", () => {
    const london: CalibrationContext = {
      latitude: 51.5074, longitude: -0.1278, timezone: "Europe/London",
      // MWL's 17° angle is never reached at London's solstice, so the
      // high-latitude rule is what decides Fajr and Isha.
      method: "MWL", asrJuristic: "Standard",
    };
    const strict = buildSchedule(dhakaDate(6, 21), { ...london, highLatitudeRule: "middleOfNight" }, []);
    const sixtieth = buildSchedule(dhakaDate(6, 21), { ...london, highLatitudeRule: "angle" }, []);
    // Middle-of-night puts summer Fajr around 01:00; the sixtieth rule puts it
    // near 02:30-03:00 — the difference the rule setting exists to control.
    const diff = Math.abs(strict[0].astroMinutes - sixtieth[0].astroMinutes);
    expect(diff).toBeGreaterThan(30);
  });

  it("exposes every rule as a user choice", () => {
    expect(HIGH_LATITUDE_CHOICES.map((c) => c.id).sort()).toEqual(
      ["angle", "auto", "middleOfNight", "none", "seventh"].sort(),
    );
  });
});

describe("buildSchedule", () => {
  const prefs: SchedulePref[] = [
    {
      prayerKey: "fajr", mode: "dynamicOffset", offsetMinutes: 23, stepMinutes: 0,
      fixedTime: null, customTime: "05:18", calibratedAt: "2026-11-15",
      iqamah: { mode: "delay", delayMin: 15 }, reminderAt: "iqamah",
    },
    {
      prayerKey: "dhuhr", mode: "clock", offsetMinutes: 0, stepMinutes: 15,
      fixedTime: null, customTime: null, calibratedAt: null,
    },
  ];

  it("emits azan and jamaat as separate fields", () => {
    const items = buildSchedule(dhakaDate(11, 15), DHAKA, prefs);
    const fajr = items[0];
    expect(fajr.azanMinutes).toBe(fajr.minutes);
    expect(fajr.offsetMinutes).toBe(23);
    expect(fajr.iqamahMinutes).toBe(fajr.azanMinutes + 15);
    expect(fajr.reminderAt).toBe("iqamah");
    expect(fajr.reminderMinutes).toBe(fajr.iqamahMinutes);
  });

  it("never lets a jamaat change move the azan, or vice versa", () => {
    const before = buildSchedule(dhakaDate(11, 15), DHAKA, prefs)[0];
    const changed = buildSchedule(dhakaDate(11, 15), DHAKA, [
      { ...prefs[0], iqamah: { mode: "clock", clock: "06:00" } },
    ])[0];
    expect(changed.azanMinutes).toBe(before.azanMinutes);
    expect(changed.iqamahMinutes).toBe(6 * 60);
    expect(describeScheduleItem(before)).toContain("azan 05:18");
    expect(describeScheduleItem(before)).toContain("jamaat 05:33");
  });

  it("honours fixed clock mode for the azan but keeps jamaat independent", () => {
    const items = buildSchedule(dhakaDate(11, 15), DHAKA, [
      {
        prayerKey: "dhuhr", mode: "fixedClock", offsetMinutes: 0, stepMinutes: 0,
        fixedTime: "13:30", customTime: null, calibratedAt: "2026-11-15",
        iqamah: { mode: "delay", delayMin: 10 },
      },
    ]);
    const dhuhr = items[2];
    expect(dhuhr.mode).toBe("fixedClock");
    expect(dhuhr.azanMinutes).toBe(13 * 60 + 30);
    expect(dhuhr.iqamahMinutes).toBe(13 * 60 + 40);
    expect(describeScheduleItem(dhuhr)).toContain("fixed 13:30");
  });

  it("respects reminderEnabled = false", () => {
    const items = buildSchedule(dhakaDate(11, 15), DHAKA, [{ ...prefs[0], reminderEnabled: false }]);
    expect(items[0].reminder).toBe(false);
  });
});
