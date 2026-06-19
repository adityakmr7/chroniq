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

export async function initDatabase() {
  console.log("🛠️  Initializing database schema...");
  
  // Create tables if they do not exist
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
      type TEXT NOT NULL, -- 'audio', 'image', 'srt', 'ass', 'video', 'thumbnail'
      url TEXT NOT NULL
    );
  `;

  // Apply schema migration if column doesn't exist
  await sql`
    ALTER TABLE videos ADD COLUMN IF NOT EXISTS video_type TEXT DEFAULT 'short';
  `;
  await sql`
    ALTER TABLE videos ADD COLUMN IF NOT EXISTS error_message TEXT;
  `;

  console.log("✅ Database schema initialized successfully.");
}

export async function createVideo(title: string, topic: string, status = "queued", videoType = "short"): Promise<Video> {
  const [video] = await sql<Video[]>`
    INSERT INTO videos (title, topic, status, video_type)
    VALUES (${title}, ${topic}, ${status}, ${videoType})
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
  // Delete existing if any, to keep it 1-to-1
  await sql`DELETE FROM scripts WHERE video_id = ${videoId}`;

  const [script] = await sql<VideoScript[]>`
    INSERT INTO scripts (video_id, content)
    VALUES (${videoId}, ${content})
    RETURNING *
  `;
  return script;
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
  const [video] = await sql<Video[]>`
    SELECT * FROM videos WHERE id = ${id}
  `;

  if (!video) return null;

  const [script] = await sql<VideoScript[]>`
    SELECT * FROM scripts WHERE video_id = ${id}
  `;

  const assets = await sql<VideoAsset[]>`
    SELECT * FROM assets WHERE video_id = ${id}
  `;

  return {
    video,
    script: script || null,
    assets
  };
}
