---
description: Search skills.sh for technology-specific procedural knowledge
argument-hint: [technology]
allowed-tools: WebSearch, WebFetch, Read, Glob
---

# Find Skills from skills.sh

Search the open agent skills ecosystem (37K+ skills) for procedural knowledge.

## Steps

1. **Extract technology** from `$ARGUMENTS` (e.g., "typescript", "react", "python")
   If empty, ask what technology to search for.

2. **Check local cache first**:
   ```
   .claude/plugins/kuro/skills/_skills-sh-data/
   ```

   Cached skills:
   - `vite/INDEX.md` - Vite build tool
   - `vitest/INDEX.md` - Vitest testing
   - `vercel-react-best-practices/AGENTS.md` - React best practices

   If match, read INDEX.md directly (no network needed).

3. **Search skills.sh online**:
   ```
   WebSearch("site:skills.sh {technology}")
   ```

4. **Present top 3-5 results**:
   | # | Skill | Source | Description |
   |---|-------|--------|-------------|
   | 1 | skill-name | owner/repo | Brief description |

5. **Fetch selected skill**:
   ```
   WebFetch("https://skills.sh/{owner}/{repo}/{skill-name}",
            "Extract complete skill content including best practices and patterns")
   ```

6. **Apply instructions** to current work:
   - Best practices
   - Code patterns
   - Common pitfalls
   - Recommended approaches

## Usage

- `/find-skill-sh typescript` - TypeScript skills
- `/find-skill-sh react` - React skills
- `/find-skill-sh python fastapi` - Python FastAPI skills
- `/find-skill-sh testing` - Testing frameworks
- `/find-skill-sh electron` - Electron development

## URL Patterns

- Search: `https://skills.sh/?q={query}`
- Skill page: `https://skills.sh/{owner}/{repo}/{skill-name}`

## High Quality Sources

- `vercel-labs/agent-skills` - Official Vercel skills
- `anthropics/skills` - Official Anthropic skills
- Install count indicates popularity

## Security

Skills fetched from skills.sh are automatically scanned for malicious patterns:

- **Secrets**: Embedded API keys, tokens, private keys
- **Shell injection**: Command substitution, dangerous shell commands
- **Filesystem writes**: File write operations that could modify system
- **Exfiltration**: Network requests to external domains
- **Code injection**: eval(), exec(), dynamic code execution
- **Obfuscation**: Base64 encoding, hex escapes, character code tricks

If malicious patterns are detected, a detailed warning is displayed and the content
should NOT be applied. Report suspicious skills to skills.sh maintainers.
