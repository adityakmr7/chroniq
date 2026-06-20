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
import { getVideoStylePreset, normalizeMotionStyle, type MotionStyle, type SceneType } from "../video-style.ts";

export interface Scene {
  filename: string;
  duration: number;
  sceneType?: SceneType;
  headline?: string;
  emphasis?: string;
  motion?: MotionStyle;
}

export interface WordAlignment {
  word: string;
  start: number;
  end: number;
}

export interface VideoCompositionProps {
  scenes: Scene[];
  audioUrl: string;
  musicUrl?: string;
  alignments: WordAlignment[];
  isShort: boolean;
  stylePresetName?: string;
  title?: string;
  branding?: {
    channelName: string;
    tagline: string;
    accentColor: string;
    secondaryColor: string;
    outroMessage: string;
    logoEmoji: string;
  };
  captionsEnabled?: boolean;
}

// Ken Burns variations — alternating per scene for visual variety
type KenBurnsMode = "zoom-in" | "zoom-out" | "pan-left" | "pan-right" | "pan-up";

export const VideoComposition: React.FC<VideoCompositionProps> = ({
  scenes,
  audioUrl,
  musicUrl,
  alignments,
  isShort,
  stylePresetName,
  title,
  branding,
  captionsEnabled = true,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const style = getVideoStylePreset(stylePresetName);

  // Hook title card: first 1.5s (37 frames at 25fps)
  const HOOK_FRAMES = isShort ? Math.round(fps * 1.5) : 0;

  // Precompute each scene's start frame (offset by hook card)
  const sceneFrames: { start: number; durationFrames: number }[] = [];
  let cursor = HOOK_FRAMES;
  for (const scene of scenes) {
    const durationFrames = Math.round(scene.duration * fps);
    sceneFrames.push({ start: cursor, durationFrames });
    cursor += durationFrames;
  }

  // Progress bar progress (0→1 over the whole video)
  const progress = durationInFrames > 0 ? Math.min(frame / durationInFrames, 1) : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: "#000", fontFamily: "'Inter', 'Helvetica Neue', Arial, sans-serif" }}>

      {/* ── Google Font Import ── */}
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');`}</style>

      {/* ── Hook Title Card (first 1.5s, Shorts only) ── */}
      {isShort && title && HOOK_FRAMES > 0 && (
        <Sequence from={0} durationInFrames={HOOK_FRAMES}>
          <HookTitleCard title={title} frame={frame} fps={fps} hookFrames={HOOK_FRAMES} style={style} />
        </Sequence>
      )}

      {/* ── Scene Images with cinematic Ken Burns + flash cut + zoom punch ── */}
      {scenes.map((scene, index) => {
        const { start, durationFrames } = sceneFrames[index];
        const mode = normalizeMotionStyle(scene.motion, index);

        return (
          <Sequence key={index} from={start} durationInFrames={durationFrames}>
            <SceneElement
              filename={scene.filename}
              durationFrames={durationFrames}
              mode={mode}
              fps={fps}
              isFirst={index === 0}
            />
            <SceneOverlay
              scene={scene}
              frame={frame - start}
              durationFrames={durationFrames}
              isShort={isShort}
              style={style}
            />
            {/* Flash cut: 2-frame white flash at scene start (except first scene) */}
            {index > 0 && (
              <FlashCut frame={frame - start} />
            )}
          </Sequence>
        );
      })}

      {/* ── Branded Outro Card (appended 5s) ── */}
      {branding && (
        <Sequence
          from={sceneFrames.length > 0 ? sceneFrames[sceneFrames.length - 1].start + sceneFrames[sceneFrames.length - 1].durationFrames : 0}
          durationInFrames={Math.round(fps * 5)}
        >
          <BrandedOutro
            branding={branding}
            fps={fps}
            frame={frame - (sceneFrames.length > 0 ? sceneFrames[sceneFrames.length - 1].start + sceneFrames[sceneFrames.length - 1].durationFrames : 0)}
          />
        </Sequence>
      )}


      {/* ── Film Grain Overlay (shifting noise) ── */}
      <FilmGrain />

      {/* ── Color Grading Overlay (style-specific) ── */}
      <ColorGradingOverlay stylePresetName={stylePresetName} />

      {/* ── Background Audio ── */}
      {/* Wrap narration in a Sequence so it starts exactly when scenes start (after hook card) */}
      {audioUrl && (
        <Sequence from={HOOK_FRAMES}>
          <Audio src={audioUrl} />
        </Sequence>
      )}
      {/* Music: ducks to 0.06 during speech, rises to 0.15 in pauses */}
      {musicUrl && <MusicTrack musicUrl={musicUrl} alignments={alignments} frame={frame} fps={fps} hookFrames={HOOK_FRAMES} />}

      {/* ── Captions Overlay ── */}
      {captionsEnabled !== false && (
        <AbsoluteFill style={{ pointerEvents: "none" }}>
          {/* Pass hookFrames so captions compare against audio-relative time, not composition time */}
          <CaptionsOverlay alignments={alignments} frame={frame} fps={fps} isShort={isShort} style={style} scenes={scenes} sceneFrames={sceneFrames} hookFrames={HOOK_FRAMES} />
        </AbsoluteFill>
      )}

      {/* ── Bottom vignette gradient ── */}
      <AbsoluteFill
        style={{
          background: isShort
            ? `linear-gradient(to top, rgba(0,0,0,${style.vignetteStrength}) 0%, rgba(0,0,0,0.3) 35%, transparent 60%)`
            : `linear-gradient(to top, rgba(0,0,0,${style.vignetteStrength - 0.12}) 0%, rgba(0,0,0,0.2) 30%, transparent 55%)`,
          pointerEvents: "none",
        }}
      />

      {/* ── Progress Bar (Shorts retention trick) ── */}
      {isShort && (
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            width: "100%",
            height: "5px",
            backgroundColor: "rgba(255,255,255,0.15)",
            zIndex: 100,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress * 100}%`,
              background: `linear-gradient(90deg, ${style.accentColor}, ${style.secondaryAccent})`,
              boxShadow: `0 0 8px ${style.accentColor}`,
              transition: "width 0.1s linear",
            }}
          />
        </div>
      )}
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────
// Hook Title Card: full-screen bold title (first 1.5s)
// ─────────────────────────────────────────────
const HookTitleCard: React.FC<{
  title: string;
  frame: number;
  fps: number;
  hookFrames: number;
  style: ReturnType<typeof getVideoStylePreset>;
}> = ({ title, frame, fps, hookFrames, style }) => {
  const scaleIn = spring({ frame, fps, config: { damping: 14, stiffness: 180, mass: 0.8 } });
  const scale = interpolate(scaleIn, [0, 1], [0.7, 1.0]);

  const fadeOut = interpolate(frame, [hookFrames - 8, hookFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Split title into words for staggered entrance
  const words = title.split(" ");

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(160deg, #0a0a0a 0%, #111 60%, rgba(0,0,0,0.95) 100%)`,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 8%",
        opacity: fadeOut,
      }}
    >
      {/* Accent line top */}
      <div style={{
        width: "60px",
        height: "4px",
        background: style.accentColor,
        marginBottom: "32px",
        borderRadius: "2px",
        boxShadow: `0 0 16px ${style.accentColor}`,
        transform: `scale(${scale})`,
      }} />

      <div
        style={{
          fontSize: 96,
          fontWeight: 900,
          color: "#FFFFFF",
          textAlign: "center",
          lineHeight: 1.05,
          textTransform: "uppercase",
          letterSpacing: "-0.02em",
          transform: `scale(${scale})`,
          textShadow: `0 0 60px rgba(0,0,0,0.5)`,
        }}
      >
        {words.map((word, i) => {
          const wordFrame = Math.max(0, frame - i * 3);
          const wordSpring = spring({ frame: wordFrame, fps, config: { damping: 16, stiffness: 200, mass: 0.6 } });
          const wordY = interpolate(wordSpring, [0, 1], [30, 0]);
          const wordOpacity = interpolate(wordSpring, [0, 1], [0, 1]);
          return (
            <span
              key={i}
              style={{
                display: "inline-block",
                transform: `translateY(${wordY}px)`,
                opacity: wordOpacity,
                marginRight: "0.25em",
                color: i === 0 ? style.accentColor : "#FFFFFF",
              }}
            >
              {word}
            </span>
          );
        })}
      </div>

      {/* Accent line bottom */}
      <div style={{
        width: "60px",
        height: "4px",
        background: style.secondaryAccent,
        marginTop: "32px",
        borderRadius: "2px",
        opacity: 0.7,
        transform: `scale(${scale})`,
      }} />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────
// FlashCut: 2-frame white flash at scene transitions
// ─────────────────────────────────────────────
const FlashCut: React.FC<{ frame: number }> = ({ frame }) => {
  const opacity = interpolate(frame, [0, 2, 4], [0.55, 0.2, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  if (opacity <= 0) return null;
  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#FFFFFF",
        opacity,
        pointerEvents: "none",
      }}
    />
  );
};

// ─────────────────────────────────────────────
// ColorGradingOverlay: semi-transparent tint per style preset
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// FilmGrain: shifts an SVG turbulence noise on every frame
// ─────────────────────────────────────────────
const FilmGrain: React.FC = () => {
  const frame = useCurrentFrame();
  const seed = frame % 100;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <svg style={{ width: "100%", height: "100%", opacity: 0.08 }}>
        <filter id="noiseFilter">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.65"
            numOctaves="3"
            stitchTiles="stitch"
            seed={seed}
          />
          <feColorMatrix type="matrix" values="0 0 0 0 0   0 0 0 0 0   0 0 0 0 0  0 0 0 0.45 0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#noiseFilter)" />
      </svg>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────
// ColorGradingOverlay: semi-transparent tint per style preset
// ─────────────────────────────────────────────
const ColorGradingOverlay: React.FC<{ stylePresetName?: string }> = ({ stylePresetName }) => {
  if (stylePresetName === "tech_history_fast") {
    // Cool blue-teal grade
    return (
      <AbsoluteFill
        style={{
          background: "linear-gradient(160deg, rgba(14,30,60,0.18) 0%, rgba(0,40,60,0.12) 100%)",
          mixBlendMode: "multiply",
          pointerEvents: "none",
        }}
      />
    );
  }
  if (stylePresetName === "horror_dark") {
    // Moody dark red and deep purple shadows
    return (
      <AbsoluteFill
        style={{
          background: "linear-gradient(160deg, rgba(40,0,10,0.22) 0%, rgba(15,0,30,0.28) 100%)",
          mixBlendMode: "multiply",
          pointerEvents: "none",
        }}
      />
    );
  }
  if (stylePresetName === "spirituality_calm") {
    // Mystical forest-green and warm gold highlight grading
    return (
      <AbsoluteFill
        style={{
          background: "linear-gradient(135deg, rgba(6,78,59,0.14) 0%, rgba(245,158,11,0.08) 100%)",
          mixBlendMode: "color-burn",
          pointerEvents: "none",
        }}
      />
    );
  }
  // Default: business_documentary_dark — warm amber/brown grade
  return (
    <AbsoluteFill
      style={{
        background: "linear-gradient(160deg, rgba(40,20,0,0.15) 0%, rgba(60,30,0,0.08) 100%)",
        mixBlendMode: "multiply",
        pointerEvents: "none",
      }}
    />
  );
};

// ─────────────────────────────────────────────
// MusicTrack: smart volume ducking
// Ducks to 0.06 when narration is active, rises to 0.14 in gaps
// hookFrames: offset to align ducking with the delayed narration audio
// ─────────────────────────────────────────────
const MusicTrack: React.FC<{
  musicUrl: string;
  alignments: WordAlignment[];
  frame: number;
  fps: number;
  hookFrames?: number;
}> = ({ musicUrl, alignments, frame, fps, hookFrames = 0 }) => {
  // Use audio-relative time (offset by hook card) so ducking matches narration
  const currentTime = Math.max(0, (frame - hookFrames)) / fps;

  // Is narration currently active?
  const isSpeaking = alignments.some(
    (w) => currentTime >= w.start - 0.1 && currentTime <= w.end + 0.2
  );

  // During hook card (before narration starts) play at full volume
  const isHookCard = frame < hookFrames;
  const volume = isHookCard ? 0.14 : (isSpeaking ? 0.06 : 0.14);

  return <Audio src={musicUrl} volume={volume} loop />;
};

// ─────────────────────────────────────────────
// SceneElement: Ken Burns + zoom punch-out on entry + fade in
// ─────────────────────────────────────────────
const SceneElement: React.FC<{
  filename: string;
  durationFrames: number;
  mode: KenBurnsMode;
  fps: number;
  isFirst: boolean;
}> = ({ filename, durationFrames, mode, fps, isFirst }) => {
  const frame = useCurrentFrame();
  const progress = durationFrames > 0 ? Math.min(frame / durationFrames, 1) : 0;

  // Fade in only — first scene fades in slower for impact
  const fadeInDuration = isFirst ? 12 : 6;
  const opacity = interpolate(frame, [0, fadeInDuration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Zoom punch-out: scale 1.10 → 1.0 in first 8 frames (camera punch effect)
  const punchScale = interpolate(frame, [0, 8], [1.10, 1.0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  // Ken Burns continuous motion on top of punch-out
  let kbScale = 1.0;
  let kbTranslateX = 0;
  let kbTranslateY = 0;

  switch (mode) {
    case "zoom-in":
      kbScale = 1.0 + 0.12 * progress;
      break;
    case "zoom-out":
      kbScale = 1.12 - 0.12 * progress;
      break;
    case "pan-left":
      kbScale = 1.10;
      kbTranslateX = -4 + 8 * progress;
      break;
    case "pan-right":
      kbScale = 1.10;
      kbTranslateX = 4 - 8 * progress;
      break;
    case "pan-up":
      kbScale = 1.10;
      kbTranslateY = 3 - 6 * progress;
      break;
  }

  const finalScale = punchScale * kbScale;
  const transform = `scale(${finalScale}) translateX(${kbTranslateX}%) translateY(${kbTranslateY}%)`;

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
// SceneOverlay: Editorial headline/stat/quote/timeline/comparison
// ─────────────────────────────────────────────
const SceneOverlay: React.FC<{
  scene: Scene;
  frame: number;
  durationFrames: number;
  isShort: boolean;
  style: ReturnType<typeof getVideoStylePreset>;
}> = ({ scene, frame, durationFrames, isShort, style }) => {
  const type = scene.sceneType || "image";
  if (type === "image" || (!scene.headline && !scene.emphasis)) return null;

  const opacity = interpolate(frame, [0, 8, Math.max(9, durationFrames - 8), durationFrames], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const slide = interpolate(frame, [0, 10], [18, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const headlineSize = isShort ? 62 : 52;
  const emphasisSize = isShort ? 42 : 34;

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          top: isShort ? "8%" : "9%",
          left: isShort ? "7%" : "6%",
          maxWidth: isShort ? "86%" : "58%",
          opacity,
          transform: `translateY(${slide}px)`,
          padding: isShort ? "22px 24px" : "20px 26px",
          borderLeft: `8px solid ${style.accentColor}`,
          background: style.titleBackground,
          boxShadow: "0 18px 48px rgba(0,0,0,0.45)",
          backdropFilter: "blur(8px)",
        }}
      >
        <div
          style={{
            color: style.accentColor,
            fontSize: isShort ? 22 : 18,
            fontWeight: 900,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: 10,
          }}
        >
          {getSceneLabel(type)}
        </div>
        {scene.headline && (
          <div
            style={{
              color: "#fff",
              fontSize: headlineSize,
              fontWeight: 950,
              lineHeight: 0.96,
              textTransform: "uppercase",
              textShadow: "0 4px 20px rgba(0,0,0,0.65)",
            }}
          >
            {scene.headline}
          </div>
        )}
        {scene.emphasis && (
          <div
            style={{
              display: "inline-block",
              marginTop: 14,
              padding: "5px 12px",
              color: "#050505",
              background: type === "comparison" ? style.secondaryAccent : style.accentColor,
              fontSize: emphasisSize,
              fontWeight: 950,
              lineHeight: 1,
              textTransform: "uppercase",
            }}
          >
            {scene.emphasis}
          </div>
        )}
      </div>
    </AbsoluteFill>
  );
};

function getSceneLabel(type: SceneType): string {
  switch (type) {
    case "headline": return "Breaking Point";
    case "stat":     return "Key Number";
    case "quote":    return "What They Said";
    case "timeline": return "Timeline";
    case "comparison": return "Then vs Now";
    default:         return "Story Beat";
  }
}

// ─────────────────────────────────────────────
// CaptionsOverlay: TikTok-style animated word-by-word
// ─────────────────────────────────────────────
const CaptionsOverlay: React.FC<{
  alignments: WordAlignment[];
  frame: number;
  fps: number;
  isShort: boolean;
  style: ReturnType<typeof getVideoStylePreset>;
  scenes: Scene[];
  sceneFrames: { start: number; durationFrames: number }[];
  hookFrames?: number;
}> = ({ alignments, frame, fps, isShort, style, scenes, sceneFrames, hookFrames = 0 }) => {
  if (!alignments || alignments.length === 0) return null;

  // Don't show any captions during the hook title card
  if (frame < hookFrames) return null;

  const WORDS_PER_LINE = isShort ? style.wordsPerLineShort : 4;
  // currentTime must be relative to when audio starts (after hook card), not absolute composition time
  const currentTime = (frame - hookFrames) / fps;

  // Find the currently active word
  const activeIndex = alignments.findIndex(
    (w) => currentTime >= w.start && currentTime <= w.end
  );

  let displayIndex = activeIndex;
  if (displayIndex === -1) {
    const upcoming = alignments.findIndex((w) => w.start > currentTime);
    if (upcoming > 0 && currentTime - alignments[upcoming - 1].end < 0.8) {
      displayIndex = upcoming - 1;
    } else {
      return null;
    }
  }

  const lineStart = Math.floor(displayIndex / WORDS_PER_LINE) * WORDS_PER_LINE;
  const lineEnd = Math.min(lineStart + WORDS_PER_LINE, alignments.length);
  const lineWords = alignments.slice(lineStart, lineEnd);

  const fontSize = isShort ? 84 : 52;

  // Dynamic positioning: if there's an editorial overlay on current scene, push captions lower
  const currentSceneIdx = sceneFrames.findIndex(
    (sf) => frame >= sf.start && frame < sf.start + sf.durationFrames
  );
  const currentScene = currentSceneIdx >= 0 ? scenes[currentSceneIdx] : null;
  const hasOverlay = currentScene && currentScene.sceneType !== "image" && (currentScene.headline || currentScene.emphasis);

  // If editorial overlay is at top, captions stay at center-bottom
  // If no overlay, captions go to standard position
  const captionBottom = isShort
    ? (hasOverlay ? "22%" : style.shortCaptionBottom)
    : "12%";

  return (
    <div
      style={{
        position: "absolute",
        bottom: captionBottom,
        left: "5%",
        right: "5%",
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        alignItems: "center",
        gap: isShort ? "12px" : "8px",
        padding: "16px 24px",
      }}
    >
      {lineWords.map((w, idx) => {
        const globalIdx = lineStart + idx;
        const isActive = globalIdx === activeIndex;

        // Check if this word matches the current scene's emphasis
        const emphasisWord = currentScene?.emphasis?.toLowerCase();
        const isEmphasis = emphasisWord && w.word.toLowerCase().includes(emphasisWord.toLowerCase());

        // Word slide-in animation: each word slides up from below on line change
        const wordEntryFrame = frame - (sceneFrames[0]?.start ?? 0);
        const slideY = interpolate(
          Math.min(wordEntryFrame, 6),
          [0, 6],
          [14, 0],
          { extrapolateLeft: "clamp", extrapolateRight: "clamp" }
        );

        let textColor = isActive ? style.captionActiveColor : style.captionTextColor;
        let bgColor = isActive ? style.captionBackground : "transparent";
        let scale = isActive ? 1.28 : 1.0;
        let border = "none";

        if (isEmphasis && !isActive) {
          // Emphasis word (but not currently active) — subtle accent highlight
          textColor = style.secondaryAccent;
        }
        if (isEmphasis && isActive) {
          // Emphasis word AND currently being spoken — full accent
          textColor = style.accentColor;
          bgColor = `rgba(0,0,0,0.35)`;
          border = `2px solid ${style.accentColor}`;
          scale = 1.35;
        }

        return (
          <span
            key={globalIdx}
            style={{
              fontSize,
              fontWeight: 900,
              lineHeight: 1.1,
              color: textColor,
              textShadow: "3px 3px 0 #000, -3px -3px 0 #000, 3px -3px 0 #000, -3px 3px 0 #000, 0 0 20px rgba(0,0,0,0.8)",
              textTransform: "uppercase",
              letterSpacing: "0.02em",
              display: "inline-block",
              transform: `translateY(${slideY}px) scale(${scale})`,
              transition: "transform 0.05s ease, color 0.05s ease",
              willChange: "transform",
              padding: isActive ? "2px 10px" : "2px 4px",
              borderRadius: isActive ? "8px" : "0",
              background: bgColor,
              border,
            }}
          >
            {w.word}
          </span>
        );
      })}
    </div>
  );
};

interface BrandedOutroProps {
  branding: {
    channelName: string;
    tagline: string;
    accentColor: string;
    secondaryColor: string;
    outroMessage: string;
    logoEmoji: string;
  };
  fps: number;
  frame: number;
}

const BrandedOutro: React.FC<BrandedOutroProps> = ({ branding, fps, frame }) => {
  const scaleIn = spring({ frame, fps, config: { damping: 12, stiffness: 150 } });
  const logoScale = interpolate(scaleIn, [0, 1], [0.5, 1]);
  const textOpacity = interpolate(frame, [0, 15], [0, 1], { extrapolateRight: "clamp" });
  
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle, ${branding.secondaryColor || '#a855f7'}22 0%, #000 70%)`,
        backgroundColor: "#080808",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "0 10%",
      }}
    >
      {/* Glowing Outer Circle */}
      <div
        style={{
          width: "160px",
          height: "160px",
          borderRadius: "50%",
          background: `linear-gradient(135deg, ${branding.accentColor || '#f97316'}, ${branding.secondaryColor || '#a855f7'})`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: `0 0 40px ${(branding.accentColor || '#f97316')}44`,
          transform: `scale(${logoScale})`,
          marginBottom: "30px",
        }}
      >
        <span style={{ fontSize: "70px" }}>{branding.logoEmoji || "🎬"}</span>
      </div>

      {/* Channel Name */}
      <h1
        style={{
          color: "#ffffff",
          fontSize: "48px",
          fontWeight: 900,
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          margin: 0,
          opacity: textOpacity,
          textShadow: `0 0 20px ${(branding.accentColor || '#f97316')}66`,
          textAlign: "center",
        }}
      >
        {branding.channelName}
      </h1>

      {/* Tagline */}
      <p
        style={{
          color: "rgba(255,255,255,0.7)",
          fontSize: "20px",
          fontWeight: 500,
          margin: "10px 0 35px 0",
          opacity: textOpacity,
          textAlign: "center",
        }}
      >
        {branding.tagline}
      </p>

      {/* Outro Message / Subscribe Button CTA */}
      <div
        style={{
          padding: "12px 30px",
          borderRadius: "30px",
          background: `linear-gradient(90deg, ${branding.accentColor || '#f97316'}, ${branding.secondaryColor || '#a855f7'})`,
          color: "#fff",
          fontSize: "18px",
          fontWeight: 700,
          textTransform: "uppercase",
          boxShadow: `0 0 25px ${(branding.accentColor || '#f97316')}55`,
          transform: `scale(${scaleIn})`,
          opacity: textOpacity,
          textAlign: "center",
        }}
      >
        {branding.outroMessage}
      </div>
    </AbsoluteFill>
  );
};

