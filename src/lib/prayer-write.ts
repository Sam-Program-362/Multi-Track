import {
  astroMinutesFor,
  calibrate,
  dateKey,
  formatClock,
  normalizeIqamah,
  normalizeStoredRule,
  parseClock,
  parseDateKey,
  sanitizeIqamahMode,
  sanitizeMode,
  sanitizeOffset,
  sanitizeReminderTarget,
  sanitizeStep,
  type CalibrationContext,
  type PrayerRule,
} from "./calibration";
import { PRAYER_ORDER, type PrayerKey } from "./prayer";

/** The subset of a `prayer_prefs` row this decision needs. */
export type StoredPrayerRow = {
  mode: string | null;
  offsetMinutes: number | null;
  stepMinutes: number | null;
  fixedTime: string | null;
  customTime: string | null;
  calibratedAt: string | null;
  reminderEnabled: boolean | null;
  iqamah?: string | null;
  reminderAt?: string | null;
  updatedAt?: Date | null;
};

export type PrayerWriteInput = {
  body: Record<string, unknown>;
  ctx: CalibrationContext;
  existing: StoredPrayerRow | null;
  /** Injectable clock so the behaviour is testable. */
  now?: Date;
};

export type PrayerWriteValues = {
  prayerKey: PrayerKey;
  label: string;
  mode: PrayerRule["mode"];
  customTime: string | null;
  offsetMinutes: number;
  stepMinutes: number;
  fixedTime: string | null;
  calibratedAt: string | null;
  reminderEnabled: boolean;
  /** Serialised `IqamahRule` — the mosque's jamaat policy. */
  iqamah: string;
  reminderAt: string;
};

export type PrayerWriteResult =
  | { ok: true; values: PrayerWriteValues }
  | { ok: false; status: number; error: string };

/**
 * Pure resolution of one `PUT /api/prayers` request.
 *
 * The astronomy never comes from the client: an entered time is either a
 * calibration event (Δuser measured against the baseline for `calibratedAt`) or
 * a fixed clock. The jamaat policy is validated and stored separately, so
 * correcting a mosque time can never move the astronomical schedule and vice
 * versa.
 */
export function resolvePrayerWrite(input: PrayerWriteInput): PrayerWriteResult {
  const { body, ctx, existing } = input;
  const now = input.now ?? new Date();

  const key = (typeof body.prayerKey === "string" ? body.prayerKey : "").trim();
  if (!(PRAYER_ORDER as string[]).includes(key)) {
    return { ok: false, status: 400, error: "Unknown prayer key" };
  }
  const prayerKey = key as PrayerKey;

  const current = normalizeStoredRule(
    prayerKey,
    existing
      ? {
          mode: existing.mode,
          offsetMinutes: existing.offsetMinutes,
          stepMinutes: existing.stepMinutes,
          fixedTime: existing.fixedTime,
          customTime: existing.customTime,
          calibratedAt: existing.calibratedAt,
        }
      : null,
    ctx,
    existing?.updatedAt ?? now,
  );

  const mode = sanitizeMode(body.mode ?? current.mode);
  const stepMin =
    body.stepMinutes === undefined ? current.stepMin : sanitizeStep(body.stepMinutes);
  const offsetMin =
    body.offsetMinutes === undefined
      ? current.offsetMin
      : sanitizeOffset(body.offsetMinutes);

  let rule: PrayerRule = {
    mode,
    offsetMin,
    stepMin,
    fixedClock: current.fixedClock,
    calibratedAt: current.calibratedAt,
  };

  // The clock time the user typed, if any. For a fixed clock the explicit
  // fixedTime wins; customTime may just be the old audit value.
  const rawInput =
    mode === "fixedClock" ? body.fixedTime ?? body.customTime : body.customTime;
  let inputMinutes: number | null = null;
  if (typeof rawInput === "string" && rawInput.trim()) {
    inputMinutes = parseClock(rawInput.trim());
    if (inputMinutes === null) {
      return { ok: false, status: 400, error: "Invalid time (HH:mm)" };
    }
  } else if (rawInput !== null && rawInput !== undefined && rawInput !== "") {
    return { ok: false, status: 400, error: "Invalid time (HH:mm)" };
  }

  /** Only an explicit flag turns an entered time into a calibration event. */
  const recalibrate = body.recalibrate === true && inputMinutes !== null;
  const clearAudit = body.reset === true;

  if (mode === "fixedClock") {
    const fixed =
      inputMinutes ?? parseClock(body.fixedTime) ?? parseClock(current.fixedClock);
    if (fixed === null) {
      return {
        ok: false,
        status: 400,
        error: "fixedTime (HH:mm) is required for fixedClock mode",
      };
    }
    rule = {
      ...rule,
      fixedClock: formatClock(fixed),
      calibratedAt:
        parseDateKey(body.calibratedAt) ??
        current.calibratedAt ??
        dateKey(now),
    };
  } else if (recalibrate && inputMinutes !== null) {
    const calibrationDate = parseDateKey(body.calibratedAt) ?? dateKey(now);
    const calibrationDateObj = new Date(`${calibrationDate}T12:00:00`);
    const baseline = astroMinutesFor(calibrationDateObj, ctx)[prayerKey];
    rule = calibrate(rule, inputMinutes, baseline ?? 0, calibrationDateObj);
    rule.calibratedAt = calibrationDate;
  } else {
    // Explicit offset update (or a reset); keep the existing Δuser semantics.
    rule = {
      ...rule,
      fixedClock: null,
      calibratedAt:
        body.offsetMinutes === undefined && body.mode === undefined
          ? current.calibratedAt
          : parseDateKey(body.calibratedAt) ??
            current.calibratedAt ??
            (offsetMin !== 0 ? dateKey(now) : null),
    };
    if (body.reset === true) {
      rule = { ...rule, offsetMin: 0, stepMin: 0, calibratedAt: null };
    }
  }

  const reminderEnabled =
    typeof body.reminderEnabled === "boolean"
      ? body.reminderEnabled
      : existing?.reminderEnabled ?? true;

  // Audit trail only: the clock time the user typed, kept for display.
  const customTime = clearAudit
    ? null
    : inputMinutes !== null
      ? formatClock(inputMinutes)
      : existing?.customTime ?? null;

  /* ---------------- jamaat / iqamah ---------------- */

  const iqamahMode = body.iqamahMode;
  let iqamah = normalizeIqamah(body.iqamah ?? existing?.iqamah ?? null);
  if (body.resetIqamah === true) {
    iqamah = normalizeIqamah(null);
  } else if (iqamahMode !== undefined) {
    // Convenience path for the editor's mode chips: keep the other fields,
    // change only the mode (so switching back does not lose the delay/table).
    iqamah = normalizeIqamah({
      ...iqamah,
      mode: sanitizeIqamahMode(iqamahMode),
    });
  }

  const reminderAt = sanitizeReminderTarget(
    body.reminderAt ?? existing?.reminderAt ?? "azan",
  );

  return {
    ok: true,
    values: {
      prayerKey,
      label: prayerKey,
      mode: rule.mode,
      customTime,
      offsetMinutes: rule.offsetMin,
      stepMinutes: rule.stepMin,
      fixedTime: rule.fixedClock,
      calibratedAt: rule.calibratedAt,
      reminderEnabled,
      iqamah: JSON.stringify(iqamah),
      reminderAt,
    },
  };
}
