---
name: Social Intel Pipeline
description: Full social media intelligence pipeline - orchestrates creator tracking, video scraping, analysis, and concept generation end-to-end. Use when running a complete competitive analysis pipeline.
version: 1.0.0
---

# SOCIAL INTEL PIPELINE

Master orchestration skill for the Social Media Intelligence system. Chains together **Creator Tracker**, **Social Scraper**, **Video Analysis**, and **Concept Generator** into a single end-to-end workflow.

## Core Tools

| Tool | What it does | When to use |
|------|-------------|-------------|
| **k_browser** (MCP) | Real Electron browser with persistent cookies/OAuth | Profile scraping (IG, TikTok), login flows, visual inspection |
| **yt-dlp** (bash) | Video/transcript extraction, channel enumeration | YouTube (always), IG/TikTok video download after URL extraction |
| **Claude Code CLI** | YOU — analysis engine + concept generation | Video analysis, concept writing, pipeline orchestration |
| **Gateway SSE** (curl) | Push events to Desktop UI | Real-time progress updates to Social Intel page |

**k_browser cookie persistence:** The browser runs inside Kuroryuu Desktop's Electron process with `partition: 'persist:browser'`. Login to Instagram/Google/TikTok once — the session survives app restarts forever. No re-auth needed.

## Example Usage Patterns

```
"Run the social intel pipeline for real-estate creators"
"Analyze top 5 videos from tech YouTubers in the last 7 days"
"Generate concepts based on @mkbhd's latest viral videos"
"Run social intel on my tracked finance creators, topK=5"
"Set up a new pipeline config for fitness coaches"
```

---

## Pipeline Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `category` | required | Creator category to process (e.g., "tech", "real-estate", "fitness") |
| `maxVideos` | 20 | Videos to fetch per creator for ranking |
| `topK` | 3 | Top videos to analyze per creator |
| `nDays` | 30 | Lookback window in days |
| `configName` | optional | Specific pipeline config name to use; if omitted, uses category match |

---

## Config Management

Configs define the brand context and analysis instructions for a pipeline run. They are stored as JSON in `ai/artifacts/marketing/social-intel/configs/`.

### Config Format

```json
{
  "name": "tech-youtubers",
  "creatorsCategory": "tech",
  "analysisPrompt": "Focus on how these creators explain complex topics simply. Note pacing, visual aids, and how they handle audience knowledge gaps.",
  "conceptsPrompt": "We are a developer tools SaaS targeting senior engineers. Our tone is direct and technical, never dumbed down. We value depth over breadth. Our audience appreciates honesty about tradeoffs. Generate concepts that position us as the tool engineers actually trust, not just the most marketed one.",
  "created_at": "2026-03-14T12:00:00Z",
  "updated_at": "2026-03-14T12:00:00Z"
}
```

### Creating a Config

When the user asks to set up a new pipeline config, ask for:
1. **Config name** (kebab-case, e.g., `real-estate-agents`)
2. **Creator category** (matches `category` field on creators)
3. **Analysis focus** (`analysisPrompt`) — what should the analysis emphasize for this niche?
4. **Brand context** (`conceptsPrompt`) — who is this content for, what's the brand voice, who's the audience?

Save to `ai/artifacts/marketing/social-intel/configs/{config_name}.json`.

### Updating a Config

Read the existing JSON, update the relevant fields, rewrite the file with updated `updated_at` timestamp.

### Listing Configs

Read all JSON files in `ai/artifacts/marketing/social-intel/configs/` and present as a table:

```markdown
| Config Name | Category | Created | Updated |
|-------------|----------|---------|---------|
| tech-youtubers | tech | 2026-03-10 | 2026-03-14 |
| real-estate-agents | real-estate | 2026-03-12 | 2026-03-12 |
```

---

## Pipeline Execution

### Phase 0: Setup and Validation

1. **Resolve config:** Find the config matching `category` or `configName`. If multiple configs match, ask user to specify.

2. **Verify creators exist:** List all JSON files in `ai/artifacts/marketing/social-intel/creators/`. Filter by `category` field matching the pipeline's `creatorsCategory`.

   If no creators found for the category:
   ```
   No creators tracked for category "{category}".
   Would you like to add some now? (e.g., "add @mkbhd as a tech creator")
   ```

3. **Emit pipeline start event:**
   ```bash
   curl -s -X POST http://127.0.0.1:8200/v1/marketing/events/emit \
     -H "Content-Type: application/json" \
     -d '{
       "type": "social-intel:pipeline-started",
       "data": {
         "category": "{category}",
         "config": "{config_name}",
         "creator_count": N,
         "parameters": {"maxVideos": 20, "topK": 3, "nDays": 30}
       }
     }'
   ```

4. **Report setup to user:**
   ```
   Starting Social Intel Pipeline
   Config: {config_name}
   Category: {category}
   Creators: {N} tracked
   Parameters: maxVideos={maxVideos}, topK={topK}, nDays={nDays}
   ```

---

### Phase 1: Scrape Videos (Per Creator)

For each creator in the category, run the **Social Scraper** workflow.

```
[1/{N}] Scraping @{username} ({platform})...
  ✓ Found {M} videos in {nDays}-day window
  ✓ Top {topK} by views: "{title1}" (Xm), "{title2}" (Xm), "{title3}" (Xm)
  ✓ Transcripts: {K}/{topK} available
```

**Error handling:**
- If scraping fails for a creator (network error, access block): log the error, mark creator as `scrape_failed` in the session state, continue to the next creator
- If yt-dlp fails: try the browser-based fallback from social_scraper
- If no videos found in the window: skip this creator, note it in the final report

**Emit per-creator completion:**
```bash
curl -s -X POST http://127.0.0.1:8200/v1/marketing/events/emit \
  -H "Content-Type: application/json" \
  -d '{
    "type": "social-intel:phase1-creator-done",
    "data": {
      "creator_id": "{id}",
      "videos_found": M,
      "videos_scraped": K,
      "failed": false
    }
  }'
```

After all creators: emit `social-intel:phase1-complete` with total counts.

---

### Phase 2: Analyze Videos

Collect all scraped video artifacts from Phase 1. Sort globally by view count. Take the top-K per creator (already done in scraping), then process each.

For each video, run the **Video Analysis** workflow.

```
[Phase 2] Analyzing {total_videos} videos...
[1/{total}] @{username} — "{title}" ({views} views)
  Hook: {pattern} ({rating}/5)
  Structure: {template}
  Top virality factor: {factor}
  ✓ Analysis saved
```

**Error handling:**
- If transcript is missing: proceed with title-only analysis, flag as `[LIMITED]`
- If analysis fails: log error, mark video as `analysis_failed`, continue

Apply the `analysisPrompt` from the config as additional context when analyzing — include it as a system note: "Additionally, focus on: {analysisPrompt}."

**Emit per-video:**
```bash
curl -s -X POST http://127.0.0.1:8200/v1/marketing/events/emit \
  -H "Content-Type: application/json" \
  -d '{"type": "social-intel:phase2-video-done", "data": {"video_id": "{id}", "hook_strength": N}}'
```

After all videos: emit `social-intel:phase2-complete`.

---

### Phase 3: Generate Concepts

For each successfully analyzed video, run the **Concept Generator** workflow using the config's `conceptsPrompt` as brand context.

```
[Phase 3] Generating concepts for {analyzed_count} videos...
[1/{analyzed_count}] Based on "{title}"...
  ✓ Concept 1: "{concept_title_1}"
  ✓ Concept 2: "{concept_title_2}"
  ✓ Concept 3: "{concept_title_3}"
  Saved: ai/artifacts/marketing/social-intel/concepts/{id}_concepts.md
```

**Cross-concept synthesis:**
After all concept files are generated, compile `_session_summary.md`:
- List all concepts generated this session
- Note recurring hook patterns across multiple videos (high-signal)
- Note recurring virality factors
- Surface the top 3 highest-potential concepts across all creators

---

### Phase 4: Final Summary

**Emit pipeline complete:**
```bash
curl -s -X POST http://127.0.0.1:8200/v1/marketing/events/emit \
  -H "Content-Type: application/json" \
  -d '{
    "type": "social-intel:pipeline-complete",
    "data": {
      "category": "{category}",
      "creators_processed": N,
      "videos_scraped": M,
      "videos_analyzed": K,
      "concepts_generated": W,
      "errors": []
    }
  }'
```

**Present summary to user:**

```markdown
## Social Intel Pipeline Complete

**Category:** {category}
**Config:** {config_name}
**Run date:** {date}

### Results

| Stage | Count | Failed |
|-------|-------|--------|
| Creators processed | N | 0 |
| Videos scraped | M | 1 |
| Videos analyzed | K | 0 |
| Concepts generated | W | 0 |

### Top Concepts This Session

1. **"{concept_title}"** — based on @{username}'s "{video_title}" ({views} views)
   Hook: "{hook_text}"

2. **"{concept_title}"** — based on @{username}'s "{video_title}" ({views} views)
   Hook: "{hook_text}"

3. **"{concept_title}"** — based on @{username}'s "{video_title}" ({views} views)
   Hook: "{hook_text}"

### Artifacts

- Concepts: `ai/artifacts/marketing/social-intel/concepts/`
- Analyses: `ai/artifacts/marketing/social-intel/analysis/`
- Videos: `ai/artifacts/marketing/social-intel/videos/`

### Errors

{List any failures with brief explanation. "None" if clean run.}

### Recommended Next Step

{1-2 sentence suggestion: e.g., "Concept 2 is highest-priority — the hook pattern matched 3 of the top-performing videos. Review the script outline and send to production."}
```

---

## Sub-Workflows (Skills Called)

This pipeline orchestrates these 4 skills — do NOT re-implement their logic here, call their workflows:

| Phase | Skill | Purpose |
|-------|-------|---------|
| Phase 0 (optional) | **Creator Tracker** | Add/refresh creators before pipeline runs |
| Phase 1 | **Social Scraper** | Fetch video lists and transcripts per creator |
| Phase 2 | **Video Analysis** | Deconstruct each top video |
| Phase 3 | **Concept Generator** | Generate adapted concepts from each analysis |

---

## Session State Tracking

Maintain a lightweight session state object in memory (not written to disk) to track pipeline progress and enable partial re-runs if something fails:

```python
session = {
  "category": "tech",
  "config_name": "tech-youtubers",
  "creators": [
    {"id": "youtube_mkbhd", "status": "scraped", "videos": [...]},
    {"id": "youtube_linustechtips", "status": "failed", "error": "access blocked"}
  ],
  "videos": [
    {"id": "youtube_mkbhd_abc123", "scrape_status": "ok", "analysis_status": "ok", "concepts_status": "ok"},
    ...
  ],
  "started_at": "2026-03-14T12:00:00Z"
}
```

If the user asks to "resume" or "continue the pipeline", check which stages are already complete (artifacts exist on disk) and skip them.

---

## Artifact Directory Layout

```
ai/artifacts/marketing/social-intel/
  configs/
    tech-youtubers.json
    real-estate-agents.json
  creators/
    _index.json
    youtube_mkbhd.json
    tiktok_charlidamelio.json
  videos/
    youtube_mkbhd_abc123.json       ← metadata
    youtube_mkbhd_abc123.txt        ← transcript
  analysis/
    youtube_mkbhd_abc123_analysis.md
  concepts/
    youtube_mkbhd_abc123_concepts.md
    _session_summary.md             ← cross-pipeline synthesis
```

---

## Quality Checklist

Before declaring pipeline complete:
- [ ] Config loaded and validated (both `analysisPrompt` and `conceptsPrompt` present)
- [ ] All tracked creators in category attempted (none silently skipped)
- [ ] Failures documented in session state and final report
- [ ] All phase events emitted (`phase1-complete`, `phase2-complete`, `pipeline-complete`)
- [ ] `_session_summary.md` written with cross-concept synthesis
- [ ] Top 3 concepts surfaced in final summary
- [ ] Next-step recommendation provided
- [ ] Artifact paths listed so user knows where to find output
