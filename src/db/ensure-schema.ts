import { sql } from "drizzle-orm";
import { db } from "./index";

/**
 * Schema self-check for the prayer calibration columns.
 *
 * This template ships without a migration runner: development uses
 * `drizzle-kit push` and deploys go straight to the database created by the
 * Vercel/Neon integration. Adding columns in `schema.ts` alone would therefore
 * leave the deployed database behind, and every prayer read/write would fail
 * with "column does not exist".
 *
 * `ADD COLUMN IF NOT EXISTS` is idempotent and cheap, and the result is cached
 * per process, so it costs one extra statement on a cold start and nothing
 * afterwards. The same statements live in
 * `docs/migrations/2026-11-15-prayer-calibration.sql` for anyone who prefers to
 * run migrations out of band.
 */
let schemaReady: Promise<boolean> | null = null;

export function ensurePrayerCalibrationSchema(): Promise<boolean> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await db.execute(sql`
        ALTER TABLE app_settings
          ADD COLUMN IF NOT EXISTS elevation_meters double precision NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS high_latitude_rule text NOT NULL DEFAULT 'auto'
      `);
      await db.execute(sql`
        ALTER TABLE prayer_prefs
          ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'dynamicOffset',
          ADD COLUMN IF NOT EXISTS step_minutes integer NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS fixed_time text,
          ADD COLUMN IF NOT EXISTS calibrated_at text,
          ADD COLUMN IF NOT EXISTS iqamah text,
          ADD COLUMN IF NOT EXISTS reminder_at text NOT NULL DEFAULT 'azan'
      `);
      return true;
    })().catch(() => false);
  }
  return schemaReady;
}
