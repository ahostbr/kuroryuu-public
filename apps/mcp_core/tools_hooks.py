"""Hook MCP Tools for External CLI Integration - Routed k_session tool.

Exposes Kuroryuu hooks as MCP tools that spawned CLIs can call.

Routed tool: k_session(action, ...)
Actions: help, start, end, context, pre_tool, post_tool, log
"""

import json
import os
import re
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

import httpx

from protocol import ToolRegistry
from sessions import get_session_manager

try:
    from .tools_checkpoint import _load_latest_for_agent, _action_save as _checkpoint_save, _get_checkpoint_root
    from .paths import get_ai_dir_or_env, get_project_root
except ImportError:
    from tools_checkpoint import _load_latest_for_agent, _action_save as _checkpoint_save, _get_checkpoint_root
    from paths import get_ai_dir_or_env, get_project_root

logger = logging.getLogger("kuroryuu.mcp_core.k_session")
GATEWAY_URL = os.environ.get("KURORYUU_GATEWAY_URL", "http://127.0.0.1:8200")

AI_DIR = get_ai_dir_or_env("KURORYUU_HOOKS_DIR")
TODO_PATH = AI_DIR / "todo.md"
TODO_STRICT = os.environ.get("KURORYUU_TODO_STRICT", "0") == "1"
WORKING_MEMORY_PATH = AI_DIR / "working_memory.json"


def _read_todo() -> str:
    """Read todo.md content."""
    if TODO_PATH.exists():
        return TODO_PATH.read_text(encoding="utf-8")
    return ""


def _build_context() -> str:
    """Build formatted context block from todo.md."""
    content = _read_todo()
    lines = ["---", "## Kuroryuu Context", ""]

    # Extract unchecked tasks
    tasks = re.findall(r"- \[ \] (T\d+) — ([^\n]+)", content)[:5]
    if tasks:
        lines.append("**Next Tasks:**")
        for tid, desc in tasks:
            lines.append(f"- {tid} — {desc.strip()}")
    else:
        lines.append("**No unchecked tasks.**")

    lines.extend(["", "---"])
    return "\n".join(lines)


# ============================================================================
# Resumption context (zero-cost memory injection)
# ============================================================================

def _read_working_memory() -> Optional[Dict[str, Any]]:
    """Read ai/working_memory.json."""
    if not WORKING_MEMORY_PATH.exists():
        return None
    try:
        return json.loads(WORKING_MEMORY_PATH.read_text(encoding="utf-8"))
    except Exception:
        return None


def _format_working_memory(wm: Dict[str, Any]) -> str:
    """Format working memory into a concise context block."""
    lines = ["**Working Memory:**"]
    goal = wm.get("active_goal", "")
    if goal:
        lines.append(f"- Goal: {goal}")
    blockers = wm.get("blockers", [])
    if blockers:
        lines.append(f"- Blockers: {', '.join(str(b) for b in blockers)}")
    else:
        lines.append("- Blockers: None")
    steps = wm.get("next_steps", [])
    if steps:
        lines.append("- Next steps:")
        for s in steps[:5]:
            lines.append(f"  - {s}")
    return "\n".join(lines)


def _format_checkpoint_summary(cp: Dict[str, Any]) -> str:
    """Format a checkpoint into a concise resumption block."""
    lines = []
    cp_id = cp.get("id", "unknown")
    cp_name = cp.get("name", "")
    saved_at = cp.get("saved_at", "")

    lines.append(f"**Checkpoint:** {cp_id}" + (f" — {cp_name}" if cp_name else ""))
    if saved_at:
        lines.append(f"**Saved:** {saved_at}")

    # Task IDs from checkpoint data
    data = cp.get("data", {})
    if isinstance(data, dict):
        task_ids = data.get("task_ids", [])
        if task_ids:
            lines.append(f"**Tasks:** {', '.join(task_ids)}")
        plan_file = data.get("plan_file")
        if plan_file:
            lines.append(f"**Plan:** {plan_file}")

    summary = cp.get("summary", "")
    if summary:
        lines.append(f"**Summary:** {summary[:300]}")

    return "\n".join(lines)


def _read_worklog_summary(worklog_path: str, max_chars: int = 500) -> Optional[str]:
    """Read first ~max_chars of a worklog file's Summary section."""
    project_root = get_project_root()
    full_path = project_root / worklog_path.replace("\\", "/")
    if not full_path.exists():
        return None
    try:
        content = full_path.read_text(encoding="utf-8")
        # Extract ## Summary section
        match = re.search(r"## Summary\n(.*?)(?=\n## |\Z)", content, re.DOTALL)
        if match:
            summary_text = match.group(1).strip()[:max_chars]
            return f"**Worklog ({worklog_path}):**\n{summary_text}"
        # Fallback: return first max_chars of the file
        return f"**Worklog ({worklog_path}):**\n{content[:max_chars]}"
    except Exception:
        return None


def _extract_last_assistant_message(agent_id: str) -> Optional[str]:
    """Extract the last assistant text message from the most recent transcript export.

    Scans ai/exports/ for the newest .jsonl file and reads backward to find
    the last assistant message. Strips system tags and truncates.
    """
    exports_dir = get_project_root() / "ai" / "exports"
    if not exports_dir.exists():
        return None

    try:
        # Find the most recent date directory
        date_dirs = sorted(
            [d for d in exports_dir.iterdir() if d.is_dir()],
            key=lambda d: d.name,
            reverse=True,
        )
        if not date_dirs:
            return None

        # Find most recent .jsonl in the newest date dir
        for date_dir in date_dirs[:3]:  # Check last 3 days
            jsonl_files = sorted(
                date_dir.glob("*.jsonl"),
                key=lambda p: p.stat().st_mtime,
                reverse=True,
            )
            for jf in jsonl_files[:5]:  # Check last 5 transcripts per day
                result = _scan_transcript_for_assistant_msg(jf)
                if result:
                    return result
    except Exception:
        pass
    return None


def _scan_transcript_for_assistant_msg(jsonl_path: Path, max_chars: int = 500) -> Optional[str]:
    """Scan a transcript .jsonl backward for the last assistant text message."""
    try:
        lines = jsonl_path.read_text(encoding="utf-8").strip().split("\n")
        # Scan from end
        for line in reversed(lines):
            if not line.strip():
                continue
            try:
                entry = json.loads(line)
            except json.JSONDecodeError:
                continue
            if entry.get("type") != "assistant":
                continue
            msg = entry.get("message", {})
            if msg.get("role") != "assistant":
                continue
            content = msg.get("content", [])
            if isinstance(content, str):
                text = content
            elif isinstance(content, list):
                # Find the last text block
                text_parts = [c.get("text", "") for c in content if isinstance(c, dict) and c.get("type") == "text"]
                if not text_parts:
                    continue
                text = text_parts[-1]
            else:
                continue
            if not text.strip():
                continue
            # Strip system-reminder tags
            text = re.sub(r"<system-reminder>.*?</system-reminder>", "", text, flags=re.DOTALL).strip()
            if text:
                return text[:max_chars]
    except Exception:
        pass
    return None


def _is_memory_injection_enabled() -> bool:
    """Check if smart session start (memory injection) is enabled in kuroPlugin config.

    Reads .claude/settings.json → kuroPlugin.features.smartSessionStart.
    Defaults to True if the key doesn't exist (opt-out, not opt-in).
    """
    settings_path = get_project_root() / ".claude" / "settings.json"
    try:
        if settings_path.exists():
            data = json.loads(settings_path.read_text(encoding="utf-8"))
            features = data.get("kuroPlugin", {}).get("features", {})
            return features.get("smartSessionStart", True)
    except Exception:
        pass
    return True


def _is_auto_checkpoint_enabled() -> bool:
    """Check if auto-checkpoint on session end is enabled.

    Reads .claude/settings.json → kuroPlugin.features.autoCheckpointOnEnd.
    Defaults to True if the key doesn't exist.
    """
    settings_path = get_project_root() / ".claude" / "settings.json"
    try:
        if settings_path.exists():
            data = json.loads(settings_path.read_text(encoding="utf-8"))
            features = data.get("kuroPlugin", {}).get("features", {})
            return features.get("autoCheckpointOnEnd", True)
    except Exception:
        pass
    return True


def _is_previously_enabled() -> bool:
    """Check if 'Previously' transcript extraction is enabled.

    Reads .claude/settings.json → kuroPlugin.features.previouslySection.
    Defaults to True if the key doesn't exist.
    """
    settings_path = get_project_root() / ".claude" / "settings.json"
    try:
        if settings_path.exists():
            data = json.loads(settings_path.read_text(encoding="utf-8"))
            features = data.get("kuroPlugin", {}).get("features", {})
            return features.get("previouslySection", True)
    except Exception:
        pass
    return True


def _build_resumption_context(agent_id: str) -> str:
    """Build resumption context block for an agent.

    Reads checkpoint, worklog, working memory, and last assistant message.
    All file reads — zero LLM cost.
    """
    if not _is_memory_injection_enabled():
        return ""

    # Resolve agent_id: param > env > "unknown"
    resolved_id = agent_id or os.environ.get("KURORYUU_AGENT_ID", "")
    if not resolved_id:
        return ""

    sections: List[str] = []
    sections.append(f"## Last Session Context (agent: {resolved_id})")

    # 1. Last checkpoint for this agent
    checkpoint = _load_latest_for_agent(resolved_id)
    if checkpoint:
        sections.append(_format_checkpoint_summary(checkpoint))

        # 2. Linked worklog (from checkpoint's data.worklog_files)
        data = checkpoint.get("data", {})
        if isinstance(data, dict):
            wl_files = data.get("worklog_files", [])
            if wl_files:
                wl_summary = _read_worklog_summary(wl_files[-1])
                if wl_summary:
                    sections.append(wl_summary)

    # 3. Working memory (goals, blockers, next steps)
    wm = _read_working_memory()
    if wm:
        goal = wm.get("active_goal", "")
        steps = wm.get("next_steps", [])
        if goal or steps:
            sections.append(_format_working_memory(wm))

    # 4. "Previously" — last assistant message from prior transcript
    if _is_previously_enabled():
        last_msg = _extract_last_assistant_message(resolved_id)
        if last_msg:
            sections.append(f"**Previously:**\n{last_msg}")

    if len(sections) <= 1:
        return ""  # Only header, no content

    return "\n\n".join(sections)


# ============================================================================
# Action implementations
# ============================================================================

def _action_help(**kwargs: Any) -> Dict[str, Any]:
    """List available actions for k_session."""
    return {
        "ok": True,
        "data": {
            "tool": "k_session",
            "description": "Session/hook lifecycle management for spawned CLIs",
            "actions": {
                "help": "Show this help",
                "start": "Register a CLI session. Params: process_id, cli_type, agent_id (all required)",
                "end": "End a CLI session. Params: session_id (required), exit_code, summary",
                "context": "Get formatted todo.md context. Params: session_id (required)",
                "pre_tool": "Check before tool execution. Params: session_id, tool_name (required), arguments",
                "post_tool": "Track tool result. Params: session_id, tool_name, result_ok (required), result_summary",
                "log": "Append custom log entry. Params: session_id, message (required)",
            },
        },
        "error": None,
    }


def _action_start(
    process_id: int = 0,
    cli_type: str = "",
    agent_id: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Register a spawned CLI session and return resumption context."""
    if not process_id:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "process_id is required"}
    if not cli_type:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "cli_type is required"}
    if not agent_id:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "agent_id is required"}

    mgr = get_session_manager()
    session = mgr.create(process_id, cli_type, agent_id, None)
    context = _build_context()

    # Build resumption context (zero-cost: file reads only)
    resumption_context = ""
    try:
        resumption_context = _build_resumption_context(agent_id)
    except Exception as e:
        logger.debug("Resumption context build failed (non-fatal): %s", e)

    # Auto-register with Gateway agent registry (fire-and-forget)
    gateway_registered = False
    try:
        resp = httpx.post(
            f"{GATEWAY_URL}/v1/agents/register",
            json={
                "model_name": cli_type or "unknown",
                "agent_id": agent_id,
                "role": "worker",
            },
            timeout=5.0,
        )
        gateway_registered = resp.status_code == 200
    except Exception as e:
        logger.debug("Gateway registration failed (non-fatal): %s", e)

    result: Dict[str, Any] = {
        "ok": True,
        "session_id": session.session_id,
        "gateway_registered": gateway_registered,
        "context": context,
    }
    if resumption_context:
        result["resumption_context"] = resumption_context

    return result


def _action_end(
    session_id: str = "",
    exit_code: int = 0,
    summary: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """End a CLI session. Auto-saves a lightweight checkpoint if enabled."""
    if not session_id:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "session_id is required"}

    mgr = get_session_manager()
    session = mgr.end(session_id, exit_code)
    if not session:
        return {"ok": False, "error_code": "NOT_FOUND", "message": "Session not found"}

    agent_id = session.agent_id if hasattr(session, "agent_id") else ""

    # Auto-checkpoint on session end (zero-cost: file write only)
    auto_checkpoint_id = ""
    if agent_id and _is_auto_checkpoint_enabled():
        try:
            # Gather in-progress task IDs from todo.md
            in_progress_tasks = []
            todo_content = _read_todo()
            if todo_content:
                # Match both checked and unchecked tasks with "in_progress" or just unchecked
                in_progress_tasks = re.findall(r"- \[ \] (T\d+)", todo_content)[:10]

            auto_data: Dict[str, Any] = {
                "agent_id": agent_id,
                "session_id": session_id,
                "task_ids": in_progress_tasks,
                "auto_saved": True,
            }

            # Include working memory snapshot
            wm = _read_working_memory()
            if wm:
                auto_data["active_goal"] = wm.get("active_goal", "")
                auto_data["next_steps"] = wm.get("next_steps", [])
                auto_data["blockers"] = wm.get("blockers", [])

            result = _checkpoint_save(
                name=f"auto_{agent_id}",
                data=auto_data,
                summary=summary or "Auto-saved at session end",
                agent_id=agent_id,
            )
            if result.get("ok"):
                auto_checkpoint_id = result.get("id", "")
                logger.debug("Auto-checkpoint saved for agent %s: %s", agent_id, auto_checkpoint_id)
        except Exception as e:
            logger.debug("Auto-checkpoint failed (non-fatal): %s", e)

    # Auto-deregister from Gateway (fire-and-forget)
    if agent_id:
        try:
            httpx.delete(f"{GATEWAY_URL}/v1/agents/{agent_id}", timeout=5.0)
        except Exception as e:
            logger.debug("Gateway deregister failed (non-fatal): %s", e)

    result_dict: Dict[str, Any] = {"ok": True, "session_id": session_id}
    if auto_checkpoint_id:
        result_dict["auto_checkpoint_id"] = auto_checkpoint_id
    return result_dict


def _action_context(
    session_id: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Get formatted todo.md context block."""
    if not session_id:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "session_id is required"}

    mgr = get_session_manager()
    session = mgr.get(session_id)
    if not session:
        return {"ok": False, "error_code": "NOT_FOUND", "message": "Session not found"}
    return {"ok": True, "context": _build_context()}


def _action_pre_tool(
    session_id: str = "",
    tool_name: str = "",
    arguments: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Check before tool execution. Can block."""
    if not session_id:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "session_id is required"}
    if not tool_name:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "tool_name is required"}

    mgr = get_session_manager()
    session = mgr.get(session_id)
    if not session:
        return {"ok": False, "allow": False, "reason": "Session not found"}

    # Rule: Strict mode + no unchecked tasks
    if TODO_STRICT:
        content = _read_todo()
        if not re.search(r"- \[ \] T\d+", content):
            return {"ok": True, "allow": False, "reason": "todo.md has no unchecked tasks (strict mode)"}

    return {"ok": True, "allow": True, "reason": ""}


def _action_post_tool(
    session_id: str = "",
    tool_name: str = "",
    result_ok: bool = True,
    result_summary: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Track tool result after execution."""
    if not session_id:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "session_id is required"}
    if not tool_name:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "tool_name is required"}

    mgr = get_session_manager()
    session = mgr.get(session_id)
    if not session:
        return {"ok": False, "error_code": "NOT_FOUND", "message": "Session not found"}

    mgr.track_tool(session_id, result_ok)

    return {"ok": True}


def _action_log(
    session_id: str = "",
    message: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Append custom log entry."""
    if not session_id:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "session_id is required"}
    if not message:
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "message is required"}

    mgr = get_session_manager()
    session = mgr.get(session_id)
    if not session:
        return {"ok": False, "error_code": "NOT_FOUND", "message": "Session not found"}

    return {"ok": True}


# ============================================================================
# Routed tool
# ============================================================================

ACTION_HANDLERS = {
    "help": _action_help,
    "start": _action_start,
    "end": _action_end,
    "context": _action_context,
    "pre_tool": _action_pre_tool,
    "post_tool": _action_post_tool,
    "log": _action_log,
}


def k_session(
    action: str,
    process_id: int = 0,
    cli_type: str = "",
    agent_id: str = "",
    session_id: str = "",
    exit_code: int = 0,
    summary: str = "",
    tool_name: str = "",
    arguments: str = "",
    result_ok: bool = True,
    result_summary: str = "",
    message: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Kuroryuu Session - Hook/lifecycle management for spawned CLIs.

    Routed tool with actions: help, start, end, context, pre_tool, post_tool, log

    Args:
        action: Action to perform (required)
        process_id: OS process ID (for start)
        cli_type: CLI type: kiro, claude, copilot, codex (for start)
        agent_id: Agent identifier (for start)
        session_id: Session ID (for end, context, pre_tool, post_tool, log)
        exit_code: Exit code (for end)
        summary: Summary text (for end)
        tool_name: Tool name (for pre_tool, post_tool)
        arguments: Tool arguments as string (for pre_tool)
        result_ok: Whether tool succeeded (for post_tool)
        result_summary: Tool result summary (for post_tool)
        message: Progress message (for log)

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
        process_id=process_id,
        cli_type=cli_type,
        agent_id=agent_id,
        session_id=session_id,
        exit_code=exit_code,
        summary=summary,
        tool_name=tool_name,
        arguments=arguments,
        result_ok=result_ok,
        result_summary=result_summary,
        message=message,
        **kwargs,
    )


# ============================================================================
# Registration
# ============================================================================

def register_hooks_tools(registry: ToolRegistry) -> None:
    """Register k_session routed tool with the registry."""

    registry.register(
        name="k_session",
        description="Session/hook lifecycle management. Actions: help, start, end, context, pre_tool, post_tool, log",
        input_schema={
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["help", "start", "end", "context", "pre_tool", "post_tool", "log"],
                    "description": "Action to perform",
                },
                "process_id": {
                    "type": "integer",
                    "description": "OS process ID (for start)",
                },
                "cli_type": {
                    "type": "string",
                    "description": "CLI type: kiro, claude, copilot, codex (for start)",
                },
                "agent_id": {
                    "type": "string",
                    "description": "Agent identifier (for start)",
                },
                "session_id": {
                    "type": "string",
                    "description": "Session ID (for end, context, pre_tool, post_tool, log)",
                },
                "exit_code": {
                    "type": "integer",
                    "default": 0,
                    "description": "Exit code (for end)",
                },
                "summary": {
                    "type": "string",
                    "description": "Summary text (for end)",
                },
                "tool_name": {
                    "type": "string",
                    "description": "Tool name (for pre_tool, post_tool)",
                },
                "arguments": {
                    "type": "string",
                    "description": "Tool arguments as string (for pre_tool)",
                },
                "result_ok": {
                    "type": "boolean",
                    "default": True,
                    "description": "Whether tool succeeded (for post_tool)",
                },
                "result_summary": {
                    "type": "string",
                    "description": "Tool result summary (for post_tool)",
                },
                "message": {
                    "type": "string",
                    "description": "Progress message (for log)",
                },
            },
            "required": ["action"],
        },
        handler=k_session,
    )
