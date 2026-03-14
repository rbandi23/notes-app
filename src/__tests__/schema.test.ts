import { describe, it, expect } from "vitest";
import { notes, relatedNotes, relatedWebContent, noteImages, users, sessions, accounts } from "@/lib/db/schema";

describe("Database Schema", () => {
  describe("notes table", () => {
    it("has all required columns", () => {
      expect(notes.id).toBeDefined();
      expect(notes.userId).toBeDefined();
      expect(notes.title).toBeDefined();
      expect(notes.content).toBeDefined();
      expect(notes.contentJson).toBeDefined();
      expect(notes.embedding).toBeDefined();
      expect(notes.enrichmentStatus).toBeDefined();
      expect(notes.tags).toBeDefined();
      expect(notes.isPublic).toBeDefined();
      expect(notes.shareToken).toBeDefined();
      expect(notes.createdAt).toBeDefined();
      expect(notes.updatedAt).toBeDefined();
    });
  });

  describe("relatedNotes table", () => {
    it("has all required columns", () => {
      expect(relatedNotes.id).toBeDefined();
      expect(relatedNotes.sourceNoteId).toBeDefined();
      expect(relatedNotes.relatedNoteId).toBeDefined();
      expect(relatedNotes.similarityScore).toBeDefined();
    });
  });

  describe("relatedWebContent table", () => {
    it("has all required columns", () => {
      expect(relatedWebContent.id).toBeDefined();
      expect(relatedWebContent.noteId).toBeDefined();
      expect(relatedWebContent.url).toBeDefined();
      expect(relatedWebContent.title).toBeDefined();
      expect(relatedWebContent.description).toBeDefined();
      expect(relatedWebContent.thumbnailUrl).toBeDefined();
      expect(relatedWebContent.contentType).toBeDefined();
      expect(relatedWebContent.relevanceReason).toBeDefined();
    });
  });

  describe("noteImages table", () => {
    it("has all required columns", () => {
      expect(noteImages.id).toBeDefined();
      expect(noteImages.noteId).toBeDefined();
      expect(noteImages.blobUrl).toBeDefined();
      expect(noteImages.description).toBeDefined();
      expect(noteImages.embedding).toBeDefined();
      expect(noteImages.createdAt).toBeDefined();
    });
  });

  describe("auth tables", () => {
    it("users table has required fields", () => {
      expect(users.id).toBeDefined();
      expect(users.email).toBeDefined();
      expect(users.name).toBeDefined();
      expect(users.passwordHash).toBeDefined();
    });

    it("sessions table exists", () => {
      expect(sessions.id).toBeDefined();
      expect(sessions.sessionToken).toBeDefined();
      expect(sessions.userId).toBeDefined();
    });

    it("accounts table exists", () => {
      expect(accounts.id).toBeDefined();
      expect(accounts.userId).toBeDefined();
      expect(accounts.provider).toBeDefined();
    });
  });
});
