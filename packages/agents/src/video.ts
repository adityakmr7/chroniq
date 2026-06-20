import { renderVideoWithRemotion, type WordAlignment } from "./remotion/render.ts";
import type { MotionStyle, SceneType } from "./video-style.ts";

export interface VideoSceneInput {
  filename: string;
  duration: number;
  sceneType?: SceneType;
  headline?: string;
  emphasis?: string;
  motion?: MotionStyle;
}

export async function composeVideo(
  dirPath: string,
  audioFilename: string,
  scenes: VideoSceneInput[],
  alignments: WordAlignment[],
  outputFilename: string,
  options?: { enableZoom?: boolean; isShort?: boolean; stylePreset?: string; title?: string; branding?: any; captionsEnabled?: boolean }
): Promise<void> {
  const isShort = options?.isShort !== false;
  console.log(`     🎥 Composing video using Remotion...`);

  await renderVideoWithRemotion(
    dirPath,
    scenes,
    audioFilename,
    alignments,
    isShort,
    outputFilename,
    options?.stylePreset,
    options?.title,
    options?.branding,
    options?.captionsEnabled
  );
}
