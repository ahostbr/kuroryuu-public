---
name: youtube-transcript
description: Use when the user wants a transcript, subtitles, or captions from a YouTube video. Triggers on 'get transcript', 'grab transcript', 'youtube transcript', 'transcribe this video', 'get subtitles', or when a YouTube URL is shared with a request for its text content.
allowed-tools: Bash(powershell.exe:*), Bash(yt-dlp:*)
---

# YouTube Transcript Exporter

Fetch, format, and archive YouTube transcripts using `yt-dlp`. Transcripts are automatically saved to The Nexus Prismatica database.

## Steps

1. **Parse the input**: Extract the YouTube URL from `$ARGUMENTS`. Note any output path if specified.

2. **Run the script**:
   ```bash
   powershell.exe -ExecutionPolicy Bypass -File "C:/Users/Ryan/.claude/skills/youtube-transcript/Get-YouTubeTranscript.ps1" -Url "VIDEO_URL"
   ```
   If the user specified an output path, add `-OutputPath "PATH"`:
   ```bash
   powershell.exe -ExecutionPolicy Bypass -File "C:/Users/Ryan/.claude/skills/youtube-transcript/Get-YouTubeTranscript.ps1" -Url "VIDEO_URL" -OutputPath "PATH"
   ```

3. **Present the output**: The script prints a formatted markdown transcript to stdout. Display it to the user.

## Error Handling

| Exit Code | Meaning | Action |
|-----------|---------|--------|
| 1 | yt-dlp failure (video unavailable, private, or metadata error) | Tell the user the video couldn't be accessed |
| 2 | No English subtitles found | Run `yt-dlp --list-subs --skip-download "VIDEO_URL" 2>/dev/null` and offer available languages |

- If `yt-dlp` is not installed, tell the user: `pip install yt-dlp`
- The Nexus Prismatica save is best-effort — failures are logged but never block transcript output.

## Notes

- `yt-dlp` is already installed on this system.
- Auto-generated subtitles (YouTube speech recognition) are included via `--write-auto-sub`.
- Manual/uploaded subtitles are preferred when available via `--write-sub`.
- All transcripts are automatically archived to The Nexus Prismatica's SQLite database, grouped by channel.
