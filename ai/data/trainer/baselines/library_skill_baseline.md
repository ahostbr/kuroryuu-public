---
name: library
description: Use when needing to discover, search, or understand available skills, commands, and agents across all codebases and locations. Triggers on 'library', 'list skills', 'what skills do I have', 'find a skill', 'show all agents', 'what commands are available', 'list my agentics', 'catalog'. Also trigger when the user asks what capabilities are available or wants to know if a skill exists for something.
---

# Library — Agentics Catalog & Discovery

One command to see everything. Catalogs all skills, commands, and agents across every location into a searchable YAML index.

## Commands

| Command | Usage | Purpose |
|---------|-------|---------|
| **list** | `/library list` | Show full catalog grouped by location then category |
| **search** | `/library search <query>` | Filter catalog by keyword (name, category, description) |
| **describe** | `/library describe <name>` | Read source file and summarize a specific item |
| **refresh** | `/library refresh` | Re-scan all sources, update library.yaml |
| **register** | `/library register <path>` | Add a new codebase to scan |

## Workflow by Command

### list

1. Read `~/.claude/skills/library/library.yaml`
2. Group entries by `source` (location), then sub-group by `category`
3. Display using this format per group:

```
## <Source Name> (<count>)

### <Category>
- <name> (<type>) — <description>
```

If library.yaml doesn't exist or catalog is empty, tell the user to run `/library refresh` first.

### search

1. Read `~/.claude/skills/library/library.yaml`
2. Filter catalog entries where `query` appears in name, category, OR description (case-insensitive)
3. Display matches using same grouped format as `list`
4. Show match count: "Found N items matching '<query>'"

### describe

1. Read `~/.claude/skills/library/library.yaml`
2. Find entry matching `<name>` (fuzzy — partial match OK)
3. If multiple matches, list them and ask user to clarify
4. Read the source file at the entry's `path`
5. Present: name, type, source, category, full path, then a **concise summary** (not the entire file)

### refresh

This is the core workflow. Scan all registered sources and rebuild the catalog.

1. Read `~/.claude/skills/library/library.yaml` to get `sources` section
2. For each source, scan using its `scan_pattern` or `scan` paths
3. For each discovered file, extract metadata:

**Extraction rules by file type:**

| File type | Name | Description | Category |
|-----------|------|-------------|----------|
| SKILL.md (with frontmatter) | `name:` field | `description:` field, first sentence only | From taxonomy below |
| Command .md | Filename without .md | First non-heading paragraph, first sentence | From taxonomy below |
| Agent .md (with frontmatter) | `name:` field or filename | `description:` field, first sentence | From taxonomy below |
| Agent .md (no frontmatter) | Filename without .md | First paragraph, first sentence | From taxonomy below |
| Other .md | Filename without .md | First paragraph, first sentence | From taxonomy below |

**Category assignment heuristics:**

| Pattern | Category |
|---------|----------|
| `polymathic-*` | thinking |
| `marketing/*`, `ad_*`, `seo_*`, `copy*` | marketing |
| `excalidraw/*`, `canvas*`, `diagram*` | creative |
| `k-start*`, `k-spawn*`, `k-leader*`, `k-worker*`, `ralph*`, `max-*` | orchestration |
| `plan*`, `quizmaster*` | planning |
| `consult*`, `*-reviewer*`, `prd-*` | analysis |
| `playwright*`, `e2e*`, `test*` | testing |
| `vault*`, `rag*`, `research*` | knowledge |
| `train*`, `find-skill*`, `library*`, `meta-*` | meta |
| `*watch*`, `local-lens*`, `litewatch*` | observability |
| `rebuild*`, `deploy*`, `release*` | devops |
| `youtube*`, `ao-*`, `gen-image*` | utility |
| Superpowers skills (`brainstorming`, `debugging`, `tdd`, `verification`, `worktree`, `writing-*`, `executing-*`, `dispatching-*`, `finishing-*`, `receiving-*`, `requesting-*`, `subagent-*`) | workflow |
| Everything else | general |

4. Write updated catalog back to `library.yaml`, preserving the `sources` section
5. Report: "Refreshed: N skills, M commands, K agents across L sources"

**Important:** Use Glob to discover files, Read to extract metadata. Do NOT use Bash for scanning.

### register

1. Read `~/.claude/skills/library/library.yaml`
2. Add new source entry with the provided path:
   ```yaml
   new-source:
     path: "<user-provided-path>"
     type: registered
     scan:
       - ".claude/skills/*/SKILL.md"
       - ".claude/commands/*.md"
       - ".claude/agents/*.md"
       - "ai/skills/**/*.md"
   ```
3. Derive source name from the directory name (e.g., `C:/Projects/LiteMCP` becomes `litemcp`)
4. Run refresh for just that source
5. Report what was found

## Filtering Tips

When the user asks vague questions, map to search:
- "what marketing skills do I have?" → `/library search marketing`
- "do I have anything for testing?" → `/library search testing`
- "what can I use for planning?" → `/library search planning`
- "show me all polymathic agents" → `/library search polymathic`
- "what's in Kuroryuu?" → `/library search kuroryuu` (matches source field)

## Notes

- The YAML file is a **read index** — Claude reads skills from their source path, never copies them
- Refresh is idempotent — safe to run repeatedly
- Categories are best-effort heuristics — manually edit the YAML to fix misassignments
- When scanning LiteSuite (`C:/Projects/`), skip directories without `.claude/` or `ai/skills/`
- Superpowers version directory is dynamic — scan for the latest version subfolder
