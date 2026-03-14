import { describe, it, expect, vi, beforeEach } from "vitest";

describe("searchWeb", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  it("returns empty array when TAVILY_API_KEY is not set", async () => {
    delete process.env.TAVILY_API_KEY;
    const { searchWeb } = await import("@/lib/search");
    const results = await searchWeb("test query");
    expect(results).toEqual([]);
  });

  it("returns parsed results on successful search", async () => {
    process.env.TAVILY_API_KEY = "test-tavily-key";
    const mockResults = {
      results: [
        { url: "https://example.com/article", title: "Test Article", content: "Description of article" },
        { url: "https://youtube.com/watch?v=abc123", title: "Test Video", content: "Video about testing" },
      ],
    };
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResults),
    });

    const { searchWeb } = await import("@/lib/search");
    const results = await searchWeb("test query");

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      url: "https://example.com/article",
      title: "Test Article",
      description: "Description of article",
      thumbnailUrl: undefined,
      contentType: "article",
    });
    expect(results[1].contentType).toBe("video");
    expect(results[1].thumbnailUrl).toBe("https://img.youtube.com/vi/abc123/mqdefault.jpg");
  });

  it("returns empty array on API failure", async () => {
    process.env.TAVILY_API_KEY = "test-tavily-key";
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      statusText: "Internal Server Error",
    });

    const { searchWeb } = await import("@/lib/search");
    const results = await searchWeb("test query");
    expect(results).toEqual([]);
  });

  it("handles empty results array", async () => {
    process.env.TAVILY_API_KEY = "test-tavily-key";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ results: [] }),
    });

    const { searchWeb } = await import("@/lib/search");
    const results = await searchWeb("test query");
    expect(results).toEqual([]);
  });

  it("detects YouTube and Vimeo as video content type", async () => {
    process.env.TAVILY_API_KEY = "test-tavily-key";
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        results: [
          { url: "https://youtu.be/xyz789", title: "Short URL Video", content: "desc" },
          { url: "https://vimeo.com/123456", title: "Vimeo Video", content: "desc" },
          { url: "https://example.com/page", title: "Normal page", content: "desc" },
        ],
      }),
    });

    const { searchWeb } = await import("@/lib/search");
    const results = await searchWeb("test");
    expect(results[0].contentType).toBe("video");
    expect(results[1].contentType).toBe("video");
    expect(results[2].contentType).toBe("article");
  });
});
