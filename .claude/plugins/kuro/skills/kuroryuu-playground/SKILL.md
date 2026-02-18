---
name: kuroryuu-playground
description: Creates Kuroryuu-specific interactive HTML playgrounds pre-populated with real project architecture data. Use when the user asks for a "kuroryuu playground", "architecture explorer", "theme tuner", "agent team planner", or "hook builder". Extends the official playground skill with project-aware templates.
---

# Kuroryuu Playground Builder

Extends the official `/playground` skill with Kuroryuu-specific templates pre-populated with real project data.

## When to use this skill

When the user asks for a playground specifically about Kuroryuu — architecture, theme tuning, agent team design, or hook configuration. For generic playground requests, defer to the official `playground` skill.

## How to use this skill

1. **Identify the template** from the user's request
2. **Load the matching template** from `templates/`:
   - `templates/architecture-explorer.md` — Kuroryuu codebase architecture (25 routers, 170+ components, 5 layers)
   - `templates/theme-tuner.md` — CSS variable playground for imperial/standard theme tuning
   - `templates/agent-team-planner.md` — Concept map for designing agent team configurations
   - `templates/hook-builder.md` — Data explorer for constructing Claude Code hook configurations
3. **Gather live project data** before generating:
   - Use `k_repo_intel(action="get", report="routes")` for route data
   - Use `k_repo_intel(action="get", report="symbol_map")` for component data
   - Read relevant config files (`.claude/settings.json`, `ai/team-templates.json`, etc.)
4. **Follow the template** to build the playground with real data pre-populated
5. **Follow official playground core requirements:**
   - Single HTML file, inline all CSS and JS, no external dependencies
   - Controls on one side, live preview on the other, prompt output at bottom
   - Copy button with "Copied!" feedback
   - Sensible defaults + 3-5 named presets
   - Dark theme, system font for UI, monospace for code
6. **Write to `playgrounds/` directory:** `playgrounds/<topic>-playground.html`
7. **Open in browser:** Run `start playgrounds/<topic>-playground.html` (Windows)

## State management pattern

Keep a single state object. Every control writes to it, every render reads from it:

```javascript
const state = { /* all configurable values */ };
const DEFAULTS = { ...state }; // snapshot for diff

function updateAll() {
  renderPreview();
  updatePrompt(); // only mentions non-default values
}
```

## Prompt output pattern

Generate natural language instructions, not value dumps. Only mention non-default choices:

```javascript
function updatePrompt() {
  const parts = [];
  if (state.value !== DEFAULTS.value) {
    parts.push(`use ${state.value} for the setting`);
  }
  prompt.textContent = parts.length
    ? `Update Kuroryuu to ${parts.join(', ')}.`
    : 'No changes from defaults.';
}
```
