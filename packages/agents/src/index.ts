export { generateTopic, generateDailyTrendingTopics } from "./topic.ts";
export type { Topic } from "./topic.ts";

export { researchTopic } from "./research.ts";
export type { Research } from "./research.ts";

export { generateScript } from "./script.ts";
export type { Script } from "./script.ts";

export { generateVoice, alignCharactersToWords, ALL_VOICES } from "./voice.ts";
export type { WordAlignment, VoiceGenerationResult } from "./voice.ts";

export { generateScenes, downloadImage } from "./visual.ts";
export type { Scene } from "./visual.ts";

export { getVideoStylePreset, normalizeMotionStyle, normalizeSceneType } from "./video-style.ts";
export type { MotionStyle, SceneType, StyledScene, VideoStylePreset, VideoStylePresetName } from "./video-style.ts";

export { generateASS, generateSRT, groupAlignments } from "./caption.ts";

export { composeVideo } from "./video.ts";
export type { VideoSceneInput } from "./video.ts";

export { renderVideoWithRemotion } from "./remotion/render.ts";

export { generateThumbnailPrompt, generateThumbnailConcept, generateThumbnail, generateThumbnailVariants } from "./thumbnail.ts";
export type { ThumbnailConcept } from "./thumbnail.ts";

export { generateYouTubeMetadata, getAccessToken, uploadVideo, uploadThumbnail } from "./youtube.ts";
export type { YouTubeMetadata } from "./youtube.ts";

export { settingsToBranding, brandingToSettings, DEFAULT_BRANDING } from "./branding.ts";
export type { ChannelBranding } from "./branding.ts";

export { fetchVideoStats, fetchBatchVideoStats, refreshAndFetchAllStats } from "./analytics.ts";
export type { YouTubeVideoStats } from "./analytics.ts";

