import { join } from "node:path";
import { mkdir } from "node:fs/promises";
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
  addAsset,
  getVideoDetails,
} from "@chroniq/db";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";

const REDIS_HOST = process.env.REDIS_HOST || "localhost";
const REDIS_PORT = parseInt(process.env.REDIS_PORT || "6379");

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

async function processVideoJob(job: Job) {
  const { videoId, category, mock, videoType } = job.data as {
    videoId: string;
    category?: string;
    mock?: boolean;
    videoType?: string;
  };

  const mockFlag = !!mock;
  console.log(`\n📥 [Job ${job.id}] Starting generation for video ID: ${videoId} (Mock: ${mockFlag})`);

  // Fetch current video row
  const details = await getVideoDetails(videoId);
  if (!details) {
    throw new Error(`Video with ID ${videoId} not found in database.`);
  }

  const { video } = details;
  const isShort = (videoType || video.video_type || "short") === "short";

  try {
    let topic;
    let research;
    let script;
    let audioData: ArrayBuffer | null = null;
    let alignments: WordAlignment[] = [];
    let scenes: Scene[] = [];
    let totalDuration = 0;
    let ytMetadata: YouTubeMetadata;
    let thumbnailPrompt = "";
    let slug = slugify(video.title || "temp-video");

    await job.updateProgress(5);

    if (mockFlag) {
      // --- MOCK PIPELINE ---
      console.log(`   [Job ${job.id}] Running in MOCK mode.`);
      topic = {
        title: video.title || "How Netflix Destroyed Blockbuster",
        category: category || "Business Case Studies",
        estimatedViews: 125000,
        angle: "Netflix defeated Blockbuster not just with DVDs, but with a hidden psychological trick."
      };
      
      await updateVideoStatus(videoId, "researching");
      await job.updateProgress(15);

      research = {
        summary: "Blockbuster dominated the video rental market but failed to adapt to Netflix's subscription model. Netflix's lack of late fees and transition to streaming ultimately led to Blockbuster's bankruptcy.",
        facts: [
          "Blockbuster had over 9,000 stores at its peak in 2004.",
          "In 2000, Netflix offered to sell itself to Blockbuster for $50 million, but Blockbuster's CEO declined.",
          "Blockbuster made a significant portion of its revenue from late fees."
        ],
        timeline: [
          { year: "1997", event: "Netflix is founded by Reed Hastings and Marc Randolph." },
          { year: "2000", event: "Blockbuster rejects Netflix's buyout offer." },
          { year: "2004", event: "Blockbuster launches its own online service, but too late." },
          { year: "2010", event: "Blockbuster files for bankruptcy." }
        ],
        sources: ["Netflix and Blockbuster corporate histories", "SEC filings", "Business documentaries"]
      };

      await updateVideoStatus(videoId, "generating_script");
      await job.updateProgress(30);

      script = {
        hook: "In 2000, Netflix offered to sell itself to Blockbuster for fifty million dollars. Blockbuster's CEO literally laughed them out of the room.",
        body: "At its peak, Blockbuster had nine thousand stores and millions of customers. But their business model relied on a dark secret: late fees. When Netflix launched with no late fees and unlimited rentals, Blockbuster ignored them. By the time they realized their mistake and launched an online service, Netflix was already transitioning to streaming. Blockbuster filed for bankruptcy in 2010.",
        cta: "Would you have bought Netflix for fifty million? Let me know in the comments.",
        full: "In 2000, Netflix offered to sell itself to Blockbuster for fifty million dollars. Blockbuster's CEO literally laughed them out of the room.\n\nAt its peak, Blockbuster had nine thousand stores and millions of customers. But their business model relied on a dark secret: late fees. When Netflix launched with no late fees and unlimited rentals, Blockbuster ignored them. By the time they realized their mistake and launched an online service, Netflix was already transitioning to streaming. Blockbuster filed for bankruptcy in 2010.\n\nWould you have bought Netflix for fifty million? Let me know in the comments.",
        wordCount: 112
      };

      totalDuration = 15.0;
      const mockWords = script.full.split(/\s+/).filter(Boolean);
      const avgWordDuration = totalDuration / mockWords.length;
      alignments = mockWords.map((word, index) => {
        const start = index * avgWordDuration;
        const end = start + avgWordDuration;
        return {
          word,
          start: Math.round(start * 100) / 100,
          end: Math.round(end * 100) / 100,
        };
      });

      await updateVideoStatus(videoId, "generating_visuals");
      await job.updateProgress(50);

      scenes = [
        { timestamp: 0, duration: 5.0, imagePrompt: "Cinematic portrait of Netflix founders, 9:16 aspect ratio" },
        { timestamp: 5.0, duration: 5.0, imagePrompt: "Cinematic shot of Blockbuster store at night, 9:16 aspect ratio" },
        { timestamp: 10.0, duration: 5.0, imagePrompt: "Cinematic shot of neon Netflix logo on screen, 9:16 aspect ratio" }
      ];

      ytMetadata = {
        title: video.title + " 🤯" || "How Netflix Absolute Ruined Blockbuster 🤯",
        description: "Netflix offered to sell itself for $50 million. Blockbuster laughed. Here is how they paid the ultimate price.\n\n#shorts #business #marketing #history #netflix",
        tags: ["netflix", "blockbuster", "business story", "case study", "failure", "success"],
        categoryId: "28"
      };

      thumbnailPrompt = "A dramatic split portrait of Netflix vs Blockbuster. 9:16 aspect ratio.";

    } else {
      // --- REAL PIPELINE ---
      // 1. Topic generation (if not already set in database)
      console.log(`   [Job ${job.id}] 🔍 Selecting topic...`);
      topic = {
        title: video.title,
        category: video.topic,
        estimatedViews: 100000,
        angle: "Visualizing the story under intense business drama."
      };
      
      // 2. Research
      console.log(`   [Job ${job.id}] 📚 Researching...`);
      await updateVideoStatus(videoId, "researching");
      await job.updateProgress(15);
      research = await researchTopic(topic);

      // 3. Script Writing
      console.log(`   [Job ${job.id}] ✍️  Writing script...`);
      await updateVideoStatus(videoId, "generating_script");
      await job.updateProgress(30);
      script = await generateScript(topic, research, isShort);

      // 4. Voice Synthesis
      console.log(`   [Job ${job.id}] 🎙️  Synthesizing voice...`);
      await updateVideoStatus(videoId, "generating_voice");
      await job.updateProgress(45);
      const voiceResult = await generateVoice(script.full, true);
      audioData = voiceResult.audioBuffer;
      alignments = voiceResult.alignments || [];
      
      if (alignments.length > 0) {
        totalDuration = alignments[alignments.length - 1].end;
      } else {
        totalDuration = 30.0;
      }

      // 5. Visual Planning
      console.log(`   [Job ${job.id}] 🎨 Planning visual prompts...`);
      await updateVideoStatus(videoId, "generating_visuals");
      await job.updateProgress(60);
      scenes = await generateScenes(script, research, totalDuration, isShort);

      // 6. Metadata Planning
      ytMetadata = await generateYouTubeMetadata(topic, script, research, isShort);
      thumbnailPrompt = "A custom cover art prompt generated by the thumbnail agent.";
    }

    // Set up output directory
    const outputDir = join(process.cwd(), "output", slug);
    await mkdir(outputDir, { recursive: true });

    // Save script to DB
    await saveScript(videoId, script.full);

    // 7. Download/Generate Images
    console.log(`   [Job ${job.id}] 🖼️  Downloading scene images...`);
    const sceneInputs = [];
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
      
      // Save scene image asset to database
      await addAsset(videoId, "image", scenePath);
      
      sceneInputs.push({
        filename,
        duration: scene.duration
      });
    }

    // 8. Generate Thumbnail
    console.log(`   [Job ${job.id}] 🎨 Generating thumbnail cover...`);
    const thumbnailPath = join(outputDir, "thumbnail.png");
    if (mockFlag) {
      const imgRes = await fetch(`https://picsum.photos/1080/1920?sig=thumbnail`);
      await Bun.write(thumbnailPath, await imgRes.arrayBuffer());
    } else {
      thumbnailPrompt = await generateThumbnail(topic, script, research, isShort, thumbnailPath);
    }
    await addAsset(videoId, "thumbnail", thumbnailPath);

    // 9. Write/Generate Audio
    const narrationPath = join(outputDir, "narration.mp3");
    if (mockFlag) {
      const ffmpegPath = ffmpegInstaller.path;
      const silentProc = Bun.spawn([
        ffmpegPath,
        "-y",
        "-f", "lavfi",
        "-i", "anullsrc=channel_layout=mono:sample_rate=44100",
        "-t", totalDuration.toFixed(2),
        narrationPath
      ], { stdout: "ignore", stderr: "ignore" });
      await silentProc.exited;
    } else if (audioData) {
      await Bun.write(narrationPath, audioData);
    }
    await addAsset(videoId, "audio", narrationPath);

    // 10. Generate Subtitles
    console.log(`   [Job ${job.id}] ✍️  Compiling captions...`);
    await updateVideoStatus(videoId, "generating_captions");
    await job.updateProgress(75);

    const assContent = generateASS(alignments);
    const srtContent = generateSRT(alignments);
    const assPath = join(outputDir, "captions.ass");
    const srtPath = join(outputDir, "captions.srt");

    await Bun.write(assPath, assContent);
    await Bun.write(srtPath, srtContent);
    await addAsset(videoId, "captions_ass", assPath);
    await addAsset(videoId, "captions_srt", srtPath);

    // 11. Compose Video
    console.log(`   [Job ${job.id}] 🎥 Rendering video...`);
    await updateVideoStatus(videoId, "rendering_video");
    await job.updateProgress(85);

    const finalVideoName = "final.mp4";
    const finalVideoPath = join(outputDir, finalVideoName);
    await composeVideo(
      outputDir,
      "narration.mp3",
      sceneInputs,
      "captions.ass",
      finalVideoName,
      { enableZoom: true, isShort }
    );
    await addAsset(videoId, "video", finalVideoPath);

    // 12. YouTube Upload
    console.log(`   [Job ${job.id}] 🚀 Uploading to YouTube...`);
    await updateVideoStatus(videoId, "publishing");
    await job.updateProgress(95);

    let youtubeUrl = "https://youtu.be/dQw4w9WgXcQ"; // mock
    let uploaded = false;

    const clientId = process.env.YOUTUBE_CLIENT_ID;
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
    const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN;

    if (!mockFlag && clientId && clientSecret && refreshToken) {
      try {
        const accessToken = await getAccessToken(clientId, clientSecret, refreshToken);
        const ytId = await uploadVideo(accessToken, finalVideoPath, ytMetadata);
        youtubeUrl = `https://youtu.be/${ytId}`;
        await uploadThumbnail(accessToken, ytId, thumbnailPath);
        uploaded = true;
      } catch (err) {
        console.error("   ❌ YouTube publishing failed:", err);
      }
    }

    // Complete Job
    await updateVideoStatus(videoId, "completed", totalDuration, youtubeUrl);
    await job.updateProgress(100);
    console.log(`   ✅ [Job ${job.id}] Video completed! URL: ${youtubeUrl}`);

  } catch (error: any) {
    console.error(`   ❌ [Job ${job.id}] Pipeline failed:`, error);
    await updateVideoStatus(videoId, "failed", undefined, undefined, error.message || String(error));
    throw error;
  }
}

async function startWorker() {
  console.log("🚀 Initializing database connection...");
  await initDatabase();

  console.log(`🚀 Starting Chroniq BullMQ Queue Worker connecting to Redis on ${REDIS_HOST}:${REDIS_PORT}...`);

  const worker = new Worker("video-generation", processVideoJob, {
    connection: {
      host: REDIS_HOST,
      port: REDIS_PORT,
    },
    concurrency: 1, // process 1 video at a time due to heavy FFmpeg rendering
  });

  worker.on("active", (job) => {
    console.log(`📢 Worker is now processing job ${job.id}`);
  });

  worker.on("completed", (job) => {
    console.log(`🟢 Job ${job.id} has completed successfully!`);
  });

  worker.on("failed", (job, err) => {
    console.log(`🔴 Job ${job?.id} failed with error: ${err.message}`);
  });
}

startWorker();
