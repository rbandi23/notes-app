export interface SearchResult {
  url: string;
  title: string;
  description: string;
  thumbnailUrl?: string;
  contentType: "article" | "video" | "webpage";
}

export async function searchWeb(query: string): Promise<SearchResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    console.warn("TAVILY_API_KEY not set, skipping web search");
    return [];
  }

  const response = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      max_results: 5,
      search_depth: "basic",
      include_answer: false,
      include_raw_content: false,
    }),
  });

  if (!response.ok) {
    return [];
  }

  const data = await response.json();
  const results: SearchResult[] = [];

  for (const result of data.results || []) {
    const isVideo =
      result.url?.includes("youtube.com") ||
      result.url?.includes("youtu.be") ||
      result.url?.includes("vimeo.com");

    let thumbnailUrl: string | undefined;
    if (isVideo && result.url?.includes("youtube.com")) {
      try {
        const videoId = new URL(result.url).searchParams.get("v");
        if (videoId) {
          thumbnailUrl = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
        }
      } catch {}
    }

    results.push({
      url: result.url,
      title: result.title || "",
      description: result.content || "",
      thumbnailUrl,
      contentType: isVideo ? "video" : "article",
    });
  }

  return results;
}
