import postgres from "postgres";

const databaseUrl = process.env.DATABASE_URL || "postgres://postgres:postgres@localhost:5432/postgres";
export const sql = postgres(databaseUrl);

export interface Video {
  id: string;
  title: string;
  topic: string;
  status: string;
  duration: number | null;
  youtube_url: string | null;
  video_type?: string;
  error_message?: string | null;
  scene_manifest?: string | null;
  tts_provider?: string | null;  // 'edge' | 'local' | 'cloud'
  voice_id?: string | null;       // provider-specific voice ID
  language?: string | null;       // 'en' | 'hi' etc.
  created_at: Date;
}

export interface VideoScript {
  id: string;
  video_id: string;
  content: string;
}

export interface VideoAsset {
  id: string;
  video_id: string;
  type: string;
  url: string;
}

export interface SceneManifest {
  index: number;
  filename: string;
  duration: number;
  imagePrompt: string;
  searchQuery?: string;
}

export async function initDatabase() {
  console.log("🛠️  Initializing database schema...");
  
  await sql`
    CREATE TABLE IF NOT EXISTS videos (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      title TEXT NOT NULL,
      topic TEXT NOT NULL,
      status TEXT NOT NULL,
      duration NUMERIC,
      youtube_url TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS scripts (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      content TEXT NOT NULL
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS assets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      url TEXT NOT NULL
    );
  `;

  // Schema migrations
  await sql`ALTER TABLE videos ADD COLUMN IF NOT EXISTS video_type TEXT DEFAULT 'short';`;
  await sql`ALTER TABLE videos ADD COLUMN IF NOT EXISTS error_message TEXT;`;
  await sql`ALTER TABLE videos ADD COLUMN IF NOT EXISTS scene_manifest TEXT;`;
  await sql`ALTER TABLE videos ADD COLUMN IF NOT EXISTS tts_provider TEXT DEFAULT 'local';`;
  await sql`ALTER TABLE videos ADD COLUMN IF NOT EXISTS voice_id TEXT;`;
  await sql`ALTER TABLE videos ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'en';`;

  console.log("✅ Database schema initialized successfully.");
}

export async function createVideo(
  title: string,
  topic: string,
  status = "queued",
  videoType = "short",
  ttsProvider = "local",
  voiceId: string | null = null,
  language = "en"
): Promise<Video> {
  const [video] = await sql<Video[]>`
    INSERT INTO videos (title, topic, status, video_type, tts_provider, voice_id, language)
    VALUES (${title}, ${topic}, ${status}, ${videoType}, ${ttsProvider}, ${voiceId}, ${language})
    RETURNING *
  `;
  return video;
}

export async function updateVideoStatus(
  id: string,
  status: string,
  duration?: number,
  youtubeUrl?: string,
  errorMessage?: string
): Promise<Video> {
  const [video] = await sql<Video[]>`
    UPDATE videos
    SET 
      status = ${status},
      duration = COALESCE(${duration ?? null}, duration),
      youtube_url = COALESCE(${youtubeUrl ?? null}, youtube_url),
      error_message = ${status === "failed" ? (errorMessage || "Unknown error") : null}
    WHERE id = ${id}
    RETURNING *
  `;
  return video;
}

export async function saveScript(videoId: string, content: string): Promise<VideoScript> {
  await sql`DELETE FROM scripts WHERE video_id = ${videoId}`;
  const [script] = await sql<VideoScript[]>`
    INSERT INTO scripts (video_id, content)
    VALUES (${videoId}, ${content})
    RETURNING *
  `;
  return script;
}

export async function updateScript(videoId: string, content: string): Promise<VideoScript> {
  // Upsert: update if exists, insert if not
  await sql`DELETE FROM scripts WHERE video_id = ${videoId}`;
  const [script] = await sql<VideoScript[]>`
    INSERT INTO scripts (video_id, content)
    VALUES (${videoId}, ${content})
    RETURNING *
  `;
  return script;
}

export async function saveSceneManifest(videoId: string, scenes: SceneManifest[]): Promise<void> {
  await sql`
    UPDATE videos SET scene_manifest = ${JSON.stringify(scenes)} WHERE id = ${videoId}
  `;
}

/** Called from the dashboard: queues the render phase job */
export async function approveVideo(videoId: string): Promise<Video> {
  const [video] = await sql<Video[]>`
    UPDATE videos SET status = 'approved' WHERE id = ${videoId} RETURNING *
  `;
  return video;
}

/** Called from dashboard reject: resets back to draft for re-generation */
export async function updateVideoVoiceSettings(
  id: string,
  ttsProvider: string,
  voiceId: string | null,
  language: string
): Promise<Video> {
  const [video] = await sql<Video[]>`
    UPDATE videos
    SET 
      tts_provider = ${ttsProvider},
      voice_id = ${voiceId},
      language = ${language}
    WHERE id = ${id}
    RETURNING *
  `;
  return video;
}

export async function rejectVideo(videoId: string): Promise<Video> {
  const [video] = await sql<Video[]>`
    UPDATE videos SET status = 'queued', scene_manifest = NULL WHERE id = ${videoId} RETURNING *
  `;
  return video;
}

export async function addAsset(videoId: string, type: string, url: string): Promise<VideoAsset> {
  const [asset] = await sql<VideoAsset[]>`
    INSERT INTO assets (video_id, type, url)
    VALUES (${videoId}, ${type}, ${url})
    RETURNING *
  `;
  return asset;
}

export async function getVideos(): Promise<Video[]> {
  return await sql<Video[]>`
    SELECT * FROM videos
    ORDER BY created_at DESC
  `;
}

export async function getVideoDetails(id: string): Promise<{
  video: Video;
  script: VideoScript | null;
  assets: VideoAsset[];
} | null> {
  const [video] = await sql<Video[]>`SELECT * FROM videos WHERE id = ${id}`;
  if (!video) return null;

  const [script] = await sql<VideoScript[]>`SELECT * FROM scripts WHERE video_id = ${id}`;
  const assets = await sql<VideoAsset[]>`SELECT * FROM assets WHERE video_id = ${id}`;

  return { video, script: script || null, assets };
}
