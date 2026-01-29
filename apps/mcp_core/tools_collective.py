"""Collective Intelligence tools for MCP_CORE - Routed k_collective tool.

Phase 4: Provides tools for shared knowledge that agents learn from and contribute to.

Routed tool: k_collective(action, ...)
Actions: help, record_success, record_failure, query_patterns, get_skill_matrix, update_skill
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

from protocol import ToolRegistry
try:
    from .paths import get_ai_dir_or_env
except ImportError:
    from paths import get_ai_dir_or_env

# Paths
AI_DIR = get_ai_dir_or_env("KURORYUU_HOOKS_DIR")
COLLECTIVE_DIR = AI_DIR / "collective"
PATTERNS_PATH = COLLECTIVE_DIR / "patterns.jsonl"
SKILL_MATRIX_PATH = COLLECTIVE_DIR / "skill_matrix.json"


def _ensure_collective_dir():
    """Ensure the collective directory exists."""
    COLLECTIVE_DIR.mkdir(parents=True, exist_ok=True)


def _load_skill_matrix() -> Dict[str, Dict[str, float]]:
    """Load skill matrix from disk."""
    if not SKILL_MATRIX_PATH.exists():
        return {}

    try:
        return json.loads(SKILL_MATRIX_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _save_skill_matrix(matrix: Dict[str, Dict[str, float]]) -> None:
    """Save skill matrix to disk."""
    _ensure_collective_dir()
    SKILL_MATRIX_PATH.write_text(
        json.dumps(matrix, indent=2),
        encoding="utf-8",
    )


def _append_pattern(pattern: Dict[str, Any]) -> None:
    """Append a pattern to the patterns file."""
    _ensure_collective_dir()
    with open(PATTERNS_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(pattern) + "\n")


def _load_patterns(limit: int = 100) -> List[Dict[str, Any]]:
    """Load recent patterns from disk."""
    if not PATTERNS_PATH.exists():
        return []

    patterns = []
    try:
        with open(PATTERNS_PATH, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        patterns.append(json.loads(line))
                    except json.JSONDecodeError:
                        pass
    except Exception:
        return []

    # Return most recent patterns
    return patterns[-limit:]


# ============================================================================
# Action implementations
# ============================================================================

def _action_help(**kwargs: Any) -> Dict[str, Any]:
    """List available actions for k_collective."""
    return {
        "ok": True,
        "data": {
            "tool": "k_collective",
            "description": "Collective intelligence - shared knowledge that agents learn from",
            "actions": {
                "help": "Show this help",
                "record_success": "Record a successful approach. Params: task_type, approach, evidence",
                "record_failure": "Record a failed approach. Params: task_type, approach, reason",
                "query_patterns": "Query patterns relevant to a task. Params: query, limit (optional)",
                "get_skill_matrix": "Get agent skill scores",
                "update_skill": "Update an agent's skill score. Params: agent_id, skill_type, delta",
            },
            "paths": {
                "patterns": str(PATTERNS_PATH),
                "skill_matrix": str(SKILL_MATRIX_PATH),
            },
        },
        "error": None,
    }


def _action_record_success(
    task_type: str = "",
    approach: str = "",
    evidence: str = "",
    agent_id: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Record a successful approach to the pattern library."""
    if not task_type or not approach:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "task_type and approach are required",
        }

    pattern = {
        "type": "success",
        "task_type": task_type[:100],
        "approach": approach[:500],
        "evidence": evidence[:500] if evidence else "",
        "agent_id": agent_id[:50] if agent_id else "",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    _append_pattern(pattern)

    # Update skill matrix if agent_id provided
    if agent_id:
        matrix = _load_skill_matrix()
        if agent_id not in matrix:
            matrix[agent_id] = {}
        skill = task_type.lower().replace(" ", "_")[:30]
        current = matrix[agent_id].get(skill, 0.5)
        matrix[agent_id][skill] = min(1.0, current + 0.05)  # Small boost for success
        _save_skill_matrix(matrix)

    return {
        "ok": True,
        "pattern_type": "success",
        "task_type": task_type,
        "message": "Success pattern recorded",
    }


def _action_record_failure(
    task_type: str = "",
    approach: str = "",
    reason: str = "",
    agent_id: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Record a failed approach to the pattern library."""
    if not task_type or not approach:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "task_type and approach are required",
        }

    pattern = {
        "type": "failure",
        "task_type": task_type[:100],
        "approach": approach[:500],
        "reason": reason[:500] if reason else "",
        "agent_id": agent_id[:50] if agent_id else "",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

    _append_pattern(pattern)

    # Update skill matrix if agent_id provided (small penalty)
    if agent_id:
        matrix = _load_skill_matrix()
        if agent_id not in matrix:
            matrix[agent_id] = {}
        skill = task_type.lower().replace(" ", "_")[:30]
        current = matrix[agent_id].get(skill, 0.5)
        matrix[agent_id][skill] = max(0.0, current - 0.02)  # Small penalty for failure
        _save_skill_matrix(matrix)

    return {
        "ok": True,
        "pattern_type": "failure",
        "task_type": task_type,
        "message": "Failure pattern recorded (to avoid in future)",
    }


def _action_query_patterns(
    query: str = "",
    limit: int = 10,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Query patterns relevant to a task description."""
    if not query:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "query is required",
        }

    all_patterns = _load_patterns(limit=200)
    query_lower = query.lower()

    # Simple relevance scoring based on keyword matching
    scored = []
    for pattern in all_patterns:
        score = 0
        task_type = pattern.get("task_type", "").lower()
        approach = pattern.get("approach", "").lower()

        # Check for keyword matches
        for word in query_lower.split():
            if len(word) > 2:  # Skip very short words
                if word in task_type:
                    score += 3
                if word in approach:
                    score += 1

        if score > 0:
            scored.append((score, pattern))

    # Sort by score and recency
    scored.sort(key=lambda x: (-x[0], x[1].get("timestamp", "")), reverse=True)

    # Separate successes and failures
    successes = [p for s, p in scored if p.get("type") == "success"][:limit]
    failures = [p for s, p in scored if p.get("type") == "failure"][:limit // 2]

    return {
        "ok": True,
        "query": query,
        "successes": successes,
        "failures": failures,
        "total_patterns": len(all_patterns),
        "context_hint": _format_patterns_for_context(successes, failures) if successes or failures else None,
    }


def _format_patterns_for_context(successes: List[Dict], failures: List[Dict]) -> str:
    """Format patterns as context for agent injection."""
    lines = ["## Past Learnings (from collective intelligence)\n"]

    if successes:
        lines.append("### What worked:")
        for p in successes[:3]:
            lines.append(f"- **{p['task_type']}**: {p['approach']}")
            if p.get("evidence"):
                lines.append(f"  - Evidence: {p['evidence']}")

    if failures:
        lines.append("\n### What to avoid:")
        for p in failures[:2]:
            lines.append(f"- **{p['task_type']}**: {p['approach']}")
            if p.get("reason"):
                lines.append(f"  - Reason: {p['reason']}")

    return "\n".join(lines)


def _action_get_skill_matrix(**kwargs: Any) -> Dict[str, Any]:
    """Get the current skill matrix."""
    matrix = _load_skill_matrix()

    return {
        "ok": True,
        "skill_matrix": matrix,
        "agent_count": len(matrix),
        "top_skills": _get_top_skills(matrix),
    }


def _get_top_skills(matrix: Dict[str, Dict[str, float]]) -> Dict[str, str]:
    """Get the best agent for each skill type."""
    skills: Dict[str, tuple] = {}  # skill -> (best_agent, best_score)

    for agent_id, agent_skills in matrix.items():
        for skill, score in agent_skills.items():
            if skill not in skills or score > skills[skill][1]:
                skills[skill] = (agent_id, score)

    return {skill: agent for skill, (agent, score) in skills.items()}


def _action_update_skill(
    agent_id: str = "",
    skill_type: str = "",
    delta: float = 0.0,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Manually update an agent's skill score."""
    if not agent_id or not skill_type:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "agent_id and skill_type are required",
        }

    matrix = _load_skill_matrix()
    if agent_id not in matrix:
        matrix[agent_id] = {}

    skill = skill_type.lower().replace(" ", "_")[:30]
    current = matrix[agent_id].get(skill, 0.5)
    new_score = max(0.0, min(1.0, current + delta))
    matrix[agent_id][skill] = new_score

    _save_skill_matrix(matrix)

    return {
        "ok": True,
        "agent_id": agent_id,
        "skill": skill,
        "old_score": current,
        "new_score": new_score,
        "delta": delta,
    }


# ============================================================================
# Routed tool
# ============================================================================

ACTION_HANDLERS = {
    "help": _action_help,
    "record_success": _action_record_success,
    "record_failure": _action_record_failure,
    "query_patterns": _action_query_patterns,
    "get_skill_matrix": _action_get_skill_matrix,
    "update_skill": _action_update_skill,
}


def k_collective(
    action: str,
    task_type: str = "",
    approach: str = "",
    evidence: str = "",
    reason: str = "",
    query: str = "",
    limit: int = 10,
    agent_id: str = "",
    skill_type: str = "",
    delta: float = 0.0,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Kuroryuu Collective - Shared knowledge that agents learn from.

    Routed tool with actions: help, record_success, record_failure, query_patterns, get_skill_matrix, update_skill

    Args:
        action: Action to perform (required)
        task_type: Type of task (for record_success/failure)
        approach: Approach used (for record_success/failure)
        evidence: Evidence of success (for record_success)
        reason: Reason for failure (for record_failure)
        query: Query text (for query_patterns)
        limit: Max results (for query_patterns)
        agent_id: Agent ID (for update_skill, optional for record_*)
        skill_type: Skill type (for update_skill)
        delta: Score change (for update_skill)

    Returns:
        {ok, ...} response dict
    """
    act = (action or "").strip().lower()

    if not act:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "action is required. Use action='help' for available actions.",
            "details": {"available_actions": list(ACTION_HANDLERS.keys())},
        }

    handler = ACTION_HANDLERS.get(act)
    if not handler:
        return {
            "ok": False,
            "error_code": "UNKNOWN_ACTION",
            "message": f"Unknown action: {act}",
            "details": {"available_actions": list(ACTION_HANDLERS.keys())},
        }

    return handler(
        task_type=task_type,
        approach=approach,
        evidence=evidence,
        reason=reason,
        query=query,
        limit=limit,
        agent_id=agent_id,
        skill_type=skill_type,
        delta=delta,
        **kwargs,
    )


# ============================================================================
# Registration
# ============================================================================

def register_collective_tools(registry: ToolRegistry) -> None:
    """Register k_collective routed tool with the registry."""

    registry.register(
        name="k_collective",
        description="Collective intelligence - shared knowledge that agents learn from. Actions: help, record_success, record_failure, query_patterns, get_skill_matrix, update_skill",
        input_schema={
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["help", "record_success", "record_failure", "query_patterns", "get_skill_matrix", "update_skill"],
                    "description": "Action to perform",
                },
                "task_type": {
                    "type": "string",
                    "description": "Type of task (for record_success/failure)",
                },
                "approach": {
                    "type": "string",
                    "description": "Approach used (for record_success/failure)",
                },
                "evidence": {
                    "type": "string",
                    "description": "Evidence of success (for record_success)",
                },
                "reason": {
                    "type": "string",
                    "description": "Reason for failure (for record_failure)",
                },
                "query": {
                    "type": "string",
                    "description": "Query text (for query_patterns)",
                },
                "limit": {
                    "type": "integer",
                    "default": 10,
                    "description": "Max results (for query_patterns)",
                },
                "agent_id": {
                    "type": "string",
                    "description": "Agent ID (for update_skill, optional for record_*)",
                },
                "skill_type": {
                    "type": "string",
                    "description": "Skill type (for update_skill)",
                },
                "delta": {
                    "type": "number",
                    "default": 0.0,
                    "description": "Score change (for update_skill)",
                },
            },
            "required": ["action"],
        },
        handler=k_collective,
    )
