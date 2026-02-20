---
name: Music Generation
description: Generate background music and sound effects via Gateway ElevenLabs music integration. Use for video background scores, ad music, and audio branding. Supports SSE streaming.
version: 1.0.0
---

# MUSIC GENERATION TOOL

You have access to the Gateway music endpoint at `POST /v1/marketing/generate/music`. Uses ElevenLabs music generation via the video toolkit.

## Endpoint Reference

```bash
POST http://127.0.0.1:8200/v1/marketing/generate/music
Content-Type: application/json

{
  "prompt": "string",  # Music description (required)
  "duration": 30       # Duration in seconds, 5-180 (required)
}
```

**SSE Event stream:**
```
data: {"type": "progress", "progress": 40, "message": "Composing..."}
data: {"type": "complete", "path": "/absolute/path/to/music.mp3", "metadata": {...}}
```

## SSE Curl Pattern

```bash
curl -X POST http://127.0.0.1:8200/v1/marketing/generate/music \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Upbeat corporate tech, modern, positive energy, no lyrics", "duration": 60}' \
  --no-buffer 2>/dev/null | while IFS= read -r line; do
    [[ "$line" == data:* ]] && echo "${line#data: }"
  done
# Wait for: {"type":"complete","path":"/path/to/music.mp3","metadata":{...}}
```

**GUI auto-display:** When complete, the Music Generation panel in the Desktop GUI automatically updates. No extra steps needed.

## music.py (Direct Python Tool)

```bash
cd tools/marketing/claude-code-video-toolkit

# Generate background music
python tools/music.py --prompt "Subtle corporate background" --duration 120 --output music.mp3

# Add to existing video
python tools/addmusic.py --input video.mp4 --prompt "Subtle corporate" --output output.mp4
python tools/addmusic.py --input video.mp4 --music bg.mp3 \
  --music-volume 0.2 --fade-in 2 --fade-out 3 --output output.mp4
```

## SFX Presets (sfx.py)

For sound effects in video transitions and UI moments:

```bash
cd tools/marketing/claude-code-video-toolkit

# Use preset
python tools/sfx.py --preset whoosh --output sfx.mp3
python tools/sfx.py --preset click --output click.mp3

# Custom description
python tools/sfx.py --prompt "Thunder crack, dramatic reveal" --output thunder.mp3
```

**Available presets:** `whoosh`, `click`, `chime`, `error`, `pop`, `slide`

## ElevenLabs music.compose() (Direct SDK)

For programmatic music composition in Python scripts:

```python
from elevenlabs import ElevenLabs

client = ElevenLabs(api_key="your_key")
result = client.text_to_sound_effects.convert(
    text="Upbeat corporate background music, modern tech vibe, 120 BPM",
    duration_seconds=60,
    prompt_influence=0.3,
)

with open("background.mp3", "wb") as f:
    for chunk in result:
        f.write(chunk)
```

## Prompt Structure

**Music prompts follow:** `[Mood] + [Genre] + [Tempo] + [Instrumentation] + [No lyrics if needed]`

```
# Corporate/SaaS
"Upbeat corporate, modern electronic, 120 BPM, piano and synth, no lyrics, positive energy"

# Luxury/Premium
"Cinematic orchestral, elegant, slow tempo, piano strings, sophisticated atmosphere, no lyrics"

# Startup/Energetic
"Tech startup vibes, electronic, driving beat, synth bass, motivational, no lyrics"

# Calm/Explainer
"Ambient corporate, soft background music, 80 BPM, acoustic guitar light touch, no lyrics"

# Dramatic/Impact
"Epic cinematic, building tension, orchestral percussion, dramatic reveal, no lyrics"
```

## Duration Guidelines

| Use Case | Duration | Notes |
|----------|----------|-------|
| 30s ad | 35s | Extra 5s for fade out |
| 60s ad | 70s | Breathing room |
| 2min explainer | 130s | With fade in/out |
| Background loop | 60-90s | Loop-friendly endings |
| Max duration | 180s | API limit |

## Volume Mixing (for videos)

Use low volumes for background music:
- Background while narration plays: **10-20%** (`volume={0.15}` in Remotion)
- Music-only moments (no VO): **60-80%** (`volume={0.7}`)
- Fade in/out: Use FFmpeg addmusic tool (2-3s fades)

## Output Artifact

```bash
cp /path/from/complete/event ai/artifacts/marketing/music/{company}_{purpose}.mp3
```

**Naming:**
```
ai/artifacts/marketing/music/{company}_{mood}_{duration}s.mp3
# Examples:
# acme_corporate_bg_120s.mp3
# acme_ad_energetic_35s.mp3
```

## Quality Checklist

Before using generated music:
- [ ] Duration matches target video length + fade buffer
- [ ] Mood matches brand/ad tone (no mismatch between music energy and visuals)
- [ ] Volume set appropriately (background vs featured)
- [ ] No jarring cutoffs — ending has natural resolution
- [ ] Saved to `ai/artifacts/marketing/music/`
- [ ] If adding to video: use addmusic.py for proper fade in/out
