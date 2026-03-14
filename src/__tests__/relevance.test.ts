import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreate = vi.fn();

vi.mock("@/lib/openai", () => ({
  getOpenAI: vi.fn(() => ({
    chat: { completions: { create: mockCreate } },
  })),
}));

vi.mock("@/lib/embeddings", () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
}));

describe("generateRelevanceReason", () => {
  beforeEach(() => {
    vi.resetModules();
    mockCreate.mockReset();
  });

  it("uses LLM when API key is set", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "This article explains the caching mechanism mentioned in your note." } }],
    });
    const { generateRelevanceReason } = await import("@/lib/relevance");
    const result = await generateRelevanceReason("KV caching in transformers", "KV Cache Guide", "How KV caching works");
    expect(result).toBe("This article explains the caching mechanism mentioned in your note.");
  });

  it("falls back to embedding-based relevance when no API key", async () => {
    delete process.env.OPENAI_API_KEY;
    const { generateRelevanceReason } = await import("@/lib/relevance");
    const result = await generateRelevanceReason(
      "Some note content about machine learning. It covers deep learning and neural networks.",
      "ML Guide",
      "Deep learning fundamentals"
    );
    expect(result).toContain("Relates to your point:");
  });

  it("returns fallback on error", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    mockCreate.mockRejectedValue(new Error("API error"));
    const { generateRelevanceReason } = await import("@/lib/relevance");
    const result = await generateRelevanceReason("note", "Result Title", "desc");
    expect(result).toContain("Related to:");
    expect(result).toContain("Result Title");
  });
});
