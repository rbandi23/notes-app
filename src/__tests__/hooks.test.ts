import { describe, it, expect, vi, beforeEach } from "vitest";
import { createNote, updateNote, deleteNote, shareNote, unshareNote } from "@/hooks/use-notes";

describe("Note API helpers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("createNote", () => {
    it("sends POST request with correct data", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: "new-note", title: "Test" }),
      });

      const result = await createNote({ title: "Test", content: "Content" });
      expect(fetch).toHaveBeenCalledWith("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Test", content: "Content" }),
      });
      expect(result.id).toBe("new-note");
    });

    it("throws on failure", async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false });
      await expect(createNote({ title: "T", content: "C" })).rejects.toThrow("Failed to create note");
    });
  });

  describe("updateNote", () => {
    it("sends PUT request with correct data", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: "note-1", title: "Updated" }),
      });

      await updateNote("note-1", { title: "Updated" });
      expect(fetch).toHaveBeenCalledWith("/api/notes/note-1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Updated" }),
      });
    });

    it("throws on failure", async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false });
      await expect(updateNote("id", { title: "T" })).rejects.toThrow("Failed to update note");
    });
  });

  describe("deleteNote", () => {
    it("sends DELETE request", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await deleteNote("note-1");
      expect(fetch).toHaveBeenCalledWith("/api/notes/note-1", { method: "DELETE" });
    });

    it("throws on failure", async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false });
      await expect(deleteNote("id")).rejects.toThrow("Failed to delete note");
    });
  });

  describe("shareNote", () => {
    it("sends POST to share endpoint", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ shareToken: "abc123" }),
      });

      const result = await shareNote("note-1");
      expect(fetch).toHaveBeenCalledWith("/api/notes/note-1/share", { method: "POST" });
      expect(result.shareToken).toBe("abc123");
    });

    it("throws on failure", async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false });
      await expect(shareNote("id")).rejects.toThrow("Failed to share note");
    });
  });

  describe("unshareNote", () => {
    it("sends DELETE to share endpoint", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      await unshareNote("note-1");
      expect(fetch).toHaveBeenCalledWith("/api/notes/note-1/share", { method: "DELETE" });
    });

    it("throws on failure", async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: false });
      await expect(unshareNote("id")).rejects.toThrow("Failed to unshare note");
    });
  });
});
