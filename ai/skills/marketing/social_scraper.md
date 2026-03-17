---
name: Social Scraper
description: Scrape top-performing videos from tracked creators on Instagram, YouTube, and TikTok. Use when collecting competitor videos for analysis.
version: 1.0.0
---

# SOCIAL SCRAPER

Collect video metadata and transcripts from tracked creators. The scraper fetches video lists, ranks by views, takes the top-K, then extracts transcripts for downstream analysis.

## Browser Tool: k_browser (MCP)

The `k_browser` tool controls a **real Electron browser** inside Kuroryuu Desktop via MCP. Cookies and OAuth sessions persist across restarts — no re-login needed.

**Key actions for scraping:**
- `k_browser(action="navigate", url="...")` — load a page
- `k_browser(action="read_page")` — get page text + indexed elements
- `k_browser(action="scroll", direction="down", amount=2000)` — load more content
- `k_browser(action="execute_js", script="...")` — extract structured data from DOM
- `k_browser(action="screenshot")` — capture current view for debugging

**For YouTube:** Prefer `yt-dlp` over k_browser — it's faster and more reliable. Use k_browser only when yt-dlp can't access the content.
**For Instagram/TikTok:** Use k_browser to navigate profiles and extract video URLs, then pipe those URLs to yt-dlp for download and transcript extraction.

## Configurable Parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| `maxVideos` | 20 | Max videos to fetch per creator (for ranking) |
| `topK` | 3 | Number of top videos to download/transcribe per creator |
| `nDays` | 30 | Lookback window in days (skip older videos) |

Adjust parameters based on user request. If user says "last 7 days" set `nDays=7`. If "top 5" set `topK=5`.

---

## Per-Platform Scraping Workflows

### YouTube

**Step 1 — Fetch video list with metadata:**
```bash
yt-dlp --flat-playlist \
  --dump-single-json \
  --playlist-items "1:{maxVideos}" \
  "https://youtube.com/@{username}/videos" 2>/dev/null \
  | python3 -c "
import sys, json, datetime
d = json.load(sys.stdin)
cutoff = (datetime.datetime.utcnow() - datetime.timedelta(days={nDays})).strftime('%Y%m%d')
entries = []
for e in d.get('entries', []):
    upload_date = e.get('upload_date', '')
    if upload_date and upload_date >= cutoff:
        entries.append({
            'id': e.get('id'),
            'title': e.get('title'),
            'url': e.get('url') or f'https://youtube.com/watch?v={e[\"id\"]}',
            'view_count': e.get('view_count', 0),
            'upload_date': upload_date,
            'duration': e.get('duration', 0),
            'platform': 'youtube'
        })
# Sort by views descending, take topK
entries.sort(key=lambda x: x['view_count'], reverse=True)
print(json.dumps(entries[:{topK}], indent=2))
"
```

This returns the top-K videos by view count within the lookback window.

**Step 2 — For each top video, extract transcript:**

See [Transcript Extraction](#transcript-extraction) section below.

---

### Instagram

**Step 1 — Navigate to profile reels:**
```
k_browser(action="navigate", url="https://www.instagram.com/{username}/reels/")
k_browser(action="read_page")
```

**Step 2 — Extract video URLs from page:**
```
k_browser(action="execute_js", script="
  const links = Array.from(document.querySelectorAll('a[href*=\"/reel/\"]'));
  return links.slice(0, {maxVideos}).map(a => ({
    url: 'https://www.instagram.com' + a.getAttribute('href'),
    title: a.getAttribute('aria-label') || a.title || '',
    view_text: a.querySelector('[aria-label*=\"plays\"]')?.getAttribute('aria-label') || ''
  }));
")
```

**Step 3 — Scroll to load more if needed:**
```
k_browser(action="execute_js", script="window.scrollBy(0, 2000)")
```
Wait 2 seconds (note in skill: add a brief pause before re-reading), then re-read page.

**Step 4 — Parse view counts from text:**
Instagram shows view counts as text like `"45.2K plays"`. Parse using the same `parse_count()` helper from the creator_tracker skill.

**Step 5 — Sort by views, take topK:**
```python
videos.sort(key=lambda x: x['view_count'], reverse=True)
top_videos = videos[:topK]
```

**Step 6 — Download via yt-dlp:**
```bash
yt-dlp --no-playlist \
  --write-info-json \
  --skip-download \
  -o "ai/artifacts/marketing/social-intel/videos/instagram_{username}_{video_id}" \
  "{VIDEO_URL}"
```

If yt-dlp fails for Instagram (auth required), record `transcript_available: false` and proceed with metadata only.

---

### TikTok

**Step 1 — Navigate to profile:**
```
k_browser(action="navigate", url="https://www.tiktok.com/@{username}")
k_browser(action="read_page")
```

**Step 2 — Extract video grid:**
```
k_browser(action="execute_js", script="
  const items = Array.from(document.querySelectorAll('[data-e2e=\"user-post-item\"]'));
  return items.slice(0, {maxVideos}).map(item => ({
    url: item.querySelector('a')?.href || '',
    view_text: item.querySelector('[data-e2e=\"video-views\"]')?.innerText || '',
    title: item.querySelector('img')?.alt || ''
  }));
")
```

**Step 3 — Scroll and collect more if needed:**
```
k_browser(action="execute_js", script="window.scrollTo(0, document.body.scrollHeight)")
```
Re-read page after scrolling to get additional items.

**Step 4 — Download via yt-dlp:**
```bash
yt-dlp --no-playlist \
  --write-info-json \
  --skip-download \
  -o "ai/artifacts/marketing/social-intel/videos/tiktok_{username}_{video_id}" \
  "{VIDEO_URL}"
```

---

## Transcript Extraction

After identifying the top-K videos, extract transcripts for each.

**Step 1 — Download auto-generated subtitles:**
```bash
yt-dlp \
  --write-auto-sub \
  --sub-format json3 \
  --sub-langs "en" \
  --skip-download \
  --no-playlist \
  -o "/tmp/transcript_temp" \
  "{VIDEO_URL}" 2>/dev/null
```

This creates `/tmp/transcript_temp.en.json3` (YouTube) or equivalent.

**Step 2 — Parse JSON3 subtitles to plain text:**
```bash
python3 -c "
import json, glob, sys

files = glob.glob('/tmp/transcript_temp*.json3')
if not files:
    print('[NO_TRANSCRIPT]')
    sys.exit(0)

with open(files[0]) as f:
    data = json.load(f)

lines = []
for event in data.get('events', []):
    segs = event.get('segs', [])
    text = ''.join(s.get('utf8', '') for s in segs).strip()
    if text and text != '\n':
        lines.append(text)

print(' '.join(lines))
"
```

**Step 3 — Clean up temp files:**
```bash
rm -f /tmp/transcript_temp*
```

**Fallback if no subtitle file:**
- For YouTube: try `--sub-langs "en-US,en"` as alternate locale
- For Instagram/TikTok: auto-captions may not be available — set `transcript_available: false`
- Record `transcript_available: false` in metadata, continue pipeline (video can still be analyzed from title + metadata alone)

---

## Output Format

For each scraped video, save two files:

**Metadata:** `ai/artifacts/marketing/social-intel/videos/{platform}_{username}_{video_id}.json`
```json
{
  "id": "youtube_mkbhd_dQw4w9WgXcQ",
  "video_id": "dQw4w9WgXcQ",
  "platform": "youtube",
  "creator_id": "youtube_mkbhd",
  "username": "mkbhd",
  "title": "The Best Smartphone of 2026",
  "url": "https://youtube.com/watch?v=dQw4w9WgXcQ",
  "view_count": 4200000,
  "like_count": 180000,
  "upload_date": "20260301",
  "duration_seconds": 842,
  "transcript_available": true,
  "scraped_at": "2026-03-14T12:00:00Z"
}
```

**Transcript:** `ai/artifacts/marketing/social-intel/videos/{platform}_{username}_{video_id}.txt`
```
Plain text transcript content here. Full script as extracted from subtitles.
Each sentence on a new line where possible.
```

---

## SSE Events

Emit after each video is scraped:
```bash
curl -s -X POST http://127.0.0.1:8200/v1/marketing/events/emit \
  -H "Content-Type: application/json" \
  -d '{
    "type": "social-intel:video-scraped",
    "data": {
      "id": "youtube_mkbhd_dQw4w9WgXcQ",
      "username": "mkbhd",
      "platform": "youtube",
      "title": "The Best Smartphone of 2026",
      "view_count": 4200000,
      "transcript_available": true
    }
  }'
```

Emit after completing all videos for a creator:
```bash
curl -s -X POST http://127.0.0.1:8200/v1/marketing/events/emit \
  -H "Content-Type: application/json" \
  -d '{
    "type": "social-intel:creator-scraped",
    "data": {
      "creator_id": "youtube_mkbhd",
      "videos_scraped": 3,
      "transcripts_available": 3
    }
  }'
```

---

## Progress Reporting

As scraping progresses, report to the user:

```
Scraping @mkbhd (YouTube)...
  Fetching video list (last 30 days)...
  Found 18 videos in window. Top 3 by views:
    1. "The Best Smartphone of 2026" — 4.2M views
    2. "Apple vs Samsung 2026" — 3.1M views
    3. "Camera Blind Test" — 2.8M views
  Extracting transcripts...
    ✓ Video 1 — transcript extracted (8m 42s)
    ✓ Video 2 — transcript extracted (12m 03s)
    ✓ Video 3 — transcript extracted (6m 17s)
  Artifacts saved to ai/artifacts/marketing/social-intel/videos/
```

---

## Quality Checklist

Before marking scraping complete:
- [ ] Video list fetched within `nDays` lookback window
- [ ] Videos sorted by view count (highest first)
- [ ] Top-K selection applied correctly
- [ ] Transcript extracted or `transcript_available: false` recorded
- [ ] Metadata JSON saved for each video
- [ ] Transcript TXT saved for each video with available transcript
- [ ] SSE events emitted (per video + per creator)
- [ ] Temp files cleaned up from `/tmp/`
- [ ] No yt-dlp errors silently swallowed — errors noted in metadata
