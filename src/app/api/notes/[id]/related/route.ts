import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { notes, relatedNotes, relatedWebContent } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const [note] = await db
    .select({ id: notes.id, enrichmentStatus: notes.enrichmentStatus })
    .from(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, session.user.id)))
    .limit(1);

  if (!note) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  const related = await db
    .select({
      id: relatedNotes.id,
      relatedNoteId: relatedNotes.relatedNoteId,
      similarityScore: relatedNotes.similarityScore,
      title: notes.title,
      content: notes.content,
    })
    .from(relatedNotes)
    .innerJoin(notes, eq(relatedNotes.relatedNoteId, notes.id))
    .where(eq(relatedNotes.sourceNoteId, id));

  const webContent = await db
    .select()
    .from(relatedWebContent)
    .where(eq(relatedWebContent.noteId, id));

  return NextResponse.json({
    enrichmentStatus: note.enrichmentStatus,
    relatedNotes: related,
    webContent,
  });
}
