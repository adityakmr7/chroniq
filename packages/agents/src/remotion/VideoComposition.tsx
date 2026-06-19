import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
} from "remotion";
import React from "react";

export interface Scene {
  filename: string;
  duration: number;
}

export interface WordAlignment {
  word: string;
  start: number;
  end: number;
}

export interface VideoCompositionProps {
  scenes: Scene[];
  audioUrl: string;
  alignments: WordAlignment[];
  isShort: boolean;
}

// Ken Burns variations — alternating per scene for visual variety
type KenBurnsMode = "zoom-in" | "zoom-out" | "pan-left" | "pan-right" | "pan-up";
const KB_MODES: KenBurnsMode[] = ["zoom-in", "zoom-out", "pan-left", "pan-right", "zoom-in"];

export const VideoComposition: React.FC<VideoCompositionProps> = ({
  scenes,
  audioUrl,
  alignments,
  isShort,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  // Precompute each scene's start frame
  const sceneFrames: { start: number; durationFrames: number }[] = [];
  let cursor = 0;
  for (const scene of scenes) {
    const durationFrames = Math.round(scene.duration * fps);
    sceneFrames.push({ start: cursor, durationFrames });
    cursor += durationFrames;
  }

  return (
    <AbsoluteFill style={{ backgroundColor: "#000", fontFamily: "Helvetica Neue, Arial, sans-serif" }}>

      {/* ── Scene Images with cinematic Ken Burns + fade-in ── */}
      {scenes.map((scene, index) => {
        const { start, durationFrames } = sceneFrames[index];
        const mode = KB_MODES[index % KB_MODES.length];

        return (
          <Sequence key={index} from={start} durationInFrames={durationFrames}>
            <SceneElement
              filename={scene.filename}
              durationFrames={durationFrames}
              mode={mode}
              fadeInFrames={index === 0 ? 0 : 8}
            />
          </Sequence>
        );
      })}

      {/* ── Background Audio ── */}
      {audioUrl && <Audio src={audioUrl} />}

      {/* ── Captions Overlay ── */}
      <AbsoluteFill style={{ pointerEvents: "none" }}>
        <CaptionsOverlay alignments={alignments} frame={frame} fps={fps} isShort={isShort} />
      </AbsoluteFill>

      {/* ── Bottom vignette gradient ── */}
      <AbsoluteFill
        style={{
          background: isShort
            ? "linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.3) 35%, transparent 60%)"
            : "linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.2) 30%, transparent 55%)",
          pointerEvents: "none",
        }}
      />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────
// SceneElement: Ken Burns + fade in/out
// ─────────────────────────────────────────────
const SceneElement: React.FC<{
  filename: string;
  durationFrames: number;
  mode: KenBurnsMode;
  fadeInFrames: number;
}> = ({ filename, durationFrames, mode, fadeInFrames }) => {
  const frame = useCurrentFrame();
  const progress = durationFrames > 0 ? Math.min(frame / durationFrames, 1) : 0;

  // Fade in only — safe, no duplicate input values in interpolate
  const opacity = fadeInFrames > 0
    ? interpolate(frame, [0, fadeInFrames], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 1;

  // Ken Burns transform based on mode
  let transform = "";
  switch (mode) {
    case "zoom-in":
      transform = `scale(${1.0 + 0.15 * progress})`;
      break;
    case "zoom-out":
      transform = `scale(${1.15 - 0.15 * progress})`;
      break;
    case "pan-left":
      transform = `scale(1.12) translateX(${-4 + 8 * progress}%)`;
      break;
    case "pan-right":
      transform = `scale(1.12) translateX(${4 - 8 * progress}%)`;
      break;
    case "pan-up":
      transform = `scale(1.12) translateY(${3 - 6 * progress}%)`;
      break;
  }

  return (
    <AbsoluteFill style={{ overflow: "hidden", opacity }}>
      <Img
        src={filename}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform,
          transformOrigin: "center center",
          willChange: "transform",
        }}
        onError={() => console.error(`[Remotion] Failed to load: ${filename}`)}
      />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────
// CaptionsOverlay: Line-by-line with bold highlight
// ─────────────────────────────────────────────
const WORDS_PER_LINE = 4;

const CaptionsOverlay: React.FC<{
  alignments: WordAlignment[];
  frame: number;
  fps: number;
  isShort: boolean;
}> = ({ alignments, frame, fps, isShort }) => {
  if (!alignments || alignments.length === 0) return null;

  const currentTime = frame / fps;

  // Find the currently active word
  const activeIndex = alignments.findIndex(
    (w) => currentTime >= w.start && currentTime <= w.end
  );

  let displayIndex = activeIndex;
  if (displayIndex === -1) {
    // Between words — find last finished word
    const upcoming = alignments.findIndex((w) => w.start > currentTime);
    if (upcoming > 0 && currentTime - alignments[upcoming - 1].end < 0.8) {
      displayIndex = upcoming - 1;
    } else {
      return null;
    }
  }

  // Find which line group this word belongs to
  const lineStart = Math.floor(displayIndex / WORDS_PER_LINE) * WORDS_PER_LINE;
  const lineEnd = Math.min(lineStart + WORDS_PER_LINE, alignments.length);
  const lineWords = alignments.slice(lineStart, lineEnd);

  const fontSize = isShort ? 72 : 52;

  return (
    <div
      style={{
        position: "absolute",
        bottom: isShort ? "28%" : "12%",
        left: "5%",
        right: "5%",
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        alignItems: "center",
        gap: isShort ? "10px" : "8px",
        padding: "16px 24px",
      }}
    >
      {lineWords.map((w, idx) => {
        const globalIdx = lineStart + idx;
        const isActive = globalIdx === activeIndex;
        return (
          <span
            key={globalIdx}
            style={{
              fontSize,
              fontWeight: 900,
              lineHeight: 1.1,
              color: isActive ? "#FACC15" : "#FFFFFF",
              textShadow: "3px 3px 0 #000, -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000, 0 0 20px rgba(0,0,0,0.8)",
              textTransform: "uppercase",
              letterSpacing: "0.02em",
              display: "inline-block",
              transform: isActive ? "scale(1.12)" : "scale(1.0)",
              transition: "transform 0.06s ease",
              willChange: "transform",
              padding: isActive ? "2px 8px" : "2px 4px",
              borderRadius: isActive ? "6px" : "0",
              background: isActive ? "rgba(250,204,21,0.15)" : "transparent",
            }}
          >
            {w.word}
          </span>
        );
      })}
    </div>
  );
};
