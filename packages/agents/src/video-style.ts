export type SceneType = "image" | "headline" | "stat" | "quote" | "timeline" | "comparison";
export type MotionStyle = "zoom-in" | "zoom-out" | "pan-left" | "pan-right" | "pan-up";
export type VideoStylePresetName = "business_documentary_dark" | "tech_history_fast" | "horror_dark";

export interface StyledScene {
  filename: string;
  duration: number;
  sceneType?: SceneType;
  headline?: string;
  emphasis?: string;
  motion?: MotionStyle;
}

export interface VideoStylePreset {
  name: VideoStylePresetName;
  accentColor: string;
  secondaryAccent: string;
  captionActiveColor: string;
  captionTextColor: string;
  captionBackground: string;
  vignetteStrength: number;
  wordsPerLineShort: number;
  shortCaptionBottom: string;
  titleBackground: string;
}

const PRESETS: Record<VideoStylePresetName, VideoStylePreset> = {
  business_documentary_dark: {
    name: "business_documentary_dark",
    accentColor: "#FACC15",
    secondaryAccent: "#EF4444",
    captionActiveColor: "#FACC15",
    captionTextColor: "#FFFFFF",
    captionBackground: "rgba(0, 0, 0, 0.18)",
    vignetteStrength: 0.88,
    wordsPerLineShort: 2,
    shortCaptionBottom: "42%",
    titleBackground: "linear-gradient(135deg, rgba(0,0,0,0.82), rgba(20,20,20,0.52))",
  },
  tech_history_fast: {
    name: "tech_history_fast",
    accentColor: "#38BDF8",
    secondaryAccent: "#A78BFA",
    captionActiveColor: "#38BDF8",
    captionTextColor: "#FFFFFF",
    captionBackground: "rgba(2, 6, 23, 0.22)",
    vignetteStrength: 0.82,
    wordsPerLineShort: 2,
    shortCaptionBottom: "40%",
    titleBackground: "linear-gradient(135deg, rgba(15,23,42,0.86), rgba(30,41,59,0.50))",
  },
  horror_dark: {
    name: "horror_dark",
    accentColor: "#DC2626",          // blood red
    secondaryAccent: "#7C3AED",      // eerie purple
    captionActiveColor: "#FCA5A5",   // pale red — glows in the dark
    captionTextColor: "#F5F5F5",     // ghost white
    captionBackground: "rgba(60, 0, 0, 0.30)",
    vignetteStrength: 0.96,          // heavy vignette for claustrophobic feel
    wordsPerLineShort: 2,
    shortCaptionBottom: "38%",
    titleBackground: "linear-gradient(135deg, rgba(30,0,0,0.92), rgba(60,0,0,0.60))",
  },
};

export function getVideoStylePreset(name?: string): VideoStylePreset {
  if (name && name in PRESETS) {
    return PRESETS[name as VideoStylePresetName];
  }
  return PRESETS.business_documentary_dark;
}

export function normalizeSceneType(value: unknown): SceneType {
  const allowed: SceneType[] = ["image", "headline", "stat", "quote", "timeline", "comparison"];
  return typeof value === "string" && allowed.includes(value as SceneType) ? (value as SceneType) : "image";
}

export function normalizeMotionStyle(value: unknown, index: number): MotionStyle {
  const fallback: MotionStyle[] = ["zoom-in", "zoom-out", "pan-left", "pan-right", "pan-up"];
  return typeof value === "string" && fallback.includes(value as MotionStyle)
    ? (value as MotionStyle)
    : fallback[index % fallback.length];
}
