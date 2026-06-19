# Chroniq Studio Setup Guide (100% Local & GPU Optimized)

This guide provides a step-by-step setup to run **Chroniq** completely locally on your PC, utilizing your NVIDIA RTX GPU and AMD Ryzen CPU to generate scripts, narration audio, AI images, and videos for **100% free**.

---

## 📋 1. Prerequisites Setup

Before launching the Chroniq studio, prepare your local AI servers:

### A. Local LLM (Ollama)
1. Install [Ollama](https://ollama.com/).
2. Open your terminal/command prompt and download the Llama 3 model:
   ```bash
   ollama run llama3
   ```
   *(Keep this running. It serves the LLM API on `http://localhost:11434`)*.

### B. Local Image Generator (Stable Diffusion)
1. Ensure you have Automatic1111 (or ComfyUI) installed.
2. Edit your startup script (e.g. `webui-user.bat` on Windows or `webui-user.sh` on Linux) and make sure the `--api` flag is added to the command line arguments:
   ```ini
   COMMANDLINE_ARGS=--api
   ```
3. Start the WebUI. *(It serves the image generation API on `http://127.0.0.1:7860`)*.

### C. Docker & Docker Compose
1. Ensure Docker Desktop is installed and running on your system.

---

## ⚙️ 2. Environment Configuration

Open the `.env` file in the project root and configure it to use local models and your GPU:

```ini
# --- Provider Selectors (local / cloud) ---
LLM_PROVIDER=local         # Use local Ollama
TTS_PROVIDER=local         # Use local Kokoro TTS
IMAGE_PROVIDER=local_sd     # Use local Stable Diffusion WebUI
VIDEO_ENCODER=h264_nvenc    # Offload video rendering to NVIDIA GPU

# --- Local Providers Config ---
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3
KOKORO_URL=http://localhost:8880
KOKORO_VOICE=af_bella
LOCAL_SD_URL=http://127.0.0.1:7860
```
*(Note: If you ever want to switch back to cloud models, simply change the selectors back to `cloud` and provide your ElevenLabs or Gemini API keys in the `.env` file).*

---

## 🚀 3. Starting the Studio

You can run the entire platform (database, queues, API, worker, frontend, and local Kokoro voice engine) with a single command:

```bash
docker compose up --build -d
```
This launches:
*   **Studio Dashboard**: [http://localhost:5173](http://localhost:5173)
*   **API Server**: [http://localhost:3000](http://localhost:3000)
*   **Kokoro Voice Engine**: [http://localhost:8880](http://localhost:8880)

*(To stop the services, run `docker compose down`)*.

---

## 🎬 4. How to Create a Video (3-Step Flow)

1. Open **[http://localhost:5173](http://localhost:5173)** in your web browser.
2. **Setup the Topic**:
   * Select a category from the dropdown (e.g., *Startup Stories*).
   * Click **💡 Generate Idea** to let Ollama suggest a viral title, or type your own custom topic (e.g., *The Rise of NVIDIA*).
3. **Generate**:
   * **Uncheck** the "Run in MOCK Mode" box (so it processes real assets).
   * Click **⚡ Queue Video Job**.

---

## 📂 5. Fetching your Outputs

*   The video status card will appear in the library on the right showing the live progress bar.
*   Once it changes to `Completed`, **click on the video card** to preview the finished video (`final.mp4`) with styled captions, play the voiceover, and inspect the script.
*   The raw files are saved directly in your local directory under **`output/[video-title-slug]/`**:
    *   `final.mp4` (Finished video with burned-in subtitles)
    *   `thumbnail.png` (9:16 vertical cover image)
    *   `narration.mp3` (Generated voiceover)
    *   `captions.ass` / `captions.srt` (Subtitle alignments)
    *   `metadata.json` (SEO title, tags, description, and timeline details)
