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
} from "@chroniq/db";
import {
  generateVoice,
  generateASS,
  generateSRT,
  ALL_VOICES,
  generateDailyTrendingTopics,
} from "@chroniq/agents";
import { join } from "node:path";
import { rm } from "node:fs/promises";

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
          
          const video = await createVideo(
            body.title,
            body.topic,
            "queued",
            videoType,
            ttsProvider,
            voiceId,
            language
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
