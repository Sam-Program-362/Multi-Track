import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { ensurePrayerCalibrationSchema } from "@/db/ensure-schema";
import { prayerPrefs } from "@/db/schema";
import { getPrayerPrefs, getSettings } from "@/lib/server-data";
import { PRAYER_ORDER, type PrayerKey } from "@/lib/prayer";
import {
  astroMinutesFor,
  calibrate,
  contextFrom,
  dateKey,
  formatClock,
  normalizeStoredRule,
  parseClock,
  parseDateKey,
  sanitizeMode,
  sanitizeOffset,
  sanitizeStep,
  type PrayerRule,
} from "@/lib/calibration";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getPrayerPrefs());
}

/**
 * Save one prayer.
 *
 * Ways to update a time, matching the calibration model:
 *  - `offsetMinutes: 23`                    → Δuser set directly (quick ±1
 *    nudges, fine tuning). This is what the app sends after the user nudges.
 *  - `customTime: "05:25", recalibrate: true` → a calibration event. Δuser is
 *    measured against the astronomical baseline of `calibratedAt` and stored,
 *    so the display follows the sun from then on.
 *  - `customTime` alone is treated as the audit trail of the clock time the
 *    user typed; it never drives scheduling.
 *
 * Everything is a partial update: fields that are not sent keep their value.
 */
export async function PUT(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const key = (typeof body.prayerKey === "string" ? body.prayerKey : "").trim();
  if (!(PRAYER_ORDER as string[]).includes(key)) {
    return NextResponse.json({ error: "Unknown prayer key" }, { status: 400 });
  }

  // Make sure the calibration columns exist before reading or writing them.
  await ensurePrayerCalibrationSchema();

  const ctx = contextFrom(await getSettings());
  const [existing] = await db
    .select()
    .from(prayerPrefs)
    .where(eq(prayerPrefs.prayerKey, key))
    .limit(1);

  const current = normalizeStoredRule(
    key,
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
    existing?.updatedAt ?? new Date(),
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
      return NextResponse.json({ error: "Invalid time (HH:mm)" }, { status: 400 });
    }
  } else if (rawInput !== null && rawInput !== undefined && rawInput !== "") {
    return NextResponse.json({ error: "Invalid time (HH:mm)" }, { status: 400 });
  }

  /** Only an explicit flag turns an entered time into a calibration event. */
  const recalibrate = body.recalibrate === true && inputMinutes !== null;
  const clearAudit = body.reset === true;

  if (mode === "fixedClock") {
    const fixed = inputMinutes ?? parseClock(body.fixedTime) ?? parseClock(current.fixedClock);
    if (fixed === null) {
      return NextResponse.json(
        { error: "fixedTime (HH:mm) is required for fixedClock mode" },
        { status: 400 },
      );
    }
    rule = {
      ...rule,
      fixedClock: formatClock(fixed),
      calibratedAt: parseDateKey(body.calibratedAt) ?? current.calibratedAt ?? dateKey(new Date()),
    };
  } else if (recalibrate && inputMinutes !== null) {
    const calibrationDate = parseDateKey(body.calibratedAt) ?? dateKey(new Date());
    const calibrationDateObj = new Date(`${calibrationDate}T12:00:00`);
    const baseline = astroMinutesFor(calibrationDateObj, ctx)[key as PrayerKey];
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
            (offsetMin !== 0 ? dateKey(new Date()) : null),
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

  try {
    await db
      .insert(prayerPrefs)
      .values({
        prayerKey: key,
        label: key,
        mode: rule.mode,
        customTime,
        offsetMinutes: rule.offsetMin,
        stepMinutes: rule.stepMin,
        fixedTime: rule.fixedClock,
        calibratedAt: rule.calibratedAt,
        reminderEnabled,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: prayerPrefs.prayerKey,
        set: {
          mode: rule.mode,
          customTime,
          offsetMinutes: rule.offsetMin,
          stepMinutes: rule.stepMin,
          fixedTime: rule.fixedClock,
          calibratedAt: rule.calibratedAt,
          reminderEnabled,
          updatedAt: new Date(),
        },
      });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to save prayer preference", detail: String(error) },
      { status: 500 },
    );
  }

  return NextResponse.json(await getPrayerPrefs());
}
