---
description: Display help reference for max-subagents-parallel flags, strategies, and model tiering
allowed-tools: []
---

# Max Parallel — Help Reference

## Usage
```
/max-parallel [flags] <task description>
```

## Flags

| Flag | Default | Effect |
|------|---------|--------|
| `--agents N` | 10 | Max agents per wave |
| `--depth N` | 1 | Recursive decomposition depth |
| `--ensemble` | off | Multiple models tackle same subtask |
| `--strategy S` | recursive | Strategy: `recursive`, `ensemble`, `sweep` |

## Strategies

- **recursive** (default): Decompose -> Execute in waves -> Synthesize
- **ensemble**: Same task given to 2-3 models, then merge/compare (for high-stakes decisions)
- **sweep**: Broad exploration with up to 10 agents, each a different angle (for codebase understanding)

## Model Tiering

| Task Complexity | Model |
|-----------------|-------|
| File finding, globbing, simple grep | haiku |
| Code reading, analysis | sonnet |
| Complex reasoning, architecture | opus |
| Synthesis / final merge | opus |

## Examples
```
/max-parallel Add user authentication
/max-parallel --agents 6 --strategy sweep Explore this codebase
/max-parallel --ensemble Should we use Redis or PostgreSQL?
/max-parallel --depth 2 --agents 8 Refactor the auth system
```
