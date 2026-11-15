import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { appSettings, prayerPrefs, worldClocks } from "@/db/schema";
import { contextFrom, normalizeStoredRule } from "./calibration";
import type { MethodKey } from "./prayer";
import type { PrayerPref, Settings, WorldClock } from "./types";

const DEFAULT_SETTINGS: Settings = {
  id: 0,
  locationName: "Dhaka, Bangladesh",
  latitude: 23.8103,
  longitude: 90.4125,
  timezone: "Asia/Dhaka",
  method: "Karachi",
  asrJuristic: "Standard",
  use24Hour: false,
  remindersEnabled: true,
  reminderSound: "chime",
};

export async function getSettings(): Promise<Settings> {
  try {
    const rows = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.profile, "default"))
      .limit(1);
    if (rows.length === 0) {
      const inserted = await db
        .insert(appSettings)
        .values({ profile: "default" })
        .returning();
      return rowToSettings(inserted[0]);
    }
    return rowToSettings(rows[0]);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function rowToSettings(row: typeof appSettings.$inferSelect): Settings {
  return {
    id: row.id,
    locationName: row.locationName,
    latitude: row.latitude,
    longitude: row.longitude,
    timezone: row.timezone,
    method: row.method as MethodKey,
    asrJuristic: row.asrJuristic === "Hanafi" ? "Hanafi" : "Standard",
    use24Hour: row.use24Hour,
    remindersEnabled: row.remindersEnabled,
    reminderSound: row.reminderSound,
  };
}

const SEED_CLOCKS = [
  { label: "Makkah", timezone: "Asia/Riyadh", accent: "emerald", sortOrder: 1 },
  { label: "Dhaka", timezone: "Asia/Dhaka", accent: "cyan", sortOrder: 2 },
  { label: "London", timezone: "Europe/London", accent: "violet", sortOrder: 3 },
  { label: "New York", timezone: "America/New_York", accent: "amber", sortOrder: 4 },
];

export async function getClocks(): Promise<WorldClock[]> {
  try {
    const rows = await db.select().from(worldClocks).orderBy(asc(worldClocks.sortOrder));
    if (rows.length === 0) {
      const inserted = await db.insert(worldClocks).values(SEED_CLOCKS).returning();
      return inserted.map(toClock);
    }
    return rows.map(toClock);
  } catch {
    return SEED_CLOCKS.map((c, i) => ({ id: -(i + 1), ...c }));
  }
}

function toClock(row: typeof worldClocks.$inferSelect): WorldClock {
  return {
    id: row.id,
    label: row.label,
    timezone: row.timezone,
    accent: row.accent,
    sortOrder: row.sortOrder,
  };
}

/**
 * Prayers with their calibration state.
 *
 * Rows written before the calibration model existed only carry `customTime`
 * (a static override). They are upgraded on read: Δuser is recovered from the
 * old clock time against today's astronomical baseline, so the prayer keeps
 * showing the user's familiar time today and starts following the sun from
 * then on (no data loss, no manual re-entry). The derived rule is written
 * back, otherwise every read would re-pin the time to the entered clock value
 * and the time would never drift at all.
 */
export async function getPrayerPrefs(settings?: Settings): Promise<PrayerPref[]> {
  try {
    const rows = await db.select().from(prayerPrefs);
    const ctx = contextFrom(settings ?? (await getSettings()));
    const now = new Date();
    const prefs = rows.map((row) => {
      const rule = normalizeStoredRule(
        row.prayerKey,
        {
          mode: row.mode,
          offsetMinutes: row.offsetMinutes,
          stepMinutes: row.stepMinutes,
          fixedTime: row.fixedTime,
          customTime: row.customTime,
          calibratedAt: row.calibratedAt,
        },
        ctx,
        now,
      );
      return {
        pref: {
          prayerKey: row.prayerKey,
          mode: rule.mode,
          offsetMinutes: rule.offsetMin,
          stepMinutes: rule.stepMin,
          fixedTime: rule.fixedClock,
          customTime: row.customTime,
          calibratedAt: rule.calibratedAt,
          reminderEnabled: row.reminderEnabled,
        } satisfies PrayerPref,
        dirty:
          rule.calibratedAt !== row.calibratedAt ||
          rule.offsetMin !== row.offsetMinutes ||
          rule.mode !== row.mode ||
          rule.stepMin !== row.stepMinutes ||
          rule.fixedClock !== row.fixedTime,
      };
    });

    // One-time backfill of legacy rows; failures must not break loading.
    const stale = prefs.filter((entry) => entry.dirty);
    if (stale.length > 0) {
      await Promise.all(
        stale.map((entry) =>
          db
            .update(prayerPrefs)
            .set({
              mode: entry.pref.mode,
              offsetMinutes: entry.pref.offsetMinutes,
              stepMinutes: entry.pref.stepMinutes,
              fixedTime: entry.pref.fixedTime,
              calibratedAt: entry.pref.calibratedAt,
            })
            .where(eq(prayerPrefs.prayerKey, entry.pref.prayerKey))
            .catch(() => undefined),
        ),
      ).catch(() => undefined);
    }

    return prefs.map((entry) => entry.pref);
  } catch {
    return [];
  }
}
