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

// 5 proven high-retention scriptwriting formulas for standard content
const HOOK_FORMULAS = [
  "CURIOSITY GAP: Start with a shocking question the viewer can't resist answering (e.g. 'What if I told you the most powerful company on earth nearly went bankrupt... in 1997?')",
  "REVELATION: Lead with the surprising end-state then rewind to the beginning (e.g. 'By 2013, Nokia had lost 90% of its value. But just 10 years earlier, they were untouchable.')",
  "STAKES: Immediately establish what's at risk (e.g. 'In 72 hours, $40 billion dollars would disappear. And nobody saw it coming.')",
  "CONTRARIAN: Challenge what the viewer assumes to be true (e.g. 'Everyone says Steve Jobs saved Apple. But the real story is far stranger than that.')",
  "COUNTDOWN: Create urgency with a ticking clock (e.g. 'It took just 18 months. From the most valuable startup in history... to total collapse.')" 
];

// Horror-specific hook formulas — designed to build dread and trigger the fight-or-flight response
const HORROR_HOOK_FORMULAS = [
  "FORBIDDEN RULE: Open with a rule the protagonist must never break, then immediately break it (e.g. 'Rule number one: never open the door after midnight. He opened it.')",
  "WRONG DETAIL: Reveal one small, deeply wrong detail that shouldn't exist (e.g. 'The voicemail was from his own number. But he'd been dead for three days.')",
  "COUNTDOWN DREAD: Establish a terrifying countdown the viewer dreads reaching zero (e.g. 'She found the note under her pillow. It said: I've been here for 7 nights. Tonight is the last.')",
  "IMPOSSIBLE TRUTH: State something impossible that turns out to be real (e.g. 'The babysitter called the police. The calls were coming from inside the house... but she lived alone.')",
  "THE WITNESS: The narrator witnessed something they cannot explain. Drag the viewer in (e.g. 'I watched the security footage seventeen times. The shadow moves before the light turns on.')",
];

export const HORROR_CATEGORY = "Horror Stories";

export async function generateScript(
  topic: Topic,
  research: Research,
  isShort = true,
  language = "en",
  category = ""
): Promise<Script> {
  const isHorror = category === HORROR_CATEGORY || topic.category === HORROR_CATEGORY;

  const languageInstruction = language === "hi" 
    ? "Write the script in Hindi (using Devanagari script like 'नमस्ते'). Ensure the pronunciation and rhythm are natural for a Hindi voiceover generator."
    : "Write the script in English.";

  if (isHorror) {
    // ── Horror-specific prompt ──
    const hookFormula = HORROR_HOOK_FORMULAS[Math.floor(Math.random() * HORROR_HOOK_FORMULAS.length)];

    const prompt = `You are an elite horror story scriptwriter for VIRAL faceless horror YouTube ${
      isShort ? "Shorts" : "videos"
    }. Your scripts make viewers feel genuine dread, curiosity, and fear.
Write a horror narration script for this story.
Language: ${language === "hi" ? "Hindi" : "English"}.
${languageInstruction}

Story Title: "${topic.title}"
Story Concept: ${topic.angle || "A terrifying true-crime or paranormal story."}
${research.summary ? `Background: ${research.summary}` : ""}

Hook Formula to use:
${hookFormula}

Script Requirements:
1. LENGTH: ${isShort ? "110-130 words total (strictly under 60 seconds, this is a Short)" : "380-440 words total (this is a 3-minute story)"}.
2. HOOK (first 1-2 sentences): Must immediately create dread. Use silence, darkness, wrongness. The viewer must feel unsafe.
3. BODY: Build tension with slow-burn pacing. Use micro-cliffhangers every 2-3 sentences:
   - "And then the lights went out."
   - "That's when she realized she wasn't alone."
   - "But the door was locked from the inside."
   - "The footsteps stopped. Right outside her door."
   - "He never made it home that night."
4. CTA: End with a chilling final line that leaves the viewer unsettled, plus a curiosity-driven question to follow for more.
5. PACING: Short, punchy sentences. Maximum 10 words per sentence. Use dramatic pauses (ellipses sparingly). No emojis, no markdown.
6. VOICE TONE: Always return "dramatic" for horror content.

Return ONLY JSON matching:
{"hook": string, "body": string, "cta": string, "voiceTone": "dramatic"}`;

    const raw = await gemini(prompt, { json: true, language });
    const parsed = JSON.parse(raw) as { hook: string; body: string; cta: string; voiceTone?: VoiceTone };
    const full = [parsed.hook, parsed.body, parsed.cta].join("\n\n").trim();
    return {
      ...parsed,
      full,
      wordCount: full.split(/\s+/).filter(Boolean).length,
      voiceTone: "dramatic", // always dramatic for horror
    };
  }

  // ── Standard prompt ──
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

export interface ParsedScreenplay {
  hook: string;
  body: string;
  cta: string;
  full: string;
  wordCount: number;
  voiceTone: VoiceTone;
  scenes: {
    timestamp: number;
    duration: number; // stores weight (relative duration) initially
    imagePrompt: string;
    searchQuery: string;
    sceneType: string;
    headline: string;
    emphasis: string;
    motion: string;
  }[];
}

export async function parseScreenplay(
  screenplayText: string,
  isShort = true
): Promise<ParsedScreenplay> {
  const prompt = `You are an expert screenplay parser for vertical/horizontal videos.
Your task is to take a raw screenplay (which includes act names, visual prompts, caw sounds, audio details, stage directions, and spoken lines) and parse it into two structured formats:

1. Spoken Narration/Voiceover Only (no stage directions, no narrator labels like "Narration:", no actor names, no visual descriptions, no bracketed cues like "[Visual]...").
2. A list of consecutive visual scenes corresponding to the screenplay's visual cues and act structures.

Raw Screenplay:
"""
${screenplayText}
"""

Rules for parsing:
1. NARRATION EXTRACTION: Combine all spoken lines into a single clean string. Do NOT include bracketed stage directions e.g. [Visual...], sounds e.g. Audio:..., act headers e.g. Act 1..., or character names prefixing the spoken line. Just extract what should be read by the TTS voice generator. Split it logically into "hook" (the first 1-2 spoken sentences), "body" (the middle part), and "cta" (the final spoken sentence/call to action).
2. STORYBOARD SCENES: Locate every visual description/prompt in the screenplay (often marked by "[Visual]" or visual cues). Create a consecutive sequence of scenes. For each scene, specify:
   - "imagePrompt": A detailed, highly descriptive cinematic prompt based on the screenplay's visual description (suitable for Stable Diffusion/Flux).
   - "searchQuery": 3-4 keywords to search for a stock photo of this scene.
   - "sceneType": Pick one of: "image", "headline", "stat", "quote", "timeline", "comparison".
   - "headline": A short on-screen text label (3-8 words).
   - "emphasis": A key word or phrase to highlight.
   - "motion": One of: "zoom-in", "zoom-out", "pan-left", "pan-right", "pan-up".
3. SCENE TIMING: We don't know the exact voiceover duration yet, so please specify relative weight percentages ("weight" field between 1 and 10) representing how long this scene should last relative to others. The total duration will be scaled across these weights in the worker.

Return ONLY JSON matching:
{
  "hook": string, // first 1-2 spoken sentences only
  "body": string, // middle spoken lines
  "cta": string, // last spoken line
  "scenes": [
    {
      "weight": number, // relative duration weight, e.g. 1 to 5
      "imagePrompt": string,
      "searchQuery": string,
      "sceneType": "image" | "headline" | "stat" | "quote" | "timeline" | "comparison",
      "headline": string,
      "emphasis": string,
      "motion": "zoom-in" | "zoom-out" | "pan-left" | "pan-right" | "pan-up"
    }
  ]
}`;

  const raw = await gemini(prompt, { json: true });
  const parsed = JSON.parse(raw) as {
    hook: string;
    body: string;
    cta: string;
    scenes: {
      weight: number;
      imagePrompt: string;
      searchQuery: string;
      sceneType: string;
      headline: string;
      emphasis: string;
      motion: string;
    }[];
  };

  const full = [parsed.hook, parsed.body, parsed.cta].join("\n\n").trim();
  const wordCount = full.split(/\s+/).filter(Boolean).length;

  const scenes = (parsed.scenes || []).map((scene) => ({
    timestamp: 0,
    duration: scene.weight || 2, // temporarily store weight in duration field
    imagePrompt: scene.imagePrompt || "Cinematic photo",
    searchQuery: scene.searchQuery || "documentary scene",
    sceneType: scene.sceneType || "image",
    headline: scene.headline || "",
    emphasis: scene.emphasis || "",
    motion: scene.motion || "zoom-in"
  }));

  return {
    hook: parsed.hook || "",
    body: parsed.body || "",
    cta: parsed.cta || "",
    full,
    wordCount,
    voiceTone: "dramatic", // default for screenplays/stories
    scenes
  };
}
