# Plan: Excalidraw Agent Skill Prompts

## Context

The Excalidraw integration (MCP tool + Desktop panel) is built but the agent has no prompts/skills — it spawns as a bare Claude CLI with no context about `k_excalidraw` or diagramming conventions. The marketing agent solves this with skill files at `ai/skills/marketing/` loaded via a Skills dropdown in the workspace header. We need the same for Excalidraw.

## Files to Create

| File | Description |
|------|-------------|
| `ai/skills/excalidraw/EXCALIDRAW_BOOTSTRAP.md` | Master orchestrator — describes all 5 modes, links sub-skills, routing logic, quality standards |
| `ai/skills/excalidraw/architecture.md` | Architecture diagram conventions — layer grouping, color coding, horizontal grid templates |
| `ai/skills/excalidraw/flowchart.md` | Flowchart conventions — start/end ellipses, decision diamonds, vertical flow templates |
| `ai/skills/excalidraw/sequence.md` | Sequence diagram conventions — participant lifelines, request/response arrow patterns |
| `ai/skills/excalidraw/code_to_diagram.md` | Code analysis → diagram — Glob/Grep/Read strategies, auto-type selection, node extraction |
| `ai/skills/excalidraw/diagram_management.md` | Read/update/list/delete lifecycle — element ID handling, incremental modification workflows |

## File to Modify

| File | Change |
|------|--------|
| `apps/desktop/src/renderer/components/excalidraw/ExcalidrawWorkspace.tsx` | Add `EXCALIDRAW_SKILLS` array + `skills`/`skillPathPrefix` props to TerminalWorkspace |

## Skill File Format (from marketing pattern)

Each file follows this structure:
1. **YAML frontmatter** — `name`, `description`, `version: 1.0.0`
2. **Role statement** — what the agent does in this mode
3. **Tool/API reference** — exact `k_excalidraw(...)` call syntax with parameters
4. **Conventions** — naming, colors, labels, organization patterns
5. **Templates** — 2-3 ready-to-paste `k_excalidraw` call examples
6. **Step-by-step instructions** — numbered workflow
7. **Quality checklist** — `- [ ]` items to verify before delivering

## Bootstrap Structure

`EXCALIDRAW_BOOTSTRAP.md` orchestrates 5 modes:

| Mode | Sub-Skill | When |
|------|-----------|------|
| Architecture | `architecture.md` | System components, services, databases, layers |
| Flowchart | `flowchart.md` | Process flows, decisions, algorithms, user journeys |
| Sequence | `sequence.md` | API interactions, service-to-service, protocol flows |
| Code Analysis | `code_to_diagram.md` | User provides file/directory/function to diagram |
| Management | `diagram_management.md` | List, read, update, delete existing diagrams |

Key bootstrap sections:
- Color palette table (blue=services, green=storage, red=external, yellow=decisions, purple=clients, orange=queues, gray=infra)
- Sub-skills table with "MUST LOAD — HARD RULE" (matches marketing pattern)
- `k_excalidraw` quick reference (all 6 actions)
- Auto-type detection rules (mentions "flow" → flowchart, "API" → sequence, default → architecture)
- Naming convention: `{project}_{topic}_{type}`
- Quality standards: max 16-20 nodes, no orphans, semantic colors, concise labels

## Workspace Wiring

In `ExcalidrawWorkspace.tsx`, add:

```typescript
import { BookOpen, Boxes, GitBranch, ArrowRightLeft, Code2, Settings2 } from 'lucide-react';
import type { WorkspaceSkill } from '../shared/terminal-workspace';

const EXCALIDRAW_SKILLS: WorkspaceSkill[] = [
  { id: 'bootstrap', label: 'DOFIRST', icon: BookOpen, file: 'EXCALIDRAW_BOOTSTRAP.md' },
  { id: 'architecture', label: 'Architecture', icon: Boxes, file: 'architecture.md' },
  { id: 'flowchart', label: 'Flowchart', icon: GitBranch, file: 'flowchart.md' },
  { id: 'sequence', label: 'Sequence', icon: ArrowRightLeft, file: 'sequence.md' },
  { id: 'code-to-diagram', label: 'Code to Diagram', icon: Code2, file: 'code_to_diagram.md' },
  { id: 'management', label: 'Management', icon: Settings2, file: 'diagram_management.md' },
];

// Add to TerminalWorkspace props:
skills={EXCALIDRAW_SKILLS}
skillPathPrefix="ai/skills/excalidraw/"
```

## Reference Files

- `ai/skills/marketing/MARKETING_BOOTSTRAP.md` — exact format to follow for bootstrap
- `ai/skills/marketing/research.md` — exact format to follow for sub-skills (frontmatter, reference, templates, checklist)
- `apps/mcp_core/tools_excalidraw.py` — tool API, layout engine params, color constants
- `apps/desktop/src/renderer/components/marketing/MarketingWorkspace.tsx` — skills wiring pattern (lines 45-60, 98-101)

## Verification

1. Skills dropdown appears in Excalidraw workspace header (lightbulb icon)
2. Clicking "DOFIRST" sends `'ai/skills/excalidraw/EXCALIDRAW_BOOTSTRAP.md'` to terminal
3. Agent can read bootstrap and follow it to load sub-skills
4. Each sub-skill contains working `k_excalidraw(...)` call templates that produce valid diagrams
5. TypeScript check passes: `cd apps/desktop && npx tsc --noEmit`
