import { Queue } from "bullmq";
import {
  initDatabase,
  createVideo,
  getVideos,
  getVideoDetails,
  approveVideo,
  rejectVideo,
  updateScript,
} from "@chroniq/db";
import { join } from "node:path";

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

async function startServer() {
  console.log("🚀 Initializing database connection for API...");
  await initDatabase();

  Bun.serve({
    port: PORT,
    async fetch(req) {
      const url = new URL(req.url);
      
      // CORS preflight requests
      if (req.method === "OPTIONS") {
        return new Response(null, {
          headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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
          };

          if (!body.title || !body.topic) {
            return new Response(
              JSON.stringify({ error: "Missing required fields: title, topic" }),
              { status: 400, headers: corsHeaders }
            );
          }

          // Insert video record into database
          const videoType = body.videoType || "short";
          const video = await createVideo(body.title, body.topic, "queued", videoType);

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
