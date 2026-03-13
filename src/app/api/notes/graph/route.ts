import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { notes, relatedNotes } from "@/lib/db/schema";
import { eq, inArray, sql } from "drizzle-orm";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userNotes = await db
    .select({
      id: notes.id,
      title: notes.title,
      contentLength: sql<number>`length(content)`,
      tags: notes.tags,
    })
    .from(notes)
    .where(eq(notes.userId, session.user.id));

  const noteIds = userNotes.map((n) => n.id);

  if (noteIds.length === 0) {
    return NextResponse.json({ nodes: [], edges: [] });
  }

  const edges = await db
    .select()
    .from(relatedNotes)
    .where(inArray(relatedNotes.sourceNoteId, noteIds));

  const noteIdSet = new Set(noteIds);
  const filteredEdges = edges.filter(
    (e) => noteIdSet.has(e.relatedNoteId)
  );

  const graphNodes = userNotes.map((n) => ({
    id: n.id,
    title: n.title,
    size: Math.min(Math.max(n.contentLength / 100, 3), 15),
    tags: n.tags || [],
  }));

  const graphEdges = filteredEdges.map((e) => ({
    source: e.sourceNoteId,
    target: e.relatedNoteId,
    similarity: e.similarityScore,
  }));

  return NextResponse.json({ nodes: graphNodes, edges: graphEdges });
}
