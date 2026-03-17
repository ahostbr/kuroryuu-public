---
name: Video Analysis
description: Analyze viral video content for hooks, retention mechanisms, and script structure. Use when breaking down what makes competitor videos successful.
version: 1.0.0
---

# VIDEO ANALYSIS

Systematically deconstruct competitor videos to identify what drives views, watch time, and shares. Works from transcript text + video metadata. Output is a structured analysis artifact that feeds into the concept_generator skill.

## Tools Available

- **Claude Code CLI** — YOU are the analysis engine. Read the transcript in your context and apply the framework below.
- **k_browser** (MCP) — Electron browser with persistent cookies. Use to watch/screenshot the actual video page if visual context would help analysis (thumbnail style, comments section, engagement signals).
- **yt-dlp** — Extract transcripts and metadata if not already available.

## Input

You need two things before starting analysis:

1. **Video metadata JSON** — from `ai/artifacts/marketing/social-intel/videos/{id}.json`
   - `title`, `url`, `view_count`, `like_count`, `platform`, `username`, `duration_seconds`

2. **Transcript text** — from `ai/artifacts/marketing/social-intel/videos/{id}.txt`
   - If `transcript_available: false`, analyze from title + description only and note the limitation

If given a raw video URL instead of an artifact ID, first run the social_scraper workflow to fetch the metadata and transcript, then proceed.

---

## Analysis Framework

Apply all 5 sections to every video. Rate each dimension — do not skip sections even if transcript is partial.

---

### Section 1: Hook Analysis (First 15 Seconds)

The hook is the make-or-break moment. Extract the first 3–5 lines of the transcript (or the first ~15 seconds worth of content).

**Identify the hook pattern:**

| Pattern | Definition | Example |
|---------|-----------|---------|
| Question | Opens with a question the viewer wants answered | "What if I told you you've been charging your phone wrong?" |
| Shocking statement | Counterintuitive or surprising claim | "This $200 phone destroyed the iPhone 15 Pro." |
| Challenge / bet | Dares the viewer or creator to do something | "I used ONLY open source apps for 30 days." |
| Promise / payoff | Explicit promise of value | "By the end of this video, you'll know exactly which GPU to buy." |
| Pattern interrupt | Starts mid-action, mid-sentence, or with sound/visual disruption | "—and THAT'S why it exploded." |
| Social proof | Immediately establishes credibility or scale | "I tested every flagship from 2026." |
| Controversy | Stakes out a divisive position | "Apple just made a huge mistake." |

Rate hook strength **1–5:**
- 5 = Immediately compelling, high curiosity gap, specific
- 4 = Strong but slightly generic
- 3 = Adequate, functional but forgettable
- 2 = Weak, vague, or slow to engage
- 1 = No discernible hook, jumps straight to content

---

### Section 2: Retention Mechanisms

Scan the full transcript for these techniques. Note each with the approximate timestamp (estimate from word position relative to total duration):

| Mechanism | What to look for in transcript |
|-----------|-------------------------------|
| Open loop | Promises something later: "I'll show you that in a minute", "we'll get to the craziest part later" |
| Curiosity gap | Partial information that requires watching more: "The result surprised even me..." |
| Progressive reveal | Builds toward a climax: numbered lists, "before I reveal the winner..." |
| Pattern break | Topic shift, change of pace, "but wait — there's more" transitions |
| Re-hook | Mid-video hook to re-engage: "okay but here's where it gets wild" |
| Callback | References something mentioned earlier: "remember that test I mentioned at the start?" |
| Stakes raising | Escalates importance: "this could cost you thousands if you get it wrong" |

List each mechanism found with approximate timestamp and verbatim quote from transcript.

---

### Section 3: Reward Structure

What does the viewer actually receive by watching? Identify the **primary reward type**:

| Reward Type | Definition |
|-------------|-----------|
| Education | Learns a skill, fact, or process |
| Entertainment | Laughs, thrills, or emotional engagement |
| Inspiration | Motivated to act, change, or improve |
| Validation | Confirms what they already believed |
| Controversy / debate fuel | Content they can argue about or share to make a point |
| FOMO / social currency | Being "in the know" about something trending |

Rate **satisfaction** (does the video deliver on its hook's promise?) **1–5:**
- 5 = Fully delivers, viewer feels rewarded
- 4 = Mostly delivers with minor gaps
- 3 = Partially delivers
- 2 = Underwhelming payoff for the hook
- 1 = Hook bait-and-switch, no real payoff

---

### Section 4: Script Structure

Identify the overall structural template:

| Structure | Pattern |
|-----------|---------|
| Problem → Solution | State the problem, build tension, reveal solution |
| Listicle | N things / tips / mistakes — numbered format |
| Story arc | Setup → conflict → resolution |
| Before / After | Show contrast between two states |
| Tutorial / walkthrough | Step-by-step process |
| Comparison / versus | Two options evaluated against each other |
| Reaction / commentary | Responding to existing content or events |
| Day-in-the-life | Narrative following a person through time |

Map the video sections with estimated timestamps:
```
0:00 – 0:15  Hook
0:15 – 1:30  Setup / context
1:30 – 4:00  Main content (section A)
4:00 – 6:30  Main content (section B)
6:30 – 8:00  Reveal / climax
8:00 – 8:42  CTA / outro
```

Note the CTA: what action does the video ask the viewer to take at the end?

---

### Section 5: Virality Factors

Why did this specific video outperform others from the same creator? Consider:

| Factor | Questions to ask |
|--------|-----------------|
| Emotional trigger | Does it make you laugh, angry, amazed, or anxious? |
| Shareability | Would someone send this to a friend? What would they say? |
| Trending topic | Does it ride a news cycle, product launch, or cultural moment? |
| Practical value | Can the viewer immediately use this information? |
| Controversy | Does it take a polarizing stance that invites argument? |
| Uniqueness | Does it show something that can't easily be found elsewhere? |
| Creator authority | Is this creator uniquely credible for this topic? |

List the top 2–3 virality factors with a 1-sentence explanation for each.

---

## Output Template

Save to `ai/artifacts/marketing/social-intel/analysis/{id}_analysis.md`:

```markdown
# Video Analysis: {title}

**Creator:** @{username} ({platform})
**URL:** {url}
**Views:** {view_count_formatted}
**Duration:** {duration_formatted}
**Analyzed:** {date}

---

## Hook Analysis

**Pattern:** {hook_pattern}
**Hook text:** "{first_15_seconds_verbatim}"
**Strength:** {rating}/5
**Why it works:** {1-2 sentence explanation}

---

## Retention Mechanisms

| Mechanism | Timestamp | Quote |
|-----------|-----------|-------|
| {mechanism} | {~timestamp} | "{verbatim quote}" |
| ... | ... | ... |

**Strongest mechanism:** {name} — {why}

---

## Reward Structure

**Primary reward type:** {type}
**Satisfaction rating:** {rating}/5
**Notes:** {how well the video delivers on its promise}

---

## Script Structure

**Template:** {structure_name}

| Timestamp | Section | Notes |
|-----------|---------|-------|
| 0:00–0:15 | Hook | {description} |
| {range} | {section} | {description} |
| ... | ... | ... |

**CTA:** {what the video asks viewers to do}

---

## Virality Factors

1. **{factor}** — {1-sentence explanation}
2. **{factor}** — {1-sentence explanation}
3. **{factor}** — {1-sentence explanation}

---

## Key Takeaways for Concept Generation

- {Most replicable element 1}
- {Most replicable element 2}
- {What to avoid / what didn't work}
```

---

## SSE Event

Emit after analysis is saved:
```bash
curl -s -X POST http://127.0.0.1:8200/v1/marketing/events/emit \
  -H "Content-Type: application/json" \
  -d '{
    "type": "social-intel:video-analyzed",
    "data": {
      "video_id": "{id}",
      "title": "{title}",
      "platform": "youtube",
      "username": "mkbhd",
      "hook_strength": 4,
      "satisfaction_rating": 5,
      "virality_factors": ["trending_topic", "practical_value", "creator_authority"],
      "analysis_path": "ai/artifacts/marketing/social-intel/analysis/{id}_analysis.md"
    }
  }'
```

---

## Handling Limited Transcripts

If `transcript_available: false`, perform analysis based on:
- Video title (often reveals hook pattern)
- View count vs creator's average (outlier = something worked)
- Thumbnail text if visible from metadata
- Comments excerpt if accessible via `k_browser`

Mark all estimates clearly with `[ESTIMATED - no transcript]`.

---

## Quality Checklist

Before presenting analysis:
- [ ] All 5 sections completed (no skipped sections)
- [ ] Hook rated 1–5 with explanation
- [ ] At least 2 retention mechanisms identified (or `none detected` noted)
- [ ] Reward type and satisfaction rating assigned
- [ ] Script structure mapped with timestamp estimates
- [ ] At least 2 virality factors listed
- [ ] Output saved to `ai/artifacts/marketing/social-intel/analysis/`
- [ ] SSE event emitted
- [ ] Limited transcript noted if applicable
- [ ] Key takeaways section filled (feeds concept_generator)
