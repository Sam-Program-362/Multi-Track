/**
 * Dynamic prayer time calibration (see docs/prayer-time-calibration.md).
 *
 * The app never stores a prayer time as a static clock value. When the user
 * enters their masjid / Iqamah time, that entry is treated as a *calibration
 * event*: the difference between it and the astronomical solar time on that
 * day is stored as Δuser(p). Every later day is projected from the new
 * astronomical baseline plus that stored offset, so the timer follows the
 * seasons instead of drifting out of sync.
 *
 *     Δuser(p)     = Tinput(p, d0) − Tastro(p, d0)          (calibration)
 *     Tfinal(p, d) = Tastro(p, d) + Δuser(p)                (projection)
 *
 * Optional extras from the spec:
 *   - steppedOffset: ceil((Tastro + Δuser) / S) × S, mosque Iqamah boards
 *   - fixedClock: a prayer pinned to a clock time all year (e.g. Jumu'ah)
 *
 * The astronomy itself lives in `prayer.ts` (solar declination, equation of
 * time, transit, hour angle, elevation dip and high-latitude fallbacks), so
 * calibration and the on-screen times can never disagree.
 */
import {
  METHODS,
  PRAYER_ORDER,
  computePrayerMinutes,
  formatMinutes,
  minutesToInputValue,
  parseTimeToMinutes,
  type AsrJuristic,
  type HighLatitudeRule,
  type MethodKey,
  type PrayerKey,
} from "./prayer";
import { zoneOffsetMinutes } from "./timezones";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

/** The five prayers a user can calibrate (sunrise follows the sun only). */
export const TRACKED_PRAYERS = [
  "fajr",
  "dhuhr",
  "asr",
  "maghrib",
  "isha",
] as const;

export type TrackedPrayerKey = (typeof TRACKED_PRAYERS)[number];

/**
 * - dynamicOffset: daily astronomical baseline + stored Δuser (default)
 * - steppedOffset: the same, quantised to the next multiple of `stepMin`
 * - fixedClock: an unchanging "HH:mm" (Jumu'ah, exam-time schedules…)
 */
export type TrackingMode = "dynamicOffset" | "steppedOffset" | "fixedClock";

export const TRACKING_MODES: ReadonlyArray<{
  id: TrackingMode;
  label: string;
  short: string;
  hint: string;
}> = [
  {
    id: "dynamicOffset",
    label: "Auto (sun + my offset)",
    short: "auto",
    hint: "Follows the sun every day and keeps your local adjustment.",
  },
  {
    id: "steppedOffset",
    label: "Mosque steps",
    short: "steps",
    hint: "Rounds up to a clean 5, 10 or 15 minute board time.",
  },
  {
    id: "fixedClock",
    label: "Fixed clock",
    short: "fixed",
    hint: "Never moves, e.g. Jumu'ah at 13:30.",
  },
];

export const STEP_CHOICES = [5, 10, 15] as const;

/** Offsets larger than this are almost always a typo (12h either way). */
export const MAX_OFFSET_MINUTES = 180;

export type PrayerRule = {
  mode: TrackingMode;
  /** Δuser(p) in minutes, captured on `calibratedAt`. */
  offsetMin: number;
  /** Quantisation step in minutes, 0 = off. */
  stepMin: number;
  /** "HH:mm" used by `fixedClock`. */
  fixedClock: string | null;
  /** Calibration date (d0) as "YYYY-MM-DD", null when never calibrated. */
  calibratedAt: string | null;
};

/** Everything the solar baseline needs; a `Settings` satisfies this. */
export type CalibrationContext = {
  latitude: number;
  longitude: number;
  timezone: string;
  method: MethodKey;
  asrJuristic: AsrJuristic;
  elevationMeters?: number;
  highLatitudeRule?: HighLatitudeRule;
};

/** The stored shape of one prayer preference (superset of old rows). */
export type StoredRuleInput = {
  mode?: unknown;
  offsetMinutes?: unknown;
  stepMinutes?: unknown;
  fixedTime?: unknown;
  customTime?: unknown;
  calibratedAt?: unknown;
};

export type CalibratedScheduleItem = {
  key: PrayerKey;
  /** Final displayed time, minutes past local midnight. */
  minutes: number;
  /** Astronomical baseline for that date, minutes past local midnight. */
  astroMinutes: number;
  rule: PrayerRule;
  offsetMinutes: number;
  mode: TrackingMode;
  stepMinutes: number;
  fixedClock: string | null;
  /** True when a calibration (or a fixed/stepped mode) is active. */
  calibrated: boolean;
  reminder: boolean;
};

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

export function wrapMinutes(minutes: number): number {
  return ((Math.round(minutes) % 1440) + 1440) % 1440;
}

/** Minutes as "HH:mm" (null when the value cannot be parsed). */
export function formatClock(minutes: number): string {
  return minutesToInputValue(minutes);
}

export function parseClock(value: unknown): number | null {
  return typeof value === "string" ? parseTimeToMinutes(value) : null;
}

/**
 * Signed shortest distance from the astronomical baseline to the entered
 * time, in minutes. The midnight wrap is resolved to the smaller arc (baseline
 * 23:58 → entered 00:02 is +4, not +1436), which keeps Isha calibration sane
 * when twilight crosses midnight at high latitudes.
 */
export function captureOffsetMinutes(
  inputMinutes: number,
  astroMinutes: number,
): number {
  let delta = (Math.round(inputMinutes) - Math.round(astroMinutes)) % 1440;
  if (delta > 720) delta -= 1440;
  if (delta < -720) delta += 1440;
  return delta;
}

/**
 * Step-jump quantisation: round a calibrated time *up* to the next multiple of
 * `step` (report equation 7). A drifting 05:01–05:15 stays at 05:15 and jumps
 * to 05:30 on the day it would reach 05:16.
 */
export function stepJumpMinutes(minutes: number, step: number): number {
  const size = sanitizeStep(step);
  if (size <= 0) return wrapMinutes(minutes);
  const wrapped = wrapMinutes(minutes);
  // A time that is already exactly on the step stays where it is.
  if (wrapped % size === 0) return wrapped;
  return wrapMinutes(Math.ceil(wrapped / size) * size);
}

export function sanitizeStep(value: unknown): number {
  const step = typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 0;
  if (step <= 0) return 0;
  if (step > 60) return 60;
  return step;
}

export function sanitizeOffset(value: unknown): number {
  const offset =
    typeof value === "number" && Number.isFinite(value) ? Math.round(value) : 0;
  return Math.max(-MAX_OFFSET_MINUTES, Math.min(MAX_OFFSET_MINUTES, offset));
}

export function sanitizeMode(value: unknown): TrackingMode {
  return value === "steppedOffset" || value === "fixedClock" || value === "dynamicOffset"
    ? value
    : "dynamicOffset";
}

/** Local calendar date as "YYYY-MM-DD" (timezone independent by design). */
export function dateKey(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parse a stored calibration date, returning null when it is unusable. */
export function parseDateKey(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return dateKey(value);
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(trimmed);
  if (!match) {
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : dateKey(parsed);
  }
  const [, y, m, d] = match;
  const probe = new Date(Number(y), Number(m) - 1, Number(d));
  return Number.isNaN(probe.getTime()) ? null : `${y}-${m}-${d}`;
}

export function defaultRule(): PrayerRule {
  return {
    mode: "dynamicOffset",
    offsetMin: 0,
    stepMin: 0,
    fixedClock: null,
    calibratedAt: null,
  };
}

export function contextFrom(settings: CalibrationContext): CalibrationContext {
  return {
    latitude: settings.latitude,
    longitude: settings.longitude,
    timezone: settings.timezone,
    method: settings.method,
    asrJuristic: settings.asrJuristic,
    elevationMeters: settings.elevationMeters,
    highLatitudeRule: settings.highLatitudeRule,
  };
}

/* ------------------------------------------------------------------ */
/* Solar baseline                                                      */
/* ------------------------------------------------------------------ */

/**
 * Astronomical baseline for one calendar date, in minutes past local
 * midnight. Uses the timezone offset in force on that date, so DST changes
 * move the baseline while Δuser stays untouched (spec §4.2).
 */
export function astroMinutesFor(
  date: Date,
  ctx: CalibrationContext,
): Record<PrayerKey, number> {
  // No GPS and no city? Fall back to the meridian implied by the local offset.
  const longitude = Number.isFinite(ctx.longitude)
    ? ctx.longitude
    : estimateLongitudeDegrees(ctx.timezone, date);
  const latitude = Number.isFinite(ctx.latitude) ? ctx.latitude : 0;
  return computePrayerMinutes(date, {
    latitude,
    longitude,
    timezoneOffsetHours: zoneOffsetForDate(date, ctx.timezone) / 60,
    method: ctx.method,
    asrJuristic: ctx.asrJuristic,
    elevationMeters: ctx.elevationMeters,
    highLatitudeRule: ctx.highLatitudeRule,
  });
}

/**
 * UTC offset (minutes) in force during the day the user cares about.
 *
 * Sampled at 12:00 UTC rather than at local midnight: on a DST switch day the
 * clocks have already moved by the time the prayers happen, so midnight would
 * still report yesterday's offset and shift the whole day by an hour.
 */
export function zoneOffsetForDate(date: Date, timezone: string): number {
  const noonUtc = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0),
  );
  return zoneOffsetMinutes(noonUtc, timezone);
}

/** Meridian guess from the zone's offset: λ ≈ Z × 15° (report §4.2 fallback). */
export function estimateLongitudeDegrees(timezone: string, date = new Date()): number {
  const offsetHours = zoneOffsetForDate(date, timezone) / 60;
  const longitude = offsetHours * 15;
  return Math.max(-180, Math.min(180, longitude));
}

/** Calibration context as a compact label for the UI ("Karachi · 23.81°, 90.41°"). */
export function contextLabel(ctx: CalibrationContext): string {
  const method = METHODS[ctx.method]?.name ?? "Muslim World League";
  return `${method} · ${ctx.latitude.toFixed(2)}°, ${ctx.longitude.toFixed(2)}°`;
}

/* ------------------------------------------------------------------ */
/* Rule normalisation + calibration                                    */
/* ------------------------------------------------------------------ */

/**
 * Turn whatever is stored (including rows written before calibration existed)
 * into a usable rule.
 *
 * Legacy rows only had `customTime` (a static override) and `offsetMinutes`.
 * For those, Δuser is recovered by comparing the old effective time against the
 * astronomical baseline for the day the row was last written, then
 * `calibratedAt` is set to that day — so the time the user chose stays put on
 * that date and starts tracking the sun from then on.
 */
export function normalizeStoredRule(
  prayerKey: string,
  input: StoredRuleInput | null | undefined,
  ctx?: CalibrationContext,
  fallbackDate: Date = new Date(),
): PrayerRule {
  const raw = input ?? {};
  const mode = sanitizeMode(raw.mode);
  const stepMin = sanitizeStep(raw.stepMinutes);
  let offsetMin = sanitizeOffset(raw.offsetMinutes);
  const customMinutes = parseClock(raw.customTime);
  let fixedClock =
    mode === "fixedClock"
      ? parseClock(raw.fixedTime) ?? customMinutes ?? null
      : parseClock(raw.fixedTime);
  let calibratedAt = parseDateKey(raw.calibratedAt);

  if (mode === "fixedClock") {
    return {
      mode,
      offsetMin,
      stepMin,
      fixedClock:
        fixedClock === null ? null : formatMinutes(fixedClock, true),
      calibratedAt,
    };
  }

  if (calibratedAt === null && customMinutes !== null && ctx) {
    // Legacy static override → recover the offset it represented.
    const baseline = astroMinutesFor(fallbackDate, ctx);
    const astro = baseline[prayerKey as PrayerKey];
    if (typeof astro === "number") {
      offsetMin = sanitizeOffset(
        captureOffsetMinutes(wrapMinutes(customMinutes + offsetMin), astro),
      );
      calibratedAt = dateKey(fallbackDate);
    }
  }

  return {
    mode,
    offsetMin,
    stepMin,
    fixedClock: fixedClock === null ? null : formatMinutes(fixedClock, true),
    calibratedAt,
  };
}

/**
 * Capture a calibration event: the time the user just entered becomes Δuser
 * against the baseline of the calibration day.
 */
export function calibrate(
  rule: PrayerRule,
  inputMinutes: number,
  astroMinutes: number,
  at: Date = new Date(),
): PrayerRule {
  if (rule.mode === "fixedClock") {
    return { ...rule, fixedClock: formatMinutes(inputMinutes, true), calibratedAt: dateKey(at) };
  }
  return {
    ...rule,
    offsetMin: sanitizeOffset(captureOffsetMinutes(inputMinutes, astroMinutes)),
    calibratedAt: dateKey(at),
  };
}

/** Nudge Δuser by a whole number of minutes (quick +1 / −1 buttons). */
export function nudge(rule: PrayerRule, minutes: number, at: Date = new Date()): PrayerRule {
  if (rule.mode === "fixedClock") {
    const current = parseClock(rule.fixedClock);
    return {
      ...rule,
      fixedClock: formatMinutes((current ?? 0) + minutes, true),
      calibratedAt: dateKey(at),
    };
  }
  return {
    ...rule,
    offsetMin: sanitizeOffset(rule.offsetMin + minutes),
    calibratedAt: rule.calibratedAt ?? dateKey(at),
  };
}

/* ------------------------------------------------------------------ */
/* Projection                                                          */
/* ------------------------------------------------------------------ */

/** Project one astronomical baseline through a rule (report equation 2 + 7). */
export function projectMinutes(
  astroMinutes: number,
  rule: Pick<PrayerRule, "mode" | "offsetMin" | "stepMin" | "fixedClock">,
): number {
  if (rule.mode === "fixedClock") {
    const fixed = parseClock(rule.fixedClock);
    return fixed === null ? wrapMinutes(astroMinutes) : wrapMinutes(fixed);
  }
  const calibrated = wrapMinutes(astroMinutes + rule.offsetMin);
  if (rule.mode === "steppedOffset" && rule.stepMin > 0) {
    return stepJumpMinutes(calibrated, rule.stepMin);
  }
  return calibrated;
}

/** Human summary of a rule, e.g. "auto +23m" / "steps 10m +23m" / "fixed 13:30". */
export function describeRule(rule: PrayerRule): string {
  if (rule.mode === "fixedClock") {
    return `fixed ${rule.fixedClock ?? "—"}`;
  }
  const offset =
    rule.offsetMin === 0
      ? null
      : `Δ${rule.offsetMin > 0 ? "+" : "−"}${Math.abs(rule.offsetMin)}m`;
  if (rule.mode === "steppedOffset" && rule.stepMin > 0) {
    return [`steps ${rule.stepMin}m`, offset].filter(Boolean).join(" · ");
  }
  return offset ? `auto · ${offset}` : "auto · sun only";
}

/** Compact badge text under a prayer row. */
export function ruleBadge(rule: PrayerRule): string | null {
  if (rule.mode === "fixedClock") return rule.fixedClock ? `fixed ${rule.fixedClock}` : "fixed";
  if (rule.mode === "steppedOffset" && rule.stepMin > 0) return `steps of ${rule.stepMin}m`;
  if (rule.offsetMin !== 0) {
    return `${rule.offsetMin > 0 ? "+" : "−"}${Math.abs(rule.offsetMin)}m vs sun`;
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Schedule                                                            */
/* ------------------------------------------------------------------ */

export type SchedulePref = StoredRuleInput & {
  prayerKey: string;
  reminderEnabled?: boolean;
};

export type CalibrationSettings = CalibrationContext;

/**
 * Build the day's schedule: astronomical baseline for the date, then each
 * prayer's rule. This is the single path used by the panel, the reminders and
 * the Android notification scheduler.
 */
export function buildSchedule(
  date: Date,
  settings: CalibrationSettings,
  prefs: SchedulePref[],
  options: { now?: Date } = {},
): CalibratedScheduleItem[] {
  const ctx = contextFrom(settings);
  const astro = astroMinutesFor(date, ctx);
  const prefMap = new Map(prefs.map((pref) => [pref.prayerKey, pref]));

  return PRAYER_ORDER.map((key) => {
    const pref = prefMap.get(key);
    const rule = normalizeStoredRule(
      key,
      pref,
      ctx,
      options.now ?? date,
    );
    const astroMinutes = astro[key];
    return {
      key,
      minutes: projectMinutes(astroMinutes, rule),
      astroMinutes,
      rule,
      offsetMinutes: rule.offsetMin,
      mode: rule.mode,
      stepMinutes: rule.stepMin,
      fixedClock: rule.fixedClock,
      calibrated:
        rule.mode !== "dynamicOffset" || rule.offsetMin !== 0,
      reminder: pref?.reminderEnabled ?? true,
    };
  });
}

/* ------------------------------------------------------------------ */
/* Travel / time-zone drift                                            */
/* ------------------------------------------------------------------ */

/** The IANA zone the device is really in right now (never a fixed offset). */
export function detectedTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * True when the device zone differs from the stored one — i.e. the user has
 * travelled or the device changed zone. Offsets are location independent, so
 * only the timezone/coordinates need updating.
 */
export function timezoneDrift(stored: string, detected = detectedTimezone()): boolean {
  if (!stored || !detected) return false;
  return stored.trim() !== detected.trim();
}

/** Text used by the "calibration is active" line in the UI. */
export function calibrationSummary(items: CalibratedScheduleItem[]): string {
  const calibrated = items.filter(
    (item) => item.calibrated && item.key !== "sunrise",
  );
  if (calibrated.length === 0) {
    return "Times follow the sun exactly — tap ✎ on any prayer to match your masjid.";
  }
  const days = calibrated
    .map((item) => item.rule.calibratedAt)
    .filter((value): value is string => Boolean(value))
    .sort();
  const since = days.length ? ` · calibrated ${days[days.length - 1]}` : "";
  return `${calibrated.length} prayer${calibrated.length === 1 ? "" : "s"} auto-adjusting with the sun${since}`;
}
