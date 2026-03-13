import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { put } from "@vercel/blob";
import { db } from "@/lib/db";
import { noteImages, notes } from "@/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { describeImage } from "@/lib/images";
import { IMAGE_MAX_SIZE_BYTES } from "@/lib/constants";
import { generateEmbedding } from "@/lib/embeddings";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const noteId = formData.get("noteId") as string | null;

  if (!file) {
    return NextResponse.json({ error: "File is required" }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Only PNG, JPEG, GIF, and WebP images are allowed" },
      { status: 400 }
    );
  }

  if (file.size > IMAGE_MAX_SIZE_BYTES) {
    return NextResponse.json(
      { error: "Image must be under 5MB" },
      { status: 400 }
    );
  }

  // Verify note belongs to user if noteId provided
  if (noteId) {
    const [note] = await db
      .select({ id: notes.id })
      .from(notes)
      .where(and(eq(notes.id, noteId), eq(notes.userId, session.user.id)))
      .limit(1);

    if (!note) {
      return NextResponse.json({ error: "Note not found" }, { status: 404 });
    }
  }

  // Upload to Vercel Blob (private — requires token to read)
  const blob = await put(`notes/${session.user.id}/${Date.now()}-${file.name}`, file, {
    access: "public",
  });

  // Get AI description for semantic search
  const description = await describeImage(blob.url);

  // Generate embedding for the image description
  let embedding: number[] | null = null;
  if (description && description !== "[uploaded image]") {
    try {
      embedding = await generateEmbedding(description);
    } catch (err) {
      console.error("Failed to generate image embedding:", err);
    }
  }

  // Store in DB if noteId provided
  if (noteId) {
    await db.insert(noteImages).values({
      noteId,
      blobUrl: blob.url,
      description,
      embedding,
    });
  }

  return NextResponse.json({
    url: blob.url,
    description,
  });
}
