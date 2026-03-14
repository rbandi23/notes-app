import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the openai module — must use a class-like constructor
vi.mock("openai", () => {
  return {
    default: class MockOpenAI {
      chat = { completions: { create: vi.fn() } };
      embeddings = { create: vi.fn() };
      constructor() {}
    },
  };
});

describe("OpenAI Singleton", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env.OPENAI_API_KEY = "test-key";
  });

  it("returns the same client instance on multiple calls", async () => {
    const { getOpenAI } = await import("@/lib/openai");
    const client1 = getOpenAI();
    const client2 = getOpenAI();
    expect(client1).toBe(client2);
  });

  it("creates an OpenAI client with expected shape", async () => {
    const { getOpenAI } = await import("@/lib/openai");
    const client = getOpenAI();
    expect(client).toBeDefined();
    expect(client.chat).toBeDefined();
    expect(client.embeddings).toBeDefined();
  });
});
