import OpenAI from "openai";

// Singleton for Transformers.js model
let localPipeline: ((text: string) => Promise<number[]>) | null = null;

async function getLocalPipeline() {
  if (localPipeline) return localPipeline;

  // Dynamic import to avoid issues in edge runtime
  const { pipeline } = await import("@xenova/transformers");
  const extractor = await pipeline(
    "feature-extraction",
    "Xenova/all-MiniLM-L6-v2"
  );

  localPipeline = async (text: string): Promise<number[]> => {
    const output = await extractor(text, {
      pooling: "mean",
      normalize: true,
    });
    return Array.from(output.data as Float32Array);
  };

  return localPipeline;
}

async function openaiEmbed(text: string): Promise<number[]> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const response = await client.embeddings.create({
    model: "text-embedding-3-small",
    input: text,
  });
  return response.data[0].embedding;
}

export async function generateEmbedding(text: string): Promise<number[]> {
  // Truncate to reasonable length
  const truncated = text.slice(0, 8000);

  if (process.env.OPENAI_API_KEY) {
    return openaiEmbed(truncated);
  }

  // Fallback: Transformers.js returns 384-dim, pad to 1536
  const embed = await getLocalPipeline();
  const vec = await embed(truncated);
  return [...vec, ...new Array(1536 - 384).fill(0)];
}
