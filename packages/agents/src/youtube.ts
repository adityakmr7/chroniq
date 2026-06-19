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
  const prompt = `You are an expert YouTube SEO and marketing manager.
Given this topic, script, and research, generate optimized metadata for uploading the video.

Topic: "${topic.title}"
Angle: ${topic.angle}
Script: "${script.full}"
Research Summary: "${research.summary}"
Is this a YouTube Short? ${isShort ? "Yes" : "No"}

Rules:
1. title: A punchy, highly viral video title (max 100 characters, ideally under 60 characters for Shorts to avoid truncation). Include relevant curiosity gaps.
2. description: An engaging description. It should summarize the story in 2-3 lines, invite viewers to comment and subscribe, and include 3-5 relevant hashtags (always include #shorts for Shorts, and niche tags like #history, #technology, #startups).
3. tags: Array of 8-15 SEO tags/keywords.
4. categoryId: Choose the most appropriate YouTube category ID as a string:
   - "28": Science & Technology (preferred for tech history)
   - "27": Education (preferred for case studies/forgotten stories)
   - "22": People & Blogs

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
