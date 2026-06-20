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
  youtube_video_id?: string | null;
  thumbnail_variants?: string | null;
  use_custom_script?: boolean | null;  // skip AI script generation
  custom_script?: string | null;       // user-provided narration text
  captions_enabled?: boolean | null;   // show/hide subtitles in rendered video
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
  sceneType?: string;
  headline?: string;
  emphasis?: string;
  motion?: string;
}

export interface Schedule {
  id: string;
  video_id: string;
  publish_at: Date;
  status: "pending" | "published" | "failed";
  error?: string | null;
  created_at: Date;
}

export interface VideoAnalytics {
  id: string;
  video_id: string;
  youtube_video_id: string;
  views: number;
  likes: number;
  comments: number;
  ctr: number | null;             // click-through rate %
  avg_view_duration: number | null; // seconds
  fetched_at: Date;
}

export interface ChannelSetting {
  key: string;
  value: string;
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

  await sql`
    CREATE TABLE IF NOT EXISTS trending_topics (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      date DATE UNIQUE NOT NULL DEFAULT CURRENT_DATE,
      topics TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
  `;

  // ── New tables ──────────────────────────────────────────────────────────────

  await sql`
    CREATE TABLE IF NOT EXISTS schedules (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      publish_at TIMESTAMP NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      error TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS video_analytics (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      youtube_video_id TEXT NOT NULL,
      views INTEGER NOT NULL DEFAULT 0,
      likes INTEGER NOT NULL DEFAULT 0,
      comments INTEGER NOT NULL DEFAULT 0,
      ctr NUMERIC,
      avg_view_duration NUMERIC,
      fetched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
  `;

  await sql`
    CREATE TABLE IF NOT EXISTS channel_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
    );
  `;

  // Add youtube_video_id column to videos if not exists
  await sql`ALTER TABLE videos ADD COLUMN IF NOT EXISTS youtube_video_id TEXT;`;
  await sql`ALTER TABLE videos ADD COLUMN IF NOT EXISTS thumbnail_variants TEXT;`;

  // Custom script + caption toggle columns
  await sql`ALTER TABLE videos ADD COLUMN IF NOT EXISTS use_custom_script BOOLEAN DEFAULT FALSE;`;
  await sql`ALTER TABLE videos ADD COLUMN IF NOT EXISTS custom_script TEXT;`;
  await sql`ALTER TABLE videos ADD COLUMN IF NOT EXISTS captions_enabled BOOLEAN DEFAULT TRUE;`;

  console.log("✅ Database schema initialized successfully.");
}

export async function createVideo(
  title: string,
  topic: string,
  status = "queued",
  videoType = "short",
  ttsProvider = "local",
  voiceId: string | null = null,
  language = "en",
  useCustomScript = false,
  customScript: string | null = null,
  captionsEnabled = true
): Promise<Video> {
  const [video] = await sql<Video[]>`
    INSERT INTO videos (title, topic, status, video_type, tts_provider, voice_id, language, use_custom_script, custom_script, captions_enabled)
    VALUES (${title}, ${topic}, ${status}, ${videoType}, ${ttsProvider}, ${voiceId}, ${language}, ${useCustomScript}, ${customScript}, ${captionsEnabled})
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

export async function deleteVideoRecord(id: string): Promise<void> {
  await sql`DELETE FROM videos WHERE id = ${id}`;
}

export async function getTrendingTopics(date: string): Promise<any[] | null> {
  const [row] = await sql<{ topics: string }[]>`
    SELECT topics FROM trending_topics WHERE date = ${date}
  `;
  if (!row) return null;
  return JSON.parse(row.topics);
}

export async function saveTrendingTopics(date: string, topics: any[]): Promise<void> {
  const jsonStr = JSON.stringify(topics);
  await sql`
    INSERT INTO trending_topics (date, topics)
    VALUES (${date}, ${jsonStr})
    ON CONFLICT (date) DO UPDATE SET topics = EXCLUDED.topics
  `;
}

// ── Schedule helpers ──────────────────────────────────────────────────────────

export async function scheduleVideo(videoId: string, publishAt: Date): Promise<Schedule> {
  // Remove any existing pending schedule for this video first
  await sql`DELETE FROM schedules WHERE video_id = ${videoId} AND status = 'pending'`;
  const [schedule] = await sql<Schedule[]>`
    INSERT INTO schedules (video_id, publish_at, status)
    VALUES (${videoId}, ${publishAt.toISOString()}, 'pending')
    RETURNING *
  `;
  return schedule;
}

export async function cancelSchedule(videoId: string): Promise<void> {
  await sql`DELETE FROM schedules WHERE video_id = ${videoId} AND status = 'pending'`;
}

export async function getPendingSchedules(): Promise<(Schedule & { video: Video })[]> {
  const rows = await sql<(Schedule & Video)[]>`
    SELECT s.*, v.title, v.topic, v.status AS video_status, v.youtube_url, v.created_at AS video_created_at,
           v.video_type, v.tts_provider, v.voice_id, v.language, v.scene_manifest, v.error_message
    FROM schedules s
    JOIN videos v ON s.video_id = v.id
    WHERE s.status = 'pending' AND s.publish_at <= NOW()
    ORDER BY s.publish_at ASC
  `;
  return rows.map(r => ({
    id: r.id,
    video_id: r.video_id,
    publish_at: r.publish_at,
    status: r.status as Schedule['status'],
    error: r.error ?? null,
    created_at: r.created_at,
    video: {
      id: r.video_id,
      title: r.title,
      topic: r.topic,
      status: (r as any).video_status,
      duration: (r as any).duration ?? null,
      youtube_url: r.youtube_url,
      video_type: r.video_type,
      tts_provider: r.tts_provider,
      voice_id: r.voice_id,
      language: r.language,
      scene_manifest: r.scene_manifest,
      error_message: r.error_message,
      created_at: (r as any).video_created_at ?? r.created_at,
    },
  }));
}

export async function getAllSchedules(): Promise<(Schedule & { video_title: string })[]> {
  return await sql<(Schedule & { video_title: string })[]>`
    SELECT s.*, v.title AS video_title
    FROM schedules s
    JOIN videos v ON s.video_id = v.id
    ORDER BY s.publish_at ASC
  `;
}

export async function markSchedulePublished(scheduleId: string): Promise<void> {
  await sql`UPDATE schedules SET status = 'published' WHERE id = ${scheduleId}`;
}

export async function markScheduleFailed(scheduleId: string, error: string): Promise<void> {
  await sql`UPDATE schedules SET status = 'failed', error = ${error} WHERE id = ${scheduleId}`;
}

export async function setVideoYouTubeId(videoId: string, youtubeVideoId: string): Promise<void> {
  await sql`UPDATE videos SET youtube_video_id = ${youtubeVideoId} WHERE id = ${videoId}`;
}

// ── Analytics helpers ─────────────────────────────────────────────────────────

export async function upsertVideoAnalytics(data: {
  videoId: string;
  youtubeVideoId: string;
  views: number;
  likes: number;
  comments: number;
  ctr?: number | null;
  avgViewDuration?: number | null;
}): Promise<void> {
  await sql`
    INSERT INTO video_analytics
      (video_id, youtube_video_id, views, likes, comments, ctr, avg_view_duration, fetched_at)
    VALUES
      (${data.videoId}, ${data.youtubeVideoId}, ${data.views}, ${data.likes}, ${data.comments},
       ${data.ctr ?? null}, ${data.avgViewDuration ?? null}, NOW())
    ON CONFLICT DO NOTHING
  `;
  // Always insert a fresh row so we have history; prune old rows beyond 30
  await sql`
    DELETE FROM video_analytics
    WHERE video_id = ${data.videoId}
      AND id NOT IN (
        SELECT id FROM video_analytics WHERE video_id = ${data.videoId}
        ORDER BY fetched_at DESC LIMIT 30
      )
  `;
}

export async function getLatestAnalytics(videoId: string): Promise<VideoAnalytics | null> {
  const [row] = await sql<VideoAnalytics[]>`
    SELECT * FROM video_analytics WHERE video_id = ${videoId}
    ORDER BY fetched_at DESC LIMIT 1
  `;
  return row || null;
}

export async function getAllAnalyticsSummary(): Promise<VideoAnalytics[]> {
  return await sql<VideoAnalytics[]>`
    SELECT DISTINCT ON (video_id) *
    FROM video_analytics
    ORDER BY video_id, fetched_at DESC
  `;
}

export async function getVideosWithYouTubeIds(): Promise<Video[]> {
  return await sql<Video[]>`
    SELECT * FROM videos WHERE youtube_video_id IS NOT NULL AND status = 'completed'
  `;
}

// ── Channel Settings helpers ──────────────────────────────────────────────────

export async function getChannelSetting(key: string): Promise<string | null> {
  const [row] = await sql<{ value: string }[]>`
    SELECT value FROM channel_settings WHERE key = ${key}
  `;
  return row?.value ?? null;
}

export async function setChannelSetting(key: string, value: string): Promise<void> {
  await sql`
    INSERT INTO channel_settings (key, value)
    VALUES (${key}, ${value})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;
}

export async function getAllChannelSettings(): Promise<Record<string, string>> {
  const rows = await sql<{ key: string; value: string }[]>`SELECT key, value FROM channel_settings`;
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

export async function saveThumbnailVariants(videoId: string, variants: string[]): Promise<void> {
  await sql`UPDATE videos SET thumbnail_variants = ${JSON.stringify(variants)} WHERE id = ${videoId}`;
}
