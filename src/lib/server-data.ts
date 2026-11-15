import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { ensurePrayerCalibrationSchema } from "@/db/ensure-schema";
import { appSettings, prayerPrefs, worldClocks } from "@/db/schema";
import {
  loadHomeData as loadHomeDataWith,
  loadPrayerPrefs as loadPrayerPrefsWith,
  loadSettingsSnapshot as loadSettingsSnapshotWith,
  type AppStore,
  type ClockRow,
  type PrayerPrefsLoad,
  type SettingsSnapshot,
} from "./app-store";
import type { PrayerPref, Settings, WorldClock } from "./types";

export { DEFAULT_SETTINGS } from "./app-store";
export type {
  AppStore,
  HomeData,
  PrayerRow,
  PrayerRowUpdate,
  PrayerPrefsLoad,
  SettingsRow,
  SettingsSnapshot,
} from "./app-store";

/**
 * Drizzle adapter for the loading sequence in `./app-store`.
 *
 * The sequence itself is database-independent so it can be tested against a
 * fake old schema; this module is only the I/O.
 */
export const liveStore: AppStore = {
  ensureSchema: () => ensurePrayerCalibrationSchema(),

  async readSettingsRow() {
    const rows = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.profile, "default"))
      .limit(1);
    return rows[0] ?? null;
  },

  async insertDefaultSettings() {
    const inserted = await db
      .insert(appSettings)
      .values({ profile: "default" })
      .onConflictDoNothing({ target: appSettings.profile })
      .returning();
    if (inserted[0]) return inserted[0];
    const rows = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.profile, "default"))
      .limit(1);
    return rows[0] ?? null;
  },

  async readPrayerRows() {
    return db.select().from(prayerPrefs);
  },

  async updatePrayerRow(values) {
    await db.update(prayerPrefs).set(values).where(eq(prayerPrefs.prayerKey, values.prayerKey));
  },
};

/**
 * Production entry points: the pure sequence from `./app-store`, bound to the
 * live Drizzle store. Tests import the unbound versions with a fake store.
 */
export const loadSettingsSnapshot = (): Promise<SettingsSnapshot> =>
  loadSettingsSnapshotWith(liveStore);

export const loadPrayerPrefs = (snapshot: SettingsSnapshot): Promise<PrayerPrefsLoad> =>
  loadPrayerPrefsWith(liveStore, snapshot);

export const loadHomeData = () => loadHomeDataWith(liveStore);

/**
 * Settings for callers that only render them. A failure is logged and returned
 * as defaults for display, but `loadPrayerPrefs` will refuse to migrate on it.
 */
export async function getSettings(): Promise<Settings> {
  const snapshot = await loadSettingsSnapshot();
  if (snapshot.notice) console.error(`[settings] ${snapshot.notice}`);
  return snapshot.settings;
}

const SEED_CLOCKS: Array<Omit<WorldClock, "id">> = [
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

function toClock(row: ClockRow): WorldClock {
  return {
    id: row.id,
    label: row.label,
    timezone: row.timezone,
    accent: row.accent,
    sortOrder: row.sortOrder,
  };
}

/**
 * Backwards-compatible wrapper.
 *
 * Note the signature: it accepts a `SettingsSnapshot`, **not** a `Settings`.
 * Handing it bare settings (the old home-page order) is now a type error,
 * because a fallback context must never be used to derive offsets.
 */
export async function getPrayerPrefs(snapshot?: SettingsSnapshot): Promise<PrayerPref[]> {
  const resolved = snapshot ?? (await loadSettingsSnapshot());
  const load: PrayerPrefsLoad = await loadPrayerPrefs(resolved);
  if (load.notice) console.error(`[prayers] ${load.notice}`);
  return load.prefs;
}
