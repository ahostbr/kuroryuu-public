---
description: Spawn a Claude Agent Team to collaboratively work on a task
argument-hint: [task description] or [--template code-review|feature-dev|research|debug|prd-workflow|thinker-debate|security-audit|quality-review]
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
| `--pairing <a>+<b>` | Thinker pairing for thinker-debate (e.g., `red_team+blue_team`) |
| Plain text | Task description to decompose |

**Examples:**
- `/k-spawnteam refactor the auth module into separate services`
- `/k-spawnteam --template code-review review the recent PRs`
- `/k-spawnteam --count 4 build a comprehensive test suite`
- `/k-spawnteam --template feature-dev --dry-run add dark mode`
- `/k-spawnteam --template prd-workflow implement user authentication`
- `/k-spawnteam --template thinker-debate should we use PostgreSQL or MongoDB`
- `/k-spawnteam --template thinker-debate --pairing red_team+blue_team review auth security`
- `/k-spawnteam --template security-audit review the auth module`
- `/k-spawnteam --template quality-review audit the API layer`

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

## Prompt Pack Loading

For templates that reference prompt pack files (`prd-workflow`, `thinker-debate`, `security-audit`, `quality-review`, and enriched `code-review`/`feature-dev`), load prompts BEFORE spawning:

1. **Read** the prompt pack file(s) using the Read tool
2. **Strip YAML frontmatter** — everything between the first pair of `---` lines is metadata, not instructions
3. **For thinkers:** concatenate base + persona (thinker prompts use k_pty/k_inbox natively — do NOT modify those references)
4. **Use the resulting text** as the teammate's `prompt` parameter in the Task() spawn call

**Example for thinker-debate:**
1. Read `ai/prompt_packs/thinkers/_base_thinker.md` → base_content
2. Read `ai/prompt_packs/thinkers/visionary.md` → persona_content
3. Compose: base_content + "\n\n" + persona_content
4. Pass composed text as `prompt` to Task() spawn call

**Example for specialist:**
1. Read `ai/prompt_packs/specialists/security_auditor.md` → content
2. Strip frontmatter
3. Pass content as `prompt` to Task() spawn call

## Templates

Built-in team configurations. Templates marked with **[prompt-pack]** load rich prompts from `ai/prompt_packs/`.

### `code-review` **[prompt-pack enriched]**
3 teammates, all Sonnet:

| Name | Prompt Source | Color |
|------|-------------|-------|
| security-reviewer | Read from `ai/prompt_packs/specialists/security_auditor.md`. Fallback: "You are a security-focused code reviewer. Analyze code for security vulnerabilities, unsafe patterns, input validation issues, authentication/authorization flaws, and potential exploits. Provide actionable security recommendations." | red |
| performance-reviewer | You are a performance-focused code reviewer. Analyze code for performance bottlenecks, inefficient algorithms, memory leaks, unnecessary computations, and optimization opportunities. Suggest performance improvements with measurable impact. | orange |
| test-reviewer | You are a testing-focused code reviewer. Analyze code for test coverage gaps, edge cases, missing assertions, brittle tests, and testing best practices. Recommend test improvements and new test cases. | green |

**Loading:** Before spawning, read `ai/prompt_packs/specialists/security_auditor.md`. If the file exists and is non-empty, use its content (minus frontmatter) as security-reviewer's prompt. If it doesn't exist, use the fallback text.

### `feature-dev` **[prompt-pack enriched]**
4 teammates (1 Opus + 3 Sonnet):

| Name | Model | Prompt Source | Color |
|------|-------|-------------|-------|
| architect | Opus (plan-mode) | You are the feature architect. Design high-level architecture, define interfaces, plan data models, identify technical risks, and create implementation roadmaps. Always work in plan mode before implementation. | purple |
| implementer-1 | Sonnet | Read from `ai/prompt_packs/workflow_specialists/prd_executor.md` for rich context, then append: "Focus on server-side logic, API endpoints, database operations, business logic, and backend services." Fallback: "You are a backend implementer. Focus on server-side logic, API endpoints, database operations, business logic, and backend services. Write clean, maintainable, well-tested code." | blue |
| implementer-2 | Sonnet | You are a frontend implementer. Focus on UI components, state management, user interactions, accessibility, and frontend integration. Write clean, maintainable, well-tested code. | cyan |
| reviewer | Sonnet | You are the code reviewer. Review all implementations for correctness, consistency, best practices, edge cases, and integration issues. Ensure code quality and alignment with architecture. | green |

**Loading:** Before spawning, read `ai/prompt_packs/workflow_specialists/prd_executor.md`. If it exists, use its content (minus frontmatter) as base for implementer-1's prompt, appending the backend focus instruction. If it doesn't exist, use the fallback text.

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

### `prd-workflow` **[prompt-pack]**
4 teammates, sequential pipeline (primer → executor → reviewer → validator):

| Name | Model | Prompt Source | Color | Dependencies |
|------|-------|-------------|-------|-------------|
| primer | Haiku | `ai/prompt_packs/workflow_specialists/prd_primer.md` | blue | none |
| executor | Sonnet | `ai/prompt_packs/workflow_specialists/prd_executor.md` | green | primer |
| reviewer | Sonnet | `ai/prompt_packs/workflow_specialists/prd_reviewer.md` | orange | executor |
| validator | Sonnet | `ai/prompt_packs/workflow_specialists/prd_validator.md` | red | reviewer |

**Loading:** Read all 4 prompt pack files before spawning. Strip YAML frontmatter from each. Use the content as each teammate's prompt.

**Task dependencies:** Create tasks with `addBlockedBy` to enforce the pipeline:
- primer's task: no blockers
- executor's task: blocked by primer's task
- reviewer's task: blocked by executor's task
- validator's task: blocked by reviewer's task

### `thinker-debate` **[prompt-pack]**
2 teammates, structured debate format:

| Name | Model | Prompt Source | Color |
|------|-------|-------------|-------|
| thinker-a | Sonnet | `_base_thinker.md` + persona-a `.md` | purple |
| thinker-b | Sonnet | `_base_thinker.md` + persona-b `.md` | red |

**Default pairing:** visionary + skeptic (innovation refinement)

**Custom pairing via `--pairing`:** Parse `--pairing <a>+<b>` from arguments. Valid persona names (from `ai/prompt_packs/thinkers/`):
- `visionary`, `skeptic`, `pragmatist`, `red_team`, `blue_team`
- `first_principles`, `systems_thinker`, `devils_advocate`, `user_advocate`, `synthesizer`

**Recommended pairings:**
- `visionary+skeptic` — innovation refinement (default)
- `visionary+pragmatist` — vision to execution
- `red_team+blue_team` — security review
- `first_principles+systems_thinker` — deep analysis
- `devils_advocate+visionary` — stress testing
- `user_advocate+pragmatist` — feature design
- `skeptic+synthesizer` — conflict resolution

**Loading:**
1. Read `ai/prompt_packs/thinkers/_base_thinker.md` → base
2. Read `ai/prompt_packs/thinkers/{persona_a}.md` → persona_a_content
3. Read `ai/prompt_packs/thinkers/{persona_b}.md` → persona_b_content
4. Compose thinker-a prompt: base + "\n\n" + persona_a_content
5. Compose thinker-b prompt: base + "\n\n" + persona_b_content
6. Strip YAML frontmatter from each file before concatenating

**Task setup:** Create a single shared debate task assigned to both thinkers. The task description should contain the debate topic from the user's input.

### `security-audit` **[prompt-pack]**
3 teammates for security review:

| Name | Model | Prompt Source | Color |
|------|-------|-------------|-------|
| red-team | Sonnet | `_base_thinker.md` + `red_team.md` | red |
| blue-team | Sonnet | `_base_thinker.md` + `blue_team.md` | blue |
| security-auditor | Sonnet | `ai/prompt_packs/specialists/security_auditor.md` | orange |

**Loading:**
1. Read `ai/prompt_packs/thinkers/_base_thinker.md` → base
2. Read `ai/prompt_packs/thinkers/red_team.md` → red_content
3. Read `ai/prompt_packs/thinkers/blue_team.md` → blue_content
4. Read `ai/prompt_packs/specialists/security_auditor.md` → auditor_content
5. Compose red-team prompt: base + "\n\n" + red_content
6. Compose blue-team prompt: base + "\n\n" + blue_content
7. Use auditor_content (minus frontmatter) as security-auditor's prompt

**Task setup:** Create 3 tasks — red-team attack surface analysis, blue-team defense review, security-auditor comprehensive audit. The auditor task should be blocked by both red-team and blue-team tasks.

### `quality-review` **[prompt-pack]**
3 teammates from specialists:

| Name | Model | Prompt Source | Color |
|------|-------|-------------|-------|
| security-auditor | Sonnet | `ai/prompt_packs/specialists/security_auditor.md` | red |
| perf-optimizer | Sonnet | `ai/prompt_packs/specialists/performance_optimizer.md` | orange |
| test-generator | Sonnet | `ai/prompt_packs/specialists/test_generator.md` | green |

**Loading:** Read all 3 specialist files. Strip YAML frontmatter. Use content as each teammate's prompt.

**Task setup:** Create 3 parallel tasks (no dependencies) — one for each specialist focused on their domain.

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
