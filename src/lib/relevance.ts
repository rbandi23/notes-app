import { getOpenAI } from "./openai";
import { generateEmbedding } from "./embeddings";

function cosineSimilarity(a: number[], b: number[]): number {
  const minLen = Math.min(a.length, b.length);
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < minLen; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

function splitSentences(text: string): string[] {
  return text
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 10);
}

async function llmRelevance(
  noteContent: string,
  resultTitle: string,
  resultDescription: string
): Promise<string> {
  const client = getOpenAI();
  const response = await client.chat.completions.create({
    model: "gpt-5-nano",
    messages: [
      {
        role: "system",
        content:
          "Given a note and a search result, explain in 1 concise sentence why this result is relevant to the note.",
      },
      {
        role: "user",
        content: `Note: ${noteContent.slice(0, 500)}\n\nSearch result: ${resultTitle} - ${resultDescription}`,
      },
    ],
  });
  return response.choices[0]?.message?.content || "Related content";
}

async function embeddingRelevance(
  noteContent: string,
  resultTitle: string,
  resultDescription: string
): Promise<string> {
  const sentences = splitSentences(noteContent);
  if (sentences.length === 0) {
    return `Related to: "${resultTitle}"`;
  }

  const resultEmbedding = await generateEmbedding(
    `${resultTitle}. ${resultDescription}`
  );

  let bestSentence = sentences[0];
  let bestScore = -1;

  for (const sentence of sentences.slice(0, 10)) {
    const sentenceEmbedding = await generateEmbedding(sentence);
    const score = cosineSimilarity(sentenceEmbedding, resultEmbedding);
    if (score > bestScore) {
      bestScore = score;
      bestSentence = sentence;
    }
  }

  const truncated =
    bestSentence.length > 100
      ? bestSentence.slice(0, 100) + "..."
      : bestSentence;
  return `Relates to your point: "${truncated}"`;
}

export async function generateRelevanceReason(
  noteContent: string,
  resultTitle: string,
  resultDescription: string
): Promise<string> {
  try {
    if (process.env.OPENAI_API_KEY) {
      return await llmRelevance(noteContent, resultTitle, resultDescription);
    }
    return await embeddingRelevance(
      noteContent,
      resultTitle,
      resultDescription
    );
  } catch (error) {
    console.error("Failed to generate relevance reason:", error);
    return `Related to: "${resultTitle}"`;
  }
}
