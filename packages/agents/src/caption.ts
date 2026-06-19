import type { WordAlignment } from "./voice.ts";

function formatASSTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const c = Math.floor((seconds % 1) * 100);

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${h}:${pad(m)}:${pad(s)}.${String(c).padStart(2, "0")}`;
}

function formatSRTTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${String(ms).padStart(3, "0")}`;
}

export function groupAlignments(
  alignments: WordAlignment[],
  maxWordsPerLine = 4
): WordAlignment[][] {
  const lines: WordAlignment[][] = [];
  let currentLine: WordAlignment[] = [];

  for (let i = 0; i < alignments.length; i++) {
    const word = alignments[i];

    // Check if we should split before adding this word
    let shouldSplit = false;
    if (currentLine.length > 0) {
      const prevWord = currentLine[currentLine.length - 1];
      const gap = word.start - prevWord.end;
      const endsWithPunctuation = /[.,!?;:]$/.test(prevWord.word);

      if (currentLine.length >= maxWordsPerLine) {
        shouldSplit = true;
      } else if (gap > 0.8) {
        shouldSplit = true;
      } else if (endsWithPunctuation && gap > 0.3) {
        shouldSplit = true;
      }
    }

    if (shouldSplit) {
      lines.push(currentLine);
      currentLine = [];
    }

    currentLine.push(word);
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines;
}

export function generateASS(alignments: WordAlignment[]): string {
  const lines = groupAlignments(alignments, 3); // 3-4 words per line is punchy for Shorts
  
  let ass = `[Script Info]
Title: Chroniq Subtitles
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Impact,72,&H0000FFFF,&H00FFFFFF,&H00000000,&H80000000,-1,0,0,0,100,100,0,0,1,5,2,2,10,10,450,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  for (const lineWords of lines) {
    const startSec = lineWords[0].start;
    const endSec = lineWords[lineWords.length - 1].end;

    const startStr = formatASSTime(startSec);
    const endStr = formatASSTime(endSec);

    // Build karaoke text
    let textParts = "";
    for (let i = 0; i < lineWords.length; i++) {
      const w = lineWords[i];
      // Duration in centiseconds
      let durationCs = 0;
      if (i < lineWords.length - 1) {
        durationCs = Math.round((lineWords[i + 1].start - w.start) * 100);
      } else {
        durationCs = Math.round((w.end - w.start) * 100);
      }

      // Safeguard against zero/negative duration
      if (durationCs <= 0) durationCs = 10;

      textParts += `{\\kf${durationCs}}${w.word} `;
    }

    ass += `Dialogue: 0,${startStr},${endStr},Default,,0,0,0,,${textParts.trim()}\n`;
  }

  return ass;
}

export function generateSRT(alignments: WordAlignment[]): string {
  const lines = groupAlignments(alignments, 4);
  let srt = "";

  for (let idx = 0; idx < lines.length; idx++) {
    const lineWords = lines[idx];
    const startSec = lineWords[0].start;
    const endSec = lineWords[lineWords.length - 1].end;

    const startStr = formatSRTTime(startSec);
    const endStr = formatSRTTime(endSec);

    const phrase = lineWords.map((w) => w.word).join(" ");

    srt += `${idx + 1}\n`;
    srt += `${startStr} --> ${endStr}\n`;
    srt += `${phrase}\n\n`;
  }

  return srt.trim();
}
