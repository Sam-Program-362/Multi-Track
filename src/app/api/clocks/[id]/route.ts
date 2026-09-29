import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { worldClocks } from "@/db/schema";

export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const numericId = Number(id);
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  try {
    await db.delete(worldClocks).where(eq(worldClocks.id, numericId));
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to delete clock", detail: String(error) },
      { status: 500 },
    );
  }
  return NextResponse.json({ ok: true });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const numericId = Number(id);
  const body = (await request.json()) as { label?: string; accent?: string };
  if (!Number.isFinite(numericId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }
  const patch: Partial<typeof worldClocks.$inferInsert> = {};
  if (typeof body.label === "string" && body.label.trim()) {
    patch.label = body.label.trim().slice(0, 60);
  }
  if (typeof body.accent === "string") patch.accent = body.accent.slice(0, 20);
  try {
    const updated = await db
      .update(worldClocks)
      .set(patch)
      .where(eq(worldClocks.id, numericId))
      .returning();
    return NextResponse.json(updated[0] ?? null);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update clock", detail: String(error) },
      { status: 500 },
    );
  }
}
