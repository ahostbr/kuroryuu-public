---
description: Activate maximum parallelism mode - aggressive task decomposition and parallel subagent spawning
allowed-tools: Task, TaskCreate, TaskUpdate, TaskList, Read, Glob, Grep
---

# Maximum Parallelism Mode Activated

You are now in **MAX PARALLEL** mode. Your behavior changes:

## Immediate Actions

1. **Analyze the current task or last user request**
2. **Decompose into ALL subtasks** (not just the first one)
3. **Map dependencies** between tasks
4. **Spawn agents in parallel** for all independent work

## Execution Pattern

For the user's request, you will:

### Step 1: Full Task Decomposition

List EVERY subtask needed to complete the request. Don't stop at 2-3 - find ALL components.

### Step 2: Dependency Mapping

For each task pair, ask: "Does Task A need Task B's output?"
- YES → Task B blocks Task A
- NO → They can run in parallel

### Step 3: Wave Grouping

- **Wave 1:** All tasks with no blockers (run in parallel NOW)
- **Wave 2:** Tasks blocked only by Wave 1 (run after Wave 1 completes)
- **Wave 3+:** Continue pattern

### Step 4: Parallel Execution

Spawn ALL Wave 1 agents in a **single message with multiple Task tool calls**.

```
Task("Subtask A", subagent_type="Explore", model="haiku")
Task("Subtask B", subagent_type="Explore", model="haiku")
Task("Subtask C", subagent_type="general-purpose", model="sonnet")
```

### Step 5: Wave Progression

After Wave 1 completes, immediately spawn ALL Wave 2 agents in parallel.
Continue until all waves complete.

## Model Selection

| Task Complexity | Model |
|-----------------|-------|
| File finding, globbing, simple grep | haiku |
| Code reading, analysis | sonnet |
| Complex reasoning, architecture | opus |

## NOW: Apply to Current Context

What task should I parallelize? If you have a pending request, I will:
1. Show the full task decomposition
2. Show the dependency graph
3. Execute Wave 1 immediately with parallel agents

Awaiting your task or confirm to parallelize the last discussed work.
