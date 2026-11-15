import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";

/**
 * Structural verification of `docs/sql/001_initial_schema.sql`.
 *
 * The script is the only thing that creates the application tables on a fresh
 * database (Neon), and `src/db/ensure-schema.ts` can only *add columns* after
 * that. Two schema paths therefore have to agree exactly:
 *
 *   * CREATE TABLE  — a brand-new database;
 *   * ALTER TABLE   — a database created by an older build.
 *
 * A real PostgreSQL (PGlite, the WASM build of Postgres 18) is used as the
 * oracle: the script is applied to both shapes of database and the resulting
 * columns, nullability, **defaults** and indexes are compared with each other
 * and with the model in `src/db/schema.ts`.
 */

const REPO = join(__dirname, "..");
const SCRIPT = readFileSync(join(REPO, "docs/sql/001_initial_schema.sql"), "utf8");

type Column = {
  table: string;
  column: string;
  type: string;
  nullable: boolean;
  default: string | null;
};

const SNAPSHOT_SQL = `
  SELECT table_name AS table, column_name AS column, data_type AS type,
         is_nullable AS nullable, column_default AS "default"
  FROM information_schema.columns
  WHERE table_schema = 'public'
  ORDER BY table_name, ordinal_position
`;

const INDEX_SQL = `
  SELECT indexname, indexdef FROM pg_indexes
  WHERE schemaname = 'public'
  ORDER BY indexname
`;

async function snapshot(db: PGlite) {
  const columns = (await db.query<{ table: string; column: string; type: string; nullable: string; default: string | null }>(SNAPSHOT_SQL)).rows
    .map((row) => ({
      table: row.table,
      column: row.column,
      type: row.type,
      nullable: row.nullable === "YES",
      default: row.default,
    }))
    .sort((a, b) => `${a.table}.${a.column}`.localeCompare(`${b.table}.${b.column}`));
  const indexes = (await db.query<{ indexname: string; indexdef: string }>(INDEX_SQL)).rows;
  return { columns, indexes };
}

/**
 * The tables as an older build created them: the settings row without the
 * elevation/high-latitude columns, prayer preferences without the calibration
 * and jamaat columns. Every database that predates a feature looks like this.
 */
const LEGACY_DDL = `
  CREATE TABLE public.app_settings (
    id serial PRIMARY KEY,
    profile text NOT NULL DEFAULT 'default',
    location_name text NOT NULL DEFAULT 'Dhaka, Bangladesh',
    latitude double precision NOT NULL DEFAULT 23.8103,
    longitude double precision NOT NULL DEFAULT 90.4125,
    timezone text NOT NULL DEFAULT 'Asia/Dhaka',
    method text NOT NULL DEFAULT 'Karachi',
    asr_juristic text NOT NULL DEFAULT 'Standard',
    use_24_hour boolean NOT NULL DEFAULT false,
    reminders_enabled boolean NOT NULL DEFAULT true,
    reminder_sound text NOT NULL DEFAULT 'chime',
    updated_at timestamp without time zone NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX app_settings_profile_idx ON public.app_settings (profile);

  CREATE TABLE public.world_clocks (
    id serial PRIMARY KEY,
    label text NOT NULL,
    timezone text NOT NULL,
    accent text NOT NULL DEFAULT 'cyan',
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamp without time zone NOT NULL DEFAULT now()
  );

  CREATE TABLE public.prayer_prefs (
    id serial PRIMARY KEY,
    prayer_key text NOT NULL,
    label text NOT NULL DEFAULT '',
    custom_time text,
    offset_minutes integer NOT NULL DEFAULT 0,
    reminder_enabled boolean NOT NULL DEFAULT true,
    updated_at timestamp without time zone NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX prayer_prefs_key_idx ON public.prayer_prefs (prayer_key);
`;

/**
 * Textual parity between the two schema paths in the same file.
 *
 * The ALTER block exists for databases created by an older build; every column
 * it adds must be defined *identically* to its CREATE TABLE counterpart,
 * otherwise a fresh database and an upgraded one end up with different
 * defaults — the drift that made `world_clocks.label` default to `''` on the
 * ALTER path only.
 */
type Definition = { type: string; notNull: boolean; hasDefault: boolean };

function parseDefinitions(sql: string) {
  const create = new Map<string, Definition>();
  const alter = new Map<string, Definition>();

  const normalize = (text: string): Definition => {
    const collapsed = text.replace(/\s+/g, " ").trim();
    return {
      type: collapsed.replace(/\s*(NOT NULL)?\s*(DEFAULT .*)?$/i, "").trim(),
      notNull: /\bNOT NULL\b/i.test(collapsed),
      hasDefault: /\bDEFAULT\b/i.test(collapsed),
    };
  };

  for (const match of sql.matchAll(/CREATE TABLE IF NOT EXISTS public\.(\w+) \(([\s\S]*?)\n\);/g)) {
    const [, table, body] = match;
    for (const line of body.split("\n")) {
      const trimmed = line.trim().replace(/,$/, "");
      if (!trimmed || trimmed.startsWith("--")) continue;
      const [, column, rest] = trimmed.match(/^(\w+) +(.+)$/) ?? [];
      if (!column) continue;
      create.set(`${table}.${column}`, normalize(rest));
    }
  }

  for (const match of sql.matchAll(/ALTER TABLE public\.(\w+)([\s\S]*?);/g)) {
    const [, table, body] = match;
    for (const line of body.matchAll(/ADD COLUMN IF NOT EXISTS (\w+) +([^,\n]+)/g)) {
      alter.set(`${table}.${line[1]}`, normalize(line[2]));
    }
  }

  return { create, alter };
}

async function applyNewDatabase() {
  const db = new PGlite();
  await db.exec(SCRIPT);
  return db;
}

describe("bootstrap script — fresh database (CREATE path)", () => {
  it("creates exactly the three tables, with every column and default from schema.ts", async () => {
    const db = await applyNewDatabase();
    const { columns, indexes } = await snapshot(db);

    expect(columns.map((c) => `${c.table}.${c.column}`)).toEqual(
      [
        // app_settings
        "app_settings.id",
        "app_settings.profile",
        "app_settings.location_name",
        "app_settings.latitude",
        "app_settings.longitude",
        "app_settings.timezone",
        "app_settings.method",
        "app_settings.asr_juristic",
        "app_settings.elevation_meters",
        "app_settings.high_latitude_rule",
        "app_settings.use_24_hour",
        "app_settings.reminders_enabled",
        "app_settings.reminder_sound",
        "app_settings.updated_at",
        // prayer_prefs
        "prayer_prefs.id",
        "prayer_prefs.prayer_key",
        "prayer_prefs.label",
        "prayer_prefs.mode",
        "prayer_prefs.custom_time",
        "prayer_prefs.offset_minutes",
        "prayer_prefs.step_minutes",
        "prayer_prefs.fixed_time",
        "prayer_prefs.calibrated_at",
        "prayer_prefs.reminder_enabled",
        "prayer_prefs.iqamah",
        "prayer_prefs.reminder_at",
        "prayer_prefs.updated_at",
        // world_clocks
        "world_clocks.id",
        "world_clocks.label",
        "world_clocks.timezone",
        "world_clocks.accent",
        "world_clocks.sort_order",
        "world_clocks.created_at",
      ].sort((a, b) => a.localeCompare(b)),
    );

    const byName = Object.fromEntries(columns.map((c) => [`${c.table}.${c.column}`, c]));

    // Defaults and nullability, column by column.
    expect(byName["app_settings.profile"]).toMatchObject({ nullable: false, default: "'default'::text" });
    expect(byName["app_settings.location_name"]).toMatchObject({ default: "'Dhaka, Bangladesh'::text" });
    expect(byName["app_settings.latitude"]).toMatchObject({ type: "double precision", default: "23.8103" });
    expect(byName["app_settings.longitude"]).toMatchObject({ default: "90.4125" });
    expect(byName["app_settings.timezone"]).toMatchObject({ default: "'Asia/Dhaka'::text" });
    expect(byName["app_settings.method"]).toMatchObject({ default: "'Karachi'::text" });
    expect(byName["app_settings.asr_juristic"]).toMatchObject({ default: "'Standard'::text" });
    expect(byName["app_settings.elevation_meters"]).toMatchObject({ default: "0" });
    expect(byName["app_settings.high_latitude_rule"]).toMatchObject({ default: "'auto'::text" });
    expect(byName["app_settings.use_24_hour"]).toMatchObject({ type: "boolean", default: "false" });
    expect(byName["app_settings.reminders_enabled"]).toMatchObject({ default: "true" });
    expect(byName["app_settings.reminder_sound"]).toMatchObject({ default: "'chime'::text" });
    expect(byName["app_settings.updated_at"]).toMatchObject({ type: "timestamp without time zone", default: "now()" });

    expect(byName["prayer_prefs.prayer_key"]).toMatchObject({ nullable: false, default: null });
    expect(byName["prayer_prefs.label"]).toMatchObject({ nullable: false, default: "''::text" });
    expect(byName["prayer_prefs.mode"]).toMatchObject({ nullable: false, default: "'dynamicOffset'::text" });
    expect(byName["prayer_prefs.offset_minutes"]).toMatchObject({ type: "integer", default: "0" });
    expect(byName["prayer_prefs.step_minutes"]).toMatchObject({ default: "0" });
    expect(byName["prayer_prefs.custom_time"]).toMatchObject({ nullable: true, default: null });
    expect(byName["prayer_prefs.fixed_time"]).toMatchObject({ nullable: true, default: null });
    expect(byName["prayer_prefs.calibrated_at"]).toMatchObject({ nullable: true, default: null });
    expect(byName["prayer_prefs.iqamah"]).toMatchObject({ nullable: true, default: null });
    expect(byName["prayer_prefs.reminder_enabled"]).toMatchObject({ default: "true" });
    expect(byName["prayer_prefs.reminder_at"]).toMatchObject({ nullable: false, default: "'azan'::text" });
    expect(byName["prayer_prefs.updated_at"]).toMatchObject({ default: "now()" });

    // world_clocks: label/timezone are NOT NULL *without* a default (schema.ts).
    expect(byName["world_clocks.label"]).toMatchObject({ nullable: false, default: null });
    expect(byName["world_clocks.timezone"]).toMatchObject({ nullable: false, default: null });
    expect(byName["world_clocks.accent"]).toMatchObject({ nullable: false, default: "'cyan'::text" });
    expect(byName["world_clocks.sort_order"]).toMatchObject({ type: "integer", default: "0" });
    expect(byName["world_clocks.created_at"]).toMatchObject({ default: "now()" });

    // Indexes: the two the application relies on, plus the primary keys.
    expect(indexes.map((i) => i.indexname)).toEqual([
      "app_settings_pkey",
      "app_settings_profile_idx",
      "prayer_prefs_key_idx",
      "prayer_prefs_pkey",
      "world_clocks_pkey",
    ]);
    expect(indexes.find((i) => i.indexname === "app_settings_profile_idx")!.indexdef).toContain(
      "UNIQUE INDEX app_settings_profile_idx ON public.app_settings USING btree (profile)",
    );
    expect(indexes.find((i) => i.indexname === "prayer_prefs_key_idx")!.indexdef).toContain(
      "UNIQUE INDEX prayer_prefs_key_idx ON public.prayer_prefs USING btree (prayer_key)",
    );

    // The singleton settings row is seeded, and nothing else is.
    const counts = await db.query<{ settings: number; prefs: number; clocks: number }>(`
      SELECT (SELECT count(*)::int FROM app_settings) AS settings,
             (SELECT count(*)::int FROM prayer_prefs) AS prefs,
             (SELECT count(*)::int FROM world_clocks) AS clocks
    `);
    expect(counts.rows[0]).toEqual({ settings: 1, prefs: 0, clocks: 0 });
  });

  it("is idempotent: a second run changes no column, default or index", async () => {
    const db = await applyNewDatabase();
    const before = await snapshot(db);
    await db.exec(SCRIPT);
    const after = await snapshot(db);
    expect(after).toEqual(before);
  });
});

describe("bootstrap script — the two schema paths agree", () => {
  const { create, alter } = parseDefinitions(SCRIPT);

  it("parses both paths out of the script", () => {
    expect(create.size).toBeGreaterThan(30);
    expect(alter.size).toBeGreaterThan(15);
  });

  it("adds every ALTER column with exactly its CREATE definition (type, nullability, default)", () => {
    const mismatches: string[] = [];
    for (const [key, altered] of alter) {
      const created = create.get(key);
      if (!created) {
        mismatches.push(`${key}: added by ALTER but absent from CREATE`);
        continue;
      }
      if (JSON.stringify(created) !== JSON.stringify(altered)) {
        mismatches.push(
          `${key}: CREATE ${JSON.stringify(created)} vs ALTER ${JSON.stringify(altered)}`,
        );
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("never invents a default for a column that is NOT NULL without one", () => {
    // `world_clocks.label` / `.timezone` are NOT NULL with no default: they can
    // only be created together with the table, so the ALTER block must not
    // re-create them (with a fabricated '' / 'UTC' default).
    const invented = [...alter.keys()].filter((key) => {
      const created = create.get(key);
      return created !== undefined && created.notNull && !created.hasDefault;
    });
    expect(invented).toEqual([]);
  });
});

describe("bootstrap script — existing database (ALTER path)", () => {
  it("converges on exactly the same columns, defaults and indexes as a fresh database", async () => {
    const fresh = await applyNewDatabase();

    const legacy = new PGlite();
    await legacy.exec(LEGACY_DDL);
    await legacy.exec(SCRIPT);
    // Re-run: the ALTER path must be safe on a database that is now complete.
    await legacy.exec(SCRIPT);

    const fromCreate = await snapshot(fresh);
    const fromAlter = await snapshot(legacy);

    expect(fromAlter.columns).toEqual(fromCreate.columns);
    expect(fromAlter.indexes.map((i) => i.indexname)).toEqual(
      fromCreate.indexes.map((i) => i.indexname),
    );
  });

  it("keeps every stored value and only adds new columns with their defaults", async () => {
    const legacy = new PGlite();
    await legacy.exec(LEGACY_DDL);
    await legacy.exec(`
      INSERT INTO app_settings (location_name, latitude, longitude, timezone, method, use_24_hour)
      VALUES ('London, UK', 51.5074, -0.1278, 'Europe/London', 'MWL', true);
      INSERT INTO prayer_prefs (prayer_key, custom_time, offset_minutes) VALUES ('fajr', '05:18', 4);
      INSERT INTO world_clocks (label, timezone) VALUES ('Makkah', 'Asia/Riyadh');
    `);

    await legacy.exec(SCRIPT);

    const settings = await legacy.query<Record<string, unknown>>(`
      SELECT location_name, latitude, timezone, method, use_24_hour,
             elevation_meters, high_latitude_rule
      FROM app_settings
    `);
    expect(settings.rows).toEqual([
      {
        location_name: "London, UK",
        latitude: 51.5074,
        timezone: "Europe/London",
        method: "MWL",
        use_24_hour: true,
        // New columns on an existing row read their DEFAULT — nothing else.
        elevation_meters: 0,
        high_latitude_rule: "auto",
      },
    ]);

    const prefs = await legacy.query<Record<string, unknown>>(`
      SELECT prayer_key, custom_time, offset_minutes, mode, step_minutes,
             fixed_time, calibrated_at, iqamah, reminder_at
      FROM prayer_prefs
    `);
    expect(prefs.rows).toEqual([
      {
        prayer_key: "fajr",
        custom_time: "05:18",
        offset_minutes: 4,
        mode: "dynamicOffset",
        step_minutes: 0,
        fixed_time: null,
        calibrated_at: null,
        iqamah: null,
        reminder_at: "azan",
      },
    ]);

    const clocks = await legacy.query<Record<string, unknown>>(
      `SELECT label, timezone, accent, sort_order FROM world_clocks`,
    );
    expect(clocks.rows).toEqual([
      { label: "Makkah", timezone: "Asia/Riyadh", accent: "cyan", sort_order: 0 },
    ]);

    // Still exactly one settings row: the seed insert did not duplicate it.
    const count = await legacy.query<{ n: number }>(`SELECT count(*)::int AS n FROM app_settings`);
    expect(count.rows[0].n).toBe(1);
  });
});
