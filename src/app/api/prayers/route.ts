import { NextResponse } from "next/server";
import { ensurePrayerCalibrationSchema } from "@/db/ensure-schema";
import { prayerPrefs } from "@/db/schema";
import { db } from "@/db";
import { loadPrayerPrefs, loadSettingsSnapshot } from "@/lib/server-data";
import { contextFrom } from "@/lib/calibration";
import { resolvePrayerWrite } from "@/lib/prayer-write";
import { PRAYER_ORDER } from "@/lib/prayer";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await loadSettingsSnapshot();
  if (!snapshot.schema.ok) {
    return NextResponse.json(
      { error: "Database schema is not ready", detail: snapshot.schema.error },
      { status: 503 },
    );
  }
  const load = await loadPrayerPrefs(snapshot);
  if (load.notice && load.prefs.length === 0) {
    return NextResponse.json({ error: load.notice }, { status: 503 });
  }
  return NextResponse.json(load.prefs);
}

/**
 * Save one prayer.
 *
 * Ways to update a time, matching the calibration model:
 *  - `offsetMinutes: 23`                     → Δuser set directly (quick ±1
 *    nudges, fine tuning). This is what the app sends after the user nudges.
 *  - `customTime: "05:25", recalibrate: true` → a calibration event. Δuser is
 *    measured against the astronomical baseline of `calibratedAt` and stored,
 *    so the display follows the sun from then on.
 *  - `customTime` alone is treated as the audit trail of the clock time the
 *    user typed; it never drives scheduling.
 *  - `iqamah: {...}`                         → the mosque's jamaat policy,
 *    validated by `normalizeIqamah` and stored separately from the azan rule.
 *  - `reminderAt: "azan" | "iqamah"`         → which time the reminder follows.
 *
 * Everything is a partial update: fields that are not sent keep their value.
 * The decision itself lives in `src/lib/prayer-write.ts` so it can be unit
 * tested without a database.
 */
export async function PUT(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Never write the calibration columns unless the DDL has actually run.
  const schema = await ensurePrayerCalibrationSchema();
  if (!schema.ok) {
    return NextResponse.json(
      { error: "Database schema is not ready", detail: schema.error },
      { status: 503 },
    );
  }

  const key = (typeof body.prayerKey === "string" ? body.prayerKey : "").trim();
  if (!(PRAYER_ORDER as string[]).includes(key)) {
    return NextResponse.json({ error: "Unknown prayer key" }, { status: 400 });
  }

  // A write needs the user's real calculation context, not built-in defaults.
  const snapshot = await loadSettingsSnapshot();
  if (snapshot.notice) {
    return NextResponse.json(
      { error: "Settings are unavailable", detail: snapshot.notice },
      { status: 503 },
    );
  }

  const ctx = contextFrom(snapshot.settings);
  const [existing] = await db
    .select()
    .from(prayerPrefs)
    .where(eq(prayerPrefs.prayerKey, key))
    .limit(1);

  const resolved = resolvePrayerWrite({
    body,
    ctx,
    existing: existing ?? null,
    now: new Date(),
  });
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  }

  const { values } = resolved;
  try {
    await db
      .insert(prayerPrefs)
      .values({ ...values, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: prayerPrefs.prayerKey,
        set: {
          mode: values.mode,
          customTime: values.customTime,
          offsetMinutes: values.offsetMinutes,
          stepMinutes: values.stepMinutes,
          fixedTime: values.fixedTime,
          calibratedAt: values.calibratedAt,
          reminderEnabled: values.reminderEnabled,
          iqamah: values.iqamah,
          reminderAt: values.reminderAt,
          updatedAt: new Date(),
        },
      });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to save prayer preference", detail: String(error) },
      { status: 500 },
    );
  }

  const after = await loadPrayerPrefs(snapshot);
  if (after.notice) {
    console.error(`[prayers] saved, but re-reading failed: ${after.notice}`);
  }
  return NextResponse.json(after.prefs);
}
