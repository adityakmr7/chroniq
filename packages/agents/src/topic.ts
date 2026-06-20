import { gemini } from "./gemini.ts";

export type Topic = {
  title: string;
  category: string;
  estimatedViews: number;
  angle: string;
};

const CATEGORIES = [
  "Horror Stories",
  "Spirituality",
  "History",
];

export async function generateTopic(category?: string): Promise<Topic> {
  const cat = category ?? CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];

  const prompt = `You are a viral YouTube Shorts strategist for a faceless documentary channel.
Generate ONE high-potential video topic in the niche: "${cat}".

Rules:
- Must be a specific, intriguing story (not a generic "Top 10").
- Title should be punchy and curiosity-driven (e.g. "The Shadows of Bhangarh Fort", "The Law of Vibration Explained", "How the Great Pyramid Was Built").
- estimatedViews is your honest 30-day projection for a small channel (realistic range 10000-200000).
- angle is a one-sentence hook describing the surprising tension of the story.

Return ONLY JSON matching:
{"title": string, "category": string, "estimatedViews": number, "angle": string}`;

  const raw = await gemini(prompt, { json: true });
  const topic = JSON.parse(raw) as Topic;
  return topic;
}

export async function generateDailyTrendingTopics(dateStr: string): Promise<any[]> {
  const prompt = `You are a viral YouTube Shorts and Reels strategist.
Today's date is: ${dateStr}.
Generate 3 viral trending video topic ideas for today.
Each topic must belong to one of these core niches (exactly one topic per niche):
- Horror Stories
- Spirituality
- History

Rules:
- Must be timely, highly relevant, and designed for extreme retention.
- Title should be punchy and curiosity-driven (e.g., "The Shadows of Bhangarh Fort", "The Law of Vibration Explained", "How the Great Pyramid Was Built").
- estimatedViews is your honest 30-day projection for a small channel (realistic range 50000-300000).
- angle is a one-sentence hook describing the surprising twist or core tension.
- reason is a brief explanation of why this topic is trending today (e.g. current events, anniversaries, viral trends).

Return ONLY JSON matching:
[
  {"title": string, "category": string, "estimatedViews": number, "angle": string, "reason": string}
]`;

  const raw = await gemini(prompt, { json: true });
  const topics = JSON.parse(raw);
  return Array.isArray(topics) ? topics : [];
}
