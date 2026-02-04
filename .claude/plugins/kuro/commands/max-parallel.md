---
description: Activate maximum parallelism mode - aggressive task decomposition and parallel agent spawning
allowed-tools: Task, TaskCreate, TaskUpdate, TaskList, Read, Glob, Grep, mcp__kuroryuu__k_bash
---

# Maximum Parallelism Mode Activated

You are now in **MAX PARALLEL** mode. Your behavior changes:

## Execution Modes

Parse the user's input for flags:

| Flag | Effect |
|------|--------|
| `--cli` | Spawn CLI agents via k_bash (Desktop visible) instead of Task tool |
| `--unattended` | Add `--dangerously-skip-permissions` for full autonomy (requires --cli) |
| `--dry-run` | Show wave graph only, don't execute |
| `--wave-timeout=N` | Max seconds per wave (default: 600) |
| `--wave-parallelism=N` | Max concurrent agents per wave (default: 5) |

**Examples:**
- `/max-parallel "implement auth"` → Native Task tool mode
- `/max-parallel --cli "implement auth"` → CLI spawn mode (Desktop visible)
- `/max-parallel --cli --unattended "implement auth"` → Full autonomous mode
- `/max-parallel --dry-run "implement auth"` → Show plan only

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

**Native Mode (default):** Spawn ALL Wave 1 agents in a **single message with multiple Task tool calls**.

```
Task("Subtask A", subagent_type="Explore", model="haiku")
Task("Subtask B", subagent_type="Explore", model="haiku")
Task("Subtask C", subagent_type="general-purpose", model="sonnet")
```

**CLI Mode (--cli flag):** Spawn ALL Wave 1 agents via k_bash in a **single message**.

```
k_bash(command='claude -p "Subtask A prompt" --allowedTools "Read,Glob,Grep,Write,Edit"', background=true, pty=true, wave_id="wave1")
k_bash(command='claude -p "Subtask B prompt" --allowedTools "Read,Glob,Grep,Write,Edit"', background=true, pty=true, wave_id="wave1")
k_bash(command='claude -p "Subtask C prompt" --allowedTools "Read,Glob,Grep,Write,Edit"', background=true, pty=true, wave_id="wave1")
```

**Unattended CLI Mode (--cli --unattended):** Add `--dangerously-skip-permissions` for full autonomy.

```
k_bash(command='claude -p "Subtask A" --dangerously-skip-permissions --allowedTools "Read,Glob,Grep,Write,Edit,Bash"', background=true, pty=true, wave_id="wave1")
```

### Step 5: Wave Progression

After Wave 1 completes, immediately spawn ALL Wave 2 agents in parallel.
Continue until all waves complete.

**CLI Mode Monitoring:** When using `--cli`, agents appear in Desktop → Coding Agents → Agent Flow.
Sessions are grouped by `wave_id` for visualization.

## Model Selection

| Task Complexity | Model |
|-----------------|-------|
| File finding, globbing, simple grep | haiku |
| Code reading, analysis | sonnet |
| Complex reasoning, architecture | opus |

## Wave Visualization Format (for --dry-run)

When `--dry-run` is specified, display the plan without executing:

```
=== TASK DEPENDENCY GRAPH ===

Wave 1 (parallel - no dependencies):
  [T1] Explore auth module (haiku)
  [T2] Explore database module (haiku)
  [T3] Explore API patterns (haiku)

Wave 2 (blocked by Wave 1):
  [T4] Implement user model (sonnet) ← blocks T6
  [T5] Implement auth service (sonnet) ← blocks T6

Wave 3 (blocked by Wave 2):
  [T6] Add API routes (opus) ← blocks T7

Wave 4 (blocked by Wave 3):
  [T7] Write integration tests (sonnet)

=== EXECUTION SUMMARY ===
Total tasks: 7
Total waves: 4
Estimated parallelism gain: 4x (vs 7 sequential)
```

## Permission Flag Reference

| Scenario | Use `--dangerously-skip-permissions` | Use `--allowedTools` |
|----------|--------------------------------------|---------------------|
| Read-only exploration | No | `"Read,Glob,Grep"` |
| Safe coding tasks | No | `"Read,Glob,Grep,Write,Edit"` |
| Unattended automation | **Yes** (via --unattended) | Combine both |
| User-supervised | No | Yes |

**Key insight:** `--allowedTools` restricts WHICH tools are available. `--dangerously-skip-permissions` skips permission PROMPTS. For full autonomy, combine both.

## NOW: Apply to Current Context

What task should I parallelize? If you have a pending request, I will:
1. Show the full task decomposition
2. Show the dependency graph (always, or --dry-run to stop here)
3. Execute Wave 1 immediately with parallel agents

Awaiting your task or confirm to parallelize the last discussed work.
