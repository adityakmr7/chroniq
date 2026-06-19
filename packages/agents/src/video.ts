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
  options?: { enableZoom?: boolean; isShort?: boolean }
): Promise<void> {
  const ffmpegPath = ffmpegInstaller.path;
  const isShort = options?.isShort !== false;
  const encoder = process.env.VIDEO_ENCODER || "libx264";

  console.log(`     🎥 Composing video using encoder: ${encoder}...`);

  // Build FFmpeg command arguments
  const args: string[] = [ffmpegPath, "-y"];

  // 1. Add image inputs (looped for their respective durations)
  for (const scene of scenes) {
    args.push("-framerate", "25", "-loop", "1", "-t", scene.duration.toFixed(2), "-i", scene.filename);
  }

  // 2. Add the audio input (index will be scenes.length)
  args.push("-i", audioFilename);

  // 3. Build the complex filter graph
  let filterComplex = "";
  
  // Apply scaling and zoompan to each input individually
  for (let i = 0; i < scenes.length; i++) {
    const scene = scenes[i];
    // Calculate total frames for this scene at 25 fps
    const frames = Math.max(1, Math.round(scene.duration * 25));
    
    if (options?.enableZoom) {
      if (isShort) {
        // Vertical Zoompan
        // Scale to 1920x3413, apply zoompan to zoom in slowly over `frames`, export at 25fps to 1080x1920
        filterComplex += `[${i}:v]scale=1920:3413,zoompan=z='1+0.0015*on':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1080x1920:fps=25,setsar=1[v${i}];`;
      } else {
        // Horizontal Zoompan
        // Scale to 3413x1920, apply zoompan to zoom in slowly over `frames`, export at 25fps to 1920x1080
        filterComplex += `[${i}:v]scale=3413:1920,zoompan=z='1+0.0015*on':d=${frames}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':s=1920x1080:fps=25,setsar=1[v${i}];`;
      }
    } else {
      // No zoom: just scale to target resolution and force 25fps
      if (isShort) {
        filterComplex += `[${i}:v]scale=1080:1920,setsar=1,fps=25[v${i}];`;
      } else {
        filterComplex += `[${i}:v]scale=1920:1080,setsar=1,fps=25[v${i}];`;
      }
    }
  }

  // Concat all processed video streams
  for (let i = 0; i < scenes.length; i++) {
    filterComplex += `[v${i}]`;
  }
  filterComplex += `concat=n=${scenes.length}:v=1:a=0[v_concat];`;

  // Burn in subtitles
  // Subtitles filter requires escaping backslashes and colons on Windows
  const escapedSubtitlePath = subtitleFilename.replace(/\\/g, "/").replace(/:/g, "\\:");
  filterComplex += `[v_concat]subtitles=${escapedSubtitlePath}[v_final]`;

  // Add the complex filter arguments to the command
  args.push("-filter_complex", filterComplex);

  // Map the final video and audio stream
  args.push("-map", "[v_final]");
  args.push("-map", `${scenes.length}:a`);

  // Encoder and output options
  args.push("-c:v", encoder);
  args.push("-pix_fmt", "yuv420p");
  args.push("-c:a", "aac");
  args.push("-shortest");
  args.push(outputFilename);

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
