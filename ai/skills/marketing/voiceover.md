---
name: Voiceover
description: Generate AI voiceovers via Gateway ElevenLabs integration. Use for video ads, product demos, explainer videos, and audio content. Supports SSE streaming with real-time progress.
version: 1.0.0
---

# VOICEOVER TOOL

You have access to the Gateway voiceover endpoint at `POST /v1/marketing/generate/voiceover`. Uses ElevenLabs TTS via the video toolkit.

## Endpoint Reference

```bash
POST http://127.0.0.1:8200/v1/marketing/generate/voiceover
Content-Type: application/json

{
  "text": "string",     # Script text to convert to speech (required)
  "voice_id": "string"  # ElevenLabs voice ID (optional, uses default)
}
```

**SSE Event stream:**
```
data: {"type": "progress", "progress": 30, "message": "Generating audio..."}
data: {"type": "complete", "path": "/absolute/path/to/audio.mp3", "metadata": {...}}
```

## SSE Curl Pattern

```bash
curl -X POST http://127.0.0.1:8200/v1/marketing/generate/voiceover \
  -H "Content-Type: application/json" \
  -d '{"text": "Your product is costing you 10 hours a week. Here is how to fix that.", "voice_id": "JBFqnCBsd6RMkjVDRZzb"}' \
  --no-buffer 2>/dev/null | while IFS= read -r line; do
    [[ "$line" == data:* ]] && echo "${line#data: }"
  done || true
# Wait for: {"type":"complete","path":"/path/to/audio.mp3","metadata":{...}}
```

**GUI auto-display:** When complete, the Voiceover panel in the Desktop GUI automatically updates. No extra steps needed.

## Voice IDs (ElevenLabs)

| Voice | ID | Gender | Accent | Best For |
|-------|----|--------|--------|----------|
| George | `JBFqnCBsd6RMkjVDRZzb` | Male | British | Professional explainers, B2B |
| Rachel | `21m00Tcm4TlvDq8ikWAM` | Female | American | Friendly SaaS, consumer |
| Adam | `pNInz6obpgDQGcFmaJgB` | Male | American | Authority, enterprise |
| Bella | `EXAVITQu4vr4xnSDxMaL` | Female | British | Premium, luxury |
| Antoni | `ErXwobaYiN019PkySvjV` | Male | American | Casual, startup energy |

## ElevenLabs Models

| Model | Speed | Quality | Use When |
|-------|-------|---------|----------|
| `eleven_turbo_v2_5` | Fast | Good | Prototyping, quick iterations |
| `eleven_multilingual_v2` | Medium | Best | Final production, multilingual |
| `eleven_flash_v2_5` | Fastest | Standard | Bulk generation, drafts |

## Voice Settings by Style

**Professional/B2B:**
```json
{"stability": 0.7, "similarity_boost": 0.8, "style": 0.3, "use_speaker_boost": true}
```

**Energetic/Consumer:**
```json
{"stability": 0.4, "similarity_boost": 0.7, "style": 0.6, "use_speaker_boost": true}
```

**Authoritative/Enterprise:**
```json
{"stability": 0.8, "similarity_boost": 0.9, "style": 0.2, "use_speaker_boost": true}
```

## Script Writing Guidelines

**Pace:** ~150 words per minute for comfortable narration
- 30s ad = ~75 words
- 60s ad = ~150 words
- 2min explainer = ~300 words

**Pause handling:** Add `<break time="0.5s"/>` for natural pauses (ElevenLabs SSML):
```
"Here is the key insight. <break time="0.7s"/> Most teams waste 40% of their time on manual work."
```

**Script structure for ads:**
```
[Hook - 5s]: Bold claim or question
[Problem - 10s]: Pain point they recognize
[Solution - 10s]: How you solve it
[Proof - 10s]: Specific metric or social proof
[CTA - 5s]: Single clear action
```

## voiceover.py (Direct Python Tool)

For per-scene voiceover in Remotion projects:

```bash
cd tools/marketing/claude-code-video-toolkit

# Single script file
python tools/voiceover.py --script VOICEOVER-SCRIPT.md --output voiceover.mp3

# Per-scene generation (recommended for Remotion)
python tools/voiceover.py --scene-dir public/audio/scenes --json

# Per-scene with concat for SadTalker narrator
python tools/voiceover.py --scene-dir public/audio/scenes \
  --concat public/audio/voiceover-concat.mp3
```

## Output Artifact

Generated audio is auto-saved by the Gateway. Copy to artifact directory:

```bash
cp /path/from/complete/event ai/artifacts/marketing/audio/{company}_{purpose}.mp3
```

**Naming convention:**
```
ai/artifacts/marketing/audio/{company}_{scene}_{voice}.mp3
# Examples:
# acme_hero_george_v1.mp3
# acme_ad30s_rachel.mp3
```

## Quality Checklist

Before using generated voiceover:
- [ ] Script is ~150 WPM pace (count words, divide by intended seconds)
- [ ] Pauses added at natural breath points with `<break time="Xs"/>`
- [ ] Voice chosen matches brand tone (professional/casual/authority)
- [ ] No filler words ("um", "you know", "basically")
- [ ] CTA is clear and single (one action, not three)
- [ ] Saved to `ai/artifacts/marketing/audio/`
- [ ] Listen to output before using in video (catch pronunciation errors)
