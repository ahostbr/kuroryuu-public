# KURORYUU_LAWS.md Section Index

> **This is an INDEX.** Full laws file: `KURORYUU_LAWS.md`
> Use `k_files(action="read", path="KURORYUU_LAWS.md", start_line=X, end_line=Y)` to load specific sections.

**Hackathon Stats:** 23 days | 437 sessions | 431 tasks | 16 MCP tools → 118 actions

## Table of Contents

| Section | Lines | Title |
|---------|-------|-------|
| 1 | L13-L23 | STACK MANAGEMENT |
| 2 | L26-L65 | SESSION LIFECYCLE |
| 3 | L68-L86 | EVIDENCE REQUIREMENTS |
| 4 | L89-L137 | PTY GOVERNANCE (OPEN ACCESS) |
| 5 | L140-L162 | TODO MANAGEMENT |
| 6 | L165-L187 | LEADER-FOLLOWER SYSTEM |
| 7 | L190-L220 | MCP TOOLS REFERENCE (16 Tools → 118 Actions) |
| 8 | L223-L310 | RAG & REPO INTEL (includes §8.0 Search Priority) |
| 9 | L313-L365 | FILE LOCATIONS |
| 10 | L368-L380 | LIFECYCLE EVENTS |
| 11 | L383-L440 | SPECIALIST AGENTS & COLLECTIVE INTELLIGENCE |
| 12 | L443-L450 | CONFLICT RESOLUTION |

---

## Section Summaries

### §1 STACK MANAGEMENT
- `.\run_all.ps1` to start, `.\kill_all.ps1` to stop
- NEVER manually start uvicorn/python processes

### §2 SESSION LIFECYCLE
- Session start: `k_session(action="start")`
- Hook calls before/after every tool
- Progress logging after modifications
- Session end: `k_session(action="end")`

### §3 EVIDENCE REQUIREMENTS
- No silent claims - always show proof
- PTY actions require evidence pack

### §4 PTY GOVERNANCE
- `k_pty` is available to ALL agents (12 actions)
- Workers use k_inbox for coordination, PTY for leader dialogue
- Thinkers use PTY for direct real-time dialogue

### §5 TODO MANAGEMENT
- `ai/todo.md` is source of truth
- Use `k_memory` for working memory (7 actions)

### §6 LEADER-FOLLOWER SYSTEM
- First agent → Leader, others → Worker
- Check leader status via `GET /v1/agents/leader`
- Ralph orchestration with Desktop monitoring

### §7 MCP TOOLS REFERENCE
- **16 tools with 118 total actions**
- All tools use routed pattern: `tool(action="...", ...)`
- OPT-IN tools: k_pccontrol (PowerShell Win32 APIs, use 100% DPI), k_clawd (Clawdbot)

### §8 RAG & REPO INTEL
- **§8.0 Search Priority Order:** k_rag → k_repo_intel → git → fallback (HARD RULE)
- Always check freshness before search
- k_rag for keyword search (12 actions), k_repo_intel for structured reports (5 actions)

### §9 FILE LOCATIONS
- Harness state in `ai/`
- Reports in `Reports/RepoIntel/`
- Prompts in `ai/prompts/`
- Apps: gateway (21 routers), mcp_core (16 tools), desktop (235 components), kuroryuu_cli (9,030 LOC)

### §10 LIFECYCLE EVENTS
- SessionStart, SessionEnd, UserPromptSubmit, etc.

### §11 SPECIALIST AGENTS & COLLECTIVE INTELLIGENCE
- 4 specialist personas (Security, Performance, Docs, Tests)
- Auto-trigger based on task keywords
- `k_collective` for shared learning (6 actions)

### §12 CONFLICT RESOLUTION
- If anything contradicts LAWS, **LAWS wins**

---

## File Metadata

- **File**: KURORYUU_LAWS.md
- **Version**: 0.3.0
- **Last Updated**: 2026-01-27
- **Total Sections**: 12
- **MCP Tools**: 16 (118 actions)
