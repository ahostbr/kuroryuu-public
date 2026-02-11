---
description: Search LLM Apps catalog for a reference repo matching what you want to build, then analyze it on GitHub
argument-hint: [what you want to build]
allowed-tools: Read, WebFetch, WebSearch, AskUserQuestion, Glob
---

# /k-find-app — Find & Analyze a Reference LLM App

Search the local LLM Apps catalog (207 apps) for a project similar to what the user wants to build, then analyze the **real GitHub source code** online.

## Constants

- **Catalog file:** `ai/data/llm-apps-catalog.json` (relative to project root)
- **GitHub base:** `https://github.com/Shubhamsaboo/awesome-llm-apps`
- **Raw content base:** `https://raw.githubusercontent.com/Shubhamsaboo/awesome-llm-apps/main`

## Step 1: Parse Input

Use `$ARGUMENTS` as the user's description of what they want to build.

If `$ARGUMENTS` is empty, use `AskUserQuestion` to ask:
- Question: "What kind of app or agent do you want to build?"
- Options: "AI Agent", "RAG App", "Multi-Agent System", "Chat App" (with multiSelect: false)
- The user can also type a custom description via "Other"

## Step 2: Read the Local Catalog

Read the file `ai/data/llm-apps-catalog.json` using the Read tool.

Parse the JSON. The catalog has this structure:
```json
{
  "apps": [
    {
      "id": "path/to/app",
      "name": "AI Chess Agent",
      "category": "Game Playing Agents",
      "categoryId": "advanced_ai_agents_autonomous_game_playing_agent_apps",
      "path": "advanced_ai_agents/autonomous_game_playing_agent_apps/ai_chess_agent",
      "description": "An advanced Chess game system where two AI agents...",
      "techStack": ["streamlit", "chess", "autogen", "cairosvg", "pillow"],
      "entryPoint": "ai_chess_agent.py",
      "hasReadme": true,
      "hasRequirements": true,
      "pyFileCount": 1
    }
  ],
  "categories": [...],
  "totalApps": 207
}
```

## Step 3: Search & Rank

Extract keywords from the user's description. Split on spaces, lowercase everything, remove common stop words (a, an, the, i, want, to, build, make, create, with, using, for, that, can, app, application).

For each app in the catalog, compute a relevance score:

| Match location | Points per keyword hit |
|---|---|
| `name` (case-insensitive) | **3 points** |
| `category` (case-insensitive) | **2 points** |
| `techStack[]` (exact match) | **2 points** |
| `description` (case-insensitive substring) | **1 point** |

Sort apps by total score descending. Take the **top 4** apps with score > 0.

If no apps score > 0, try a broader search:
- Use WebSearch to find: `site:github.com/Shubhamsaboo/awesome-llm-apps {user query}`
- If that fails too, tell the user no matching apps were found and suggest different keywords.

## Step 4: User Selection

Present the top matches using `AskUserQuestion`:

- **Question:** "Which reference app should I analyze for your [{user's description}] project?"
- **multiSelect:** false
- **Options (up to 4):** For each match, create an option with:
  - **label:** `{app.name}` (e.g., "AI Chess Agent")
  - **description:** `{app.category} — {app.techStack.slice(0,4).join(', ')}` (e.g., "Game Playing Agents — streamlit, chess, autogen, cairosvg")

Wait for the user's selection. If the user picks "Other" with custom text, re-run Step 3 with their new input.

## Step 5: Construct GitHub URLs

For the selected app, build these URLs:

```
Directory:     https://github.com/Shubhamsaboo/awesome-llm-apps/tree/main/{app.path}
README (raw):  https://raw.githubusercontent.com/Shubhamsaboo/awesome-llm-apps/main/{app.path}/README.md
Entry point:   https://raw.githubusercontent.com/Shubhamsaboo/awesome-llm-apps/main/{app.path}/{app.entryPoint}
Requirements:  https://raw.githubusercontent.com/Shubhamsaboo/awesome-llm-apps/main/{app.path}/requirements.txt
```

## Step 6: Analyze the Real GitHub Repo

Fetch and analyze in this order. Use `WebFetch` for each URL. Do NOT clone or download anything locally.

### 6a. Fetch the README
- URL: the raw README URL from Step 5
- Prompt: "Extract the full content of this README. Include: project description, features, architecture, setup instructions, and any tutorial links."

### 6b. Fetch the main source code
- URL: the raw entry point URL from Step 5
- Prompt: "Extract the complete Python source code from this file. Preserve all imports, class definitions, function definitions, and inline comments."
- If `app.pyFileCount > 1`, also check the GitHub directory page to discover additional .py files and fetch those too.

### 6c. Fetch requirements (if hasRequirements)
- URL: the raw requirements URL from Step 5
- Prompt: "List all Python package dependencies with their version constraints."

### 6d. Fallback: WebSearch
If any WebFetch call fails (404, rate limit, etc.), use WebSearch:
- Query: `github Shubhamsaboo awesome-llm-apps {app.name} {app.entryPoint}`
- Extract relevant information from search results

## Step 7: Present the Analysis

Format a comprehensive analysis report:

```markdown
## Reference App: {app.name}

**Category:** {app.category}
**GitHub:** {directory URL from Step 5}
**Tech Stack:** {app.techStack joined}

### What This App Does
{Summary from README analysis}

### Architecture & Patterns
{Key patterns found in the code — e.g., multi-agent setup, API integrations, state management, UI framework}

### Code Structure
| File | Purpose |
|---|---|
| {entryPoint} | {description of main file} |
| ... | ... |

### Key Implementation Details
{Important functions, classes, or patterns from the source code — the stuff that matters for the user's project}

### Dependencies
{Notable packages and what they're used for}

### How to Adapt This for Your Project
{Concrete suggestions on what to keep, modify, or replace based on the user's original description}

### Links
- [Browse on GitHub]({directory URL})
- [View Source Code]({entry point URL on GitHub, not raw})
{- [Tutorial]({tutorial URL if found in README})}
```

## Important Rules

1. **NEVER clone or download the repo** — only read via WebFetch/WebSearch
2. **NEVER suggest `git clone`** — the user is analyzing, not downloading
3. **Always show the GitHub link** so the user can browse themselves
4. **Focus on patterns** — the user wants to understand HOW to build something similar, not just WHAT the app does
5. **If WebFetch fails for raw.githubusercontent.com**, try the regular GitHub URL instead: `https://github.com/Shubhamsaboo/awesome-llm-apps/blob/main/{path}/{file}`
