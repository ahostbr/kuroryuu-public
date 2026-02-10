# GitHub Copilot Coding Agent — How It Works

> **URL:** `https://github.com/ahostbr/kuroryuu-public/agents?author=ahostbr`

This document explains how the GitHub Copilot Coding Agent operates when running in the browser via the GitHub Agents interface, and how Kuroryuu configures itself to work with it.

---

## Overview

The **GitHub Copilot Coding Agent** is a cloud-hosted AI agent that GitHub runs on your behalf. When you assign it to an issue or ask it to perform a task via the `/agents` UI, GitHub spins up a sandboxed environment with a fresh clone of your repository, and the agent reads your repository's configuration files to understand how to work with your codebase.

The agent visible at `https://github.com/ahostbr/kuroryuu-public/agents?author=ahostbr` shows all coding agent sessions (runs) that have been triggered for this repository.

---

## How a Session Is Triggered

There are several ways to trigger a Copilot Coding Agent session:

| Trigger | How |
|---------|-----|
| **Assign to Issue** | Assign `@copilot` (or Copilot) to a GitHub Issue — the agent creates a PR with a proposed fix |
| **Issue Comment** | Comment `@github-copilot` on an issue to ask the agent to work on it |
| **PR Review Feedback** | The agent can respond to review comments and iterate on changes |
| **Manual via Agents UI** | Use the Agents tab (`/agents`) to start a new session directly |

Once triggered, GitHub provisions a cloud VM, clones the repository, and runs the agent.

---

## Bootstrap Chain

When the Copilot Coding Agent starts in its sandboxed environment, it reads configuration files from the repository in a specific order. Kuroryuu configures this chain:

```
┌──────────────────────────────────────────────────────────────────┐
│                   BOOTSTRAP CHAIN                                │
│                                                                  │
│  1. .github/copilot-instructions.md                              │
│     └─► "Read KURORYUU_BOOTSTRAP.md"                             │
│                                                                  │
│  2. KURORYUU_BOOTSTRAP.md  (project root)                        │
│     └─► Quick-start, tool reference, search priority,            │
│         use-case flows, canonical file locations                 │
│                                                                  │
│  3. CLAUDE.md  (project root — loaded via custom instructions)   │
│     └─► Task tracking rules, checkpoint rules,                   │
│         cross-reference rules, search priority                   │
│                                                                  │
│  4. AGENTS.md  (project root)                                    │
│     └─► Same redirect: "Read KURORYUU_BOOTSTRAP.md"              │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

### File Roles

| File | Purpose | Read By |
|------|---------|---------|
| `.github/copilot-instructions.md` | GitHub Copilot's native instructions file — tells the agent to read `KURORYUU_BOOTSTRAP.md` | Copilot Coding Agent |
| `KURORYUU_BOOTSTRAP.md` | Comprehensive agent bootstrap: search priority, tool reference, use-case flows, file locations | All agents (Copilot, Claude, Cursor, Cline, etc.) |
| `CLAUDE.md` | Claude Code / Copilot custom instructions: task tracking, checkpoints, cross-references | Claude Code, Copilot (via custom instructions) |
| `AGENTS.md` | OpenAI Codex / generic agent entry point — redirects to bootstrap | Codex, generic agents |

---

## MCP Server Configuration

The file `.github/mcp.json` declares MCP (Model Context Protocol) servers available to the agent:

```json
{
  "mcpServers": {
    "kuroryuu": {
      "url": "http://127.0.0.1:8100/mcp",
      "description": "Kuroryuu MCP Core - Session management, file operations, working memory, inbox, checkpoints, RAG, PTY control, and capture tools"
    }
  }
}
```

**In the cloud environment**, the MCP Core server at `127.0.0.1:8100` is **not running** (it requires the local Kuroryuu stack). The agent gracefully degrades — it uses GitHub's built-in tools (file read/write, bash, search, GitHub API) instead of Kuroryuu's 15 MCP tools.

**Locally**, when running with the full Kuroryuu stack (`.\run_all.ps1`), the MCP server provides 15 tools with 107+ routed actions (RAG search, PTY control, inbox, checkpoints, etc.).

---

## What the Agent Can Do (Cloud Environment)

When running via GitHub's cloud infrastructure, the Copilot Coding Agent has access to:

| Capability | Details |
|------------|---------|
| **File Operations** | Read, create, edit files in the repository clone |
| **Bash Shell** | Execute commands (build, test, lint) in a Linux sandbox |
| **Code Search** | grep, glob, ripgrep for finding code patterns |
| **GitHub API** | List issues, PRs, workflows, read CI logs, search code |
| **Browser Automation** | Playwright for web testing and screenshots |
| **Git Operations** | View diffs, commits, branches (push via `report_progress` tool) |
| **Sub-agents** | Spawn specialized agents (explore, task, general-purpose) |
| **Code Review** | Automated review of proposed changes |
| **Security Scanning** | CodeQL analysis and GitHub Advisory DB checks |

The agent **cannot**:
- Access the local Kuroryuu MCP server (k_rag, k_pty, k_inbox, etc.)
- Run Windows-specific tools (PowerShell, Win32 APIs)
- Push directly via git (uses `report_progress` tool instead)
- Access the Kuroryuu Desktop application

---

## Typical Agent Session Flow

```
1. GitHub triggers agent (issue assignment, comment, etc.)
       │
       ▼
2. Cloud VM provisioned with fresh repo clone
       │
       ▼
3. Agent reads .github/copilot-instructions.md
       │  └─► Learns to read KURORYUU_BOOTSTRAP.md
       │
       ▼
4. Agent reads KURORYUU_BOOTSTRAP.md + CLAUDE.md
       │  └─► Understands project structure, tools, conventions
       │
       ▼
5. Agent explores codebase (grep, glob, view files)
       │
       ▼
6. Agent creates a plan (report_progress with checklist)
       │
       ▼
7. Agent makes changes (edit files, run tests, lint)
       │
       ▼
8. Agent commits & pushes via report_progress
       │
       ▼
9. Agent runs code_review + codeql_checker
       │
       ▼
10. PR is created/updated with the changes
```

---

## The `/agents` UI

The URL `https://github.com/ahostbr/kuroryuu-public/agents?author=ahostbr` shows:

- **Active sessions** — agents currently running
- **Completed sessions** — past agent runs with their results
- **Session details** — click into a session to see the agent's conversation, tool calls, and file changes
- **Filter by author** — `?author=ahostbr` filters to sessions triggered by that user

Each session corresponds to a branch (e.g., `copilot/fix-issue-42`) and typically results in a pull request.

---

## How Kuroryuu Supports Multiple AI Agent Platforms

Kuroryuu provides bootstrap files for 8+ AI coding tools, all following the same pattern — redirect to `KURORYUU_BOOTSTRAP.md`:

| Platform | Config File | Entry Point |
|----------|-------------|-------------|
| **GitHub Copilot** | `.github/copilot-instructions.md` | → `KURORYUU_BOOTSTRAP.md` |
| **Claude Code** | `CLAUDE.md` | Direct + → `KURORYUU_BOOTSTRAP.md` |
| **Cursor** | `.cursorrules` | → `KURORYUU_BOOTSTRAP.md` |
| **Cline** | `.Cline/Rules/.clinerules00-kuroryuu.md` | → `KURORYUU_BOOTSTRAP.md` |
| **Windsurf** | `.windsurfrules` | → `KURORYUU_BOOTSTRAP.md` |
| **OpenAI Codex** | `AGENTS.md` | → `KURORYUU_BOOTSTRAP.md` |
| **Kiro** | `.kiro/steering/` | Direct integration |

This unified bootstrap approach means every agent — whether running in GitHub's cloud, locally in an IDE, or in the Kuroryuu Desktop — gets the same project knowledge and conventions.

---

## Relationship to Kuroryuu's Local Agent System

The GitHub Copilot Coding Agent runs **independently** from Kuroryuu's local multi-agent system:

| Aspect | Local (Kuroryuu Desktop) | Cloud (GitHub Copilot) |
|--------|--------------------------|------------------------|
| **Runtime** | Windows desktop + Electron | GitHub cloud VM (Linux) |
| **MCP Tools** | 15 tools, 107+ actions | Not available |
| **Agent Mesh** | Leader/Worker/Thinker PTY mesh | Single agent |
| **Communication** | k_pty, k_inbox inter-agent messaging | GitHub API only |
| **Persistence** | Checkpoints, sessions, worklogs | Git commits + PR |
| **Models** | 61+ via 6 providers | GitHub Copilot model |
| **Bootstrap** | Same `KURORYUU_BOOTSTRAP.md` | Same `KURORYUU_BOOTSTRAP.md` |

The key insight is that **the bootstrap files are shared** — the same project knowledge that powers Kuroryuu's local multi-agent orchestration also guides the GitHub Copilot Coding Agent in the cloud.

---

## Summary

The GitHub Copilot Coding Agent at `/agents` works by:

1. **Triggering** — via issue assignment, comments, or the Agents UI
2. **Bootstrapping** — reading `.github/copilot-instructions.md` → `KURORYUU_BOOTSTRAP.md` to learn the project
3. **Working** — using built-in tools (bash, file ops, GitHub API) to explore, plan, and implement changes
4. **Delivering** — committing changes to a branch and creating/updating a pull request
5. **Iterating** — responding to review feedback and CI failures

It runs in a sandboxed cloud environment, separate from Kuroryuu's local agent mesh, but shares the same bootstrap knowledge and project conventions.
