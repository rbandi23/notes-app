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

describe("describeImage", () => {
  beforeEach(() => {
    vi.resetModules();
    mockCreate.mockReset();
  });

  it("returns placeholder when no API key", async () => {
    delete process.env.OPENAI_API_KEY;
    const { describeImage } = await import("@/lib/images");
    const result = await describeImage("https://example.com/image.png");
    expect(result).toBe("[uploaded image]");
  });

  it("returns AI description when API key is set", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "A cat sitting on a laptop keyboard" } }],
    });
    const { describeImage } = await import("@/lib/images");
    const result = await describeImage("https://example.com/cat.jpg");
    expect(result).toBe("A cat sitting on a laptop keyboard");
  });

  it("returns placeholder on API error", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    mockCreate.mockRejectedValue(new Error("Vision API failed"));
    const { describeImage } = await import("@/lib/images");
    const result = await describeImage("https://example.com/image.png");
    expect(result).toBe("[uploaded image]");
  });

  it("returns placeholder when LLM returns empty", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    mockCreate.mockResolvedValue({
      choices: [{ message: { content: "" } }],
    });
    const { describeImage } = await import("@/lib/images");
    const result = await describeImage("https://example.com/image.png");
    expect(result).toBe("[uploaded image]");
  });
});
