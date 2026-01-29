# Project Structure Rules

## Project Root
`<PROJECT_ROOT>` - THIS is home. All paths relative to here.

## Directory Structure
```
<PROJECT_ROOT>/                 <- PROJECT ROOT
├── apps/
│   ├── gateway/                <- Python FastAPI gateway (port 8200)
│   ├── web/                    <- Next.js web UI (port 3000)
│   └── desktop/                <- Electron desktop app
├── ai/                         <- Harness files (system state only)
│   ├── hooks.json              <- Kuroryuu hooks config
│   ├── todo.md                 <- Source of truth for tasks
│   ├── sessions.json           <- Session registry
│   ├── checkpoints/            <- Agent checkpoints
│   ├── prompts/                <- Prompt templates
│   │   ├── workflows/          <- Workflow prompts
│   │   ├── leader/             <- Leader prompts
│   │   ├── worker/             <- Worker prompts
│   │   ├── phases/             <- Phase prompts
│   │   └── models/             <- Model system prompts
│   ├── formulas/               <- Multi-step workflow definitions (TOML)
│   ├── reports/                <- Execution reports
│   └── reviews/                <- Code/system reviews
├── .claude/                    <- Claude Code config (HERE only)
├── .vscode/                    <- VSCode settings
├── Docs/                       <- Documentation
│   ├── DEVLOG.md               <- Development history
│   ├── Plans/                  <- Implementation plans
│   ├── Architecture/           <- Architecture docs
│   ├── Guides/                 <- User/dev guides
│   └── worklogs/               <- Session worklogs
└── CLAUDE.md                   <- Claude memory file
```

## .claude Directory
ONLY exists at project root: `<PROJECT_ROOT>/.claude/`

If you find yourself creating `.claude/` anywhere else, STOP. You're in the wrong directory.
