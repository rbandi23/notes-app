import { inngest } from "./client";
import { db } from "@/lib/db";
import { notes, relatedNotes, relatedWebContent } from "@/lib/db/schema";
import { generateEmbedding } from "@/lib/embeddings";
import { searchWeb } from "@/lib/search";
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
const LLM_RANK_BOOST = 0.15;

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

    // Step 1: Generate embedding
    const embedding = await step.run("generate-embedding", async () => {
      log("generate-embedding", "Generating embedding");
      try {
        const emb = await generateEmbedding(textContent);
        log("generate-embedding", "Embedding generated", { dims: emb.length });
        return emb;
      } catch (err) {
        logError("generate-embedding", "Failed to generate embedding", err);
        throw err;
      }
    });

    // Step 2: Find vector candidates + keyword candidates
    const candidates = await step.run("find-candidates", async () => {
      log("find-candidates", "Finding candidate notes");
      const embeddingStr = `[${embedding.join(",")}]`;

      // Vector similarity candidates
      const vectorCandidates = await db.execute(sql`
        SELECT id, title, 1 - (embedding <=> ${embeddingStr}::vector) AS similarity
        FROM notes
        WHERE user_id = ${note.userId}
          AND id != ${noteId}
          AND embedding IS NOT NULL
        ORDER BY embedding <=> ${embeddingStr}::vector
        LIMIT 20
      `);

      // Keyword candidates
      const searchText = `${note.title} ${note.content.slice(0, 200)}`
        .replace(/[^\w\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 2)
        .slice(0, 12)
        .join(" | ");

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
          keywordRows = keywordCandidates.rows as Array<{ id: string; rank: number }>;
        } catch (err) {
          logError("find-candidates", "Keyword search failed", err);
        }
      }

      const vectorRows = vectorCandidates.rows as Array<{
        id: string;
        title: string;
        similarity: number;
      }>;

      log("find-candidates", "Candidates found", {
        vectorCount: vectorRows.length,
        keywordCount: keywordRows.length,
      });

      return { vectorRows, keywordRows };
    });

    // Step 3: Single LLM call — classify + tags + rerank candidates
    const classification = await step.run("analyze-note", async () => {
      // Build candidate list with titles for LLM reranking
      const candidateTitles = candidates.vectorRows
        .filter((r) => r.similarity >= SIMILARITY_THRESHOLD)
        .slice(0, 10)
        .map((r) => ({ id: r.id, title: r.title }));

      log("analyze-note", "Running combined LLM analysis", {
        candidateCount: candidateTitles.length,
      });

      try {
        const result = await classifyNote(note.title, note.content, candidateTitles);
        log("analyze-note", "LLM analysis complete", {
          classification: result.classification,
          tags: result.tags,
          relatedRanking: result.related_ranking,
          queryCount: result.queries.length,
        });
        return result;
      } catch (err) {
        logError("analyze-note", "LLM analysis failed", err);
        throw err;
      }
    });

    // Step 4: Store embedding and tags
    await step.run("store-embedding", async () => {
      const tags = classification.tags;
      log("store-embedding", "Storing embedding and tags", { tagCount: tags.length });
      await db
        .update(notes)
        .set({ embedding, tags: tags.length > 0 ? tags : note.tags })
        .where(eq(notes.id, noteId));
      log("store-embedding", "Stored successfully");
    });

    // Step 5: Store related notes with LLM-boosted ranking
    await step.run("store-related-notes", async () => {
      log("store-related-notes", "Computing final rankings");
      await db
        .delete(relatedNotes)
        .where(eq(relatedNotes.sourceNoteId, noteId));

      // Build score map from vector + keyword results
      const scoreMap = new Map<string, number>();

      const vectorWeight = 0.6;
      const keywordWeight = 0.4;

      for (const r of candidates.vectorRows) {
        scoreMap.set(r.id, r.similarity * vectorWeight);
      }

      const maxRank = Math.max(...candidates.keywordRows.map((r) => r.rank), 0.001);
      for (const r of candidates.keywordRows) {
        const existing = scoreMap.get(r.id) || 0;
        scoreMap.set(r.id, existing + (r.rank / maxRank) * keywordWeight);
      }

      // Apply LLM ranking boost — notes the LLM ranked get a position-based boost
      const llmRanking = classification.related_ranking || [];
      for (let i = 0; i < llmRanking.length; i++) {
        const id = llmRanking[i];
        const existing = scoreMap.get(id) || 0;
        // Higher boost for higher-ranked items (first = full boost, last = partial)
        const positionBoost = LLM_RANK_BOOST * (1 - i / Math.max(llmRanking.length, 1));
        scoreMap.set(id, existing + positionBoost);
      }

      // Filter and sort
      const ranked = Array.from(scoreMap.entries())
        .filter(([, score]) => score >= SIMILARITY_THRESHOLD)
        .sort((a, b) => b[1] - a[1])
        .slice(0, MAX_RELATED_NOTES);

      log("store-related-notes", "Final rankings", {
        count: ranked.length,
        topScores: ranked.map(([id, score]) => ({ id, score: score.toFixed(3) })),
      });

      if (ranked.length > 0) {
        await Promise.all(ranked.flatMap(([relatedId, score]) => [
          // Forward: this note → related note
          db.insert(relatedNotes).values({
            sourceNoteId: noteId,
            relatedNoteId: relatedId,
            similarityScore: score,
          }).onConflictDoUpdate({
            target: [relatedNotes.sourceNoteId, relatedNotes.relatedNoteId],
            set: { similarityScore: score },
          }),
          // Reverse: related note → this note (bidirectional)
          db.insert(relatedNotes).values({
            sourceNoteId: relatedId,
            relatedNoteId: noteId,
            similarityScore: score,
          }).onConflictDoUpdate({
            target: [relatedNotes.sourceNoteId, relatedNotes.relatedNoteId],
            set: { similarityScore: score },
          }),
        ]));
      }
      log("store-related-notes", "Stored related notes", { count: ranked.length });
    });

    // Step 6: Web search (only for non-personal notes with retrieval enabled)
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
