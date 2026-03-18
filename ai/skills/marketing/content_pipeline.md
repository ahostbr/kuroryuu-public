---
name: Content Pipeline
description: End-to-end short-form video production pipeline for TikTok, YouTube Shorts, and Instagram Reels. Orchestrates script writing, voiceover, avatar generation, screen recording, compositing, and publishing. Chains avatar_video, elevenlabs_video, voiceover, and music_gen skills.
version: 1.0.0
---

# CONTENT PIPELINE

End-to-end production pipeline for short-form video content. Takes a topic or script and produces a publish-ready video for TikTok, YouTube Shorts, and Instagram Reels.

## Pipeline Overview

```
IDEA → SCRIPT → VOICE → AVATAR → SCREEN CAPTURE → COMPOSITE → PUBLISH
  │       │        │        │           │              │           │
  │       │        │        │           │              │           └─ Upload to platforms
  │       │        │        │           │              └─ FFmpeg: avatar + screen + music + captions
  │       │        │        │           └─ OBS / manual screen recording of Lite Suite
  │       │        │        └─ ElevenLabs Omnihuman/Aurora: image + voice → talking head
  │       │        └─ ElevenLabs TTS: script → voiceover.mp3
  │       └─ Write 30-45s script using Hook→Demo→CTA structure
  └─ Choose from content pillars or adapt from competitor analysis
```

## Content Pillars for Lite Suite

| Pillar | Hook Style | Demo Focus | Post Frequency |
|--------|-----------|------------|----------------|
| **"Watch Claude Do This"** | "Watch Claude [action] in real time" | Screen recording of Claude + Lite app | 3x/week |
| **"You're Doing It Wrong"** | "Stop [common mistake]" | Show wrong way → right way with Lite Suite | 2x/week |
| **"Did You Know Your GPU Can..."** | "Your $2000 GPU is doing nothing while..." | Specific feature demo | 2x/week |
| **"Local vs Cloud"** | "I stopped paying for [cloud service]" | Side-by-side comparison | 1x/week |
| **"Build With Me"** | "Let's build [thing] with just my GPU" | Extended walkthrough | 1x/week |

**Target cadence:** 5-7 videos per week across all platforms.

## Phase 1: Script

### Script Structure (30-45 seconds)

```
[0-3s]   HOOK — Pattern interrupt, bold claim, or question
[3-8s]   PROBLEM — What they're doing wrong / what's costing them
[8-25s]  DEMO — Show the solution working (screen recording + avatar narration)
[25-30s] CTA — "Link in bio" / "Follow for more" / "Try it free"
```

**Word count:** 75-110 words for 30-45 seconds (~150 WPM)

### Script Quality Rules

**DO:**
- Start with a strong verb or question (no "hey guys" or "so today")
- Use specific numbers ("8 seconds" not "fast", "$20/month" not "expensive")
- Name the apps/tools explicitly ("LiteImage", "Claude Code", "Flux")
- End with one clear CTA (not three)

**DON'T:**
- AI slop: "unlock", "game-changing", "revolutionary", "delve"
- Throat-clearing: "So I wanted to show you something today..."
- Multiple CTAs: "Like, subscribe, hit the bell, follow on Twitter, and..."
- Talking about features without showing them

### Script Templates

**Template A: "You're Doing It Wrong" (30s)**
```
[HOOK] "You're paying [Cloud Service] [amount] a month for something your GPU can do for free."
[PROBLEM] "[Specific pain]: [specific cost/time/privacy issue]."
[DEMO] "Watch — [describe what Claude does in Lite Suite]. [Specific metric: time, cost, quality]."
[CTA] "[App name]. Link in bio."
```

**Template B: "Watch This" Demo (30s)**
```
[HOOK] "Watch Claude Code [impressive action] on my local GPU."
[DEMO - 20s] [Avatar narrates while screen shows app in action]
"I [action], Claude [orchestration step], and [result] in [time]. No API. No cloud. No waiting."
[CTA] "This is Lite Suite. Link in bio."
```

**Template C: "3 Things" Countdown (45s)**
```
[HOOK] "Three things Claude Code can do on your GPU that [competitor] literally cannot."
[#3 - 10s] "[Feature 3 with demo clip]"
[#2 - 10s] "[Feature 2 with demo clip]"
[#1 - 10s] "[Feature 1 — the big one — with demo clip]"
[CTA] "[Product]. Link in bio."
```

**Template D: "I Tried X for 7 Days" (45s)**
```
[HOOK] "I [challenge statement] for [timeframe]. Here's what happened."
[MONTAGE - 30s] Quick cuts of daily usage, results, surprises
[RESULT] "[Specific measurable outcome]."
[CTA] "[Product]. Link in bio."
```

## Phase 2: Voiceover

**Read:** `ai/skills/marketing/voiceover.md`

```bash
curl -X POST http://127.0.0.1:8200/v1/marketing/generate/voiceover \
  -H "Content-Type: application/json" \
  -d '{"text": "[script text]", "voice_id": "JBFqnCBsd6RMkjVDRZzb"}' \
  --no-buffer 2>/dev/null | while IFS= read -r line; do
    [[ "$line" == data:* ]] && echo "${line#data: }"
  done || true
```

**Recommended voices for Lite Suite:**
- **George** (`JBFqnCBsd6RMkjVDRZzb`) — polished tech explainer
- **Antoni** (`ErXwobaYiN019PkySvjV`) — casual dev energy, TikTok native

## Phase 3: Avatar Talking Head

**Read:** `ai/skills/marketing/avatar_video.md`

1. Use consistent avatar image across all videos (brand recognition)
2. Feed voiceover audio → Omnihuman 1.5 or Creatify Aurora
3. Output: talking head video clip with synced lips + expressions

## Phase 4: Screen Recording

Record the demo portion of the video:

**Recording specs:**
- Resolution: 1920x1080 (will be cropped/scaled for 9:16)
- Frame rate: 60fps (smoother for screen content)
- Clean desktop (hide personal files, notifications)
- Pre-stage the demo (have models loaded, files ready)
- Record 2-3 takes, pick the cleanest

**What to capture per app:**

| App | Best Demo Moments |
|-----|------------------|
| **LiteImage** | Prompt → generation → result appearing. Model loading. Batch comparison. |
| **LiteSpeak** | Hotkey press → recording indicator → transcription → processed text appearing |
| **LiteEditor** | Canvas mode: dragging panes around. Claude running in terminal panel. |
| **LiteTerminal** | Multiple terminals in grid layout. Claude running commands across them. |
| **LiteYT** | Batch scrape progress. Analytics dashboard with charts. |
| **LiteBench** | Live SSE scoring. Score gauge filling up. Model comparison charts. |
| **LiteCore** | Setup wizard. Dashboard with all apps. MCP status panel. |

## Phase 5: Composite

**Read:** `ai/skills/marketing/avatar_video.md` (composite section)

Assemble final video: screen recording + avatar bubble + music + captions.

### FFmpeg Assembly

```bash
# 1. Scale screen recording for 9:16 (crop center or pad)
ffmpeg -i screen_demo.mp4 -vf "crop=ih*9/16:ih" screen_vertical.mp4

# 2. Overlay avatar bubble (bottom-center for vertical)
ffmpeg -i screen_vertical.mp4 -i avatar_talking.mp4 \
  -filter_complex "[1:v]scale=250:250,format=yuva420p,geq='lum=lum(X,Y):a=if(gt(pow(X-125,2)+pow(Y-125,2),pow(115,2)),0,255)'[avatar];[0:v][avatar]overlay=(W-250)/2:H-280" \
  -c:a aac composite.mp4

# 3. Add background music (10-15% volume)
ffmpeg -i composite.mp4 -i background_music.mp3 \
  -filter_complex "[1:a]volume=0.12[music];[0:a][music]amix=inputs=2:duration=shortest" \
  -c:v copy final.mp4

# 4. Add captions (burn-in SRT)
ffmpeg -i final.mp4 -vf "subtitles=captions.srt:force_style='FontSize=24,FontName=Arial Bold,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,Outline=2,Alignment=2'" \
  output_with_captions.mp4
```

### Caption Generation

For auto-generating captions from voiceover:

```bash
# Use ElevenLabs speech-to-text or Whisper
# Then format as SRT for FFmpeg burn-in
```

Or use CapCut's auto-caption feature (most creators use this for the animated caption style).

## Phase 6: Publish

### Platform-Specific Optimization

| Platform | Title Style | Hashtags | Post Time (EST) |
|----------|------------|----------|-----------------|
| **TikTok** | Curiosity gap, short | 3-5 niche tags | 7-9am, 12-3pm, 7-9pm |
| **YouTube Shorts** | Keyword-rich, searchable | In description only | 12-3pm, 5-7pm |
| **Instagram Reels** | Conversational, emoji OK | 5-10 tags, mix sizes | 11am-1pm, 7-9pm |

### Cross-Posting Strategy

Record once, publish everywhere:
1. **Primary:** YouTube Shorts (most discoverability, SEO)
2. **Same day:** TikTok (fastest virality, trend riding)
3. **Next day:** Instagram Reels (slower burn, saved/shared more)

Same video, different:
- Title/caption (platform-native language)
- Hashtags (platform-specific)
- First comment (engagement bait)

### First Comment Templates

```
TikTok: "If you want to try this, the app is free → link in bio 🔗"
YouTube: "Full tutorial on the channel — which feature should I demo next?"
Instagram: "Save this for later 🔖 Drop a 🔥 if you want me to show [next feature]"
```

## Content Calendar Template

| Day | Pillar | App Focus | Script Template |
|-----|--------|-----------|-----------------|
| Mon | "Watch Claude Do This" | LiteImage | Template B (demo) |
| Tue | "You're Doing It Wrong" | LiteSpeak | Template A (wrong→right) |
| Wed | "3 Things" | Mixed | Template C (countdown) |
| Thu | "Watch Claude Do This" | LiteEditor | Template B (demo) |
| Fri | "Local vs Cloud" | LiteImage | Template A (comparison) |
| Sat | "Build With Me" | Mixed | Template D (case study) |
| Sun | Repurpose best performer | — | Re-edit top video with new hook |

## Metrics to Track

| Metric | Target | Meaning |
|--------|--------|---------|
| View-through rate | >40% | Hook is working |
| Engagement rate | >5% | Content resonates |
| Profile visits | Growing week/week | Converting viewers to prospects |
| Link clicks | Growing week/week | Funnel is working |
| Follower growth | >100/week | Sustained interest |

## Output Artifacts

```
ai/artifacts/marketing/content-pipeline/
├── scripts/                    # Script text files
│   └── {date}_{pillar}_{app}.txt
├── voiceovers/                 # Generated audio
│   └── {date}_{script_id}.mp3
├── screen-recordings/          # Raw screen captures
│   └── {date}_{app}_{demo}.mp4
├── finals/                     # Publish-ready videos
│   └── {platform}_{date}_{title_slug}.mp4
├── captions/                   # SRT files
│   └── {date}_{script_id}.srt
└── calendar.md                 # Content calendar tracking
```

## Quality Checklist

Before publishing any video:
- [ ] Hook grabs attention in first 1-3 seconds
- [ ] Script follows template structure (Hook→Demo→CTA)
- [ ] No AI slop language in script
- [ ] Voiceover is clean and matches script timing
- [ ] Avatar lip sync is natural
- [ ] Screen recording shows real product (not mockup)
- [ ] Avatar bubble doesn't cover key UI elements
- [ ] Background music at 10-15% (voice is clear)
- [ ] Captions are present and accurate
- [ ] Aspect ratio is 9:16 for short-form
- [ ] Duration is 30-45 seconds
- [ ] CTA is clear and singular
- [ ] Title is platform-optimized
- [ ] Hashtags are relevant and not spammy
- [ ] Cross-posted to all 3 platforms
