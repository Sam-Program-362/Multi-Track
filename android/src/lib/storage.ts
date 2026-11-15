/**
 * Local data layer for the standalone Android build.
 *
 * There is no backend and no database: everything the user configures is kept
 * on the device. Values are stored as JSON through Capacitor Preferences (which
 * on Android maps to SharedPreferences), falling back to `localStorage` when
 * the same bundle is opened in a normal desktop/mobile browser.
 *
 * The payload is versioned so a future app update can migrate old data instead
 * of wiping it.
 */
import { Preferences } from "@capacitor/preferences";
import {
  HIGH_LATITUDE_CHOICES,
  contextFrom,
  dateKey,
  normalizeIqamah,
  normalizeStoredRule,
  parseClock,
  parseDateKey,
  sanitizeMode,
  sanitizeOffset,
  sanitizeReminderTarget,
  sanitizeStep,
} from "./calibration";
import { METHODS, PRAYER_ORDER, formatMinutes, type MethodKey } from "./prayer";
import type { PrayerPref, Settings, WorldClock } from "./types";

/**
 * Bump this when the shape below changes and add a step to `migrate`.
 *
 * v2 added the prayer calibration model (mode / step / fixed time /
 * calibratedAt). v1 prayer preferences stored a static `customTime`, which
 * `migrate` converts into a proper Δuser offset instead of dropping it.
 *
 * v3 adds the mosque jamaat policy (`iqamah`) and the reminder target
 * (`reminderAt`). Both are additive: v1/v2 payloads migrate with "no jamaat"
 * and "remind at the azan", and every existing calibration is left untouched.
 */
export const STORAGE_VERSION = 3;

const STORAGE_KEY = "multitrack:store:v1";

export const DEFAULT_SETTINGS: Settings = {
  id: 0,
  locationName: "Dhaka, Bangladesh",
  latitude: 23.8103,
  longitude: 90.4125,
  timezone: "Asia/Dhaka",
  method: "Karachi",
  asrJuristic: "Standard",
  elevationMeters: 0,
  highLatitudeRule: "auto",
  use24Hour: false,
  remindersEnabled: true,
  reminderSound: "chime",
};

const SEED_CLOCKS: Array<Omit<WorldClock, "id">> = [
  { label: "Makkah", timezone: "Asia/Riyadh", accent: "emerald", sortOrder: 1 },
  { label: "Dhaka", timezone: "Asia/Dhaka", accent: "cyan", sortOrder: 2 },
  { label: "London", timezone: "Europe/London", accent: "violet", sortOrder: 3 },
  { label: "New York", timezone: "America/New_York", accent: "amber", sortOrder: 4 },
];

/** The four clocks a fresh install starts with. */
export const DEFAULT_CLOCKS: WorldClock[] = SEED_CLOCKS.map((clock, i) => ({
  id: i + 1,
  ...clock,
}));

type StoreShape = {
  version: number;
  settings: Settings;
  clocks: WorldClock[];
  prefs: PrayerPref[];
  nextClockId: number;
};

function defaultStore(): StoreShape {
  return {
    version: STORAGE_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    clocks: DEFAULT_CLOCKS.map((clock) => ({ ...clock })),
    prefs: [],
    nextClockId: SEED_CLOCKS.length + 1,
  };
}

/* ------------------------------------------------------------------ */
/* Low level read / write                                              */
/* ------------------------------------------------------------------ */

async function readRaw(key: string): Promise<string | null> {
  try {
    const { value } = await Preferences.get({ key });
    return value ?? null;
  } catch {
    /* fall through to localStorage */
  }
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

async function writeRaw(key: string, value: string): Promise<void> {
  try {
    await Preferences.set({ key, value });
    return;
  } catch {
    /* fall through to localStorage */
  }
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* storage full or blocked — nothing else we can do */
  }
}

async function removeRaw(key: string): Promise<void> {
  try {
    await Preferences.remove({ key });
  } catch {
    /* ignore */
  }
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Read a JSON value written by `cacheJSON`, ignoring anything unreadable. */
export async function readJSON<T>(key: string): Promise<T | null> {
  const raw = await readRaw(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Persist a JSON value under `key`. */
export async function writeJSON(key: string, value: unknown): Promise<void> {
  await writeRaw(key, JSON.stringify(value));
}

export async function removeJSON(key: string): Promise<void> {
  await removeRaw(key);
}

/* ------------------------------------------------------------------ */
/* Migration + validation                                               */
/* ------------------------------------------------------------------ */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(min, Math.min(max, value))
    : fallback;
}

/** Same rules the old `/api/settings` PUT route enforced. */
export function sanitizeSettings(patch: unknown, current: Settings): Settings {
  const body = isRecord(patch) ? patch : {};
  const next: Settings = { ...current };

  if (typeof body.locationName === "string" && body.locationName.trim()) {
    next.locationName = body.locationName.trim().slice(0, 120);
  }
  if (typeof body.latitude === "number" && Number.isFinite(body.latitude)) {
    next.latitude = Math.max(-90, Math.min(90, body.latitude));
  }
  if (typeof body.longitude === "number" && Number.isFinite(body.longitude)) {
    next.longitude = Math.max(-180, Math.min(180, body.longitude));
  }
  if (typeof body.timezone === "string" && body.timezone.trim()) {
    next.timezone = body.timezone.trim();
  }
  if (typeof body.method === "string" && body.method in METHODS) {
    next.method = body.method as MethodKey;
  }
  if (body.asrJuristic === "Hanafi" || body.asrJuristic === "Standard") {
    next.asrJuristic = body.asrJuristic;
  }
  if (typeof body.elevationMeters === "number" && Number.isFinite(body.elevationMeters)) {
    next.elevationMeters = Math.max(0, Math.min(4000, Math.round(body.elevationMeters)));
  }
  if (
    typeof body.highLatitudeRule === "string" &&
    HIGH_LATITUDE_CHOICES.some((choice) => choice.id === body.highLatitudeRule)
  ) {
    next.highLatitudeRule = body.highLatitudeRule as Settings["highLatitudeRule"];
  }
  if (typeof body.use24Hour === "boolean") next.use24Hour = body.use24Hour;
  if (typeof body.remindersEnabled === "boolean") {
    next.remindersEnabled = body.remindersEnabled;
  }
  if (typeof body.reminderSound === "string") {
    next.reminderSound = body.reminderSound.slice(0, 40);
  }
  return next;
}

/** Validate one prayer's calibration state (mirrors `/api/prayers`). */
export function sanitizePref(patch: unknown): PrayerPref {
  const body = isRecord(patch) ? patch : {};
  const key = typeof body.prayerKey === "string" ? body.prayerKey.trim() : "";
  if (!(PRAYER_ORDER as string[]).includes(key)) {
    throw new Error("Unknown prayer key");
  }

  const readClock = (value: unknown): string | null => {
    if (typeof value !== "string" || !value.trim()) return null;
    const minutes = parseClock(value.trim());
    if (minutes === null) throw new Error("Invalid time (HH:MM)");
    return formatMinutes(minutes, true);
  };

  const mode = sanitizeMode(body.mode);
  const stepMinutes = sanitizeStep(body.stepMinutes);
  // Legacy rows kept the entered clock time in `customTime`; it is an audit
  // trail now, never a schedule.
  const customTime = readClock(body.customTime);
  const fixedTime = readClock(body.fixedTime) ?? (mode === "fixedClock" ? customTime : null);
  if (mode === "fixedClock" && !fixedTime) {
    throw new Error("A fixed clock time is required");
  }

  return {
    prayerKey: key,
    mode,
    offsetMinutes: sanitizeOffset(body.offsetMinutes),
    stepMinutes,
    fixedTime,
    customTime,
    calibratedAt: parseDateKey(body.calibratedAt),
    reminderEnabled: body.reminderEnabled !== false,
    // Islam never stores congregation times as astronomy: this is the mosque's
    // policy, validated and kept apart from the azan rule.
    iqamah: normalizeIqamah(body.iqamah),
    reminderAt: sanitizeReminderTarget(body.reminderAt),
  };
}

export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function sanitizeClock(raw: unknown, fallbackId: number, sortOrder: number): WorldClock | null {
  if (!isRecord(raw)) return null;
  const timezone = typeof raw.timezone === "string" ? raw.timezone.trim() : "";
  if (!timezone || !isValidTimezone(timezone)) return null;
  const label =
    (typeof raw.label === "string" ? raw.label.trim() : "") ||
    timezone.split("/").pop()!.replace(/_/g, " ");
  return {
    id: typeof raw.id === "number" && Number.isFinite(raw.id) ? raw.id : fallbackId,
    label: label.slice(0, 60),
    timezone,
    accent: (typeof raw.accent === "string" ? raw.accent : "cyan").slice(0, 20),
    sortOrder: typeof raw.sortOrder === "number" ? raw.sortOrder : sortOrder,
  };
}

/**
 * Bring a stored payload up to the current schema.
 *
 * - missing / unparseable data  -> fresh defaults
 * - older version               -> migrated forward, user data preserved
 * - newer version               -> left alone (a downgrade), values re-validated
 */
function migrate(raw: unknown): StoreShape {
  const base = defaultStore();
  if (!isRecord(raw)) return base;

  const data = raw as Partial<StoreShape>;

  const settings = sanitizeSettings(data.settings, DEFAULT_SETTINGS);
  const clocks: WorldClock[] = [];
  const rawClocks = Array.isArray(data.clocks) ? data.clocks : [];
  rawClocks.forEach((clock, index) => {
    const parsed = sanitizeClock(clock, base.nextClockId + index, index + 1);
    if (parsed) clocks.push(parsed);
  });
  const prefs: PrayerPref[] = [];
  if (Array.isArray(data.prefs)) {
    const calibrationContext = contextFrom(settings);
    const migratedAt = new Date();
    data.prefs.forEach((raw) => {
      try {
        const pref = sanitizePref(raw);
        if (!pref.calibratedAt && pref.customTime && pref.mode !== "fixedClock") {
          // v1 static override: recover the Δuser it encoded, so the prayer
          // keeps showing the familiar time today and tracks the sun from now.
          const rule = normalizeStoredRule(
            pref.prayerKey,
            {
              mode: pref.mode,
              offsetMinutes: pref.offsetMinutes,
              stepMinutes: pref.stepMinutes,
              fixedTime: pref.fixedTime,
              customTime: pref.customTime,
              calibratedAt: null,
            },
            calibrationContext,
            migratedAt,
          );
          prefs.push({
            ...pref,
            mode: rule.mode,
            offsetMinutes: rule.offsetMin,
            stepMinutes: rule.stepMin,
            fixedTime: rule.fixedClock,
            calibratedAt: rule.calibratedAt,
          });
          return;
        }
        if (pref.mode === "fixedClock" && !pref.calibratedAt) {
          // A pinned clock time needs no Δuser, but give it a date so the UI can
          // explain when it was configured.
          prefs.push({ ...pref, calibratedAt: dateKey(migratedAt) });
          return;
        }
        prefs.push(pref);
      } catch {
        /* drop invalid legacy rows */
      }
    });
  }
  const highestId = clocks.reduce((max, clock) => Math.max(max, clock.id), 0);

  return {
    version: STORAGE_VERSION,
    settings,
    clocks: clocks.length > 0 ? clocks : base.clocks,
    prefs,
    nextClockId:
      typeof data.nextClockId === "number" && Number.isFinite(data.nextClockId)
        ? Math.max(data.nextClockId, highestId + 1)
        : Math.max(base.nextClockId, highestId + 1),
  };
}

async function readStore(): Promise<StoreShape> {
  const raw = await readJSON<unknown>(STORAGE_KEY);
  if (raw === null) {
    const fresh = defaultStore();
    await writeJSON(STORAGE_KEY, fresh);
    return fresh;
  }
  const store = migrate(raw);
  // Persist the upgraded payload. Without this, a v1 static prayer time would
  // be re-derived against "today" on every launch, which would pin it in place
  // and defeat the whole point of the calibration offsets.
  if (!isRecord(raw) || raw.version !== STORAGE_VERSION) {
    await writeStore(store);
  }
  return store;
}

async function writeStore(store: StoreShape): Promise<void> {
  await writeJSON(STORAGE_KEY, store);
}

/* ------------------------------------------------------------------ */
/* Public API                                                           */
/* ------------------------------------------------------------------ */

export async function getSettings(): Promise<Settings> {
  return (await readStore()).settings;
}

/** Merge a patch into the stored settings and return the saved result. */
export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const store = await readStore();
  store.settings = sanitizeSettings(patch, store.settings);
  await writeStore(store);
  return store.settings;
}

export async function getClocks(): Promise<WorldClock[]> {
  return (await readStore()).clocks;
}

export async function addClock(input: {
  label?: string;
  timezone: string;
  accent?: string;
}): Promise<WorldClock> {
  const timezone = (input.timezone ?? "").trim();
  if (!timezone) throw new Error("timezone is required");
  if (!isValidTimezone(timezone)) throw new Error("Invalid timezone");

  const store = await readStore();
  const label =
    (input.label ?? "").trim() || timezone.split("/").pop()!.replace(/_/g, " ");
  const clock: WorldClock = {
    id: store.nextClockId,
    label: label.slice(0, 60),
    timezone,
    accent: (input.accent ?? "cyan").slice(0, 20),
    sortOrder: store.clocks.length + 1,
  };
  store.nextClockId += 1;
  store.clocks = [...store.clocks, clock];
  await writeStore(store);
  return clock;
}

export async function updateClock(
  id: number,
  patch: { label?: string; accent?: string },
): Promise<WorldClock | null> {
  const store = await readStore();
  let updated: WorldClock | null = null;
  store.clocks = store.clocks.map((clock) => {
    if (clock.id !== id) return clock;
    updated = {
      ...clock,
      label:
        typeof patch.label === "string" && patch.label.trim()
          ? patch.label.trim().slice(0, 60)
          : clock.label,
      accent: typeof patch.accent === "string" ? patch.accent.slice(0, 20) : clock.accent,
    };
    return updated;
  });
  await writeStore(store);
  return updated;
}

export async function deleteClock(id: number): Promise<void> {
  const store = await readStore();
  store.clocks = store.clocks
    .filter((clock) => clock.id !== id)
    .map((clock, index) => ({ ...clock, sortOrder: index + 1 }));
  await writeStore(store);
}

/** Apply a new display order, given the ids in the order they should appear. */
export async function reorderClocks(orderedIds: number[]): Promise<WorldClock[]> {
  const store = await readStore();
  const byId = new Map(store.clocks.map((clock) => [clock.id, clock]));
  const reordered: WorldClock[] = [];
  orderedIds.forEach((id) => {
    const clock = byId.get(id);
    if (clock) {
      reordered.push(clock);
      byId.delete(id);
    }
  });
  // Anything the caller did not mention keeps its relative position at the end.
  byId.forEach((clock) => reordered.push(clock));
  store.clocks = reordered.map((clock, index) => ({ ...clock, sortOrder: index + 1 }));
  await writeStore(store);
  return store.clocks;
}

export async function getPrayerPrefs(): Promise<PrayerPref[]> {
  return (await readStore()).prefs;
}

/** Upsert one prayer preference, rejecting invalid keys, times and offsets. */
export async function savePrayerPref(patch: PrayerPref): Promise<PrayerPref[]> {
  const pref = sanitizePref(patch);
  const store = await readStore();
  const previous = store.prefs.find((p) => p.prayerKey === pref.prayerKey);
  // A partial write that does not mention the mosque policy keeps it, so
  // correcting an azan never silently drops the jamaat configuration.
  const merged: PrayerPref = {
    ...pref,
    iqamah: patch.iqamah === undefined && previous ? previous.iqamah : pref.iqamah,
    reminderAt:
      patch.reminderAt === undefined && previous ? previous.reminderAt : pref.reminderAt,
  };
  store.prefs = [...store.prefs.filter((p) => p.prayerKey !== merged.prayerKey), merged];
  await writeStore(store);
  return store.prefs;
}

/** Wipe everything — used by the "reset app data" button in settings. */
export async function clearAll(): Promise<void> {
  await removeRaw(STORAGE_KEY);
}