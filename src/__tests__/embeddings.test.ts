import { describe, it, expect, vi, beforeEach } from "vitest";

const mockEmbeddingsCreate = vi.fn().mockResolvedValue({
  data: [{ embedding: new Array(1536).fill(0.1) }],
});

vi.mock("@/lib/openai", () => ({
  getOpenAI: vi.fn(() => ({
    embeddings: {
      create: mockEmbeddingsCreate,
    },
  })),
}));

// Mock Transformers.js to avoid loading real models
vi.mock("@xenova/transformers", () => ({
  pipeline: vi.fn().mockResolvedValue(
    vi.fn().mockResolvedValue({
      data: new Float32Array(384).fill(0.05),
    })
  ),
}));

describe("generateEmbedding", () => {
  beforeEach(() => {
    vi.resetModules();
    mockEmbeddingsCreate.mockClear();
  });

  it("uses OpenAI when API key is set", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const { generateEmbedding } = await import("@/lib/embeddings");
    const result = await generateEmbedding("test text");
    expect(result).toHaveLength(1536);
    expect(result[0]).toBe(0.1);
  });

  it("truncates input to 8000 chars", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const { generateEmbedding } = await import("@/lib/embeddings");
    const longText = "a".repeat(10000);
    await generateEmbedding(longText);
    const call = mockEmbeddingsCreate.mock.calls[0][0];
    expect(call.input.length).toBeLessThanOrEqual(8000);
  });

  it("falls back to local pipeline when no API key", async () => {
    delete process.env.OPENAI_API_KEY;
    const mod = await import("@/lib/embeddings");
    const result = await mod.generateEmbedding("test text");
    // Should be 1536 (384 real + padded zeros)
    expect(result).toHaveLength(1536);
    // First 384 should be from transformer, rest should be 0
    expect(result[383]).toBeCloseTo(0.05);
    expect(result[384]).toBe(0);
    expect(result[1535]).toBe(0);
  });
});
