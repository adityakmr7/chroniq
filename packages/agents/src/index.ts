export { generateTopic } from "./topic.ts";
export type { Topic } from "./topic.ts";

export { researchTopic } from "./research.ts";
export type { Research } from "./research.ts";

export { generateScript } from "./script.ts";
export type { Script } from "./script.ts";

export { generateVoice, alignCharactersToWords } from "./voice.ts";
export type { WordAlignment, VoiceGenerationResult } from "./voice.ts";

export { generateScenes, downloadImage } from "./visual.ts";
export type { Scene } from "./visual.ts";

export { generateASS, generateSRT, groupAlignments } from "./caption.ts";

export { composeVideo } from "./video.ts";
export type { VideoSceneInput } from "./video.ts";

export { generateThumbnailPrompt, generateThumbnail } from "./thumbnail.ts";

export { generateYouTubeMetadata, getAccessToken, uploadVideo, uploadThumbnail } from "./youtube.ts";
export type { YouTubeMetadata } from "./youtube.ts";
