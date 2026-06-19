import { gemini } from "./gemini.ts";
import type { Topic } from "./topic.ts";
import type { Script } from "./script.ts";
import type { Research } from "./research.ts";
import { downloadImage } from "./visual.ts";

export async function generateThumbnailPrompt(
  topic: Topic,
  script: Script,
  research: Research,
  isShort: boolean
): Promise<string> {
  const ratio = isShort ? "9:16" : "16:9";
  
  const prompt = `You are a world-class graphic designer for viral YouTube thumbnails and Shorts covers.
Given this topic, script, and research, design a high-click-through-rate (CTR) thumbnail prompt for an AI image generator.

Topic: "${topic.title}"
Angle: ${topic.angle}
Script: "${script.full}"
Research Summary: "${research.summary}"

Rules:
1. The thumbnail must be high contrast, clean, and focus on one central dramatic subject.
2. It should have a mysterious or high-stakes mood.
3. The prompt should specify the aspect ratio: ${ratio}.
4. Describe camera angle, lighting (e.g. dramatic chiaroscuro), subjects, and background details.
5. Do not include text in the prompt itself (text overlays are added later).
6. Avoid buzzwords like "photorealistic". Describe the visual style (e.g. "detailed cinematic photograph, 35mm lens, corporate drama styling").

Return ONLY the final detailed prompt as plain text. Do not return JSON or markdown.`;

  const rawPrompt = await gemini(prompt);
  return rawPrompt.trim();
}

export async function generateThumbnail(
  topic: Topic,
  script: Script,
  research: Research,
  isShort: boolean,
  outputPath: string
): Promise<string> {
  console.log(`   🎨 Creating thumbnail concept...`);
  const imagePrompt = await generateThumbnailPrompt(topic, script, research, isShort);
  console.log(`   🖼️  Thumbnail Prompt: "${imagePrompt}"`);
  
  await downloadImage(imagePrompt, outputPath);
  return imagePrompt;
}
