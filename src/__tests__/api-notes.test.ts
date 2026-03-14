import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Mock auth
const mockSession = { user: { id: "user-1", email: "test@test.com" } };
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve(mockSession)),
}));

// Mock inngest
vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: vi.fn() },
}));

// Mock title generation
vi.mock("@/lib/title", () => ({
  generateTitle: vi.fn().mockResolvedValue("Auto Generated Title"),
}));

// Mock embeddings
vi.mock("@/lib/embeddings", () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0.1)),
}));

// Mock constants
vi.mock("@/lib/constants", () => ({
  NOTE_CHAR_LIMIT: 10000,
}));

// Setup mock DB
const mockNote = {
  id: "note-1",
  userId: "user-1",
  title: "Test Note",
  content: "Test content",
  tags: ["test"],
  enrichmentStatus: "completed",
  createdAt: new Date(),
  updatedAt: new Date(),
};

vi.mock("@/lib/db", () => {
  const createChain = (resolvedValue: unknown) => {
    const chain: Record<string, unknown> = {};
    chain.select = vi.fn().mockReturnValue(chain);
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockReturnValue(chain);
    chain.orderBy = vi.fn().mockReturnValue(chain);
    chain.limit = vi.fn().mockReturnValue(chain);
    chain.offset = vi.fn().mockReturnValue(Promise.resolve(resolvedValue));
    chain.insert = vi.fn().mockReturnValue(chain);
    chain.values = vi.fn().mockReturnValue(chain);
    chain.returning = vi.fn().mockReturnValue(Promise.resolve(resolvedValue));
    chain.then = (resolve: (v: unknown) => void) => Promise.resolve(resolvedValue).then(resolve);
    return chain;
  };

  return {
    db: {
      select: vi.fn((..._args: unknown[]) => {
        const chain = createChain([mockNote]);
        return chain;
      }),
      insert: vi.fn((..._args: unknown[]) => {
        const chain = createChain([mockNote]);
        return chain;
      }),
      update: vi.fn((..._args: unknown[]) => {
        const chain = createChain([mockNote]);
        return chain;
      }),
      delete: vi.fn((..._args: unknown[]) => {
        const chain = createChain(undefined);
        return chain;
      }),
    },
  };
});

describe("Notes API - POST /api/notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 for unauthenticated user", async () => {
    const { auth } = await import("@/lib/auth");
    (auth as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const { POST } = await import("@/app/api/notes/route");
    const req = new NextRequest("http://localhost:3000/api/notes", {
      method: "POST",
      body: JSON.stringify({ title: "Test", content: "Content" }),
    });
    const response = await POST(req);
    expect(response.status).toBe(401);
  });

  it("rejects content exceeding char limit", async () => {
    const { POST } = await import("@/app/api/notes/route");
    const req = new NextRequest("http://localhost:3000/api/notes", {
      method: "POST",
      body: JSON.stringify({ title: "Test", content: "a".repeat(10001) }),
    });
    const response = await POST(req);
    expect(response.status).toBe(400);
  });

  it("requires title or content", async () => {
    const { POST } = await import("@/app/api/notes/route");
    const req = new NextRequest("http://localhost:3000/api/notes", {
      method: "POST",
      body: JSON.stringify({ title: "", content: "" }),
    });
    const response = await POST(req);
    expect(response.status).toBe(400);
  });

  it("auto-generates title when not provided", async () => {
    const { POST } = await import("@/app/api/notes/route");
    const req = new NextRequest("http://localhost:3000/api/notes", {
      method: "POST",
      body: JSON.stringify({ title: "", content: "Some note content" }),
    });
    const response = await POST(req);
    // Should succeed (201) since content is provided and title will be auto-generated
    expect(response.status).toBe(201);
  });
});

describe("Notes API - GET /api/notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 for unauthenticated user", async () => {
    const { auth } = await import("@/lib/auth");
    (auth as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const { GET } = await import("@/app/api/notes/route");
    const req = new NextRequest("http://localhost:3000/api/notes");
    const response = await GET(req);
    expect(response.status).toBe(401);
  });
});
