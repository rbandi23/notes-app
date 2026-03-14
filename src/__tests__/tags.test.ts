import { describe, it, expect, vi, beforeEach } from "vitest";

const mockCreate = vi.fn();

vi.mock("@/lib/openai", () => ({
  getOpenAI: vi.fn(() => ({
    chat: { completions: { create: mockCreate } },
  })),
}));

describe("extractTags", () => {
  beforeEach(() => {
    vi.resetModules();
    mockCreate.mockReset();
  });

  it("returns empty array when no API key", async () => {
    delete process.env.OPENAI_API_KEY;
    const { extractTags } = await import("@/lib/tags");
    const result = await extractTags("some content");
    expect(result).toEqual([]);
  });

  it("parses tags from LLM response", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: '["machine learning", "nlp", "transformers"]' } }],
    });
    const { extractTags } = await import("@/lib/tags");
    const result = await extractTags("some content about ML");
    expect(result).toEqual(["machine learning", "nlp", "transformers"]);
  });

  it("limits to 5 tags", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: '["a","b","c","d","e","f","g"]' } }],
    });
    const { extractTags } = await import("@/lib/tags");
    const result = await extractTags("content");
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it("filters out non-string values", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: '["valid", 123, null, "also valid"]' } }],
    });
    const { extractTags } = await import("@/lib/tags");
    const result = await extractTags("content");
    expect(result).toEqual(["valid", "also valid"]);
  });

  it("returns empty array on malformed JSON", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "not json" } }],
    });
    const { extractTags } = await import("@/lib/tags");
    const result = await extractTags("content");
    expect(result).toEqual([]);
  });

  it("returns empty array on API error", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    mockCreate.mockRejectedValue(new Error("API down"));
    const { extractTags } = await import("@/lib/tags");
    const result = await extractTags("content");
    expect(result).toEqual([]);
  });
});
