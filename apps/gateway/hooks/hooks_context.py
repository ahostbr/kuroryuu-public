"""Hook Context — Build hook payloads and context blocks.

Handles:
- Building HookPayload objects with session/harness/UI info
- Building the "Todo context block" for system prompt injection
- Parsing todo.md for structured data
"""

from __future__ import annotations

import os
import re
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .hooks_types import (
    HookEvent,
    HookPayload,
    SessionInfo,
    HarnessInfo,
    UIInfo,
    HOOKS_DIR,
)


# ═══════════════════════════════════════════════════════════════════════════════
# Configuration
# ═══════════════════════════════════════════════════════════════════════════════

def _get_project_root() -> Path:
    """Get project root from env or derive from __file__."""
    env_root = os.environ.get("KURORYUU_PROJECT_ROOT")
    if env_root:
        return Path(env_root)
    # __file__ is apps/gateway/hooks/hooks_context.py -> go up 3 levels
    return Path(__file__).resolve().parent.parent.parent.parent

TODO_FILE = "todo.md"
DEFAULT_TODO_PATH = Path(HOOKS_DIR) / TODO_FILE
PROJECT_ROOT = _get_project_root()


# ═══════════════════════════════════════════════════════════════════════════════
# Todo Parsing
# ═══════════════════════════════════════════════════════════════════════════════

def parse_todo_file(todo_path: Optional[Path] = None) -> Dict[str, Any]:
    """Parse ai/todo.md into structured data.
    
    Returns:
        Dictionary with keys: active_focus, checklist, blockers, links, history
    """
    path = todo_path or DEFAULT_TODO_PATH
    
    if not path.exists():
        return {
            "exists": False,
            "active_focus": None,
            "checklist": [],
            "blockers": [],
            "links": {},
            "history": [],
        }
    
    try:
        content = path.read_text(encoding="utf-8")
    except Exception:
        return {"exists": False, "error": "Failed to read todo.md"}
    
    result = {
        "exists": True,
        "active_focus": None,
        "checklist": [],
        "blockers": [],
        "links": {},
        "history": [],
    }
    
    # Parse Active Focus section
    focus_match = re.search(
        r"## Active Focus\s*\n(.*?)(?=\n## |\Z)",
        content,
        re.DOTALL
    )
    if focus_match:
        focus_text = focus_match.group(1).strip()
        feature_match = re.search(r"Feature:\s*(.+)", focus_text)
        goal_match = re.search(r"Goal:\s*(.+)", focus_text)
        next_match = re.search(r"Next demo step:\s*(.+)", focus_text)
        
        result["active_focus"] = {
            "feature": feature_match.group(1).strip() if feature_match else None,
            "goal": goal_match.group(1).strip() if goal_match else None,
            "next_demo_step": next_match.group(1).strip() if next_match else None,
        }
    
    # Parse Checklist section
    checklist_match = re.search(
        r"## Checklist.*?\n(.*?)(?=\n## |\Z)",
        content,
        re.DOTALL
    )
    if checklist_match:
        checklist_text = checklist_match.group(1)
        # Match tasks like: - [ ] T001 — description (owner: agent) (status: todo)
        task_pattern = r"- \[([ xX])\] (T\d+) — ([^(]+)(?:\(owner:\s*(\w+)\))?(?:\s*\(status:\s*(\w+)\))?"
        
        for match in re.finditer(task_pattern, checklist_text):
            checked = match.group(1).lower() == "x"
            result["checklist"].append({
                "id": match.group(2),
                "description": match.group(3).strip(),
                "owner": match.group(4) or "agent",
                "status": match.group(5) or ("done" if checked else "todo"),
                "checked": checked,
            })
    
    # Parse Blockers section
    blockers_match = re.search(
        r"## Current Blockers\s*\n(.*?)(?=\n## |\Z)",
        content,
        re.DOTALL
    )
    if blockers_match:
        blockers_text = blockers_match.group(1).strip()
        if blockers_text.lower() != "- none" and blockers_text.lower() != "none":
            for line in blockers_text.split("\n"):
                line = line.strip()
                if line.startswith("- ") and line != "- None":
                    result["blockers"].append(line[2:])
    
    # Parse Links section
    links_match = re.search(
        r"## Links / Evidence Index\s*\n(.*?)(?=\n## |\Z)",
        content,
        re.DOTALL
    )
    if links_match:
        links_text = links_match.group(1)
        current_category = None
        
        for line in links_text.split("\n"):
            line = line.strip()
            if line.startswith("- ") and line.endswith(":"):
                current_category = line[2:-1].lower()
                result["links"][current_category] = []
            elif line.startswith("- ") and current_category:
                result["links"][current_category].append(line[2:])
    
    return result


def get_unchecked_tasks(todo_data: Dict[str, Any], limit: int = 5) -> List[Dict[str, Any]]:
    """Get top N unchecked tasks from todo data."""
    return [
        t for t in todo_data.get("checklist", [])
        if not t.get("checked", False)
    ][:limit]


# ═══════════════════════════════════════════════════════════════════════════════
# Context Block Building
# ═══════════════════════════════════════════════════════════════════════════════

def build_todo_context_block(todo_path: Optional[Path] = None) -> str:
    """Build the "Todo context block" for system prompt injection.
    
    This block is injected into every system prompt to keep the agent
    aware of the current work state.
    
    Returns:
        Markdown string with todo summary.
    """
    todo_data = parse_todo_file(todo_path)
    
    if not todo_data.get("exists", False):
        return """
---
## 📋 Todo Source-of-Truth (MISSING)

**Warning:** `ai/todo.md` does not exist. Before proceeding:
1. Create `ai/todo.md` with the required template
2. Add at least one actionable task

**Rule:** todo.md is the source of truth — do not proceed without it.
---
"""
    
    lines = ["---", "## 📋 Todo Source-of-Truth", ""]
    
    # Active Focus
    focus = todo_data.get("active_focus", {})
    if focus:
        if focus.get("feature"):
            lines.append(f"**Active Feature:** {focus['feature']}")
        if focus.get("goal"):
            lines.append(f"**Goal:** {focus['goal']}")
        if focus.get("next_demo_step"):
            lines.append(f"**Next Demo Step:** {focus['next_demo_step']}")
        lines.append("")
    
    # Top unchecked tasks
    unchecked = get_unchecked_tasks(todo_data, limit=5)
    if unchecked:
        lines.append("**Next Tasks:**")
        for task in unchecked:
            status_icon = "🔄" if task.get("status") == "doing" else "⬜"
            lines.append(f"- {status_icon} {task['id']} — {task['description']}")
        lines.append("")
    else:
        lines.append("**No unchecked tasks.** Consider adding new tasks or marking work complete.")
        lines.append("")
    
    # Blockers
    blockers = todo_data.get("blockers", [])
    if blockers:
        lines.append("**⚠️ Blockers:**")
        for blocker in blockers:
            lines.append(f"- {blocker}")
        lines.append("")
    
    # Rule reminder
    lines.append("**Rule:** `ai/todo.md` is the source of truth. Update it before starting new scope.")
    lines.append("---")
    
    return "\n".join(lines)


# ═══════════════════════════════════════════════════════════════════════════════
# Payload Building
# ═══════════════════════════════════════════════════════════════════════════════

def build_hook_payload(
    event: HookEvent,
    *,
    session_id: Optional[str] = None,
    thread_id: Optional[str] = None,
    backend: str = "claude",
    active_feature_id: Optional[str] = None,
    connection_id: str = "",
    stream_id: str = "",
    data: Optional[Dict[str, Any]] = None,
    agent_role: str = "leader",
    agent_run_id: str = "",
) -> HookPayload:
    """Build a HookPayload for an event.
    
    Args:
        event: The hook event type.
        session_id: Current session ID (generated if not provided).
        thread_id: Current thread/conversation ID.
        backend: LLM backend name.
        active_feature_id: Currently active feature ID.
        connection_id: AG-UI connection ID.
        stream_id: AG-UI stream ID.
        data: Event-specific data dictionary.
        agent_role: Agent role for stateless architecture ("leader" or "worker").
        agent_run_id: Run ID for stateless architecture (from X-Agent-Run-Id header).
        
    Returns:
        Populated HookPayload.
    """
    session_id = session_id or str(uuid.uuid4())[:8]
    thread_id = thread_id or session_id
    
    return HookPayload(
        spec_version="kuroryuu-hooks/0.1",
        event=event,
        time=datetime.now(timezone.utc).isoformat(),
        run_id=str(uuid.uuid4())[:8],
        agent_role=agent_role,
        agent_run_id=agent_run_id,
        session=SessionInfo(
            session_id=session_id,
            thread_id=thread_id,
            user_id="local",
            backend=backend,
            project_root=str(PROJECT_ROOT),
        ),
        harness=HarnessInfo(
            dir=str(HOOKS_DIR),
            todo_path=str(DEFAULT_TODO_PATH),
        ),
        ui=UIInfo(
            agui_protocol="ag-ui",
            connection_id=connection_id,
            stream_id=stream_id,
        ),
        data=data or {},
    )
