import { gemini } from "./gemini.ts";
import type { Topic } from "./topic.ts";

export type Research = {
  summary: string;
  facts: string[];
  timeline: { year: string; event: string }[];
  sources: string[];
};

export async function researchTopic(topic: Topic): Promise<Research> {
  const prompt = `You are a meticulous research agent for a documentary YouTube channel.
Research this video topic and return verified, accurate information.

Topic: "${topic.title}"
Angle: ${topic.angle}

Return ONLY JSON matching:
{
  "summary": string,            // 3-4 sentence overview of the story
  "facts": string[],            // 6-10 concrete, surprising, verifiable facts
  "timeline": [{"year": string, "event": string}],  // 4-8 key chronological beats
  "sources": string[]           // 3-5 types of sources / references a viewer could check
}

Be factually accurate. Do not invent statistics. If unsure of a number, describe it qualitatively.`;

  const raw = await gemini(prompt, { json: true });
  const parsed = JSON.parse(raw) as Partial<Research>;

  // Sanitize: LLM may omit array fields for non-historical topics (e.g. horror, fictional stories)
  return {
    summary: parsed.summary || "",
    facts: Array.isArray(parsed.facts) ? parsed.facts : [],
    timeline: Array.isArray(parsed.timeline) ? parsed.timeline : [],
    sources: Array.isArray(parsed.sources) ? parsed.sources : [],
  };
}
