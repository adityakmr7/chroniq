import { gemini } from "./gemini.ts";

export type Topic = {
  title: string;
  category: string;
  estimatedViews: number;
  angle: string;
};

const CATEGORIES = [
  "Technology History",
  "Startup Stories",
  "AI & Innovation",
  "Business Case Studies",
  "Historical Events",
  "Forgotten Stories",
];

export async function generateTopic(category?: string): Promise<Topic> {
  const cat = category ?? CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];

  const prompt = `You are a viral YouTube Shorts strategist for a faceless documentary channel.
Generate ONE high-potential video topic in the niche: "${cat}".

Rules:
- Must be a specific, intriguing story (not a generic "Top 10").
- Title should be punchy and curiosity-driven, in the style of "Why Nokia Failed", "How Netflix Destroyed Blockbuster", "The Rise of NVIDIA".
- estimatedViews is your honest 30-day projection for a small channel (realistic range 10000-200000).
- angle is a one-sentence hook describing the surprising tension of the story.

Return ONLY JSON matching:
{"title": string, "category": string, "estimatedViews": number, "angle": string}`;

  const raw = await gemini(prompt, { json: true });
  const topic = JSON.parse(raw) as Topic;
  return topic;
}
