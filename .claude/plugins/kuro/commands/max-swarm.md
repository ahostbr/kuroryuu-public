---
description: Spawn a swarm of coding agents to work on a task in parallel
allowed-tools: mcp__kuroryuu__k_bash, Read, Glob, Grep, Task
---

# /max-swarm - Parallel Coding Agent Swarm

Spawn multiple coding agents in parallel to work on a task. Like `/max-parallel` but specifically for autonomous coding agents via `k_bash`.

## When Invoked

The user provides a task description. You will:
1. Decompose it into 2-5 independent subtasks
2. Spawn a Claude agent for each subtask (in parallel)
3. Report the session IDs for monitoring

## Step 1: Task Decomposition

Analyze the task and decompose into **2-5 independent subtasks** that can be worked on in parallel.

Consider:
- What parts of the codebase need attention?
- What can be done independently without blocking?
- What's the optimal breakdown for parallel work?

**Examples:**
- "Document codebase" → Gateway docs, Desktop docs, MCP tools docs, AI harness docs
- "Review feature X" → Store review, Component review, Hook review, API review
- "Add tests" → Unit tests, Integration tests, E2E tests

## Step 2: Spawn Agents in Parallel

For each subtask, spawn a Claude agent using `k_bash` with these settings:
- `background: true` (required - runs in background)
- `pty: true` (required - interactive CLIs need PTY)
- `workdir`: Project root directory

**Command template:**
```
claude -p "{subtask_prompt}" --allowedTools "Read,Glob,Grep,Write,Edit"
```

**CRITICAL: Spawn ALL agents in a SINGLE message with parallel tool calls!**

```
// DO THIS - all in one message:
k_bash(command="claude -p 'Task 1' ...", background=true, pty=true)
k_bash(command="claude -p 'Task 2' ...", background=true, pty=true)
k_bash(command="claude -p 'Task 3' ...", background=true, pty=true)

// NOT THIS - sequential:
k_bash(...)  // wait
k_bash(...)  // wait
k_bash(...)  // wait
```

## Step 3: Report Results

After spawning, provide a summary:

```
## Swarm Deployed

| Agent | Task | Session ID |
|-------|------|------------|
| Claude | Document Gateway | abc123 |
| Claude | Document Desktop | def456 |
| Claude | Document MCP | ghi789 |

**Monitor:** Desktop → Coding Agents → Agent Flow
**Status:** All agents running with LIVE streaming
```

## Rules

1. **ALWAYS decompose** - Never spawn just 1 agent (use regular claude for that)
2. **ALWAYS parallel** - Spawn all agents in ONE message
3. **ALWAYS background** - Use `background: true, pty: true`
4. **Target 3-5 agents** - Sweet spot for most tasks
5. **Focused subtasks** - Each agent should have a clear, bounded scope

## Example Invocations

**User:** `/max-swarm "Write comprehensive documentation for Kuroryuu"`

**Response:**
```
Decomposing into parallel subtasks...

Spawning swarm of 4 Claude agents:

1. Gateway Architecture Documentation
2. Desktop Application Documentation
3. MCP Tools Documentation
4. AI Harness Documentation

[Spawn 4 agents in parallel with k_bash...]

## Swarm Deployed

| Agent | Task | Session ID |
|-------|------|------------|
| Claude | Gateway docs | a1b2c3 |
| Claude | Desktop docs | d4e5f6 |
| Claude | MCP tools docs | g7h8i9 |
| Claude | AI harness docs | j0k1l2 |

Monitor progress: Desktop → Coding Agents → Agent Flow
```
