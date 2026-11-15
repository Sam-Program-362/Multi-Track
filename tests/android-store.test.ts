import { beforeEach, describe, expect, it } from "vitest";
import { getPrayerPrefs, savePrayerPref, STORAGE_VERSION } from "../android/src/lib/storage";
import { __getRaw, __resetStore, __setRaw } from "./mocks/capacitor-preferences";
import { dateKey, normalizeIqamah } from "../src/lib/calibration";
import { computePrayerMinutes } from "../src/lib/prayer";
import { zoneOffsetForDate } from "../src/lib/calibration";

const STORAGE_KEY = "multitrack:store:v1";

function seed(payload: unknown) {
  __setRaw(STORAGE_KEY, JSON.stringify(payload));
}

function storedPayload(): Record<string, unknown> {
  return JSON.parse(__getRaw(STORAGE_KEY) ?? "{}") as Record<string, unknown>;
}

/** Fajr today in Dhaka, so migration expectations do not depend on the date. */
function dhakaFajrToday(): number {
  const now = new Date();
  return Math.round(
    computePrayerMinutes(now, {
      latitude: 23.8103,
      longitude: 90.4125,
      timezoneOffsetHours: zoneOffsetForDate(now, "Asia/Dhaka") / 60,
      method: "Karachi",
      asrJuristic: "Standard",
    }).fajr,
  );
}

beforeEach(() => {
  __resetStore();
});

describe("Android local store migrations", () => {
  it("starts from defaults on a fresh install", async () => {
    expect(await getPrayerPrefs()).toEqual([]);
    expect(storedPayload().version).toBe(STORAGE_VERSION);
  });

  it("upgrades a v1 static override into a Δuser offset (no data loss)", async () => {
    seed({
      version: 1,
      settings: { locationName: "Dhaka, Bangladesh", latitude: 23.8103, longitude: 90.4125, timezone: "Asia/Dhaka", method: "Karachi" },
      clocks: [],
      prefs: [{ prayerKey: "fajr", customTime: "05:18", offsetMinutes: 0, reminderEnabled: true }],
    });
    const [fajr] = await getPrayerPrefs();
    expect(fajr.mode).toBe("dynamicOffset");
    expect(fajr.customTime).toBe("05:18");
    expect(fajr.calibratedAt).toBe(dateKey(new Date()));
    expect(fajr.offsetMinutes).toBe(318 - dhakaFajrToday());
    // Migration is persisted once, so the offset stops being re-derived daily.
    expect(storedPayload().version).toBe(STORAGE_VERSION);
    const persisted = (storedPayload().prefs as Array<Record<string, unknown>>)[0];
    expect(persisted.offsetMinutes).toBe(fajr.offsetMinutes);
  });

  it("keeps a v1 fixed clock time pinned", async () => {
    seed({
      version: 1,
      prefs: [{ prayerKey: "dhuhr", mode: "fixedClock", fixedTime: "13:30", customTime: "13:30", offsetMinutes: 0 }],
    });
    const [dhuhr] = await getPrayerPrefs();
    expect(dhuhr.mode).toBe("fixedClock");
    expect(dhuhr.fixedTime).toBe("13:30");
    expect(dhuhr.calibratedAt).toBeTruthy();
  });

  it("preserves a v2 calibration untouched and adds the jamaat defaults", async () => {
    seed({
      version: 2,
      prefs: [
        {
          prayerKey: "fajr",
          mode: "dynamicOffset",
          offsetMinutes: 23,
          stepMinutes: 0,
          fixedTime: null,
          customTime: "05:18",
          calibratedAt: "2026-11-15",
          reminderEnabled: true,
        },
      ],
    });
    const [fajr] = await getPrayerPrefs();
    expect(fajr.offsetMinutes).toBe(23);
    expect(fajr.calibratedAt).toBe("2026-11-15");
    expect(fajr.iqamah).toEqual(normalizeIqamah(undefined));
    expect(fajr.reminderAt).toBe("azan");
  });

  it("migrates a v2 payload that already carries an iqamah table", async () => {
    seed({
      version: 2,
      prefs: [
        {
          prayerKey: "dhuhr",
          mode: "dynamicOffset",
          offsetMinutes: 0,
          calibratedAt: "2026-11-15",
          iqamah: {
            mode: "table",
            table: [
              { from: "2026-10-01", clock: "13:15" },
              { from: "bogus", clock: "12:00" },
            ],
          },
          reminderAt: "iqamah",
        },
      ],
    });
    const [dhuhr] = await getPrayerPrefs();
    expect(dhuhr.iqamah.mode).toBe("table");
    expect(dhuhr.iqamah.table).toEqual([{ from: "2026-10-01", clock: "13:15", delayMin: null }]);
    expect(dhuhr.reminderAt).toBe("iqamah");
  });

  it("survives corrupt storage without throwing away the app", async () => {
    __setRaw(STORAGE_KEY, "{not json");
    expect(await getPrayerPrefs()).toEqual([]);
  });

  it("drops invalid legacy rows but keeps the valid ones", async () => {
    seed({
      version: 1,
      prefs: [
        { prayerKey: "not-a-prayer", customTime: "05:00" },
        { prayerKey: "isha", customTime: "19:30" },
      ],
    });
    const prefs = await getPrayerPrefs();
    expect(prefs.map((p) => p.prayerKey)).toEqual(["isha"]);
  });

  it("keeps the mosque policy when an azan-only save comes in", async () => {
    seed({
      version: 3,
      prefs: [
        {
          prayerKey: "fajr",
          mode: "dynamicOffset",
          offsetMinutes: 23,
          calibratedAt: "2026-11-15",
          iqamah: { mode: "delay", delayMin: 15 },
          reminderAt: "iqamah",
        },
      ],
    });
    const [before] = await getPrayerPrefs();
    const after = await savePrayerPref({ ...before, offsetMinutes: 25, iqamah: undefined as never });
    const fajr = after.find((p) => p.prayerKey === "fajr")!;
    expect(fajr.offsetMinutes).toBe(25);
    expect(fajr.iqamah).toEqual(before.iqamah);
    expect(fajr.reminderAt).toBe("iqamah");
  });

  it("stores a full jamaat policy round-trip", async () => {
    seed({
      version: 3,
      prefs: [
        { prayerKey: "isha", mode: "dynamicOffset", offsetMinutes: 0, calibratedAt: "2026-11-15" },
      ],
    });
    const [before] = await getPrayerPrefs();
    const saved = await savePrayerPref({
      ...before,
      iqamah: { mode: "clock", delayMin: 0, clock: "21:00", table: [] },
      reminderAt: "iqamah",
    });
    const isha = saved.find((p) => p.prayerKey === "isha")!;
    expect(isha.iqamah).toEqual({ mode: "clock", delayMin: 0, clock: "21:00", table: [] });
    expect(isha.reminderAt).toBe("iqamah");
  });

  it("upgrades an unknown future payload without losing prayers", async () => {
    seed({
      version: 99,
      prefs: [{ prayerKey: "asr", mode: "steppedOffset", offsetMinutes: 5, stepMinutes: 10, calibratedAt: "2026-11-15" }],
    });
    const prefs = await getPrayerPrefs();
    expect(prefs).toHaveLength(1);
    expect(prefs[0].stepMinutes).toBe(10);
    expect(storedPayload().version).toBe(STORAGE_VERSION);
  });
});
