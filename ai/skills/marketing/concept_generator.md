---
name: Concept Generator
description: Generate adapted video concepts and scripts based on viral video analysis. Use when creating new content ideas tailored to a specific brand or creator profile.
version: 1.0.0
---

# CONCEPT GENERATOR

Transform viral video analysis into original, brand-adapted content concepts. Takes what worked for a competitor and rebuilds it with a new angle, new hook, and new voice — not a copy, an adaptation.

## Tools Available

- **Claude Code CLI** — YOU are the generation engine. Read the analysis + brand context and create adapted concepts.
- **k_browser** (MCP) — Electron browser with persistent cookies. Use to research the target brand's existing content, check competitor comments for audience insights, or gather visual reference.
- **yt-dlp** — Fetch additional transcripts if you need more examples of the viral pattern.

## Input

Before generating concepts, you need:

1. **Video analysis** — from `ai/artifacts/marketing/social-intel/analysis/{id}_analysis.md`
   - Hook pattern, retention mechanisms, script structure, virality factors, key takeaways

2. **Brand context** — from the active social intel config
   - `conceptsPrompt` field: describes the target brand, niche, audience, tone, and differentiators
   - Config location: `ai/artifacts/marketing/social-intel/configs/{config_name}.json`

3. **Optional: creator profile** — from `ai/artifacts/marketing/social-intel/creators/{id}.json`
   - For knowing what platform and format to optimize for

If `conceptsPrompt` is missing or vague, ask the user: "Who is this content for? Describe the brand, niche, and target audience in 2–3 sentences."

---

## Generation Framework

For each analyzed video, produce **2–3 distinct concepts**. Each concept must differ in angle — not just a surface rewrite of the same idea.

---

### Step 1: Concept Adaptation

Take the viral video's core mechanic (what it does, not what it says) and apply it to the brand's niche.

Ask yourself:
- What structural template does the viral video use? (listicle, challenge, comparison, story arc)
- What emotional trigger does it pull? (curiosity, fear of missing out, aspiration, controversy)
- What if you kept the mechanic but changed the subject entirely?

**Example mapping:**
- Viral: "I switched to only open source apps for 30 days" (challenge format, productivity niche)
- Brand is a real estate SaaS → Concept: "I ran my entire real estate business for 30 days with $0 software"

The mechanic (personal challenge with stakes) transfers. The subject is original.

Generate 2–3 distinct angles per video before writing any scripts.

---

### Step 2: Hook Rewrites

For each concept, write **2–3 hook variations** that use the same pattern as the original but with brand-specific content.

Match the hook pattern identified in the video analysis:

| Original pattern | Rewrite approach |
|-----------------|-----------------|
| Question | Keep the question format, make it brand-specific and more pointed |
| Shocking statement | Find the most counterintuitive claim that's true in the brand's niche |
| Challenge / bet | Translate the challenge into the brand's domain |
| Promise / payoff | Make the promise concrete with a specific number or outcome |
| Pattern interrupt | Open with an unexpected scenario from the brand's world |
| Controversy | Find the #1 debate in the brand's niche, take a side |

Rate each hook 1–5 (same scale as video_analysis). Only include hooks rated 4+ in the final output.

---

### Step 3: Script Outline

Write a full script outline with:
- **Word-count target** (based on original video's duration; ~150 words/minute)
- **Timestamp structure** mirroring the original video's pacing
- **Key transitions** word-for-word (these are the retention mechanism moments)
- **Call-to-action** that fits the brand's conversion goal

Format:
```
[0:00 – 0:15] HOOK
  "{Best hook verbatim}"

[0:15 – 1:00] SETUP
  - Establish the stakes or context
  - Introduce the central premise
  - Tease what's coming (open loop: "By the end, I'll show you...")

[1:00 – 3:30] SECTION A: {Label}
  - {Key point 1}
  - {Key point 2}
  - Re-hook at 2:30: "{transition line}"

[3:30 – 5:30] SECTION B: {Label}
  - {Key point 3}
  - {Surprise or pattern break}

[5:30 – 6:00] REVEAL / CLIMAX
  - {Payoff moment — delivers the hook's promise}

[6:00 – 6:30] CTA / OUTRO
  "{Exact CTA line}"
  - Subscribe prompt
  - {Brand-specific next action}
```

---

### Step 4: Differentiation Notes

Explicitly document how this concept differs from the original to avoid derivative content:

- **Different angle:** What unique perspective does this take?
- **Different audience hook:** What does the brand's audience care about that the original's didn't?
- **What we're NOT copying:** List any elements from the original being deliberately avoided
- **Original value add:** What does this concept contribute that doesn't exist anywhere yet?

---

### Step 5: Production Notes

Practical guidance for the production team:

| Field | Value |
|-------|-------|
| **Platform** | YouTube / Instagram Reels / TikTok |
| **Format** | Talking head / B-roll heavy / screen recording / vlog |
| **Estimated length** | {X} minutes |
| **Shooting locations** | {office, outdoor, product setup, etc.} |
| **Props / tools needed** | {list} |
| **Thumbnail concept** | {1-sentence description of hero visual} |
| **SEO title draft** | {keyword-optimized title for YouTube} |
| **Hashtag strategy** | {5-7 relevant hashtags for IG/TikTok} |

---

## Output Template

Save each concept set to `ai/artifacts/marketing/social-intel/concepts/{source_video_id}_concepts.md`:

```markdown
# Concepts Based On: {source_video_title}

**Source:** @{username} ({platform}) — {view_count_formatted} views
**Analysis:** [{source_video_id}_analysis.md](../analysis/{source_video_id}_analysis.md)
**Brand Context:** {brief description from conceptsPrompt}
**Generated:** {date}

---

## Concept 1: {Concept Title}

**Core Mechanic Adapted:** {what mechanic from the original, applied how}
**Differentiating Angle:** {what makes this original}

### Hook Variations

1. "{Hook A}" — Rating: {N}/5
2. "{Hook B}" — Rating: {N}/5
3. "{Hook C}" — Rating: {N}/5

**Recommended hook:** #1 — {1-sentence reason}

### Script Outline

[0:00 – 0:15] HOOK
  "{Recommended hook}"

[0:15 – 1:00] SETUP
  - {bullet}
  - {bullet}

[1:00 – X:XX] {Section A label}
  - {bullet}
  - Re-hook: "{transition line}"

[X:XX – X:XX] {Section B label}
  - {bullet}

[X:XX – X:XX] REVEAL
  - {payoff}

[X:XX – end] CTA
  "{CTA line}"

### Differentiation Notes

- **Angle:** {unique perspective}
- **Not copying:** {what's deliberately different}
- **Original value:** {what's new}

### Production Notes

| | |
|-|-|
| Platform | {platform} |
| Format | {format} |
| Length | {duration} |
| Locations | {locations} |
| Props | {props} |
| Thumbnail | {concept} |
| SEO Title | {title} |
| Hashtags | {#tag1 #tag2 #tag3} |

---

## Concept 2: {Concept Title}

{Same structure as Concept 1}

---

## Concept 3: {Concept Title}

{Same structure as Concept 1}

---

## Selection Recommendation

**Best concept for immediate production:** Concept {N}
**Reason:** {2-sentence justification based on brand fit + production feasibility}
```

---

## SSE Event

Emit after saving the concept file:
```bash
curl -s -X POST http://127.0.0.1:8200/v1/marketing/events/emit \
  -H "Content-Type: application/json" \
  -d '{
    "type": "social-intel:concept-generated",
    "data": {
      "source_video_id": "{id}",
      "source_title": "{title}",
      "concepts_count": 3,
      "concept_titles": ["{title1}", "{title2}", "{title3}"],
      "output_path": "ai/artifacts/marketing/social-intel/concepts/{id}_concepts.md"
    }
  }'
```

---

## Multiple Video Inputs

When generating concepts from a batch of analyzed videos (as called by social_intel pipeline):
- Run the generation framework for each video independently
- At the end, compile a **cross-concept summary** — note any themes, hooks, or angles that appear across multiple videos (these are the highest-signal patterns)
- Save the cross-concept summary to `ai/artifacts/marketing/social-intel/concepts/_session_summary.md`

---

## Quality Checklist

Before delivering concepts:
- [ ] 2–3 distinct concepts generated (not variations of the same idea)
- [ ] Each concept uses a different angle from the others
- [ ] All hooks rated before selection (only 4+ recommended)
- [ ] Script outline has explicit timestamps and transitions
- [ ] Differentiation section explicitly says what's NOT being copied
- [ ] Production notes filled (platform, format, length, thumbnail)
- [ ] Concept file saved to `ai/artifacts/marketing/social-intel/concepts/`
- [ ] SSE event emitted
- [ ] Selection recommendation provided (don't leave the user to choose blindly)
