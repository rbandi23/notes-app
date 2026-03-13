import OpenAI from "openai";

export async function extractTags(content: string): Promise<string[]> {
  if (!process.env.OPENAI_API_KEY) {
    return [];
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.chat.completions.create({
      model: "gpt-5-nano",
      messages: [
        {
          role: "system",
          content:
            "Extract 2-3 key topics from the following note content. Return them as a JSON array of lowercase strings. Example: [\"machine learning\", \"transformers\", \"nlp\"]. Only return the JSON array, nothing else.",
        },
        {
          role: "user",
          content: content.slice(0, 1000),
        },
      ],
    });

    const text = response.choices[0]?.message?.content || "[]";
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return parsed.filter((t): t is string => typeof t === "string").slice(0, 5);
    }
    return [];
  } catch (error) {
    console.error("Failed to extract tags:", error);
    return [];
  }
}
