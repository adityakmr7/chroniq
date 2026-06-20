import { gemini } from "./gemini.ts";
import type { Topic } from "./topic.ts";
import type { Script } from "./script.ts";
import type { Research } from "./research.ts";
import { downloadImage } from "./visual.ts";
import { join } from "node:path";

export interface ThumbnailConcept {
  /** Full cinematic prompt for AI image-generation providers (Replicate, DALL-E, SD). */
  imagePrompt: string;
  /** 3–5 keyword stock-photo search query that is highly specific to the topic.
   *  Used for Bing/DDG image search when AI image generation is not configured. */
  searchQuery: string;
}

export async function generateThumbnailConcept(
  topic: Topic,
  script: Script,
  research: Research,
  isShort: boolean
): Promise<ThumbnailConcept> {
  const ratio = isShort ? "9:16" : "16:9";

  const prompt = `You are a world-class graphic designer for viral YouTube thumbnails and Shorts covers.
Given this topic, script, and research, produce TWO things:

1. A high-CTR AI image-generation prompt for an image generator.
2. A focused 3–5 keyword stock photo search query to find a real photograph related to this topic.

Topic: "${topic.title}"
Angle: ${topic.angle}
Script excerpt: "${script.full.slice(0, 400)}"
Research Summary: "${research.summary}"
Key entities (people, companies, products, events): ${research.timeline.slice(0, 5).map(t => `${t.event} (${t.year})`).join("; ")}

Image Prompt Rules:
- Must be high contrast, clean, one central dramatic subject.
- Mysterious or high-stakes mood.
- Aspect ratio: ${ratio}.
- Describe camera angle, lighting (e.g. dramatic chiaroscuro), subjects, background details.
- No text in the prompt.
- Avoid generic buzzwords like "photorealistic". Use style descriptors.

Search Query Rules:
- Must be 3–5 words max.
- Must reference a SPECIFIC real-world entity from the topic: a person's name, a product name, a company name, a landmark, or a well-known historical event.
- Think like a journalist: what photograph would a news photographer take to illustrate this story?
- Do NOT use abstract concepts like "dramatic storytelling" or "viral content".
- Examples of GOOD search queries: "Nokia bankruptcy 2013", "Steve Jobs NeXT computer", "Blockbuster store 1990s", "ChatGPT OpenAI logo", "Tesla Model S reveal"

Return ONLY valid JSON with this exact shape (no markdown, no extra text):
{
  "imagePrompt": "...",
  "searchQuery": "..."
}`;

  const raw = await gemini(prompt, { json: true });
  const parsed = JSON.parse(raw) as ThumbnailConcept;
  return {
    imagePrompt: (parsed.imagePrompt || "").trim(),
    searchQuery: (parsed.searchQuery || topic.title).trim(),
  };
}

/** @deprecated Use generateThumbnailConcept for better accuracy. */
export async function generateThumbnailPrompt(
  topic: Topic,
  script: Script,
  research: Research,
  isShort: boolean
): Promise<string> {
  const concept = await generateThumbnailConcept(topic, script, research, isShort);
  return concept.imagePrompt;
}

export async function generateThumbnail(
  topic: Topic,
  script: Script,
  research: Research,
  isShort: boolean,
  outputPath: string
): Promise<string> {
  console.log(`   🎨 Creating thumbnail concept...`);
  const concept = await generateThumbnailConcept(topic, script, research, isShort);
  console.log(`   🖼️  Thumbnail image prompt: "${concept.imagePrompt.slice(0, 100)}..."`);
  console.log(`   🔍 Thumbnail search query:  "${concept.searchQuery}"`);

  // Pass the specific search query as override so downloadImage uses it verbatim
  // instead of running cleanSearchQuery on the cinematic prompt (which yields generic results).
  await downloadImage(concept.imagePrompt, outputPath, isShort, concept.searchQuery);
  return concept.imagePrompt;
}

export async function generateThumbnailVariants(
  topic: Topic,
  script: Script,
  research: Research,
  isShort: boolean,
  outputDir: string
): Promise<string[]> {
  console.log(`   🎨 Creating 3 thumbnail concepts for A/B testing...`);
  
  const ratio = isShort ? "9:16" : "16:9";

  const prompt = `You are a world-class graphic designer for viral YouTube thumbnails and Shorts covers.
Given this topic, script, and research, produce THREE distinct visual concepts (A, B, and C) to A/B test which one gets the highest CTR.

Topic: "${topic.title}"
Angle: ${topic.angle}
Script excerpt: "${script.full.slice(0, 400)}"
Research Summary: "${research.summary}"

Each concept must have:
1. An AI image-generation prompt for an image generator (high contrast, single dramatic subject, mysterious or high-stakes, aspect ratio: ${ratio}, no text, no generic buzzwords).
2. A focused 3–5 keyword stock photo search query targeting a SPECIFIC real-world entity (person, company, product, place, event) related to the concept.

Make the 3 concepts distinct:
- Variant A: Focus on the main subject or face with intense emotion/lighting (e.g. extreme close up, dramatic lighting).
- Variant B: Focus on a dramatic event, action, or failure (e.g. fire, crash, collapse, neon sign, storefront).
- Variant C: Focus on a mysterious, symbolic, or abstract representation (e.g. stacks of money, a broken logo, silhouette in darkness).

Return ONLY valid JSON with this exact shape (no markdown, no extra text):
{
  "variants": [
    { "imagePrompt": "...", "searchQuery": "..." },
    { "imagePrompt": "...", "searchQuery": "..." },
    { "imagePrompt": "...", "searchQuery": "..." }
  ]
}`;

  const raw = await gemini(prompt, { json: true });
  const parsed = JSON.parse(raw) as { variants: ThumbnailConcept[] };
  const concepts = parsed.variants || [];

  // If Gemini failed or didn't return 3, fallback
  while (concepts.length < 3) {
    concepts.push({
      imagePrompt: "Cinematic dramatic scene related to " + topic.title,
      searchQuery: topic.title,
    });
  }

  const paths: string[] = [];
  for (let i = 0; i < 3; i++) {
    const filename = `thumbnail_${i}.png`;
    const outputPath = join(outputDir, filename);
    console.log(`   🖼️  Generating Variant ${i+1} with prompt: "${concepts[i].imagePrompt.slice(0, 50)}..."`);
    try {
      await downloadImage(concepts[i].imagePrompt, outputPath, isShort, concepts[i].searchQuery);
      paths.push(filename);
    } catch (err) {
      console.error(`   ❌ Failed to generate thumbnail variant ${i+1}:`, err);
      // Fallback: copy a default or skip
      paths.push(filename);
    }
  }

  return paths;
}

