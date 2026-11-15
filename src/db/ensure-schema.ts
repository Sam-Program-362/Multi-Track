import { sql, type SQL } from "drizzle-orm";
import { db } from "./index";
import { assertTablesPresent, type TableProbe } from "./bootstrap";
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
 * Two distinct situations are reported separately:
 *
 *  1. **Foundational tables missing** — the database was never bootstrapped
 *     (fresh Neon branch, only `neon_auth` present). Everything fails with
 *     `relation "app_settings" does not exist`, which is a one-time setup
 *     problem, not a transient one. The catalog is probed first and the error
 *     names the missing tables and the bootstrap script
 *     (`docs/sql/001_initial_schema.sql`). Tables are never created here: the
 *     owner applies the reviewed script.
 *  2. **Columns missing** — the tables exist but predate a feature. The DDL
 *     below adds them.
 *
 * The statements are `ADD COLUMN IF NOT EXISTS`, so applying them repeatedly is
 * free. Success is cached; failure is not (see `schema-gate.ts`), so a cold
 * start during a database blip recovers on the next request instead of leaving
 * the process permanently degraded. A missing-table failure is retried too, so
 * the app starts working as soon as the bootstrap script has been applied —
 * no redeploy needed.
 */

/** Which of the required tables exist in `public` (null = missing). */
const PROBE_TABLES = sql`
  SELECT
    to_regclass('public.app_settings')::text AS app_settings,
    to_regclass('public.world_clocks')::text AS world_clocks,
    to_regclass('public.prayer_prefs')::text AS prayer_prefs
`;

/** Column additions for an already-initialised database. Safe to repeat. */
const ADD_SETTINGS_COLUMNS = sql`
  ALTER TABLE app_settings
    ADD COLUMN IF NOT EXISTS elevation_meters double precision NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS high_latitude_rule text NOT NULL DEFAULT 'auto'
`;

const ADD_PRAYER_COLUMNS = sql`
  ALTER TABLE prayer_prefs
    ADD COLUMN IF NOT EXISTS mode text NOT NULL DEFAULT 'dynamicOffset',
    ADD COLUMN IF NOT EXISTS step_minutes integer NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS fixed_time text,
    ADD COLUMN IF NOT EXISTS calibrated_at text,
    ADD COLUMN IF NOT EXISTS iqamah text,
    ADD COLUMN IF NOT EXISTS reminder_at text NOT NULL DEFAULT 'azan'
`;

export type SqlExecutor = (query: SQL) => Promise<unknown>;

/**
 * Builds the apply step around a SQL executor so the ordering (probe first,
 * DDL second) can be tested without a Postgres server.
 */
export function createSchemaApply(execute: SqlExecutor): () => Promise<void> {
  return async function applyPrayerSchema(): Promise<void> {
    const probe = (await execute(PROBE_TABLES)) as { rows?: TableProbe[] } | undefined;
    // A missing table must stop the sequence before any DDL runs, so the user
    // sees the bootstrap instruction instead of a raw "does not exist" error.
    assertTablesPresent(probe?.rows?.[0] ?? {});
    await execute(ADD_SETTINGS_COLUMNS);
    await execute(ADD_PRAYER_COLUMNS);
  };
}

/** Process-wide gate used by every read and write path. */
export const prayerSchemaGate: SchemaGate = createSchemaGate(
  createSchemaApply((query) => db.execute(query)),
  "prayer-schema",
);

export function ensurePrayerCalibrationSchema(): Promise<SchemaStatus> {
  return prayerSchemaGate.ensure();
}
