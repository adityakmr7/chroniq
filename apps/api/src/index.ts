import { Queue } from "bullmq";
import {
  initDatabase,
  createVideo,
  getVideos,
  getVideoDetails,
  approveVideo,
  rejectVideo,
  updateScript,
  updateVideoVoiceSettings,
  saveSceneManifest,
  deleteVideoRecord,
  getTrendingTopics,
  saveTrendingTopics,
  scheduleVideo,
  cancelSchedule,
  getAllSchedules,
  getLatestAnalytics,
  getAllAnalyticsSummary,
  setChannelSetting,
  getAllChannelSettings,
  saveThumbnailVariants,
  sql,
} from "@chroniq/db";
import {
  generateVoice,
  generateASS,
  generateSRT,
  ALL_VOICES,
  generateDailyTrendingTopics,
  downloadImage,
  generateThumbnailVariants,
  settingsToBranding,
  brandingToSettings,
} from "@chroniq/agents";
import { join } from "node:path";
import { rm, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const PORT = parseInt(process.env.PORT || "3000");
const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379");

// Initialize BullMQ Queue
const videoQueue = new Queue("video-generation", {
  connection: {
    host: REDIS_HOST,
    port: REDIS_PORT,
  },
});

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function startServer() {
  console.log("🚀 Initializing database connection for API...");
  await initDatabase();

  Bun.serve({
    port: PORT,
    idleTimeout: 120, // Allow up to 2 minutes for LLM generation
    async fetch(req) {
      const url = new URL(req.url);
      
      // CORS preflight requests
      if (req.method === "OPTIONS") {
        return new Response(null, {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
          },
        });
      }

      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Content-Type": "application/json",
      };

      try {
        // --- Endpoints ---

        // 1. Serving output assets locally
        if (url.pathname.startsWith("/assets/")) {
          const relativePath = url.pathname.replace("/assets/", "");
          const filePath = join(process.cwd(), "output", relativePath);
          const file = Bun.file(filePath);
          if (!(await file.exists())) {
            return new Response(JSON.stringify({ error: "File not found" }), {
              status: 404,
              headers: corsHeaders,
            });
          }
          
          // Determine content type
          let contentType = "application/octet-stream";
          if (filePath.endsWith(".mp4")) contentType = "video/mp4";
          else if (filePath.endsWith(".mp3")) contentType = "audio/mpeg";
          else if (filePath.endsWith(".png")) contentType = "image/png";
          else if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) contentType = "image/jpeg";
          else if (filePath.endsWith(".ass") || filePath.endsWith(".srt") || filePath.endsWith(".txt")) contentType = "text/plain";

          return new Response(file, {
            headers: {
              "Access-Control-Allow-Origin": "*",
              "Content-Type": contentType,
            },
          });
        }

        // 2. GET /api/videos - list all videos
        if (url.pathname === "/api/videos" && req.method === "GET") {
          const videos = await getVideos();
          return new Response(JSON.stringify(videos), { headers: corsHeaders });
        }

        // 3. GET /api/videos/:id - details of a single video
        if (url.pathname.startsWith("/api/videos/") && !url.pathname.includes("/approve") && !url.pathname.includes("/reject") && !url.pathname.includes("/script") && req.method === "GET") {
          const id = url.pathname.replace("/api/videos/", "");
          const details = await getVideoDetails(id);
          if (!details) {
            return new Response(JSON.stringify({ error: "Video not found" }), {
              status: 404,
              headers: corsHeaders,
            });
          }
          return new Response(JSON.stringify(details), { headers: corsHeaders });
        }

        // 4a. POST /api/videos/:id/approve — HITL: approve and queue render job
        if (url.pathname.match(/^\/api\/videos\/[^/]+\/approve$/) && req.method === "POST") {
          const id = url.pathname.replace("/api/videos/", "").replace("/approve", "");
          await approveVideo(id);
          // Queue the render job
          await videoQueue.add(
            "render-video",
            { videoId: id },
            { removeOnComplete: true, removeOnFail: false }
          );
          return new Response(JSON.stringify({ success: true, status: "approved" }), { headers: corsHeaders });
        }

        // 4b. POST /api/videos/:id/reject — HITL: reject, reset to queued for re-generation
        if (url.pathname.match(/^\/api\/videos\/[^/]+\/reject$/) && req.method === "POST") {
          const id = url.pathname.replace("/api/videos/", "").replace("/reject", "");
          await rejectVideo(id);
          // Re-queue generation job
          const details = await getVideoDetails(id);
          if (details) {
            await videoQueue.add(
              "generate-video",
              { videoId: id, category: details.video.topic, mock: false, videoType: details.video.video_type || "short" },
              { removeOnComplete: true, removeOnFail: false }
            );
          }
          return new Response(JSON.stringify({ success: true, status: "queued" }), { headers: corsHeaders });
        }

        // 4c. PATCH /api/videos/:id/script — update script before render
        if (url.pathname.match(/^\/api\/videos\/[^/]+\/script$/) && req.method === "PATCH") {
          const id = url.pathname.replace("/api/videos/", "").replace("/script", "");
          const body = (await req.json()) as { content: string };
          if (!body.content) {
            return new Response(JSON.stringify({ error: "Missing content" }), { status: 400, headers: corsHeaders });
          }
          await updateScript(id, body.content);
          return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        }

        // 4. POST /api/videos - queue a new video generation
        if (url.pathname === "/api/videos" && req.method === "POST") {
          const body = (await req.json()) as {
            title: string;
            topic: string;
            mock?: boolean;
            videoType?: string;
            ttsProvider?: string;
            voiceId?: string;
            language?: string;
            useCustomScript?: boolean;
            customScript?: string;
            captionsEnabled?: boolean;
          };

          if (!body.title || !body.topic) {
            return new Response(
              JSON.stringify({ error: "Missing required fields: title, topic" }),
              { status: 400, headers: corsHeaders }
            );
          }

          // Insert video record into database
          const videoType = body.videoType || "short";
          const ttsProvider = body.ttsProvider || "local";
          const voiceId = body.voiceId || null;
          const language = body.language || "en";
          const useCustomScript = body.useCustomScript ?? false;
          const customScript = body.customScript || null;
          const captionsEnabled = body.captionsEnabled ?? true;
          
          const video = await createVideo(
            body.title,
            body.topic,
            "queued",
            videoType,
            ttsProvider,
            voiceId,
            language,
            useCustomScript,
            customScript,
            captionsEnabled
          );

          // Push job to BullMQ queue
          const job = await videoQueue.add(
            "generate-video",
            {
              videoId: video.id,
              category: body.topic,
              mock: body.mock ?? false,
              videoType: video.video_type || "short",
            },
            {
              removeOnComplete: true,
              removeOnFail: false,
            }
          );

          return new Response(
            JSON.stringify({
              success: true,
              video,
              jobId: job.id,
            }),
            { status: 201, headers: corsHeaders }
          );
        }

        // 4d. POST /api/videos/:id/regenerate-voice
        if (url.pathname.match(/^\/api\/videos\/[^/]+\/regenerate-voice$/) && req.method === "POST") {
          const id = url.pathname.replace("/api/videos/", "").replace("/regenerate-voice", "");
          const body = (await req.json()) as {
            content: string;
            ttsProvider?: string;
            voiceId?: string;
            language?: string;
          };

          if (!body.content) {
            return new Response(JSON.stringify({ error: "Missing content" }), { status: 400, headers: corsHeaders });
          }

          // 1. Update script in DB
          await updateScript(id, body.content);

          // 2. Fetch video details
          const details = await getVideoDetails(id);
          if (!details) {
            return new Response(JSON.stringify({ error: "Video not found" }), { status: 404, headers: corsHeaders });
          }

          // 3. Update voice settings if provided
          const ttsProvider = body.ttsProvider || details.video.tts_provider || "local";
          const voiceId = body.voiceId !== undefined ? body.voiceId : (details.video.voice_id ?? null);
          const language = body.language || details.video.language || "en";
          await updateVideoVoiceSettings(id, ttsProvider, voiceId, language);

          // 4. Generate new audio + alignments
          const slug = slugify(details.video.title);
          console.log(`🎙️ Regenerating voice for video ${id} (${slug})...`);
          
          const voiceResult = await generateVoice(
            body.content,
            true,
            ttsProvider,
            voiceId || undefined
          );

          const newDuration = voiceResult.alignments && voiceResult.alignments.length > 0 
            ? voiceResult.alignments[voiceResult.alignments.length - 1].end 
            : 30.0;

          // 5. Write new audio and alignment files to disk
          const outputDir = join(process.cwd(), "output", slug);
          const narrationPath = join(outputDir, "narration.mp3");
          const alignmentsPath = join(outputDir, "alignments.json");

          await Bun.write(narrationPath, voiceResult.audioBuffer);
          await Bun.write(alignmentsPath, JSON.stringify(voiceResult.alignments || []));

          // 6. Generate caption files
          const assContent = generateASS(voiceResult.alignments || []);
          const srtContent = generateSRT(voiceResult.alignments || []);
          await Bun.write(join(outputDir, "captions.ass"), assContent);
          await Bun.write(join(outputDir, "captions.srt"), srtContent);

          // 7. Rescale scenes duration
          const oldSceneManifest = details.video.scene_manifest 
            ? JSON.parse(details.video.scene_manifest) 
            : [];

          if (oldSceneManifest.length > 0) {
            const oldDuration = oldSceneManifest.reduce((sum: number, s: any) => sum + s.duration, 0) || 30.0;
            const scaleFactor = newDuration / oldDuration;
            let sum = 0;
            
            for (let i = 0; i < oldSceneManifest.length; i++) {
              if (i === oldSceneManifest.length - 1) {
                oldSceneManifest[i].duration = Math.round((newDuration - sum) * 100) / 100;
              } else {
                oldSceneManifest[i].duration = Math.round((oldSceneManifest[i].duration * scaleFactor) * 100) / 100;
                sum += oldSceneManifest[i].duration;
              }
            }
            await saveSceneManifest(id, oldSceneManifest);
          }

          return new Response(JSON.stringify({
            success: true,
            duration: newDuration,
            ttsProvider,
            voiceId,
            language
          }), { headers: corsHeaders });
        }

        // 4e. GET /api/voices - get voice catalog
        if (url.pathname === "/api/voices" && req.method === "GET") {
          return new Response(JSON.stringify(ALL_VOICES), { headers: corsHeaders });
        }

        // 4f. POST /api/videos/:id/scenes/:index/image - upload custom image for a scene
        if (url.pathname.match(/^\/api\/videos\/[^/]+\/scenes\/\d+\/image$/) && req.method === "POST") {
          const parts = url.pathname.split("/");
          const id = parts[3];
          const sceneIndex = parseInt(parts[5]);

          const details = await getVideoDetails(id);
          if (!details) {
            return new Response(JSON.stringify({ error: "Video not found" }), { status: 404, headers: corsHeaders });
          }

          const formData = await req.formData();
          const imageFile = formData.get("image") as File;
          if (!imageFile) {
            return new Response(JSON.stringify({ error: "No image file provided" }), { status: 400, headers: corsHeaders });
          }

          const slug = slugify(details.video.title);
          const outputDir = join(process.cwd(), "output", slug);
          const filename = `scene_${sceneIndex}.jpg`;
          const filePath = join(outputDir, filename);

          // Write file to output folder
          await Bun.write(filePath, await imageFile.arrayBuffer());

          return new Response(JSON.stringify({ success: true, filename }), { headers: corsHeaders });
        }

        // GET /api/videos/:id/metadata - read youtube metadata from output folder
        if (url.pathname.match(/^\/api\/videos\/[^/]+\/metadata$/) && req.method === "GET") {
          const id = url.pathname.split("/")[3];
          const details = await getVideoDetails(id);
          if (!details) return new Response(JSON.stringify({ error: "Video not found" }), { status: 404, headers: corsHeaders });
          const slug = slugify(details.video.title);
          const metaPath = join(process.cwd(), "output", slug, "youtube_meta.json");
          if (!existsSync(metaPath)) return new Response(JSON.stringify({}), { headers: corsHeaders });
          const raw = await readFile(metaPath, "utf-8");
          const meta = JSON.parse(raw);
          return new Response(JSON.stringify(meta.ytMetadata || meta), { headers: corsHeaders });
        }

        // PATCH /api/videos/:id/metadata - save edited youtube metadata
        if (url.pathname.match(/^\/api\/videos\/[^/]+\/metadata$/) && req.method === "PATCH") {
          const id = url.pathname.split("/")[3];
          const details = await getVideoDetails(id);
          if (!details) return new Response(JSON.stringify({ error: "Video not found" }), { status: 404, headers: corsHeaders });
          const slug = slugify(details.video.title);
          const metaPath = join(process.cwd(), "output", slug, "youtube_meta.json");
          const body = await req.json() as { title?: string; description?: string; tags?: string[] };
          // Merge into existing meta file
          let existing: any = {};
          if (existsSync(metaPath)) {
            existing = JSON.parse(await readFile(metaPath, "utf-8"));
          }
          const ytMeta = existing.ytMetadata || existing;
          ytMeta.title = body.title ?? ytMeta.title;
          ytMeta.description = body.description ?? ytMeta.description;
          ytMeta.tags = body.tags ?? ytMeta.tags;
          if (existing.ytMetadata) {
            existing.ytMetadata = ytMeta;
          } else {
            existing = ytMeta;
          }
          await writeFile(metaPath, JSON.stringify(existing, null, 2), "utf-8");
          return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        }

        // POST /api/videos/:id/scenes/:index/regenerate - re-run image search for one scene
        if (url.pathname.match(/^\/api\/videos\/[^/]+\/scenes\/\d+\/regenerate$/) && req.method === "POST") {
          const parts = url.pathname.split("/");
          const id = parts[3];
          const sceneIndex = parseInt(parts[5]);
          const details = await getVideoDetails(id);
          if (!details) return new Response(JSON.stringify({ error: "Video not found" }), { status: 404, headers: corsHeaders });
          const slug = slugify(details.video.title);
          const outputDir = join(process.cwd(), "output", slug);
          // Load scene manifest to get the searchQuery for this scene
          const manifest: any[] = details.video.scene_manifest ? JSON.parse(details.video.scene_manifest) : [];
          const scene = manifest.find((s: any) => s.index === sceneIndex);
          if (!scene) return new Response(JSON.stringify({ error: "Scene not found" }), { status: 404, headers: corsHeaders });
          const isShort = (details.video.video_type || "short") === "short";
          const scenePath = join(outputDir, `scene_${sceneIndex}.jpg`);
          // Re-run image download with the scene's searchQuery
          await downloadImage(scene.imagePrompt || scene.searchQuery || "documentary scene", scenePath, isShort, scene.searchQuery);
          return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        }

        // DELETE /api/videos/:id - delete video and files
        if (url.pathname.startsWith("/api/videos/") && req.method === "DELETE") {
          const id = url.pathname.replace("/api/videos/", "");
          const details = await getVideoDetails(id);
          if (!details) {
            return new Response(JSON.stringify({ error: "Video not found" }), { status: 404, headers: corsHeaders });
          }

          // 1. Delete output files
          const slug = slugify(details.video.title);
          const outputDir = join(process.cwd(), "output", slug);
          try {
            await rm(outputDir, { recursive: true, force: true });
            console.log(`🗑️ Deleted output folder for deleted video: ${outputDir}`);
          } catch (e: any) {
            console.warn(`⚠️ Warning: could not delete output folder: ${e.message}`);
          }

          // 2. Delete database record
          await deleteVideoRecord(id);
          return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        }

        // GET /api/trending-topics - get daily trending topics
        if (url.pathname === "/api/trending-topics" && req.method === "GET") {
          // Format date as YYYY-MM-DD in local time
          const now = new Date();
          const offset = now.getTimezoneOffset();
          const localDate = new Date(now.getTime() - (offset * 60 * 1000));
          const dateStr = localDate.toISOString().split('T')[0];

          console.log(`🔥 Fetching trending topics for date: ${dateStr}`);
          let topics = await getTrendingTopics(dateStr);
          if (!topics || topics.length === 0) {
            console.log(`🔥 No cached topics for ${dateStr}. Generating new ones...`);
            topics = await generateDailyTrendingTopics(dateStr);
            if (topics && topics.length > 0) {
              await saveTrendingTopics(dateStr, topics);
            }
          }
          return new Response(JSON.stringify(topics), { headers: corsHeaders });
        }

        // --- Schedule Routes ---
        
        // GET /api/schedules - get all schedules
        if (url.pathname === "/api/schedules" && req.method === "GET") {
          const schedules = await getAllSchedules();
          return new Response(JSON.stringify(schedules), { headers: corsHeaders });
        }

        // POST /api/videos/:id/schedule - schedule a video
        if (url.pathname.match(/^\/api\/videos\/[^/]+\/schedule$/) && req.method === "POST") {
          const id = url.pathname.split("/")[3];
          const body = await req.json() as { publishAt: string };
          if (!body.publishAt) {
            return new Response(JSON.stringify({ error: "Missing publishAt date" }), { status: 400, headers: corsHeaders });
          }
          const publishDate = new Date(body.publishAt);
          if (isNaN(publishDate.getTime())) {
            return new Response(JSON.stringify({ error: "Invalid publishAt date format" }), { status: 400, headers: corsHeaders });
          }
          const schedule = await scheduleVideo(id, publishDate);
          return new Response(JSON.stringify({ success: true, schedule }), { headers: corsHeaders });
        }

        // DELETE /api/videos/:id/schedule - cancel a pending schedule
        if (url.pathname.match(/^\/api\/videos\/[^/]+\/schedule$/) && req.method === "DELETE") {
          const id = url.pathname.split("/")[3];
          await cancelSchedule(id);
          return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        }

        // --- Analytics Routes ---

        // GET /api/analytics - aggregate summary statistics
        if (url.pathname === "/api/analytics" && req.method === "GET") {
          const summaries = await getAllAnalyticsSummary();
          const videos = await getVideos();
          const results = summaries.map(s => {
            const v = videos.find(vid => vid.id === s.video_id);
            return {
              ...s,
              videoTitle: v?.title || "Unknown Title",
              youtubeUrl: v?.youtube_url
            };
          });
          return new Response(JSON.stringify(results), { headers: corsHeaders });
        }

        // GET /api/videos/:id/analytics - history for a single video
        if (url.pathname.match(/^\/api\/videos\/[^/]+\/analytics$/) && req.method === "GET") {
          const id = url.pathname.split("/")[3];
          const rows = await sql`
            SELECT * FROM video_analytics 
            WHERE video_id = ${id}
            ORDER BY fetched_at ASC
          `;
          return new Response(JSON.stringify(rows), { headers: corsHeaders });
        }

        // POST /api/analytics/sync - manually trigger YouTube Analytics sync
        if (url.pathname === "/api/analytics/sync" && req.method === "POST") {
          const { getVideosWithYouTubeIds, upsertVideoAnalytics } = await import("@chroniq/db");
          const { refreshAndFetchAllStats } = await import("@chroniq/agents");
          
          console.log("📊 API: Triggering manual YouTube Analytics sync...");
          const videos = await getVideosWithYouTubeIds();
          if (videos.length === 0) {
            return new Response(JSON.stringify({ success: true, count: 0, message: "No uploaded videos with YouTube IDs to sync." }), { headers: corsHeaders });
          }

          const ids = videos.map(v => v.youtube_video_id).filter(Boolean) as string[];
          const statsList = await refreshAndFetchAllStats(ids);

          for (const stats of statsList) {
            const video = videos.find(v => v.youtube_video_id === stats.youtubeVideoId);
            if (video) {
              await upsertVideoAnalytics({
                videoId: video.id,
                youtubeVideoId: stats.youtubeVideoId,
                views: stats.views,
                likes: stats.likes,
                comments: stats.comments,
                ctr: stats.ctr,
                avgViewDuration: stats.avgViewDuration,
              });
            }
          }

          return new Response(JSON.stringify({ success: true, count: statsList.length }), { headers: corsHeaders });
        }

        // --- Branding / Settings Routes ---

        // GET /api/branding - retrieve channel settings
        if (url.pathname === "/api/branding" && req.method === "GET") {
          const settings = await getAllChannelSettings();
          const branding = settingsToBranding(settings);
          return new Response(JSON.stringify(branding), { headers: corsHeaders });
        }

        // POST /api/branding - update channel settings
        if (url.pathname === "/api/branding" && req.method === "POST") {
          const body = await req.json() as any;
          const settingsMap = brandingToSettings(body);
          for (const [key, val] of Object.entries(settingsMap)) {
            await setChannelSetting(key, val);
          }
          const updated = settingsToBranding(await getAllChannelSettings());
          return new Response(JSON.stringify({ success: true, branding: updated }), { headers: corsHeaders });
        }

        // --- Thumbnail A/B Routes ---

        // POST /api/videos/:id/thumbnails/generate-variants - generate A/B testing thumbnail variants
        if (url.pathname.match(/^\/api\/videos\/[^/]+\/thumbnails\/generate-variants$/) && req.method === "POST") {
          const id = url.pathname.split("/")[3];
          const details = await getVideoDetails(id);
          if (!details) {
            return new Response(JSON.stringify({ error: "Video not found" }), { status: 404, headers: corsHeaders });
          }

          const scriptContent = details.script?.content || "";
          const isShort = (details.video.video_type || "short") === "short";
          
          const mockTopic = { 
            title: details.video.title, 
            angle: details.video.topic,
            category: details.video.topic,
            estimatedViews: 100000
          };
          const mockScript = { full: scriptContent, hook: "", body: "", cta: "", wordCount: 0, voiceTone: "dramatic" as const };
          const mockResearch = { summary: details.video.topic };

          const slug = slugify(details.video.title);
          const outputDir = join(process.cwd(), "output", slug);
          
          console.log(`🎨 Generating thumbnail A/B variants for video: ${id}`);
          const variants = await generateThumbnailVariants(mockTopic, mockScript as any, mockResearch as any, isShort, outputDir);
          
          await saveThumbnailVariants(id, variants);
          return new Response(JSON.stringify({ success: true, variants }), { headers: corsHeaders });
        }

        // POST /api/videos/:id/thumbnails/select-variant - select one of the A/B variants
        if (url.pathname.match(/^\/api\/videos\/[^/]+\/thumbnails\/select-variant$/) && req.method === "POST") {
          const id = url.pathname.split("/")[3];
          const details = await getVideoDetails(id);
          if (!details) {
            return new Response(JSON.stringify({ error: "Video not found" }), { status: 404, headers: corsHeaders });
          }

          const body = await req.json() as { index: number };
          const index = body.index;
          if (index === undefined || index < 0 || index > 2) {
            return new Response(JSON.stringify({ error: "Invalid variant index" }), { status: 400, headers: corsHeaders });
          }

          const slug = slugify(details.video.title);
          const outputDir = join(process.cwd(), "output", slug);
          const srcPath = join(outputDir, `thumbnail_${index}.png`);
          const destPath = join(outputDir, "thumbnail.png");

          if (!existsSync(srcPath)) {
            return new Response(JSON.stringify({ error: `Variant thumbnail_${index}.png not found` }), { status: 404, headers: corsHeaders });
          }

          // Copy selected variant to thumbnail.png
          const fileData = await readFile(srcPath);
          await writeFile(destPath, fileData);

          return new Response(JSON.stringify({ success: true }), { headers: corsHeaders });
        }

        // 5. GET /api/queue-stats - get BullMQ queue metrics
        if (url.pathname === "/api/queue-stats" && req.method === "GET") {
          const [waiting, active, completed, failed] = await Promise.all([
            videoQueue.getWaitingCount(),
            videoQueue.getActiveCount(),
            videoQueue.getCompletedCount(),
            videoQueue.getFailedCount(),
          ]);

          return new Response(
            JSON.stringify({
              waiting,
              active,
              completed,
              failed,
            }),
            { headers: corsHeaders }
          );
        }

        // Fallback 404
        return new Response(JSON.stringify({ error: "Endpoint not found" }), {
          status: 404,
          headers: corsHeaders,
        });

      } catch (err: any) {
        console.error("API error:", err);
        return new Response(JSON.stringify({ error: err.message || "Server error" }), {
          status: 500,
          headers: corsHeaders,
        });
      }
    },
  });

  console.log(`🚀 API Server running on http://localhost:${PORT}`);
}

startServer();
