"""Thinker Channel - Limited PTY tool for thinker-to-thinker communication.

NOT leader-only: Thinkers can use this tool to communicate with each other.

Unlike k_pty, this tool:
- Has NO leader-only check
- Only exposes send_line and read actions
- Targets by agent_id only (no session_id manipulation)
- Does NOT allow create, kill, resize, run, adopt, disown

Routed tool: k_thinker_channel(action, ...)
Actions: help, send_line, read
"""

from __future__ import annotations

import re
from typing import Any, Dict

import httpx

from pty_manager import get_pty_manager
from pty_registry import get_pty_registry


def _process_escape_sequences(data: str) -> str:
    """Convert common textual escape sequences to control characters.

    Copied from tools_pty.py for consistency.
    """
    if not data or "\\" not in data:
        return data

    out = data.replace("\\r\\n", "\r\n")

    def _hex_repl(match: re.Match[str]) -> str:
        return chr(int(match.group(1), 16))

    out = re.sub(r"\\x([0-9a-fA-F]{2})", _hex_repl, out)
    out = re.sub(r"\\r(?![A-Za-z0-9_])", "\r", out)
    out = re.sub(r"\\n(?![A-Za-z0-9_])", "\n", out)
    out = re.sub(r"\\t(?![A-Za-z0-9_])", "\t", out)

    return out


# ============================================================================
# Dangerous command blocking (Agent Safety)
# Same patterns as tools_pty.py for consistency
# ============================================================================

BLOCKED_COMMAND_PATTERNS = [
    # Destructive file operations
    r'rm\s+(-[rf]+\s+)*[/~]',       # rm -rf / or ~
    r'del\s+/[sqf]',                # Windows del with dangerous flags
    r'rmdir\s+/[sq]',               # Windows rmdir recursive
    r'rd\s+/[sq]',                  # Windows rd alias

    # Disk/partition operations
    r'format\s+[a-z]:',             # Format drives
    r'diskpart',                    # Disk partitioning
    r'mkfs\.',                      # Linux format
    r'dd\s+if=.+of=/dev',           # Disk write
    r'fdisk',                       # Partition editor

    # System damage
    r':\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;',  # Fork bomb
    r'%0\|%0',                      # Fork bomb (Windows)
    r'shutdown\s+[/-]',             # Shutdown commands
    r'\bhalt\b',                    # System halt
    r'init\s+0',                    # Linux halt

    # Credential/key access
    r'cat.+\.ssh/',                 # SSH keys
    r'type.+\\\.ssh\\',             # SSH keys (Windows)
    r'cat.+\.aws/',                 # AWS credentials
    r'cat.+\.config/gcloud',        # GCloud credentials
    r'reg\s+query.+SAM',            # Windows SAM
    r'mimikatz',                    # Credential dumper
    r'sekurlsa',                    # Mimikatz module

    # Download and execute
    r'curl.+\|\s*(ba)?sh',          # curl | bash
    r'wget.+-O-?\s*\|\s*(ba)?sh',   # wget | sh
    r'Invoke-WebRequest.+\|\s*iex', # PowerShell download exec
    r'IEX\s*\(.+DownloadString',    # PowerShell IEX variant

    # Reverse shells
    r'nc\s+.+-e\s+/bin/',           # Netcat reverse shell
    r'bash\s+-i\s+>&\s+/dev/tcp',   # Bash reverse shell
    r'ncat.+--exec',                # Ncat exec

    # Registry/system config attacks
    r'reg\s+(delete|add)\s+HK(LM|CU)',  # Registry modification
    r'bcdedit',                     # Boot config edit
    r'vssadmin\s+delete',           # Delete shadow copies
    r'wbadmin\s+delete',            # Delete backups
]


def _check_dangerous_command(cmd: str) -> Dict[str, Any] | None:
    """Check if command matches dangerous patterns. Returns error dict if blocked."""
    for pattern in BLOCKED_COMMAND_PATTERNS:
        if re.search(pattern, cmd, re.IGNORECASE):
            return {
                "ok": False,
                "error_code": "DANGEROUS_COMMAND_BLOCKED",
                "message": f"Command blocked by safety filter: matches dangerous pattern",
                "details": {"pattern": pattern, "command_preview": cmd[:100]},
            }
    return None


# ============================================================================
# Desktop routing helpers (simplified from tools_pty.py)
# ============================================================================

def _desktop_write(desktop_url: str, session_id: str, data: str) -> Dict[str, Any]:
    """Write data to Desktop PTY via HTTP bridge."""
    try:
        response = httpx.post(
            f"{desktop_url}/pty/write",
            json={"session_id": session_id, "data": data},
            timeout=10,
        )
        return response.json()
    except Exception as e:
        return {
            "ok": False,
            "error_code": "PTY_DESKTOP_ERROR",
            "message": str(e),
            "details": {"session_id": session_id, "desktop_url": desktop_url},
        }


def _desktop_read(desktop_url: str, session_id: str, timeout_ms: int) -> Dict[str, Any]:
    """Read from Desktop PTY via HTTP bridge."""
    try:
        response = httpx.post(
            f"{desktop_url}/pty/read",
            json={"session_id": session_id, "timeout_ms": timeout_ms},
            timeout=timeout_ms / 1000 + 5,
        )
        return response.json()
    except Exception as e:
        return {
            "ok": False,
            "error_code": "PTY_DESKTOP_ERROR",
            "message": str(e),
            "details": {"session_id": session_id, "desktop_url": desktop_url},
        }


# ============================================================================
# Action implementations
# ============================================================================

def _action_help(**kwargs: Any) -> Dict[str, Any]:
    """List available actions for k_thinker_channel."""
    return {
        "ok": True,
        "data": {
            "tool": "k_thinker_channel",
            "description": "Limited PTY tool for thinker-to-thinker communication (NOT leader-only)",
            "purpose": "Allow thinkers to send keystrokes to each other's terminals during debates",
            "actions": {
                "help": "Show this help",
                "send_line": "Send a line of text + Enter to target thinker. Params: target_agent_id (required), data (required)",
                "read": "Read recent output from target thinker. Params: target_agent_id (required), max_bytes, timeout_ms",
            },
            "not_available": [
                "create - Thinkers cannot create PTY sessions",
                "spawn_cli - Thinkers cannot spawn CLI workers",
                "kill - Thinkers cannot kill PTY sessions",
                "resize - Thinkers cannot resize terminals",
                "run - Thinkers cannot execute commands with sentinel",
                "adopt/disown - Thinkers cannot manage PTY ownership",
            ],
            "leader_only": False,
        },
        "error": None,
    }


def _action_send_line(
    target_agent_id: str = "",
    data: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Send a line of text + Enter to target thinker's terminal.

    Resolves target_agent_id to PTY session via registry, then sends the data.
    """
    if not target_agent_id:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "target_agent_id is required",
            "details": {},
        }

    if not data:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "data is required",
            "details": {},
        }

    # Check for dangerous commands (Agent Safety)
    danger_err = _check_dangerous_command(data)
    if danger_err:
        return danger_err

    # Resolve target_agent_id to session_id
    registry = get_pty_registry()
    resolve_result = registry.resolve(agent_id=target_agent_id)

    if not resolve_result.get("ok"):
        return resolve_result

    session_id = resolve_result["session_id"]
    session = registry.get(session_id)

    # Process escape sequences and strip newlines for single-line send
    processed_text = _process_escape_sequences(data)
    processed_text = processed_text.replace("\r", "").replace("\n", "")
    enter = "\r"

    # Route to desktop or local
    if session and session.source == "desktop" and session.desktop_url:
        first = _desktop_write(session.desktop_url, session_id, processed_text)
        second = _desktop_write(session.desktop_url, session_id, enter)
        return {
            "ok": True,
            "target_agent_id": target_agent_id,
            "session_id": session_id,
            "typed": first,
            "enter": second,
        }

    # Local session
    manager = get_pty_manager()
    first = manager.write(session_id, processed_text)
    second = manager.write(session_id, enter)
    return {
        "ok": True,
        "target_agent_id": target_agent_id,
        "session_id": session_id,
        "typed": first,
        "enter": second,
    }


def _action_read(
    target_agent_id: str = "",
    max_bytes: int = 4096,
    timeout_ms: int = 5000,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Read recent output from target thinker's terminal.

    Resolves target_agent_id to PTY session via registry, then reads output.
    """
    if not target_agent_id:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "target_agent_id is required",
            "details": {},
        }

    # Resolve target_agent_id to session_id
    registry = get_pty_registry()
    resolve_result = registry.resolve(agent_id=target_agent_id)

    if not resolve_result.get("ok"):
        return resolve_result

    session_id = resolve_result["session_id"]
    session = registry.get(session_id)

    timeout = int(timeout_ms) if timeout_ms else 5000

    # Route to desktop or local
    if session and session.source == "desktop" and session.desktop_url:
        result = _desktop_read(session.desktop_url, session_id, timeout)
        result["target_agent_id"] = target_agent_id
        return result

    # Local session
    manager = get_pty_manager()
    result = manager.read(
        session_id,
        max_bytes=int(max_bytes) if max_bytes else 4096,
        timeout_ms=timeout,
    )
    result["target_agent_id"] = target_agent_id
    return result


# ============================================================================
# Routed tool
# ============================================================================

ACTION_HANDLERS = {
    "help": _action_help,
    "send_line": _action_send_line,
    "read": _action_read,
}


def k_thinker_channel(
    action: str,
    target_agent_id: str = "",
    data: str = "",
    max_bytes: int = 4096,
    timeout_ms: int = 5000,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Kuroryuu Thinker Channel - Limited PTY for thinker communication.

    NOT leader-only: Thinkers can use this tool to communicate with each other.

    Routed tool with actions: help, send_line, read

    Args:
        action: Action to perform (required)
        target_agent_id: Agent ID of target thinker (required for send_line/read)
        data: Text to send (required for send_line)
        max_bytes: Max bytes to read (for read, default 4096)
        timeout_ms: Timeout in milliseconds (for read, default 5000)

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
        target_agent_id=target_agent_id,
        data=data,
        max_bytes=max_bytes,
        timeout_ms=timeout_ms,
        **kwargs,
    )


# ============================================================================
# Tool registration
# ============================================================================

def register_thinker_channel_tools(registry: "ToolRegistry") -> None:
    """Register k_thinker_channel routed tool with the registry."""

    registry.register(
        name="k_thinker_channel",
        description="Limited PTY tool for thinker-to-thinker communication (NOT leader-only). Actions: help, send_line, read",
        input_schema={
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["help", "send_line", "read"],
                    "description": "Action to perform",
                },
                "target_agent_id": {
                    "type": "string",
                    "description": "Agent ID of target thinker (required for send_line/read)",
                },
                "data": {
                    "type": "string",
                    "description": "Text to send (required for send_line)",
                },
                "max_bytes": {
                    "type": "integer",
                    "default": 4096,
                    "description": "Max bytes to read (for read)",
                },
                "timeout_ms": {
                    "type": "integer",
                    "default": 5000,
                    "description": "Timeout in milliseconds (for read)",
                },
            },
            "required": ["action"],
        },
        handler=k_thinker_channel,
    )
