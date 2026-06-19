import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { join } from "node:path";

export interface VideoSceneInput {
  filename: string;
  duration: number;
}

export async function composeVideo(
  dirPath: string,
  audioFilename: string,
  scenes: VideoSceneInput[],
  subtitleFilename: string,
  outputFilename: string,
  options?: { enableZoom?: boolean }
): Promise<void> {
  const ffmpegPath = ffmpegInstaller.path;

  // 1. Create the concat.txt content
  let concatContent = "";
  for (const scene of scenes) {
    // Escape single quotes in filenames for the concat file
    const escapedFilename = scene.filename.replace(/'/g, "'\\''");
    concatContent += `file '${escapedFilename}'\nduration ${scene.duration.toFixed(2)}\n`;
  }
  // Repeat the last file without duration as per FFmpeg concat spec
  if (scenes.length > 0) {
    const escapedLastFilename = scenes[scenes.length - 1].filename.replace(/'/g, "'\\''");
    concatContent += `file '${escapedLastFilename}'\n`;
  }

  const concatPath = join(dirPath, "concat.txt");
  await Bun.write(concatPath, concatContent);

  // 2. Build FFmpeg filter graph
  // If zoom is enabled, we apply a subtle zoompan filter.
  let videoFilters = "scale=1080:1920";
  if (options?.enableZoom) {
    // Smooth zoompan: zooms in slowly at 25 fps.
    // We upscale first to 1920x3413, apply zoompan, then crop/scale down to 1080x1920.
    videoFilters = "scale=1920:3413,zoompan=z='zoom+0.0010':d=1:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x3413,scale=1080:1920";
  }
  
  // Append the subtitles filter (which burns in the captions)
  videoFilters += `,subtitles=${subtitleFilename}`;

  // Read the encoder from the environment, default to libx264 (CPU)
  const encoder = process.env.VIDEO_ENCODER || "libx264";
  console.log(`     🎥 Composing video using encoder: ${encoder}...`);

  // 3. Build FFmpeg command arguments
  const args = [
    ffmpegPath,
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", "concat.txt",
    "-i", audioFilename,
    "-vf", videoFilters,
    "-c:v", encoder,
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-shortest",
    outputFilename
  ];

  const proc = Bun.spawn(args, {
    cwd: dirPath,
    stdout: "pipe",
    stderr: "pipe",
  });

  const successCode = await proc.exited;

  if (successCode !== 0) {
    const errorText = await new Response(proc.stderr).text();
    throw new Error(`FFmpeg rendering failed (code ${successCode}): ${errorText}`);
  }
}
