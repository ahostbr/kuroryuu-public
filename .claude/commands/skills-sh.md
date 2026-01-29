---
description: Frontend skills router - Vite, Vitest, React performance, UI guidelines
allowed-tools: Read, Glob, Grep
---

# Skills Router (skills.sh)

Route to the correct skill based on your task.

## Available Skills

| Skill | Use When |
|-------|----------|
| **vite** | Build config, dev server, HMR, plugins, assets, CSS, env vars |
| **vitest** | Tests, mocking, coverage, snapshots, assertions |
| **vercel-react-best-practices** | React perf, rerenders, bundle size, async waterfalls, server components |
| **web-design-guidelines** | UI review, accessibility, UX audit |

## Routing

Based on user's task, read the appropriate skill file:

### Build & Dev
Keywords: vite.config, dev server, HMR, build, bundle, plugin, assets, CSS, env, glob import
**Load:** `.claude/plugins/kuro/skills/_skills-sh-data/vite/INDEX.md`

### Testing
Keywords: test, describe, it, expect, mock, spy, coverage, vi., snapshot
**Load:** `.claude/plugins/kuro/skills/_skills-sh-data/vitest/INDEX.md`

### React Performance
Keywords: React, Next.js, rerender, useMemo, useCallback, Suspense, RSC, bundle size, waterfall, cache
**Load:** `.claude/plugins/kuro/skills/_skills-sh-data/vercel-react-best-practices/INDEX.md`

### UI/UX Review
Keywords: UI review, accessibility, a11y, UX audit, design check
**Load:** `.claude/plugins/kuro/skills/_skills-sh-data/web-design-guidelines/INDEX.md`

## Quick Reference

| Task | Load |
|------|------|
| Configure Vite | _skills-sh-data/vite/references/core-config.md |
| Add Vite plugin | _skills-sh-data/vite/references/core-plugins.md |
| Write tests | _skills-sh-data/vitest/references/core-test-api.md |
| Mock modules | _skills-sh-data/vitest/references/features-mocking.md |
| Fix rerenders | _skills-sh-data/vercel-react-best-practices/rules/rerender-*.md |
| Reduce bundle | _skills-sh-data/vercel-react-best-practices/rules/bundle-*.md |
| Fix async waterfall | _skills-sh-data/vercel-react-best-practices/rules/async-*.md |
| Review UI | _skills-sh-data/web-design-guidelines/INDEX.md |

## Instructions

1. Identify which skill matches the user's task from keywords above
2. Read the appropriate INDEX.md file
3. Follow that skill's instructions
4. Load additional reference files as needed

What would you like help with? (Vite config, testing, React performance, or UI review)
