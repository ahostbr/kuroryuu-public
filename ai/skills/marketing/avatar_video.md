---
name: Avatar Video
description: Generate talking head avatar videos using ElevenLabs. Upload a photo or generate an avatar, add voice, get a lip-synced talking video. Use for TikTok, YouTube Shorts, Instagram Reels content at scale without a camera.
version: 1.0.0
---

# AVATAR VIDEO TOOL

Create talking head videos from a photo + voice using ElevenLabs' avatar and lip-sync models. Perfect for short-form content (TikTok, YouTube Shorts, Reels) where you need a "creator face" without sitting in front of a camera.

## Available Models

| Model | Input | Output | Best For |
|-------|-------|--------|----------|
| **Creatify Aurora** | Audio + image/text | Talking avatar video | Full reactive avatar — blinking, breathing, expressions, hand/body sync |
| **Omnihuman 1.5** | Audio + static image | Talking head video | Animate any photo with audio (most realistic) |
| **Veed LipSync** | Audio + existing video | Re-dubbed video | Replace audio in existing footage with synced lips |
| **Sync Lipsync 2 Pro** | Audio + video | 4K lip-synced video | Studio-grade dubbing and re-dubbing |

## Authentication

All ElevenLabs API calls use the `xi-api-key` header:

```bash
-H "xi-api-key: $ELEVENLABS_API_KEY"
```

The API key should be set as an environment variable or read from your secrets store.

## Pipeline: Photo → Talking Head Video

This is the core workflow for short-form content creation.

### Step 1: Generate or Select Avatar Image

**Option A: Use your own photo**
- Upload a clear, front-facing headshot (JPG/PNG/WEBP)
- Good lighting, neutral expression works best
- The model will animate it with expressions

**Option B: Generate an avatar via ElevenLabs**
```bash
# Use ElevenLabs text-to-image to create an avatar
curl -X POST https://api.elevenlabs.io/v1/text-to-image \
  -H "xi-api-key: $ELEVENLABS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Professional male tech content creator, front-facing headshot, dark background, confident expression, photorealistic",
    "model": "seedream-4.5"
  }' --output avatar.png
```

**Option C: Use the Gateway image gen (Gemini)**
```bash
curl -X POST http://127.0.0.1:8200/v1/marketing/generate/image \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Professional tech creator headshot, front-facing, dark background, photorealistic", "aspect_ratio": "1:1"}' \
  --no-buffer 2>/dev/null | while IFS= read -r line; do
    [[ "$line" == data:* ]] && echo "${line#data: }"
  done || true
```

### Step 2: Generate Voiceover

Use the existing voiceover skill (`ai/skills/marketing/voiceover.md`):

```bash
curl -X POST http://127.0.0.1:8200/v1/marketing/generate/voiceover \
  -H "Content-Type: application/json" \
  -d '{"text": "Your GPU is sitting there doing nothing while you pay OpenAI 20 bucks a month. What if Claude Code could use it instead?", "voice_id": "JBFqnCBsd6RMkjVDRZzb"}' \
  --no-buffer 2>/dev/null | while IFS= read -r line; do
    [[ "$line" == data:* ]] && echo "${line#data: }"
  done || true
```

### Step 3: Create Talking Head Video

**Using Omnihuman 1.5 (image + audio → video):**

Upload the avatar image and voiceover audio to ElevenLabs via the platform or API. Omnihuman animates the static image with the audio track, producing realistic lip sync with natural head movement.

**Using Creatify Aurora (full reactive avatar):**

Aurora goes beyond lip sync — it generates context-aware:
- Blinking and breathing patterns
- Facial expressions matching vocal tone
- Hand and body movement synced to inflection
- Natural head tilts and gestures

This produces the most "real creator" look for talking head content.

### Step 4: Export and Composite

**Export specs for short-form:**

| Platform | Aspect Ratio | Resolution | Max Duration |
|----------|-------------|------------|--------------|
| TikTok | 9:16 | 1080x1920 | 60s (sweet spot: 30-45s) |
| YouTube Shorts | 9:16 | 1080x1920 | 60s |
| Instagram Reels | 9:16 | 1080x1920 | 90s |
| YouTube long-form | 16:9 | 1920x1080 | No limit |

**Composite layout (talking head + screen recording):**

```
┌─────────────────────────┐
│                         │
│   Screen Recording      │
│   (Lite Suite demo)     │
│                         │
│              ┌────────┐ │
│              │ Avatar │ │
│              │ Bubble │ │
│              └────────┘ │
└─────────────────────────┘
```

Use FFmpeg to composite the avatar video as a circular bubble over screen recording:

```bash
# Composite avatar bubble (bottom-right) over screen recording
ffmpeg -i screen_recording.mp4 -i avatar_video.mp4 \
  -filter_complex "[1:v]scale=300:300,format=yuva420p,geq='lum=lum(X,Y):a=if(gt(pow(X-150,2)+pow(Y-150,2),pow(140,2)),0,255)'[avatar];[0:v][avatar]overlay=W-330:H-330" \
  -c:a aac -shortest output.mp4

# For 9:16 vertical (avatar bottom-center)
ffmpeg -i screen_recording_vertical.mp4 -i avatar_video.mp4 \
  -filter_complex "[1:v]scale=250:250,format=yuva420p,geq='lum=lum(X,Y):a=if(gt(pow(X-125,2)+pow(Y-125,2),pow(115,2)),0,255)'[avatar];[0:v][avatar]overlay=(W-250)/2:H-280" \
  -c:a aac -shortest output_vertical.mp4
```

## Content Pipeline: Script → Published Video

Full end-to-end for one piece of short-form content:

```
1. Write script (30-45s, ~75-110 words)
     ↓
2. Generate voiceover (ElevenLabs TTS)
     ↓
3. Generate/select avatar image
     ↓
4. Create talking head video (Omnihuman/Aurora)
     ↓
5. Record screen demo (OBS or LiteSnip)
     ↓
6. Composite avatar bubble over screen recording (FFmpeg)
     ↓
7. Add background music (ElevenLabs music gen, 10-15% volume)
     ↓
8. Add captions/text overlays (FFmpeg or CapCut)
     ↓
9. Export 9:16 for TikTok/Shorts/Reels
```

## Batch Content Production

For producing multiple videos efficiently:

```bash
# Generate voiceovers for 5 scripts at once
for script in scripts/*.txt; do
  text=$(cat "$script")
  name=$(basename "$script" .txt)
  curl -X POST http://127.0.0.1:8200/v1/marketing/generate/voiceover \
    -H "Content-Type: application/json" \
    -d "{\"text\": \"$text\", \"voice_id\": \"JBFqnCBsd6RMkjVDRZzb\"}" \
    --no-buffer -o "voiceovers/${name}.mp3"
done
```

Re-use the same avatar image across all videos for brand consistency. Only the voiceover changes per video.

## Voice Selection for Content

| Voice | ID | Vibe | Best For |
|-------|----|------|----------|
| George | `JBFqnCBsd6RMkjVDRZzb` | British, professional | Explainers, B2B, "smart developer" |
| Antoni | `ErXwobaYiN019PkySvjV` | American, casual | Startup energy, TikTok, relatable |
| Adam | `pNInz6obpgDQGcFmaJgB` | American, authoritative | Product launches, "trust me" content |
| Rachel | `21m00Tcm4TlvDq8ikWAM` | American, friendly | Consumer SaaS, approachable |

**For Lite Suite content:** Antoni (casual dev energy) or George (polished tech explainer) work best.

## Script Templates for Talking Head Shorts

### "You're Doing It Wrong" (30s)
```
[0-3s] "Stop paying for cloud AI when you have a GPU sitting right there."
[3-12s] "Most developers are sending their code to OpenAI, waiting for responses, paying per token — while their $2000 GPU does nothing."
[12-25s] "With Lite Suite, Claude Code talks to your GPU directly. Image gen, voice, LLMs — all local. Watch." [cut to screen demo]
[25-30s] "Link in bio. Your GPU will thank you."
```

### "Watch This" Demo (30s)
```
[0-3s] "Watch Claude Code generate an image on my local GPU in real time."
[3-25s] [Avatar narrates while screen shows LiteImage generating]
"I type a prompt, Claude picks the model, loads it onto my 5090, and we get a Flux image in 8 seconds. No API calls. No cloud. No waiting."
[25-30s] "This is Lite Suite. Everything runs here." [point down gesture]
```

### "3 Things" Countdown (30s)
```
[0-3s] "Three things Claude Code can do on your GPU that ChatGPT literally cannot."
[3-12s] "Number 3: Generate images locally with Flux and SDXL — no Midjourney subscription."
[12-20s] "Number 2: Run voice dictation with a local TTS engine — completely private."
[20-27s] "Number 1: Orchestrate an entire AI workflow — image gen, code, voice — all on your hardware."
[27-30s] "Lite Suite. Link in bio."
```

## Output Artifacts

Save generated assets to:
```
ai/artifacts/marketing/avatar/
├── images/           # Avatar source images
│   └── {name}_avatar_v{N}.png
├── voiceovers/       # Generated voice tracks
│   └── {name}_vo_{script_id}.mp3
├── talking_heads/    # Raw talking head videos
│   └── {name}_head_{script_id}.mp4
├── composites/       # Final composited videos
│   └── {name}_final_{platform}_{script_id}.mp4
└── scripts/          # Script text files
    └── {script_id}.txt
```

## Quality Checklist

Before publishing:
- [ ] Avatar image is clear, front-facing, well-lit
- [ ] Voiceover matches script length (150 WPM pace)
- [ ] Lip sync looks natural (no uncanny valley lag)
- [ ] Avatar bubble is properly positioned (not covering key UI in demo)
- [ ] Background music at 10-15% volume (not competing with voice)
- [ ] Captions added (85% of social viewers watch muted)
- [ ] Exported in 9:16 for Shorts/TikTok/Reels
- [ ] Hook in first 3 seconds (pattern interrupt or bold claim)
- [ ] CTA at end (link in bio, subscribe, etc.)
- [ ] Video under 60s (sweet spot: 30-45s)
