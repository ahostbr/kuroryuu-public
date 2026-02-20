---
name: Image Generation
description: Generate marketing images via Gateway AI image generation. Use for ad creative, landing page heroes, social media assets, product mockups. Supports SSE streaming with real-time progress.
version: 1.0.0
---

# IMAGE GENERATION TOOL

You have access to the Gateway image generation endpoint at `POST /v1/marketing/generate/image`. Uses Google Imagen via the google-image-gen-api-starter tool.

## Endpoint Reference

```bash
POST http://127.0.0.1:8200/v1/marketing/generate/image
Content-Type: application/json

{
  "prompt": "string",                        # Image description (required)
  "style": "photorealistic|...",             # Visual style (optional)
  "aspect_ratio": "16:9|1:1|9:16|4:3|3:4"  # Dimensions (optional)
}
```

**SSE Event stream:**
```
data: {"type": "progress", "progress": 25, "message": "Generating..."}
data: {"type": "progress", "progress": 75, "message": "Processing..."}
data: {"type": "complete", "path": "/absolute/path/to/image.png", "metadata": {...}}
```
OR on error:
```
data: {"type": "error", "error": "Error message"}
```

## SSE Curl Pattern

```bash
curl -X POST http://127.0.0.1:8200/v1/marketing/generate/image \
  -H "Content-Type: application/json" \
  -d '{"prompt": "Professional SaaS dashboard screenshot, dark theme, modern UI", "style": "photorealistic", "aspect_ratio": "16:9"}' \
  --no-buffer 2>/dev/null | while IFS= read -r line; do
    [[ "$line" == data:* ]] && echo "${line#data: }"
  done || true
# Wait for: {"type":"complete","path":"/path/to/file","metadata":{...}}
# Note: "|| true" prevents the bash while-read exit code 1 (normal when stdin closes)
```

**GUI auto-display:** When complete, the Image Generation panel in the Desktop GUI automatically shows the generated image. No extra steps needed.

## Styles

| Style | Best For |
|-------|----------|
| `photorealistic` | Product photos, lifestyle shots, hero images |
| `illustration` | Brand illustrations, icons, editorial |
| `3d-render` | Product mockups, UI screenshots, tech imagery |
| `flat-design` | Social media graphics, infographics |
| `cinematic` | Ad creative, dramatic product shots |

## Aspect Ratios

| Ratio | Dimensions | Use For |
|-------|-----------|---------|
| `16:9` | Landscape | YouTube thumbnails, hero banners, LinkedIn |
| `1:1` | Square | Instagram posts, Twitter/X posts |
| `9:16` | Portrait | Instagram/TikTok Stories, Reels |
| `4:3` | Classic | Presentations, blog images |
| `3:4` | Portrait | Pinterest, Facebook ads |

## AI Image Editing

After generating, edit with `tools/image_edit.py`:

```bash
cd tools/marketing/claude-code-video-toolkit

# Edit generated image
python tools/image_edit.py --input /path/to/generated.png --prompt "Add a blue gradient background"

# Apply style preset
python tools/image_edit.py --input /path/to/generated.png --style cinematic

# Change background
python tools/image_edit.py --input /path/to/generated.png --background office
```

**image_edit presets:**
- **Background:** office, studio, outdoors, beach, city, mountains, space, forest
- **Style:** cyberpunk, anime, oil-painting, watercolor, pixel-art, noir, cinematic
- **Viewpoint:** front, profile, three-quarter

## AI Upscaling

Upscale generated images for print or high-res use:

```bash
python tools/upscale.py --input /path/to/generated.png --output upscaled_4x.png --runpod
python tools/upscale.py --input /path/to/generated.png --scale 2 --runpod  # 2x instead of 4x
```

## Prompt Engineering for Marketing

**Structure:** `[Subject] + [Context/Setting] + [Style] + [Mood] + [Technical quality]`

```
# Hero image
"Young professional woman using laptop at modern coworking space,
 natural light, confident expression, SaaS productivity context,
 photorealistic, 8k, professional photography"

# Ad creative
"Bold text overlay on gradient background, 'Save 10 hours a week'
 headline, modern sans-serif typography, tech startup aesthetic,
 flat design, high contrast"

# Product mockup
"iPhone 15 Pro mockup showing dashboard app, dark theme UI,
 floating on gradient background, 3d render, product photography style"
```

**Avoid:** vague descriptions, multiple conflicting styles, text with complex spelling

## Output Artifact

Generated images are auto-saved by the Gateway. Copy to artifact directory:

```bash
cp /path/from/complete/event ai/artifacts/marketing/images/{company}_{variant}.png
```

**Artifact naming:**
```
ai/artifacts/marketing/images/{company}_{purpose}_{variant}.png
# Examples:
# acme_hero_v1.png
# acme_ad_facebook_square.png
# acme_social_instagram_story.png
```

## Quality Checklist

Before using generated images:
- [ ] Prompt includes style and aspect ratio for intended use
- [ ] Generated image matches brand aesthetic
- [ ] Text in image is readable (if any)
- [ ] Aspect ratio correct for platform
- [ ] Apply AI editing if needed (image_edit.py)
- [ ] Upscale if needed for high-res use (upscale.py)
- [ ] Saved to `ai/artifacts/marketing/images/`
- [ ] Multiple variants generated for A/B testing (run prompt 2-3 times)
