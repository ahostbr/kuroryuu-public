---
name: ElevenLabs Video
description: Generate and edit videos using ElevenLabs Image & Video platform. Text-to-video, image-to-video, video-to-video, lip sync on existing footage, upscaling. Supports Sora 2, Veo 3.1, Kling, Wan, Runway Gen-4.5, and more.
version: 1.0.0
---

# ELEVENLABS VIDEO GENERATION

Generate videos using ElevenLabs' multi-model video platform. Access Sora 2, Veo 3.1, Kling, Wan, Runway Gen-4.5, and specialized lip-sync/avatar models — all through one API.

## Authentication

```bash
-H "xi-api-key: $ELEVENLABS_API_KEY"
```

## Available Models

### Video Generation

| Model | Modes | Duration | Resolution | Best For |
|-------|-------|----------|------------|----------|
| **Sora 2 Pro** | Text→Video, Image→Video | 5-20s | Up to 4K | Highest quality cinematic |
| **Sora 2** | Text→Video, Image→Video | 5-20s | Up to 1080p | Fast iteration |
| **Veo 3.1** | Text→Video, Image→Video | 4-8s | Up to 4K | Google's latest, fast |
| **Veo 3.1 Fast** | Text→Video | 4-8s | 720p | Quick drafts |
| **Kling 2.5** | Text→Video, Image→Video | 5-10s | 1080p | Balanced quality/speed |
| **Kling 3.0** | Text→Video, Image→Video | 5-10s | 1080p | Latest Kling |
| **Kling 2.6 Motion** | Motion transfer | 5-10s | 1080p | Apply motion from reference |
| **Wan 2.5 / 2.6** | Text→Video, Image→Video | 5-10s | 1080p | Open-source quality |
| **Runway Gen-4.5** | Text→Video, Image→Video | 5-10s | 1080p | Creative/artistic |
| **Runway Aleph** | Video→Video | — | 1080p | Video editing/transformation |
| **LTX Audio-Video** | Text→Video (with audio) | 5-15s | 1080p | Video with generated audio |
| **LTX 2 Pro** | Text→Video, Image→Video | 5-15s | 1080p | Latest LTX |
| **Seedance 1.5 Pro** | Text→Video, Image→Video | 5-10s | 1080p | Motion-focused |
| **Act-Two** | Performance transfer | — | 1080p | Transfer acting performance |

### Lip-Sync & Avatar

| Model | Input | Output | Best For |
|-------|-------|--------|----------|
| **Omnihuman 1.5** | Image + audio | Talking video | Photo → talking head |
| **Creatify Aurora** | Audio (+ optional image) | Avatar video | Full reactive avatar with expressions |
| **Veed LipSync** | Video + audio | Re-dubbed video | Swap audio on existing footage |
| **Sync Lipsync 2 Pro** | Video + audio | 4K lip-synced video | Studio-grade dubbing |

### Image Generation

| Model | Best For |
|-------|----------|
| **Seedream 4.5** | Photorealistic, highest quality |
| **Flux 2 Pro** | Creative, stylized |
| **GPT Image 1.5** | Versatile, good text rendering |
| **Nano Banana Pro** | Fast iterations |
| **Gen-4 Image Turbo** | Quick product shots |

### Upscaling

| Model | Scale | Notes |
|-------|-------|-------|
| **Topaz Upscale** | 1x–4x | AI upscaling for final export |

## Aspect Ratios

| Ratio | Use Case |
|-------|----------|
| 16:9 | YouTube, desktop, presentations |
| 9:16 | TikTok, YouTube Shorts, Reels |
| 1:1 | Instagram feed, Twitter/X |
| 4:3 | Classic presentations |
| 21:9 | Ultrawide, cinematic |

## Workflows

### Text-to-Video (Product B-Roll)

Generate 5-10s clips for use as B-roll in longer videos or as standalone Shorts.

**Prompt structure:** `[Action/Scene] + [Style] + [Camera movement] + [Lighting/Mood]`

```
"Close-up of hands typing on a mechanical keyboard, dark room, monitor showing code,
 neon accent lighting, smooth dolly forward, cinematic, 4K"

"GPU fans spinning up with RGB lighting, rack focus from GPU to monitor showing
 AI-generated image appearing, dark tech aesthetic, slow motion"

"Split screen transformation: left side shows cluttered cloud dashboard,
 right side shows clean local desktop app, smooth transition"
```

**Marketing-specific prompts for Lite Suite:**
```
# Hero clip
"Dramatic GPU rendering sequence, particles of light flowing from graphics card
 into a dark monitor screen, volumetric lighting, amber gold accents on black"

# Problem visualization
"Frustrated developer staring at loading spinner on cloud API dashboard,
 dimly lit office, clock ticking, photorealistic"

# Solution visualization
"Developer smiling as local AI generates images instantly on desktop app,
 bright modern workspace, fast cuts, energetic, tech startup vibe"
```

### Image-to-Video (Animate Screenshots)

Turn app screenshots into animated clips:

1. Screenshot your app (LiteImage, LiteEditor, etc.)
2. Upload as reference image
3. Prompt: "Subtle UI animation, cursor moving through menu items, smooth transitions between panels"

Great for showing app features without recording actual screen.

### Video-to-Video (Transform Existing Footage)

Take existing screen recordings and enhance:
- Add cinematic color grading
- Apply style transfer (make screen recording look more polished)
- Transform rough demos into branded content

### Lip-Sync Workflow (Re-dub Existing Video)

If you have existing video of yourself or a spokesperson:

1. Record video (any audio quality is fine)
2. Generate clean voiceover via ElevenLabs TTS
3. Apply Veed LipSync or Sync Lipsync 2 Pro
4. Output: same video with perfectly synced new audio

This lets you "punch up" casual recordings with polished narration.

## Short-Form Video Assembly

### 30-Second TikTok/Short Structure

```
[0-3s]  Hook clip (text-to-video, attention-grabbing)
[3-8s]  Avatar talking head (Omnihuman/Aurora)
[8-22s] Screen recording with avatar bubble overlay
[22-27s] B-roll clip (text-to-video, product beauty shot)
[27-30s] CTA + logo (static frame or subtle animation)
```

**Audio layers:**
- Voiceover (ElevenLabs TTS) — 100% volume
- Background music (ElevenLabs music gen) — 10-15% volume
- SFX transitions (ElevenLabs sfx.py) — on cuts

### Batch Production: 5 Videos in 1 Hour

1. Write 5 scripts (10 min)
2. Generate 5 voiceovers in parallel (5 min)
3. Generate avatar talking heads for each (15 min)
4. Record 5 screen demos (15 min)
5. Composite all 5 with FFmpeg (10 min)
6. Add music + captions (5 min)

## Integration with Existing Skills

| Step | Skill to Use |
|------|-------------|
| Script writing | `ad_creative.md` (Hook→Story→Offer) or `concept_generator.md` |
| Voiceover | `voiceover.md` (ElevenLabs TTS) |
| Background music | `music_gen.md` (ElevenLabs music) |
| Avatar creation | `avatar_video.md` (this pipeline) |
| Image assets | `image_gen.md` (Gemini) or ElevenLabs image gen |
| Video assembly | `remotion_studio.md` or FFmpeg |
| Competitor research | `video_analysis.md` + `social_intel.md` |
| Content ideas | `concept_generator.md` |

## Output Artifacts

```
ai/artifacts/marketing/video/
├── clips/            # Generated video clips (b-roll, text-to-video)
│   └── {name}_{model}_{duration}s.mp4
├── talking_heads/    # Avatar videos (from avatar_video.md)
├── composites/       # Final assembled videos
│   └── {platform}_{title_slug}.mp4
├── images/           # Generated images (ElevenLabs models)
│   └── {name}_{model}.png
└── upscaled/         # Upscaled assets
    └── {name}_4x.mp4
```

## Quality Checklist

Before publishing video content:
- [ ] Hook in first 1-3 seconds (TikTok needs 1s, YouTube can take 3s)
- [ ] Video matches platform aspect ratio (9:16 for Shorts/TikTok/Reels)
- [ ] Lip sync looks natural (check avatar at 2x speed to spot issues)
- [ ] Audio is clean — no clipping, voice clear over music
- [ ] Captions/subtitles added (essential for all platforms)
- [ ] CTA is clear and present (link in bio, subscribe, etc.)
- [ ] Duration is optimal (30-45s for Shorts, 15-30s for TikTok)
- [ ] Thumbnail/cover frame is compelling (first frame matters)
- [ ] Title/description includes relevant keywords
- [ ] Saved to `ai/artifacts/marketing/video/`
