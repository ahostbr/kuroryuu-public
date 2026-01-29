"""Todo Source-of-Truth Enforcer Hook.

Ensures ai/todo.md exists, is always referenced, and contains evidence pointers.

Event subscriptions:
- SessionStart: Ensure todo.md exists with required template
- UserPromptSubmit: Inject "Todo context block" into system context
- PostToolUse: Update evidence links after tool calls
- ModelResponseDone: Extract next steps from assistant response

Environment:
- KURORYUU_TODO_STRICT: If "1", blocks execution when todo.md is missing tasks
- KURORYUU_WORKLOG_REMIND_MINUTES: Time before reminding about worklog (default: 60)
"""

from __future__ import annotations

import os
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

# ═══════════════════════════════════════════════════════════════════════════════
# Configuration
# ═══════════════════════════════════════════════════════════════════════════════

def _get_ai_dir() -> Path:
    """Get AI dir from env or derive from __file__."""
    env_dir = os.environ.get("KURORYUU_HOOKS_DIR")
    if env_dir:
        return Path(env_dir)
    # __file__ is apps/gateway/hooks/builtins/todo_sot_enforcer.py -> go up 4 levels + ai
    return Path(__file__).resolve().parent.parent.parent.parent.parent / "ai"

TODO_STRICT = os.environ.get("KURORYUU_TODO_STRICT", "0") == "1"
WORKLOG_REMIND_MINUTES = int(os.environ.get("KURORYUU_WORKLOG_REMIND_MINUTES", "60"))
AI_DIR = _get_ai_dir()
TODO_PATH = AI_DIR / "todo.md"

# Template for new todo.md
TODO_TEMPLATE = """# TODO — Kuroryuu (Source of Truth)

> **This file is the source of truth for all agent work.**
> All paths are repo-relative. Update this file before starting new scope.

---

## Active Focus
- Feature: (not set)
- Goal: (not set)
- Next demo step: (not set)

---

## Checklist (ordered)
- [ ] T001 — (add first task) (owner: agent) (status: todo)
  - Notes: 
  - Evidence:
    - Worklog: (pending)
    - Convo: (pending)
    - Checkpoint: (pending)

---

## Current Blockers
- None

---

## Links / Evidence Index
- Worklogs:
  - (none yet)
- Convos:
  - (none yet)
- Checkpoints:
  - (none yet)
- Tool traces:
  - (optional)

---

## Change History (append-only)
- {timestamp} — Created todo.md template
"""


# ═══════════════════════════════════════════════════════════════════════════════
# Helper Functions
# ═══════════════════════════════════════════════════════════════════════════════

def _ensure_todo_exists() -> tuple[bool, str]:
    """Ensure todo.md exists, creating from template if needed.
    
    Returns:
        Tuple of (created, message)
    """
    if TODO_PATH.exists():
        return False, "todo.md already exists"
    
    # Create from template
    AI_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    content = TODO_TEMPLATE.format(timestamp=timestamp)
    TODO_PATH.write_text(content, encoding="utf-8")
    
    return True, f"Created todo.md at {TODO_PATH}"


def _read_todo() -> Optional[str]:
    """Read todo.md content."""
    if not TODO_PATH.exists():
        return None
    try:
        return TODO_PATH.read_text(encoding="utf-8")
    except Exception:
        return None


def _append_change_history(summary: str) -> None:
    """Append an entry to the Change History section."""
    content = _read_todo()
    if not content:
        return
    
    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
    entry = f"- {timestamp} — {summary}\n"
    
    # Find Change History section and append
    if "## Change History" in content:
        content = content.rstrip() + "\n" + entry
        TODO_PATH.write_text(content, encoding="utf-8")


def _update_evidence_links(tool_name: str, result_summary: str) -> None:
    """Update evidence links after a tool call."""
    content = _read_todo()
    if not content:
        return
    
    # This is a simplified implementation - just append to change history
    _append_change_history(f"Tool called: {tool_name}")


def _has_unchecked_tasks(content: str) -> bool:
    """Check if todo.md has unchecked tasks."""
    return bool(re.search(r"- \[ \] T\d+", content))


def _build_context_block(content: str) -> str:
    """Build the todo context block for system prompt injection."""
    lines = ["---", "## 📋 Todo Source-of-Truth", ""]
    
    # Extract Active Focus
    focus_match = re.search(
        r"## Active Focus\s*\n(.*?)(?=\n---|\n## |\Z)",
        content,
        re.DOTALL
    )
    if focus_match:
        focus_text = focus_match.group(1).strip()
        for line in focus_text.split("\n"):
            line = line.strip()
            if line.startswith("- "):
                lines.append(f"**{line[2:].split(':')[0]}:** {':'.join(line[2:].split(':')[1:]).strip()}")
        lines.append("")
    
    # Extract top 5 unchecked tasks
    task_pattern = r"- \[ \] (T\d+) — ([^(]+)"
    tasks = re.findall(task_pattern, content)[:5]
    
    if tasks:
        lines.append("**Next Tasks:**")
        for task_id, desc in tasks:
            lines.append(f"- ⬜ {task_id} — {desc.strip()}")
        lines.append("")
    else:
        lines.append("**No unchecked tasks.** Add new tasks or mark complete.")
        lines.append("")
    
    # Extract blockers
    blockers_match = re.search(
        r"## Current Blockers\s*\n(.*?)(?=\n---|\n## |\Z)",
        content,
        re.DOTALL
    )
    if blockers_match:
        blockers_text = blockers_match.group(1).strip()
        if blockers_text.lower() not in ("- none", "none", ""):
            lines.append("**⚠️ Blockers:**")
            for line in blockers_text.split("\n"):
                if line.strip().startswith("- ") and "none" not in line.lower():
                    lines.append(line.strip())
            lines.append("")
    
    lines.append("**Rule:** `ai/todo.md` is the source of truth. Update before new scope.")
    lines.append("---")
    
    return "\n".join(lines)


# ═══════════════════════════════════════════════════════════════════════════════
# Hook Handlers
# ═══════════════════════════════════════════════════════════════════════════════

def on_session_start(payload: Dict[str, Any]) -> Dict[str, Any]:
    """SessionStart hook: Ensure todo.md exists.
    
    Args:
        payload: Hook payload dictionary.
        
    Returns:
        Hook result dictionary.
    """
    created, message = _ensure_todo_exists()
    
    notes = []
    ui_events = []
    
    if created:
        notes.append({"level": "info", "message": message})
        ui_events.append({
            "type": "harness_updated",
            "level": "info",
            "text": "Created todo.md source-of-truth"
        })
    
    return {
        "ok": True,
        "actions": {
            "allow": True,
            "notes": notes,
            "ui_events": ui_events,
        }
    }


def on_user_prompt(payload: Dict[str, Any]) -> Dict[str, Any]:
    """UserPromptSubmit hook: Inject todo context block.
    
    Args:
        payload: Hook payload dictionary.
        
    Returns:
        Hook result dictionary with inject_context.
    """
    _ensure_todo_exists()
    content = _read_todo()
    
    notes = []
    
    if content is None:
        # Should not happen after _ensure_todo_exists, but handle gracefully
        return {
            "ok": True,
            "actions": {"allow": True},
            "inject_context": "**Warning:** Could not read todo.md",
        }
    
    # Build context block
    context_block = _build_context_block(content)
    
    # Strict mode: block if no unchecked tasks
    if TODO_STRICT and not _has_unchecked_tasks(content):
        return {
            "ok": True,
            "actions": {
                "allow": False,
                "block_reason": "todo.md has no unchecked tasks. Add tasks before proceeding.",
                "notes": [{"level": "warn", "message": "Strict mode: Blocked due to empty checklist"}],
            },
            "inject_context": context_block,
        }
    
    return {
        "ok": True,
        "actions": {"allow": True, "notes": notes},
        "inject_context": context_block,
    }


def on_post_tool(payload: Dict[str, Any]) -> Dict[str, Any]:
    """PostToolUse hook: Update evidence links.
    
    Args:
        payload: Hook payload dictionary with tool info.
        
    Returns:
        Hook result dictionary.
    """
    tool_data = payload.get("data", {}).get("tool", {})
    tool_name = tool_data.get("name", "unknown")
    result_ok = payload.get("data", {}).get("result", {}).get("ok", False)
    
    if result_ok:
        _update_evidence_links(tool_name, "success")
    
    return {
        "ok": True,
        "actions": {
            "allow": True,
            "notes": [{"level": "info", "message": f"Tool {tool_name} logged to todo.md"}],
        }
    }


def on_model_response(payload: Dict[str, Any]) -> Dict[str, Any]:
    """ModelResponseDone hook: Extract next steps from response.
    
    Args:
        payload: Hook payload dictionary with response info.
        
    Returns:
        Hook result dictionary.
    """
    response_text = payload.get("data", {}).get("response_text", "")
    
    # Look for "Next steps" or similar patterns
    next_steps_match = re.search(
        r"(?:next steps?|todo|action items?)[:]*\s*\n((?:[-*]\s*.+\n?)+)",
        response_text,
        re.IGNORECASE
    )
    
    if next_steps_match:
        # Found next steps - could add them to todo.md
        steps_text = next_steps_match.group(1).strip()
        _append_change_history(f"Response contained {len(steps_text.split(chr(10)))} next steps")
    
    return {
        "ok": True,
        "actions": {"allow": True},
    }
