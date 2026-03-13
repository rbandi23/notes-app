import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { notes, noteImages } from "@/lib/db/schema";
import { eq, inArray, sql } from "drizzle-orm";
import { generateEmbedding } from "@/lib/embeddings";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const query = searchParams.get("q");
  const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") || "20")));
  const searchImages = searchParams.get("images") === "true";

  if (!query?.trim()) {
    return NextResponse.json({ error: "Query required" }, { status: 400 });
  }

  const userId = session.user.id;

  // Image search mode: search against noteImages embeddings, return parent notes
  if (searchImages) {
    return handleImageSearch(query, userId, page, limit);
  }

  // 1) Full-text search + embedding generation in parallel
  const searchTerms = query
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .join(" | ");

  const VECTOR_SIMILARITY_THRESHOLD = 0.3;

  const [textResults, embedding] = await Promise.all([
    // Full-text search
    (async (): Promise<Array<{ id: string; rank: number }>> => {
      if (!searchTerms.trim()) return [];
      try {
        const textRows = await db.execute(sql`
          SELECT id, ts_rank_cd(
            to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, '')),
            to_tsquery('english', ${searchTerms})
          ) AS rank
          FROM notes
          WHERE user_id = ${userId}
            AND to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''))
                @@ to_tsquery('english', ${searchTerms})
          ORDER BY rank DESC
          LIMIT 50
        `);
        return textRows.rows as Array<{ id: string; rank: number }>;
      } catch (err) {
        console.error("[search] Full-text search failed:", err);
        return [];
      }
    })(),
    // Embedding generation
    generateEmbedding(query).catch((err) => {
      console.error("[search] Embedding generation failed:", err);
      return null;
    }),
  ]);

  // 2) Semantic search using the pre-generated embedding
  let vectorResults: Array<{ id: string; similarity: number }> = [];
  if (embedding) {
    try {
      const embeddingStr = `[${embedding.join(",")}]`;
      const vectorRows = await db.execute(sql`
        SELECT id, 1 - (embedding <=> ${embeddingStr}::vector) AS similarity
        FROM notes
        WHERE user_id = ${userId}
          AND embedding IS NOT NULL
          AND 1 - (embedding <=> ${embeddingStr}::vector) > ${VECTOR_SIMILARITY_THRESHOLD}
        ORDER BY embedding <=> ${embeddingStr}::vector
        LIMIT 50
      `);
      vectorResults = vectorRows.rows as Array<{ id: string; similarity: number }>;
    } catch (err) {
      console.error("[search] Vector search failed:", err);
    }
  }

  // 2.5) Fallback: basic ILIKE search if both advanced methods returned nothing
  if (textResults.length === 0 && vectorResults.length === 0) {
    console.log("[search] Full-text and vector search both empty, falling back to ILIKE");
    const likePattern = `%${query.trim()}%`;
    const fallbackRows = await db
      .select()
      .from(notes)
      .where(
        sql`${notes.userId} = ${userId} AND (
          ${notes.title} ILIKE ${likePattern} OR ${notes.content} ILIKE ${likePattern}
        )`
      )
      .limit(limit);

    const total = fallbackRows.length;
    return NextResponse.json({
      notes: fallbackRows,
      pagination: { page: 1, limit, total, totalPages: Math.ceil(total / limit) },
    });
  }

  // 3) Combine and rerank
  const scoreMap = new Map<string, number>();
  const vectorWeight = 0.6;
  const textWeight = 0.4;

  const maxRank = Math.max(...textResults.map((r) => r.rank), 0.001);
  for (const r of textResults) {
    scoreMap.set(r.id, (r.rank / maxRank) * textWeight);
  }
  for (const r of vectorResults) {
    const existing = scoreMap.get(r.id) || 0;
    scoreMap.set(r.id, existing + r.similarity * vectorWeight);
  }

  const MIN_COMBINED_SCORE = 0.15;
  const rankedIds = Array.from(scoreMap.entries())
    .filter(([, score]) => score >= MIN_COMBINED_SCORE)
    .sort((a, b) => b[1] - a[1]);

  const total = rankedIds.length;
  const offset = (page - 1) * limit;
  const pageIds = rankedIds.slice(offset, offset + limit);

  if (pageIds.length === 0) {
    return NextResponse.json({
      notes: [],
      pagination: { page, limit, total: 0, totalPages: 0 },
    });
  }

  // Fetch full note data for page
  const idList = pageIds.map(([id]) => id);
  const noteRows = await db
    .select()
    .from(notes)
    .where(inArray(notes.id, idList));

  // Sort by score
  const noteMap = new Map(noteRows.map((n) => [n.id, n]));
  const sortedNotes = pageIds
    .map(([id]) => noteMap.get(id))
    .filter(Boolean);

  return NextResponse.json({
    notes: sortedNotes,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

async function handleImageSearch(
  query: string,
  userId: string,
  page: number,
  limit: number
) {
  const SIMILARITY_THRESHOLD = 0.3;

  let embedding: number[];
  try {
    embedding = await generateEmbedding(query);
  } catch (err) {
    console.error("[search] Failed to generate query embedding:", err);
    return NextResponse.json({
      notes: [],
      pagination: { page, limit, total: 0, totalPages: 0 },
    });
  }

  const embeddingStr = `[${embedding.join(",")}]`;

  // Search noteImages by embedding similarity, join to notes for user ownership
  const imageRows = await db.execute(sql`
    SELECT DISTINCT ON (n.id)
      n.id AS note_id,
      1 - (ni.embedding <=> ${embeddingStr}::vector) AS similarity
    FROM note_images ni
    INNER JOIN notes n ON n.id = ni.note_id
    WHERE n.user_id = ${userId}
      AND ni.embedding IS NOT NULL
      AND 1 - (ni.embedding <=> ${embeddingStr}::vector) > ${SIMILARITY_THRESHOLD}
    ORDER BY n.id, similarity DESC
  `);

  const scored = (imageRows.rows as Array<{ note_id: string; similarity: number }>)
    .sort((a, b) => b.similarity - a.similarity);

  const total = scored.length;
  const offset = (page - 1) * limit;
  const pageItems = scored.slice(offset, offset + limit);

  if (pageItems.length === 0) {
    return NextResponse.json({
      notes: [],
      pagination: { page, limit, total: 0, totalPages: 0 },
    });
  }

  const noteIds = pageItems.map((r) => r.note_id);
  const noteRows = await db
    .select()
    .from(notes)
    .where(inArray(notes.id, noteIds));

  const noteMap = new Map(noteRows.map((n) => [n.id, n]));
  const sortedNotes = pageItems
    .map((r) => noteMap.get(r.note_id))
    .filter(Boolean);

  return NextResponse.json({
    notes: sortedNotes,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}
