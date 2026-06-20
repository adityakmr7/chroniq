# Implementation Plan: Custom Script, Horror Mode & Caption Toggle

## Overview
Three new features added across the full stack: DB → API → Worker → Renderer → Dashboard UI.

---

## Feature 1 — Custom Script Mode
User can paste their own narration text. The AI research + script generation steps are skipped entirely; voice synthesis, scene planning, thumbnail, and YouTube metadata are still generated.

## Feature 2 — Horror Storytelling Category
A dedicated "Horror Stories 🎃" category with a tailored Gemini prompt that writes suspenseful, cliffhanger-rich horror narrations with eerie visual direction and dramatic voice tone forced automatically.

## Feature 3 — Caption Toggle
A toggle in the queue form to disable/enable subtitles. The flag is stored in the DB, passed through the render pipeline, and conditionally renders the `CaptionsOverlay` in `VideoComposition.tsx`.

---

## Proposed Changes

### Database Layer
#### [MODIFY] packages/db/src/index.ts
- Add `custom_script TEXT`, `use_custom_script BOOLEAN DEFAULT FALSE`, `captions_enabled BOOLEAN DEFAULT TRUE` to `Video` interface
- Add three `ALTER TABLE` migration statements in `initDatabase()`
- Update `createVideo()` to accept `customScript`, `useCustomScript`, `captionsEnabled`

---

### Agent Layer

#### [MODIFY] packages/agents/src/script.ts
- Add a new exported `HORROR_HOOK_FORMULAS` array with horror-specific hooks
- Add a `category` parameter to `generateScript()` 
- When `category === "Horror Stories"`, use a specialized horror system prompt: suspense-first structure, slow-burn dread, cliffhanger CTA, always returns `voiceTone: "dramatic"`

#### [MODIFY] packages/agents/src/video-style.ts  
- Add a `"horror_dark"` style preset: deep red/purple accent, black background, heavy vignette, centered bold captions

#### [MODIFY] packages/agents/src/video.ts
- Accept `captionsEnabled?: boolean` in the `options` object
- Pass it through to `renderVideoWithRemotion`

#### [MODIFY] packages/agents/src/remotion/render.ts
- Accept `captionsEnabled?: boolean` in the function signature
- Include it in `inputProps` passed to Remotion

#### [MODIFY] packages/agents/src/remotion/VideoComposition.tsx
- Add `captionsEnabled?: boolean` to `VideoCompositionProps`
- Wrap `<CaptionsOverlay>` in `{captionsEnabled !== false && <CaptionsOverlay ... />}`

---

### API Layer
#### [MODIFY] apps/api/src/index.ts
- Accept `customScript`, `useCustomScript`, `captionsEnabled` in `POST /api/videos` body
- Pass them to `createVideo()`

---

### Worker Layer
#### [MODIFY] apps/worker/src/index.ts
- In `processGenerateJob`: check `video.use_custom_script`. If true, skip `researchTopic` and `generateScript`, build a minimal `research` object and use `video.custom_script` as `script.full`
- Pass `category` to `generateScript()` call for horror detection
- In the Horror category path: force `voiceTone = "dramatic"` on the script, use `"horror_dark"` style preset
- Save `captionsEnabled` into `youtube_meta.json`
- In `processRenderJob`: read `captionsEnabled` from `youtube_meta.json`, pass it to `composeVideo()`

---

### Dashboard UI
#### [MODIFY] apps/dashboard/src/App.tsx
- Update `Video` interface: add `custom_script`, `use_custom_script`, `captions_enabled` fields
- Add `"Horror Stories 🎃"` to the topic/niche dropdown
- Add `useCustomScript` state (boolean toggle)  
- Add `customScript` state (string textarea content)
- Add `captionsEnabled` state (boolean, default `true`)
- Update `handleQueueVideo` to send `customScript`, `useCustomScript`, `captionsEnabled`
- **UI**: Below the title field, add a pill toggle "✨ AI Script / ✏️ Custom Script". When custom, replace the title hint with a textarea for the script. Add a 📺 "Show Captions" toggle switch below the voice settings.

---

## Verification Plan
### Automated
```bash
bun run typecheck
```

### Manual
1. Queue a video with "Horror Stories 🎃" category — verify script is eerie/suspenseful, voice tone is dramatic, dark visual style is applied
2. Toggle to "Custom Script", paste text, queue — verify research/script steps are skipped in worker logs, your text is narrated verbatim
3. Queue a video with captions disabled — verify `final.mp4` renders with no subtitle overlay
4. Queue a video with captions enabled — verify subtitles appear frame-accurately in sync

