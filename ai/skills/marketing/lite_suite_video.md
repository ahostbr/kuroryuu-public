---
name: Lite Suite Video Production
description: End-to-end promo video production for Lite AI Suite apps using Remotion. Covers spec, scene planning, asset prep, implementation, voiceover sync, and render. Uses the official Remotion best-practices rules.
version: 1.0.0
---

# LITE SUITE VIDEO PRODUCTION

Create marketing and promo videos for Lite AI Suite apps using Remotion Studio. This skill combines the production pipeline with Remotion's official best-practices rules.

## HARD REQUIREMENT — Remotion Rules

**Before writing ANY Remotion code, you MUST Read the relevant rule files from `ai/skills/marketing/remotion-rules/`.** These are the official Remotion best practices (142K+ installs). Do not work from general knowledge.

| When You Need | Read This Rule File |
|---------------|-------------------|
| Animations (interpolate, spring) | `remotion-rules/animations.md` + `remotion-rules/timing.md` |
| Scene sequencing (Sequence, Series) | `remotion-rules/sequencing.md` |
| Scene transitions (fade, slide, wipe) | `remotion-rules/transitions.md` |
| Text animations (typewriter, word-by-word) | `remotion-rules/text-animations.md` |
| Fonts (Google Fonts, local) | `remotion-rules/fonts.md` |
| Images and logos | `remotion-rules/images.md` + `remotion-rules/assets.md` |
| Audio (music, voiceover) | `remotion-rules/audio.md` |
| Audio visualization (bars, waveforms) | `remotion-rules/audio-visualization.md` |
| Video embedding | `remotion-rules/videos.md` |
| Captions/subtitles | `remotion-rules/display-captions.md` + `remotion-rules/subtitles.md` |
| Charts and data visualization | `remotion-rules/charts.md` |
| TailwindCSS styling | `remotion-rules/tailwind.md` |
| Compositions and registration | `remotion-rules/compositions.md` |
| Dynamic metadata (duration, props) | `remotion-rules/calculate-metadata.md` |
| Parameterizable videos (Zod schema) | `remotion-rules/parameters.md` |
| Light leak overlays | `remotion-rules/light-leaks.md` |
| Voiceover generation (ElevenLabs) | `remotion-rules/voiceover.md` |
| Sound effects | `remotion-rules/sfx.md` |
| Trimming animations | `remotion-rules/trimming.md` |
| 3D content (Three.js/R3F) | `remotion-rules/3d.md` |
| Full index of all rules | `remotion-rules/INDEX.md` |

**Minimum reads for any video:** `animations.md`, `timing.md`, `sequencing.md`, `compositions.md`, `assets.md`

## Lite AI Suite Brand

### Apps in the Suite
| App | Purpose | Icon Color |
|-----|---------|-----------|
| LiteMemory | AI memory via MCP | Gold brain (9/10 — "most emotionally compelling") |
| LiteBench | LLM benchmarking | Red needle on gold |
| Lite AI Suite | Master suite icon | Neural network overflowing hex |
| LiteTerminal | Terminal integration | Clean gold hex |
| LiteDash | Dashboard | Rocket on gold |
| LiteSpeak | Voice-to-text | Sound waves |
| LiteEditor | Code editor | Volumetric code brackets |
| LiteImage | AI image generation | Gradient hex |
| LiteSnip | Screen capture | Scissors with mass |
| LiteYTTranscribe | YouTube transcription | Play button + text |
| LiteUsage | API cost tracking | Dollar sign |
| LiteNotion | Notion integration | Document + checklist |
| LiteWinTerminal | Windows Terminal | Terminal prompt |
| LiteSwap | Model swapping | Swap arrows |
| LiteWatch | Screen awareness | Eye icon |

### Brand Guidelines
- **Primary palette:** Black backgrounds, gold/amber accents (#F59E0B, #D97706)
- **Exception:** LiteBench red needle is the only justified color break
- **Hex motif:** Hexagonal frames are the suite's visual identity
- **Typography:** Clean, modern sans-serif. Minimum 32px at 1080p for readability
- **Aesthetic:** Dark tech, volumetric presence, not flat. Icons should feel like they have physical weight

### Icon Assets
Located at: `tools/marketing/output/` (generated icons)
High-res sources:
- `C:/Projects/assets/suite-icon.png` (master suite icon)
- Individual app icons in each app's `assets/` directory

## Production Workflow

### Step 1: Define Video Spec

Before anything else, define:

```markdown
## Video Spec
- **App:** [which Lite app or the whole suite]
- **Audience:** [developers, AI enthusiasts, general tech users]
- **Goal:** [awareness, demo, feature highlight, launch announcement]
- **Duration:** [15s / 30s / 60s / 90s]
- **Aspect Ratio:** [16:9 (YouTube/desktop) | 9:16 (TikTok/Reels) | 1:1 (social)]
- **Tone:** [fast/energetic | calm/professional | cinematic]
- **Voiceover:** [yes/no, voice preference]
- **Music:** [genre/mood, generated via music_gen.md]
```

### Step 2: Scene Plan

Use the Hook → Problem → Solution → Features → Social Proof → CTA structure:

| Scene | Duration | Visual | Audio | Text Overlay |
|-------|----------|--------|-------|-------------|
| Hook | 3-5s | Bold statement or question | Music intro | Attention-grabbing headline |
| Problem | 5-10s | Pain point visualization | VO begins | Problem statement |
| Solution | 5-10s | App reveal with icon | VO continues | "Meet [App Name]" |
| Features | 10-20s | Screen recordings or animated demos | VO walks through | Feature bullets |
| Social Proof | 5-10s | Stats counter, testimonials | Music swell | Numbers or quotes |
| CTA | 3-5s | Logo + URL + action | Music resolve | "Try it free" / URL |

**Duration math:** `scene_seconds × 30fps = durationInFrames`

### Step 3: Asset Preparation

```
public/
├── icons/          ← Lite suite app icons (from tools/marketing/output/)
├── screenshots/    ← App screenshots or screen recordings
├── audio/
│   ├── music/      ← Generated via ai/skills/marketing/music_gen.md
│   └── voiceover/  ← Generated via ai/skills/marketing/voiceover.md
└── fonts/          ← Custom fonts if needed
```

**Generate assets using Gateway tools:**
- Voiceover: Read `ai/skills/marketing/voiceover.md` → use Gateway `/v1/marketing/generate/voiceover`
- Music: Read `ai/skills/marketing/music_gen.md` → use Gateway `/v1/marketing/generate/music`
- Images: Read `ai/skills/marketing/image_gen.md` → use Gateway `/v1/marketing/generate/image`

### Step 4: Implement in Remotion

**BEFORE WRITING CODE:** Read the relevant `remotion-rules/*.md` files from the table above.

**Project location:** `tools/marketing/claude-code-video-toolkit/projects/`

```bash
# Create from template
cp -r tools/marketing/claude-code-video-toolkit/templates/product-demo \
      tools/marketing/claude-code-video-toolkit/projects/lite-{app-name}
cd tools/marketing/claude-code-video-toolkit/projects/lite-{app-name}
npm install
```

**Scene implementation pattern:**
```tsx
// src/scenes/HookScene.tsx
import { useCurrentFrame, useVideoConfig, interpolate, spring, Img, staticFile } from 'remotion';

export const HookScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const titleScale = spring({ frame, fps, config: { damping: 12 } });
  const opacity = interpolate(frame, [0, 20], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <div style={{ /* dark background, gold accents */ }}>
      <Img src={staticFile('icons/suite-icon.png')} />
      {/* ... */}
    </div>
  );
};
```

**Compose scenes with Series:**
```tsx
import { Series } from 'remotion';
import { Audio, staticFile } from 'remotion';

<Series>
  <Series.Sequence durationInFrames={120}><HookScene /></Series.Sequence>
  <Series.Sequence durationInFrames={240}><ProblemScene /></Series.Sequence>
  <Series.Sequence durationInFrames={240}><SolutionScene /></Series.Sequence>
  <Series.Sequence durationInFrames={450}><FeaturesScene /></Series.Sequence>
  <Series.Sequence durationInFrames={180}><SocialProofScene /></Series.Sequence>
  <Series.Sequence durationInFrames={120}><CTAScene /></Series.Sequence>
</Series>
<Audio src={staticFile('audio/music/background.mp3')} volume={0.15} />
<Audio src={staticFile('audio/voiceover/narration.mp3')} volume={1} />
```

### Step 5: Preview and Render

```bash
# Preview in Remotion Studio (already running in the Studio panel)
npm run studio

# Render final MP4
npx remotion render src/index.ts LiteSuitePromo out.mp4 --codec=h264

# Render for social (vertical)
npx remotion render src/index.ts LiteSuitePromo out-vertical.mp4 --codec=h264 --height=1920 --width=1080
```

Save final renders to: `ai/artifacts/marketing/video/`

## Video Templates

### 15s App Teaser
- Hook (3s) → App reveal with icon (5s) → One killer feature (4s) → CTA (3s)
- Fast pacing, punchy text, music-driven

### 30s Product Demo
- Hook (3s) → Problem (5s) → Solution reveal (5s) → 2-3 features (12s) → CTA (5s)
- Voiceover recommended, screen recordings

### 60s Full Promo
- Hook (5s) → Problem (8s) → Solution (8s) → Features walkthrough (20s) → Social proof (10s) → CTA (9s)
- Full voiceover, music bed, transitions between scenes

### 90s Suite Overview
- Suite intro (10s) → Problem landscape (10s) → Suite reveal (10s) → App-by-app highlights (40s) → Integration story (10s) → CTA (10s)
- Show how apps work together, not just individually

## Quality Checklist

Before rendering final video:
- [ ] All `remotion-rules/*.md` files read for techniques used
- [ ] Previewed in Remotion Studio — all scenes play correctly
- [ ] Brand colors correct (black bg, gold/amber accents, hex motifs)
- [ ] App icons are the Van Gogh-approved new versions
- [ ] Voiceover audio synced to frame count (words / 150 WPM × fps)
- [ ] Background music at 10-20% volume when VO is playing
- [ ] Transitions between all scenes (20-30 frame standard)
- [ ] Text readable (min 32px at 1080p, high contrast on dark bg)
- [ ] No CSS transitions — only frame-based animations (no flickering)
- [ ] Total duration matches spec
- [ ] Rendered MP4 saved to `ai/artifacts/marketing/video/`
- [ ] Vertical version rendered if needed for social (9:16)
