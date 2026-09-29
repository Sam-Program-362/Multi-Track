import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { appSettings, prayerPrefs, worldClocks } from "@/db/schema";
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

export async function getPrayerPrefs(): Promise<PrayerPref[]> {
  try {
    const rows = await db.select().from(prayerPrefs);
    return rows.map((row) => ({
      prayerKey: row.prayerKey,
      customTime: row.customTime,
      offsetMinutes: row.offsetMinutes,
      reminderEnabled: row.reminderEnabled,
    }));
  } catch {
    return [];
  }
}
