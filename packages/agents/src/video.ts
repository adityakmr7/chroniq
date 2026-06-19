import { renderVideoWithRemotion, type WordAlignment } from "./remotion/render.ts";

export interface VideoSceneInput {
  filename: string;
  duration: number;
}

export async function composeVideo(
  dirPath: string,
  audioFilename: string,
  scenes: VideoSceneInput[],
  alignments: WordAlignment[],
  outputFilename: string,
  options?: { enableZoom?: boolean; isShort?: boolean }
): Promise<void> {
  const isShort = options?.isShort !== false;
  console.log(`     🎥 Composing video using Remotion...`);

  await renderVideoWithRemotion(
    dirPath,
    scenes,
    audioFilename,
    alignments,
    isShort,
    outputFilename
  );
}
