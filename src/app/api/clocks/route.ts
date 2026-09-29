import { NextResponse } from "next/server";
import { db } from "@/db";
import { worldClocks } from "@/db/schema";
import { getClocks } from "@/lib/server-data";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getClocks());
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    label?: string;
    timezone?: string;
    accent?: string;
  };
  const timezone = (body.timezone ?? "").trim();
  if (!timezone) {
    return NextResponse.json({ error: "timezone is required" }, { status: 400 });
  }
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    return NextResponse.json({ error: "Invalid timezone" }, { status: 400 });
  }
  const label =
    (body.label ?? "").trim() || timezone.split("/").pop()!.replace(/_/g, " ");

  try {
    const existing = await getClocks();
    const inserted = await db
      .insert(worldClocks)
      .values({
        label: label.slice(0, 60),
        timezone,
        accent: (body.accent ?? "cyan").slice(0, 20),
        sortOrder: existing.length + 1,
      })
      .returning();
    return NextResponse.json(inserted[0], { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to add clock", detail: String(error) },
      { status: 500 },
    );
  }
}
