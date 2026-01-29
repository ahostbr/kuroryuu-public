# Kuro - Kuroryuu CLI Plugin

A comprehensive Claude Code plugin for Kuroryuu multi-agent orchestration.

## Overview

Kuro provides slash commands, skills, and hooks for seamless integration between Claude Code and the Kuroryuu multi-agent system. It automates session management, checkpointing, and leader/worker coordination.

## Features

### Commands

| Command | Description |
|---------|-------------|
| `/k-start [role]` | Start Kuroryuu session and register agent |
| `/k-save [description]` | Save checkpoint with optional worklog |
| `/k-load [checkpoint-id]` | Load checkpoint to restore state |
| `/k-leader` | Setup as leader agent |
| `/k-worker` | Setup as worker agent |
| `/k-inbox [action] [args]` | Manage inbox messages |
| `/k-rag [query]` | Search RAG index |
| `/k-memory [key] [value]` | Read/write working memory |
| `/k-status` | Show session status |

### Skills

- **kuroryuu-patterns** - Comprehensive guide to Kuroryuu patterns, MCP tools, and multi-agent coordination

### Hooks

- **SessionStart** - Automatically initializes Kuroryuu session
- **Stop** - Prompts checkpoint save if significant work was done

## Installation

### Option 1: User Plugins (Recommended)

Already installed at `~/.claude/plugins/kuro`

### Option 2: Project-Specific

Copy to your project's `.claude-plugin` directory.

### Option 3: CLI Flag

```bash
cc --plugin-dir ~/.claude/plugins/kuro
```

## Prerequisites

1. **Kuroryuu Stack Running**
   ```powershell
   cd <PROJECT_ROOT>
   .\run_all.ps1
   ```

2. **MCP Server Connected**
   ```bash
   claude mcp add kuroryuu http://127.0.0.1:8100/mcp
   claude mcp list  # Verify connection
   ```

3. **Gateway Available**
   - Check: http://127.0.0.1:8200/health

## Quick Start

1. Start session:
   ```
   /k-start leader
   ```

2. Work on tasks...

3. Save progress:
   ```
   /k-save Implemented user authentication
   ```

4. Check status:
   ```
   /k-status
   ```

## Integration Modes

### MCP Tools (Primary)

Commands use Kuroryuu MCP tools directly:
- `k_session` - Session management
- `k_checkpoint` - State persistence
- `k_inbox` - Message queue
- `k_rag` - Semantic search
- `k_memory` - Working memory

### Gateway HTTP (Fallback)

When MCP unavailable, commands fall back to Gateway HTTP endpoints:
- `http://127.0.0.1:8200/v1/...`

## Multi-Agent Workflow

### Leader Role

```
/k-leader
```

Leaders can:
- Spawn and control worker PTYs
- Ask humans questions
- Create and delegate tasks
- Monitor worker progress

### Worker Role

```
/k-worker
```

Workers:
- Poll inbox for tasks
- Execute assigned work
- Report progress via promises
- Escalate blockers to leader

### Promise Protocol

Workers report status using promise tags:
- `<promise>DONE</promise>` - Task complete
- `<promise>PROGRESS:N%</promise>` - In progress
- `<promise>BLOCKED:reason</promise>` - External blocker
- `<promise>STUCK:reason</promise>` - Need leader help

## File Locations

| Item | Location |
|------|----------|
| Checkpoints | `ai/checkpoints/` |
| Worklogs | `Docs/worklogs/` |
| RAG Index | `ai/rag_index/` |
| Working Memory | `WORKING/memory/` |
| Inbox | `WORKING/inbox/` |

## Troubleshooting

### MCP Tools Unavailable

1. Start the stack: `.\run_all.ps1`
2. Check MCP connection: `claude mcp list`
3. Re-add MCP server if needed

### Gateway Unavailable

1. Check health: http://127.0.0.1:8200/health
2. Start the stack: `.\run_all.ps1`
3. Check logs in `apps/gateway/`

### Session Lost

1. List checkpoints: `/k-load` (shows recent)
2. Load specific: `/k-load cp_20260112_143000`
3. Resume from restored context

## Development

### Plugin Structure

```
kuro/
├── .claude-plugin/
│   └── plugin.json
├── commands/
│   ├── k-start.md
│   ├── k-save.md
│   ├── k-load.md
│   ├── k-leader.md
│   ├── k-worker.md
│   ├── k-inbox.md
│   ├── k-rag.md
│   ├── k-memory.md
│   └── k-status.md
├── skills/
│   └── kuroryuu-patterns/
│       ├── SKILL.md
│       └── references/
│           ├── tool-patterns.md
│           └── orchestration-patterns.md
├── hooks/
│   └── hooks.json
└── README.md
```

### Related Documentation

- `KURORYUU_BOOTSTRAP.md` - Session start procedure
- `KURORYUU_LEADER.md` - Leader protocol
- `KURORYUU_WORKER.md` - Worker protocol
- `KURORYUU_LAWS.md` - Operational rules

## License

Part of the Kuroryuu project.
