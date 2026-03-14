import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock auth
vi.mock("@/lib/auth", () => ({
  auth: vi.fn(() => Promise.resolve({ user: { id: "user-1" } })),
}));

const mockUserNotes = [
  { id: "n1", title: "Note 1", contentLength: 500, tags: ["ml"] },
  { id: "n2", title: "Note 2", contentLength: 200, tags: ["ai"] },
];

const mockEdges = [
  { id: "e1", sourceNoteId: "n1", relatedNoteId: "n2", similarityScore: 0.8 },
];

vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn().mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn()
          .mockResolvedValueOnce(mockUserNotes) // first call: notes
          .mockResolvedValueOnce(mockEdges),     // second call: edges
      }),
    }),
  },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn(),
  inArray: vi.fn(),
  sql: vi.fn(),
}));

describe("Graph API - GET /api/notes/graph", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 for unauthenticated user", async () => {
    const { auth } = await import("@/lib/auth");
    (auth as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);

    const { GET } = await import("@/app/api/notes/graph/route");
    const response = await GET();
    expect(response.status).toBe(401);
  });
});
