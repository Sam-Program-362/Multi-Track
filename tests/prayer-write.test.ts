import { describe, expect, it } from "vitest";
import { resolvePrayerWrite, type StoredPrayerRow } from "../src/lib/prayer-write";
import type { CalibrationContext } from "../src/lib/calibration";

const DHAKA: CalibrationContext = {
  latitude: 23.8103,
  longitude: 90.4125,
  timezone: "Asia/Dhaka",
  method: "Karachi",
  asrJuristic: "Standard",
};

const NOV_15 = new Date("2026-11-15T09:00:00Z");

function row(overrides: Partial<StoredPrayerRow> = {}): StoredPrayerRow {
  return {
    mode: "dynamicOffset",
    offsetMinutes: 23,
    stepMinutes: 0,
    fixedTime: null,
    customTime: "05:18",
    calibratedAt: "2026-11-15",
    reminderEnabled: true,
    iqamah: null,
    reminderAt: "azan",
    updatedAt: NOV_15,
    ...overrides,
  };
}

function run(body: Record<string, unknown>, existing: StoredPrayerRow | null = row()) {
  return resolvePrayerWrite({ body, ctx: DHAKA, existing, now: NOV_15 });
}

describe("prayer write resolution", () => {
  it("rejects unknown prayers", () => {
    const result = run({ prayerKey: "tahajjud" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  it("rejects malformed clock times", () => {
    const result = run({ prayerKey: "fajr", customTime: "25:99", recalibrate: true });
    expect(result.ok).toBe(false);
  });

  it("turns an entered mosque time into Δuser (the calibration event)", () => {
    const result = run({ prayerKey: "fajr", customTime: "05:18", recalibrate: true });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Fajr on 15 Nov 2026 in Dhaka is 04:55, so Δuser = +23.
    expect(result.values.offsetMinutes).toBe(23);
    expect(result.values.calibratedAt).toBe("2026-11-15");
    expect(result.values.customTime).toBe("05:18");
    expect(result.values.mode).toBe("dynamicOffset");
  });

  it("measures the calibration on the date the user saw the board", () => {
    const result = run({
      prayerKey: "fajr",
      customTime: "05:05",
      recalibrate: true,
      calibratedAt: "2026-06-15",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.calibratedAt).toBe("2026-06-15");
    // A June baseline is earlier, so the same clock time implies a bigger Δ.
    expect(result.values.offsetMinutes).toBeGreaterThan(23);
  });

  it("applies a direct Δuser nudge without touching the audit trail", () => {
    const result = run({ prayerKey: "fajr", offsetMinutes: 24 });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.offsetMinutes).toBe(24);
    expect(result.values.customTime).toBe("05:18");
    expect(result.values.calibratedAt).toBe("2026-11-15");
  });

  it("requires a time for fixed clock mode", () => {
    const result = run(
      { prayerKey: "dhuhr", mode: "fixedClock" },
      row({ mode: "fixedClock", fixedTime: null, customTime: null, calibratedAt: null }),
    );
    expect(result.ok).toBe(false);
    const ok = run({ prayerKey: "dhuhr", mode: "fixedClock", fixedTime: "13:30" });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.values.fixedTime).toBe("13:30");
  });

  it("resets the azan calibration but preserves the mosque jamaat policy", () => {
    const existing = row({ iqamah: JSON.stringify({ mode: "delay", delayMin: 15 }) });
    const result = run({ prayerKey: "fajr", reset: true }, existing);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.offsetMinutes).toBe(0);
    expect(result.values.customTime).toBeNull();
    expect(result.values.calibratedAt).toBeNull();
    expect(JSON.parse(result.values.iqamah)).toMatchObject({ mode: "delay", delayMin: 15 });
  });

  it("upgrades a legacy row on save instead of re-pinning the clock time", () => {
    const legacy = row({
      mode: null,
      offsetMinutes: 0,
      calibratedAt: null,
      updatedAt: new Date("2026-11-15T12:00:00Z"),
    });
    const result = run({ prayerKey: "fajr" }, legacy);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.values.offsetMinutes).toBe(23);
    expect(result.values.calibratedAt).toBe("2026-11-15");
  });
});

describe("jamaat policy validation on write", () => {
  it("stores the jamaat policy as canonical JSON", () => {
    const result = run({
      prayerKey: "fajr",
      iqamah: { mode: "delay", delayMin: 15 },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(JSON.parse(result.values.iqamah)).toEqual({
        mode: "delay",
        delayMin: 15,
        clock: null,
        table: [],
      });
    }
  });

  it("drops invalid table rows instead of storing them", () => {
    const result = run({
      prayerKey: "dhuhr",
      iqamah: {
        mode: "table",
        table: [
          { from: "2026-01-01", clock: "13:30" },
          { from: "nope", clock: "13:00" },
          { from: "2026-06-01", clock: "99:99" },
        ],
      },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stored = JSON.parse(result.values.iqamah);
    expect(stored.mode).toBe("table");
    expect(stored.table).toHaveLength(1);
    expect(stored.table[0]).toEqual({ from: "2026-01-01", clock: "13:30", delayMin: null });
  });

  it("changes only the mode when a chip is pressed, keeping the delay/table", () => {
    const existing = row({
      iqamah: JSON.stringify({ mode: "delay", delayMin: 12, clock: null, table: [{ from: "2026-01-01", delayMin: 12 }] }),
    });
    const result = run({ prayerKey: "fajr", iqamahMode: "table" }, existing);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const stored = JSON.parse(result.values.iqamah);
    expect(stored.mode).toBe("table");
    expect(stored.delayMin).toBe(12);
    expect(stored.table).toHaveLength(1);
  });

  it("keeps the stored policy when the body does not mention it", () => {
    const existing = row({ iqamah: JSON.stringify({ mode: "clock", clock: "13:30" }) });
    const result = run({ prayerKey: "fajr", offsetMinutes: 20 }, existing);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.parse(result.values.iqamah)).toMatchObject({ mode: "clock", clock: "13:30" });
  });

  it("clears the jamaat policy only on an explicit reset", () => {
    const existing = row({ iqamah: JSON.stringify({ mode: "delay", delayMin: 15 }) });
    const result = run({ prayerKey: "fajr", resetIqamah: true }, existing);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(JSON.parse(result.values.iqamah)).toEqual({ mode: "none", delayMin: 0, clock: null, table: [] });
  });

  it("normalises the reminder target", () => {
    expect(run({ prayerKey: "fajr", reminderAt: "iqamah" }).ok).toBe(true);
    const ok = run({ prayerKey: "fajr", reminderAt: "iqamah" });
    if (ok.ok) expect(ok.values.reminderAt).toBe("iqamah");
    const bad = run({ prayerKey: "fajr", reminderAt: "loud" });
    if (bad.ok) expect(bad.values.reminderAt).toBe("azan");
  });
});
