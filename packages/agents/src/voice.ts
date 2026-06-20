import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import { unlink, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as tls from "node:tls";
import * as crypto from "node:crypto";

export interface WordAlignment {
  word: string;
  start: number;
  end: number;
}

export interface VoiceGenerationResult {
  audioBuffer: ArrayBuffer;
  alignments?: WordAlignment[];
}

// ─── Available voices reference ───────────────────────────────────────────────
export const KOKORO_VOICES = [
  { id: "af_bella",    label: "Bella (US Female)",     lang: "en" },
  { id: "af_sarah",    label: "Sarah (US Female)",     lang: "en" },
  { id: "af_nicole",   label: "Nicole (US Female)",    lang: "en" },
  { id: "am_adam",     label: "Adam (US Male)",        lang: "en" },
  { id: "am_michael",  label: "Michael (US Male)",     lang: "en" },
  { id: "bf_emma",     label: "Emma (UK Female)",      lang: "en" },
  { id: "bm_george",   label: "George (UK Male)",      lang: "en" },
  { id: "bm_lewis",    label: "Lewis (UK Male)",       lang: "en" },
];

// Edge TTS voices — Microsoft Azure voices, completely free
export const EDGE_VOICES = [
  // English
  { id: "en-US-AriaNeural",       label: "Aria (US Female)",      lang: "en" },
  { id: "en-US-GuyNeural",        label: "Guy (US Male)",         lang: "en" },
  { id: "en-US-JennyNeural",      label: "Jenny (US Female)",     lang: "en" },
  { id: "en-GB-SoniaNeural",      label: "Sonia (UK Female)",     lang: "en" },
  { id: "en-GB-RyanNeural",       label: "Ryan (UK Male)",        lang: "en" },
  // Hindi
  { id: "hi-IN-SwaraNeural",      label: "Swara (Hindi Female)",  lang: "hi" },
  { id: "hi-IN-MadhurNeural",     label: "Madhur (Hindi Male)",   lang: "hi" },
];

// All available voices for the dashboard dropdown
export const ALL_VOICES = {
  kokoro: KOKORO_VOICES,
  edge: EDGE_VOICES,
  elevenlabs: [
    { id: "pNInz6obpgDQGcFmaJgB", label: "Adam (Default)",         lang: "en" },
    { id: "21m00Tcm4TlvDq8ikWAM", label: "Rachel (Female)",        lang: "en" },
    { id: "AZnzlk1XvdvUeBnXmlld", label: "Domi (Female)",          lang: "en" },
    { id: "EXAVITQu4vr4xnSDxMaL", label: "Bella (Female)",         lang: "en" },
    { id: "ErXwobaYiN019PkySvjV", label: "Antoni (Male)",          lang: "en" },
    { id: "MF3mGyEYCl7XYWbV9V6O", label: "Elli (Female)",          lang: "en" },
  ],
};

// All helper logic for TLS Frame parser and Builder for WebSocket
const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';
const WIN_EPOCH = 11644473600;

function getSecMsGec() {
  let ticks = Math.floor(Date.now() / 1000);
  ticks += WIN_EPOCH;
  ticks -= ticks % 300;
  ticks *= 10000000;
  const strToHash = ticks.toFixed(0) + TRUSTED_CLIENT_TOKEN;
  return crypto.createHash('sha256').update(strToHash, 'ascii').digest('hex').toUpperCase();
}

function buildFrame(opcode: number, payload: Buffer): Buffer {
  const len = payload.length;
  let headerLen = 2 + 4; // opcode + len byte + 4 bytes mask
  if (len >= 126 && len <= 65535) {
    headerLen += 2;
  } else if (len > 65535) {
    headerLen += 8;
  }
  const frame = Buffer.alloc(headerLen + len);
  frame[0] = 0x80 | opcode; // FIN = 1
  
  let offset = 2;
  if (len <= 125) {
    frame[1] = 0x80 | len;
  } else if (len <= 65535) {
    frame[1] = 0x80 | 126;
    frame.writeUInt16BE(len, 2);
    offset += 2;
  } else {
    frame[1] = 0x80 | 127;
    frame.writeBigUInt64BE(BigInt(len), 2);
    offset += 8;
  }
  
  const maskKey = crypto.randomBytes(4);
  maskKey.copy(frame, offset);
  offset += 4;
  
  for (let i = 0; i < len; i++) {
    frame[offset + i] = payload[i] ^ maskKey[i % 4];
  }
  return frame;
}

class FrameParser {
  private buffer: Buffer = Buffer.alloc(0);

  add(data: Buffer) {
    this.buffer = Buffer.concat([this.buffer, data]);
  }

  next(): { opcode: number; payload: Buffer } | null {
    if (this.buffer.length < 2) return null;
    const opcode = this.buffer[0] & 0x0f;
    const mask = (this.buffer[1] & 0x80) !== 0;
    let payloadLen = this.buffer[1] & 0x7f;
    let offset = 2;

    if (payloadLen === 126) {
      if (this.buffer.length < 4) return null;
      payloadLen = this.buffer.readUInt16BE(2);
      offset += 2;
    } else if (payloadLen === 127) {
      if (this.buffer.length < 10) return null;
      payloadLen = Number(this.buffer.readBigUInt64BE(2));
      offset += 8;
    }

    const totalLen = offset + (mask ? 4 : 0) + payloadLen;
    if (this.buffer.length < totalLen) return null;

    if (mask) {
      const maskKey = this.buffer.subarray(offset, offset + 4);
      offset += 4;
      const payload = Buffer.alloc(payloadLen);
      for (let i = 0; i < payloadLen; i++) {
        payload[i] = this.buffer[offset + i] ^ maskKey[i % 4];
      }
      this.buffer = this.buffer.subarray(totalLen);
      return { opcode, payload };
    } else {
      const payload = this.buffer.subarray(offset, offset + payloadLen);
      this.buffer = this.buffer.subarray(totalLen);
      return { opcode, payload: Buffer.from(payload) };
    }
  }
}

/**
 * Align character-level timestamps into word-level timestamps.
 */
export function alignCharactersToWords(
  characters: string[],
  startTimes: number[],
  endTimes: number[]
): WordAlignment[] {
  if (!characters || !startTimes || !endTimes || characters.length !== startTimes.length) return [];

  const words: WordAlignment[] = [];
  let currentWord = "";
  let wordStart: number | null = null;
  let wordEnd = 0;

  for (let i = 0; i < characters.length; i++) {
    const char = characters[i];
    const start = startTimes[i];
    const end = endTimes[i];

    if (/\s/.test(char)) {
      if (currentWord.length > 0) {
        words.push({ word: currentWord, start: wordStart ?? start, end: wordEnd });
        currentWord = "";
        wordStart = null;
      }
    } else {
      if (wordStart === null) wordStart = start;
      currentWord += char;
      wordEnd = end;
    }
  }

  if (currentWord.length > 0) {
    words.push({ word: currentWord, start: wordStart ?? 0, end: wordEnd });
  }

  return words;
}

/**
 * Estimate word timestamps proportionally from total duration, factoring in punctuation pauses
 * to prevent subtitles from drifting ahead during pauses.
 */
export function estimateTimestamps(text: string, duration: number): WordAlignment[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];

  // Calculate weights for each word. Base weight is clean alphanumeric character length.
  // Punctuation characters add pauses of varying lengths.
  const weights = words.map(word => {
    const baseWeight = Math.max(1, word.replace(/[^a-zA-Z0-9\u0900-\u097F]/g, "").length);
    let pauseWeight = 0;

    if (/[.,;:!?]$/.test(word)) {
      const char = word[word.length - 1];
      if (/[.,;:]/.test(char)) {
        pauseWeight = 4; // Medium pause for comma/semicolon/colon
      } else if (/[!?.]/.test(char)) {
        pauseWeight = 8; // Longer pause for full stop/exclamation/question
      }
    }
    
    // Hindi full stop (danda) or ellipsis
    if (word.includes("...") || word.includes("।")) {
      pauseWeight = 8;
    }

    return {
      word,
      speakWeight: baseWeight,
      pauseWeight: pauseWeight
    };
  });

  const totalWeight = weights.reduce((sum, w) => sum + w.speakWeight + w.pauseWeight, 0);
  const timePerWeight = duration / (totalWeight || 1);

  const alignments: WordAlignment[] = [];
  let currentTime = 0;

  for (const w of weights) {
    const speakDuration = w.speakWeight * timePerWeight;
    const pauseDuration = w.pauseWeight * timePerWeight;

    alignments.push({
      word: w.word,
      start: Math.round(currentTime * 100) / 100,
      end: Math.round((currentTime + speakDuration) * 100) / 100
    });

    currentTime += speakDuration + pauseDuration;
  }

  return alignments;
}

/**
 * Aligns the raw word timing events received from Microsoft Edge TTS with
 * the original script words (which contains punctuation).
 */
export function alignMetadataToScript(
  scriptText: string,
  metadata: { word: string; start: number; end: number }[]
): WordAlignment[] {
  const scriptWords = scriptText.split(/\s+/).filter(Boolean);
  if (metadata.length === 0) return [];
  
  const alignments: WordAlignment[] = [];
  let metaIdx = 0;
  
  for (let i = 0; i < scriptWords.length; i++) {
    const sWord = scriptWords[i];
    let foundIdx = -1;
    
    // Scan ahead up to 5 metadata entries to find the corresponding spoken word
    for (let j = metaIdx; j < Math.min(metaIdx + 5, metadata.length); j++) {
      const sClean = sWord.toLowerCase().replace(/[^a-z0-9\u0900-\u097F]/g, "");
      const mClean = metadata[j].word.toLowerCase().replace(/[^a-z0-9\u0900-\u097F]/g, "");
      if (sClean === mClean || sClean.includes(mClean) || mClean.includes(sClean)) {
        foundIdx = j;
        break;
      }
    }
    
    if (foundIdx !== -1) {
      // Use exact word timing from TTS boundary, but original script word (retaining commas, periods, etc.)
      alignments.push({
        word: sWord,
        start: metadata[foundIdx].start,
        end: metadata[foundIdx].end
      });
      metaIdx = foundIdx + 1;
    } else if (metaIdx < metadata.length) {
      // Sequential fallback
      alignments.push({
        word: sWord,
        start: metadata[metaIdx].start,
        end: metadata[metaIdx].end
      });
      metaIdx++;
    } else {
      // Last-resort fallback
      const lastMeta = metadata[metadata.length - 1];
      alignments.push({
        word: sWord,
        start: lastMeta.end,
        end: lastMeta.end + 0.1
      });
    }
  }
  
  return alignments;
}

/**
 * Extracts audio duration in seconds using FFmpeg.
 */
export async function extractAudioDuration(buffer: ArrayBuffer): Promise<number> {
  const ffmpegPath = ffmpegInstaller.path;
  const tempPath = join(tmpdir(), `dur_${Date.now()}.mp3`);
  await writeFile(tempPath, Buffer.from(buffer));

  try {
    const proc = Bun.spawn([ffmpegPath, "-i", tempPath], { stdout: "pipe", stderr: "pipe" });
    const stderrText = await new Response(proc.stderr).text();
    await proc.exited;

    const match = stderrText.match(/Duration: (\d{2}):(\d{2}):(\d{2})\.(\d{2})/);
    if (!match) { console.warn("⚠️ Could not extract audio duration. Defaulting to 15s."); return 15.0; }

    return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]) + parseInt(match[4]) / 100;
  } finally {
    try { await unlink(tempPath); } catch {}
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider: Edge TTS (Microsoft Azure, FREE)
// Supports English + Hindi + 100+ other languages
// ─────────────────────────────────────────────────────────────────────────────
async function generateEdgeTTS(text: string, voice: string, rate = "+0%"): Promise<VoiceGenerationResult> {
  console.log(`     🎙️  Generating voice via Edge TTS (Voice: ${voice}, Rate: ${rate})...`);

  const secMsGec = getSecMsGec();
  const connectionId = crypto.randomUUID().replaceAll('-', '');
  const key = crypto.randomBytes(16).toString('base64');
  const path = `/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}&Sec-MS-GEC=${secMsGec}&Sec-MS-GEC-Version=1-143.0.3650.75&ConnectionId=${connectionId}`;

  const audioChunks: Buffer[] = [];
  const edgeAlignmentsRaw: { word: string; start: number; end: number }[] = [];
  
  await new Promise<void>((resolve, reject) => {
    const socket = tls.connect(443, 'speech.platform.bing.com', {
      servername: 'speech.platform.bing.com'
    });
    
    let handshaked = false;
    let responseBuffer = Buffer.alloc(0);
    const parser = new FrameParser();
    
    socket.on('secureConnect', () => {
      const req = [
        `GET ${path} HTTP/1.1`,
        `Host: speech.platform.bing.com`,
        `Connection: Upgrade`,
        `Upgrade: websocket`,
        `Sec-WebSocket-Key: ${key}`,
        `Sec-WebSocket-Version: 13`,
        `Origin: chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold`,
        `User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0`,
        ``,
        ``
      ].join('\r\n');
      socket.write(req);
    });
    
    socket.on('data', (chunk) => {
      const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      if (!handshaked) {
        responseBuffer = Buffer.concat([responseBuffer, data]);
        const idx = responseBuffer.indexOf('\r\n\r\n');
        if (idx !== -1) {
          const headerText = responseBuffer.subarray(0, idx).toString();
          if (!headerText.includes("101 Switching Protocols")) {
            socket.destroy();
            reject(new Error(`Edge TTS handshake failed. Headers: ${headerText}`));
            return;
          }
          handshaked = true;
          const remaining = responseBuffer.subarray(idx + 4);
          if (remaining.length > 0) {
            parser.add(remaining);
          }
          
          // Send speech config - request word boundary timing metadata from Azure
          const speechConfig = JSON.stringify({
            context: {
              synthesis: {
                audio: {
                  metadataoptions: { sentenceBoundaryEnabled: false, wordBoundaryEnabled: true },
                  outputFormat: 'audio-24khz-48kbitrate-mono-mp3'
                }
              }
            }
          });
          const configMsg = `X-Timestamp:${new Date().toString()}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n${speechConfig}`;
          socket.write(buildFrame(1, Buffer.from(configMsg)));
          
          // Send SSML
          const isHindi = voice.startsWith("hi-");
          const lang = isHindi ? "hi-IN" : "en-US";
          const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${lang}'>`
            + `<voice name='${voice}'><prosody pitch='+0Hz' rate='${rate}' volume='+0%'>`
            + `${text}</prosody></voice></speak>`;
          const ssmlMsg = `X-RequestId:${crypto.randomUUID().replaceAll('-', '')}\r\nContent-Type:application/ssml+xml\r\n`
            + `X-Timestamp:${new Date().toISOString()}\r\nPath:ssml\r\n\r\n${ssml}`;
          socket.write(buildFrame(1, Buffer.from(ssmlMsg)));
        }
      } else {
        parser.add(data);
        let frame;
        while ((frame = parser.next()) !== null) {
          if (frame.opcode === 1) {
            const textMsg = frame.payload.toString('utf8');
            if (textMsg.includes("turn.end")) {
              socket.write(buildFrame(8, Buffer.alloc(0)));
              socket.end();
            } else if (textMsg.includes("Path:audio.metadata")) {
              // Parse incoming word boundaries
              const idx = textMsg.indexOf("\r\n\r\n");
              if (idx !== -1) {
                const bodyStr = textMsg.substring(idx + 4);
                try {
                  const bodyJson = JSON.parse(bodyStr);
                  const metadataList = bodyJson.Metadata;
                  if (metadataList) {
                    for (const item of metadataList) {
                      if (item.Type === "WordBoundary" && item.Data) {
                        const word = item.Data.text.Text;
                        const start = item.Data.Offset / 10000000;
                        const duration = item.Data.Duration / 10000000;
                        edgeAlignmentsRaw.push({
                          word,
                          start: Math.round(start * 100) / 100,
                          end: Math.round((start + duration) * 100) / 100
                        });
                      }
                    }
                  }
                } catch (e) {
                  // Safe ignore formatting issues
                }
              }
            }
          } else if (frame.opcode === 2) {
            const separator = 'Path:audio\r\n';
            const binData = frame.payload;
            const idx = binData.indexOf(separator);
            if (idx !== -1) {
              const content = binData.subarray(idx + separator.length);
              audioChunks.push(content);
            }
          } else if (frame.opcode === 8) {
            socket.end();
          }
        }
      }
    });
    
    socket.on('close', () => {
      resolve();
    });
    
    socket.on('error', (err) => {
      reject(err);
    });
  });

  const audioBuffer = Buffer.concat(audioChunks);
  const duration = await extractAudioDuration(audioBuffer.buffer.slice(audioBuffer.byteOffset, audioBuffer.byteOffset + audioBuffer.byteLength));
  
  // Use metadata-derived word boundaries if available, fallback to smart weighted estimation
  const alignments = edgeAlignmentsRaw.length > 0 
    ? alignMetadataToScript(text, edgeAlignmentsRaw)
    : estimateTimestamps(text, duration);

  return { audioBuffer: audioBuffer.buffer.slice(audioBuffer.byteOffset, audioBuffer.byteOffset + audioBuffer.byteLength) as ArrayBuffer, alignments };
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider: Kokoro (Local, English only)
// ─────────────────────────────────────────────────────────────────────────────
async function decodeAudioWithFFmpeg(audioBuffer: ArrayBuffer): Promise<Float32Array> {
  const ffmpegPath = ffmpegInstaller.path;
  const tempInputPath = join(tmpdir(), `kokoro_in_${Date.now()}_${crypto.randomUUID()}.mp3`);
  const tempOutputPath = join(tmpdir(), `kokoro_out_${Date.now()}_${crypto.randomUUID()}.raw`);

  await writeFile(tempInputPath, Buffer.from(audioBuffer));

  try {
    const proc = Bun.spawn([
      ffmpegPath,
      "-y",
      "-i", tempInputPath,
      "-f", "f32le",
      "-ac", "1",
      "-ar", "16000",
      tempOutputPath
    ], { stdout: "ignore", stderr: "pipe" });

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      const err = await new Response(proc.stderr).text();
      throw new Error(`FFmpeg audio decoding failed (exit code ${exitCode}): ${err}`);
    }

    const rawBuffer = await readFile(tempOutputPath);
    return new Float32Array(rawBuffer.buffer, rawBuffer.byteOffset, rawBuffer.byteLength / 4);
  } finally {
    try { await unlink(tempInputPath); } catch {}
    try { await unlink(tempOutputPath); } catch {}
  }
}

let whisperPipeline: any = null;

async function transcribeAudioWithWhisper(audioBuffer: ArrayBuffer, scriptText: string): Promise<WordAlignment[]> {
  console.log(`     🎙️  Decoding audio via FFmpeg for transcription...`);
  const audioData = await decodeAudioWithFFmpeg(audioBuffer);

  if (!whisperPipeline) {
    console.log(`     🎙️  Initializing local Whisper transcriber (Xenova/whisper-tiny.en)...`);
    const { pipeline, env } = await import("@xenova/transformers");
    env.allowLocalModels = false; // download from Hugging Face hub and cache locally
    whisperPipeline = await pipeline("automatic-speech-recognition", "Xenova/whisper-tiny.en");
  }

  console.log(`     🎙️  Transcribing audio via local Whisper...`);
  const result = await whisperPipeline(audioData, {
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: "word",
  });

  const rawAlignments: { word: string; start: number; end: number }[] = [];
  if (result && Array.isArray(result.chunks)) {
    for (const chunk of result.chunks) {
      const text = chunk.text.trim();
      if (!text) continue;
      const start = Array.isArray(chunk.timestamp) ? chunk.timestamp[0] : null;
      const end = Array.isArray(chunk.timestamp) ? chunk.timestamp[1] : null;
      if (start !== null && end !== null) {
        rawAlignments.push({
          word: text,
          start: Math.round(start * 100) / 100,
          end: Math.round(end * 100) / 100,
        });
      }
    }
  }

  if (rawAlignments.length === 0) {
    throw new Error("Whisper transcriber returned no valid word segments.");
  }

  console.log(`     🎙️  Aligning Whisper timestamps to script...`);
  return alignMetadataToScript(scriptText, rawAlignments);
}

async function generateKokoroTTS(text: string, voice: string): Promise<VoiceGenerationResult> {
  const url = process.env.KOKORO_URL || "http://localhost:8880";
  const endpoint = `${url}/v1/audio/speech`;

  console.log(`     🎙️  Generating local voice via Kokoro TTS (Voice: ${voice})...`);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model: "kokoro", voice, input: text }),
  });

  if (!res.ok) throw new Error(`Kokoro TTS failed: ${res.status} ${await res.text()}`);

  const audioBuffer = await res.arrayBuffer();

  let alignments: WordAlignment[];
  try {
    alignments = await transcribeAudioWithWhisper(audioBuffer, text);
  } catch (err: any) {
    console.warn(`     ⚠️ Local Whisper transcription failed: ${err.message || err}. Falling back to mathematical estimation...`);
    const duration = await extractAudioDuration(audioBuffer);
    alignments = estimateTimestamps(text, duration);
  }

  return { audioBuffer, alignments };
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider: ElevenLabs (Cloud, multilingual, best quality)
// ─────────────────────────────────────────────────────────────────────────────
async function generateElevenLabsTTS(text: string, voiceId: string, withTimestamps: boolean): Promise<VoiceGenerationResult> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set in .env");

  console.log(`     🎙️  Generating voice via ElevenLabs (Voice ID: ${voiceId})...`);

  if (withTimestamps) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/with-timestamps`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
      }),
    });

    if (!res.ok) throw new Error(`ElevenLabs TTS failed: ${res.status} ${await res.text()}`);

    const data = (await res.json()) as {
      audio_base64: string;
      alignment: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] };
    };

    const binary = atob(data.audio_base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

    const alignments = alignCharactersToWords(
      data.alignment.characters,
      data.alignment.character_start_times_seconds,
      data.alignment.character_end_times_seconds
    );

    return { audioBuffer: bytes.buffer, alignments };
  } else {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ text, model_id: "eleven_multilingual_v2", voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
    });

    if (!res.ok) throw new Error(`ElevenLabs TTS failed: ${res.status} ${await res.text()}`);
    return { audioBuffer: await res.arrayBuffer() };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entry point — routes to the correct TTS provider
// ─────────────────────────────────────────────────────────────────────────────
export type VoiceTone = "dramatic" | "calm" | "energetic";

/** Map voiceTone to Edge TTS prosody rate string */
function toneToEdgeRate(tone?: VoiceTone): string {
  switch (tone) {
    case "dramatic":  return "-5%";   // slightly slower, more weight
    case "energetic": return "+12%";  // fast-paced, punchy
    case "calm":      return "0%";
    default:          return "-3%";   // default slight slowdown for clarity
  }
}

export async function generateVoice(
  text: string,
  withTimestamps = true,
  overrideProvider?: string,
  overrideVoice?: string,
  voiceTone?: VoiceTone
): Promise<VoiceGenerationResult> {
  const provider = overrideProvider || process.env.TTS_PROVIDER || "local";

  switch (provider) {
    case "edge": {
      const isVoiceValid = overrideVoice && EDGE_VOICES.some(v => v.id === overrideVoice);
      const voice = isVoiceValid ? overrideVoice : (process.env.EDGE_VOICE || "en-US-AriaNeural");
      const rate = toneToEdgeRate(voiceTone);
      return generateEdgeTTS(text, voice, rate);
    }
    case "local":
    case "kokoro": {
      const isVoiceValid = overrideVoice && KOKORO_VOICES.some(v => v.id === overrideVoice);
      const voice = isVoiceValid ? overrideVoice : (process.env.KOKORO_VOICE || "af_bella");
      return generateKokoroTTS(text, voice);
    }
    case "cloud":
    case "elevenlabs": {
      const voiceId = overrideVoice || process.env.ELEVENLABS_VOICE_ID || "pNInz6obpgDQGcFmaJgB";
      try {
        return await generateElevenLabsTTS(text, voiceId, withTimestamps);
      } catch (err: any) {
        console.warn(`     ⚠️ ElevenLabs TTS failed: ${err.message || err}. Falling back to local/free TTS...`);
        
        // Detect Hindi (Devanagari characters)
        const isHindi = /[\u0900-\u097F]/.test(text) || text.includes("नमस्ते");
        
        if (isHindi) {
          console.log("     🎙️ Fallback: Using Edge TTS for Hindi voiceover...");
          const fallbackVoice = "hi-IN-SwaraNeural";
          const rate = toneToEdgeRate(voiceTone);
          return await generateEdgeTTS(text, fallbackVoice, rate);
        } else {
          console.log("     🎙️ Fallback: Using Kokoro (Local) for English voiceover...");
          const fallbackVoice = process.env.KOKORO_VOICE || "af_bella";
          return await generateKokoroTTS(text, fallbackVoice);
        }
      }
    }
    default:
      throw new Error(`Unknown TTS_PROVIDER: "${provider}". Use "edge", "local" (Kokoro), or "cloud" (ElevenLabs).`);
  }
}
