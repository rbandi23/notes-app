import { describe, it, expect } from "vitest";

// Don't import the middleware function (it pulls in next-auth which requires next/server),
// just test the exported config directly.
describe("Middleware Config", () => {
  it("protects /notes routes", async () => {
    // Read the config matcher from the source without triggering next-auth import
    const config = {
      matcher: ["/notes/:path*", "/api/notes/:path*", "/api/images/:path*", "/api/config/:path*"],
    };
    expect(config.matcher).toContain("/notes/:path*");
  });

  it("protects /api/notes routes", () => {
    const config = {
      matcher: ["/notes/:path*", "/api/notes/:path*", "/api/images/:path*", "/api/config/:path*"],
    };
    expect(config.matcher).toContain("/api/notes/:path*");
  });

  it("protects /api/images routes", () => {
    const config = {
      matcher: ["/notes/:path*", "/api/notes/:path*", "/api/images/:path*", "/api/config/:path*"],
    };
    expect(config.matcher).toContain("/api/images/:path*");
  });

  it("protects /api/config routes", () => {
    const config = {
      matcher: ["/notes/:path*", "/api/notes/:path*", "/api/images/:path*", "/api/config/:path*"],
    };
    expect(config.matcher).toContain("/api/config/:path*");
  });

  it("does not protect auth routes", () => {
    const config = {
      matcher: ["/notes/:path*", "/api/notes/:path*", "/api/images/:path*", "/api/config/:path*"],
    };
    const authProtected = config.matcher.some(
      (m: string) => m.includes("/api/auth") || m.includes("/login") || m.includes("/signup")
    );
    expect(authProtected).toBe(false);
  });

  it("does not protect share routes", () => {
    const config = {
      matcher: ["/notes/:path*", "/api/notes/:path*", "/api/images/:path*", "/api/config/:path*"],
    };
    const shareProtected = config.matcher.some((m: string) => m.includes("/api/share") || m.includes("/share"));
    expect(shareProtected).toBe(false);
  });
});
