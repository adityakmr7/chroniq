# Chroniq Studio

AI-Powered Faceless YouTube Shorts & Video Automation Monorepo. Generate, customize, schedule, and analyze engaging viral content automatically.

---

## 🚀 Quick Start (Docker Compose)

The easiest way to run the entire platform (database, queues, API, worker, frontend, and local voice engine) is with Docker Compose.

### Prerequisites

1. Ensure **Docker Desktop** is installed and running.
2. If running local models (like Ollama or Stable Diffusion), ensure they are active on your host machine before starting the containers.

### 1. Start all services:
```bash
docker compose up --build -d
```

This builds and launches:
* **Studio Dashboard (Frontend)**: [http://localhost:5173](http://localhost:5173)
* **API Server**: [http://localhost:3000](http://localhost:3000)
* **Kokoro Voice Engine (TTS)**: [http://localhost:8880](http://localhost:8880)
* **PostgreSQL Database**: [http://localhost:5432](http://localhost:5432)
* **Redis Queue Manager**: [http://localhost:6379](http://localhost:6379)

### 2. View real-time logs:
To check logs for the worker, API, dashboard, or other background tasks, run:
```bash
docker compose logs -f
```

### 3. Stop all services:
To stop all containers and release the ports, run:
```bash
docker compose down
```

---

## ⚡ Running Locally (with Bun)

If you prefer to run the services directly on your host machine (ensure PostgreSQL and Redis are already running on `localhost`):

### 1. Install dependencies:
```bash
bun install
```

### 2. Configure Environment Variables:
Copy the `.env.example` file to `.env` and fill in the necessary keys:
```bash
cp .env.example .env
```

### 3. Start all services concurrently:
This launches the API, worker, and dashboard at once:
```bash
bun run dev
```

### 4. Run TypeScript typechecking:
Ensure there are no build or compile-time type errors:
```bash
bun run typecheck
```

---

## 📁 Output Artifacts

Once a video generation job completes, all outputs are saved on your host machine under the `output/` directory:
* `final.mp4` — Rendered high-retention video (with kinetic captions, background music, zooms, transitions)
* `thumbnail.png` — Selected A/B cover thumbnail
* `narration.mp3` — Generated voiceover track
* `youtube_meta.json` — SEO-optimized YouTube title, description, and tags
