import OpenAI from "openai";
import { LLM_MODEL } from "./constants";

export async function describeImage(imageUrl: string): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    return "[uploaded image]";
  }

  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const response = await client.chat.completions.create({
      model: LLM_MODEL,
      messages: [
        {
          role: "system",
          content:
            "Describe this image in detail for semantic search indexing. Include key objects, text, colors, context, and any identifiable concepts. Max 200 words. Return only the description, nothing else.",
        },
        {
          role: "user",
          content: [
            {
              type: "image_url",
              image_url: { url: imageUrl },
            },
          ],
        },
      ],
    });

    return response.choices[0]?.message?.content?.trim() || "[uploaded image]";
  } catch (error) {
    console.error("Failed to describe image:", error);
    return "[uploaded image]";
  }
}
