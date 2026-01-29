---
description: Toggle RAG interactive mode (human-in-the-loop result filtering)
argument-hint: [on|off|status]
allowed-tools: Bash, Read
---

# /rag-interactive - Toggle Human-in-the-Loop RAG Filtering

Toggle whether RAG search queries automatically prompt for result filtering.

## Usage

- `/rag-interactive` - Show current status
- `/rag-interactive on` - Enable interactive mode
- `/rag-interactive off` - Disable interactive mode

## How It Works

When **enabled**:
1. All `k_rag` search queries are redirected to `query_interactive`
2. Results are shown to you with numbered options
3. You select which results to keep (e.g., "1,3,5" or "all")
4. Only selected results are fed back to Claude

When **disabled** (default):
- RAG queries return all results directly to Claude
- Use `k_rag(action="query_interactive")` explicitly when needed

## Flag File

Mode is controlled by: `.enable-rag-interactive` in project root

## Execute Toggle

Run the toggle script with the provided mode:

```bash
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${CLAUDE_PLUGIN_ROOT}/scripts/rag-interactive-toggle.ps1" "$ARGUMENTS"
```
