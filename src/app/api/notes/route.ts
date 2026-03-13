import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { notes } from "@/lib/db/schema";
import { eq, desc, sql } from "drizzle-orm";
import { inngest } from "@/lib/inngest/client";
import { generateTitle } from "@/lib/title";
import { NOTE_CHAR_LIMIT } from "@/lib/constants";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20")));
  const offset = (page - 1) * limit;

  const [userNotes, countResult] = await Promise.all([
    db
      .select()
      .from(notes)
      .where(eq(notes.userId, session.user.id))
      .orderBy(desc(notes.updatedAt))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)` })
      .from(notes)
      .where(eq(notes.userId, session.user.id)),
  ]);

  const total = Number(countResult[0].count);
  return NextResponse.json({
    notes: userNotes,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { title, content, contentJson } = await req.json();

  const noteContent = content || "";
  if (noteContent.length > NOTE_CHAR_LIMIT) {
    return NextResponse.json(
      { error: `Content exceeds ${NOTE_CHAR_LIMIT} character limit` },
      { status: 400 }
    );
  }

  let noteTitle = title;
  if (!noteTitle?.trim()) {
    if (!noteContent.trim()) {
      return NextResponse.json(
        { error: "Title or content is required" },
        { status: 400 }
      );
    }
    noteTitle = await generateTitle(noteContent);
  }

  const [note] = await db
    .insert(notes)
    .values({
      userId: session.user.id,
      title: noteTitle,
      content: noteContent,
      contentJson: contentJson || null,
      enrichmentStatus: "pending",
    })
    .returning();

  // Fire enrichment event
  await inngest.send({
    name: "notes/enrich",
    data: { noteId: note.id },
  });

  return NextResponse.json(note, { status: 201 });
}
