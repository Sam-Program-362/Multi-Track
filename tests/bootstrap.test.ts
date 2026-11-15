import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Initial-bootstrap detection.
 *
 * The bug being guarded against: on a database where the application tables
 * were never created (the Neon project only had `neon_auth`), the schema gate
 * ran `ALTER TABLE app_settings ...`, Postgres answered
 * `relation "app_settings" does not exist`, and the user saw a raw SQL error
 * with no hint that the database simply had never been bootstrapped.
 *
 * `src/db/ensure-schema.ts` now probes the catalog first and refuses to run any
 * DDL when a foundational table is missing.
 */

const mocks = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock("../src/db/index", () => ({ db: { execute: mocks.execute } }));

const {
  REQUIRED_TABLES,
  BOOTSTRAP_SCRIPT_PATH,
  MissingTablesError,
  assertTablesPresent,
  missingTables,
  missingTablesMessage,
} = await import("../src/db/bootstrap");
const { createSchemaApply } = await import("../src/db/ensure-schema");
const { createSchemaGate } = await import("../src/db/schema-gate");

const ALL_PRESENT = {
  app_settings: "app_settings",
  world_clocks: "world_clocks",
  prayer_prefs: "prayer_prefs",
};

describe("bootstrap detection", () => {
  it("knows which tables the schema defines", () => {
    expect([...REQUIRED_TABLES]).toEqual(["app_settings", "world_clocks", "prayer_prefs"]);
  });

  it("reports nothing missing on a bootstrapped database", () => {
    expect(missingTables(ALL_PRESENT)).toEqual([]);
  });

  it("names every table that is absent, including a partially created schema", () => {
    expect(missingTables({ app_settings: "app_settings" })).toEqual([
      "world_clocks",
      "prayer_prefs",
    ]);
    expect(missingTables({ app_settings: null, world_clocks: null, prayer_prefs: null })).toEqual([
      "app_settings",
      "world_clocks",
      "prayer_prefs",
    ]);
  });

  it("says plainly that the database is not initialised and where the script is", () => {
    const message = missingTablesMessage(["app_settings", "world_clocks", "prayer_prefs"]);
    expect(message).toContain("Database is not initialised");
    expect(message).toContain("public.app_settings");
    expect(message).toContain("public.world_clocks");
    expect(message).toContain("public.prayer_prefs");
    expect(message).toContain(BOOTSTRAP_SCRIPT_PATH);
    expect(message).toContain("Nothing was created, altered or migrated automatically");
    // Singular/plural wording stays readable.
    expect(missingTablesMessage(["app_settings"])).toContain("public.app_settings is missing");
    expect(missingTablesMessage(["app_settings", "world_clocks"])).toContain("are missing");
  });

  it("throws a typed error carrying the missing table list", () => {
    expect(() => assertTablesPresent(ALL_PRESENT)).not.toThrow();
    try {
      assertTablesPresent({ app_settings: "app_settings" });
      throw new Error("expected assertTablesPresent to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(MissingTablesError);
      expect((error as InstanceType<typeof MissingTablesError>).tables).toEqual([
        "world_clocks",
        "prayer_prefs",
      ]);
      expect((error as Error).message).toContain("Database is not initialised");
    }
  });
});

describe("self-healing apply step", () => {
  beforeEach(() => {
    mocks.execute.mockReset();
  });

  it("probes the catalog and then adds the columns, in that order", async () => {
    const calls: unknown[] = [];
    const execute = vi.fn(async (query: unknown) => {
      calls.push(query);
      if (calls.length === 1) return { rows: [ALL_PRESENT] };
      return { rows: [] };
    });
    const apply = createSchemaApply(execute);

    await expect(apply()).resolves.toBeUndefined();
    expect(execute).toHaveBeenCalledTimes(3);
    expect(String((calls[0] as { queryChunks?: unknown[] }).queryChunks?.length)).not.toBe("0");
  });

  it("runs no DDL at all when a foundational table is missing", async () => {
    const execute = vi.fn(async () => ({ rows: [{ app_settings: "app_settings" }] }));
    const apply = createSchemaApply(execute);

    await expect(apply()).rejects.toThrow(/Database is not initialised/);
    // Only the read-only probe ran: nothing was altered on an uninitialised DB.
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("treats an empty probe result as missing tables rather than success", async () => {
    const execute = vi.fn(async () => ({ rows: [] }));
    await expect(createSchemaApply(execute)()).rejects.toThrow(/Database is not initialised/);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it("surfaces the bootstrap message through the gate and retries afterwards", async () => {
    let attempts = 0;
    const apply = vi.fn(async () => {
      attempts += 1;
      if (attempts === 1) {
        assertTablesPresent({ app_settings: "app_settings", world_clocks: null, prayer_prefs: null });
      }
    });
    const gate = createSchemaGate(apply, "prayer-schema");

    const first = await gate.ensure();
    expect(first.ok).toBe(false);
    if (!first.ok) {
      expect(first.error).toContain("Database is not initialised");
      expect(first.error).toContain(BOOTSTRAP_SCRIPT_PATH);
    }

    // After the owner applies the script the next request succeeds without a
    // redeploy: failures are never cached.
    await expect(gate.ensure()).resolves.toEqual({ ok: true });
    expect(apply).toHaveBeenCalledTimes(2);
  });
});
