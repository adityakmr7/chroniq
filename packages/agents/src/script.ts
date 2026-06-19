import { gemini } from "./gemini.ts";
import type { Topic } from "./topic.ts";
import type { Research } from "./research.ts";

export type Script = {
  hook: string;
  body: string;
  cta: string;
  full: string;
  wordCount: number;
};

export async function generateScript(topic: Topic, research: Research, isShort = true): Promise<Script> {
  const prompt = `You are an elite scriptwriter for faceless documentary YouTube ${isShort ? "Shorts" : "videos"}.
Write a narration script for this video.

Topic: "${topic.title}"
Angle: ${topic.angle}
Summary: ${research.summary}
Key facts:
${research.facts.map((f) => `- ${f}`).join("\n")}

Requirements:
- ${isShort ? "120-130 words total (strictly under 60 seconds, this is a Short)" : "400-450 words total (this is a 3-minute long-form video)"}.
- Open with a 1-2 sentence HOOK that creates an immediate curiosity gap.
- BODY tells the story with retention loops ("but here's the twist...", "what happened next...").
- End with a short CTA that invites a follow/comment, themed to the story.
- Conversational, punchy, spoken-word rhythm. No stage directions, no emojis, no markdown.

Return ONLY JSON matching:
{"hook": string, "body": string, "cta": string}`;

  const raw = await gemini(prompt, { json: true });
  const parsed = JSON.parse(raw) as { hook: string; body: string; cta: string };
  const full = [parsed.hook, parsed.body, parsed.cta].join("\n\n").trim();
  return {
    ...parsed,
    full,
    wordCount: full.split(/\s+/).filter(Boolean).length,
  };
}
