import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { del } from "@vercel/blob";
import { db } from "@/lib/db";
import { noteImages, notes } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // Find the image and verify ownership through the note
  const [image] = await db
    .select({
      id: noteImages.id,
      blobUrl: noteImages.blobUrl,
      noteId: noteImages.noteId,
    })
    .from(noteImages)
    .innerJoin(notes, eq(notes.id, noteImages.noteId))
    .where(and(eq(noteImages.id, id), eq(notes.userId, session.user.id)))
    .limit(1);

  if (!image) {
    return NextResponse.json({ error: "Image not found" }, { status: 404 });
  }

  // Delete from Vercel Blob
  try {
    await del(image.blobUrl);
  } catch (err) {
    console.error("Failed to delete blob:", err);
  }

  // Delete from DB
  await db.delete(noteImages).where(eq(noteImages.id, id));

  return NextResponse.json({ success: true });
}
