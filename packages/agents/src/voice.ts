import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { unlink } from "node:fs/promises";

export interface WordAlignment {
  word: string;
  start: number;
  end: number;
}

export interface VoiceGenerationResult {
  audioBuffer: ArrayBuffer;
  alignments?: WordAlignment[];
}

/**
 * Align character-level timestamps into word-level timestamps.
 */
export function alignCharactersToWords(
  characters: string[],
  startTimes: number[],
  endTimes: number[]
): WordAlignment[] {
  if (
    !characters ||
    !startTimes ||
    !endTimes ||
    characters.length !== startTimes.length ||
    characters.length !== endTimes.length
  ) {
    return [];
  }

  const words: WordAlignment[] = [];
  let currentWord = "";
  let wordStart: number | null = null;
  let wordEnd = 0;

  for (let i = 0; i < characters.length; i++) {
    const char = characters[i];
    const start = startTimes[i];
    const end = endTimes[i];

    // Check if whitespace
    if (/\s/.test(char)) {
      if (currentWord.length > 0) {
        words.push({
          word: currentWord,
          start: wordStart ?? start,
          end: wordEnd,
        });
        currentWord = "";
        wordStart = null;
      }
    } else {
      if (wordStart === null) {
        wordStart = start;
      }
      currentWord += char;
      wordEnd = end;
    }
  }

  // Final word check
  if (currentWord.length > 0) {
    words.push({
      word: currentWord,
      start: wordStart ?? 0,
      end: wordEnd,
    });
  }

  return words;
}

/**
 * Estimate timestamps based on total audio duration (fallback for local TTS models).
 */
export function estimateTimestamps(text: string, duration: number): WordAlignment[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const avgWordDuration = duration / words.length;

  return words.map((word, index) => {
    const start = index * avgWordDuration;
    const end = start + avgWordDuration;
    return {
      word,
      start: Math.round(start * 100) / 100,
      end: Math.round(end * 100) / 100,
    };
  });
}

/**
 * Extracts the duration of an audio buffer in seconds using FFmpeg.
 */
export async function extractAudioDuration(buffer: ArrayBuffer): Promise<number> {
  const ffmpegPath = ffmpegInstaller.path;
  const tempPath = `temp_duration_${Date.now()}_${Math.random().toString(36).substring(2, 9)}.mp3`;
  await Bun.write(tempPath, buffer);

  try {
    const proc = Bun.spawn([ffmpegPath, "-i", tempPath], {
      stdout: "pipe",
      stderr: "pipe",
    });

    const stderrText = await new Response(proc.stderr).text();
    await proc.exited;

    const match = stderrText.match(/Duration: (\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
    if (!match) {
      console.warn("⚠️ Could not extract audio duration from FFmpeg output. Defaulting to 15s.");
      return 15.0;
    }

    const hours = parseInt(match[1]);
    const minutes = parseInt(match[2]);
    const seconds = parseInt(match[3]);
    const centiseconds = parseInt(match[4]);
    return hours * 3600 + minutes * 60 + seconds + centiseconds / 100;
  } finally {
    try {
      await unlink(tempPath);
    } catch {
      // Ignore
    }
  }
}

export async function generateVoice(
  text: string,
  withTimestamps = true
): Promise<VoiceGenerationResult> {
  const provider = process.env.TTS_PROVIDER || "cloud";

  if (provider === "local") {
    const url = process.env.KOKORO_URL || "http://localhost:8880";
    const voice = process.env.KOKORO_VOICE || "af_bella";
    const endpoint = `${url}/v1/audio/speech`;

    console.log(`     🎙️  Generating local voice via Kokoro TTS (Voice: ${voice})...`);
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "kokoro",
        voice: voice,
        input: text,
      }),
    });

    if (!res.ok) {
      throw new Error(`Local Kokoro TTS failed: ${res.status} ${await res.text()}`);
    }

    const audioBuffer = await res.arrayBuffer();

    if (withTimestamps) {
      // Extract exact duration from file using FFmpeg and align words proportionally
      const duration = await extractAudioDuration(audioBuffer);
      const alignments = estimateTimestamps(text, duration);
      return {
        audioBuffer,
        alignments,
      };
    }

    return { audioBuffer };
  } else {
    // Cloud ElevenLabs
    const apiKey = process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error("ELEVENLABS_API_KEY is not set. Copy .env.example to .env and fill it in.");
    }

    const voiceId = process.env.ELEVENLABS_VOICE_ID || "pNInz6obpgDQGcFmaJgB"; // Default: Adam

    if (withTimestamps) {
      const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      });

      if (!res.ok) {
        throw new Error(`ElevenLabs TTS with timestamps failed: ${res.status} ${await res.text()}`);
      }

      const data = (await res.json()) as {
        audio_base64: string;
        alignment: {
          characters: string[];
          character_start_times_seconds: number[];
          character_end_times_seconds: number[];
        };
      };

      // Decode base64 audio
      const binaryString = atob(data.audio_base64);
      const len = binaryString.length;
      const bytes = new Uint8Array(len);
      for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const audioBuffer = bytes.buffer;

      const alignments = alignCharactersToWords(
        data.alignment.characters,
        data.alignment.character_start_times_seconds,
        data.alignment.character_end_times_seconds
      );

      return {
        audioBuffer,
        alignments,
      };
    } else {
      const endpoint = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

      const res = await fetch(endpoint, {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: text,
          model_id: "eleven_multilingual_v2",
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
          },
        }),
      });

      if (!res.ok) {
        throw new Error(`ElevenLabs TTS failed: ${res.status} ${await res.text()}`);
      }

      const audioBuffer = await res.arrayBuffer();
      return { audioBuffer };
    }
  }
}
