import { describe, expect, it } from "vitest";
import { buildSchedule, type SchedulePref } from "../src/lib/calibration";
import {
  PRAYER_SCHEDULE_UNAVAILABLE_MESSAGE,
  reminderPrayers,
  visiblePrayerSchedule,
} from "../src/lib/prayer-visibility";

/**
 * The prayer panel must not render times calculated from fallback settings, and
 * must not fire reminders from them. Both decisions go through these helpers,
 * so the panel cannot drift from what is tested here.
 */

const SETTINGS = {
  latitude: 23.8103,
  longitude: 90.4125,
  timezone: "Asia/Dhaka",
  method: "Karachi" as const,
  asrJuristic: "Standard" as const,
};

const PREFS: SchedulePref[] = [
  {
    prayerKey: "fajr",
    mode: "dynamicOffset",
    offsetMinutes: 23,
    stepMinutes: 0,
    fixedTime: null,
    customTime: "05:18",
    calibratedAt: "2026-11-15",
    iqamah: { mode: "delay", delayMin: 15 },
    reminderAt: "iqamah",
  },
  {
    prayerKey: "dhuhr",
    mode: "dynamicOffset",
    offsetMinutes: 0,
    stepMinutes: 0,
    fixedTime: null,
    customTime: null,
    calibratedAt: null,
    reminderEnabled: false,
  },
];

const TODAY = new Date(2026, 10, 15);
const SCHEDULE = buildSchedule(TODAY, SETTINGS, PREFS);

describe("prayer visibility", () => {
  it("shows the normal schedule when the settings were verified", () => {
    const visible = visiblePrayerSchedule(SCHEDULE, true);
    expect(visible).toHaveLength(SCHEDULE.length);
    expect(visible[0].azanMinutes).toBe(5 * 60 + 18);
    expect(visible[0].iqamahMinutes).toBe(5 * 60 + 33);
  });

  it("withholds every time when the settings were not verified", () => {
    expect(visiblePrayerSchedule(SCHEDULE, false)).toEqual([]);
  });

  it("only offers reminders for prayers that are enabled and prayer-time", () => {
    const candidates = reminderPrayers(SCHEDULE, true);
    // Sunrise is not a prayer; Dhuhr has reminders switched off.
    expect(candidates.map((item) => item.key)).toEqual(
      expect.arrayContaining(["fajr", "asr", "maghrib", "isha"]),
    );
    expect(candidates.map((item) => item.key)).not.toContain("sunrise");
    expect(candidates.map((item) => item.key)).not.toContain("dhuhr");
  });

  it("schedules no reminders at all when the settings were not verified", () => {
    expect(reminderPrayers(SCHEDULE, false)).toEqual([]);
  });

  it("does not mutate the schedule it is given", () => {
    const before = JSON.stringify(SCHEDULE);
    visiblePrayerSchedule(SCHEDULE, false);
    reminderPrayers(SCHEDULE, false);
    expect(JSON.stringify(SCHEDULE)).toBe(before);
  });

  it("has a message that says the data is safe and the schedule is withheld", () => {
    expect(PRAYER_SCHEDULE_UNAVAILABLE_MESSAGE).toMatch(/unavailable/i);
    expect(PRAYER_SCHEDULE_UNAVAILABLE_MESSAGE).toMatch(/safe/i);
  });
});
