import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { ensurePrayerCalibrationSchema } from "@/db/ensure-schema";
import { appSettings } from "@/db/schema";
import { loadSettingsSnapshot } from "@/lib/server-data";
import { METHODS, type MethodKey } from "@/lib/prayer";
import { HIGH_LATITUDE_CHOICES } from "@/lib/calibration";

export const dynamic = "force-dynamic";

export async function GET() {
  const snapshot = await loadSettingsSnapshot();
  if (!snapshot.schema.ok) {
    return NextResponse.json(
      { error: "Database schema is not ready", detail: snapshot.schema.error },
      { status: 503 },
    );
  }
  return NextResponse.json(snapshot.settings);
}

export async function PUT(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;

  // The settings row itself gains columns, so the DDL must be complete before
  // it can be read, seeded or updated.
  const schema = await ensurePrayerCalibrationSchema();
  if (!schema.ok) {
    return NextResponse.json(
      { error: "Database schema is not ready", detail: schema.error },
      { status: 503 },
    );
  }

  // Ensure the singleton row exists, and refuse to patch from a fallback.
  const snapshot = await loadSettingsSnapshot();
  if (snapshot.notice) {
    return NextResponse.json(
      { error: "Settings are unavailable", detail: snapshot.notice },
      { status: 503 },
    );
  }

  const patch: Partial<typeof appSettings.$inferInsert> = { updatedAt: new Date() };

  if (typeof body.locationName === "string" && body.locationName.trim()) {
    patch.locationName = body.locationName.trim().slice(0, 120);
  }
  if (typeof body.latitude === "number" && Number.isFinite(body.latitude)) {
    patch.latitude = Math.max(-90, Math.min(90, body.latitude));
  }
  if (typeof body.longitude === "number" && Number.isFinite(body.longitude)) {
    patch.longitude = Math.max(-180, Math.min(180, body.longitude));
  }
  if (typeof body.timezone === "string" && body.timezone.trim()) {
    patch.timezone = body.timezone.trim();
  }
  if (typeof body.method === "string" && body.method in METHODS) {
    patch.method = body.method as MethodKey;
  }
  if (body.asrJuristic === "Hanafi" || body.asrJuristic === "Standard") {
    patch.asrJuristic = body.asrJuristic;
  }
  if (typeof body.elevationMeters === "number" && Number.isFinite(body.elevationMeters)) {
    patch.elevationMeters = Math.max(0, Math.min(4000, Math.round(body.elevationMeters)));
  }
  if (
    typeof body.highLatitudeRule === "string" &&
    HIGH_LATITUDE_CHOICES.some((choice) => choice.id === body.highLatitudeRule)
  ) {
    patch.highLatitudeRule = body.highLatitudeRule;
  }
  if (typeof body.use24Hour === "boolean") patch.use24Hour = body.use24Hour;
  if (typeof body.remindersEnabled === "boolean") {
    patch.remindersEnabled = body.remindersEnabled;
  }
  if (typeof body.reminderSound === "string") {
    patch.reminderSound = body.reminderSound.slice(0, 40);
  }

  try {
    await db
      .update(appSettings)
      .set(patch)
      .where(eq(appSettings.profile, "default"));
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to save settings", detail: String(error) },
      { status: 500 },
    );
  }

  const updated = await loadSettingsSnapshot();
  return NextResponse.json(updated.settings);
}
