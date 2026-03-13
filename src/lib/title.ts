import OpenAI from "openai";
import { LLM_MODEL } from "./constants";

function fallbackTitle(content: string): string {
  if (!content.trim()) return "Untitled Note";
  const firstLine = content.split(/[\n\r]/)[0].trim();
  return firstLine.slice(0, 60) || "Untitled Note";
}

export async function generateTitle(content: string): Promise<string> {
  if (!process.env.OPENAI_API_KEY || !content.trim()) {
    return fallbackTitle(content);
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.chat.completions.create({
      model: LLM_MODEL,
      messages: [
        {
          role: "system",
          content:
            "Generate a concise, descriptive title (max 8 words) for the following note content. Return only the title text, nothing else. Do not wrap in quotes.",
        },
        {
          role: "user",
          content: content.slice(0, 1000),
        },
      ],
    });

    const title = response.choices[0]?.message?.content?.trim();
    if (title) {
      return title.replace(/^["']|["']$/g, "");
    }
    return fallbackTitle(content);
  } catch (error) {
    console.error("Failed to generate title:", error);
    return fallbackTitle(content);
  }
}
