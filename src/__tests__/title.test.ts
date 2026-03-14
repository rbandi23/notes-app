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

describe("generateTitle", () => {
  beforeEach(() => {
    vi.resetModules();
    mockCreate.mockReset();
  });

  it("returns fallback for empty content", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const { generateTitle } = await import("@/lib/title");
    const result = await generateTitle("");
    expect(result).toBe("Untitled Note");
  });

  it("returns fallback for whitespace-only content", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const { generateTitle } = await import("@/lib/title");
    const result = await generateTitle("   ");
    expect(result).toBe("Untitled Note");
  });

  it("returns first line as fallback when no API key", async () => {
    delete process.env.OPENAI_API_KEY;
    const { generateTitle } = await import("@/lib/title");
    const result = await generateTitle("My first note\nWith more content");
    expect(result).toBe("My first note");
  });

  it("truncates long fallback titles to 60 chars", async () => {
    delete process.env.OPENAI_API_KEY;
    const { generateTitle } = await import("@/lib/title");
    const longLine = "a".repeat(100);
    const result = await generateTitle(longLine);
    expect(result.length).toBe(60);
  });

  it("generates title via LLM when API key is set", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "Understanding KV Caching" } }],
    });
    const { generateTitle } = await import("@/lib/title");
    const result = await generateTitle("KV caching is a technique used in transformers...");
    expect(result).toBe("Understanding KV Caching");
  });

  it("strips surrounding quotes from LLM response", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: '"Quoted Title"' } }],
    });
    const { generateTitle } = await import("@/lib/title");
    const result = await generateTitle("some content");
    expect(result).toBe("Quoted Title");
  });

  it("falls back on API error", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    mockCreate.mockRejectedValue(new Error("API error"));
    const { generateTitle } = await import("@/lib/title");
    const result = await generateTitle("First line of content");
    expect(result).toBe("First line of content");
  });
});
