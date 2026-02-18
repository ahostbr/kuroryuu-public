# Agent Team Planner Template

Use this template when the playground is about designing Claude Code agent team configurations: team composition, task assignment, dependency mapping, model selection.

Extends the official `concept-map` template with Kuroryuu's agent team system.

## Layout

```
+--------------------------------------+
|  Canvas (draggable agent nodes)      |
|  with edges showing task flow        |
+-------------------------+------------+
|                         |            |
|  Sidebar:               | Prompt     |
|  - Template selector    | output     |
|  - Agent list with      |            |
|    model dropdowns      | [Copy]     |
|  - Task count slider    |            |
|  - Actions              |            |
+-------------------------+------------+
```

## Pre-populate with Kuroryuu data

Read `ai/team-templates.json` for existing team templates. Read `~/.claude/teams/` for examples of past teams.

### Agent Roles

| Role | Color | Description |
|------|-------|-------------|
| Leader | #f59e0b gold | Orchestrates team, assigns tasks, reviews |
| Builder | #3b82f6 blue | Implements features, writes code |
| Researcher | #8b5cf6 purple | Explores codebase, reads docs |
| Tester | #10b981 green | Writes tests, validates changes |
| Reviewer | #ef4444 red | Reviews code, checks quality |

### Connection Types

| Type | Style | Use for |
|------|-------|---------|
| Delegates to | Solid arrow | Leader → Worker task assignment |
| Blocks | Red dashed | Dependency between tasks |
| Validates | Green dotted | Reviewer → Builder verification |
| Needs output | Purple dash | Research feeds into implementation |

### Controls

| Decision | Control | Example |
|----------|---------|---------|
| Team template | Dropdown | "Solo Dev", "Full Team (4)", "Research Sprint (2)" |
| Agent count | Slider 1-6 | Number of agents |
| Per-agent model | Dropdown per node | opus, sonnet, haiku |
| Per-agent role | Dropdown per node | leader, builder, researcher, tester |
| Task connections | Click agent A → agent B | Draw dependency edge |
| Agent status | Click-to-cycle | idle → in_progress → completed |

### Presets

1. **Solo Dev** — 1 agent (builder), no dependencies
2. **Pair Programming** — 2 agents (builder + reviewer)
3. **Research Sprint** — 2 agents (researcher + builder), research → build flow
4. **Full Team** — 4 agents (leader + 2 builders + tester), parallel tasks
5. **Test-Driven** — 3 agents (tester + builder + reviewer), test → build → review

## Prompt output

Generate a team creation plan:

```
Create a Claude Code agent team with 4 members:

Team: "feature-implementation"
1. Leader (opus) — Orchestrates, assigns tasks, reviews final output
2. Builder-Frontend (sonnet) — Implements UI components
3. Builder-Backend (sonnet) — Implements API endpoints
4. Tester (haiku) — Writes tests for both frontend and backend

Task flow:
- Builder-Frontend and Builder-Backend work in parallel
- Tester is blocked by both builders
- Leader reviews all completed tasks

Model rationale: Opus for orchestration decisions, Sonnet for implementation, Haiku for test generation (cost-effective).
```

Include model rationale and task dependencies in the output.
