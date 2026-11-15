import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Settings } from "../src/lib/types";

/**
 * Route-level regression tests for `GET /api/settings`.
 *
 * The bug being guarded against: schema initialization succeeds, the settings
 * SELECT then fails, and the endpoint answered `200` with built-in Dhaka
 * defaults — presenting them as if they were the user's saved settings.
 *
 * The database and the server data layer are mocked, so the real route handler
 * (the code that ships) is what runs.
 */

const mocks = vi.hoisted(() => ({
  loadSettingsSnapshot: vi.fn(),
  loadPrayerPrefs: vi.fn(),
  ensureSchema: vi.fn(),
}));

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/server-data", () => ({
  loadSettingsSnapshot: mocks.loadSettingsSnapshot,
  loadPrayerPrefs: mocks.loadPrayerPrefs,
}));
vi.mock("@/db/ensure-schema", () => ({
  ensurePrayerCalibrationSchema: mocks.ensureSchema,
}));

const { GET } = await import("../src/app/api/settings/route");

const LONDON: Settings = {
  id: 1,
  locationName: "London, UK",
  latitude: 51.5074,
  longitude: -0.1278,
  timezone: "Europe/London",
  method: "MWL",
  asrJuristic: "Standard",
  elevationMeters: 0,
  highLatitudeRule: "auto",
  use24Hour: true,
  remindersEnabled: true,
  reminderSound: "chime",
};

const DHAKA_FALLBACK: Settings = {
  ...LONDON,
  id: 0,
  locationName: "Dhaka, Bangladesh",
  latitude: 23.8103,
  longitude: 90.4125,
  timezone: "Asia/Dhaka",
  method: "Karachi",
  use24Hour: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.ensureSchema.mockResolvedValue({ ok: true });
});

describe("GET /api/settings", () => {
  it("returns the saved settings when the row was read", async () => {
    mocks.loadSettingsSnapshot.mockResolvedValue({
      settings: LONDON,
      fromDatabase: true,
      schema: { ok: true },
      notice: null,
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as Settings;
    expect(body.locationName).toBe("London, UK");
    expect(body.timezone).toBe("Europe/London");
  });

  it("answers 503 when the schema could not be initialized", async () => {
    mocks.loadSettingsSnapshot.mockResolvedValue({
      settings: DHAKA_FALLBACK,
      fromDatabase: false,
      schema: { ok: false, error: 'relation "app_settings" does not exist' },
      notice: "Database schema is not ready",
    });

    const res = await GET();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("Database schema is not ready");
    expect(body).not.toHaveProperty("locationName");
  });

  it("answers 503 when the saved row cannot be read — never the fallback", async () => {
    // Schema is fine; only the settings SELECT failed.
    mocks.loadSettingsSnapshot.mockResolvedValue({
      settings: DHAKA_FALLBACK,
      fromDatabase: false,
      schema: { ok: true },
      notice:
        "Settings could not be read (connection reset by peer). Showing built-in defaults; nothing was migrated.",
    });

    const res = await GET();
    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");

    const body = (await res.json()) as Record<string, unknown>;
    expect(body.error).toBe("Saved settings are unavailable");
    // No fallback may be presented as valid saved settings.
    expect(body).not.toHaveProperty("locationName");
    expect(body).not.toHaveProperty("latitude");
    expect(body).not.toHaveProperty("timezone");
    expect(JSON.stringify(body)).not.toContain("Dhaka");
    expect(String(body.detail)).toContain("connection reset");
  });

  it("answers 503 when no settings row exists and none could be created", async () => {
    mocks.loadSettingsSnapshot.mockResolvedValue({
      settings: DHAKA_FALLBACK,
      fromDatabase: false,
      schema: { ok: true },
      notice: "The settings row could not be created; showing built-in defaults. Nothing was migrated.",
    });

    const res = await GET();
    expect(res.status).toBe(503);
    expect(await res.json()).not.toHaveProperty("locationName");
  });
});
