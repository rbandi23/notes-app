import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { notes, relatedWebContent, users } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const [note] = await db
    .select()
    .from(notes)
    .where(and(eq(notes.shareToken, token), eq(notes.isPublic, true)))
    .limit(1);

  if (!note) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }

  const [author] = await db
    .select({ name: users.name, image: users.image })
    .from(users)
    .where(eq(users.id, note.userId))
    .limit(1);

  const webContent = await db
    .select()
    .from(relatedWebContent)
    .where(eq(relatedWebContent.noteId, note.id));

  return NextResponse.json({
    note: {
      id: note.id,
      title: note.title,
      content: note.content,
      contentJson: note.contentJson,
      tags: note.tags,
      createdAt: note.createdAt,
    },
    author,
    webContent,
  });
}
