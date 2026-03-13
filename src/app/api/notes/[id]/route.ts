import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { notes, relatedNotes, relatedWebContent } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { generateEmbedding } from "@/lib/embeddings";
import { generateTitle } from "@/lib/title";
import { NOTE_CHAR_LIMIT } from "@/lib/constants";

function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

const RE_ENRICH_THRESHOLD = 0.85; // re-enrich if cosine similarity drops below this

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
    .select()
    .from(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, session.user.id)))
    .limit(1);

  if (!note) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  const [forwardRelated, reverseRelated, webContent] = await Promise.all([
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

  const seenIds = new Set<string>();
  const related = [...forwardRelated, ...reverseRelated]
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .filter((r) => {
      if (seenIds.has(r.relatedNoteId)) return false;
      seenIds.add(r.relatedNoteId);
      return true;
    });

  return NextResponse.json({ note, relatedNotes: related, webContent });
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { title, content, contentJson } = await req.json();

  const [existing] = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, session.user.id)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  const newContent = content ?? existing.content;

  if (newContent && newContent.length > NOTE_CHAR_LIMIT) {
    return NextResponse.json(
      { error: `Content exceeds ${NOTE_CHAR_LIMIT} character limit` },
      { status: 400 }
    );
  }

  let newTitle = title ?? existing.title;
  if (!newTitle?.trim() && newContent?.trim()) {
    newTitle = await generateTitle(newContent);
  }

  // Check semantic drift: embed new content and compare against stored embedding
  let shouldReEnrich = !existing.embedding; // always enrich if never enriched
  if (existing.embedding && (title !== undefined || content !== undefined)) {
    const newEmbedding = await generateEmbedding(`${newTitle}. ${newContent}`);
    const similarity = cosineSimilarity(existing.embedding, newEmbedding);
    shouldReEnrich = similarity < RE_ENRICH_THRESHOLD;
  }

  const [updated] = await db
    .update(notes)
    .set({
      title: newTitle,
      content: newContent,
      contentJson: contentJson ?? existing.contentJson,
      ...(shouldReEnrich ? { enrichmentStatus: "pending" as const, tags: null } : {}),
      updatedAt: new Date(),
    })
    .where(eq(notes.id, id))
    .returning();

  if (shouldReEnrich) {
    await inngest.send({
      name: "notes/enrich",
      data: { noteId: id },
    });
  }

  return NextResponse.json(updated);
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

  const [existing] = await db
    .select()
    .from(notes)
    .where(and(eq(notes.id, id), eq(notes.userId, session.user.id)))
    .limit(1);

  if (!existing) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  await db.delete(notes).where(eq(notes.id, id));

  return NextResponse.json({ success: true });
}
