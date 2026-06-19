import { join } from "node:path";
import { mkdir, rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { Worker, type Job } from "bullmq";
import {
  generateTopic,
  researchTopic,
  generateScript,
  generateVoice,
  generateScenes,
  downloadImage,
  generateASS,
  generateSRT,
  composeVideo,
  generateYouTubeMetadata,
  generateThumbnail,
  getAccessToken,
  uploadVideo,
  uploadThumbnail,
} from "@chroniq/agents";
import type { WordAlignment, Scene, YouTubeMetadata } from "@chroniq/agents";
import {
  initDatabase,
  updateVideoStatus,
  saveScript,
  saveSceneManifest,
  addAsset,
  getVideoDetails,
} from "@chroniq/db";
import type { SceneManifest } from "@chroniq/db";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379");

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// ─────────────────────────────────────────────
// PHASE 1: Generate (research → script → voice → images)
// Stops at `awaiting_approval`. Human reviews in dashboard.
// ─────────────────────────────────────────────
async function processGenerateJob(job: Job) {
  const { videoId, category, mock, videoType } = job.data as {
    videoId: string;
    category?: string;
    mock?: boolean;
    videoType?: string;
  };

  const mockFlag = !!mock;
  console.log(`\n📥 [Job ${job.id}] GENERATE phase for video ID: ${videoId} (Mock: ${mockFlag})`);

  const details = await getVideoDetails(videoId);
  if (!details) throw new Error(`Video with ID ${videoId} not found.`);

  const { video } = details;
  const isShort = (videoType || video.video_type || "short") === "short";

  try {
    let topic: any;
    let research: any;
    let script: any;
    let audioData: ArrayBuffer | null = null;
    let alignments: WordAlignment[] = [];
    let scenes: Scene[] = [];
    let totalDuration = 0;
    let ytMetadata: YouTubeMetadata;
    let thumbnailPrompt = "";
    const slug = slugify(video.title || "temp-video");

    await job.updateProgress(5);

    if (mockFlag) {
      // ── MOCK DATA ──
      topic = {
        title: video.title || "How Netflix Destroyed Blockbuster",
        category: category || "Business Case Studies",
        estimatedViews: 125000,
        angle: "Netflix defeated Blockbuster not just with DVDs, but with a hidden psychological trick.",
      };
      await updateVideoStatus(videoId, "researching");
      await job.updateProgress(15);

      research = {
        summary: "Blockbuster dominated the video rental market but failed to adapt to Netflix's subscription model.",
        facts: ["Blockbuster had over 9,000 stores at its peak in 2004.", "Netflix offered to sell itself for $50 million."],
        timeline: [
          { year: "1997", event: "Netflix is founded." },
          { year: "2000", event: "Blockbuster rejects Netflix's buyout offer." },
          { year: "2010", event: "Blockbuster files for bankruptcy." },
        ],
        sources: ["Netflix and Blockbuster corporate histories"],
      };

      await updateVideoStatus(videoId, "generating_script");
      await job.updateProgress(30);

      script = {
        hook: "In 2000, Netflix offered to sell itself to Blockbuster for fifty million dollars. Blockbuster's CEO literally laughed them out of the room.",
        body: "At its peak, Blockbuster had nine thousand stores. But their model relied on late fees. Netflix had no late fees. Blockbuster ignored them. Filed bankruptcy in 2010.",
        cta: "Would you have bought Netflix for fifty million? Let me know in the comments.",
        full: "In 2000, Netflix offered to sell itself to Blockbuster for fifty million dollars. Blockbuster's CEO literally laughed them out of the room.\n\nAt its peak, Blockbuster had nine thousand stores. But their model relied on late fees. Netflix had no late fees. Blockbuster ignored them. Filed bankruptcy in 2010.\n\nWould you have bought Netflix for fifty million? Let me know in the comments.",
        wordCount: 80,
      };

      totalDuration = 15.0;
      const mockWords = script.full.split(/\s+/).filter(Boolean);
      const avgWordDuration = totalDuration / mockWords.length;
      alignments = mockWords.map((word: string, index: number) => ({
        word,
        start: Math.round(index * avgWordDuration * 100) / 100,
        end: Math.round((index + 1) * avgWordDuration * 100) / 100,
      }));

      scenes = [
        { timestamp: 0, duration: 5.0, imagePrompt: "Netflix founders cinematic portrait", searchQuery: "Netflix founders Reed Hastings" },
        { timestamp: 5.0, duration: 5.0, imagePrompt: "Blockbuster video store exterior at night", searchQuery: "Blockbuster video store" },
        { timestamp: 10.0, duration: 5.0, imagePrompt: "Netflix logo on TV screen in dark room", searchQuery: "Netflix streaming logo" },
      ];

      ytMetadata = {
        title: video.title + " 🤯" || "How Netflix Destroyed Blockbuster 🤯",
        description: "Netflix offered to sell for $50M. Blockbuster laughed.\n\n#shorts #business #netflix",
        tags: ["netflix", "blockbuster", "business"],
        categoryId: "28",
      };
      thumbnailPrompt = "Split portrait Netflix vs Blockbuster dramatic.";
    } else {
      // ── REAL PIPELINE ──
      topic = { title: video.title, category: video.topic, estimatedViews: 100000, angle: "Visualizing the story." };

      console.log(`   [Job ${job.id}] 📚 Researching...`);
      await updateVideoStatus(videoId, "researching");
      await job.updateProgress(15);
      research = await researchTopic(topic);

      console.log(`   [Job ${job.id}] ✍️  Writing script...`);
      await updateVideoStatus(videoId, "generating_script");
      await job.updateProgress(30);
      script = await generateScript(topic, research, isShort);

      console.log(`   [Job ${job.id}] 🎙️  Synthesizing voice...`);
      await updateVideoStatus(videoId, "generating_voice");
      await job.updateProgress(45);
      const voiceResult = await generateVoice(script.full, true);
      audioData = voiceResult.audioBuffer;
      alignments = voiceResult.alignments || [];
      totalDuration = alignments.length > 0 ? alignments[alignments.length - 1].end : 30.0;

      console.log(`   [Job ${job.id}] 🎨 Planning visuals...`);
      await updateVideoStatus(videoId, "generating_visuals");
      await job.updateProgress(60);
      scenes = await generateScenes(script, research, totalDuration, isShort);

      ytMetadata = await generateYouTubeMetadata(topic, script, research, isShort);
      thumbnailPrompt = "Dramatic documentary cover art.";
    }

    // Set up output directory
    const outputDir = join(process.cwd(), "output", slug);
    await mkdir(outputDir, { recursive: true });

    // Save script to DB
    await saveScript(videoId, script.full);

    // Download/Generate Images
    console.log(`   [Job ${job.id}] 🖼️  Downloading scene images...`);
    const sceneManifest: SceneManifest[] = [];

    for (let i = 0; i < scenes.length; i++) {
      const scene = scenes[i];
      const filename = `scene_${i}.jpg`;
      const scenePath = join(outputDir, filename);

      if (mockFlag) {
        const resolution = isShort ? "1080/1920" : "1920/1080";
        const imgRes = await fetch(`https://picsum.photos/${resolution}?sig=${i}`);
        await Bun.write(scenePath, await imgRes.arrayBuffer());
      } else {
        await downloadImage(scene.searchQuery || scene.imagePrompt, scenePath, isShort);
      }

      await addAsset(videoId, "image", scenePath);
      sceneManifest.push({
        index: i,
        filename,
        duration: scene.duration,
        imagePrompt: scene.imagePrompt,
        searchQuery: scene.searchQuery,
      });
    }

    // Save scene manifest to DB for HITL review
    await saveSceneManifest(videoId, sceneManifest);

    // Generate Thumbnail
    console.log(`   [Job ${job.id}] 🎨 Generating thumbnail...`);
    const thumbnailPath = join(outputDir, "thumbnail.png");
    if (mockFlag) {
      const imgRes = await fetch(`https://picsum.photos/1080/1920?sig=thumbnail`);
      await Bun.write(thumbnailPath, await imgRes.arrayBuffer());
    } else {
      thumbnailPrompt = await generateThumbnail(topic, script, research, isShort, thumbnailPath);
    }
    await addAsset(videoId, "thumbnail", thumbnailPath);

    // Write Audio
    const narrationPath = join(outputDir, "narration.mp3");
    if (mockFlag) {
      const ffmpegPath = ffmpegInstaller.path;
      const silentProc = Bun.spawn([
        ffmpegPath, "-y",
        "-f", "lavfi",
        "-i", `anullsrc=channel_layout=mono:sample_rate=44100`,
        "-t", totalDuration.toFixed(2),
        narrationPath,
      ], { stdout: "ignore", stderr: "ignore" });
      await silentProc.exited;
    } else if (audioData) {
      await Bun.write(narrationPath, audioData);
    }
    await addAsset(videoId, "audio", narrationPath);

    // Save alignments for render phase
    const alignmentsPath = join(outputDir, "alignments.json");
    await Bun.write(alignmentsPath, JSON.stringify(alignments));
    await addAsset(videoId, "alignments", alignmentsPath);

    // Save youtube metadata for render phase
    const metaPath = join(outputDir, "youtube_meta.json");
    await Bun.write(metaPath, JSON.stringify({ ytMetadata, thumbnailPrompt, isShort, totalDuration }));

    // Generate caption files
    console.log(`   [Job ${job.id}] ✍️  Compiling captions...`);
    const assContent = generateASS(alignments);
    const srtContent = generateSRT(alignments);
    await Bun.write(join(outputDir, "captions.ass"), assContent);
    await Bun.write(join(outputDir, "captions.srt"), srtContent);
    await addAsset(videoId, "captions_ass", join(outputDir, "captions.ass"));
    await addAsset(videoId, "captions_srt", join(outputDir, "captions.srt"));

    // ── HITL GATE: Pause for human review ──
    console.log(`   [Job ${job.id}] ⏸️  Awaiting human approval in dashboard...`);
    await updateVideoStatus(videoId, "awaiting_approval");
    await job.updateProgress(100);
    console.log(`   ✅ [Job ${job.id}] Generate phase complete. Video awaiting review.`);

  } catch (error: any) {
    console.error(`   ❌ [Job ${job.id}] Generate phase failed:`, error);
    await updateVideoStatus(videoId, "failed", undefined, undefined, error.message || String(error));
    throw error;
  }
}

// ─────────────────────────────────────────────
// PHASE 2: Render (approved → Remotion render → YouTube upload → cleanup)
// Triggered by dashboard approval button.
// ─────────────────────────────────────────────
async function processRenderJob(job: Job) {
  const { videoId } = job.data as { videoId: string };
  console.log(`\n🎬 [Job ${job.id}] RENDER phase for video ID: ${videoId}`);

  const details = await getVideoDetails(videoId);
  if (!details) throw new Error(`Video ${videoId} not found.`);

  const { video } = details;
  const slug = slugify(video.title || "temp-video");
  const outputDir = join(process.cwd(), "output", slug);

  try {
    await updateVideoStatus(videoId, "generating_captions");
    await job.updateProgress(10);

    // Load saved data from generate phase
    const alignmentsPath = join(outputDir, "alignments.json");
    const alignments: WordAlignment[] = existsSync(alignmentsPath)
      ? JSON.parse(await Bun.file(alignmentsPath).text())
      : [];

    const metaPath = join(outputDir, "youtube_meta.json");
    const meta = existsSync(metaPath)
      ? JSON.parse(await Bun.file(metaPath).text())
      : { ytMetadata: null, isShort: true, totalDuration: 30 };

    const { ytMetadata, isShort, totalDuration } = meta;

    // Load scene manifest
    const sceneManifest: SceneManifest[] = video.scene_manifest
      ? JSON.parse(video.scene_manifest)
      : [];

    const sceneInputs = sceneManifest.map((s) => ({
      filename: s.filename,
      duration: s.duration,
    }));

    // Re-read the (potentially edited) script from DB
    const updatedDetails = await getVideoDetails(videoId);
    const scriptContent = updatedDetails?.script?.content || "";

    // ── Render Video ──
    console.log(`   [Job ${job.id}] 🎥 Rendering video via Remotion...`);
    await updateVideoStatus(videoId, "rendering_video");
    await job.updateProgress(20);

    const finalVideoName = "final.mp4";
    await composeVideo(outputDir, "narration.mp3", sceneInputs, alignments, finalVideoName, { isShort });
    await addAsset(videoId, "video", join(outputDir, finalVideoName));

    await job.updateProgress(80);

    // ── YouTube Upload ──
    console.log(`   [Job ${job.id}] 🚀 Uploading to YouTube...`);
    await updateVideoStatus(videoId, "publishing");
    await job.updateProgress(90);

    let youtubeUrl = "https://youtu.be/dQw4w9WgXcQ";
    const clientId = process.env.YOUTUBE_CLIENT_ID;
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
    const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;
    const thumbnailPath = join(outputDir, "thumbnail.png");

    if (clientId && clientSecret && refreshToken && ytMetadata) {
      try {
        const accessToken = await getAccessToken(clientId, clientSecret, refreshToken);
        const ytId = await uploadVideo(accessToken, join(outputDir, finalVideoName), ytMetadata);
        youtubeUrl = `https://youtu.be/${ytId}`;
        await uploadThumbnail(accessToken, ytId, thumbnailPath);
      } catch (err) {
        console.error("   ❌ YouTube upload failed:", err);
      }
    }

    // ── Auto-Cleanup: Remove intermediate files, keep final output ──
    console.log(`   [Job ${job.id}] 🧹 Cleaning up intermediate files...`);
    await cleanupIntermediateFiles(outputDir);

    // Complete
    await updateVideoStatus(videoId, "completed", totalDuration, youtubeUrl);
    await job.updateProgress(100);
    console.log(`   ✅ [Job ${job.id}] Render complete! URL: ${youtubeUrl}`);

  } catch (error: any) {
    console.error(`   ❌ [Job ${job.id}] Render phase failed:`, error);
    await updateVideoStatus(videoId, "failed", undefined, undefined, error.message || String(error));
    throw error;
  }
}

// ─────────────────────────────────────────────
// Auto-Cleanup: Keep only final.mp4 + thumbnail.png
// Removes temp audio, JSON data files, Remotion bundle cache
// ─────────────────────────────────────────────
async function cleanupIntermediateFiles(outputDir: string) {
  const KEEP = new Set(["final.mp4", "thumbnail.png"]);
  try {
    const files = await readdir(outputDir);
    for (const file of files) {
      if (!KEEP.has(file)) {
        const filePath = join(outputDir, file);
        await rm(filePath, { recursive: true, force: true });
        console.log(`     🗑️  Deleted: ${file}`);
      }
    }
  } catch (err) {
    console.warn("   ⚠️  Cleanup warning:", err);
  }

  // Also clean Remotion's temp bundle directory
  const remotionTmp = join(process.cwd(), "node_modules", ".cache", "remotion");
  if (existsSync(remotionTmp)) {
    await rm(remotionTmp, { recursive: true, force: true });
    console.log(`     🗑️  Cleared Remotion bundle cache`);
  }
}

// ─────────────────────────────────────────────
// Worker Boot
// ─────────────────────────────────────────────
async function startWorker() {
  console.log("🚀 Initializing database connection...");
  await initDatabase();

  console.log(`🚀 Starting Chroniq Worker on Redis ${REDIS_HOST}:${REDIS_PORT}...`);

  const redisConnection = { host: REDIS_HOST, port: REDIS_PORT };

  // Worker 1: Generate phase
  const generateWorker = new Worker("video-generation", async (job) => {
    if (job.name === "generate-video") {
      await processGenerateJob(job);
    } else if (job.name === "render-video") {
      await processRenderJob(job);
    }
  }, { connection: redisConnection, concurrency: 1 });

  generateWorker.on("active", (job) => console.log(`📢 Processing job: ${job.name} (${job.id})`));
  generateWorker.on("completed", (job) => console.log(`🟢 Job ${job.name} (${job.id}) completed!`));
  generateWorker.on("failed", (job, err) => console.log(`🔴 Job ${job?.name} (${job?.id}) failed: ${err.message}`));
}

startWorker();
