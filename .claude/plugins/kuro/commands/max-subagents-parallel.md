---
description: Activate maximum parallelism mode - aggressive task decomposition and parallel subagent spawning
allowed-tools: Task, TaskCreate, TaskUpdate, TaskList, Read, Glob, Grep
---

# Maximum Parallelism Mode Activated

You are now in **MAX PARALLEL** mode. Your behavior changes:

## Flag Parsing

Parse the user's input for these flags (apply defaults for any not specified):

| Flag | Default | Effect |
|------|---------|--------|
| `--agents N` | 10 | Max agents per wave |
| `--depth N` | 1 | Recursive decomposition depth (2 = sub-agents can decompose further) |
| `--ensemble` | off | Multiple models tackle same subtask, then merge results |
| `--strategy S` | recursive | Strategy: `recursive`, `ensemble`, `sweep` |

Example: `/max-subagents-parallel --agents 6 --strategy sweep --depth 2`

## Strategy Selection

### `recursive` (default)
Decompose → Execute in waves → Synthesize. Standard parallel decomposition with high agent count.

### `ensemble`
Same subtask given to 2-3 different models independently, then merge/compare results. Best for **high-stakes decisions** where confidence matters more than speed.

```
Wave 1 (ensemble - same question, different models):
  - Task("Analyze auth architecture", model="haiku")
  - Task("Analyze auth architecture", model="sonnet")
  - Task("Analyze auth architecture", model="opus")

Wave 2 (synthesis):
  - Task("Merge and compare the 3 analyses", model="opus")
```

### `sweep`
Broad exploration — maximize breadth in Wave 1 (up to 10 agents), each exploring a different angle. Best for **codebase understanding** and open-ended research.

```
Wave 1 (sweep - 10 agents, each a different angle):
  - Task("Explore auth patterns", model="haiku")
  - Task("Explore database layer", model="haiku")
  - Task("Explore API routes", model="haiku")
  - Task("Explore error handling", model="haiku")
  - Task("Explore test patterns", model="haiku")
  - Task("Explore config/env setup", model="haiku")
  - Task("Explore logging/observability", model="haiku")
  - Task("Explore state management", model="haiku")
  - Task("Explore build/deploy pipeline", model="haiku")
  - Task("Explore dependency graph", model="haiku")

Wave 2 (synthesis):
  - Task("Synthesize all 10 exploration results", model="opus")
```

## Immediate Actions

1. **Parse flags** from user input (apply defaults for missing flags)
2. **Select strategy** based on `--strategy` flag
3. **Analyze the current task or last user request**
4. **Decompose into ALL subtasks** (target `--agents` count per wave)
5. **Map dependencies** between tasks
6. **Spawn agents in parallel** for all independent work

## Execution Pattern

### Step 1: Full Task Decomposition

List EVERY subtask needed to complete the request. Target up to **10 subtasks** per wave (or `--agents N`). Don't stop at 2-3 — find ALL components.

### Step 2: Dependency Mapping

For each task pair, ask: "Does Task A need Task B's output?"
- YES → Task B blocks Task A
- NO → They can run in parallel

### Step 3: Wave Grouping

- **Wave 1:** All tasks with no blockers (run in parallel NOW — up to 10 agents)
- **Wave 2:** Tasks blocked only by Wave 1 (run after Wave 1 completes)
- **Wave 3+:** Continue pattern
- **Wave N+1 (Synthesis):** MANDATORY final wave — synthesize and validate all results

### Step 4: Parallel Execution

Spawn ALL Wave 1 agents in a **single message with multiple Task tool calls**.

```
Task("Subtask A", subagent_type="Explore", model="haiku")
Task("Subtask B", subagent_type="Explore", model="haiku")
Task("Subtask C", subagent_type="Explore", model="haiku")
Task("Subtask D", subagent_type="general-purpose", model="sonnet")
Task("Subtask E", subagent_type="general-purpose", model="sonnet")
Task("Subtask F", subagent_type="Explore", model="haiku")
Task("Subtask G", subagent_type="Explore", model="haiku")
Task("Subtask H", subagent_type="general-purpose", model="sonnet")
Task("Subtask I", subagent_type="Explore", model="haiku")
Task("Subtask J", subagent_type="Explore", model="haiku")
```

### Step 5: Wave Progression

After Wave 1 completes, immediately spawn ALL Wave 2 agents in parallel.
Continue until all execution waves complete.

### Step 6: Synthesis Wave (MANDATORY)

After all execution waves, spawn a **synthesis agent** to merge and validate results:

```
Task("Synthesize and validate all results from Waves 1-N", subagent_type="general-purpose", model="opus")
```

The synthesis agent must:
- Merge findings from all agents into a coherent summary
- Flag any contradictions or conflicts between agent results
- Validate completeness — did we miss anything?
- Produce the final deliverable

### Depth Control (`--depth`)

If `--depth >= 2`, execution agents may themselves decompose subtasks into further parallel waves. Each sub-agent follows the same pattern: decompose → map → execute in waves → synthesize. Max recursion = `--depth` value.

## Model Selection

| Task Complexity | Model |
|-----------------|-------|
| File finding, globbing, simple grep | haiku |
| Code reading, analysis | sonnet |
| Complex reasoning, architecture | opus |
| Ensemble verification (same task, different model) | mix haiku + sonnet + opus |
| Synthesis / final merge | opus |

## NOW: Apply to Current Context

What task should I parallelize? If you have a pending request, I will:
1. Parse any flags from your input
2. Select the appropriate strategy
3. Show the full task decomposition (targeting up to 10 agents per wave)
4. Show the dependency graph
5. Execute Wave 1 immediately with parallel agents
6. Run synthesis wave after all execution waves complete

Awaiting your task or confirm to parallelize the last discussed work.
