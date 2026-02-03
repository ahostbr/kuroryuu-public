---
name: find-skill-sh
description: Use when starting work on a specific technology (typescript, react, python, vite, nextjs, etc), when user asks "find a skill for X", "search skills.sh", "best practices for X", or when you need procedural knowledge for a task. Searches the open agent skills ecosystem at skills.sh.
---

# Find Skills from skills.sh

Search the open agent skills ecosystem for procedural knowledge.

## When to Use

- Starting work with a specific technology (TypeScript, React, Python, Rust, etc.)
- User asks for best practices or guidelines
- Need domain-specific procedural knowledge
- User explicitly requests skill search

## Local Cache First

**Check local cache before searching online:**
```
.claude/plugins/kuro/skills/_skills-sh-data/
```

Available cached skills:
- `vite` - Vite build tool (read `_skills-sh-data/vite/INDEX.md`)
- `vitest` - Vitest testing framework (read `_skills-sh-data/vitest/INDEX.md`)
- `vercel-react-best-practices` - React best practices (read `_skills-sh-data/vercel-react-best-practices/AGENTS.md`)

If the technology matches a cached skill, read the INDEX.md directly - no network needed.

## Online Search Workflow

### Step 1: Search skills.sh

Use WebSearch with site filter:
```
site:skills.sh {technology}
```

Examples:
- `site:skills.sh typescript` - TypeScript skills
- `site:skills.sh react testing` - React testing skills
- `site:skills.sh python fastapi` - Python FastAPI skills
- `site:skills.sh nextjs` - Next.js skills

### Step 2: Present Results

Show user the top 3-5 results in a table:

| # | Skill | Source | Installs |
|---|-------|--------|----------|
| 1 | typescript-advanced-types | wshobson/agents | 2.5K |
| 2 | typescript-best-practices | 0xbigboss/claude-code | 177 |

Let user select which skill to apply, or auto-select top result if only one is highly relevant.

### Step 3: Fetch Selected Skill

Use WebFetch on the skill page URL:
```
https://skills.sh/{owner}/{repo}/{skill-name}
```

Example:
```
WebFetch("https://skills.sh/wshobson/agents/typescript-advanced-types", "Extract the complete skill content including best practices, patterns, and guidelines")
```

### Step 4: Apply Instructions

Extract and apply the skill's:
- Best practices and guidelines
- Code patterns and examples
- Common pitfalls to avoid
- Recommended approaches
- Type patterns (for TypeScript skills)

## Quick Reference

| Technology | Action |
|------------|--------|
| Vite | Read local: `_skills-sh-data/vite/INDEX.md` |
| Vitest | Read local: `_skills-sh-data/vitest/INDEX.md` |
| React | Read local: `_skills-sh-data/vercel-react-best-practices/AGENTS.md` OR search `site:skills.sh react` |
| TypeScript | Search: `site:skills.sh typescript` |
| Next.js | Search: `site:skills.sh nextjs` |
| Python | Search: `site:skills.sh python` |
| Testing | Search: `site:skills.sh testing` |
| API Design | Search: `site:skills.sh api` |

## URL Patterns

- **Search page**: `https://skills.sh/?q={query}`
- **Skill page**: `https://skills.sh/{owner}/{repo}/{skill-name}`
- **Leaderboard**: `https://skills.sh/` (37K+ skills)

## Example Session

**User**: "I'm working on TypeScript, find relevant skills"

**Agent workflow**:
1. Check local cache - no TypeScript skill cached
2. WebSearch: `site:skills.sh typescript`
3. Present top results to user
4. User selects "typescript-advanced-types"
5. WebFetch: `https://skills.sh/wshobson/agents/typescript-advanced-types`
6. Apply skill instructions to current TypeScript work

## Tips

- Always check local cache first (faster, no network)
- Use specific queries: "typescript generics" beats "typescript"
- Skills from `vercel-labs/agent-skills` and `anthropics/skills` are high quality
- Install count indicates popularity but not necessarily quality
- Read the full skill content before applying to understand context
