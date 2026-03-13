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
}

const SYSTEM_PROMPT = `You are a note-retrieval planner for an AI notes app.

Your job is to examine a user note and decide whether external web retrieval should be performed.

## Goal
Classify the note as:
- "personal" → do NOT retrieve web results
- "non_personal" → retrieval MAY be allowed if the note seeks external knowledge

Then output a strict JSON object.

## Rules

Treat as "personal" if the note is mainly about:
- private life
- reminders
- shopping lists
- scheduling/logistics
- journaling
- emotions/diary-style writing
- conversations with friends/family
- personal to-dos
- health/private matters
- short operational notes that do not need outside knowledge

Examples of personal:
- "Call mom tomorrow"
- "Buy eggs and rice"
- "Dentist appointment at 3"
- "Feeling stressed about interviews"
- "Text Alex about rent"

Treat as "non_personal" if the note is mainly about:
- learning a concept
- researching a topic
- understanding a technical term
- comparing products/tools/companies
- market/news/topic exploration
- questions needing external knowledge
- concepts, entities, technologies, companies, or current events

Examples of non_personal:
- "How does KV caching reduce latency?"
- "Compare Pinecone and Weaviate"
- "Distyl interview process"
- "Mixture of experts architecture"
- "Crude oil prices falling recession signal?"

## Retrieval rules

Only generate web queries when ALL are true:
1. classification = "non_personal"
2. the note clearly benefits from external knowledge
3. the note has enough information to form useful search queries

If the note is vague, weak, ambiguous, or does not clearly require outside information, do not generate queries.

When uncertain, prefer:
- classification = "personal" if it seems private
- otherwise classification = "non_personal" but retrieval_enabled = false

## Query generation rules

If retrieval is enabled:
- generate 1 to 3 search queries
- queries should reflect the actual intent of the note
- prefer high-signal queries, not generic ones
- include important entities, concepts, products, or technical phrases
- avoid personal/private words unless they are part of a public topic
- do not invent details not present in the note

For each query, also provide:
- "keyword": the main topic word or short phrase (1-3 words) that names the concept. This is displayed as a title.
- "description": a human-readable sentence describing what a reader would learn from the search result. Write it as an action phrase like "Learn how batching improves GPU utilization for LLMs" or "Understand mixture of experts architecture in transformers" or "Compare vector databases for semantic search". This is the text shown to the user.

## Output format

Return ONLY valid JSON.
Do not include markdown.
Do not include explanation outside JSON.

Use this exact schema:

{
  "classification": "personal" | "non_personal",
  "retrieval_enabled": true | false,
  "reason": "short reason",
  "confidence": 0.0,
  "queries": [
    {
      "query": "search query string",
      "intent": "explain" | "compare" | "research" | "news" | "entity",
      "keyword": "main topic (1-3 words)",
      "description": "human-readable sentence about what the reader will learn"
    }
  ]
}

## Constraints

- If classification = "personal", retrieval_enabled must be false and queries must be []
- If retrieval_enabled = false, queries must be []
- confidence must be a number between 0 and 1
- Keep reason under 20 words
- Never output anything except the JSON object`;

export async function classifyNote(
  title: string,
  content: string
): Promise<ClassificationResult> {
  const defaultNonPersonal: ClassificationResult = {
    classification: "non_personal",
    retrieval_enabled: true,
    queries: [{ query: title, intent: "research", keyword: title, description: title }],
  };

  if (!process.env.OPENAI_API_KEY) {
    return defaultNonPersonal;
  }

  try {
    const client = getOpenAI();
    const noteText = `Title: ${title}\n\nContent: ${content.slice(0, 8000)}`;

    const response = await client.chat.completions.create({
      model: LLM_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: noteText },
      ],
    });

    const text = response.choices[0]?.message?.content || "";
    const parsed = JSON.parse(text);

    return {
      classification: parsed.classification === "personal" ? "personal" : "non_personal",
      retrieval_enabled: !!parsed.retrieval_enabled,
      queries: Array.isArray(parsed.queries) ? parsed.queries : [],
    };
  } catch (error) {
    console.error("Failed to classify note:", error);
    return defaultNonPersonal;
  }
}
