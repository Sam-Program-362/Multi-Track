import {
  boolean,
  doublePrecision,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** Single-profile app settings (location, calculation method, preferences). */
export const appSettings = pgTable(
  "app_settings",
  {
    id: serial("id").primaryKey(),
    profile: text("profile").notNull().default("default"),
    locationName: text("location_name").notNull().default("Dhaka, Bangladesh"),
    latitude: doublePrecision("latitude").notNull().default(23.8103),
    longitude: doublePrecision("longitude").notNull().default(90.4125),
    timezone: text("timezone").notNull().default("Asia/Dhaka"),
    method: text("method").notNull().default("Karachi"),
    asrJuristic: text("asr_juristic").notNull().default("Standard"),
    use24Hour: boolean("use_24_hour").notNull().default(false),
    remindersEnabled: boolean("reminders_enabled").notNull().default(true),
    reminderSound: text("reminder_sound").notNull().default("chime"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("app_settings_profile_idx").on(table.profile)],
);

/** User-added world clocks. */
export const worldClocks = pgTable("world_clocks", {
  id: serial("id").primaryKey(),
  label: text("label").notNull(),
  timezone: text("timezone").notNull(),
  accent: text("accent").notNull().default("cyan"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

/**
 * Per-prayer calibration state.
 *
 * `offsetMinutes` holds Δuser(p) — the gap between the user's entered time and
 * the astronomical baseline on `calibratedAt`. `customTime` is legacy: it keeps
 * the clock time the user once typed for reference, but it is never used to
 * schedule anything (that would reintroduce seasonal drift).
 */
export const prayerPrefs = pgTable(
  "prayer_prefs",
  {
    id: serial("id").primaryKey(),
    prayerKey: text("prayer_key").notNull(),
    label: text("label").notNull().default(""),
    /** dynamicOffset | steppedOffset | fixedClock */
    mode: text("mode").notNull().default("dynamicOffset"),
    customTime: text("custom_time"),
    offsetMinutes: integer("offset_minutes").notNull().default(0),
    /** Quantisation step S in minutes (5/10/15), 0 = off. */
    stepMinutes: integer("step_minutes").notNull().default(0),
    /** "HH:mm" used when mode = fixedClock. */
    fixedTime: text("fixed_time"),
    /** Calibration date d0 as "YYYY-MM-DD". */
    calibratedAt: text("calibrated_at"),
    reminderEnabled: boolean("reminder_enabled").notNull().default(true),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("prayer_prefs_key_idx").on(table.prayerKey)],
);

export type AppSettingsRow = typeof appSettings.$inferSelect;
export type WorldClockRow = typeof worldClocks.$inferSelect;
export type PrayerPrefRow = typeof prayerPrefs.$inferSelect;
