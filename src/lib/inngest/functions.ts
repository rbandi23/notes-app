import { inngest } from "./client";
import { db } from "@/lib/db";
import { notes, relatedNotes, relatedWebContent } from "@/lib/db/schema";
import { generateEmbedding } from "@/lib/embeddings";
import { searchWeb } from "@/lib/search";

import { extractTags } from "@/lib/tags";
import { classifyNote } from "@/lib/classify";
import { eq, sql } from "drizzle-orm";

function log(step: string, message: string, data?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  const prefix = `[enrich-note][${step}][${timestamp}]`;
  if (data) {
    console.log(prefix, message, JSON.stringify(data, null, 2));
  } else {
    console.log(prefix, message);
  }
}

function logError(step: string, message: string, error: unknown) {
  const timestamp = new Date().toISOString();
  const prefix = `[enrich-note][${step}][${timestamp}]`;
  console.error(prefix, message, {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
}

const SIMILARITY_THRESHOLD = 0.3;
const MAX_RELATED_NOTES = 5;

interface ScoredNote {
  id: string;
  vectorScore: number;
  keywordScore: number;
  combinedScore: number;
}

function rerank(
  vectorResults: Array<{ id: string; similarity: number }>,
  keywordResults: Array<{ id: string; rank: number }>,
  vectorWeight = 0.6,
  keywordWeight = 0.4
): ScoredNote[] {
  const scoreMap = new Map<string, ScoredNote>();

  for (const r of vectorResults) {
    scoreMap.set(r.id, {
      id: r.id,
      vectorScore: r.similarity,
      keywordScore: 0,
      combinedScore: 0,
    });
  }

  for (const r of keywordResults) {
    const existing = scoreMap.get(r.id);
    if (existing) {
      existing.keywordScore = r.rank;
    } else {
      scoreMap.set(r.id, {
        id: r.id,
        vectorScore: 0,
        keywordScore: r.rank,
        combinedScore: 0,
      });
    }
  }

  const scored = Array.from(scoreMap.values());
  for (const s of scored) {
    s.combinedScore =
      s.vectorScore * vectorWeight + s.keywordScore * keywordWeight;
  }

  return scored.sort((a, b) => b.combinedScore - a.combinedScore);
}

export const enrichNote = inngest.createFunction(
  { id: "enrich-note", retries: 2 },
  { event: "notes/enrich" },
  async ({ event, step }) => {
    const { noteId } = event.data;
    log("init", "Starting enrichment", { noteId });

    await step.run("set-processing", async () => {
      log("set-processing", "Setting status to processing", { noteId });
      await db
        .update(notes)
        .set({ enrichmentStatus: "processing" })
        .where(eq(notes.id, noteId));
    });

    const note = await step.run("get-note", async () => {
      log("get-note", "Fetching note", { noteId });
      const [n] = await db
        .select()
        .from(notes)
        .where(eq(notes.id, noteId))
        .limit(1);
      log("get-note", n ? "Note found" : "Note NOT found", { noteId });
      return n;
    });

    if (!note) {
      logError("get-note", "Note not found, aborting", noteId);
      throw new Error(`Note ${noteId} not found`);
    }

    const textContent = [note.title, note.content]
      .filter(Boolean)
      .join(". ");
    log("prepare-text", "Text content prepared", { length: textContent.length });

    // Generate embedding, extract tags, and classify note in parallel
    const [embedding, tags, classification] = await step.run("llm-parallel", async () => {
      log("llm-parallel", "Running embedding, tags, and classification in parallel");
      try {
        const result = await Promise.all([
          generateEmbedding(textContent),
          extractTags(textContent),
          classifyNote(note.title, note.content),
        ]);
        log("llm-parallel", "All LLM steps completed", {
          embeddingDims: result[0].length,
          tags: result[1],
          classification: result[2].classification,
        });
        return result;
      } catch (err) {
        logError("llm-parallel", "Failed parallel LLM step", err);
        throw err;
      }
    });

    // Store embedding and tags
    await step.run("store-embedding", async () => {
      log("store-embedding", "Storing embedding and tags", { tagCount: tags.length });
      await db
        .update(notes)
        .set({ embedding, tags: tags.length > 0 ? tags : note.tags })
        .where(eq(notes.id, noteId));
      log("store-embedding", "Stored successfully");
    });

    // Find related notes: vector similarity + keyword matching + rerank
    await step.run("find-related-notes", async () => {
      log("find-related-notes", "Starting related notes search", { noteId });
      await db
        .delete(relatedNotes)
        .where(eq(relatedNotes.sourceNoteId, noteId));

      const embeddingStr = `[${embedding.join(",")}]`;

      // 1) Vector similarity — broad candidate set
      log("find-related-notes", "Running vector similarity search");
      const vectorCandidates = await db.execute(sql`
        SELECT id, 1 - (embedding <=> ${embeddingStr}::vector) AS similarity
        FROM notes
        WHERE user_id = ${note.userId}
          AND id != ${noteId}
          AND embedding IS NOT NULL
        ORDER BY embedding <=> ${embeddingStr}::vector
        LIMIT 20
      `);

      // 2) Keyword matching via Postgres full-text search
      const searchText = `${note.title} ${note.content.slice(0, 200)}`
        .replace(/[^\w\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2)
        .slice(0, 12)
        .join(" | ");

      log("find-related-notes", "Running keyword search", { searchText });
      let keywordRows: Array<{ id: string; rank: number }> = [];
      if (searchText.trim()) {
        try {
          const keywordCandidates = await db.execute(sql`
            SELECT id,
                   ts_rank_cd(
                     to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, '')),
                     to_tsquery('english', ${searchText})
                   ) AS rank
            FROM notes
            WHERE user_id = ${note.userId}
              AND id != ${noteId}
              AND to_tsvector('english', coalesce(title, '') || ' ' || coalesce(content, ''))
                  @@ to_tsquery('english', ${searchText})
            ORDER BY rank DESC
            LIMIT 20
          `);
          keywordRows = keywordCandidates.rows as Array<{
            id: string;
            rank: number;
          }>;
        } catch (err) {
          logError("find-related-notes", "Keyword search failed (tsquery error)", err);
        }
      }

      const vectorRows = vectorCandidates.rows as Array<{
        id: string;
        similarity: number;
      }>;

      log("find-related-notes", "Search results", {
        vectorCount: vectorRows.length,
        keywordCount: keywordRows.length,
      });

      // 3) Rerank, filter by threshold, then take top N
      const ranked = rerank(vectorRows, keywordRows);
      const qualified = ranked.filter(
        (s) => s.combinedScore >= SIMILARITY_THRESHOLD
      );

      log("find-related-notes", "Reranked results", {
        totalCandidates: ranked.length,
        qualifiedCount: qualified.length,
        topScores: qualified.slice(0, 5).map((s) => ({
          id: s.id,
          score: s.combinedScore.toFixed(3),
        })),
      });

      await Promise.all(qualified.slice(0, MAX_RELATED_NOTES).flatMap((scored) => [
        // Forward: this note → related note
        db.insert(relatedNotes).values({
          sourceNoteId: noteId,
          relatedNoteId: scored.id,
          similarityScore: scored.combinedScore,
        }).onConflictDoUpdate({
          target: [relatedNotes.sourceNoteId, relatedNotes.relatedNoteId],
          set: { similarityScore: scored.combinedScore },
        }),
        // Reverse: related note → this note (bidirectional)
        db.insert(relatedNotes).values({
          sourceNoteId: scored.id,
          relatedNoteId: noteId,
          similarityScore: scored.combinedScore,
        }).onConflictDoUpdate({
          target: [relatedNotes.sourceNoteId, relatedNotes.relatedNoteId],
          set: { similarityScore: scored.combinedScore },
        }),
      ]));
      log("find-related-notes", "Stored related notes", {
        count: Math.min(qualified.length, MAX_RELATED_NOTES),
      });
    });

    // Web search (only for non-personal notes with retrieval enabled)
    await step.run("web-search", async () => {
      await db
        .delete(relatedWebContent)
        .where(eq(relatedWebContent.noteId, noteId));

      if (
        classification.classification === "personal" ||
        !classification.retrieval_enabled ||
        classification.queries.length === 0
      ) {
        log("web-search", "Skipping web search", {
          reason: classification.classification === "personal"
            ? "personal note"
            : !classification.retrieval_enabled
              ? "retrieval disabled"
              : "no queries",
        });
        return;
      }

      // Run all web searches in parallel
      const queries = classification.queries
        .map((q) => ({
          queryStr: typeof q === "string" ? q : q.query,
          keyword: typeof q === "string" ? q : q.keyword || q.query,
          description: typeof q === "string" ? q : q.description || q.query,
        }))
        .filter((q) => q.queryStr);

      const searchResults = await Promise.all(
        queries.map(async (q) => {
          log("web-search", "Searching web", { query: q.queryStr });
          try {
            const results = await searchWeb(q.queryStr);
            return { ...q, results };
          } catch (err) {
            logError("web-search", `Web search failed for query: ${q.queryStr}`, err);
            return { ...q, results: [] };
          }
        })
      );

      // Deduplicate and insert
      const seenUrls = new Set<string>();
      const inserts = [];
      for (const { keyword, description, results } of searchResults) {
        const firstNew = results.find((r) => !seenUrls.has(r.url));
        if (firstNew) {
          seenUrls.add(firstNew.url);
          inserts.push(
            db.insert(relatedWebContent).values({
              noteId,
              url: firstNew.url,
              title: firstNew.title,
              description: firstNew.description,
              thumbnailUrl: firstNew.thumbnailUrl,
              contentType: firstNew.contentType,
              relevanceReason: JSON.stringify({ keyword, description }),
            })
          );
        }
      }
      await Promise.all(inserts);
      log("web-search", "Web search complete", { totalUrls: seenUrls.size });
    });

    // Mark complete
    await step.run("set-completed", async () => {
      log("set-completed", "Marking enrichment as completed", { noteId });
      await db
        .update(notes)
        .set({ enrichmentStatus: "completed" })
        .where(eq(notes.id, noteId));
    });

    log("done", "Enrichment finished successfully", { noteId });
    return { success: true, noteId };
  }
);
