import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { join, basename } from "node:path";
import { existsSync } from "node:fs";
import type { Scene, WordAlignment } from "./VideoComposition.tsx";

/**
 * Starts a local HTTP server inside the worker container to serve static assets
 * from the output directory. This avoids cross-container DNS resolution issues
 * when Remotion's headless Chromium tries to fetch images.
 */
async function startAssetServer(outputRoot: string): Promise<{ port: number; stop: () => void }> {
  // Pick a random available port in range 19000-19999
  const port = 19000 + Math.floor(Math.random() * 1000);

  const server = Bun.serve({
    port,
    fetch(req) {
      const url = new URL(req.url);
      const filePath = join(outputRoot, url.pathname);

      if (!existsSync(filePath)) {
        return new Response("Not Found", { status: 404 });
      }

      let contentType = "application/octet-stream";
      if (filePath.endsWith(".mp4")) contentType = "video/mp4";
      else if (filePath.endsWith(".mp3")) contentType = "audio/mpeg";
      else if (filePath.endsWith(".png")) contentType = "image/png";
      else if (filePath.endsWith(".jpg") || filePath.endsWith(".jpeg")) contentType = "image/jpeg";

      return new Response(Bun.file(filePath), {
        headers: {
          "Content-Type": contentType,
          "Access-Control-Allow-Origin": "*",
        },
      });
    },
  });

  console.log(`     🌐 Local asset server started on http://localhost:${port}`);

  return {
    port,
    stop: () => {
      server.stop(true);
      console.log(`     🛑 Local asset server stopped.`);
    },
  };
}

export async function renderVideoWithRemotion(
  dirPath: string,
  scenes: Scene[],
  audioUrl: string,
  alignments: WordAlignment[],
  isShort: boolean,
  outputFilename: string
): Promise<void> {
  console.log("     🎬 Bundling Remotion video project...");
  const entryPoint = join(import.meta.dir, "entry.tsx");

  const bundleLocation = await bundle({
    entryPoint: entryPoint,
  });

  const durationInFrames = Math.max(
    25,
    Math.round(scenes.reduce((sum, s) => sum + s.duration, 0) * 25)
  );

  console.log(`     🎥 Rendering Remotion video (${durationInFrames} frames at 25 fps)...`);

  // Start a local HTTP server that serves files from the parent output directory
  // (one level above dirPath, since dirPath is output/slug/ and we serve from output/)
  const outputRoot = join(dirPath, "..");
  const slug = basename(dirPath);
  const assetServer = await startAssetServer(outputRoot);

  try {
    // Build asset URLs pointing to localhost — always reachable from inside the same container
    const baseUrl = `http://localhost:${assetServer.port}/${slug}`;

    const formattedScenes = scenes.map((scene) => ({
      filename: `${baseUrl}/${scene.filename}`,
      duration: scene.duration,
    }));

    const formattedAudioUrl = `${baseUrl}/${audioUrl}`;

    console.log(`     🔗 Asset URLs (local server):`);
    console.log(`        Audio: ${formattedAudioUrl}`);
    if (formattedScenes.length > 0) {
      console.log(`        First Image: ${formattedScenes[0].filename}`);
      console.log(`        Total scenes: ${formattedScenes.length}`);
    }

    const inputProps = {
      scenes: formattedScenes,
      audioUrl: formattedAudioUrl,
      alignments,
      isShort,
    };

    const composition = await selectComposition({
      serveUrl: bundleLocation,
      id: "main-video",
      inputProps,
    });

    // Dynamically set composition size & length based on inputs
    composition.durationInFrames = durationInFrames;
    composition.width = isShort ? 1080 : 1920;
    composition.height = isShort ? 1920 : 1080;

    await renderMedia({
      composition,
      serveUrl: bundleLocation,
      outputLocation: join(dirPath, outputFilename),
      inputProps,
      codec: "h264",
      audioCodec: "aac",      // explicitly include audio track
      muted: false,           // ensure audio is NOT muted
      chromiumOptions: {
        gl: "swiftshader",    // software GL renderer for Linux Docker (angle fails in containers)
        args: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-dev-shm-usage",
          // NOTE: do NOT add --disable-gpu — it kills the Web Audio API and audio capture
        ],
      },
      onProgress: ({ progress }) => {
        const pct = Math.round(progress * 100);
        if (pct % 10 === 0) {
          console.log(`     ⏳ Render progress: ${pct}%`);
        }
      },
    });

    console.log("     🎉 Remotion video rendering complete!");
  } finally {
    assetServer.stop();
  }
}

export type { Scene, WordAlignment };
