export { auth as middleware } from "@/lib/auth";

export const config = {
  matcher: ["/notes/:path*", "/api/notes/:path*"],
};
