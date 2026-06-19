# Chroniq - System Architecture & Tech Stack

Chroniq is a cost-efficient, highly engaging, faceless YouTube automation platform focused on creating business case studies and technology history videos. It is designed to run 100% locally on consumer hardware for free, with optional hybrid routing to cloud services (Gemini 2.5 Flash, ElevenLabs, etc.) when needed.

This document serves as a complete technical guide and reference for developers and AI agents working on the Chroniq codebase.

---

## 🏗️ 1. High-Level Architecture

Chroniq follows a **producer-consumer architecture** driven by a monorepo setup:

```
  ┌─────────────────────────────────────────────────────────┐
  │                   Studio Dashboard (React)              │
  │                     (localhost:5173)                    │
  └──────────────────────────┬──────────────────────────────┘
                             │ (REST APIs)
                             ▼
  ┌─────────────────────────────────────────────────────────┐
  │                    API Server (Bun)                     │
  │                     (localhost:3000)                    │
  └──────────────────┬───────────────┬──────────────────────┘
                     │ (Enqueue)     │ (Reads/Writes)
                     ▼               ▼
  ┌───────────────────────┐ ┌───────────────────────────────┐
  │      Redis Queue      │ │      PostgreSQL Database      │
  │       (BullMQ)        │ │         (chroniq DB)          │
  └──────────┬────────────┘ └────────┬──────────────────────┘
             │                       │
             │ (Job Consume)         │ (Reads/Writes)
             ▼                       ▼
  ┌─────────────────────────────────────────────────────────┐
  │                    Worker Engine (Bun)                  │
  └──────────────────────────┬──────────────────────────────┘
                             │
            ┌────────────────┴────────────────┐
            ▼ (Phase 1: Generate)             ▼ (Phase 2: Render)
     Topic & Research                  Load Saved Alignments
     Scripting (Llama3.2/Gemini)       Render via Remotion
     Voice Synthesis (Kokoro/Edge)     Burn-in ASS Captions
     Scene Planning & Visuals          Assemble final.mp4
     Download scene_*.jpg              Upload to YouTube (OAuth2)
     Generate thumbnail.png            Clean intermediate files
     Awaiting Approval (HITL)
```

---

## 📁 2. Monorepo Folder Structure

Chroniq uses **Bun Workspaces** for a clean separation of concerns:

```
chroniq/
├── apps/                         # Executable applications
│   ├── api/                      # Bun-based HTTP REST API server
│   │   └── src/index.ts          # API endpoints, local asset server, voice regenerator
│   ├── dashboard/                # Vite + React + TypeScript frontend
│   │   └── src/                  # App.tsx (Main dashboard & HITL Review Panel)
│   └── worker/                   # BullMQ worker processing background jobs
│       └── src/index.ts          # Phase 1 (Generate) & Phase 2 (Render) pipelines
├── packages/                     # Shared package modules
│   ├── db/                       # Database model definitions & queries (using postgres.js)
│   │   └── src/index.ts          # Schema migrations and SQL operations
│   └── agents/                   # Core agentic logic (Script, Research, Voice, Visuals, Video)
│       └── src/
│           ├── gemini.ts         # Hybrid LLM routing (Ollama local vs Gemini cloud)
│           ├── voice.ts          # Custom Edge TTS TLS client, Kokoro, and ElevenLabs
│           ├── script.ts         # Scriptwriter agent prompt and schema
│           ├── research.ts       # Topic research agent
│           ├── visual.ts         # Scene prompt generator
│           ├── remotion/         # React components for video layout and animations
│           │   ├── entry.tsx          # Remotion entry point
│           │   └── VideoComposition.tsx # Video timeline, animations, and transitions
│           ├── render.ts         # Compiles & renders Remotion videos to MP4
│           ├── caption.ts        # SRT & ASS caption compilers
│           ├── thumbnail.ts      # Youtube cover generator
│           └── youtube.ts        # Google OAuth2 YouTube uploader
├── docs/                         # Documentation
│   └── architecture.md           # This architecture documentation file
├── output/                       # Output folder (contains final.mp4 and thumbnail.png per slug)
└── docker-compose.yml            # Docker services definition (Postgres, Redis, Kokoro, Studio)
```

---

## 🗄️ 3. Database Schema

The database consists of three tables initialized and migrated automatically by `packages/db` during service boots:

```mermaid
erDiagram
    videos ||--o{ scripts : "has"
    videos ||--o{ assets : "produces"
    
    videos {
        uuid id PK
        text title
        text topic
        text status "queued | researching | generating_script | generating_voice | generating_visuals | awaiting_approval | approved | generating_captions | rendering_video | publishing | completed | failed"
        numeric duration
        text youtube_url
        text video_type "short | long"
        text error_message
        text scene_manifest "JSON array of scenes with filename, duration, prompts"
        text tts_provider "local | edge | cloud"
        text voice_id "provider-specific voice model name"
        text language "en | hi | etc."
        timestamp created_at
    }

    scripts {
        uuid id PK
        uuid video_id FK
        text content
    }

    assets {
        uuid id PK
        uuid video_id FK
        text type "image | audio | video | thumbnail | alignments | captions_ass | captions_srt"
        text url
    }
```

---

## 🎙️ 4. Voiceover & Subtitle System (TTS)

One of Chroniq's core strengths is its flexible Text-to-Speech (TTS) architecture, which supports three providers:

1. **Kokoro TTS (Local, English only):** Run inside a local GPU/CPU Docker container (`http://localhost:8880`). It provides high-quality English voice synthesis for free.
2. **ElevenLabs (Cloud, Multilingual):** State-of-the-art paid voiceover synthesis with character-level timestamps returned from the API, which are aggregated into word-level timestamps.
3. **Microsoft Edge TTS (Local, Multilingual, Free):** Completely free Azure-grade voices. Since Microsoft does not provide a public HTTP API for this, Chroniq implements a custom **TLS WebSocket Client** to interact with the Microsoft Read Aloud service.

### The Raw TLS WebSocket Client (`packages/agents/voice.ts`)
Standard Node/Bun WebSocket clients (`ws` npm package or native `WebSocket`) intercept or block modifying headers like `Origin` or `User-Agent` during the connection handshake. To bypass this, Chroniq establishes a raw TCP/TLS socket to `speech.platform.bing.com:443`:

- **Handshake Validation:** Computes a Windows-epoch ticks-based token `Sec-MS-GEC` utilizing the SHA-256 hash of Unix Windows epoch ticks rounded down to 5 minutes concatenated with a client key `6A5AA1D4EAFF4E9FB37E23D68491D6F4`.
- **SSML Construction:** Packages the text into standard SSML format with specific voice selections (e.g. `hi-IN-SwaraNeural`, `en-US-AriaNeural`).
- **Binary Frame Parsing:** Implements a custom WebSockets frame builder and parser (`FrameParser`) to reconstruct the raw binary audio streams, saving them directly as an MP3.
- **Word Timestamps Estimation:** Since Edge TTS does not return word timings, Chroniq extracts the total audio duration using FFmpeg and proportionally estimates the timestamps across the script's word count to burn in captions accurately.

---

## 🤖 5. Hybrid LLM Query Routing

Due to the **multilingual limits of Llama 3.2 3B**, local models output corrupted Unicode characters (a mixture of Gurmukhi and Gujarati scripts) when asked to write Devanagari (Hindi) scripts under JSON constraints.

To prevent this, `packages/agents/gemini.ts` implements a hybrid routing proxy:
- **Automatic Language Detection:** If the prompt requires Hindi (`Language: Hindi` or contains Hindi characters), or the video metadata is marked as `language !== 'en'`, the LLM provider is automatically forced to **Cloud Gemini 2.5 Flash** (bypassing local Ollama configuration).
- **Quota Protection:** English generation requests remain on the local `llama3.2` model to preserve Gemini API quota.
- **Robust Retries:** Incorporates automatic retry handlers for transient errors like `503 Service Unavailable` or `429 Too Many Requests`.

---

## 🎬 6. Remotion Video Composition

Instead of compiling flat, static slideshows using FFmpeg, Chroniq uses **Remotion** (`packages/agents/src/remotion/`) to render dynamic, high-engagement videos:

- **React-Based Timeline:** Renders React components that schedule and coordinate animations.
- **Ken Burns Effect:** Panning and zooming are applied dynamically to every scene using React spring and frame interpolation.
- **Kinetic Subtitles:** Burned-in, word-highlighted captions styled dynamically via ASS/SRT templates.
- **Transitions:** Smooth fade-ins and fade-outs between scenes to prevent visual fatigue.
- **GPU Acceleration:** Configurable rendering parameters offload processing to the GPU using `h264_nvenc` for NVIDIA-equipped hardware.

---

## 🔄 7. Human-In-The-Loop (HITL) Workflow

Videos are generated in two separate phases, separated by a human gatekeeper in the Dashboard UI:

```
[Create Video Form]
       │
       ▼
1. Worker: PHASE 1 (Generate)
       │
       ├─► Generates Topic & Script
       ├─► Synthesizes Voice Audio & Timestamps
       ├─► Plans Scenes & Downloads Images
       ▼
2. Video state: "awaiting_approval"
       │
       ├─► Creator opens HITL Review Panel in Dashboard
       ├─► Reviews Script (Allows Editing)
       ├─► Reviews Voice & Language (Allows swapping and regenerating)
       ├─► Reviews Scenes (Allows uploading custom images to replace generated ones)
       ▼
3. Creator clicks "Approve" (State -> "approved")
       │
       ▼
4. Worker: PHASE 2 (Render)
       │
       ├─► Re-reads final script and manifests
       ├─► Bundles & Renders video using Remotion
       ├─► Uploads to YouTube via OAuth2
       ├─► Cleans up temp files (leaving final.mp4 and thumbnail.png)
       ▼
State: "completed"
```

### Voice & Timing Scaling
When a creator edits the script or changes the voice/language settings inside the HITL Review Panel and clicks **Regenerate Voice & Captions**, the system:
1. Re-synthesizes the narration audio file on disk.
2. Recalculates the new total audio duration and word timestamps.
3. **Rescales scene durations:** Automatically updates the `scene_manifest` by adjusting each scene's duration proportionally using a scale factor (\(NewDuration / OldDuration\)) so that visual changes sync perfectly with the new voice pace.

---

## 🛠️ 8. Running the Application

### Prerequisites
1. **Ollama (Local LLM):** Download Ollama and run `ollama run llama3.2` (or `llama3` as configured in `.env`).
2. **Stable Diffusion WebUI (Local Images - Optional):** Start Automatic1111 with `--api` enabled.
3. **Docker Desktop:** Ensure Docker is running.

### Launching Services
Run the following command in the root folder to boot Postgres, Redis, Kokoro TTS, the API Server, Worker, and Dashboard UI:
```bash
docker compose up --build -d
```

### Environment Variables (.env)
Copy `.env.example` to `.env` and fill in necessary keys:
```ini
DATABASE_URL=postgres://postgres:postgres@localhost:5432/chroniq
REDIS_HOST=localhost
REDIS_PORT=6379

LLM_PROVIDER=local          # local (Ollama) or cloud (Gemini)
TTS_PROVIDER=local          # local (Kokoro), edge (Microsoft free), or cloud (ElevenLabs)
IMAGE_PROVIDER=local_sd      # local_sd (Stable Diffusion) or cloud (Replicate)

OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2

GEMINI_API_KEY=your_gemini_api_key
```
*(Note: Inside the Docker network, service hostnames are resolved automatically: e.g., `postgres`, `redis`, `kokoro-tts`)*.
