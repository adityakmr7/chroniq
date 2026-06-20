import { gemini } from "./gemini.ts";
import type { Topic } from "./topic.ts";
import type { Research } from "./research.ts";

export type VoiceTone = "dramatic" | "calm" | "energetic";

export type Script = {
  hook: string;
  body: string;
  cta: string;
  full: string;
  wordCount: number;
  voiceTone: VoiceTone;
};

// 5 proven high-retention scriptwriting formulas
const HOOK_FORMULAS = [
  "CURIOSITY GAP: Start with a shocking question the viewer can't resist answering (e.g. 'What if I told you the most powerful company on earth nearly went bankrupt... in 1997?')",
  "REVELATION: Lead with the surprising end-state then rewind to the beginning (e.g. 'By 2013, Nokia had lost 90% of its value. But just 10 years earlier, they were untouchable.')",
  "STAKES: Immediately establish what's at risk (e.g. 'In 72 hours, $40 billion dollars would disappear. And nobody saw it coming.')",
  "CONTRARIAN: Challenge what the viewer assumes to be true (e.g. 'Everyone says Steve Jobs saved Apple. But the real story is far stranger than that.')",
  "COUNTDOWN: Create urgency with a ticking clock (e.g. 'It took just 18 months. From the most valuable startup in history... to total collapse.')" 
];

export async function generateScript(
  topic: Topic,
  research: Research,
  isShort = true,
  language = "en"
): Promise<Script> {
  const languageInstruction = language === "hi" 
    ? "Write the script in Hindi (using Devanagari script like 'नमस्ते'). Ensure the pronunciation and rhythm are natural for a Hindi voiceover generator."
    : "Write the script in English.";

  // Pick a random hook formula to get variety across videos
  const hookFormula = HOOK_FORMULAS[Math.floor(Math.random() * HOOK_FORMULAS.length)];

  const prompt = `You are an elite scriptwriter for VIRAL faceless documentary YouTube ${
    isShort ? "Shorts" : "videos"
  }. Your scripts are used by top creators with 1M+ subscribers.
Write a narration script for this video.
Language: ${language === "hi" ? "Hindi" : "English"}.
${languageInstruction}

Topic: "${topic.title}"
Angle: ${topic.angle}
Summary: ${research.summary}
Key facts:
${(research.facts ?? []).map((f) => `- ${f}`).join("\n") || "No specific facts available."}

Scriptwriting formula to use for the HOOK:
${hookFormula}

Script Requirements:
1. LENGTH: ${isShort ? "110-130 words total (strictly under 60 seconds, this is a Short)" : "380-440 words total (this is a 3-minute long-form video)"}.
2. HOOK (first 1-2 sentences): Must be a shocking question OR a provocative claim that creates an immediate curiosity gap. Never start with a plain statement. Must grab attention in the first 5 words.
3. BODY: Tell the story with RETENTION LOOPS every 8-10 words. Use phrases like:
   - "But here's the twist nobody talks about..."
   - "And then, everything changed."
   - "What happened next shocked everyone."
   - "But that's not even the most surprising part."
   - "Here's what the history books don't tell you."
4. CTA (last 1-2 sentences): A short, curiosity-driven invite to follow/comment THEMED to the story topic (not generic).
5. PACING: Short, punchy sentences. Maximum 12 words per sentence. Spoken-word rhythm. No stage directions, no emojis, no markdown.
6. VOICE TONE: Based on the topic, select one: "dramatic" (dark/high-stakes stories), "energetic" (fast/exciting stories), or "calm" (educational/inspiring stories).

Return ONLY JSON matching:
{"hook": string, "body": string, "cta": string, "voiceTone": "dramatic" | "calm" | "energetic"}`;

  const raw = await gemini(prompt, { json: true, language });
  const parsed = JSON.parse(raw) as { hook: string; body: string; cta: string; voiceTone?: VoiceTone };
  const full = [parsed.hook, parsed.body, parsed.cta].join("\n\n").trim();
  return {
    ...parsed,
    full,
    wordCount: full.split(/\s+/).filter(Boolean).length,
    voiceTone: (parsed.voiceTone || "dramatic") as VoiceTone,
  };
}
