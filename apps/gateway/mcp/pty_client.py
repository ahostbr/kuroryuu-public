"""PTY Client - HTTP client for MCP Core PTY operations.

Handles ownership updates from Gateway to MCP Core.
Used by agent registration to link agents to their PTY sessions.
"""

from __future__ import annotations

import os
from typing import Any, Dict, Optional

import httpx

from ..utils.logging_config import get_logger
from ..config import config

logger = get_logger(__name__)

# Config - MCP_URL from centralized config (no longer duplicated)
MCP_URL = config.mcp_url
INTERNAL_SECRET = os.environ.get("KURORYUU_INTERNAL_SECRET")
PTY_TIMEOUT = 5.0  # Short timeout for ownership updates


async def update_pty_ownership(
    session_id: str,
    owner_agent_id: str,
    owner_role: Optional[str] = None,
    owner_session_id: Optional[str] = None,
    label: Optional[str] = None,
) -> Dict[str, Any]:
    """Update PTY session ownership in MCP Core.

    Called during agent registration to link the agent to its PTY.

    Args:
        session_id: PTY session ID to update
        owner_agent_id: Agent ID claiming ownership
        owner_role: "leader" or "worker"
        owner_session_id: k_session.session_id
        label: Human-friendly label

    Returns:
        {ok: True, session: {...}} on success
        {ok: False, error: str} on failure
    """
    # Re-read from environment in case it changed
    internal_secret = os.environ.get("KURORYUU_INTERNAL_SECRET")

    if not internal_secret:
        logger.warning("KURORYUU_INTERNAL_SECRET not configured, PTY linking disabled")
        return {
            "ok": False,
            "error": "KURORYUU_INTERNAL_SECRET not configured",
            "error_code": "NO_SECRET"
        }

    body: Dict[str, Any] = {
        "session_id": session_id,
        "owner_agent_id": owner_agent_id,
    }
    if owner_role:
        body["owner_role"] = owner_role
    if owner_session_id:
        body["owner_session_id"] = owner_session_id
    if label:
        body["label"] = label

    try:
        async with httpx.AsyncClient(timeout=PTY_TIMEOUT) as client:
            resp = await client.post(
                f"{MCP_URL}/v1/pty/update-ownership",
                json=body,
                headers={"X-Kuroryuu-Internal-Secret": internal_secret}
            )
            resp.raise_for_status()
            return resp.json()

    except httpx.ConnectError:
        logger.error(f"Cannot connect to MCP Core at {MCP_URL}")
        return {
            "ok": False,
            "error": f"Cannot connect to MCP Core at {MCP_URL}",
            "error_code": "CONNECT_ERROR"
        }

    except httpx.HTTPStatusError as e:
        error_detail = e.response.text[:100] if e.response.text else "No details"
        logger.error(f"HTTP {e.response.status_code} from MCP Core: {error_detail}")
        return {
            "ok": False,
            "error": f"HTTP {e.response.status_code}: {error_detail}",
            "error_code": "HTTP_ERROR"
        }

    except httpx.TimeoutException:
        logger.error(f"Timeout connecting to MCP Core at {MCP_URL}")
        return {
            "ok": False,
            "error": f"Timeout connecting to MCP Core",
            "error_code": "TIMEOUT"
        }

    except Exception as e:
        logger.error(f"Unexpected error calling MCP Core: {e}")
        return {
            "ok": False,
            "error": str(e),
            "error_code": "UNKNOWN"
        }


__all__ = ["update_pty_ownership"]
