import { describe, it, expect, vi, afterEach } from "vitest";
import { formatDistanceToNow } from "@/lib/date";

describe("formatDistanceToNow", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 'just now' for recent dates", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:00:30Z"));
    const result = formatDistanceToNow("2026-01-15T12:00:00Z");
    expect(result).toBe("just now");
  });

  it("returns minutes ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:05:00Z"));
    const result = formatDistanceToNow("2026-01-15T12:00:00Z");
    expect(result).toBe("5m ago");
  });

  it("returns hours ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T15:00:00Z"));
    const result = formatDistanceToNow("2026-01-15T12:00:00Z");
    expect(result).toBe("3h ago");
  });

  it("returns days ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-18T12:00:00Z"));
    const result = formatDistanceToNow("2026-01-15T12:00:00Z");
    expect(result).toBe("3d ago");
  });

  it("returns formatted date for older than 7 days", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-30T12:00:00Z"));
    const result = formatDistanceToNow("2026-01-15T12:00:00Z");
    // Should be a locale date string, not relative
    expect(result).not.toContain("ago");
    expect(result).not.toBe("just now");
  });

  it("accepts Date objects", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-15T12:10:00Z"));
    const result = formatDistanceToNow(new Date("2026-01-15T12:00:00Z"));
    expect(result).toBe("10m ago");
  });
});
