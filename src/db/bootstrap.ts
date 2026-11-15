/**
 * Which foundational tables the app cannot work without, and how to say so.
 *
 * The self-healing mechanism in `ensure-schema.ts` only *adds columns* to
 * tables that already exist. On a database where the application tables were
 * never created (for example a fresh Neon database that only contains the Neon
 * Auth schema) every statement fails with a raw Postgres error such as
 * `relation "app_settings" does not exist`, which is neither actionable nor
 * obviously a one-time setup problem.
 *
 * This module turns that situation into a single, explicit message that points
 * at the reviewed bootstrap script. It is deliberately dependency-free so the
 * wording and the classification can be unit-tested without a database.
 */

/** Tables `src/db/schema.ts` defines and every code path needs. */
export const REQUIRED_TABLES = ["app_settings", "world_clocks", "prayer_prefs"] as const;

export type RequiredTable = (typeof REQUIRED_TABLES)[number];

/**
 * Result of probing the catalog with `to_regclass()`. `null` (or a missing key)
 * means the table does not exist in the `public` schema.
 */
export type TableProbe = Partial<Record<RequiredTable, string | null>>;

/** Where to go to create the missing tables. */
export const BOOTSTRAP_SCRIPT_PATH = "docs/sql/001_initial_schema.sql";

export const BOOTSTRAP_HINT =
  `Run ${BOOTSTRAP_SCRIPT_PATH} once in the Neon SQL Editor for this branch/database ` +
  `(or: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f ${BOOTSTRAP_SCRIPT_PATH}). ` +
  `Nothing was created, altered or migrated automatically, and no saved data was changed.`;

export function missingTables(probe: TableProbe): RequiredTable[] {
  return REQUIRED_TABLES.filter((table) => !probe[table]);
}

export function missingTablesMessage(missing: readonly RequiredTable[]): string {
  const tables = missing.map((table) => `public.${table}`).join(", ");
  const verb = missing.length === 1 ? "is" : "are";
  return `Database is not initialised: ${tables} ${verb} missing. ${BOOTSTRAP_HINT}`;
}

export class MissingTablesError extends Error {
  readonly tables: readonly RequiredTable[];

  constructor(missing: readonly RequiredTable[]) {
    super(missingTablesMessage(missing));
    this.name = "MissingTablesError";
    this.tables = missing;
  }
}

/** Throws `MissingTablesError` unless every required table is present. */
export function assertTablesPresent(probe: TableProbe): void {
  const missing = missingTables(probe);
  if (missing.length > 0) throw new MissingTablesError(missing);
}
