import { NextResponse } from "next/server";
import { db } from "@/db";
import { prayerPrefs } from "@/db/schema";
import { getPrayerPrefs } from "@/lib/server-data";
import { PRAYER_ORDER } from "@/lib/prayer";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getPrayerPrefs());
}

export async function PUT(request: Request) {
  const body = (await request.json()) as {
    prayerKey?: string;
    customTime?: string | null;
    offsetMinutes?: number;
    reminderEnabled?: boolean;
  };
  const key = (body.prayerKey ?? "").trim();
  if (!PRAYER_ORDER.includes(key as (typeof PRAYER_ORDER)[number])) {
    return NextResponse.json({ error: "Unknown prayer key" }, { status: 400 });
  }
  let customTime: string | null = null;
  if (typeof body.customTime === "string" && body.customTime.trim()) {
    if (!/^\d{1,2}:\d{2}$/.test(body.customTime.trim())) {
      return NextResponse.json({ error: "Invalid time (HH:MM)" }, { status: 400 });
    }
    customTime = body.customTime.trim();
  }
  const offsetMinutes = Number.isFinite(body.offsetMinutes)
    ? Math.max(-120, Math.min(120, Math.round(body.offsetMinutes as number)))
    : 0;
  const reminderEnabled = body.reminderEnabled !== false;

  try {
    await db
      .insert(prayerPrefs)
      .values({
        prayerKey: key,
        label: key,
        customTime,
        offsetMinutes,
        reminderEnabled,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: prayerPrefs.prayerKey,
        set: { customTime, offsetMinutes, reminderEnabled, updatedAt: new Date() },
      });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to save prayer preference", detail: String(error) },
      { status: 500 },
    );
  }
  return NextResponse.json(await getPrayerPrefs());
}
