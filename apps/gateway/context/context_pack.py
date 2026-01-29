"""
Context Pack Builder

Builds context packs for the stateless agent architecture.
Single shared module used by both /v1/chat/proxy and /v2/chat/stream.

Context budgets:
- full: ~2k tokens - for leaders with large context models
- compact: ~500 tokens - default, workers capped here
- minimal: ~200 tokens - for small models

Workers are ALWAYS capped at compact regardless of setting.
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Any, List, Optional
from enum import Enum
import json

from .run_manager import (
    get_ai_dir,
    get_current_run,
    get_leader_state,
    load_settings
)


class ContextBudget(str, Enum):
    """Context injection size levels."""
    FULL = "full"
    COMPACT = "compact"
    MINIMAL = "minimal"


class AgentRole(str, Enum):
    """Agent role in the stateless architecture."""
    LEADER = "leader"
    WORKER = "worker"


@dataclass
class ContextPack:
    """Context pack for injection into agent requests."""
    messages_prefix: List[Dict[str, str]]
    todo_summary: Optional[str]
    working_summary: Optional[str]
    run_id: Optional[str]
    budget_used: str
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            "messages_prefix": self.messages_prefix,
            "todo_summary": self.todo_summary,
            "working_summary": self.working_summary,
            "run_id": self.run_id,
            "budget_used": self.budget_used
        }


# ============================================================================
# Content Loaders
# ============================================================================

def load_todo_content() -> Optional[str]:
    """Load ai/todo.md content."""
    todo_file = get_ai_dir() / "todo.md"
    if not todo_file.exists():
        return None
    return todo_file.read_text()


def load_working_memory() -> Optional[Dict[str, Any]]:
    """Load ai/working_memory.json content."""
    wm_file = get_ai_dir() / "working_memory.json"
    if not wm_file.exists():
        return None
    try:
        return json.loads(wm_file.read_text())
    except json.JSONDecodeError:
        return None


def summarize_todo(content: str, max_chars: int = 500) -> str:
    """Summarize todo content to fit budget."""
    if len(content) <= max_chars:
        return content
    
    # Try to find a good break point
    lines = content.split("\n")
    result = []
    current_len = 0
    
    for line in lines:
        if current_len + len(line) + 1 > max_chars - 20:
            result.append("...(truncated)")
            break
        result.append(line)
        current_len += len(line) + 1
    
    return "\n".join(result)


def summarize_working_memory(wm: Dict[str, Any], max_chars: int = 300) -> str:
    """Summarize working memory to fit budget."""
    parts = []
    
    # Active goal
    if wm.get("active_goal"):
        parts.append(f"Goal: {wm['active_goal']}")
    
    # Blockers
    if wm.get("blockers"):
        blockers = wm["blockers"][:3]  # Max 3
        parts.append(f"Blockers: {', '.join(blockers)}")
    
    # Next steps
    if wm.get("next_steps"):
        steps = wm["next_steps"][:3]  # Max 3
        parts.append(f"Next: {', '.join(steps)}")
    
    # Recent actions (just count)
    if wm.get("recent_actions"):
        count = len(wm["recent_actions"])
        parts.append(f"Recent actions: {count}")
    
    result = " | ".join(parts)
    if len(result) > max_chars:
        return result[:max_chars - 3] + "..."
    return result


# ============================================================================
# Budget Configurations
# ============================================================================

BUDGET_CONFIG = {
    ContextBudget.FULL: {
        "todo_max_chars": 1500,
        "working_max_chars": 500,
        "include_leader_state": True,
        "include_recent_actions": True
    },
    ContextBudget.COMPACT: {
        "todo_max_chars": 400,
        "working_max_chars": 200,
        "include_leader_state": False,
        "include_recent_actions": False
    },
    ContextBudget.MINIMAL: {
        "todo_max_chars": 150,
        "working_max_chars": 50,
        "include_leader_state": False,
        "include_recent_actions": False
    }
}


# ============================================================================
# Main Builder
# ============================================================================

def build_context_pack(
    run_id: Optional[str] = None,
    agent_role: str = "leader",
    budget: str = "compact"
) -> ContextPack:
    """
    Build a context pack for injection into agent requests.
    
    Args:
        run_id: Current run ID (if any)
        agent_role: "leader" or "worker"
        budget: "full", "compact", or "minimal"
        
    Returns:
        ContextPack with messages_prefix, summaries, and metadata
        
    Note:
        Workers are ALWAYS capped at "compact" regardless of budget setting.
    """
    # Workers capped at compact
    role = AgentRole(agent_role) if agent_role in [r.value for r in AgentRole] else AgentRole.LEADER
    if role == AgentRole.WORKER and budget == ContextBudget.FULL.value:
        budget = ContextBudget.COMPACT.value
    
    # Normalize budget
    try:
        budget_enum = ContextBudget(budget)
    except ValueError:
        budget_enum = ContextBudget.COMPACT
    
    config = BUDGET_CONFIG[budget_enum]
    
    # Load content
    todo_content = load_todo_content()
    working_memory = load_working_memory()
    
    # Get run info
    if run_id is None:
        current = get_current_run()
        run_id = current.get("run_id") if current else None
    
    # Build summaries based on budget
    todo_summary = None
    if todo_content:
        todo_summary = summarize_todo(todo_content, config["todo_max_chars"])
    
    working_summary = None
    if working_memory:
        working_summary = summarize_working_memory(working_memory, config["working_max_chars"])
    
    # Build messages prefix
    messages_prefix = []
    
    # System context injection
    context_parts = []
    
    if todo_summary:
        context_parts.append(f"## Current Tasks (ai/todo.md)\n{todo_summary}")
    
    if working_summary:
        context_parts.append(f"## Working Memory\n{working_summary}")
    
    if run_id:
        context_parts.append(f"## Run ID\n{run_id}")
    
    if config["include_leader_state"] and run_id:
        leader_state = get_leader_state(run_id)
        if leader_state:
            goal = leader_state.get("current_goal")
            if goal:
                context_parts.append(f"## Leader Goal\n{goal}")
    
    if context_parts:
        context_message = "\n\n".join(context_parts)
        messages_prefix.append({
            "role": "system",
            "content": f"[CONTEXT INJECTION]\n\n{context_message}\n\n[END CONTEXT]"
        })
    
    return ContextPack(
        messages_prefix=messages_prefix,
        todo_summary=todo_summary,
        working_summary=working_summary,
        run_id=run_id,
        budget_used=budget_enum.value
    )


def get_effective_budget(agent_role: str = "leader") -> str:
    """
    Get effective context budget based on settings and role.
    
    Workers are always capped at compact.
    """
    settings = load_settings()
    budget = settings.get("context_budget", "compact")
    
    # Workers capped at compact
    if agent_role == AgentRole.WORKER.value and budget == ContextBudget.FULL.value:
        return ContextBudget.COMPACT.value
    
    return budget
