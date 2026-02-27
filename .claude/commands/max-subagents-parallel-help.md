---
description: Display help reference for max-subagents-parallel flags, strategies, and model tiering
allowed-tools: []
---

# Max Subagents Parallel — Quick Reference

## Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--agents N` | `10` | Maximum agents to spawn per wave |
| `--depth N` | `1` | Recursive depth (2 = sub-agents can decompose further) |
| `--ensemble` | off | Same subtask → multiple models → merge results |
| `--strategy S` | `recursive` | Execution strategy (see below) |

## Strategies

| Strategy | When to Use | How It Works |
|----------|-------------|--------------|
| **recursive** | General multi-step tasks | Decompose → parallel waves → synthesize |
| **ensemble** | High-stakes decisions | Same question → 2-3 models → compare & merge |
| **sweep** | Codebase exploration | Max breadth — up to 10 agents, each a different angle |

## Model Tiering

| Task Type | Model | Cost/Speed |
|-----------|-------|------------|
| File finding, globbing, grep | `haiku` | Fastest, cheapest |
| Code reading, analysis | `sonnet` | Balanced |
| Architecture, complex logic | `opus` | Deepest reasoning |
| Ensemble (multi-model) | mix all 3 | Varied perspectives |
| Synthesis / final merge | `opus` | Reconciles all findings |

## Examples

```bash
# Default: 10 agents, recursive strategy, depth 1
/max-subagents-parallel Add user authentication

# 6 agents, sweep strategy for broad exploration
/max-subagents-parallel --agents 6 --strategy sweep Explore this codebase

# Ensemble mode for a critical decision
/max-subagents-parallel --ensemble Should we use Redis or PostgreSQL?

# Deep recursive decomposition (sub-agents can decompose further)
/max-subagents-parallel --depth 2 --agents 8 Refactor the entire auth system

# Conservative: fewer agents for a smaller task
/max-subagents-parallel --agents 4 Fix all lint errors
```

## Execution Flow

```
1. Parse flags (--agents, --depth, --strategy, --ensemble)
2. Select strategy
3. Decompose task into subtasks (target: --agents per wave)
4. Map dependencies between subtasks
5. Group into parallel waves
6. Execute waves (Wave 1 → Wave 2 → ... → Wave N)
7. Synthesis wave (MANDATORY) — merge and validate all results
```

## The Iron Law

> If tasks are independent, they MUST run in parallel.
> Sequential execution of independent tasks is a bug.
