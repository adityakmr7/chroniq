# Chroniq - AI-Powered Faceless YouTube Automation

## Vision

Build a fully automated faceless YouTube content generation platform that creates high-quality documentary-style Shorts and long-form videos.

The system should be capable of:

* Generating content ideas
* Researching topics
* Writing engaging scripts
* Generating narration
* Creating visuals
* Generating captions
* Rendering videos
* Uploading to YouTube

Target niches:

* Technology History
* Startup Stories
* AI & Innovation
* Business Case Studies
* Historical Events
* Forgotten Stories

Examples:

* Why Nokia Failed
* The Rise of NVIDIA
* The Story of Bitcoin
* The Shortest War in History
* How Netflix Destroyed Blockbuster

---

# Tech Stack

## Runtime

* Bun
* TypeScript

## AI

* Gemini 2.5 Flash
* OpenAI (optional)

## Database

* PostgreSQL
* Supabase

## Queue

* Redis
* BullMQ

## Video

* FFmpeg
* Remotion

## Voice

* ElevenLabs

## Storage

* Supabase Storage

## Deployment

* Railway
* Fly.io
* VPS

---

# Architecture

Topic Generator
↓
Research Agent
↓
Script Writer
↓
Voice Generator
↓
Visual Generator
↓
Caption Generator
↓
Video Composer
↓
Thumbnail Generator
↓
YouTube Uploader

---

# Modules

## 1. Topic Discovery

Input:

* Category
* Trend Score

Output:

{
"title": "Why Nokia Lost Everything",
"category": "Technology",
"estimatedViews": 85000
}

Responsibilities:

* Discover trending topics
* Score virality
* Avoid duplicates

---

## 2. Research Agent

Collect:

* Facts
* Timeline
* Key events
* Sources

Output:

{
"summary": "...",
"facts": []
}

---

## 3. Script Generator

Generate:

* Hook
* Body
* Retention loops
* CTA

Constraints:

* 120-150 words for Shorts
* 1000-1500 words for long videos

---

## 4. Voice Generator

Input:

* Script

Output:

* narration.mp3

Provider:

* ElevenLabs

---

## 5. Visual Generator

Generate scenes.

Each scene:

{
"timestamp": 0,
"prompt": "Cinematic image of ancient Rome",
"duration": 4
}

Sources:

* AI Generated
* Public Domain Archives
* Stock Footage

---

## 6. Caption Generator

Generate:

* SRT
* Word highlighting

Output:

captions.srt

---

## 7. Video Composer

Using:

* FFmpeg
* Remotion

Responsibilities:

* Sync visuals
* Sync voice
* Add captions
* Add transitions
* Add music

Output:

final.mp4

---

## 8. Thumbnail Generator

Generate:

* YouTube Thumbnail
* Shorts Cover

Output:

thumbnail.png

---

## 9. YouTube Uploader

Upload:

* Video
* Thumbnail
* Metadata

Generate:

* Title
* Description
* Tags

---

# Folder Structure

apps/

api/
worker/
uploader/

packages/

agents/
research/
script/
voice/
visual/
video/
thumbnail/
youtube/

infra/

docker/
redis/

---

# Database Schema

videos

* id
* title
* topic
* status
* duration
* youtube_url
* created_at

scripts

* id
* video_id
* content

assets

* id
* video_id
* type
* url

---

# Milestone 1 (Week 1)

Generate:

* Topic
* Script
* Voice

Manual editing allowed.

Goal:

Create first working Short.

---

# Milestone 2 (Week 2)

Generate:

* Visuals
* Captions

Goal:

Automatic video rendering.

---

# Milestone 3 (Week 3)

Generate:

* Thumbnail
* Upload

Goal:

Fully automated publishing.

---

# Milestone 4

Create Dashboard

Features:

* Queue management
* Analytics
* Revenue tracking
* Content calendar

---

# Success Metrics

Shorts:

* 1 video/day minimum
* 90 videos/month

Target:

* 1000 subscribers
* 10M Shorts views

Long-form:

* 1 video/week

Target:

* Monetization
* Sponsorships

---

# Future Enhancements

* Multi-language generation
* Multiple channels
* Trend prediction
* AI editing feedback
* Viral score prediction
* Automated A/B thumbnails
* Multi-platform publishing

Platforms:

* YouTube
* Instagram Reels
* TikTok
* X
* LinkedIn

---

# End Goal

A single command:

bun run generate-video

Should automatically:

1. Pick topic
2. Research topic
3. Generate script
4. Generate narration
5. Generate visuals
6. Generate captions
7. Render video
8. Generate thumbnail
9. Upload to YouTube

Without human intervention.
