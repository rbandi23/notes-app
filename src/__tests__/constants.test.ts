import { describe, it, expect } from "vitest";
import { LLM_MODEL, NOTE_CHAR_LIMIT, IMAGE_MAX_SIZE_MB, IMAGE_MAX_SIZE_BYTES, MAX_IMAGES_PER_NOTE } from "@/lib/constants";

describe("constants", () => {
  it("has a valid LLM model name", () => {
    expect(LLM_MODEL).toBeDefined();
    expect(typeof LLM_MODEL).toBe("string");
    expect(LLM_MODEL.length).toBeGreaterThan(0);
  });

  it("has reasonable note char limit", () => {
    expect(NOTE_CHAR_LIMIT).toBe(10_000);
  });

  it("has consistent image size constants", () => {
    expect(IMAGE_MAX_SIZE_MB).toBe(5);
    expect(IMAGE_MAX_SIZE_BYTES).toBe(5 * 1024 * 1024);
  });

  it("allows a reasonable number of images per note", () => {
    expect(MAX_IMAGES_PER_NOTE).toBe(10);
    expect(MAX_IMAGES_PER_NOTE).toBeGreaterThan(0);
  });
});
