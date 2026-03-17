---
name: Creator Tracker
description: Track social media creators across Instagram, YouTube, and TikTok. Use when adding, refreshing, listing, or removing tracked creator profiles for competitive intelligence.
version: 1.0.0
---

# CREATOR TRACKER

Manage a registry of tracked creators across YouTube, Instagram, and TikTok. Creator records are stored as JSON in `ai/artifacts/marketing/social-intel/creators/` and updated on each refresh.

## Browser Tool: k_browser (MCP)

The `k_browser` tool is an MCP routed action that controls a **real Electron browser** inside Kuroryuu Desktop. Cookies, localStorage, and OAuth sessions persist across restarts automatically via Electron's partition system — you do NOT need to re-login each time.

**Available actions:**
| Action | Params | Description |
|--------|--------|-------------|
| `navigate` | `url` | Load a URL |
| `read_page` | — | Get page text + indexed interactive elements |
| `click` | `index` | Click element by index (from read_page) |
| `type` | `text`, `index` | Type into element |
| `scroll` | `direction`, `amount` | Scroll page (up/down/left/right) |
| `execute_js` | `script` | Run arbitrary JavaScript |
| `screenshot` | — | Capture page as base64 PNG |
| `status` | — | Get current URL + title |
| `back` / `forward` / `reload` | — | Navigation controls |

**Login flows:** If a platform requires login (Instagram, TikTok), navigate to the login page and let the user sign in via Kuroryuu Desktop's browser. The session will persist forever. Check `k_browser(action="status")` to verify you're on the right page after login.

## Platform Detection

Given a URL or username, determine the platform:

| Input Pattern | Platform |
|--------------|----------|
| Contains `instagram.com/` | Instagram |
| Contains `youtube.com/@` or `youtube.com/c/` or `youtube.com/channel/` | YouTube |
| Contains `tiktok.com/@` | TikTok |
| Raw `@username` with no URL | Ask user which platform, or default to YouTube |

Normalize the input to a canonical URL before proceeding:
- YouTube: `https://youtube.com/@{username}`
- Instagram: `https://www.instagram.com/{username}/`
- TikTok: `https://www.tiktok.com/@{username}`

---

## Workflows

### Add a Creator

**Step 1 — Detect platform and fetch profile stats:**

**YouTube:**
```bash
yt-dlp --flat-playlist --dump-single-json --playlist-items 1:5 \
  "https://youtube.com/@{username}/videos" 2>/dev/null \
  | python3 -c "
import sys, json
d = json.load(sys.stdin)
print(json.dumps({
  'channel': d.get('channel', d.get('uploader', '')),
  'channel_url': d.get('channel_url', d.get('uploader_url', '')),
  'subscriber_count': d.get('channel_follower_count', 0),
  'video_count': d.get('playlist_count', 0),
  'entries': [{
    'id': e.get('id'),
    'title': e.get('title'),
    'view_count': e.get('view_count', 0),
    'upload_date': e.get('upload_date', '')
  } for e in d.get('entries', [])[:5]]
}, indent=2))
"
```

**Instagram:**
```
k_browser(action="navigate", url="https://www.instagram.com/{username}/")
k_browser(action="read_page")
```

Then parse the page text to extract:
- Followers: look for patterns like `123K followers`, `1.2M followers`
- Posts count: look for `456 posts`
- Bio: text in the profile description area

If the page is blocked or requires login, note it as `access_limited: true` and record what was available.

**TikTok:**
```
k_browser(action="navigate", url="https://www.tiktok.com/@{username}")
k_browser(action="read_page")
```

Extract from page text:
- Followers: look for `Followers` label with adjacent number
- Following, Likes totals
- Recent video count visible on profile grid

**Step 2 — Calculate derived metrics:**

From the 5 most recent YouTube videos:
```python
avg_views = sum(v['view_count'] for v in recent_videos) / len(recent_videos)
# Estimate posts_per_month from upload_date range
```

For Instagram/TikTok, note that precise post frequency may require scrolling — use visible post grid count as approximation.

**Step 3 — Build creator record:**
```json
{
  "id": "{platform}_{username}",
  "username": "{username}",
  "platform": "youtube|instagram|tiktok",
  "url": "https://...",
  "display_name": "Creator Display Name",
  "followers": 1200000,
  "posts_per_month": 8,
  "avg_views": 450000,
  "category": "tech|finance|fitness|...",
  "added_at": "2026-03-14T12:00:00Z",
  "refreshed_at": "2026-03-14T12:00:00Z",
  "access_limited": false,
  "notes": ""
}
```

**Step 4 — Save artifact:**
```
ai/artifacts/marketing/social-intel/creators/{platform}_{username}.json
```

**Step 5 — Emit SSE event:**
```bash
curl -s -X POST http://127.0.0.1:8200/v1/marketing/events/emit \
  -H "Content-Type: application/json" \
  -d '{
    "type": "social-intel:creator-added",
    "data": {
      "id": "{platform}_{username}",
      "username": "{username}",
      "platform": "youtube",
      "followers": 1200000,
      "avg_views": 450000
    }
  }'
```

---

### Refresh a Creator

Re-run the extraction steps for an existing creator and update their JSON file. Set `refreshed_at` to the current ISO timestamp. Compare new vs old stats and note changes:

```
@mkbhd refreshed:
  Followers: 18.2M → 18.4M (+200K)
  Avg views: 1.2M → 1.4M (+200K)
```

Emit SSE event `social-intel:creator-refreshed` with the updated record.

---

### Refresh All Creators

List all JSON files in `ai/artifacts/marketing/social-intel/creators/`, then run the Refresh workflow for each. Report a summary at the end:

```
Refreshed 12 creators:
  ✓ youtube_mkbhd — 18.4M followers
  ✓ instagram_garyvee — 9.1M followers
  ✗ tiktok_someuser — access limited, skipped
```

---

### List Tracked Creators

Read all JSON files in `ai/artifacts/marketing/social-intel/creators/` and present as a table:

```markdown
## Tracked Creators

| Username | Platform | Followers | Avg Views | Posts/Mo | Category | Last Refreshed |
|----------|----------|-----------|-----------|----------|----------|----------------|
| @mkbhd   | YouTube  | 18.4M     | 1.4M      | 6        | tech     | 2026-03-14     |
| @garyvee | Instagram| 9.1M      | —         | 22       | business | 2026-03-13     |
```

Group by platform if more than 6 creators total.

---

### Remove a Creator

Delete `ai/artifacts/marketing/social-intel/creators/{platform}_{username}.json`. Confirm deletion with the user before proceeding if the creator has associated videos in `ai/artifacts/marketing/social-intel/videos/`.

Emit SSE event `social-intel:creator-removed`.

---

## Platform-Specific DOM Extraction Patterns

### YouTube (yt-dlp preferred)

Use `yt-dlp` whenever possible — it is more reliable than browser scraping for YouTube. The `--flat-playlist` flag avoids downloading videos. Use `--dump-single-json` to get structured metadata.

Key fields in yt-dlp channel JSON:
- `channel` / `uploader` — display name
- `channel_follower_count` — subscriber count (may be absent for some channels)
- `playlist_count` — total video count
- `entries[]` — video list (with `view_count`, `upload_date`, `duration`)

### Instagram

Instagram frequently changes its DOM. Use `read_page` and parse text with these heuristics:
- Followers line: typically `"X followers"` or `"X.XK followers"` or `"X.XM followers"`
- Posts line: `"X posts"` near the top of the profile
- If the page shows a login wall, record `access_limited: true`

If `k_browser` returns a login prompt, try:
```
k_browser(action="execute_js", script="document.querySelector('meta[content*=\"followers\"]')?.content || ''")
```

### TikTok

TikTok profile pages load follower counts in visible text elements. After `read_page`, look for:
- `"Followers"` label with a preceding number
- `"Likes"` total — useful as a proxy for engagement

If numbers appear as `"18.2M"`, parse with:
```python
def parse_count(s):
    s = s.strip().upper()
    if s.endswith('M'): return int(float(s[:-1]) * 1_000_000)
    if s.endswith('K'): return int(float(s[:-1]) * 1_000)
    return int(s.replace(',', ''))
```

---

## Output Artifact

```
ai/artifacts/marketing/social-intel/creators/
  youtube_mkbhd.json
  instagram_garyvee.json
  tiktok_charlidamelio.json
```

Creator registry index (auto-maintained):
```
ai/artifacts/marketing/social-intel/creators/_index.json
```

Index format:
```json
{
  "updated_at": "2026-03-14T12:00:00Z",
  "creators": [
    {"id": "youtube_mkbhd", "username": "mkbhd", "platform": "youtube", "category": "tech"},
    {"id": "instagram_garyvee", "username": "garyvee", "platform": "instagram", "category": "business"}
  ]
}
```

---

## Quality Checklist

Before confirming creator was added/refreshed:
- [ ] Platform correctly detected from URL or username
- [ ] Followers, avg_views, posts_per_month populated (or `null` if unavailable)
- [ ] JSON artifact saved to `ai/artifacts/marketing/social-intel/creators/`
- [ ] `_index.json` updated with new entry
- [ ] SSE event emitted successfully (HTTP 200 from Gateway)
- [ ] `access_limited` flag set if scraping was blocked
- [ ] `refreshed_at` timestamp set to current UTC time
