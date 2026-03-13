import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { notes } from "@/lib/db/schema";
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

  if (!query?.trim()) {
    return NextResponse.json({ error: "Query required" }, { status: 400 });
  }

  const userId = session.user.id;

  // 1) Full-text search
  const searchTerms = query
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .join(" | ");

  let textResults: Array<{ id: string; rank: number }> = [];
  if (searchTerms.trim()) {
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
      textResults = textRows.rows as Array<{ id: string; rank: number }>;
    } catch (err) {
      console.error("[search] Full-text search failed:", err);
    }
  }

  // 2) Semantic search
  let vectorResults: Array<{ id: string; similarity: number }> = [];
  try {
    const embedding = await generateEmbedding(query);
    const embeddingStr = `[${embedding.join(",")}]`;
    const vectorRows = await db.execute(sql`
      SELECT id, 1 - (embedding <=> ${embeddingStr}::vector) AS similarity
      FROM notes
      WHERE user_id = ${userId}
        AND embedding IS NOT NULL
      ORDER BY embedding <=> ${embeddingStr}::vector
      LIMIT 50
    `);
    vectorResults = vectorRows.rows as Array<{ id: string; similarity: number }>;
  } catch (err) {
    console.error("[search] Vector search failed:", err);
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

  const rankedIds = Array.from(scoreMap.entries()).sort((a, b) => b[1] - a[1]);

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
