import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  continueRender,
  delayRender,
  staticFile,
} from "remotion";
import React, { useEffect, useState } from "react";

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

export const VideoComposition: React.FC<VideoCompositionProps> = ({
  scenes,
  audioUrl,
  alignments,
  isShort,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  let sceneStartFrame = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: "black", fontFamily: "Helvetica, Arial, sans-serif" }}>
      {/* Render Scenes */}
      {scenes.map((scene, index) => {
        const sceneDurationFrames = Math.round(scene.duration * fps);
        const startFrame = sceneStartFrame;
        sceneStartFrame += sceneDurationFrames;

        return (
          <Sequence
            key={index}
            from={startFrame}
            durationInFrames={sceneDurationFrames}
          >
            <SceneElement
              filename={scene.filename}
              durationFrames={sceneDurationFrames}
            />
          </Sequence>
        );
      })}

      {/* Background Audio */}
      {audioUrl && <Audio src={audioUrl} />}

      {/* Highlighted Captions */}
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", pointerEvents: "none" }}>
        <CaptionsOverlay alignments={alignments} frame={frame} fps={fps} isShort={isShort} />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const SceneElement: React.FC<{ filename: string; durationFrames: number }> = ({
  filename,
  durationFrames,
}) => {
  const frame = useCurrentFrame();
  // Ken Burns zoom effect: zoom from 1.0 to 1.15 over the duration
  const progress = durationFrames > 0 ? frame / durationFrames : 0;
  const scale = 1 + 0.15 * progress;

  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <Img
        src={filename}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale})`,
          transformOrigin: "center center",
        }}
        onError={() => {
          console.error(`[Remotion] Failed to load image: ${filename}`);
        }}
      />
    </AbsoluteFill>
  );
};

const CaptionsOverlay: React.FC<{
  alignments: WordAlignment[];
  frame: number;
  fps: number;
  isShort: boolean;
}> = ({ alignments, frame, fps, isShort }) => {
  if (!alignments || alignments.length === 0) return null;

  const currentTime = frame / fps;

  // Find active word
  const activeIndex = alignments.findIndex(
    (w) => currentTime >= w.start && currentTime <= w.end
  );

  if (activeIndex === -1) {
    // Show the word that just finished to avoid blank captions between words
    const upcomingIndex = alignments.findIndex((w) => w.start > currentTime);
    if (upcomingIndex > 0) {
      const lastWord = alignments[upcomingIndex - 1];
      if (currentTime - lastWord.end < 1.0) {
        return (
          <div style={getContainerStyle(isShort)}>
            <span style={getWordStyle(false, isShort)}>{lastWord.word}</span>
          </div>
        );
      }
    }
    return null;
  }

  // Display a 3-word window: previous, active, next
  const startIdx = Math.max(0, activeIndex - 1);
  const endIdx = Math.min(alignments.length, activeIndex + 2);
  const visibleWords = alignments.slice(startIdx, endIdx);

  return (
    <div style={getContainerStyle(isShort)}>
      {visibleWords.map((w, idx) => {
        const globalIdx = startIdx + idx;
        const isWordActive = globalIdx === activeIndex;
        return (
          <span key={globalIdx} style={getWordStyle(isWordActive, isShort)}>
            {w.word}
          </span>
        );
      })}
    </div>
  );
};

const getContainerStyle = (isShort: boolean): React.CSSProperties => ({
  position: "absolute",
  bottom: isShort ? "32%" : "15%",
  width: "90%",
  display: "flex",
  flexWrap: "wrap",
  justifyContent: "center",
  gap: "12px",
  padding: "20px",
  borderRadius: "15px",
});

const getWordStyle = (isActive: boolean, isShort: boolean): React.CSSProperties => ({
  fontSize: isShort ? "64px" : "48px",
  fontWeight: 900,
  color: isActive ? "#fcd34d" : "white",
  textShadow:
    "6px 6px 0px #000, -2px -2px 0px #000, 2px -2px 0px #000, -2px 2px 0px #000, 0px 4px 10px rgba(0,0,0,0.5)",
  textTransform: "uppercase",
  transform: isActive ? "scale(1.15) rotate(-2deg)" : "scale(1.0)",
  display: "inline-block",
});
