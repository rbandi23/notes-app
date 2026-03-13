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

  const [forwardRelated, reverseRelated, webContent] = await Promise.all([
    // Notes where this note is the source
    db
      .select({
        id: relatedNotes.id,
        relatedNoteId: relatedNotes.relatedNoteId,
        similarityScore: relatedNotes.similarityScore,
        title: notes.title,
        content: notes.content,
      })
      .from(relatedNotes)
      .innerJoin(notes, eq(relatedNotes.relatedNoteId, notes.id))
      .where(eq(relatedNotes.sourceNoteId, id)),
    // Notes where this note is the target
    db
      .select({
        id: relatedNotes.id,
        relatedNoteId: relatedNotes.sourceNoteId,
        similarityScore: relatedNotes.similarityScore,
        title: notes.title,
        content: notes.content,
      })
      .from(relatedNotes)
      .innerJoin(notes, eq(relatedNotes.sourceNoteId, notes.id))
      .where(eq(relatedNotes.relatedNoteId, id)),
    db
      .select()
      .from(relatedWebContent)
      .where(eq(relatedWebContent.noteId, id)),
  ]);

  // Deduplicate by relatedNoteId, keep highest score
  const seenIds = new Set<string>();
  const related = [...forwardRelated, ...reverseRelated]
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .filter((r) => {
      if (seenIds.has(r.relatedNoteId)) return false;
      seenIds.add(r.relatedNoteId);
      return true;
    });

  return NextResponse.json({
    enrichmentStatus: note.enrichmentStatus,
    relatedNotes: related,
    webContent,
  });
}
