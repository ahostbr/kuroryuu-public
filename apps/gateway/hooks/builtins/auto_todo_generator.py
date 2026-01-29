"""Auto Todo Generator Hook - Stateless Todo Regeneration.

This is the "lightbulb moment" hook:
- Stateless architecture - no session state to manage
- Auto-regenerates todo from recent tool results
- Reinjects every N actions via PostToolUse hook
- Tracks working memory without persistent sessions

Event subscriptions:
- PostToolUse: Every N tool calls, regenerate and inject todo
- ModelResponseDone: Extract next steps and update todo

Environment:
- KURORYUU_TODO_REINJECT_INTERVAL: Tool calls between reinjections (default: 3)
- KURORYUU_TODO_MAX_HISTORY: Max tool results to track (default: 10)
"""

from __future__ import annotations

import json
import os
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Deque, Dict, List, Optional

# ═══════════════════════════════════════════════════════════════════════════════
# Configuration
# ═══════════════════════════════════════════════════════════════════════════════

def _get_ai_dir() -> Path:
    """Get AI dir from env or derive from __file__."""
    env_dir = os.environ.get("KURORYUU_HOOKS_DIR")
    if env_dir:
        return Path(env_dir)
    # __file__ is apps/gateway/hooks/builtins/auto_todo_generator.py -> go up 4 levels + ai
    return Path(__file__).resolve().parent.parent.parent.parent.parent / "ai"

REINJECT_INTERVAL = int(os.environ.get("KURORYUU_TODO_REINJECT_INTERVAL", "3"))
MAX_HISTORY = int(os.environ.get("KURORYUU_TODO_MAX_HISTORY", "10"))
AI_DIR = _get_ai_dir()
TODO_PATH = AI_DIR / "todo.md"
WORKING_MEMORY_PATH = AI_DIR / "working_memory.json"

# ═══════════════════════════════════════════════════════════════════════════════
# Working Memory (Lightweight State)
# ═══════════════════════════════════════════════════════════════════════════════

@dataclass
class ToolAction:
    """Record of a tool action."""
    name: str
    arguments: Dict[str, Any]
    ok: bool
    timestamp: str
    summary: str = ""

@dataclass  
class WorkingMemory:
    """Lightweight working memory for stateless todo regeneration.
    
    This is persisted to disk so it survives restarts, but it's
    append-only and auto-pruned to MAX_HISTORY entries.
    """
    recent_actions: List[ToolAction] = field(default_factory=list)
    tool_call_count: int = 0
    last_inject_at: int = 0
    active_goal: str = ""
    blockers: List[str] = field(default_factory=list)
    next_steps: List[str] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "recent_actions": [
                {
                    "name": a.name,
                    "arguments": a.arguments,
                    "ok": a.ok,
                    "timestamp": a.timestamp,
                    "summary": a.summary,
                }
                for a in self.recent_actions
            ],
            "tool_call_count": self.tool_call_count,
            "last_inject_at": self.last_inject_at,
            "active_goal": self.active_goal,
            "blockers": self.blockers,
            "next_steps": self.next_steps,
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "WorkingMemory":
        wm = cls()
        wm.tool_call_count = data.get("tool_call_count", 0)
        wm.last_inject_at = data.get("last_inject_at", 0)
        wm.active_goal = data.get("active_goal", "")
        wm.blockers = data.get("blockers", [])
        wm.next_steps = data.get("next_steps", [])
        
        for a in data.get("recent_actions", []):
            wm.recent_actions.append(ToolAction(
                name=a.get("name", ""),
                arguments=a.get("arguments", {}),
                ok=a.get("ok", False),
                timestamp=a.get("timestamp", ""),
                summary=a.get("summary", ""),
            ))
        
        return wm


def _load_working_memory() -> WorkingMemory:
    """Load working memory from disk."""
    if not WORKING_MEMORY_PATH.exists():
        return WorkingMemory()
    
    try:
        data = json.loads(WORKING_MEMORY_PATH.read_text(encoding="utf-8"))
        return WorkingMemory.from_dict(data)
    except Exception:
        return WorkingMemory()


def _save_working_memory(wm: WorkingMemory) -> None:
    """Save working memory to disk."""
    AI_DIR.mkdir(parents=True, exist_ok=True)
    WORKING_MEMORY_PATH.write_text(
        json.dumps(wm.to_dict(), indent=2),
        encoding="utf-8",
    )


def _prune_working_memory(wm: WorkingMemory) -> None:
    """Prune working memory to MAX_HISTORY entries."""
    if len(wm.recent_actions) > MAX_HISTORY:
        wm.recent_actions = wm.recent_actions[-MAX_HISTORY:]


# ═══════════════════════════════════════════════════════════════════════════════
# Todo Generation
# ═══════════════════════════════════════════════════════════════════════════════

def _summarize_action(action: ToolAction) -> str:
    """Generate a human-readable summary of an action."""
    name = action.name
    args = action.arguments
    ok = "✓" if action.ok else "✗"
    
    # Generate summaries based on tool type
    if name == "write_file":
        path = args.get("path", "?")
        return f"{ok} Wrote {path}"
    elif name == "read_file":
        path = args.get("path", "?")
        return f"{ok} Read {path}"
    elif name == "list_dir":
        path = args.get("path", ".")
        return f"{ok} Listed {path}"
    elif name.startswith("checkpoint_"):
        return f"{ok} Checkpoint: {name.replace('checkpoint_', '')}"
    elif name.startswith("inbox_"):
        return f"{ok} Inbox: {name.replace('inbox_', '')}"
    elif name.startswith("rag_"):
        query = args.get("query", "?")[:30]
        return f"{ok} RAG search: {query}..."
    else:
        return f"{ok} {name}"


def _build_auto_todo(wm: WorkingMemory) -> str:
    """Build the auto-generated todo context block.
    
    This is the key function - generates a todo list from
    working memory state without requiring persistent sessions.
    
    CRITICAL: Also instructs agent to update ai/todo.md on disk.
    """
    lines = [
        "---",
        "## 🔄 Working Context (Auto-Injected)",
        "",
        "**⚠️ MANDATORY:** Update `ai/todo.md` as you work:",
        "- Mark tasks done: `- [x] T001 — ...`",
        "- Add new tasks: `- [ ] T002 — ...`",
        "- Update Active Focus section with current goal",
        "- Add blockers to Current Blockers section",
        "",
    ]
    
    # Current goal
    if wm.active_goal:
        lines.append(f"**Current Goal:** {wm.active_goal}")
        lines.append("")
    
    # Recent actions (last 5)
    if wm.recent_actions:
        lines.append("**Recent Actions:**")
        for action in wm.recent_actions[-5:]:
            summary = action.summary or _summarize_action(action)
            lines.append(f"- {summary}")
        lines.append("")
    
    # Inferred state
    success_count = sum(1 for a in wm.recent_actions if a.ok)
    fail_count = sum(1 for a in wm.recent_actions if not a.ok)
    
    if fail_count > 0:
        lines.append(f"**Status:** {success_count}✓ {fail_count}✗ in last {len(wm.recent_actions)} actions")
        if fail_count >= 2:
            lines.append("**🚨 Multiple failures detected - add blocker to todo.md**")
        lines.append("")
    
    # Blockers
    if wm.blockers:
        lines.append("**⚠️ Blockers (update in todo.md):**")
        for b in wm.blockers:
            lines.append(f"- {b}")
        lines.append("")
    
    # Next steps
    if wm.next_steps:
        lines.append("**Suggested Next Steps (add to todo.md if not there):**")
        for i, step in enumerate(wm.next_steps[:5], 1):
            lines.append(f"{i}. {step}")
        lines.append("")
    
    # Directive
    lines.extend([
        "**📝 TODO UPDATE RULE:**",
        "After every 3 tool calls, use `write_file` to update `ai/todo.md`:",
        "1. Update checklist with completed/new tasks",
        "2. Update Active Focus if goal changed",
        "3. Add any blockers encountered",
        "",
        f"*Tool calls: {wm.tool_call_count} | Last update: {wm.tool_call_count - wm.last_inject_at} ago*",
        "---",
    ])
    
    return "\n".join(lines)


def _should_reinject(wm: WorkingMemory) -> bool:
    """Determine if we should reinject the todo context.
    
    Reinject every REINJECT_INTERVAL tool calls.
    """
    calls_since_inject = wm.tool_call_count - wm.last_inject_at
    return calls_since_inject >= REINJECT_INTERVAL


# ═══════════════════════════════════════════════════════════════════════════════
# Hook Handlers
# ═══════════════════════════════════════════════════════════════════════════════

def on_post_tool(payload: Dict[str, Any]) -> Dict[str, Any]:
    """PostToolUse hook: Track action and potentially reinject todo.
    
    This is the core of the stateless todo system:
    1. Record the tool action to working memory
    2. Check if we should reinject (every N actions)
    3. If yes, regenerate and inject the todo context
    
    Args:
        payload: Hook payload with tool info.
        
    Returns:
        Hook result, optionally with inject_context.
    """
    # Load working memory
    wm = _load_working_memory()
    
    # Extract tool info
    tool_data = payload.get("data", {}).get("tool", {})
    result_data = payload.get("data", {}).get("result", {})
    
    tool_name = tool_data.get("name", "unknown")
    tool_args = tool_data.get("arguments", {})
    result_ok = result_data.get("ok", False)
    
    # Record action
    action = ToolAction(
        name=tool_name,
        arguments=tool_args,
        ok=result_ok,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )
    action.summary = _summarize_action(action)
    
    wm.recent_actions.append(action)
    wm.tool_call_count += 1
    
    # Prune if needed
    _prune_working_memory(wm)
    
    # Check if we should reinject
    should_inject = _should_reinject(wm)
    inject_context: Optional[str] = None
    
    if should_inject:
        inject_context = _build_auto_todo(wm)
        wm.last_inject_at = wm.tool_call_count
    
    # Save working memory
    _save_working_memory(wm)
    
    # Build response
    result = {
        "ok": True,
        "actions": {
            "allow": True,
            "notes": [
                {"level": "info", "message": f"Tool {tool_name}: {'✓' if result_ok else '✗'}"},
            ],
        },
    }
    
    if inject_context:
        result["inject_context"] = inject_context
        result["actions"]["notes"].append({
            "level": "info",
            "message": f"Auto-injected working context (every {REINJECT_INTERVAL} actions)",
        })
    
    return result


def on_model_response(payload: Dict[str, Any]) -> Dict[str, Any]:
    """ModelResponseDone hook: Extract next steps from response.
    
    Scans the model response for:
    - "Next steps" / "TODO" / "Action items" sections
    - Goal statements
    - Blocker mentions
    
    Updates working memory accordingly.
    """
    import re
    
    response_text = payload.get("data", {}).get("response_text", "")
    
    if not response_text:
        return {"ok": True, "actions": {"allow": True}}
    
    # Load working memory
    wm = _load_working_memory()
    
    # Extract next steps
    next_steps_match = re.search(
        r"(?:next steps?|todo|action items?|plan)[:]*\s*\n((?:[-*\d.]\s*.+\n?)+)",
        response_text,
        re.IGNORECASE
    )
    
    if next_steps_match:
        steps_text = next_steps_match.group(1).strip()
        steps = []
        for line in steps_text.split("\n"):
            line = line.strip()
            # Remove leading markers
            line = re.sub(r"^[-*\d.]+\s*", "", line)
            if line and len(line) > 5:
                steps.append(line[:100])  # Cap at 100 chars
        
        if steps:
            wm.next_steps = steps[:5]  # Keep top 5
    
    # Extract goal if mentioned
    goal_match = re.search(
        r"(?:goal|objective|aim)[:]*\s*(.+?)(?:\n|$)",
        response_text,
        re.IGNORECASE
    )
    
    if goal_match:
        wm.active_goal = goal_match.group(1).strip()[:100]
    
    # Extract blockers if mentioned
    blocker_match = re.search(
        r"(?:blocker|blocked|issue|problem)[:]*\s*(.+?)(?:\n|$)",
        response_text,
        re.IGNORECASE
    )
    
    if blocker_match:
        blocker_text = blocker_match.group(1).strip()
        if blocker_text and "none" not in blocker_text.lower():
            wm.blockers = [blocker_text[:100]]
    
    # Save working memory
    _save_working_memory(wm)
    
    return {
        "ok": True,
        "actions": {"allow": True},
    }


def get_working_memory_context() -> str:
    """Get the current working memory context block.
    
    Called by external systems to get the auto-todo without
    waiting for the next reinject interval.
    """
    wm = _load_working_memory()
    return _build_auto_todo(wm)


def set_active_goal(goal: str) -> None:
    """Set the active goal in working memory.
    
    Called externally to update the goal.
    """
    wm = _load_working_memory()
    wm.active_goal = goal[:200]
    _save_working_memory(wm)


def clear_working_memory() -> None:
    """Clear working memory completely.
    
    Called to reset state between major task transitions.
    """
    wm = WorkingMemory()
    _save_working_memory(wm)
