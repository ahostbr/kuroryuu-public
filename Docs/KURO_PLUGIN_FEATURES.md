# Kuro Plugin for Claude Code - Complete Feature Documentation

> **Version:** 1.0.2
> **Plugin Name:** kuro
> **Purpose:** Kuroryuu multi-agent orchestration CLI integration

---

## Overview

The Kuro plugin is a comprehensive Claude Code plugin that enables seamless integration with the Kuroryuu multi-agent orchestration system. It provides slash commands, skills, hooks, and agents for managing sessions, checkpoints, leader/worker coordination, and parallel task execution.

---

## Table of Contents

1. [Slash Commands](#slash-commands)
2. [Hooks](#hooks)
3. [Skills](#skills)
4. [Agents](#agents)
5. [MCP Tool Integration](#mcp-tool-integration)
6. [Multi-Agent Coordination](#multi-agent-coordination)
7. [Automation Scripts](#automation-scripts)
8. [Installation & Prerequisites](#installation--prerequisites)

---

## Slash Commands

### Session Management

#### `/k-start [role]`
**Description:** Start a Kuroryuu session and register the agent.

**Arguments:**
- `role` (optional): `leader` or `worker` (defaults to `worker`)

**What it does:**
1. Reads the appropriate bootstrap file (`KURORYUU_LEADER.md` or `KURORYUU_WORKER.md`)
2. Calls `k_session(action="start", ...)` MCP tool
3. Registers with Gateway at `http://127.0.0.1:8200/v1/agents/register`
4. Outputs confirmation: `KURORYUU-aware. Role: {role}. Session: {session_id}. Ready.`

---

#### `/k-status`
**Description:** Display comprehensive Kuroryuu session status.

**Shows:**
- Session ID, role, uptime
- Agents online (leader + workers)
- Inbox message counts
- Last checkpoint info
- Service health (MCP Core, Gateway, Desktop)

---

### Checkpoint Management

#### `/k-save [description]`
**Description:** Save a Kuroryuu checkpoint with optional worklog.

**Arguments:**
- `description` (optional): Description of the checkpoint

**What it does:**
1. Generates checkpoint metadata with timestamp
2. Calls `k_checkpoint(action="save", ...)`
3. Optionally writes worklog to `Docs/worklogs/`
4. Cross-references plan files, worklogs, and task IDs

**Cross-Reference Requirements:**
```json
{
  "plan_file": "Docs/Plans/xxx.md",
  "worklog_files": ["Docs/worklogs/..."],
  "task_ids": ["T001", "T002"]
}
```

---

#### `/k-load [checkpoint-id]`
**Description:** Load a Kuroryuu checkpoint to restore session state.

**Arguments:**
- `checkpoint-id` (optional): Specific checkpoint ID or loads latest

**What it does:**
1. Lists available checkpoints if ID not provided
2. Loads checkpoint payload
3. Extracts linked plan, worklog, and task references
4. Restores context for session continuation

---

### Role Configuration

#### `/k-leader`
**Description:** Configure as the LEADER agent in the multi-agent system.

**Leader Responsibilities:**
- Coordinate workers, not execute tasks directly
- Delegate work via `k_inbox`
- Ask humans for clarification (workers cannot)
- Guard the PRD as north star
- Monitor worker promises

**Leader Powers:**
- PTY operations (coordinate workers)
- Task orchestration endpoints
- Promise protocol monitoring

---

#### `/k-worker`
**Description:** Configure as a WORKER agent in the multi-agent system.

**Worker Responsibilities:**
- Execute tasks assigned by leader
- Report progress via promises
- Escalate blockers to leader
- Never ask humans directly

**Worker Loop:**
1. Poll inbox for new tasks
2. Claim task
3. Execute task
4. Report progress via promise
5. Complete task
6. Loop back

**Worker Restrictions:**
- Cannot ask humans questions directly
- Cannot create orchestration tasks
- Cannot override leader decisions

---

#### `/k-thinker`
**Description:** Configure as a THINKER agent for debates.

**Thinker Responsibilities:**
- Debate substantively with other thinkers
- Research using tools to support arguments
- Communicate via `k_thinker_channel`
- Converge toward synthesis

**Available Personas:**
| Persona | Focus |
|---------|-------|
| `visionary` | Expansive, future-oriented |
| `skeptic` | Critical, evidence-based |
| `pragmatist` | Feasibility-focused |
| `synthesizer` | Integration-focused |
| `devils_advocate` | Contrarian |
| `first_principles` | Foundational decomposition |
| `red_team` | Security adversary |
| `blue_team` | Security defense |
| `user_advocate` | User needs focused |
| `systems_thinker` | Holistic integration |

---

### Messaging

#### `/k-inbox [action] [args...]`
**Description:** Manage inbox messages for multi-agent coordination.

**Actions:**

| Action | Syntax | Description |
|--------|--------|-------------|
| `list` | `/k-inbox` or `/k-inbox list` | List new messages |
| `send` | `/k-inbox send <to> <subject> <body>` | Send message |
| `read` | `/k-inbox read <message_id>` | Read specific message |
| `claim` | `/k-inbox claim <message_id>` | Claim task |
| `complete` | `/k-inbox complete <message_id>` | Mark complete |

**Filters:**
- `status:new` - Unclaimed messages
- `status:claimed` - In-progress messages
- `to:me` - Messages for current agent
- `to:leader` - Messages for leader
- `priority:high` - High priority only

---

### Search & Memory

#### `/k-rag [query]`
**Description:** Search the Kuroryuu RAG (Retrieval Augmented Generation) index.

**What it does:**
1. Searches indexed codebase for relevant context
2. Returns source files, relevance scores, and content snippets
3. Supports filters by file type, path, etc.

**Advanced Options:**
- `top_k` - Number of results (default: 5)
- `filters` - Filter by file type, path, etc.
- `threshold` - Minimum relevance score

**Index Management:**
```
k_rag(action="index", paths=["src/", "apps/"])
```

---

#### `/k-rag-interactive [on|off|status]`
**Description:** Toggle human-in-the-loop RAG result filtering.

**When enabled:**
1. All `k_rag` queries redirect to `query_interactive`
2. Results shown with numbered options
3. User selects which results to keep
4. Only selected results fed back to Claude

---

#### `/k-memory [key] [value]`
**Description:** Read/write to Kuroryuu working memory for cross-session persistence.

**Operations:**
- No args: List all memory keys
- Key only: Read that key's value
- Key + value: Write value to key

**Common Keys:**
- `current_task` - What you're working on
- `blockers` - Current blockers
- `decisions` - Important decisions made
- `context` - Session context summary

---

### Tool Discovery

#### `/k-mcptoolsearch [query]`
**Description:** Find and execute the right MCP tool based on natural language.

**Usage Modes:**

1. **Execute Mode (Default):**
```python
k_MCPTOOLSEARCH(
    query="search for code patterns",
    params={"query": "async function", "top_k": 10}
)
```

2. **Discovery Mode:**
```python
k_MCPTOOLSEARCH(
    query="find files in directory",
    execute=False,
    top_k=3
)
```

**Tool Categories:**
- `search`: k_rag (code search)
- `analysis`: k_repo_intel (symbols, routes, deps)
- `files`: k_files (read, write, list)
- `persistence`: k_checkpoint (save/load state)
- `messaging`: k_inbox, k_thinker_channel
- `lifecycle`: k_session (agent lifecycle)
- `state`: k_memory (working memory)
- `terminal`: k_pty (PTY control)
- `browser`: k_browser (Chrome automation)
- `capture`: k_capture (screen recording)
- `learning`: k_collective (pattern sharing)

---

### Parallelism

#### `/max-parallel`
**Description:** Activate maximum parallelism mode for aggressive task decomposition and parallel agent spawning.

**Behavior Changes:**
1. Analyze current task or last user request
2. Decompose into ALL subtasks
3. Map dependencies between tasks
4. Spawn agents in parallel for independent work

**Execution Pattern:**
```
Wave 1 (parallel): All tasks with no blockers
Wave 2 (parallel): Tasks blocked only by Wave 1
Wave 3+: Continue pattern
```

**Model Selection:**
| Task Complexity | Model |
|-----------------|-------|
| File finding, globbing, simple grep | haiku |
| Code reading, analysis | sonnet |
| Complex reasoning, architecture | opus |

**Iron Law:**
> If tasks are independent, they MUST run in parallel.
> Sequential execution of independent tasks is a bug.

---

## Hooks

The Kuro plugin uses hooks to automate workflows at various lifecycle events.

### PreToolUse Hooks

#### Edit Confirmation Hook
**Matcher:** `Write|Edit`
**Script:** `confirm-edits.ps1`
**Purpose:** Validates file edits before execution

#### RAG Interactive Gate
**Matcher:** `mcp__kuroryuu__k_rag`
**Script:** `rag-interactive-gate.ps1`
**Purpose:** Redirects RAG queries to interactive mode when enabled

---

### SessionStart Hook
**Matcher:** `*` (all sessions)
**Type:** Prompt-based

**What it does:**
1. Instructs Claude to read `KURORYUU_BOOTSTRAP.md`
2. Determine leader/worker role
3. Call `k_session(action="start", ...)`
4. Register with Gateway
5. Output confirmation

---

### Stop Hook
**Matcher:** `*` (all sessions)
**Purpose:** Ensure work is checkpointed before stopping

**Components:**
1. **Prompt Hook:** Verifies context usage and checkpoint status
2. **Export Hook:** Runs `export-transcript.ps1` to backup session

---

### UserPromptSubmit Hook
**Triggers on:** Every user prompt

**Scripts executed:**
1. `check-inbox.ps1` - Check for pending messages
2. `export-transcript.ps1` - Backup transcript

---

### PostToolUse Hook
**Matcher:** `TaskCreate|TaskUpdate`
**Script:** `sync-claude-task.ps1`

**What it does:**
- Syncs Claude Code TaskCreate/TaskUpdate to `ai/todo.md`
- Creates task entries in `## Claude Tasks` section
- Maps Claude task IDs to Kuroryuu T### format
- Marks tasks `[x]` when completed with timestamps
- Maintains bidirectional cross-references

---

## Skills

### kuroryuu-patterns
**Description:** Comprehensive guide to Kuroryuu patterns, MCP tools, and multi-agent coordination.

**Triggers when user asks about:**
- "Kuroryuu bootstrap"
- "multi-agent coordination"
- "leader worker pattern"
- "promise protocol"
- "k_ tools"
- "how does Kuroryuu work"

**Contains:**
- Quick reference index
- MCP tools reference
- Architecture document locations
- Core concepts (role hierarchy, session lifecycle, promise protocol)
- Common workflows with examples

**Reference Files:**
- `references/tool-patterns.md` - Detailed MCP tool usage
- `references/orchestration-patterns.md` - Multi-agent patterns

---

### max-parallel
**Description:** Maximum parallelism patterns for task decomposition.

**Triggers when user says:**
- "do this in parallel"
- "spawn multiple agents"
- "maximize parallelism"
- "work faster"
- "parallelize this"

**Provides:**
- Wave-based execution patterns
- Dependency mapping techniques
- Model selection guidelines
- Anti-patterns to avoid

---

## Agents

The plugin includes specialized agents for different tasks:

### kuroryuu-explorer
**Model:** haiku
**Purpose:** Fast, read-only codebase exploration

**Tools:** k_session, k_files, k_rag, k_repo_intel

**Best for:**
- Searching for code patterns
- Understanding file structure
- Finding relevant documentation
- Answering "where is X?" questions

---

### kuroryuu-explorer-opus
**Model:** opus
**Purpose:** Deep, thorough read-only research with advanced reasoning

**Use when:**
- Complex architectural analysis needed
- Multi-faceted investigation required
- Thorough understanding needed

---

### PRD Workflow Agents

| Agent | Purpose |
|-------|---------|
| `prd-generator` | Generate Product Requirements Documents |
| `prd-primer` | Load project context and prepare for task execution |
| `prd-executor` | Execute single implementation steps from a plan |
| `prd-reviewer` | Review implementation against acceptance criteria |
| `prd-code-reviewer` | Technical code review for quality and bugs |
| `prd-validator` | Final validation before marking task complete |
| `prd-reporter` | Generate execution reports after task completion |
| `prd-system-reviewer` | Review process and plan adherence |
| `prd-hackathon-finalizer` | Hackathon project finalization and verification |

---

## MCP Tool Integration

The plugin integrates with 16 Kuroryuu MCP tools providing 118 total actions:

| Tool | Actions | Key Capabilities |
|------|---------|------------------|
| `k_rag` | 12 | query, index, status, hybrid, semantic, agentic search |
| `k_pty` | 12 | list, term_read, send_line, talk, resolve, spawn_cli |
| `k_inbox` | 8 | send, list, claim, complete, stats |
| `k_capture` | 8 | start, stop, screenshot, poll, get_latest |
| `k_pccontrol` | 8 | click, type, launch, find_element (OPT-IN) |
| `k_session` | 7 | start, end, log, context |
| `k_memory` | 7 | get, set_goal, add_blocker, set_steps |
| `k_graphiti_migrate` | 6 | status, migrate, rollback, verify |
| `k_collective` | 6 | record_success, record_failure, query_patterns |
| `k_repo_intel` | 5 | get, run, status, list (routes, hooks, symbol_map, todos) |
| `k_files` | 5 | read, write, list, delete |
| `k_checkpoint` | 4 | save, load, list, delete |
| `k_thinker_channel` | 3 | send_line, read, list |
| `k_MCPTOOLSEARCH` | 2 | search, list |
| `k_help` | - | Help system |

---

## Multi-Agent Coordination

### Promise Protocol

Workers communicate status to leaders using promise tags:

| Promise Tag | Meaning | Leader Action |
|-------------|---------|---------------|
| `<promise>DONE</promise>` | Task complete | Verify and finalize |
| `<promise>PROGRESS:N%</promise>` | Partial progress | Wait for more iterations |
| `<promise>BLOCKED:reason</promise>` | External blocker | Investigate, clarify |
| `<promise>STUCK:reason</promise>` | Can't proceed | Send hint via leader_nudge.md |

### Leader Delegation Pattern
```
Leader                                    Worker
  │                                         │
  ├─── k_inbox(send, task) ───────────────►│
  │                                         │
  │◄── <promise>PROGRESS:25%</promise> ────┤
  │◄── <promise>PROGRESS:50%</promise> ────┤
  │◄── <promise>DONE</promise> ────────────┤
  │                                         │
  ├─── Verify completion ──────────────────►│
```

### Parallel Worker Pattern
```
Leader
  │
  ├─── spawn_cli(worker) ──► Worker 1
  ├─── spawn_cli(worker) ──► Worker 2
  ├─── spawn_cli(worker) ──► Worker 3
  │
  ├─── k_inbox(send, task1) ──► Worker 1
  ├─── k_inbox(send, task2) ──► Worker 2
  ├─── k_inbox(send, task3) ──► Worker 3
  │
  │◄── Collect all DONE promises
  └─── Finalize
```

### Thinker Debate Pattern
Leaders can spawn thinker debates for multi-perspective analysis:

| Use Case | Pair | Purpose |
|----------|------|---------|
| Feature ideation | visionary + skeptic | Balance innovation with critique |
| Security review | red_team + blue_team | Adversarial testing |
| Architecture | first_principles + systems_thinker | Deep analysis |
| UX decisions | user_advocate + pragmatist | User focus + feasibility |

---

## Automation Scripts

Located in `.claude/plugins/kuro/scripts/`:

| Script | Hook | Purpose |
|--------|------|---------|
| `sync-claude-task.ps1` | PostToolUse | Sync TaskCreate/TaskUpdate to ai/todo.md |
| `check-inbox.ps1` | UserPromptSubmit | Check for pending inbox messages |
| `export-transcript.ps1` | Stop, UserPromptSubmit | Backup conversation transcript |
| `confirm-edits.ps1` | PreToolUse | Validate file edits |
| `rag-interactive-gate.ps1` | PreToolUse | Gate RAG queries for interactive mode |
| `rag-interactive-toggle.ps1` | Command | Toggle interactive RAG mode |
| `reindex-transcripts.ps1` | Manual | Reindex all transcripts to RAG |
| `backport-transcripts.ps1` | Manual | Backport old transcript format |

---

## Installation & Prerequisites

### Prerequisites

1. **Kuroryuu Stack Running:**
```powershell
cd <PROJECT_ROOT>
.\run_all.ps1
```

2. **MCP Server Connected:**
```bash
claude mcp add kuroryuu http://127.0.0.1:8100/mcp
claude mcp list  # Verify connection
```

3. **Gateway Available:**
- Check: http://127.0.0.1:8200/v1/health

### Installation Options

**Option 1: User Plugins (Recommended)**
Already installed at `~/.claude/plugins/kuro`

**Option 2: Project-Specific**
Copy to your project's `.claude-plugin` directory.

**Option 3: CLI Flag**
```bash
cc --plugin-dir ~/.claude/plugins/kuro
```

---

## File Locations

| Item | Location |
|------|----------|
| Checkpoints | `ai/checkpoints/` |
| Worklogs | `Docs/worklogs/` |
| RAG Index | `ai/rag_index/` |
| Working Memory | `WORKING/memory/` |
| Inbox | `ai/inbox/` |
| Tasks | `ai/todo.md` |
| Sessions | `ai/sessions.json` |
| Hooks Config | `ai/hooks.json` |

---

## Quick Start

1. **Start session:**
```
/k-start leader
```

2. **Work on tasks...**

3. **Save progress:**
```
/k-save Implemented user authentication
```

4. **Check status:**
```
/k-status
```

5. **Search codebase:**
```
/k-rag how does authentication work
```

6. **Delegate to worker:**
```
/k-inbox send worker-1 "Implement feature" "Details..."
```

---

## Troubleshooting

### MCP Tools Unavailable
1. Start the stack: `.\run_all.ps1`
2. Check MCP connection: `claude mcp list`
3. Re-add MCP server if needed

### Gateway Unavailable
1. Check health: http://127.0.0.1:8200/v1/health
2. Start the stack: `.\run_all.ps1`
3. Check logs in `apps/gateway/`

### Session Lost
1. List checkpoints: `/k-load` (shows recent)
2. Load specific: `/k-load cp_20260112_143000`
3. Resume from restored context

### Worker Reconnection After /compact
1. Load checkpoint: `/loadnow`
2. Restart k_session with checkpoint's agent_id
3. Re-register PTY with MCP Core

---

## Related Documentation

- `KURORYUU_BOOTSTRAP.md` - Session start procedure
- `KURORYUU_LEADER.md` - Leader protocol
- `KURORYUU_WORKER.md` - Worker protocol
- `KURORYUU_LAWS.md` - Operational rules
- `Docs/Plans/LEADER_FOLLOWER_ARCHITECTURE.md` - System design
