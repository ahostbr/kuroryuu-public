# Kuroryuu Agent Prompts

> **Hackathon Stats:** 23 days | 437 sessions | 431 tasks | 16 MCP tools → 118 actions

Reusable workflow prompts for the Kuroryuu multi-agent orchestration system.

## PRD-First Workflow

```
PRD (North Star) → Plan Feature → Breakdown → Execute → Finalize → Reports/Reviews
```

- **PRD is created ONCE** at project inception using `create-prd.md`
- Leader READS PRD to derive tasks, never regenerates it
- All features must align with PRD before planning

## Prompt Catalog

### Leader Prompts

| Prompt | Purpose |
|--------|---------|
| [leader_prime.md](leader_prime.md) | Initialize session, load PRD, check orchestration state |
| [leader_plan_feature.md](leader_plan_feature.md) | Plan feature citing PRD as north star |
| [leader_breakdown.md](leader_breakdown.md) | Convert plan into subtasks with dependencies |
| [leader_nudge.md](leader_nudge.md) | Help stuck workers with hints |
| [leader_finalize.md](leader_finalize.md) | Complete task, trigger reports and reviews |

### Worker Prompts

| Prompt | Purpose |
|--------|---------|
| [worker_loop.md](worker_loop.md) | Poll-claim-execute lifecycle |
| [worker_iterate.md](worker_iterate.md) | Single iteration execution with context injection |

### One-Time Prompts

| Prompt | Purpose |
|--------|---------|
| [create-prd.md](create-prd.md) | Generate PRD at project inception (one-time) |
| [plan-feature.md](plan-feature.md) | Feature planning template |
| [hackathon-complete.md](hackathon-complete.md) | Final verification for hackathon formula |

### Review Prompts

| Prompt | Purpose |
|--------|---------|
| [system-review.md](system-review.md) | Divergence analysis (plan vs implementation) |
| [code-review.md](code-review.md) | Code quality review |
| [execution-report.md](execution-report.md) | Task completion report |

### Legacy Prompts (Deprecated)

| Prompt | Status | Replacement |
|--------|--------|-------------|
| [prime.md](prime.md) | Deprecated | Use `leader_prime.md` |
| [execute.md](execute.md) | Deprecated | Use `worker_iterate.md` |
| [plan.md](plan.md) | Deprecated | Use `leader_plan_feature.md` |
| [review.md](review.md) | Deprecated | Use `system-review.md` or `code-review.md` |
| [validate.md](validate.md) | Deprecated | Use promise protocol |

## Promise Protocol

Workers report status using promises in their responses:

```
<promise>DONE</promise>           - Task complete
<promise>PROGRESS:60%</promise>   - Partial progress
<promise>BLOCKED:reason</promise> - Need external input
<promise>STUCK:reason</promise>   - Can't proceed, need leader help
```

## Directory Structure

```
ai/
├── prds/          # PRD (north star) - created once
├── plans/         # Implementation plans
├── reports/       # Execution reports
├── reviews/       # Code and system reviews
├── prompts/       # This directory
├── formulas/      # Multi-step workflow definitions (TOML)
├── todo.md        # Task backlog (SOURCE OF TRUTH)
├── hooks.json     # Hook configuration
└── sessions.json  # Session registry

Docs/
└── DEVLOG.md      # Development history (replaces ai/progress.md)
```

## Usage

The gateway loads these prompts and injects them into agent context. Leaders use leader_* prompts, workers use worker_* prompts.

## Rules

1. Always read PRD before planning features
2. Use promise protocol for all worker responses
3. Leader coordinates, workers execute
4. Update `ai/todo.md` as tasks progress (mark checkboxes)
5. Append to `Docs/DEVLOG.md` after completing significant work
6. Generate reports and reviews after finalization

## Deprecated Files (DO NOT USE)

- `ai/progress.md` — Replaced by `Docs/DEVLOG.md`
- `ai/feature_list.json` — Replaced by `ai/todo.md`

See `Docs/Architecture/HARNESS_FILES_SPECIFICATION.md` for full details.
