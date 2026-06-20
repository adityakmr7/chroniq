import { registerRoot, Composition } from "remotion";
import { VideoComposition } from "./VideoComposition.tsx";
import React from "react";

const Root: React.FC = () => {
  return (
    <Composition
      id="main-video"
      component={VideoComposition as unknown as React.FC<Record<string, unknown>>}
      durationInFrames={900}
      fps={25}
      width={1080}
      height={1920}
      defaultProps={{
        scenes: [],
        audioUrl: "",
        alignments: [],
        isShort: true,
        stylePresetName: "business_documentary_dark",
      }}
    />
  );
};

registerRoot(Root);
