import { beforeEach, describe, expect, it } from "vitest";
import {
  loadHomeData,
  loadPrayerPrefs,
  loadSettingsSnapshot,
  type AppStore,
  type PrayerRow,
  type PrayerRowUpdate,
  type SettingsRow,
} from "../src/lib/app-store";
import {
  astroMinutesFor,
  buildSchedule,
  captureOffsetMinutes,
  contextFrom,
  dateKey,
  parseClock,
} from "../src/lib/calibration";
import { reminderPrayers, visiblePrayerSchedule } from "../src/lib/prayer-visibility";

/**
 * Reproduces the initial home-page loading sequence against an **old database**:
 * the calibration/jamaat columns do not exist yet, the settings row is the
 * user's real row, and legacy static prayer times are stored.
 *
 * The regression this guards against: the page used to read `app_settings`
 * before the DDL ran, swallow the "column does not exist" error into Dhaka
 * defaults, and then derive legacy offsets from those defaults — permanently
 * rewriting the user's prayer times with the wrong location.
 */

const LONDON: SettingsRow = {
  id: 1,
  profile: "default",
  locationName: "London, UK",
  latitude: 51.5074,
  longitude: -0.1278,
  timezone: "Europe/London",
  method: "MWL",
  asrJuristic: "Standard",
  use24Hour: true,
  remindersEnabled: true,
  reminderSound: "chime",
  elevationMeters: 0,
  highLatitudeRule: "auto",
  updatedAt: new Date("2026-01-01T00:00:00Z"),
};

const SEEDED_DHAKA: SettingsRow = {
  ...LONDON,
  id: 2,
  locationName: "Dhaka, Bangladesh",
  latitude: 23.8103,
  longitude: 90.4125,
  timezone: "Asia/Dhaka",
  method: "Karachi",
  use24Hour: false,
};

function legacyRow(prayerKey: string, customTime: string, id: number): PrayerRow {
  return {
    id,
    prayerKey,
    label: prayerKey,
    mode: "dynamicOffset",
    customTime,
    offsetMinutes: 0,
    stepMinutes: 0,
    fixedTime: null,
    calibratedAt: null,
    reminderEnabled: true,
    iqamah: null,
    reminderAt: "azan",
    updatedAt: new Date("2026-11-01T00:00:00Z"),
  };
}

class FakeOldDatabase implements AppStore {
  calls: string[] = [];
  columnsReady = false;
  schemaFailures = 0;
  settingsReadError: string | null = null;
  prayerReadError: string | null = null;
  settingsWriteError: string | null = null;
  settingsRow: SettingsRow | null;
  prefsRows: PrayerRow[];
  updates: PrayerRowUpdate[] = [];

  constructor(settingsRow: SettingsRow | null, prefsRows: PrayerRow[]) {
    this.settingsRow = settingsRow;
    this.prefsRows = prefsRows;
  }

  async ensureSchema() {
    this.calls.push("ensureSchema");
    if (this.schemaFailures > 0) {
      this.schemaFailures -= 1;
      return { ok: false as const, error: "connection terminated unexpectedly" };
    }
    // The real DDL: idempotent ADD COLUMN IF NOT EXISTS.
    this.columnsReady = true;
    return { ok: true as const };
  }

  async readSettingsRow() {
    this.calls.push("readSettingsRow");
    if (!this.columnsReady) {
      throw new Error('column "elevation_meters" does not exist');
    }
    if (this.settingsReadError) throw new Error(this.settingsReadError);
    return this.settingsRow;
  }

  async insertDefaultSettings() {
    this.calls.push("insertDefaultSettings");
    // Mirrors the real insert: the row is created and returned.
    this.settingsRow ??= { ...SEEDED_DHAKA };
    return this.settingsRow;
  }

  async readPrayerRows() {
    this.calls.push("readPrayerRows");
    if (!this.columnsReady) throw new Error('column "iqamah" does not exist');
    if (this.prayerReadError) throw new Error(this.prayerReadError);
    return this.prefsRows.map((row) => ({ ...row }));
  }

  async updatePrayerRow(values: PrayerRowUpdate) {
    this.calls.push(`update:${values.prayerKey}`);
    if (this.settingsWriteError) throw new Error(this.settingsWriteError);
    this.updates.push(values);
    this.prefsRows = this.prefsRows.map((row) =>
      row.prayerKey === values.prayerKey
        ? {
            ...row,
            mode: values.mode,
            offsetMinutes: values.offsetMinutes,
            stepMinutes: values.stepMinutes,
            fixedTime: values.fixedTime,
            calibratedAt: values.calibratedAt,
            iqamah: values.iqamah,
            reminderAt: values.reminderAt,
          }
        : row,
    );
  }
}

const LONDON_CTX = contextFrom({
  latitude: LONDON.latitude,
  longitude: LONDON.longitude,
  timezone: LONDON.timezone,
  method: "MWL",
  asrJuristic: "Standard",
});

const DHAKA_CTX = contextFrom({
  latitude: 23.8103,
  longitude: 90.4125,
  timezone: "Asia/Dhaka",
  method: "Karachi",
  asrJuristic: "Standard",
});

const TODAY = new Date();
const LONDON_ASTRO = astroMinutesFor(TODAY, LONDON_CTX);
const DHAKA_ASTRO = astroMinutesFor(TODAY, DHAKA_CTX);

/** Δuser the *user's own* settings imply for the time they typed. */
function expectedOffset(prayer: "fajr" | "dhuhr", typed: string): number {
  return captureOffsetMinutes(parseClock(typed)!, LONDON_ASTRO[prayer]);
}

/** Δuser the old buggy path produced, using the Dhaka fallback. */
function dhakaOffset(prayer: "fajr" | "dhuhr", typed: string): number {
  return captureOffsetMinutes(parseClock(typed)!, DHAKA_ASTRO[prayer]);
}

let db: FakeOldDatabase;

beforeEach(() => {
  db = new FakeOldDatabase(LONDON, [
    legacyRow("fajr", "05:40", 1),
    legacyRow("dhuhr", "13:10", 2),
  ]);
});

describe("home-page load sequence on an old database", () => {
  it("initializes the schema before reading settings or prayer preferences", async () => {
    await loadHomeData(db);
    expect(db.calls[0]).toBe("ensureSchema");
    expect(db.calls.indexOf("readSettingsRow")).toBeGreaterThan(0);
    expect(db.calls.indexOf("readPrayerRows")).toBeGreaterThan(
      db.calls.indexOf("readSettingsRow"),
    );
    expect(db.columnsReady).toBe(true);
  });

  it("loads the user's real location instead of the Dhaka defaults", async () => {
    const home = await loadHomeData(db);
    expect(home.settings.locationName).toBe("London, UK");
    expect(home.settings.timezone).toBe("Europe/London");
    expect(home.settings.method).toBe("MWL");
    expect(home.settings.asrJuristic).toBe("Standard");
    expect(home.settings.latitude).toBeCloseTo(51.5074, 4);
    expect(home.notice).toBeNull();
    expect(home.scheduleVerified).toBe(true);
  });

  it("migrates every legacy offset with the real location, never with Dhaka", async () => {
    const home = await loadHomeData(db);
    const fajr = home.prefs.find((p) => p.prayerKey === "fajr")!;
    const dhuhr = home.prefs.find((p) => p.prayerKey === "dhuhr")!;

    expect(fajr.offsetMinutes).toBe(expectedOffset("fajr", "05:40"));
    expect(dhuhr.offsetMinutes).toBe(expectedOffset("dhuhr", "13:10"));
    expect(fajr.calibratedAt).toBe(dateKey(new Date()));
    // The audit trail survives the migration.
    expect(fajr.customTime).toBe("05:40");

    // And the exact corruption the reviewer identified does not happen.
    expect(dhuhr.offsetMinutes).not.toBe(dhakaOffset("dhuhr", "13:10"));
    expect(fajr.offsetMinutes).not.toBe(dhakaOffset("fajr", "05:40"));

    expect(db.updates.map((u) => u.prayerKey).sort()).toEqual(["dhuhr", "fajr"]);
    for (const update of db.updates) {
      const typed = update.prayerKey === "fajr" ? "05:40" : "13:10";
      expect(update.offsetMinutes).toBe(
        expectedOffset(update.prayerKey as "fajr" | "dhuhr", typed),
      );
    }
  });

  it("never rewrites the user's settings row", async () => {
    const before = { ...LONDON };
    await loadHomeData(db);
    expect(db.settingsRow).toEqual(before);
    expect(db.calls).not.toContain("insertDefaultSettings");
  });

  it("does not re-migrate rows that are already calibrated", async () => {
    db.prefsRows = [
      {
        ...legacyRow("fajr", "05:40", 1),
        offsetMinutes: 7,
        calibratedAt: "2026-06-01",
        iqamah: JSON.stringify({ mode: "delay", delayMin: 12, clock: null, table: [] }),
        reminderAt: "iqamah",
      },
    ];
    const home = await loadHomeData(db);
    expect(home.prefs[0].offsetMinutes).toBe(7);
    expect(home.prefs[0].calibratedAt).toBe("2026-06-01");
    expect(home.prefs[0].iqamah.delayMin).toBe(12);
    expect(home.prefs[0].reminderAt).toBe("iqamah");
    expect(db.updates).toHaveLength(0);
  });
});

describe("schema initialization failures", () => {
  it("stops before reading anything and reports the failure", async () => {
    db.schemaFailures = 1;
    const home = await loadHomeData(db);
    expect(home.schemaOk).toBe(false);
    expect(home.scheduleVerified).toBe(false);
    expect(home.prefs).toEqual([]);
    expect(home.notice).toContain("schema");
    expect(db.calls).not.toContain("readSettingsRow");
    expect(db.calls).not.toContain("readPrayerRows");
    expect(db.updates).toHaveLength(0);
  });

  it("recovers on the next load and migrates correctly afterwards", async () => {
    db.schemaFailures = 1;
    const first = await loadHomeData(db);
    expect(first.schemaOk).toBe(false);

    const second = await loadHomeData(db);
    expect(second.schemaOk).toBe(true);
    expect(second.scheduleVerified).toBe(true);
    expect(second.settings.locationName).toBe("London, UK");
    const dhuhr = second.prefs.find((p) => p.prayerKey === "dhuhr")!;
    expect(dhuhr.offsetMinutes).toBe(expectedOffset("dhuhr", "13:10"));
    expect(db.updates).toHaveLength(2);
  });
});

describe("settings unavailable while the schema is fine", () => {
  it("never migrates with fallback defaults", async () => {
    db.settingsReadError = "connection reset by peer";
    const home = await loadHomeData(db);

    // Display falls back, but the failure is explicit and the render is marked
    // unverified so no calculated time can be presented as valid.
    expect(home.settings.locationName).toBe("Dhaka, Bangladesh");
    expect(home.notice).toContain("Settings could not be read");
    expect(home.scheduleVerified).toBe(false);

    // Legacy rows are returned exactly as stored: no derived offsets, no writes.
    const dhuhr = home.prefs.find((p) => p.prayerKey === "dhuhr")!;
    expect(dhuhr.calibratedAt).toBeNull();
    expect(dhuhr.offsetMinutes).toBe(0);
    expect(dhuhr.customTime).toBe("13:10");
    expect(db.updates).toHaveLength(0);
  });

  it("migrates correctly once the real settings can be read again", async () => {
    db.settingsReadError = "connection reset by peer";
    await loadHomeData(db);
    expect(db.updates).toHaveLength(0);

    db.settingsReadError = null;
    const recovered = await loadHomeData(db);
    expect(recovered.scheduleVerified).toBe(true);
    const dhuhr = recovered.prefs.find((p) => p.prayerKey === "dhuhr")!;
    expect(dhuhr.offsetMinutes).toBe(expectedOffset("dhuhr", "13:10"));
    expect(dhuhr.offsetMinutes).not.toBe(dhakaOffset("dhuhr", "13:10"));
    expect(db.updates).toHaveLength(2);
    expect(recovered.notice).toBeNull();
  });

  it("reports a migration write failure and retries it later", async () => {
    db.settingsWriteError = "deadlock detected";
    const failed = await loadHomeData(db);
    expect(failed.notice).toContain("could not be upgraded");
    // A failed backfill *write* is not a failed read: the rows that were read
    // are perfectly usable, so the schedule stays verified and visible.
    expect(failed.scheduleVerified).toBe(true);

    db.settingsWriteError = null;
    const retried = await loadHomeData(db);
    expect(retried.notice).toBeNull();
    expect(retried.prefs.find((p) => p.prayerKey === "dhuhr")!.offsetMinutes).toBe(
      expectedOffset("dhuhr", "13:10"),
    );
  });
});

describe("fresh database", () => {
  it("seeds the settings row and migrates nothing", async () => {
    db = new FakeOldDatabase(null, []);
    const home = await loadHomeData(db);
    expect(db.calls).toContain("insertDefaultSettings");
    expect(home.settings.locationName).toBe("Dhaka, Bangladesh");
    expect(home.prefs).toEqual([]);
    expect(db.updates).toHaveLength(0);
    expect(home.notice).toBeNull();
    expect(home.scheduleVerified).toBe(true);
  });
});

describe("degraded rendering contract", () => {
  it("withholds the schedule and keeps every stored row byte-identical", async () => {
    db.settingsReadError = "connection reset by peer";
    const storedBefore = structuredClone(db.prefsRows);

    const home = await loadHomeData(db);
    expect(home.scheduleVerified).toBe(false);

    // The panel renders through this helper, so the guard is what users see.
    const rendered = visiblePrayerSchedule(
      buildSchedule(new Date(), home.settings, home.prefs),
      home.scheduleVerified,
    );
    expect(rendered).toEqual([]);

    // Nothing was rewritten or dropped, including the user's calibration data.
    expect(db.prefsRows).toEqual(storedBefore);
    expect(db.updates).toHaveLength(0);
    expect(home.prefs.map((p) => p.prayerKey)).toEqual(["fajr", "dhuhr"]);
    expect(home.prefs.find((p) => p.prayerKey === "dhuhr")!.customTime).toBe("13:10");
  });

  it("restores a normal, verified schedule once the database is reachable", async () => {
    db.settingsReadError = "connection reset by peer";
    const degraded = await loadHomeData(db);
    expect(degraded.scheduleVerified).toBe(false);

    db.settingsReadError = null;
    const healthy = await loadHomeData(db);
    expect(healthy.scheduleVerified).toBe(true);

    const rendered = visiblePrayerSchedule(
      buildSchedule(new Date(), healthy.settings, healthy.prefs),
      healthy.scheduleVerified,
    );
    expect(rendered.length).toBeGreaterThan(0);
    expect(rendered[0].azanMinutes).toBe(healthy.prefs.find((p) => p.prayerKey === "fajr")!.offsetMinutes + rendered[0].astroMinutes);
  });
});

describe("prayer preferences unavailable while the settings are readable", () => {
  it("withholds the schedule, schedules no reminders and writes nothing", async () => {
    // The settings row is read successfully; only the prayer-preference read
    // fails. Whatever the calendar computes here is not the user's own
    // schedule, so it must not be presented or armed.
    db.prayerReadError = "connection terminated unexpectedly";
    const storedBefore = structuredClone(db.prefsRows);

    const home = await loadHomeData(db);

    // Settings really were retrieved — this is not a settings failure.
    expect(home.settings.locationName).toBe("London, UK");
    expect(home.settings.latitude).toBe(51.5074);
    expect(home.scheduleVerified).toBe(false);
    expect(home.notice).toContain("Prayer preferences could not be read");

    // Nothing is rendered, even though a schedule could be computed.
    const computed = buildSchedule(new Date(), home.settings, home.prefs);
    expect(visiblePrayerSchedule(computed, home.scheduleVerified)).toEqual([]);
    // ...and no time-sensitive reminder can be scheduled from it.
    expect(reminderPrayers(computed, home.scheduleVerified)).toEqual([]);

    // No migration/backfill write is attempted and nothing stored is changed.
    expect(db.updates).toHaveLength(0);
    expect(db.prefsRows).toEqual(storedBefore);
    expect(db.calls).not.toContain("update:fajr");
    expect(db.calls).not.toContain("update:dhuhr");
    expect(home.prefs).toEqual([]);
  });

  it("restores the verified schedule, with the user's calibration, once the read recovers", async () => {
    db.prayerReadError = "connection terminated unexpectedly";
    expect((await loadHomeData(db)).scheduleVerified).toBe(false);

    db.prayerReadError = null;
    const healthy = await loadHomeData(db);
    expect(healthy.scheduleVerified).toBe(true);
    expect(healthy.notice).toBeNull();

    const rendered = visiblePrayerSchedule(
      buildSchedule(new Date(), healthy.settings, healthy.prefs),
      healthy.scheduleVerified,
    );
    expect(rendered.length).toBeGreaterThan(0);
    // The stored calibration is applied again: Δuser comes from the user's own
    // settings, not from the Dhaka fallback.
    const fajr = healthy.prefs.find((p) => p.prayerKey === "fajr")!;
    expect(fajr.offsetMinutes).toBe(expectedOffset("fajr", "05:40"));
    expect(fajr.offsetMinutes).not.toBe(dhakaOffset("fajr", "05:40"));
  });

  it("leaves an empty but successful read verified", async () => {
    db.prefsRows = [];
    const home = await loadHomeData(db);
    // Empty is a successful read, not a failure.
    expect(home.scheduleVerified).toBe(true);
    expect(home.prefs).toEqual([]);
  });
});

describe("individual loaders keep the same guarantees", () => {
  it("loadPrayerPrefs refuses to migrate without a database-backed snapshot", async () => {
    db.columnsReady = true;
    const snapshot = await loadSettingsSnapshot(db);
    expect(snapshot.fromDatabase).toBe(true);

    const untrusted = {
      ...snapshot,
      fromDatabase: false,
      notice: "simulated fallback",
    };
    const load = await loadPrayerPrefs(db, untrusted);
    expect(load.canMigrate).toBe(false);
    // Settings that are not the user's own mean the rows cannot be trusted
    // either, even though the read itself succeeded.
    expect(load.prefsReadSuccessfully).toBe(false);
    expect(db.updates).toHaveLength(0);
    expect(load.prefs.find((p) => p.prayerKey === "dhuhr")!.calibratedAt).toBeNull();
  });
});
