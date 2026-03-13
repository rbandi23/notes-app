import { getOpenAI } from "./openai";
import { LLM_MODEL } from "./constants";

export interface ClassificationQuery {
  query: string;
  intent: string;
  keyword: string;
  description: string;
}

export interface ClassificationResult {
  classification: "personal" | "non_personal";
  retrieval_enabled: boolean;
  queries: ClassificationQuery[];
  tags: string[];
  related_ranking: string[];
}

function buildSystemPrompt(candidateTitles: { id: string; title: string }[]): string {
  const candidateSection = candidateTitles.length > 0
    ? `
## Related notes reranking

You are also given a list of candidate notes (id + title) that might be related to the user's note.
Rank them by how conceptually related they are to the user's note.
Return the ids of the top related notes (most related first) in "related_ranking".
Only include notes that are genuinely related — omit unrelated ones.

Candidates:
${candidateTitles.map((c) => `- id: "${c.id}" title: "${c.title}"`).join("\n")}
`
    : "";

  return `You are a note analysis assistant for an AI notes app.

Your job is to examine a user note and perform three tasks in a single response:
1. Classify the note and decide on web retrieval
2. Extract topic tags
3. ${candidateTitles.length > 0 ? "Rank related note candidates" : "Skip related ranking (no candidates provided)"}

## Task 1: Classification

Classify the note to decide if web retrieval would be useful.

- "personal" → purely private, no web results needed
- "non_personal" → contains topics that could benefit from web context

Only classify as "personal" if the note is PURELY about:
- grocery/shopping lists with no product research
- scheduling times/dates with no topic context
- private diary entries about emotions/feelings
- simple reminders like "call mom" or "pay rent"

Default to "non_personal" for everything else. Most notes benefit from web context. Notes about work, projects, technical topics, learning, meetings with technical discussion, comparisons, planning that involves products/services — these are all "non_personal".

When in doubt, classify as "non_personal" with retrieval_enabled = true.

### Retrieval rules

Generate web queries when classification = "non_personal" and the note has enough substance to form useful queries. Be generous — if there's any topic worth looking up, enable retrieval.

If retrieval is enabled, generate 1 to 3 search queries with:
- "query": the search string
- "intent": "explain" | "compare" | "research" | "news" | "entity"
- "keyword": main topic (1-3 words), displayed as a title
- "description": human-readable sentence about what the reader will learn

## Task 2: Tag extraction

Extract 2-4 key topic tags from the note. Tags should be:
- lowercase
- short (1-3 words each)
- representative of the main subjects
${candidateSection}
## Output format

Return ONLY valid JSON. No markdown. No explanation.

{
  "classification": "personal" | "non_personal",
  "retrieval_enabled": true | false,
  "reason": "short reason",
  "confidence": 0.0,
  "queries": [],
  "tags": ["tag1", "tag2"],
  "related_ranking": ["id1", "id2"]
}

## Constraints

- If classification = "personal", retrieval_enabled must be false and queries must be []
- If retrieval_enabled = false, queries must be []
- confidence must be a number between 0 and 1
- Keep reason under 20 words
- tags must be an array of 2-4 lowercase strings
- related_ranking must be an array of candidate ids (most related first), or [] if no candidates
- Never output anything except the JSON object`;
}

export async function classifyNote(
  title: string,
  content: string,
  candidates?: { id: string; title: string }[]
): Promise<ClassificationResult> {
  const defaultResult: ClassificationResult = {
    classification: "non_personal",
    retrieval_enabled: true,
    queries: [{ query: title, intent: "research", keyword: title, description: title }],
    tags: [],
    related_ranking: [],
  };

  if (!process.env.OPENAI_API_KEY) {
    return defaultResult;
  }

  try {
    const client = getOpenAI();
    const noteText = `Title: ${title}\n\nContent: ${content.slice(0, 8000)}`;

    const response = await client.chat.completions.create({
      model: LLM_MODEL,
      messages: [
        { role: "system", content: buildSystemPrompt(candidates || []) },
        { role: "user", content: noteText },
      ],
    });

    const text = response.choices[0]?.message?.content || "";
    const parsed = JSON.parse(text);

    return {
      classification: parsed.classification === "personal" ? "personal" : "non_personal",
      retrieval_enabled: !!parsed.retrieval_enabled,
      queries: Array.isArray(parsed.queries) ? parsed.queries : [],
      tags: Array.isArray(parsed.tags)
        ? parsed.tags.filter((t: unknown): t is string => typeof t === "string").slice(0, 5)
        : [],
      related_ranking: Array.isArray(parsed.related_ranking) ? parsed.related_ranking : [],
    };
  } catch (error) {
    console.error("Failed to classify note:", error);
    return defaultResult;
  }
}
