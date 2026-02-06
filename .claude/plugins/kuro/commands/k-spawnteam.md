---
description: Spawn a Claude Agent Team to collaboratively work on a task
argument-hint: [task description] or [--template code-review|feature-dev|research|debug]
allowed-tools: Teammate, Task, TaskCreate, TaskUpdate, TaskList, SendMessage, Read, Glob, Grep, Bash, AskUserQuestion
---

# /k-spawnteam - Spawn Claude Agent Team

Create and orchestrate a Claude Code Agent Team for collaborative work. Teams use
Claude's native Teammate and Task tools. The Kuroryuu Desktop auto-detects teams
via file watcher on `~/.claude/teams/` and `~/.claude/tasks/`.

## Input Parsing

Parse `$ARGUMENTS` for:

| Pattern | Meaning |
|---------|---------|
| `--template <name>` | Use a preset team (see Templates below) |
| `--count N` | Override teammate count (2-6, default: inferred) |
| `--model <model>` | Default model for teammates (sonnet, opus, haiku) |
| `--plan-mode` | Require plan approval for all teammates |
| `--dry-run` | Show plan without executing |
| Plain text | Task description to decompose |

**Examples:**
- `/k-spawnteam refactor the auth module into separate services`
- `/k-spawnteam --template code-review review the recent PRs`
- `/k-spawnteam --count 4 build a comprehensive test suite`
- `/k-spawnteam --template feature-dev --dry-run add dark mode`

## Step 0: Environment Check

Verify agent teams are enabled:
```bash
echo $CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS
```

If NOT "1", tell the user to add it to `~/.claude/settings.json` under `env` and restart.

## Step 1: Analyze Task & Decompose

### If `--template` specified:
Use the matching preset (see Templates section). The task description becomes the team's work description.

### If freeform description:

1. **Analyze** the user's task description
2. **Explore** relevant codebase areas using Glob, Grep, Read as needed
3. **Decompose** into 2-5 independent subtasks for parallel work
4. **Determine** team composition:

| Task Type | Recommended Team |
|-----------|-----------------|
| Code review / analysis | 2-3 read-only reviewers (sonnet) |
| Feature development | 1 architect (opus, plan-mode) + 2-3 implementers (sonnet) |
| Bug investigation | 2-3 investigators with different hypotheses (sonnet) |
| Refactoring | 1 planner (opus) + 2-3 executors (sonnet) |
| Research / exploration | 2-3 researchers with different angles (sonnet) |

5. **Present plan** to user before executing:

```
## Team Plan

**Task**: <description>
**Team Size**: <N> teammates

| Role | Model | Focus |
|------|-------|-------|
| <name> | <model> | <area of focus> |

**Subtasks**:
1. <task 1> -> assigned to <name>
2. <task 2> -> assigned to <name>

Proceed? (Continue to create team, or describe changes)
```

If `--dry-run`, stop here.

## Step 2: Create Team

```
Teammate({
  operation: "spawnTeam",
  team_name: "<descriptive-kebab-case-name>",
  description: "<task description>"
})
```

**Team naming**: Use descriptive kebab-case, e.g. `auth-refactor`, `code-review-pr-42`, `test-suite-build`.

## Step 3: Create Tasks

Create ALL tasks BEFORE spawning teammates:

```
TaskCreate({
  subject: "<concise imperative title>",
  description: "<detailed requirements with acceptance criteria>",
  activeForm: "<present continuous for spinner>"
})
```

Set up dependencies between tasks if needed:
```
TaskUpdate({ taskId: "<id>", addBlockedBy: ["<blocking-task-id>"] })
```

## Step 4: Spawn Teammates

**CRITICAL: Spawn ALL teammates in a SINGLE message with parallel Task calls.**

```
Task({
  prompt: "<detailed teammate instructions including role, scope, file paths>",
  team_name: "<team-name>",
  name: "<teammate-name>",
  subagent_type: "general-purpose",
  model: "<sonnet|opus|haiku>"
})
```

Spawn all teammates in ONE message — do NOT spawn them sequentially.

**Teammate prompts should include**:
- Their specific role and focus area
- Reference to TaskList for discovering their assigned work
- Clear scope boundaries (which files/areas they own)
- Relevant file paths from codebase exploration

## Step 5: Assign Tasks

```
TaskUpdate({ taskId: "<id>", owner: "<teammate-name>" })
```

## Step 6: Report Summary

```
## Team Spawned

**Team**: <team-name>
**Task**: <description>

| Teammate | Model | Role | Assigned Task |
|----------|-------|------|---------------|
| <name> | <model> | <role> | <task subject> |

**Monitor via**:
- Desktop: Claude Teams sidebar (auto-detected by watcher)
- CLI: TaskList tool to check progress

**Manage**:
- Message: SendMessage to specific teammate
- Check progress: TaskList
- Shutdown: SendMessage type "shutdown_request"
- Cleanup: Teammate operation "cleanup"
```

Remain active as team lead. Monitor teammate messages (auto-delivered),
reassign tasks as needed, coordinate between teammates.

## Templates

Built-in team configurations (matching Desktop's TeamTemplates):

### `code-review`
3 teammates, all Sonnet:

| Name | Prompt | Color |
|------|--------|-------|
| security-reviewer | You are a security-focused code reviewer. Analyze code for security vulnerabilities, unsafe patterns, input validation issues, authentication/authorization flaws, and potential exploits. Provide actionable security recommendations. | red |
| performance-reviewer | You are a performance-focused code reviewer. Analyze code for performance bottlenecks, inefficient algorithms, memory leaks, unnecessary computations, and optimization opportunities. Suggest performance improvements with measurable impact. | orange |
| test-reviewer | You are a testing-focused code reviewer. Analyze code for test coverage gaps, edge cases, missing assertions, brittle tests, and testing best practices. Recommend test improvements and new test cases. | green |

### `feature-dev`
4 teammates (1 Opus + 3 Sonnet):

| Name | Model | Prompt | Color |
|------|-------|--------|-------|
| architect | Opus (plan-mode) | You are the feature architect. Design high-level architecture, define interfaces, plan data models, identify technical risks, and create implementation roadmaps. Always work in plan mode before implementation. | purple |
| implementer-1 | Sonnet | You are a backend implementer. Focus on server-side logic, API endpoints, database operations, business logic, and backend services. Write clean, maintainable, well-tested code. | blue |
| implementer-2 | Sonnet | You are a frontend implementer. Focus on UI components, state management, user interactions, accessibility, and frontend integration. Write clean, maintainable, well-tested code. | cyan |
| reviewer | Sonnet | You are the code reviewer. Review all implementations for correctness, consistency, best practices, edge cases, and integration issues. Ensure code quality and alignment with architecture. | green |

### `research`
3 teammates, all Sonnet:

| Name | Prompt | Color |
|------|--------|-------|
| researcher-breadth | You are a breadth-first researcher. Cast a wide net, explore multiple approaches, gather diverse sources, identify patterns across domains, and provide comprehensive overviews. Think laterally and make unexpected connections. | blue |
| researcher-depth | You are a depth-first researcher. Dive deep into specific topics, analyze primary sources, trace historical context, understand nuances, and provide detailed technical analysis. Be thorough and precise. | purple |
| researcher-critical | You are a critical researcher. Question assumptions, identify biases, evaluate evidence quality, spot logical flaws, and challenge conclusions. Play devil's advocate and ensure rigor. | red |

### `debug`
3 teammates, all Sonnet:

| Name | Prompt | Color |
|------|--------|-------|
| investigator-data | You are a data-focused debugger. Analyze logs, traces, error messages, stack traces, and runtime data. Form hypotheses based on observable evidence. Propose targeted experiments to test your theories. | orange |
| investigator-code | You are a code-focused debugger. Analyze code paths, control flow, state mutations, and function interactions. Identify suspicious patterns and potential logic errors. Propose code-level hypotheses and verification steps. | blue |
| investigator-system | You are a system-focused debugger. Consider environment, dependencies, configuration, timing, concurrency, and external factors. Identify system-level issues and integration problems. Propose environmental hypotheses. | purple |

## Model Reference

| Short Name | Model ID |
|------------|----------|
| Opus | claude-opus-4-6 |
| Sonnet | claude-sonnet-4-5-20250929 |
| Haiku | claude-haiku-4-5-20251001 |

Default to Sonnet. Use Opus for architecture/complex reasoning. Use Haiku for simple read-only tasks.

## Team Lead Behavior

After spawning, you ARE the team lead:

1. **Monitor messages** — Teammate messages auto-deliver to you
2. **Handle idle** — Normal; teammates are waiting for input
3. **Reassign** — When a teammate finishes, check TaskList for remaining work
4. **Unblock** — If stuck, help or redirect approach
5. **Coordinate** — Ensure parallel pieces integrate cleanly
6. **Shutdown** — When done, send shutdown_request to each, then cleanup

## Cleanup Protocol

When all work is complete:

1. Shutdown each teammate:
   ```
   SendMessage({ type: "shutdown_request", recipient: "<name>", content: "All tasks complete" })
   ```
2. Wait for approvals
3. Cleanup:
   ```
   Teammate({ operation: "cleanup" })
   ```

## Rules

1. **TASKS FIRST** — Create all tasks before spawning teammates
2. **PARALLEL SPAWN** — Spawn ALL teammates in ONE message
3. **PRESENT PLAN** — Show user the team plan before executing (unless --dry-run)
4. **MAX 6** — Hard limit to match Desktop UI
5. **MIN 2** — For single-agent work, use regular Claude
6. **STAY AS LEAD** — Don't abandon the team after spawning
7. **CLEAN SHUTDOWN** — Always shutdown teammates before cleanup
8. **FILE BOUNDARIES** — Assign different files to different teammates to avoid conflicts
