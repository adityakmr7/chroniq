import { gemini } from "./gemini.ts";
import type { Topic } from "./topic.ts";
import type { Script } from "./script.ts";
import type { Research } from "./research.ts";

export interface YouTubeMetadata {
  title: string;
  description: string;
  tags: string[];
  categoryId: string;
}

export async function generateYouTubeMetadata(
  topic: Topic,
  script: Script,
  research: Research,
  isShort: boolean
): Promise<YouTubeMetadata> {
  const prompt = `You are a top YouTube SEO strategist who has grown channels to 1M+ subscribers.
Generate viral, highly optimized YouTube metadata for this video.

Topic: "${topic.title}"
Angle: ${topic.angle}
Script: "${script.full}"
Research Summary: "${research.summary}"
Is this a YouTube Short? ${isShort ? "Yes" : "No"}

Title Rules (CRITICAL — this is the most important CTR factor):
- Use ONE of these proven viral title formulas:
  a) "Why [Company/Person] [Dramatic Verb] (And Nobody Saw It Coming)"
  b) "The [Shocking Number/Metric] That [Destroyed/Built] [Company/Person]"
  c) "How [Person/Company] [Achieved/Lost] [Thing] In [Short Time]"
  d) "The Real Reason [Company/Person] [Failed/Succeeded]"
  e) "[Company/Person] [Shocking Verb]: The Story Nobody Tells"
- Max 65 characters (avoids truncation in mobile feed).
- Include a power word: Collapsed, Exposed, Destroyed, Revealed, Untold, Secret, Shocking, Hidden.
- For Shorts: append " #shorts" at the end IF it still fits in 65 chars, otherwise skip it.

Description Rules:
- First 2 lines = hook sentence from the script (displayed in feed preview WITHOUT clicking — this is critical).
- Line 3: Empty line for breathing room.
- Lines 4-6: 2-3 sentence story summary.
- Line 7: "Follow for daily stories like this."
- Final lines: 5-8 hashtags (always include #shorts if Short, plus 2 broad: #business #history, plus 2 niche based on the topic).

Tags Rules:
- Generate 15-20 SEO tags.
- Mix 3 tiers: (1) broad keywords (e.g. "business history", "startup failure"), (2) mid-tail (e.g. "nokia bankruptcy story"), (3) long-tail (e.g. "why nokia failed documentary short").
- Always include the topic title as a tag.

categoryId:
- "28": Science & Technology (tech history, AI, software)
- "27": Education (business cases, historical events, forgotten stories)
- "22": People & Blogs (personality-driven stories)

Return ONLY JSON matching:
{
  "title": string,
  "description": string,
  "tags": string[],
  "categoryId": string
}`;

  const raw = await gemini(prompt, { json: true });
  return JSON.parse(raw) as YouTubeMetadata;
}

export async function getAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    throw new Error(`Failed to refresh YouTube access token: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

export async function uploadVideo(
  accessToken: string,
  filePath: string,
  metadata: YouTubeMetadata
): Promise<string> {
  const file = Bun.file(filePath);
  const fileData = await file.arrayBuffer();

  const metadataPart = JSON.stringify({
    snippet: {
      title: metadata.title,
      description: metadata.description,
      tags: metadata.tags,
      categoryId: metadata.categoryId,
      defaultLanguage: "en",
    },
    status: {
      privacyStatus: "unlisted", // Upload as unlisted so the user can verify it first
      selfDeclaredMadeForKids: false,
    },
  });

  const boundary = "314159265358979323846";
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--\r\n`;

  const bodyParts = [
    Buffer.from(delimiter),
    Buffer.from('Content-Type: application/json; charset=UTF-8\r\n\r\n'),
    Buffer.from(metadataPart),
    Buffer.from(delimiter),
    Buffer.from('Content-Type: video/mp4\r\n\r\n'),
    Buffer.from(fileData),
    Buffer.from(closeDelimiter)
  ];

  const body = Buffer.concat(bodyParts);

  const endpoint = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=multipart&part=snippet,status";
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "Content-Length": String(body.byteLength),
    },
    body: body,
  });

  if (!res.ok) {
    throw new Error(`YouTube video upload failed: ${res.status} ${await res.text()}`);
  }

  const data = (await res.json()) as { id: string };
  return data.id;
}

export async function uploadThumbnail(
  accessToken: string,
  videoId: string,
  thumbnailPath: string
): Promise<void> {
  const file = Bun.file(thumbnailPath);
  const fileData = await file.arrayBuffer();

  const endpoint = `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${videoId}`;
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "image/png",
    },
    body: fileData,
  });

  if (!res.ok) {
    throw new Error(`YouTube thumbnail upload failed: ${res.status} ${await res.text()}`);
  }
}
