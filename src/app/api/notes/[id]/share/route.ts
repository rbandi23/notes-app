import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { notes } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [note] = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, session.user.id)))
    .limit(1);

  if (!note) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  const shareToken = note.shareToken || uuidv4();

  const [updated] = await db
    .update(notes)
    .set({ isPublic: true, shareToken })
    .where(eq(notes.id, id))
    .returning();

  return NextResponse.json({ shareToken: updated.shareToken });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [note] = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, session.user.id)))
    .limit(1);

  if (!note) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  await db
    .update(notes)
    .set({ isPublic: false })
    .where(eq(notes.id, id));

  return NextResponse.json({ success: true });
}
