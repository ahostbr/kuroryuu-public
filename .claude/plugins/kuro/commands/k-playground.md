---
description: Launch a Kuroryuu-specific playground with project context
argument-hint: [architecture|theme|team|hooks|<custom topic>]
allowed-tools: Write, Read, Bash, Glob, Grep
---

# /k-playground — Kuroryuu Playground Builder

Build an interactive HTML playground pre-populated with Kuroryuu project data.

## Instructions

1. Parse $ARGUMENTS to determine the playground type:
   - `architecture` → Load `kuroryuu-playground/templates/architecture-explorer.md`
   - `theme` → Load `kuroryuu-playground/templates/theme-tuner.md`
   - `team` → Load `kuroryuu-playground/templates/agent-team-planner.md`
   - `hooks` → Load `kuroryuu-playground/templates/hook-builder.md`
   - Anything else → Use the official `/playground` skill with the topic

2. If using a Kuroryuu template, gather live project data:
   - For `architecture`: Use `k_repo_intel` to get routes and symbol maps
   - For `theme`: Read `apps/desktop/src/renderer/styles/globals.css` for current CSS variables
   - For `team`: Read `ai/team-templates.json` for existing templates
   - For `hooks`: Read `.claude/settings.json` for current hook config

3. Generate a single self-contained HTML file following the loaded template

4. Core requirements (every playground):
   - Single HTML file with inline CSS and JS. No external dependencies.
   - Interactive controls on one side, live preview on the other
   - Prompt output at the bottom that generates natural language instructions
   - Copy button with "Copied!" feedback
   - 3-5 named presets
   - Dark theme

5. Write to `playgrounds/<topic>-playground.html`

6. Open in browser: `start playgrounds/<topic>-playground.html`

## If no arguments provided

Show available playgrounds:

```
Available Kuroryuu playgrounds:
  /k-playground architecture  — Explore Kuroryuu's codebase architecture
  /k-playground theme         — Tune CSS variables and theme settings
  /k-playground team          — Design agent team configurations
  /k-playground hooks         — Build Claude Code hook configurations
  /k-playground <topic>       — Create a custom playground (uses official skill)
```
