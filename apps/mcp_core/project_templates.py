"""Templates for provisioning new Kuroryuu-managed projects."""

from __future__ import annotations

from typing import Dict, Any


def generate_claude_md(project_name: str, stack_summary: str = "") -> str:
    """Generate a CLAUDE.md for a managed project."""
    stack_line = f"\n- **Stack:** {stack_summary}" if stack_summary else ""

    return f"""# {project_name}

## Kuroryuu-Managed Project

This project is managed by Kuroryuu. You have access to MCP tools for orchestration,
search, memory, and more.

### Available Tools (via MCP Core)

| Tool | Purpose |
|------|---------|
| k_rag | Search this project's codebase (BM25, semantic, hybrid) |
| k_checkpoint | Save/restore session state |
| k_inbox / k_msg | Message other agents |
| k_memory | Working memory across sessions |
| k_collective | Track success/failure patterns |
| k_session | Session lifecycle |
| k_backup | Project backups |
| k_repo_intel | Codebase analysis reports |
| k_project | Project management (register, analyze, provision) |

### Project Context

- **PRD:** Read `ai/prds/` for the project north star
- **Tasks:** Read `ai/todo.md` for current work (SOURCE OF TRUTH){stack_line}

### Workflow

Follow the PRD-first workflow:
1. Read PRD to understand project mission and scope
2. Check ai/todo.md for pending tasks
3. Plan features that align with PRD
4. Break down into subtasks
5. Execute with checkpoint saves
6. Finalize and report
"""


def generate_kuroryuu_json(project_id: str, mcp_port: int = 8100) -> Dict[str, Any]:
    """Generate .kuroryuu.json content."""
    return {
        "id": project_id,
        "mcp_core_url": f"http://127.0.0.1:{mcp_port}/mcp",
        "version": "1.0.0",
    }


def generate_mcp_json(mcp_port: int = 8100) -> Dict[str, Any]:
    """Generate .claude/mcp.json content pointing at MCP Core."""
    return {
        "mcpServers": {
            "kuroryuu": {
                "type": "sse",
                "url": f"http://127.0.0.1:{mcp_port}/mcp",
            }
        }
    }


def generate_todo_md(project_name: str) -> str:
    """Generate initial ai/todo.md."""
    return f"""# {project_name} — Task Board

> Source of truth for all tasks. Managed by Kuroryuu.

## Backlog

## In Progress

## Done
"""
