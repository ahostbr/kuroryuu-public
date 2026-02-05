"""PTY tools - CLI control via pseudo-terminal for all agents.

All agents (leaders and workers) can use k_pty for direct PTY communication.
k_inbox remains available as a backup coordination method.

Routed tool: k_pty(action, ...)
Actions: help, list, create, write, send_line, read, talk, term_read, resize, resolve, send_line_to_agent

See: Docs/Specs/PTY_DAEMON_SPEC.md
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import socket
import time
from typing import Any, Dict, Optional, Tuple

import httpx

from pty_manager import get_pty_manager, PYWINPTY_AVAILABLE
from pty_registry import get_pty_registry
from command_security import (
    BLOCKED_COMMAND_PATTERNS,
    check_dangerous_command as _check_dangerous_command,
    redact_secrets as _redact_secrets,
)

# Shared async HTTP client (lazy initialization)
_async_client: Optional[httpx.AsyncClient] = None


def _get_async_client() -> httpx.AsyncClient:
    """Get or create the shared async HTTP client."""
    global _async_client
    if _async_client is None:
        _async_client = httpx.AsyncClient(timeout=30.0)
    return _async_client


async def _close_async_client() -> None:
    """Close the async client (call on shutdown)."""
    global _async_client
    if _async_client is not None:
        await _async_client.aclose()
        _async_client = None

# Gateway URL for leader status queries
GATEWAY_URL = os.environ.get("KURORYUU_GATEWAY_URL", "http://127.0.0.1:8200")

# ============================================================================
# PTY Traffic Event Emission (fire-and-forget to Gateway)
# ============================================================================

async def _emit_pty_event_async(
    action: str,
    session_id: str,
    agent_id: Optional[str] = None,
    owner_session_id: Optional[str] = None,
    command: Optional[str] = None,
    response: Optional[str] = None,
    duration: Optional[float] = None,
    success: bool = True,
    error_code: Optional[str] = None,
    error_message: Optional[str] = None,
    blocked: bool = False,
    blocked_pattern: Optional[str] = None,
    timeout_ms: Optional[int] = None,
    timed_out: bool = False,
    label: Optional[str] = None,
    cli_type: Optional[str] = None,
) -> None:
    """Emit PTY event to Gateway for traffic visualization (async, fire-and-forget).

    This is called from action handlers to report PTY operations.
    Failures are logged but do not block the PTY operation.
    """
    try:
        client = _get_async_client()

        # Build event payload
        event = {
            "action": action,
            "session_id": session_id,
            "agent_id": agent_id or os.environ.get("KURORYUU_AGENT_ID"),
            "owner_session_id": owner_session_id or os.environ.get("KURORYUU_SESSION_ID"),
            "command": command[:10000] if command and len(command) > 10000 else command,
            "command_size": len(command) if command else 0,
            "response": response[:10000] if response and len(response) > 10000 else response,
            "response_size": len(response) if response else 0,
            "response_truncated": len(response) > 10000 if response else False,
            "duration": duration,
            "success": success,
            "error_code": error_code,
            "error_message": error_message,
            "blocked": blocked,
            "blocked_pattern": blocked_pattern,
            "timeout_ms": timeout_ms,
            "timed_out": timed_out,
            "label": label,
            "cli_type": cli_type or os.environ.get("KURORYUU_CLI_TYPE"),
        }

        # Fire-and-forget POST to Gateway
        response = await client.post(
            f"{GATEWAY_URL}/v1/pty-traffic/emit",
            json=event,
            timeout=2.0,  # Short timeout - don't block PTY ops
        )
        if response.status_code != 200:
            print(f"[k_pty] Event emit failed: action={action} session={session_id} status={response.status_code}")
    except httpx.TimeoutException:
        print(f"[k_pty] Event emit timeout: action={action} session={session_id} (Gateway may be slow)")
    except httpx.ConnectError:
        print(f"[k_pty] Event emit connection failed: action={action} session={session_id} (Gateway may be down)")
    except Exception as e:
        # Log with context but don't fail the PTY operation
        print(f"[k_pty] Event emit error: action={action} session={session_id} error={type(e).__name__}: {e}")


def _emit_pty_event(
    action: str,
    session_id: str,
    agent_id: Optional[str] = None,
    owner_session_id: Optional[str] = None,
    command: Optional[str] = None,
    response: Optional[str] = None,
    duration: Optional[float] = None,
    success: bool = True,
    error_code: Optional[str] = None,
    error_message: Optional[str] = None,
    blocked: bool = False,
    blocked_pattern: Optional[str] = None,
    timeout_ms: Optional[int] = None,
    timed_out: bool = False,
    label: Optional[str] = None,
    cli_type: Optional[str] = None,
) -> None:
    """Emit PTY event to Gateway (sync version, fire-and-forget).

    Spawns async task if event loop is running, otherwise uses sync HTTP.
    """
    try:
        # Build event payload
        event = {
            "action": action,
            "session_id": session_id,
            "agent_id": agent_id or os.environ.get("KURORYUU_AGENT_ID"),
            "owner_session_id": owner_session_id or os.environ.get("KURORYUU_SESSION_ID"),
            "command": command[:10000] if command and len(command) > 10000 else command,
            "command_size": len(command) if command else 0,
            "response": response[:10000] if response and len(response) > 10000 else response,
            "response_size": len(response) if response else 0,
            "response_truncated": len(response) > 10000 if response else False,
            "duration": duration,
            "success": success,
            "error_code": error_code,
            "error_message": error_message,
            "blocked": blocked,
            "blocked_pattern": blocked_pattern,
            "timeout_ms": timeout_ms,
            "timed_out": timed_out,
            "label": label,
            "cli_type": cli_type or os.environ.get("KURORYUU_CLI_TYPE"),
        }

        # Try to get running event loop
        try:
            loop = asyncio.get_running_loop()
            # Schedule as task (fire-and-forget)
            loop.create_task(_emit_pty_event_async(
                action=action,
                session_id=session_id,
                agent_id=agent_id,
                owner_session_id=owner_session_id,
                command=command,
                response=response,
                duration=duration,
                success=success,
                error_code=error_code,
                error_message=error_message,
                blocked=blocked,
                blocked_pattern=blocked_pattern,
                timeout_ms=timeout_ms,
                timed_out=timed_out,
                label=label,
                cli_type=cli_type,
            ))
        except RuntimeError:
            # No event loop - use sync HTTP
            response = httpx.post(
                f"{GATEWAY_URL}/v1/pty-traffic/emit",
                json=event,
                timeout=2.0,
            )
            if response.status_code != 200:
                print(f"[k_pty] Event emit failed: action={action} session={session_id} status={response.status_code}")
    except httpx.TimeoutException:
        print(f"[k_pty] Event emit timeout: action={action} session={session_id} (Gateway may be slow)")
    except httpx.ConnectError:
        print(f"[k_pty] Event emit connection failed: action={action} session={session_id} (Gateway may be down)")
    except Exception as e:
        # Log with context but don't fail the PTY operation
        print(f"[k_pty] Event emit error: action={action} session={session_id} error={type(e).__name__}: {e}")

# Leader status cache: {agent_id: (is_leader, timestamp)}
# Short TTL ensures promotions are recognized quickly while reducing Gateway load
_leader_cache: Dict[str, Tuple[bool, float]] = {}
_LEADER_CACHE_TTL = 5.0  # seconds


def _process_escape_sequences(data: str) -> str:
    """Convert common textual escape sequences to control characters.

    Some clients/LLMs send newline/tab/control characters as literal text
    sequences (e.g. "\\r\\n") instead of actual 0x0D 0x0A.

    This intentionally avoids Python's unicode_escape decoder because it can
    throw on Windows-style paths containing sequences like "\\U" (e.g.
    "C:\\Users\\...") and would then skip all conversions.
    """
    if not data or "\\" not in data:
        return data

    # Safe multi-char sequence first.
    out = data.replace("\\r\\n", "\r\n")

    # Hex escapes: \xNN (e.g. \x03 for Ctrl+C). Only decode valid 2-hex forms.
    def _hex_repl(match: re.Match[str]) -> str:
        return chr(int(match.group(1), 16))

    out = re.sub(r"\\x([0-9a-fA-F]{2})", _hex_repl, out)

    # Single-letter escapes: only decode when not followed by an identifier
    # character to avoid mangling Windows paths like "C:\new" or "C:\temp".
    out = re.sub(r"\\r(?![A-Za-z0-9_])", "\r", out)
    out = re.sub(r"\\n(?![A-Za-z0-9_])", "\n", out)
    out = re.sub(r"\\t(?![A-Za-z0-9_])", "\t", out)

    return out


# ============================================================================
# Dangerous command blocking (Agent Safety)
# NOTE: BLOCKED_COMMAND_PATTERNS and _check_dangerous_command imported from command_security.py
# ============================================================================

# ============================================================================
# Leader-only enforcement
# ============================================================================

def _get_registered_leaders() -> set:
    """Get registered leaders from server module (lazy import to avoid circular deps)."""
    try:
        from server import get_registered_leaders
        return get_registered_leaders()
    except ImportError:
        return set()


async def _query_gateway_leader_async() -> Optional[str]:
    """Query Gateway for current leader agent_id (async version).

    Returns the leader's agent_id, or None if no leader or query fails.
    """
    try:
        client = _get_async_client()
        url = f"{GATEWAY_URL}/v1/agents/leader"
        response = await client.get(url, timeout=2.0)
        if response.status_code == 404:
            # No leader registered - that's fine
            return None
        response.raise_for_status()
        data = response.json()
        return data.get("agent_id")
    except httpx.HTTPStatusError as e:
        print(f"[k_pty] Gateway leader query HTTP error: {e.response.status_code}")
        return None
    except httpx.RequestError as e:
        # Network error (connection refused, DNS failure, etc.)
        print(f"[k_pty] Gateway leader query request error: {e}")
        return None
    except json.JSONDecodeError as e:
        # Invalid JSON response
        print(f"[k_pty] Gateway leader query JSON decode error: {e}")
        return None


def _query_gateway_leader() -> Optional[str]:
    """Query Gateway for current leader agent_id (sync wrapper).

    Returns the leader's agent_id, or None if no leader or query fails.
    Uses sync httpx for contexts where async isn't available.
    """
    try:
        url = f"{GATEWAY_URL}/v1/agents/leader"
        response = httpx.get(url, timeout=2.0)
        if response.status_code == 404:
            # No leader registered - that's fine
            return None
        response.raise_for_status()
        data = response.json()
        return data.get("agent_id")
    except httpx.HTTPStatusError as e:
        print(f"[k_pty] Gateway leader query HTTP error: {e.response.status_code}")
        return None
    except httpx.RequestError as e:
        # Network error (connection refused, DNS failure, etc.)
        print(f"[k_pty] Gateway leader query request error: {e}")
        return None
    except json.JSONDecodeError as e:
        # Invalid JSON response
        print(f"[k_pty] Gateway leader query JSON decode error: {e}")
        return None


# Desktop Bridge URL for leader verification
DESKTOP_BRIDGE_URL = os.environ.get("KURORYUU_DESKTOP_URL", "http://127.0.0.1:8201")


async def _query_desktop_leader_async(session_id: str) -> Optional[bool]:
    """Query Desktop bridge for leader status of a session (async version).

    Desktop is the authoritative source for leader terminal identity.
    MCP Core calls this to verify if a PTY session belongs to the leader.

    Args:
        session_id: The PTY session ID to check

    Returns:
        True if session is leader, False if not, None on error (Desktop unavailable)
    """
    try:
        # Normalize session ID (remove hyphens, first 16 chars)
        normalized_id = session_id.replace("-", "")[:16]

        client = _get_async_client()
        url = f"{DESKTOP_BRIDGE_URL}/pty/is-leader?session_id={normalized_id}"
        response = await client.get(url, timeout=2.0)
        response.raise_for_status()
        data = response.json()
        is_leader = data.get("is_leader", False)

        # Debug logging
        print(
            f"[k_pty] Desktop leader query: session={session_id}, normalized={normalized_id}, "
            f"is_leader={is_leader}, leader_id={data.get('leader_terminal_id')}"
        )
        return is_leader
    except httpx.HTTPStatusError as e:
        # HTTP error from Desktop
        print(f"[k_pty] Desktop leader query HTTP error: {e.response.status_code}")
        return None
    except httpx.RequestError as e:
        # Desktop not available (connection refused, etc.)
        print(f"[k_pty] Desktop leader query request error: {e}")
        return None
    except json.JSONDecodeError as e:
        # Invalid JSON response
        print(f"[k_pty] Desktop leader query JSON decode error: {e}")
        return None


def _query_desktop_leader(session_id: str) -> Optional[bool]:
    """Query Desktop bridge for leader status of a session (sync version).

    Desktop is the authoritative source for leader terminal identity.
    MCP Core calls this to verify if a PTY session belongs to the leader.

    Args:
        session_id: The PTY session ID to check

    Returns:
        True if session is leader, False if not, None on error (Desktop unavailable)
    """
    try:
        # Normalize session ID (remove hyphens, first 16 chars)
        normalized_id = session_id.replace("-", "")[:16]

        url = f"{DESKTOP_BRIDGE_URL}/pty/is-leader?session_id={normalized_id}"
        response = httpx.get(url, timeout=2.0)
        response.raise_for_status()
        data = response.json()
        is_leader = data.get("is_leader", False)

        # Debug logging
        print(
            f"[k_pty] Desktop leader query: session={session_id}, normalized={normalized_id}, "
            f"is_leader={is_leader}, leader_id={data.get('leader_terminal_id')}"
        )
        return is_leader
    except httpx.HTTPStatusError as e:
        # HTTP error from Desktop
        print(f"[k_pty] Desktop leader query HTTP error: {e.response.status_code}")
        return None
    except httpx.RequestError as e:
        # Desktop not available (connection refused, etc.)
        print(f"[k_pty] Desktop leader query request error: {e}")
        return None
    except json.JSONDecodeError as e:
        # Invalid JSON response
        print(f"[k_pty] Desktop leader query JSON decode error: {e}")
        return None


def _is_leader(caller_agent_id: Optional[str] = None) -> bool:
    """Check if an agent is a leader.

    LEADER-ONLY ENFORCEMENT (Phase 0, Tier 1.1):
    Workers MUST NOT use k_pty. All PTY operations are restricted to leaders.
    This is a hard boundary - violations are logged and rejected immediately.

    Args:
        caller_agent_id: Agent ID from k_pty request (preferred).
                         Falls back to env var for direct shell usage.

    Checks in order:
    1. Check if agent is in Desktop-registered leaders (most trusted)
    2. Check cache (5s TTL)
    3. Check env vars (fast path for bootstrap-set values)
    4. Query Gateway for authoritative leader status

    See KURORYUU_LAWS.md section 2: PTY GOVERNANCE
    """
    # Use provided agent_id or fall back to env var
    agent_id = caller_agent_id or os.environ.get("KURORYUU_AGENT_ID")
    now = time.time()

    # PRIORITY 1: Check Desktop-registered leaders (most trusted source)
    # Desktop explicitly registered this agent via /_x9k_register_leader
    registered_leaders = _get_registered_leaders()
    if agent_id and agent_id in registered_leaders:
        _leader_cache[agent_id] = (True, now)
        return True

    # PRIORITY 2: Query Desktop for session-based leader verification
    # Desktop tracks which terminal is the leader - this is the authoritative source
    session_id = os.environ.get("KURORYUU_SESSION_ID")
    pty_session_id = session_id  # Assume PTY session ID initially

    # If we have a k_session ID or agent_id, resolve it to PTY session via registry
    if session_id and not session_id.startswith("pty_"):
        # This looks like a k_session ID or agent_id - resolve to PTY
        registry = get_pty_registry()
        # Try resolving by owner_session_id first, then by agent_id
        resolve_result = registry.resolve(owner_session_id=session_id)
        if not resolve_result.get("ok") and agent_id:
            # Fall back to agent_id lookup
            resolve_result = registry.resolve(agent_id=agent_id)

        if resolve_result.get("ok"):
            pty_session_id = resolve_result.get("session_id")
            print(f"[k_pty] Resolved {session_id} → PTY session {pty_session_id}")

    if pty_session_id:
        desktop_result = _query_desktop_leader(pty_session_id)
        if desktop_result is not None:
            if agent_id:
                _leader_cache[agent_id] = (desktop_result, now)
            return desktop_result

    # Check cache (if we have an agent_id)
    if agent_id and agent_id in _leader_cache:
        is_leader, cached_at = _leader_cache[agent_id]
        if now - cached_at < _LEADER_CACHE_TTL:
            return is_leader

    # Fast path: Check primary env var set during leader session start
    # This is set by KURORYUU_LEADER.md bootstrap (line 3: export KURORYUU_IS_LEADER=1)
    if os.environ.get("KURORYUU_IS_LEADER", "").strip() in ("1", "true", "yes"):
        if agent_id:
            _leader_cache[agent_id] = (True, now)
        return True

    # Check secondary env var (KURORYUU_AGENT_ROLE)
    # Set by role-specific worker bootstrap
    if os.environ.get("KURORYUU_AGENT_ROLE", "").lower() == "leader":
        if agent_id:
            _leader_cache[agent_id] = (True, now)
        return True

    # Query Gateway for authoritative leader status
    gateway_leader_id = _query_gateway_leader()
    if gateway_leader_id and agent_id:
        is_leader = (gateway_leader_id == agent_id)
        _leader_cache[agent_id] = (is_leader, now)
        return is_leader

    # HARD BOUNDARY: Default is to REJECT (not allow)
    # Phase 0 governance enforcement removes the permissive default.
    # If you see "not a leader" errors, ensure:
    # 1. Agent registered with role="leader" via POST /v1/agents/register
    # 2. Leader bootstrap ran (KURORYUU_LEADER.md)
    # 3. KURORYUU_IS_LEADER=1 exported in leader's shell session
    # 4. Agent promoted via Desktop Promote button (queries Gateway)
    # 5. Desktop registered leader via /_x9k_register_leader
    if agent_id:
        _leader_cache[agent_id] = (False, now)
    return False


def _leader_only_check(caller_agent_id: Optional[str] = None) -> Dict[str, Any] | None:
    """Return error if not leader, None otherwise.

    Args:
        caller_agent_id: Agent ID from k_pty request to check.
    """
    if not _is_leader(caller_agent_id):
        return {
            "ok": False,
            "error_code": "PTY_LEADER_ONLY",
            "message": "k_pty is LEADER-ONLY. Workers must use k_inbox for coordination.",
            "details": {"checked_agent_id": caller_agent_id},
        }
    return None


# ============================================================================
# Desktop routing helpers (async versions for non-blocking I/O)
# ============================================================================

async def _desktop_talk_async(
    desktop_url: str,
    session_id: str,
    command: str,
    sentinel: str,
    timeout_ms: int,
) -> Dict[str, Any]:
    """Execute command on Desktop PTY via HTTP bridge (async version)."""
    try:
        client = _get_async_client()
        response = await client.post(
            f"{desktop_url}/pty/talk",
            json={
                "session_id": session_id,
                "command": command,
                "sentinel": sentinel,
                "timeout_ms": timeout_ms,
            },
            timeout=timeout_ms / 1000 + 5,  # Add 5s buffer
        )
        return response.json()
    except httpx.TimeoutException:
        return {
            "ok": False,
            "error_code": "PTY_DESKTOP_TIMEOUT",
            "message": f"Desktop bridge request timed out after {timeout_ms}ms",
            "details": {"session_id": session_id, "desktop_url": desktop_url},
        }
    except httpx.RequestError as e:
        return {
            "ok": False,
            "error_code": "PTY_DESKTOP_REQUEST_ERROR",
            "message": f"Desktop bridge request error: {e}",
            "details": {"session_id": session_id, "desktop_url": desktop_url},
        }
    except json.JSONDecodeError as e:
        return {
            "ok": False,
            "error_code": "PTY_DESKTOP_JSON_ERROR",
            "message": f"Invalid JSON response from Desktop: {e}",
            "details": {"session_id": session_id, "desktop_url": desktop_url},
        }


def _desktop_talk(
    desktop_url: str,
    session_id: str,
    command: str,
    sentinel: str,
    timeout_ms: int,
) -> Dict[str, Any]:
    """Execute command on Desktop PTY via HTTP bridge (sync version)."""
    try:
        response = httpx.post(
            f"{desktop_url}/pty/talk",
            json={
                "session_id": session_id,
                "command": command,
                "sentinel": sentinel,
                "timeout_ms": timeout_ms,
            },
            timeout=timeout_ms / 1000 + 5,  # Add 5s buffer
        )
        return response.json()
    except httpx.TimeoutException:
        return {
            "ok": False,
            "error_code": "PTY_DESKTOP_TIMEOUT",
            "message": f"Desktop bridge request timed out after {timeout_ms}ms",
            "details": {"session_id": session_id, "desktop_url": desktop_url},
        }
    except httpx.RequestError as e:
        return {
            "ok": False,
            "error_code": "PTY_DESKTOP_REQUEST_ERROR",
            "message": f"Desktop bridge request error: {e}",
            "details": {"session_id": session_id, "desktop_url": desktop_url},
        }
    except json.JSONDecodeError as e:
        return {
            "ok": False,
            "error_code": "PTY_DESKTOP_JSON_ERROR",
            "message": f"Invalid JSON response from Desktop: {e}",
            "details": {"session_id": session_id, "desktop_url": desktop_url},
        }


async def _desktop_write_async(
    desktop_url: str,
    session_id: str,
    data: str,
) -> Dict[str, Any]:
    """Write data to Desktop PTY via HTTP bridge (async version)."""
    try:
        client = _get_async_client()
        response = await client.post(
            f"{desktop_url}/pty/write",
            json={"session_id": session_id, "data": data},
            timeout=10,
        )
        return response.json()
    except httpx.TimeoutException:
        return {
            "ok": False,
            "error_code": "PTY_DESKTOP_TIMEOUT",
            "message": "Desktop bridge write request timed out",
            "details": {"session_id": session_id, "desktop_url": desktop_url},
        }
    except httpx.RequestError as e:
        return {
            "ok": False,
            "error_code": "PTY_DESKTOP_ERROR",
            "message": str(e),
            "details": {"session_id": session_id, "desktop_url": desktop_url},
        }


def _desktop_write(
    desktop_url: str,
    session_id: str,
    data: str,
) -> Dict[str, Any]:
    """Write data to Desktop PTY via HTTP bridge (sync version)."""
    try:
        response = httpx.post(
            f"{desktop_url}/pty/write",
            json={"session_id": session_id, "data": data},
            timeout=10,
        )
        return response.json()
    except httpx.TimeoutException:
        return {
            "ok": False,
            "error_code": "PTY_DESKTOP_TIMEOUT",
            "message": "Desktop bridge write request timed out",
            "details": {"session_id": session_id, "desktop_url": desktop_url},
        }
    except httpx.RequestError as e:
        return {
            "ok": False,
            "error_code": "PTY_DESKTOP_ERROR",
            "message": str(e),
            "details": {"session_id": session_id, "desktop_url": desktop_url},
        }


async def _desktop_read_async(
    desktop_url: str,
    session_id: str,
    timeout_ms: int,
) -> Dict[str, Any]:
    """Read from Desktop PTY via HTTP bridge (async version)."""
    try:
        client = _get_async_client()
        response = await client.post(
            f"{desktop_url}/pty/read",
            json={"session_id": session_id, "timeout_ms": timeout_ms},
            timeout=timeout_ms / 1000 + 5,
        )
        return response.json()
    except httpx.TimeoutException:
        return {
            "ok": False,
            "error_code": "PTY_DESKTOP_TIMEOUT",
            "message": f"Desktop bridge read request timed out after {timeout_ms}ms",
            "details": {"session_id": session_id, "desktop_url": desktop_url},
        }
    except httpx.RequestError as e:
        return {
            "ok": False,
            "error_code": "PTY_DESKTOP_ERROR",
            "message": str(e),
            "details": {"session_id": session_id, "desktop_url": desktop_url},
        }


def _desktop_read(
    desktop_url: str,
    session_id: str,
    timeout_ms: int,
) -> Dict[str, Any]:
    """Read from Desktop PTY via HTTP bridge (sync version)."""
    try:
        response = httpx.post(
            f"{desktop_url}/pty/read",
            json={"session_id": session_id, "timeout_ms": timeout_ms},
            timeout=timeout_ms / 1000 + 5,
        )
        return response.json()
    except httpx.TimeoutException:
        return {
            "ok": False,
            "error_code": "PTY_DESKTOP_TIMEOUT",
            "message": f"Desktop bridge read request timed out after {timeout_ms}ms",
            "details": {"session_id": session_id, "desktop_url": desktop_url},
        }
    except httpx.RequestError as e:
        return {
            "ok": False,
            "error_code": "PTY_DESKTOP_ERROR",
            "message": str(e),
            "details": {"session_id": session_id, "desktop_url": desktop_url},
        }


async def _desktop_term_read_async(
    desktop_url: str,
    session_id: str,
    mode: str,
    max_lines: int,
    merge_wrapped: bool,
    marker_id: Optional[int],
    max_chars: int,
) -> Dict[str, Any]:
    """Read terminal buffer from Desktop xterm.js via HTTP bridge (async version)."""
    try:
        client = _get_async_client()
        response = await client.post(
            f"{desktop_url}/pty/buffer",
            json={
                "session_id": session_id,
                "mode": mode,
                "max_lines": max_lines,
                "merge_wrapped": merge_wrapped,
                "marker_id": marker_id,
            },
            timeout=10,
        )
        data = response.json()

        if not data.get("ok"):
            return data

        # Enforce max_chars cap
        text = data.get("text", "")
        truncated = False
        dropped_chars = 0
        if len(text) > max_chars:
            dropped_chars = len(text) - max_chars
            text = text[:max_chars]
            truncated = True

        # Redact secrets
        text = _redact_secrets(text)

        return {
            "ok": True,
            "text": text,
            "lines": data.get("lines", []),
            "truncated": truncated,
            "dropped_chars": dropped_chars,
            "cursor_line": data.get("cursorLine"),
            "viewport_y": data.get("viewportY"),
            "rows": data.get("rows"),
            "cols": data.get("cols"),
            "buffer_type": data.get("bufferType"),
            "marker_id": data.get("markerId"),
            "marker_line": data.get("markerLine"),
            "marker_disposed": data.get("markerDisposed", False),
        }
    except httpx.TimeoutException as e:
        return {
            "ok": False,
            "error_code": "PTY_DESKTOP_TIMEOUT",
            "message": f"Desktop bridge request timed out: {e}",
            "details": {"session_id": session_id, "desktop_url": desktop_url},
        }
    except httpx.RequestError as e:
        return {
            "ok": False,
            "error_code": "PTY_DESKTOP_REQUEST_ERROR",
            "message": f"Desktop bridge request error: {e}",
            "details": {"session_id": session_id, "desktop_url": desktop_url},
        }
    except json.JSONDecodeError as e:
        return {
            "ok": False,
            "error_code": "PTY_DESKTOP_JSON_ERROR",
            "message": f"Invalid JSON response from Desktop: {e}",
            "details": {"session_id": session_id, "desktop_url": desktop_url},
        }


def _desktop_term_read(
    desktop_url: str,
    session_id: str,
    mode: str,
    max_lines: int,
    merge_wrapped: bool,
    marker_id: Optional[int],
    max_chars: int,
) -> Dict[str, Any]:
    """Read terminal buffer from Desktop xterm.js via HTTP bridge (sync version)."""
    try:
        response = httpx.post(
            f"{desktop_url}/pty/buffer",
            json={
                "session_id": session_id,
                "mode": mode,
                "max_lines": max_lines,
                "merge_wrapped": merge_wrapped,
                "marker_id": marker_id,
            },
            timeout=10,
        )
        data = response.json()

        if not data.get("ok"):
            return data

        # Enforce max_chars cap
        text = data.get("text", "")
        truncated = False
        dropped_chars = 0
        if len(text) > max_chars:
            dropped_chars = len(text) - max_chars
            text = text[:max_chars]
            truncated = True

        # Redact secrets
        text = _redact_secrets(text)

        return {
            "ok": True,
            "text": text,
            "lines": data.get("lines", []),
            "truncated": truncated,
            "dropped_chars": dropped_chars,
            "cursor_line": data.get("cursorLine"),
            "viewport_y": data.get("viewportY"),
            "rows": data.get("rows"),
            "cols": data.get("cols"),
            "buffer_type": data.get("bufferType"),
            "marker_id": data.get("markerId"),
            "marker_line": data.get("markerLine"),
            "marker_disposed": data.get("markerDisposed", False),
        }
    except httpx.TimeoutException as e:
        return {
            "ok": False,
            "error_code": "PTY_DESKTOP_TIMEOUT",
            "message": f"Desktop bridge request timed out: {e}",
            "details": {"session_id": session_id, "desktop_url": desktop_url},
        }
    except httpx.RequestError as e:
        return {
            "ok": False,
            "error_code": "PTY_DESKTOP_REQUEST_ERROR",
            "message": f"Desktop bridge request error: {e}",
            "details": {"session_id": session_id, "desktop_url": desktop_url},
        }
    except json.JSONDecodeError as e:
        return {
            "ok": False,
            "error_code": "PTY_DESKTOP_JSON_ERROR",
            "message": f"Invalid JSON response from Desktop: {e}",
            "details": {"session_id": session_id, "desktop_url": desktop_url},
        }


# NOTE: _redact_secrets imported from command_security.py

# ============================================================================
# Action implementations
# ============================================================================

def _action_help(**kwargs: Any) -> Dict[str, Any]:
    """List available actions for k_pty."""
    return {
        "ok": True,
        "data": {
            "tool": "k_pty",
            "description": "PTY control for all agents (leaders and workers)",
            "pywinpty_available": PYWINPTY_AVAILABLE,
            "actions": {
                "help": "Show this help",
                "list": "List active PTY sessions",
                "create": "Create new PTY session. Params: shell, cwd, cols, rows",
                "write": "[DEPRECATED] Use send_line or talk instead. /pty/write removed for security.",
                "send_line": "Type a single line then press Enter. Params: session_id (required), data (required)",
                "read": "Read from PTY output. Params: session_id (required), max_bytes, timeout_ms",
                "talk": "Send text to agent's PTY with sentinel. Params: session_id (required), command (required), sentinel, timeout_ms",
                "term_read": "Read xterm.js buffer text (OPT-IN). Params: session_id (required), mode ('tail'|'viewport'|'delta'), max_lines (default: 40), max_chars (default: 12000), merge_wrapped, marker_id. Requires KURORYUU_TERM_BUFFER_ACCESS=on",
                # Targeted routing actions
                "resolve": "Resolve owner identity to PTY session_id. Params: agent_id, owner_session_id, label (at least one required). Returns exactly one PTY or error (never broadcasts).",
                "send_line_to_agent": "Type a line in PTY owned by specific agent. Params: data (required), agent_id/owner_session_id/label (at least one). Convenience wrapper: resolve -> send_line.",
            },
            "leader_only": False,  # All agents can now use k_pty
            "sentinel_pattern": "command; echo __KR_DONE_<uuid>__\\r\\n",
            "line_endings": "Use \\r\\n for Windows PowerShell",
            "targeted_routing": {
                "description": "Target PTYs by owner identity instead of session_id. Never broadcasts - ambiguity is an error.",
                "primary_key": "agent_id",
                "secondary_keys": ["owner_session_id (k_session.session_id)", "label"],
                "workflow": "1. Desktop registers PTY with owner metadata, THEN 2. Use 'resolve' or 'send_line_to_agent' to target by owner",
            },
            "term_buffer_access": {
                "description": "Opt-in terminal buffer reading via xterm.js (desktop sessions only)",
                "config_env": "KURORYUU_TERM_BUFFER_ACCESS",
                "modes": {
                    "off": "Disabled",
                    "on": "All agents can use term_read (default)",
                },
                "current_mode": TERM_BUFFER_ACCESS,
                "read_modes": ["tail (last N lines)", "viewport (visible window)", "delta (new since marker)"],
            },
        },
        "error": None,
    }


def _action_list(**kwargs: Any) -> Dict[str, Any]:
    """List active PTY sessions (local + desktop)."""
    # Leader check removed - all agents can use k_pty

    # Get local sessions from PTY manager
    manager = get_pty_manager()
    local_result = manager.list_sessions()

    # Get registered sessions from registry
    registry = get_pty_registry()
    registry_data = registry.to_dict()

    # Combine results
    local_sessions = local_result.get("sessions", [])
    for session in local_sessions:
        session["source"] = "local"

    # Add desktop sessions from registry
    desktop_sessions = [
        s for s in registry_data.get("sessions", [])
        if s.get("source") == "desktop"
    ]

    return {
        "ok": True,
        "sessions": local_sessions + desktop_sessions,
        "count": len(local_sessions) + len(desktop_sessions),
        "by_source": {
            "local": len(local_sessions),
            "desktop": len(desktop_sessions),
        },
    }


def _action_create(
    shell: str = "",
    cwd: str = "",
    cols: int = 120,
    rows: int = 30,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Create a new PTY session."""
    # Leader check removed - all agents can use k_pty

    manager = get_pty_manager()
    return manager.spawn(
        shell=shell or "powershell.exe",
        cwd=cwd or None,
        cols=int(cols) if cols else 120,
        rows=int(rows) if rows else 30,
    )


def _action_write(
    session_id: str = "",
    data: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Write data to PTY input.

    DEPRECATED: The /pty/write HTTP endpoint has been removed for security hardening.
    Use 'send_line' for sending commands or 'talk' for command execution with output capture.
    """
    return {
        "ok": False,
        "error_code": "DEPRECATED",
        "message": "k_pty(action='write') is deprecated - /pty/write endpoint removed for security",
        "details": {
            "alternatives": [
                "k_pty(action='send_line', session_id=..., data=...) - Send a line of text",
                "k_pty(action='talk', session_id=..., command=...) - Execute command with sentinel",
            ],
            "reason": "Security hardening - raw write access removed from HTTP bridge",
        },
    }


def _action_write_legacy(
    session_id: str = "",
    data: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Legacy write implementation - kept for reference but not exposed."""
    # Leader check removed - all agents can use k_pty

    if not session_id:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "session_id is required",
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

    # Process escape sequences (convert \\r\\n to actual \r\n)
    processed_data = _process_escape_sequences(data)

    # Check registry for session source
    registry = get_pty_registry()
    session = registry.get(session_id)

    if session and session.source == "desktop" and session.desktop_url:
        # Route to Desktop
        return _desktop_write(session.desktop_url, session_id, processed_data)

    # Local session
    manager = get_pty_manager()
    return manager.write(session_id, processed_data)


def _action_send_line(
    session_id: str = "",
    data: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Type a single line, then press Enter.

    This enforces the "plain text then Enter" flow:
    - Strips any embedded CR/LF from the typed text
    - Sends Enter as a separate write of only '\\r' (0x0D)
    """
    # Leader check removed - all agents can use k_pty
    start_time = time.time()

    if not session_id:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "session_id is required",
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
        # Emit blocked event
        _emit_pty_event(
            action="send_line",
            session_id=session_id,
            command=data,
            success=False,
            blocked=True,
            blocked_pattern=danger_err.get("details", {}).get("pattern"),
            error_code="DANGEROUS_COMMAND_BLOCKED",
            error_message=danger_err.get("message"),
            duration=(time.time() - start_time) * 1000,
        )
        return danger_err

    # Process any textual escapes, then force single-line text.
    processed_text = _process_escape_sequences(data)
    processed_text = processed_text.replace("\r", "").replace("\n", "")

    # Enter key (CR only; avoid LF to prevent literal newlines in some PTYs).
    enter = "\r"

    registry = get_pty_registry()
    session = registry.get(session_id)

    if session and session.source == "desktop" and session.desktop_url:
        first = _desktop_write(session.desktop_url, session_id, processed_text)
        second = _desktop_write(session.desktop_url, session_id, enter)
        result = {"ok": True, "typed": first, "enter": second}
    else:
        manager = get_pty_manager()
        first = manager.write(session_id, processed_text)
        second = manager.write(session_id, enter)
        result = {"ok": True, "typed": first, "enter": second}

    # Emit event
    duration = (time.time() - start_time) * 1000
    _emit_pty_event(
        action="send_line",
        session_id=session_id,
        command=data,
        duration=duration,
        success=result.get("ok", False),
        label=session.label if session else None,
    )

    return result


def _action_read(
    session_id: str = "",
    max_bytes: int = 4096,
    timeout_ms: int = 5000,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Read from PTY output."""
    # Leader check removed - all agents can use k_pty

    if not session_id:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "session_id is required",
            "details": {},
        }

    timeout = int(timeout_ms) if timeout_ms else 5000

    # Check registry for session source
    registry = get_pty_registry()
    session = registry.get(session_id)

    if session and session.source == "desktop" and session.desktop_url:
        # Route to Desktop
        return _desktop_read(session.desktop_url, session_id, timeout)

    # Local session
    manager = get_pty_manager()
    return manager.read(
        session_id,
        max_bytes=int(max_bytes) if max_bytes else 4096,
        timeout_ms=timeout,
    )


def _action_talk(
    session_id: str = "",
    command: str = "",
    sentinel: str = "",
    timeout_ms: int = 30000,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Send text to another agent's PTY with sentinel pattern for response capture."""
    # Leader check removed - all agents can use k_pty
    start_time = time.time()

    if not session_id:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "session_id is required",
            "details": {},
        }

    if not command:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "command is required",
            "details": {},
        }

    # Check for dangerous commands (Agent Safety)
    danger_err = _check_dangerous_command(command)
    if danger_err:
        # Emit blocked event
        _emit_pty_event(
            action="talk",
            session_id=session_id,
            command=command,
            success=False,
            blocked=True,
            blocked_pattern=danger_err.get("details", {}).get("pattern"),
            error_code="DANGEROUS_COMMAND_BLOCKED",
            error_message=danger_err.get("message"),
            duration=(time.time() - start_time) * 1000,
        )
        return danger_err

    # Process escape sequences in command (convert \\r\\n to actual \r\n)
    processed_command = _process_escape_sequences(command)

    timeout = int(timeout_ms) if timeout_ms else 30000

    # Check registry for session source
    registry = get_pty_registry()
    session = registry.get(session_id)

    if session and session.source == "desktop" and session.desktop_url:
        # Route to Desktop
        result = _desktop_talk(
            session.desktop_url,
            session_id,
            processed_command,
            sentinel or "",
            timeout,
        )
    else:
        # Local session
        manager = get_pty_manager()
        result = manager.run(
            session_id,
            processed_command,
            sentinel=sentinel or "",
            timeout_ms=timeout,
        )

    # Emit event
    duration = (time.time() - start_time) * 1000
    _emit_pty_event(
        action="talk",
        session_id=session_id,
        command=command,
        response=result.get("output") or result.get("text"),
        duration=duration,
        success=result.get("ok", False),
        error_code=result.get("error_code"),
        error_message=result.get("message") if not result.get("ok") else None,
        timeout_ms=timeout,
        timed_out=result.get("timed_out", False),
        label=session.label if session else None,
    )

    return result


# ============================================================================
# Terminal Buffer Access Configuration
# ============================================================================

# Two-mode configuration for terminal buffer access:
# - "off": term_read disabled
# - "on" (default): All agents can use term_read
# Note: "leader_only" mode removed - all agents now have equal access
TERM_BUFFER_ACCESS = os.environ.get("KURORYUU_TERM_BUFFER_ACCESS", "on").lower()
# Backwards compat: treat "all" as "on"
if TERM_BUFFER_ACCESS == "all":
    TERM_BUFFER_ACCESS = "on"

# Hard caps for buffer reading
MAX_LINES_CAP = 200
MAX_CHARS_CAP = 50000


def _action_term_read(
    session_id: str = "",
    mode: str = "tail",
    max_lines: int = 40,
    max_chars: int = 12000,
    merge_wrapped: bool = True,
    marker_id: Optional[int] = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Read terminal buffer text (xterm.js viewport-constrained).

    This is an OPT-IN feature that reads text from the xterm.js buffer.
    Only works for desktop sessions with xterm.js frontend.

    Configuration via KURORYUU_TERM_BUFFER_ACCESS env var:
    - "off": Disabled
    - "on" (default): All agents can use

    Args:
        session_id: PTY session ID (required)
        mode: Read mode - "tail" (default), "viewport", or "delta"
        max_lines: Maximum lines to return (default: 40, cap: 200)
        max_chars: Maximum characters to return (default: 12000, cap: 50000)
        merge_wrapped: Merge wrapped lines for readability (default: True)
        marker_id: Marker ID for delta mode (from previous call)

    Returns:
        {ok, text, lines, cursor_line, rows, cols, buffer_type, marker_id, ...}
    """
    # Check access mode configuration
    if TERM_BUFFER_ACCESS == "off":
        return {
            "ok": False,
            "error_code": "TERM_READ_DISABLED",
            "message": "Terminal buffer access is disabled. Set KURORYUU_TERM_BUFFER_ACCESS=on to enable.",
            "details": {"current_mode": TERM_BUFFER_ACCESS},
        }

    # All agents can use term_read when enabled (leader_only mode removed)

    if not session_id:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "session_id is required",
            "details": {},
        }

    # Validate mode
    if mode not in ("tail", "viewport", "delta"):
        return {
            "ok": False,
            "error_code": "INVALID_PARAM",
            "message": f"Invalid mode: {mode}. Must be 'tail', 'viewport', or 'delta'",
            "details": {},
        }

    # Enforce hard caps
    max_lines = min(int(max_lines) if max_lines else 40, MAX_LINES_CAP)
    max_chars = min(int(max_chars) if max_chars else 12000, MAX_CHARS_CAP)

    # Check registry for session source
    registry = get_pty_registry()
    session = registry.get(session_id)

    if not session:
        return {
            "ok": False,
            "error_code": "SESSION_NOT_FOUND",
            "message": f"Session not found: {session_id}",
            "details": {},
        }

    if session.source != "desktop" or not session.desktop_url:
        return {
            "ok": False,
            "error_code": "NOT_DESKTOP_SESSION",
            "message": "term_read only works for desktop sessions with xterm.js frontend",
            "details": {"session_source": session.source},
        }

    # Route to Desktop
    start_time = time.time()
    result = _desktop_term_read(
        session.desktop_url,
        session_id,
        mode,
        max_lines,
        bool(merge_wrapped) if merge_wrapped else True,
        int(marker_id) if marker_id else None,
        max_chars,
    )

    # Emit event for PTY Traffic Flow visualization
    duration = (time.time() - start_time) * 1000
    _emit_pty_event(
        action="term_read",
        session_id=session_id,
        command=f"mode={mode} max_lines={max_lines}",
        response=result.get("text", "")[:500] if result.get("ok") else None,
        duration=duration,
        success=result.get("ok", False),
        error_code=result.get("error_code"),
        error_message=result.get("message") if not result.get("ok") else None,
    )

    return result


def _action_resize(
    session_id: str = "",
    cols: int = 0,
    rows: int = 0,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Resize PTY terminal."""
    # Leader check removed - all agents can use k_pty

    if not session_id:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "session_id is required",
            "details": {},
        }

    if not cols or not rows:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "cols and rows are required",
            "details": {},
        }

    cols_int = int(cols)
    rows_int = int(rows)

    # Check registry for session source
    registry = get_pty_registry()
    session = registry.get(session_id)

    if session and session.source == "desktop":
        # Desktop sessions: resize not available via MCP (HTTP endpoint removed for security)
        return {
            "ok": False,
            "error_code": "DESKTOP_RESIZE_DISABLED",
            "message": "Resize is not available for desktop sessions via MCP. Use the Desktop UI to resize terminals.",
            "details": {"session_id": session_id, "source": "desktop"},
        }

    # Local session
    manager = get_pty_manager()
    return manager.resize(session_id, cols_int, rows_int)


# ============================================================================
# Targeted Routing Actions (Plan: PTY_TargetedRouting)
# ============================================================================

def _action_resolve(
    agent_id: str = "",
    owner_session_id: str = "",
    label: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Resolve owner identity to PTY session_id.

    Deterministic targeting: returns exactly one PTY or an error.
    Never broadcasts - ambiguity is an explicit error.
    """
    # Leader check removed - all agents can use k_pty

    if not any([agent_id, owner_session_id, label]):
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "At least one of agent_id, owner_session_id, or label is required",
            "details": {},
        }

    registry = get_pty_registry()
    return registry.resolve(
        agent_id=agent_id or None,
        owner_session_id=owner_session_id or None,
        label=label or None,
    )


def _action_send_line_to_agent(
    agent_id: str = "",
    owner_session_id: str = "",
    label: str = "",
    data: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Type a line in the PTY owned by a specific agent.

    Convenience wrapper: resolve -> send_line.
    Refuses to broadcast - only targets exactly one PTY.
    """
    # Leader check removed - all agents can use k_pty

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

    if not any([agent_id, owner_session_id, label]):
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "At least one of agent_id, owner_session_id, or label is required",
            "details": {},
        }

    # Resolve target PTY
    registry = get_pty_registry()
    resolve_result = registry.resolve(
        agent_id=agent_id or None,
        owner_session_id=owner_session_id or None,
        label=label or None,
    )

    if not resolve_result.get("ok"):
        return resolve_result

    target_session_id = resolve_result["session_id"]

    # Send line to resolved PTY
    send_result = _action_send_line(session_id=target_session_id, data=data)

    return {
        "ok": send_result.get("ok", False),
        "resolved_session_id": target_session_id,
        "resolved_session": resolve_result.get("session"),
        "send_result": send_result,
    }


# ============================================================================
# Async Action Handlers (for non-blocking I/O in async contexts)
# ============================================================================

async def _action_send_line_async(
    session_id: str = "",
    data: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Type a single line, then press Enter (async version)."""
    if not session_id:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "session_id is required",
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

    # Process any textual escapes, then force single-line text.
    processed_text = _process_escape_sequences(data)
    processed_text = processed_text.replace("\r", "").replace("\n", "")

    # Enter key (CR only; avoid LF to prevent literal newlines in some PTYs).
    enter = "\r"

    registry = get_pty_registry()
    session = registry.get(session_id)

    if session and session.source == "desktop" and session.desktop_url:
        first = await _desktop_write_async(session.desktop_url, session_id, processed_text)
        second = await _desktop_write_async(session.desktop_url, session_id, enter)
        return {"ok": True, "typed": first, "enter": second}

    # Local session - run in thread pool to avoid blocking
    manager = get_pty_manager()
    first = await asyncio.to_thread(manager.write, session_id, processed_text)
    second = await asyncio.to_thread(manager.write, session_id, enter)
    return {"ok": True, "typed": first, "enter": second}


async def _action_read_async(
    session_id: str = "",
    max_bytes: int = 4096,
    timeout_ms: int = 5000,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Read from PTY output (async version)."""
    if not session_id:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "session_id is required",
            "details": {},
        }

    timeout = int(timeout_ms) if timeout_ms else 5000

    # Check registry for session source
    registry = get_pty_registry()
    session = registry.get(session_id)

    if session and session.source == "desktop" and session.desktop_url:
        # Route to Desktop (async)
        return await _desktop_read_async(session.desktop_url, session_id, timeout)

    # Local session - run in thread pool to avoid blocking
    manager = get_pty_manager()
    return await asyncio.to_thread(
        manager.read,
        session_id,
        int(max_bytes) if max_bytes else 4096,
        timeout,
    )


async def _action_talk_async(
    session_id: str = "",
    command: str = "",
    sentinel: str = "",
    timeout_ms: int = 30000,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Send text to another agent's PTY with sentinel pattern (async version)."""
    if not session_id:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "session_id is required",
            "details": {},
        }

    if not command:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "command is required",
            "details": {},
        }

    # Check for dangerous commands (Agent Safety)
    danger_err = _check_dangerous_command(command)
    if danger_err:
        return danger_err

    # Process escape sequences in command (convert \\r\\n to actual \r\n)
    processed_command = _process_escape_sequences(command)

    timeout = int(timeout_ms) if timeout_ms else 30000

    # Check registry for session source
    registry = get_pty_registry()
    session = registry.get(session_id)

    if session and session.source == "desktop" and session.desktop_url:
        # Route to Desktop (async)
        return await _desktop_talk_async(
            session.desktop_url,
            session_id,
            processed_command,
            sentinel or "",
            timeout,
        )

    # Local session - run in thread pool to avoid blocking
    manager = get_pty_manager()
    return await asyncio.to_thread(
        manager.run,
        session_id,
        processed_command,
        sentinel or "",
        timeout,
    )


async def _action_term_read_async(
    session_id: str = "",
    mode: str = "tail",
    max_lines: int = 40,
    max_chars: int = 12000,
    merge_wrapped: bool = True,
    marker_id: Optional[int] = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Read terminal buffer text (async version)."""
    # Check access mode configuration
    if TERM_BUFFER_ACCESS == "off":
        return {
            "ok": False,
            "error_code": "TERM_READ_DISABLED",
            "message": "Terminal buffer access is disabled. Set KURORYUU_TERM_BUFFER_ACCESS=on to enable.",
            "details": {"current_mode": TERM_BUFFER_ACCESS},
        }

    if not session_id:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "session_id is required",
            "details": {},
        }

    # Validate mode
    if mode not in ("tail", "viewport", "delta"):
        return {
            "ok": False,
            "error_code": "INVALID_PARAM",
            "message": f"Invalid mode: {mode}. Must be 'tail', 'viewport', or 'delta'",
            "details": {},
        }

    # Enforce hard caps
    max_lines = min(int(max_lines) if max_lines else 40, MAX_LINES_CAP)
    max_chars = min(int(max_chars) if max_chars else 12000, MAX_CHARS_CAP)

    # Check registry for session source
    registry = get_pty_registry()
    session = registry.get(session_id)

    if not session:
        return {
            "ok": False,
            "error_code": "SESSION_NOT_FOUND",
            "message": f"Session not found: {session_id}",
            "details": {},
        }

    if session.source != "desktop" or not session.desktop_url:
        return {
            "ok": False,
            "error_code": "NOT_DESKTOP_SESSION",
            "message": "term_read only works for desktop sessions with xterm.js frontend",
            "details": {"session_source": session.source},
        }

    # Route to Desktop (async)
    return await _desktop_term_read_async(
        session.desktop_url,
        session_id,
        mode,
        max_lines,
        bool(merge_wrapped) if merge_wrapped else True,
        int(marker_id) if marker_id else None,
        max_chars,
    )


async def _action_send_line_to_agent_async(
    agent_id: str = "",
    owner_session_id: str = "",
    label: str = "",
    data: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Type a line in the PTY owned by a specific agent (async version)."""
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

    if not any([agent_id, owner_session_id, label]):
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "At least one of agent_id, owner_session_id, or label is required",
            "details": {},
        }

    # Resolve target PTY
    registry = get_pty_registry()
    resolve_result = registry.resolve(
        agent_id=agent_id or None,
        owner_session_id=owner_session_id or None,
        label=label or None,
    )

    if not resolve_result.get("ok"):
        return resolve_result

    target_session_id = resolve_result["session_id"]

    # Send line to resolved PTY (async)
    send_result = await _action_send_line_async(session_id=target_session_id, data=data)

    return {
        "ok": send_result.get("ok", False),
        "resolved_session_id": target_session_id,
        "resolved_session": resolve_result.get("session"),
        "send_result": send_result,
    }


# Async action handlers mapping
ASYNC_ACTION_HANDLERS = {
    "send_line": _action_send_line_async,
    "read": _action_read_async,
    "talk": _action_talk_async,
    "run": _action_talk_async,  # Backwards compatibility alias
    "term_read": _action_term_read_async,
    "send_line_to_agent": _action_send_line_to_agent_async,
}


# ============================================================================
# Routed tool
# ============================================================================

ACTION_HANDLERS = {
    "help": _action_help,
    "list": _action_list,
    "create": _action_create,
    "write": _action_write,
    "send_line": _action_send_line,
    "read": _action_read,
    "talk": _action_talk,
    "run": _action_talk,  # Backwards compatibility alias
    "term_read": _action_term_read,  # Terminal buffer access (opt-in)
    "resize": _action_resize,
    # Targeted routing actions (Plan: PTY_TargetedRouting)
    "resolve": _action_resolve,
    "send_line_to_agent": _action_send_line_to_agent,
}


def k_pty(
    action: str,
    session_id: str = "",
    shell: str = "",
    cwd: str = "",
    cols: int = 120,
    rows: int = 30,
    data: str = "",
    command: str = "",
    sentinel: str = "",
    max_bytes: int = 4096,
    timeout_ms: int = 30000,
    # term_read parameters (opt-in buffer access)
    mode: str = "tail",
    max_lines: int = 40,
    max_chars: int = 12000,
    merge_wrapped: bool = True,
    marker_id: Optional[int] = None,
    # Targeted routing parameters (Plan: PTY_TargetedRouting)
    agent_id: str = "",
    owner_session_id: str = "",
    label: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Kuroryuu PTY - CLI control for all agents.

    All agents (leaders and workers) can use k_pty for direct PTY communication.
    k_inbox remains available as a backup coordination method.

    Routed tool with actions: help, list, create, send_line, read, talk, term_read,
    resolve, send_line_to_agent

    NOTE: 'write' action is DEPRECATED - use send_line or talk instead.

    Args:
        action: Action to perform (required)
        session_id: PTY session ID (for most actions)
        shell: Shell executable (for create, default: powershell.exe)
        cwd: Working directory (for create)
        cols: Terminal columns (for create, resize)
        rows: Terminal rows (for create, resize)
        data: Data to write (for write, send_line, send_line_to_agent)
        command: Command to execute (for run)
        sentinel: Sentinel string (for run, auto-generated if empty)
        max_bytes: Max bytes to read (for read)
        timeout_ms: Timeout in milliseconds (for read, run)
        mode: Read mode for term_read ('tail'|'viewport'|'delta')
        max_lines: Maximum lines for term_read (default: 40, cap: 200)
        max_chars: Maximum characters for term_read (default: 12000, cap: 50000)
        merge_wrapped: Merge wrapped lines for term_read (default: True)
        marker_id: Marker ID for delta mode in term_read
        agent_id: Owner agent ID for resolve/send_line_to_agent (primary routing key)
        owner_session_id: k_session.session_id (for resolve)
        label: Human-friendly label (for resolve)

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
        session_id=session_id,
        shell=shell,
        cwd=cwd,
        cols=cols,
        rows=rows,
        data=data,
        command=command,
        sentinel=sentinel,
        max_bytes=max_bytes,
        timeout_ms=timeout_ms,
        # term_read parameters
        mode=mode,
        max_lines=max_lines,
        max_chars=max_chars,
        merge_wrapped=merge_wrapped,
        marker_id=marker_id,
        # Targeted routing parameters
        agent_id=agent_id,
        owner_session_id=owner_session_id,
        label=label,
        **kwargs,
    )


async def k_pty_async(
    action: str,
    session_id: str = "",
    shell: str = "",
    cwd: str = "",
    cols: int = 120,
    rows: int = 30,
    data: str = "",
    command: str = "",
    sentinel: str = "",
    max_bytes: int = 4096,
    timeout_ms: int = 30000,
    # term_read parameters (opt-in buffer access)
    mode: str = "tail",
    max_lines: int = 40,
    max_chars: int = 12000,
    merge_wrapped: bool = True,
    marker_id: Optional[int] = None,
    # Targeted routing parameters (Plan: PTY_TargetedRouting)
    agent_id: str = "",
    owner_session_id: str = "",
    label: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Kuroryuu PTY - CLI control for all agents (async version).

    This is the non-blocking async version of k_pty. Use this when calling
    from an async context (FastAPI endpoints, async MCP handlers, etc.)
    to avoid blocking the event loop.

    See k_pty() for full documentation.
    """
    act = (action or "").strip().lower()

    if not act:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "action is required. Use action='help' for available actions.",
            "details": {"available_actions": list(ACTION_HANDLERS.keys())},
        }

    # Use async handler if available, fall back to sync handler
    async_handler = ASYNC_ACTION_HANDLERS.get(act)
    if async_handler:
        return await async_handler(
            session_id=session_id,
            shell=shell,
            cwd=cwd,
            cols=cols,
            rows=rows,
            data=data,
            command=command,
            sentinel=sentinel,
            max_bytes=max_bytes,
            timeout_ms=timeout_ms,
            # term_read parameters
            mode=mode,
            max_lines=max_lines,
            max_chars=max_chars,
            merge_wrapped=merge_wrapped,
            marker_id=marker_id,
            # Targeted routing parameters
            agent_id=agent_id,
            owner_session_id=owner_session_id,
            label=label,
            **kwargs,
        )

    # Fall back to sync handler for actions without async version
    sync_handler = ACTION_HANDLERS.get(act)
    if not sync_handler:
        return {
            "ok": False,
            "error_code": "UNKNOWN_ACTION",
            "message": f"Unknown action: {act}",
            "details": {"available_actions": list(ACTION_HANDLERS.keys())},
        }

    # Run sync handler in thread pool to avoid blocking
    return await asyncio.to_thread(
        sync_handler,
        session_id=session_id,
        shell=shell,
        cwd=cwd,
        cols=cols,
        rows=rows,
        data=data,
        command=command,
        sentinel=sentinel,
        max_bytes=max_bytes,
        timeout_ms=timeout_ms,
        mode=mode,
        max_lines=max_lines,
        max_chars=max_chars,
        merge_wrapped=merge_wrapped,
        marker_id=marker_id,
        agent_id=agent_id,
        owner_session_id=owner_session_id,
        label=label,
        **kwargs,
    )


# ============================================================================
# Tool registration
# ============================================================================

def register_pty_tools(registry: "ToolRegistry") -> None:
    """Register k_pty routed tool with the registry."""

    registry.register(
        name="k_pty",
        description="PTY control for all agents. Actions: help, list, create, write, read, talk, term_read, resize, resolve, send_line_to_agent",
        input_schema={
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["help", "list", "create", "write", "send_line", "read", "talk", "term_read", "resize", "resolve", "send_line_to_agent"],
                    "description": "Action to perform",
                },
                "session_id": {
                    "type": "string",
                    "description": "PTY session ID (for most actions)",
                },
                "shell": {
                    "type": "string",
                    "default": "powershell.exe",
                    "description": "Shell executable (for create)",
                },
                "cwd": {
                    "type": "string",
                    "description": "Working directory (for create)",
                },
                "cols": {
                    "type": "integer",
                    "default": 120,
                    "description": "Terminal columns (for create, resize)",
                },
                "rows": {
                    "type": "integer",
                    "default": 30,
                    "description": "Terminal rows (for create, resize)",
                },
                "data": {
                    "type": "string",
                    "description": "Data to write (for write, send_line, send_line_to_agent). Use \\r\\n for Enter on Windows.",
                },
                "command": {
                    "type": "string",
                    "description": "Command to execute (for talk)",
                },
                "sentinel": {
                    "type": "string",
                    "description": "Sentinel string (for talk, auto-generated if empty)",
                },
                "max_bytes": {
                    "type": "integer",
                    "default": 4096,
                    "description": "Max bytes to read (for read)",
                },
                "timeout_ms": {
                    "type": "integer",
                    "default": 30000,
                    "description": "Timeout in milliseconds (for read, talk)",
                },
                # term_read parameters (opt-in buffer access)
                "mode": {
                    "type": "string",
                    "enum": ["tail", "viewport", "delta"],
                    "default": "tail",
                    "description": "Read mode for term_read: tail (last N lines), viewport (visible window), delta (new since marker)",
                },
                "max_lines": {
                    "type": "integer",
                    "default": 40,
                    "description": "Maximum lines to return for term_read (cap: 200)",
                },
                "max_chars": {
                    "type": "integer",
                    "default": 12000,
                    "description": "Maximum characters to return for term_read (cap: 50000)",
                },
                "merge_wrapped": {
                    "type": "boolean",
                    "default": True,
                    "description": "Merge wrapped lines for readability (for term_read)",
                },
                "marker_id": {
                    "type": "integer",
                    "description": "Marker ID for delta mode in term_read (from previous call)",
                },
                # Targeted routing parameters (Plan: PTY_TargetedRouting)
                "agent_id": {
                    "type": "string",
                    "description": "Owner agent ID for resolve/send_line_to_agent (primary routing key)",
                },
                "owner_session_id": {
                    "type": "string",
                    "description": "k_session.session_id for resolve (secondary routing key)",
                },
                "label": {
                    "type": "string",
                    "description": "Human-friendly label for resolve",
                },
            },
            "required": ["action"],
        },
        handler=k_pty,
    )
