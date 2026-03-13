import { inngest } from "./client";
import { db } from "@/lib/db";
import { notes, relatedNotes, relatedWebContent, noteImages } from "@/lib/db/schema";
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

    // Gather image descriptions for this note
    const imageDescriptions = await step.run("gather-image-descriptions", async () => {
      log("gather-image-descriptions", "Fetching image descriptions", { noteId });
      const images = await db
        .select({ description: noteImages.description })
        .from(noteImages)
        .where(eq(noteImages.noteId, noteId));
      log("gather-image-descriptions", "Found images", { count: images.length });
      return images
        .map((img) => img.description)
        .filter((d) => d && d !== "[uploaded image]")
        .join(". ");
    });

    const textContent = [note.title, note.content, imageDescriptions]
      .filter(Boolean)
      .join(". ");
    log("prepare-text", "Text content prepared", { length: textContent.length });

    // Generate embedding
    const embedding = await step.run("generate-embedding", async () => {
      log("generate-embedding", "Generating embedding", { textLength: textContent.length });
      try {
        const result = await generateEmbedding(textContent);
        log("generate-embedding", "Embedding generated", { dimensions: result.length });
        return result;
      } catch (err) {
        logError("generate-embedding", "Failed to generate embedding", err);
        throw err;
      }
    });

    // Extract tags (only with OpenAI key)
    const tags = await step.run("extract-tags", async () => {
      log("extract-tags", "Extracting tags");
      try {
        const result = await extractTags(textContent);
        log("extract-tags", "Tags extracted", { tags: result });
        return result;
      } catch (err) {
        logError("extract-tags", "Failed to extract tags", err);
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

    // Classify note as personal or non-personal
    const classification = await step.run("classify-note", async () => {
      log("classify-note", "Classifying note");
      try {
        const result = await classifyNote(note.title, note.content);
        log("classify-note", "Classification result", {
          classification: result.classification,
          retrieval_enabled: result.retrieval_enabled,
          queryCount: result.queries.length,
        });
        return result;
      } catch (err) {
        logError("classify-note", "Failed to classify note", err);
        throw err;
      }
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

      for (const scored of qualified.slice(0, MAX_RELATED_NOTES)) {
        // Forward: this note → related note
        await db.insert(relatedNotes).values({
          sourceNoteId: noteId,
          relatedNoteId: scored.id,
          similarityScore: scored.combinedScore,
        }).onConflictDoUpdate({
          target: [relatedNotes.sourceNoteId, relatedNotes.relatedNoteId],
          set: { similarityScore: scored.combinedScore },
        });

        // Reverse: related note → this note (bidirectional)
        await db.insert(relatedNotes).values({
          sourceNoteId: scored.id,
          relatedNoteId: noteId,
          similarityScore: scored.combinedScore,
        }).onConflictDoUpdate({
          target: [relatedNotes.sourceNoteId, relatedNotes.relatedNoteId],
          set: { similarityScore: scored.combinedScore },
        });
      }
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

      const seenUrls = new Set<string>();

      for (const q of classification.queries) {
        const queryStr = typeof q === "string" ? q : q.query;
        const keyword = typeof q === "string" ? q : q.keyword || q.query;
        const description = typeof q === "string" ? q : q.description || q.query;
        if (!queryStr) continue;

        log("web-search", "Searching web", { query: queryStr });
        try {
          const results = await searchWeb(queryStr);
          log("web-search", "Web search results", {
            query: queryStr,
            resultCount: results.length,
          });

          // Only keep the first result per query
          const firstNew = results.find((r) => !seenUrls.has(r.url));
          if (firstNew) {
            seenUrls.add(firstNew.url);
            await db.insert(relatedWebContent).values({
              noteId,
              url: firstNew.url,
              title: firstNew.title,
              description: firstNew.description,
              thumbnailUrl: firstNew.thumbnailUrl,
              contentType: firstNew.contentType,
              relevanceReason: JSON.stringify({ keyword, description }),
            });
          }
        } catch (err) {
          logError("web-search", `Web search failed for query: ${queryStr}`, err);
        }
      }
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
