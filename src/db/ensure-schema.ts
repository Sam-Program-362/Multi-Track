import { sql } from "drizzle-orm";
import { db } from "./index";
import {
  createSchemaGate,
  type SchemaGate,
  type SchemaStatus,
} from "./schema-gate";

export type { SchemaGate, SchemaStatus } from "./schema-gate";

/**
 * Schema self-check for the prayer calibration / jamaat columns.
 *
 * This template ships without a migration runner: development uses
 * `drizzle-kit push` and deploys go straight to the database created by the
 * Vercel/Neon integration. Adding columns in `schema.ts` alone would therefore
 * leave the deployed database behind, and every prayer read/write would fail
 * with "column does not exist".
 *
 * The statements are `ADD COLUMN IF NOT EXISTS`, so applying them repeatedly is
 * free. Success is cached; failure is not (see `schema-gate.ts`), so a cold
 * start during a database blip recovers on the next request instead of leaving
 * the process permanently degraded.
 */

/** The real, idempotent DDL. Both statements are safe to repeat. */
async function applyPrayerSchema(): Promise<void> {
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
}

/** Process-wide gate used by every read and write path. */
export const prayerSchemaGate: SchemaGate = createSchemaGate(
  applyPrayerSchema,
  "prayer-schema",
);

export function ensurePrayerCalibrationSchema(): Promise<SchemaStatus> {
  return prayerSchemaGate.ensure();
}
