---
name: Remotion Studio
description: Create programmatic marketing videos using React + Remotion. Use for video ads, product demos, explainer videos, and social content. Covers Studio panel, compositions, animations, audio sync, and render CLI.
version: 1.0.0
---

# REMOTION STUDIO

Remotion is a React-based video framework. Videos are functions of frames over time. The video toolkit at `tools/marketing/claude-code-video-toolkit/` provides templates, transitions, and Python tools.

**Does NOT use `/generate/video` Gateway endpoint** — that endpoint was removed. Use Remotion directly.

## Quick Start

```bash
# Open Remotion Studio preview
cd tools/marketing/claude-code-video-toolkit
npx remotion studio

# Or within a project
cd tools/marketing/claude-code-video-toolkit/projects/my-video
npm run studio
```

## Project Setup

```bash
# Create new project from template
cp -r tools/marketing/claude-code-video-toolkit/templates/product-demo \
       tools/marketing/claude-code-video-toolkit/projects/my-campaign
cd tools/marketing/claude-code-video-toolkit/projects/my-campaign
npm install
npm run studio   # Preview
npm run render   # Export MP4
```

**Templates available:**
- `product-demo` — Dark tech aesthetic, scene-based (title/problem/solution/demo/stats/CTA)
- `sprint-review` — Config-driven sprint review videos

## Core Concepts

```tsx
import { useCurrentFrame, useVideoConfig } from 'remotion';

const MyScene = () => {
  const frame = useCurrentFrame();                    // 0-indexed frame number
  const { fps, durationInFrames, width, height } = useVideoConfig();
  return <div>Frame {frame} of {durationInFrames}</div>;
};
```

**Video properties:** `width`, `height` (pixels), `fps`, `durationInFrames`
**Duration math:** `durationInFrames / fps = seconds`

## Composition Registration

Register compositions in `src/Root.tsx`:

```tsx
import { Composition } from 'remotion';

export const RemotionRoot = () => (
  <>
    <Composition
      id="ProductDemo"
      component={ProductDemoComp}
      durationInFrames={450}  // 15s at 30fps
      fps={30}
      width={1920}
      height={1080}
      defaultProps={{ title: 'My Product' }}
    />
  </>
);
```

## Animations

**interpolate() — map frame to value:**
```tsx
import { interpolate, useCurrentFrame } from 'remotion';

const frame = useCurrentFrame();

// Fade in frames 0-20
const opacity = interpolate(frame, [0, 20], [0, 1], {
  extrapolateRight: 'clamp',
});

// Slide in from left
const translateX = interpolate(frame, [0, 30], [-200, 0], {
  extrapolateRight: 'clamp',
});
```

**spring() — physics-based:**
```tsx
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';

const frame = useCurrentFrame();
const { fps } = useVideoConfig();

const scale = spring({ frame, fps, config: { damping: 10, stiffness: 100 } });
const translateX = interpolate(spring({ frame, fps }), [0, 1], [0, 200]);
```

## Sequencing

**Sequence — time-shift children:**
```tsx
<Sequence from={30} durationInFrames={60}>
  <MyScene />  {/* useCurrentFrame() resets to 0 when parent hits frame 30 */}
</Sequence>
```

**Series — play in order:**
```tsx
import { Series } from 'remotion';

<Series>
  <Series.Sequence durationInFrames={90}><TitleSlide /></Series.Sequence>
  <Series.Sequence durationInFrames={300}><DemoClip /></Series.Sequence>
  <Series.Sequence durationInFrames={90}><CTASlide /></Series.Sequence>
</Series>
```

## Audio Sync Workflow (Voiceover to Remotion)

```bash
# 1. Generate voiceover via Gateway or voiceover.py
curl ... generate/voiceover -> saves to audio.mp3

# 2. Copy to project public folder
cp audio.mp3 tools/marketing/claude-code-video-toolkit/projects/my-video/public/audio/

# 3. Reference in Remotion
```
```tsx
import { Audio, staticFile } from 'remotion';

<Audio src={staticFile('audio/voiceover.mp3')} volume={1} />
```

**Per-scene voiceover generation (recommended):**
```bash
cd tools/marketing/claude-code-video-toolkit

# Generates separate audio file per scene from VOICEOVER-SCRIPT.md
python tools/voiceover.py --scene-dir public/audio/scenes --json
# Creates: public/audio/scenes/scene-01.mp3, scene-02.mp3, ...
```

**Timing calculation:**
```
Script words / 150 = voiceover minutes
voiceover minutes x 60 x 30fps = durationInFrames
```

## Scene Transitions

```tsx
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { glitch, lightLeak, zoomBlur } from '../../../../lib/transitions';

<TransitionSeries>
  <TransitionSeries.Sequence durationInFrames={90}>
    <TitleSlide />
  </TransitionSeries.Sequence>
  <TransitionSeries.Transition
    presentation={glitch({ intensity: 0.8 })}
    timing={linearTiming({ durationInFrames: 20 })}
  />
  <TransitionSeries.Sequence durationInFrames={120}>
    <ProblemSlide />
  </TransitionSeries.Sequence>
</TransitionSeries>
```

**Custom transitions (lib/transitions/):**
| Transition | Best For |
|------------|---------|
| `glitch()` | Tech demos, cyberpunk |
| `lightLeak()` | Celebrations, cinematic |
| `zoomBlur()` | CTAs, high-energy |
| `rgbSplit()` | Modern tech |
| `clockWipe()` | Playful reveals |

## Media Assets

```tsx
import { AbsoluteFill, Img, Video, Audio, OffthreadVideo, staticFile } from 'remotion';

<AbsoluteFill>
  <Img src={staticFile('images/hero.png')} />
  <OffthreadVideo src={staticFile('demo.mp4')} />   {/* Better performance */}
  <Audio src={staticFile('audio/music.mp3')} volume={0.15} />
  <Audio src={staticFile('audio/voiceover.mp3')} volume={1} />
</AbsoluteFill>
```

Place all assets in `public/` folder. Reference with `staticFile('path/relative/to/public')`.

## Render CLI

```bash
# Render to MP4
npx remotion render src/index.ts ProductDemo out.mp4

# With flags
npx remotion render src/index.ts ProductDemo out.mp4 \
  --codec=h264 \
  --scale=2 \
  --concurrency=4

# Render specific frames (for debugging)
npx remotion render src/index.ts ProductDemo out.mp4 --frames=0-59
```

## Video Timing Guidelines

| Scene Type | Duration | FPS Frames |
|------------|----------|-----------|
| Title | 3-5s | 90-150 |
| Overview | 10-20s | 300-600 |
| Demo clip | 10-30s | 300-900 |
| Stats | 8-12s | 240-360 |
| CTA | 5-10s | 150-300 |

**Pacing rules:**
- Voiceover drives timing (narration length -> scene duration)
- Real-time demos often need 1.5-2x speedup (`playbackRate`)
- Add 1-2s padding between scenes for transitions

## Output Artifact

Save final renders to:
```
ai/artifacts/marketing/video/{company}_{title}.mp4
```

## Quality Checklist

Before rendering final video:
- [ ] All scenes previewed in Remotion Studio (`npx remotion studio`)
- [ ] Voiceover audio generated and synced to frame count
- [ ] Background music at 10-20% volume when VO playing
- [ ] Transitions between all scenes (30-frame standard)
- [ ] Text is readable (min 24px at 1080p, high contrast)
- [ ] Total duration matches script word count / 150 WPM
- [ ] Rendered MP4 saved to `ai/artifacts/marketing/video/`
- [ ] No flickering (no CSS transitions — only frame-based animations)
