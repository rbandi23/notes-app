import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreate = vi.fn();

vi.mock("@/lib/openai", () => ({
  getOpenAI: vi.fn(() => ({
    chat: { completions: { create: mockCreate } },
  })),
}));

vi.mock("@/lib/constants", () => ({
  LLM_MODEL: "test-model",
}));

describe("classifyNote", () => {
  beforeEach(() => {
    vi.resetModules();
    mockCreate.mockReset();
  });

  it("returns default non-personal result when no API key", async () => {
    delete process.env.OPENAI_API_KEY;
    const { classifyNote } = await import("@/lib/classify");
    const result = await classifyNote("Test Title", "Test content");
    expect(result.classification).toBe("non_personal");
    expect(result.retrieval_enabled).toBe(true);
    expect(result.queries).toHaveLength(1);
    expect(result.queries[0].query).toBe("Test Title");
  });

  it("classifies personal notes correctly", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    mockCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            classification: "personal",
            retrieval_enabled: false,
            queries: [],
            tags: ["reminder"],
            related_ranking: [],
          }),
        },
      }],
    });
    const { classifyNote } = await import("@/lib/classify");
    const result = await classifyNote("Call mom", "Reminder to call mom tomorrow");
    expect(result.classification).toBe("personal");
    expect(result.retrieval_enabled).toBe(false);
    expect(result.queries).toEqual([]);
  });

  it("classifies non-personal notes with queries", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    mockCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            classification: "non_personal",
            retrieval_enabled: true,
            queries: [
              { query: "KV caching LLM", intent: "explain", keyword: "KV caching", description: "Learn about KV caching" },
            ],
            tags: ["llm", "caching"],
            related_ranking: [],
          }),
        },
      }],
    });
    const { classifyNote } = await import("@/lib/classify");
    const result = await classifyNote("KV Caching", "How does KV caching reduce latency?");
    expect(result.classification).toBe("non_personal");
    expect(result.retrieval_enabled).toBe(true);
    expect(result.queries).toHaveLength(1);
    expect(result.tags).toEqual(["llm", "caching"]);
  });

  it("returns default on API error", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    mockCreate.mockRejectedValue(new Error("API error"));
    const { classifyNote } = await import("@/lib/classify");
    const result = await classifyNote("Title", "Content");
    expect(result.classification).toBe("non_personal");
    expect(result.retrieval_enabled).toBe(true);
  });

  it("handles malformed JSON response", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "not json at all" } }],
    });
    const { classifyNote } = await import("@/lib/classify");
    const result = await classifyNote("Title", "Content");
    // Should fall back to default
    expect(result.classification).toBe("non_personal");
  });

  it("accepts candidates for reranking", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    mockCreate.mockResolvedValue({
      choices: [{
        message: {
          content: JSON.stringify({
            classification: "non_personal",
            retrieval_enabled: false,
            queries: [],
            tags: ["test"],
            related_ranking: ["id-2", "id-1"],
          }),
        },
      }],
    });
    const { classifyNote } = await import("@/lib/classify");
    const candidates = [
      { id: "id-1", title: "Note 1" },
      { id: "id-2", title: "Note 2" },
    ];
    const result = await classifyNote("Title", "Content", candidates);
    expect(result.related_ranking).toEqual(["id-2", "id-1"]);
  });
});
