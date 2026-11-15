import type { appSettings, prayerPrefs, worldClocks } from "@/db/schema";
import type { SchemaStatus } from "@/db/schema-gate";
import {
  contextFrom,
  formatClock,
  normalizeIqamah,
  normalizeStoredRule,
  parseClock,
  parseDateKey,
  sanitizeMode,
  sanitizeOffset,
  sanitizeReminderTarget,
  sanitizeStep,
} from "./calibration";
import type { HighLatitudeRule, MethodKey } from "./prayer";
import type { PrayerPref, Settings } from "./types";

/**
 * The database-independent half of the server data layer.
 *
 * Everything that decides *what* to read, in which order, and whether a legacy
 * prayer row may be converted to Δuser lives here. It depends only on the
 * `AppStore` interface, so the exact home-page sequence can be exercised
 * against a fake "old database" without a Postgres server or DATABASE_URL.
 */

export type SettingsRow = typeof appSettings.$inferSelect;
export type PrayerRow = typeof prayerPrefs.$inferSelect;
export type ClockRow = typeof worldClocks.$inferSelect;

/** The columns written back when a stored prayer row is upgraded/normalised. */
export type PrayerRowUpdate = {
  prayerKey: string;
  mode: string;
  offsetMinutes: number;
  stepMinutes: number;
  fixedTime: string | null;
  calibratedAt: string | null;
  iqamah: string;
  reminderAt: string;
};

/** The database operations the loading sequence needs. */
export type AppStore = {
  ensureSchema(): Promise<SchemaStatus>;
  readSettingsRow(): Promise<SettingsRow | null>;
  /** Create the singleton settings row; null when another request won the race. */
  insertDefaultSettings(): Promise<SettingsRow | null>;
  readPrayerRows(): Promise<PrayerRow[]>;
  updatePrayerRow(values: PrayerRowUpdate): Promise<void>;
};

export const DEFAULT_SETTINGS: Settings = {
  id: 0,
  locationName: "Dhaka, Bangladesh",
  latitude: 23.8103,
  longitude: 90.4125,
  timezone: "Asia/Dhaka",
  method: "Karachi",
  asrJuristic: "Standard",
  elevationMeters: 0,
  highLatitudeRule: "auto",
  use24Hour: false,
  remindersEnabled: true,
  reminderSound: "chime",
};

export function rowToSettings(row: SettingsRow): Settings {
  return {
    id: row.id,
    locationName: row.locationName,
    latitude: row.latitude,
    longitude: row.longitude,
    timezone: row.timezone,
    method: row.method as MethodKey,
    asrJuristic: row.asrJuristic === "Hanafi" ? "Hanafi" : "Standard",
    elevationMeters: Number.isFinite(row.elevationMeters) ? row.elevationMeters : 0,
    highLatitudeRule: (row.highLatitudeRule as HighLatitudeRule) ?? "auto",
    use24Hour: row.use24Hour,
    remindersEnabled: row.remindersEnabled,
    reminderSound: row.reminderSound,
  };
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

/**
 * What the caller is allowed to do with the settings it received.
 *
 * `fromDatabase` is strictly "this is the row the user saved". The built-in
 * defaults — used when the database is unavailable — are never a valid basis
 * for converting stored prayer times into Δuser offsets.
 */
export type SettingsSnapshot = {
  settings: Settings;
  fromDatabase: boolean;
  schema: SchemaStatus;
  /** Human-readable failure, surfaced in the UI and by the API. Never silent. */
  notice: string | null;
};

/**
 * Read the singleton settings row, with the schema guaranteed first.
 *
 * Order matters: the settings row gained `elevation_meters` and
 * `high_latitude_rule`, so selecting it before the DDL has run throws
 * "column does not exist". That error used to be swallowed into Dhaka defaults,
 * which were then used to derive legacy prayer offsets.
 */
export async function loadSettingsSnapshot(store: AppStore): Promise<SettingsSnapshot> {
  const schema = await store.ensureSchema();
  if (!schema.ok) {
    return {
      settings: { ...DEFAULT_SETTINGS },
      fromDatabase: false,
      schema,
      notice: `Database schema is not ready (${schema.error}). Prayer times are read-only; nothing was migrated.`,
    };
  }

  try {
    const row = await store.readSettingsRow();
    if (row) {
      return { settings: rowToSettings(row), fromDatabase: true, schema, notice: null };
    }

    // No row yet: this is a brand-new profile. The seeded defaults are this
    // install's starting point, so they are safe to use from here on.
    const created = await store.insertDefaultSettings();
    if (created) {
      return { settings: rowToSettings(created), fromDatabase: true, schema, notice: null };
    }
    return {
      settings: { ...DEFAULT_SETTINGS },
      fromDatabase: false,
      schema,
      notice:
        "The settings row could not be created; showing built-in defaults. Nothing was migrated.",
    };
  } catch (error) {
    const detail = describe(error);
    console.error(`[settings] read failed: ${detail}`);
    return {
      settings: { ...DEFAULT_SETTINGS },
      fromDatabase: false,
      schema,
      notice: `Settings could not be read (${detail}). Showing built-in defaults; nothing was migrated.`,
    };
  }
}

/**
 * A stored rule with **no legacy conversion**: what the row literally holds.
 * Used whenever the user's real settings are unavailable, so nothing is guessed.
 */
function storedRuleFromRow(row: PrayerRow) {
  const clock = parseClock(row.fixedTime);
  return {
    mode: sanitizeMode(row.mode),
    offsetMin: sanitizeOffset(row.offsetMinutes ?? 0),
    stepMin: sanitizeStep(row.stepMinutes ?? 0),
    fixedClock: clock === null ? null : formatClock(clock),
    calibratedAt: parseDateKey(row.calibratedAt),
  };
}

export type PrayerPrefsLoad = {
  prefs: PrayerPref[];
  /** How many stored rows were upgraded in this pass. */
  migrated: number;
  notice: string | null;
  canMigrate: boolean;
};

/**
 * Read prayer preferences, converting legacy rows **only** with the user's own
 * saved settings.
 *
 * Guard rails:
 *  - the schema must be ready (otherwise the new columns cannot be read);
 *  - the settings must come from the database, never from built-in defaults;
 *  - a failed backfill is reported, not swallowed.
 */
export async function loadPrayerPrefs(
  store: AppStore,
  snapshot: SettingsSnapshot,
): Promise<PrayerPrefsLoad> {
  if (!snapshot.schema.ok) {
    return {
      prefs: [],
      migrated: 0,
      notice: snapshot.notice ?? "Database schema is not ready.",
      canMigrate: false,
    };
  }

  const canMigrate = snapshot.fromDatabase && snapshot.notice === null;
  let rows: PrayerRow[];
  try {
    rows = await store.readPrayerRows();
  } catch (error) {
    const detail = describe(error);
    console.error(`[prayers] read failed: ${detail}`);
    return {
      prefs: [],
      migrated: 0,
      notice: `Prayer preferences could not be read (${detail}).`,
      canMigrate: false,
    };
  }

  const ctx = contextFrom(snapshot.settings);
  const now = new Date();

  const entries = rows.map((row) => {
    const iqamah = normalizeIqamah(row.iqamah);
    const iqamahText = JSON.stringify(iqamah);
    const reminderAt = sanitizeReminderTarget(row.reminderAt);
    // Without a trustworthy context a stored row is shown exactly as it is:
    // deriving an offset from fallback defaults would corrupt it permanently.
    const rule = canMigrate
      ? normalizeStoredRule(
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
        )
      : storedRuleFromRow(row);

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
        iqamah,
        reminderAt,
      } satisfies PrayerPref,
      dirty:
        canMigrate &&
        (rule.calibratedAt !== row.calibratedAt ||
          rule.offsetMin !== row.offsetMinutes ||
          rule.mode !== row.mode ||
          rule.stepMin !== row.stepMinutes ||
          rule.fixedClock !== row.fixedTime ||
          iqamahText !== (row.iqamah ?? null) ||
          reminderAt !== row.reminderAt),
    };
  });

  const stale = entries.filter((entry) => entry.dirty);
  let migrated = 0;
  let notice: string | null = null;
  if (stale.length > 0) {
    const results = await Promise.allSettled(
      stale.map((entry) =>
        store.updatePrayerRow({
          prayerKey: entry.pref.prayerKey,
          mode: entry.pref.mode,
          offsetMinutes: entry.pref.offsetMinutes,
          stepMinutes: entry.pref.stepMinutes,
          fixedTime: entry.pref.fixedTime,
          calibratedAt: entry.pref.calibratedAt,
          iqamah: JSON.stringify(entry.pref.iqamah),
          reminderAt: entry.pref.reminderAt,
        }),
      ),
    );
    migrated = results.filter((result) => result.status === "fulfilled").length;
    const failed = results.length - migrated;
    if (failed > 0) {
      const first = results.find((result) => result.status === "rejected");
      const detail =
        first && first.status === "rejected" ? describe(first.reason) : "unknown error";
      console.error(`[prayers] ${failed} upgrade write(s) failed: ${detail}`);
      notice = `${failed} prayer preference(s) could not be upgraded (${detail}). They will be retried on the next load.`;
    }
  }

  return {
    prefs: entries.map((entry) => entry.pref),
    migrated,
    notice,
    canMigrate,
  };
}

export type HomeData = {
  settings: Settings;
  prefs: PrayerPref[];
  notice: string | null;
  schemaOk: boolean;
  /**
   * True only when the settings used for this render were read from the
   * database, i.e. the derived prayer schedule may be treated as the user's.
   * When false the UI must not show calculated prayer times and must not fire
   * reminders; stored preferences and calibration are left untouched.
   */
  scheduleVerified: boolean;
};

/**
 * The exact sequence the home page runs: schema → settings → preferences.
 * Kept in one place because the order is the safety property.
 */
export async function loadHomeData(store: AppStore): Promise<HomeData> {
  const snapshot = await loadSettingsSnapshot(store);
  const prayerLoad = await loadPrayerPrefs(store, snapshot);
  return {
    settings: snapshot.settings,
    prefs: prayerLoad.prefs,
    notice: snapshot.notice ?? prayerLoad.notice,
    schemaOk: snapshot.schema.ok,
    scheduleVerified: snapshot.fromDatabase && snapshot.notice === null,
  };
}
