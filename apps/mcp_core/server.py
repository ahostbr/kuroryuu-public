"""MCP_CORE Server - Minimal MCP tool server for Kuroryuu.

FastAPI server implementing MCP JSON-RPC 2.0 protocol.
Compatible with AG-UI gateway's expected tools/list + tools/call contract.

Tools exposed (routed pattern with action parameter):
- k_MCPTOOLSEARCH: search, help (discovery entry point for external LLMs)
- k_help: tool overview and detailed help
- k_rag: query, status, index
- k_repo_intel: status, run, get, list
- k_inbox: send, list, read, claim, complete
- k_checkpoint: save, list, load
- k_session: start, end, pre_tool, post_tool, log, context
- k_files: read, write, list
- k_memory: get, set_goal, add_blocker, clear_blockers, set_steps, reset
- k_pty: list, create, write, read, run, resize, kill (LEADER-ONLY)
- k_thinker_channel: send_line, read (NOT leader-only, for thinker debates)
- k_capture: start, stop, screenshot, poll
- k_clawd: status, start, stop, task, results, inbox (OPT-IN, KURORYUU_CLAWD_ENABLED=1)
- k_pccontrol: help, status, screenshot, click, type, find_element, launch_app, get_windows (OPT-IN, requires WinAppDriver)
"""

from __future__ import annotations

import os
import sys
from pathlib import Path
from typing import Any, Dict, Optional

from fastapi import FastAPI, Request, Response, Header, HTTPException
import secrets as secrets_module

# Add package to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from protocol import MCPProtocol, ToolRegistry
from tools_inbox import register_inbox_tools
from tools_checkpoint import register_checkpoint_tools
from tools_rag import register_rag_tools
from tools_repo_intel import register_repo_intel_tools
from tools_hooks import register_hooks_tools
from tools_files import register_file_tools
from tools_working_memory import register_working_memory_tools
from tools_capture import register_capture_tools
from tools_pty import register_pty_tools
from tools_thinker_channel import register_thinker_channel_tools
from tools_collective import register_collective_tools, _load_patterns, _load_skill_matrix, PATTERNS_PATH  # Phase 4: Collective intelligence
from tools_graphiti_migrate import register_graphiti_migrate_tools  # Graphiti migration
from tools_mcp_search import register_mcp_search_tools  # Tool discovery for external LLMs
from tools_clawd import register_clawd_tools  # Clawdbot integration (opt-in)
from tools_pccontrol import register_pccontrol_tools  # Full Desktop Access (opt-in, requires WinAppDriver)
from pty_registry import get_pty_registry
from pty_persistence import get_pty_persistence
from pty_manager import get_pty_manager
import logging
import httpx

logger = logging.getLogger("kuroryuu.mcp_core")

# ============================================================================
# Configuration
# ============================================================================

HOST = os.environ.get("KURORYUU_MCP_HOST", "127.0.0.1")
PORT = int(os.environ.get("KURORYUU_MCP_PORT", "8100"))
MCP_PATH = os.environ.get("KURORYUU_MCP_PATH", "/mcp")

# ============================================================================
# Server setup
# ============================================================================

app = FastAPI(
    title="Kuroryuu MCP_CORE",
    description="Minimal MCP tool server for Kuroryuu (RAG, Inbox, Checkpoints)",
    version="0.2.0",
)

# CORS disabled due to FastAPI 0.95 + pydantic compatibility issue
# Will be re-enabled when upgrading to FastAPI 0.100+

# Initialize tool registry and protocol
registry = ToolRegistry()
register_inbox_tools(registry)
register_checkpoint_tools(registry)
register_rag_tools(registry)
register_repo_intel_tools(registry)
register_hooks_tools(registry)
register_file_tools(registry)
register_working_memory_tools(registry)
register_capture_tools(registry)
register_pty_tools(registry)
register_thinker_channel_tools(registry)
register_collective_tools(registry)  # Phase 4: Collective intelligence
register_graphiti_migrate_tools(registry)  # Graphiti migration
register_mcp_search_tools(registry)  # Tool discovery for external LLMs (k_MCPTOOLSEARCH, k_help)
register_clawd_tools(registry)  # Clawdbot integration (opt-in, KURORYUU_CLAWD_ENABLED=1)
register_pccontrol_tools(registry)  # Full Desktop Access (opt-in, requires WinAppDriver)

protocol = MCPProtocol(registry)


# ============================================================================
# Lifecycle Events (PTY Persistence)
# ============================================================================

@app.on_event("startup")
async def on_startup():
    """Initialize PTY persistence on server startup.

    - Cleanup stale sessions (older than 7 days)
    - Restore registry from disk
    - Verify desktop sessions are still alive (optional)
    """
    logger.info("MCP_CORE startup: Initializing PTY persistence...")

    # Load internal service secret from environment
    _load_internal_secret()

    try:
        # Initialize persistence layer
        persistence = get_pty_persistence()
        init_result = persistence.initialize()
        logger.info(f"PTY persistence initialized: {init_result}")

        # Cleanup stale sessions
        cleanup_result = persistence.cleanup_stale_sessions(max_age_days=7)
        if cleanup_result.get("cleaned", 0) > 0:
            logger.info(f"Cleaned {cleanup_result['cleaned']} stale PTY sessions")

        # Restore registry from disk
        registry = get_pty_registry()
        restore_result = registry.restore_from_disk()
        if restore_result.get("restored", 0) > 0:
            logger.info(f"Restored {restore_result['restored']} PTY sessions from disk")

        # Verify restored desktop sessions are still alive (grouped by desktop_url)
        desktop_sessions = registry.list_by_source("desktop")
        dead_sessions = []

        # Group sessions by desktop_url for efficient verification
        from collections import defaultdict
        sessions_by_url: dict[str, list] = defaultdict(list)
        for session in desktop_sessions:
            if session.desktop_url:
                sessions_by_url[session.desktop_url].append(session)

        # Verify each desktop and its terminals
        async with httpx.AsyncClient(timeout=2.0) as client:
            for desktop_url, sessions in sessions_by_url.items():
                try:
                    # Check if desktop is alive
                    health_resp = await client.get(f"{desktop_url}/health")
                    if health_resp.status_code != 200:
                        # Desktop unhealthy - all its sessions are dead
                        dead_sessions.extend(s.session_id for s in sessions)
                        continue

                    # Desktop is alive - now verify each terminal exists
                    list_resp = await client.get(f"{desktop_url}/pty/list")
                    if list_resp.status_code == 200:
                        # Field is "session_id" in the response (verified by sub-agent)
                        active_ids = {s["session_id"] for s in list_resp.json().get("sessions", [])}
                        for session in sessions:
                            if session.session_id not in active_ids:
                                dead_sessions.append(session.session_id)
                    else:
                        # Can't verify terminals - assume all dead for safety
                        dead_sessions.extend(s.session_id for s in sessions)
                except Exception:
                    # Desktop not responding - all its sessions are dead
                    dead_sessions.extend(s.session_id for s in sessions)

        # Remove dead sessions
        for session_id in dead_sessions:
            registry.unregister(session_id)
            logger.info(f"Removed stale/unreachable desktop PTY session: {session_id}")

        if dead_sessions:
            logger.info(f"Cleaned {len(dead_sessions)} stale/unreachable desktop sessions")

        logger.info("MCP_CORE startup complete: PTY persistence ready")

    except Exception as e:
        # Non-fatal - server can still work without persistence
        logger.error(f"PTY persistence startup failed (non-fatal): {e}")


@app.on_event("shutdown")
async def on_shutdown():
    """Save PTY state on server shutdown.

    Immediately saves all registry and buffer state to disk.
    """
    logger.info("MCP_CORE shutdown: Saving PTY state...")

    try:
        persistence = get_pty_persistence()
        registry = get_pty_registry()
        manager = get_pty_manager()

        # Save all state immediately
        result = persistence.save_now(registry, manager)
        logger.info(f"PTY state saved: registry={result.get('registry_count', 0)}, sessions={result.get('sessions_saved', 0)}")

    except Exception as e:
        logger.error(f"PTY persistence shutdown save failed: {e}")


# ============================================================================
# Routes
# ============================================================================

@app.get("/")
async def root() -> Dict[str, Any]:
    """Health check / server info."""
    return {
        "name": "kuroryuu_mcp_core",
        "version": "0.2.0",
        "status": "ok",
        "mcp_endpoint": MCP_PATH,
        "tools_count": len(registry._tools),
        "tools": list(registry._tools.keys()),
    }


@app.get("/health")
async def health() -> Dict[str, Any]:
    """Health check endpoint - returns immediately without dependencies."""
    return {"ok": True, "status": "healthy", "version": "0.2.0"}


# ============================================================================
# Leader Registration (Desktop-Only)
# ============================================================================

# Desktop session secret for authentication (registered by Desktop on startup)
_desktop_secret: Optional[str] = None

# Internal service secret for Gateway-to-MCP communication (from environment)
_internal_secret: Optional[str] = None

# Registered leaders (agent_ids explicitly registered by Desktop)
_registered_leaders: set[str] = set()


def _load_internal_secret() -> None:
    """Load internal service secret from environment on startup."""
    global _internal_secret
    _internal_secret = os.environ.get("KURORYUU_INTERNAL_SECRET")
    if _internal_secret:
        logger.info("Internal service secret loaded from KURORYUU_INTERNAL_SECRET")


def _validate_internal_secret(secret: Optional[str]) -> bool:
    """Validate internal service secret using constant-time comparison."""
    if _internal_secret is None or secret is None:
        return False
    return secrets_module.compare_digest(_internal_secret, secret)


def _validate_desktop_secret(secret: Optional[str]) -> bool:
    """Validate Desktop secret using constant-time comparison."""
    if _desktop_secret is None or secret is None:
        return False
    return secrets_module.compare_digest(_desktop_secret, secret)


def get_registered_leaders() -> set[str]:
    """Get the set of registered leaders (for use by tools_pty.py)."""
    return _registered_leaders


@app.post("/_x9k_desktop_auth")
async def register_desktop_secret(
    x_kuroryuu_desktop_secret: str = Header(..., alias="X-Kuroryuu-Desktop-Secret"),
) -> Dict[str, Any]:
    """Register Desktop app's session secret.

    DESKTOP-ONLY: Called once at Desktop startup.
    This allows MCP Core to authenticate leader registration requests.
    """
    global _desktop_secret

    # Validate secret format (64 hex chars = 32 bytes)
    if len(x_kuroryuu_desktop_secret) != 64:
        raise HTTPException(status_code=400, detail="Invalid secret format")
    if not all(c in '0123456789abcdefABCDEF' for c in x_kuroryuu_desktop_secret):
        raise HTTPException(status_code=400, detail="Invalid secret format")

    _desktop_secret = x_kuroryuu_desktop_secret.lower()
    logger.info("Desktop secret registered with MCP Core")
    return {"ok": True, "message": "Desktop secret registered"}


@app.post("/_x9k_register_leader")
async def register_leader(
    agent_id: str,
    x_kuroryuu_desktop_secret: Optional[str] = Header(None, alias="X-Kuroryuu-Desktop-Secret"),
) -> Dict[str, Any]:
    """Register an agent as leader.

    DESKTOP-ONLY: Requires valid Desktop secret.
    Called when Desktop spawns a leader terminal or promotes an agent.
    """
    if not _validate_desktop_secret(x_kuroryuu_desktop_secret):
        raise HTTPException(status_code=403, detail="Desktop authentication required")

    _registered_leaders.add(agent_id)
    logger.info(f"Leader registered with MCP Core: {agent_id}")
    return {"ok": True, "agent_id": agent_id, "message": "Leader registered"}


@app.post("/_x9k_deregister_leader")
async def deregister_leader(
    agent_id: str,
    x_kuroryuu_desktop_secret: Optional[str] = Header(None, alias="X-Kuroryuu-Desktop-Secret"),
) -> Dict[str, Any]:
    """Deregister an agent as leader.

    DESKTOP-ONLY: Requires valid Desktop secret.
    Called when Desktop demotes an agent or kills a leader terminal.
    """
    if not _validate_desktop_secret(x_kuroryuu_desktop_secret):
        raise HTTPException(status_code=403, detail="Desktop authentication required")

    _registered_leaders.discard(agent_id)
    logger.info(f"Leader deregistered from MCP Core: {agent_id}")
    return {"ok": True, "agent_id": agent_id, "message": "Leader deregistered"}


@app.get("/_x9k_registered_leaders")
async def list_registered_leaders() -> Dict[str, Any]:
    """List all registered leaders (for debugging)."""
    return {"ok": True, "leaders": list(_registered_leaders), "count": len(_registered_leaders)}


@app.post(MCP_PATH)
async def mcp_endpoint(request: Request, response: Response) -> Dict[str, Any]:
    """MCP JSON-RPC 2.0 endpoint.

    Handles:
    - initialize: Session handshake
    - tools/list: Enumerate available tools (filtered by client type)
    - tools/call: Execute a tool (visibility checked)

    Client type detection:
    - X-Kuroryuu-Client header: explicit client type
    - User-Agent: auto-detect from known patterns
    - clientInfo in initialize params
    """
    try:
        body = await request.json()
    except Exception:
        return {
            "jsonrpc": "2.0",
            "id": None,
            "error": {"code": -32700, "message": "Parse error: invalid JSON"},
        }

    # Get session ID from header
    session_id: Optional[str] = request.headers.get("mcp-session-id")

    # Build client context for visibility filtering
    client_context = {
        "headers": dict(request.headers),
        "user_agent": request.headers.get("user-agent", ""),
    }

    # Handle request with client context
    result, new_session_id = protocol.handle_request(body, session_id, client_context)

    # Set session ID header in response
    if new_session_id:
        response.headers["mcp-session-id"] = new_session_id

    return result


@app.get("/tools")
async def list_tools(client_type: Optional[str] = None) -> Dict[str, Any]:
    """Convenience endpoint to list tools (non-MCP).

    Query params:
        client_type: Optional client type filter (external_llm, claude_code, desktop, gateway)
    """
    return {"tools": registry.list_tools(client_type=client_type)}


# ============================================================================
# Tool Visibility Endpoints
# ============================================================================

# Visibility endpoints removed - all tools now accessible to all clients


# ============================================================================
# PTY Registry HTTP Endpoints (for Desktop integration)
# ============================================================================

@app.post("/v1/pty/register")
async def pty_register(
    request: Request,
    x_kuroryuu_desktop_secret: Optional[str] = Header(None, alias="X-Kuroryuu-Desktop-Secret"),
) -> Dict[str, Any]:
    """Register a PTY session (called by Desktop app on spawn).

    DESKTOP-ONLY: Requires valid Desktop secret.

    Body:
        session_id: Unique session identifier (required)
        source: "local" or "desktop" (required)
        cli_type: "claude" | "kiro" | "codex" | "shell"
        pid: Process ID (required)
        desktop_url: Desktop bridge URL (required for source="desktop")
        owner_agent_id: Agent ID that owns this PTY (optional, for targeted routing)
        owner_session_id: k_session.session_id (optional, for targeted routing)
        owner_role: "leader" or "worker" (optional)
        label: Human-friendly label (optional)

    Returns:
        {ok: True} or {ok: False, error: str}
    """
    # Require Desktop authentication
    if not _validate_desktop_secret(x_kuroryuu_desktop_secret):
        raise HTTPException(status_code=403, detail="Desktop authentication required")

    try:
        body = await request.json()
    except Exception:
        return {"ok": False, "error": "Invalid JSON body"}

    pty_registry = get_pty_registry()
    return pty_registry.register(
        session_id=body.get("session_id", ""),
        source=body.get("source", "desktop"),
        cli_type=body.get("cli_type", "shell"),
        pid=body.get("pid", 0),
        desktop_url=body.get("desktop_url"),
        # Ownership metadata for targeted routing (Plan: PTY_TargetedRouting)
        owner_agent_id=body.get("owner_agent_id"),
        owner_session_id=body.get("owner_session_id"),
        owner_role=body.get("owner_role"),
        label=body.get("label"),
    )


@app.delete("/v1/pty/unregister/{session_id}")
async def pty_unregister(
    session_id: str,
    x_kuroryuu_desktop_secret: Optional[str] = Header(None, alias="X-Kuroryuu-Desktop-Secret"),
) -> Dict[str, Any]:
    """Unregister a PTY session (called by Desktop app on exit).

    DESKTOP-ONLY: Requires valid Desktop secret.

    Args:
        session_id: Session ID to unregister

    Returns:
        {ok: True} or {ok: False, error: str}
    """
    # Require Desktop authentication
    if not _validate_desktop_secret(x_kuroryuu_desktop_secret):
        raise HTTPException(status_code=403, detail="Desktop authentication required")

    pty_registry = get_pty_registry()
    return pty_registry.unregister(session_id)


@app.get("/v1/pty/sessions")
async def pty_sessions(source: Optional[str] = None) -> Dict[str, Any]:
    """List all registered PTY sessions.

    Query params:
        source: Optional filter by "local" or "desktop"

    Returns:
        {sessions: [...], count: int, by_source: {...}}
    """
    pty_registry = get_pty_registry()

    if source:
        sessions = pty_registry.list_by_source(source)
        return {
            "sessions": [s.to_dict() for s in sessions],
            "count": len(sessions),
            "source_filter": source,
        }

    return pty_registry.to_dict()


@app.delete("/v1/pty/reset")
async def reset_all_pty_sessions(
    x_kuroryuu_desktop_secret: Optional[str] = Header(None, alias="X-Kuroryuu-Desktop-Secret"),
) -> Dict[str, Any]:
    """Clear all PTY registry entries and persistence (for Desktop reset flow).

    DESKTOP-ONLY: Requires valid Desktop secret.

    Returns:
        {ok: True, cleared_count: int}
    """
    # Require Desktop authentication
    if not _validate_desktop_secret(x_kuroryuu_desktop_secret):
        raise HTTPException(status_code=403, detail="Desktop authentication required")

    pty_registry = get_pty_registry()
    count = pty_registry.reset_all(clear_persistence=True)
    logger.info(f"PTY registry reset: cleared {count} sessions")
    return {"ok": True, "cleared_count": count}


@app.get("/v1/pty/sessions/{session_id}")
async def pty_session_info(session_id: str) -> Dict[str, Any]:
    """Get info for a specific PTY session.

    Args:
        session_id: Session ID to look up

    Returns:
        {ok: True, session: {...}} or {ok: False, error: str}
    """
    pty_registry = get_pty_registry()
    session = pty_registry.get(session_id)

    if session is None:
        return {"ok": False, "error": f"Session not found: {session_id}"}

    return {"ok": True, "session": session.to_dict()}


@app.post("/v1/pty/heartbeat/{session_id}")
async def pty_heartbeat_path(session_id: str) -> Dict[str, Any]:
    """Update heartbeat for a PTY session (session_id in path).

    Args:
        session_id: Session ID

    Returns:
        {ok: True} or {ok: False, error: str}
    """
    pty_registry = get_pty_registry()
    return pty_registry.heartbeat(session_id)


@app.post("/v1/pty/heartbeat")
async def pty_heartbeat_body(request: Request) -> Dict[str, Any]:
    """Update heartbeat for a PTY session (session_id in body).

    Body:
        session_id: Session ID (required)

    Returns:
        {ok: True} or {ok: False, error: str}
    """
    try:
        body = await request.json()
    except Exception:
        return {"ok": False, "error": "Invalid JSON body"}

    session_id = body.get("session_id")
    if not session_id:
        return {"ok": False, "error": "session_id is required"}

    pty_registry = get_pty_registry()
    return pty_registry.heartbeat(session_id)


@app.post("/v1/pty/update-ownership")
async def pty_update_ownership(
    request: Request,
    x_kuroryuu_desktop_secret: Optional[str] = Header(None, alias="X-Kuroryuu-Desktop-Secret"),
    x_kuroryuu_internal_secret: Optional[str] = Header(None, alias="X-Kuroryuu-Internal-Secret"),
) -> Dict[str, Any]:
    """Update ownership metadata for an existing PTY session.

    PRIVILEGED: Requires Desktop or Internal service authentication.
    Does NOT create new sessions - only updates ownership on existing ones.

    Body:
        session_id: PTY session ID to update (required)
        owner_agent_id: Agent ID that owns this PTY (optional)
        owner_session_id: k_session.session_id (optional)
        owner_role: "leader" or "worker" (optional)
        label: Human-friendly label (optional)

    Returns:
        {ok: True, session: {...}} or {ok: False, error: str}
    """
    # Require privileged authentication (either Desktop or Internal)
    if not (_validate_desktop_secret(x_kuroryuu_desktop_secret) or
            _validate_internal_secret(x_kuroryuu_internal_secret)):
        raise HTTPException(
            status_code=403,
            detail="Desktop or internal service authentication required"
        )

    try:
        body = await request.json()
    except Exception:
        return {"ok": False, "error": "Invalid JSON body"}

    session_id = body.get("session_id")
    if not session_id:
        return {"ok": False, "error": "session_id is required"}

    pty_registry = get_pty_registry()

    # Check session exists
    session = pty_registry.get(session_id)
    if session is None:
        return {
            "ok": False,
            "error": f"Session not found: {session_id}",
            "error_code": "NOT_FOUND"
        }

    # Update ownership fields (only if provided, don't overwrite with None)
    if body.get("owner_agent_id") is not None:
        session.owner_agent_id = body["owner_agent_id"]
    if body.get("owner_session_id") is not None:
        session.owner_session_id = body["owner_session_id"]
    if body.get("owner_role") is not None:
        if body["owner_role"] not in ("leader", "worker"):
            return {"ok": False, "error": f"Invalid owner_role: {body['owner_role']}"}
        session.owner_role = body["owner_role"]
    if body.get("label") is not None:
        session.label = body["label"]

    # Trigger persistence
    pty_registry._persist_event("ownership_updated", session_id,
                                owner_agent_id=body.get("owner_agent_id"))
    pty_registry._schedule_persist()

    logger.info(f"Updated PTY ownership: {session_id} -> agent={body.get('owner_agent_id')}")

    return {"ok": True, "session": session.to_dict()}


# ============================================================================
# Collective Intelligence Health Endpoint
# ============================================================================

@app.get("/v1/collective/health")
async def collective_health() -> Dict[str, Any]:
    """Health check for collective intelligence system.

    Returns stats about patterns and contributing agents.

    Returns:
        {
            ok: True,
            total_patterns: int,
            successes: int,
            failures: int,
            agents_contributing: int,
            last_recorded: ISO timestamp or null
        }
    """
    try:
        # Load patterns
        patterns = _load_patterns(limit=10000)  # Load all patterns

        # Count successes and failures
        successes = sum(1 for p in patterns if p.get("type") == "success")
        failures = sum(1 for p in patterns if p.get("type") == "failure")

        # Get unique contributing agents
        agents = set()
        for p in patterns:
            agent_id = p.get("agent_id", "")
            if agent_id:
                agents.add(agent_id)

        # Also count agents from skill matrix
        skill_matrix = _load_skill_matrix()
        agents.update(skill_matrix.keys())

        # Get last recorded timestamp
        last_recorded = None
        if patterns:
            # Patterns are in chronological order, last one is most recent
            last_recorded = patterns[-1].get("timestamp")

        return {
            "ok": True,
            "total_patterns": len(patterns),
            "successes": successes,
            "failures": failures,
            "agents_contributing": len(agents),
            "last_recorded": last_recorded,
            "patterns_path": str(PATTERNS_PATH),
        }
    except Exception as e:
        return {
            "ok": False,
            "error": str(e),
            "total_patterns": 0,
            "successes": 0,
            "failures": 0,
            "agents_contributing": 0,
            "last_recorded": None,
        }


# ============================================================================
# Main
# ============================================================================

def main() -> None:
    """Run the server."""
    import uvicorn
    
    print(f"Starting Kuroryuu MCP_CORE server...")
    print(f"  Host: {HOST}")
    print(f"  Port: {PORT}")
    print(f"  MCP endpoint: {MCP_PATH}")
    print(f"  Tools: {list(registry._tools.keys())}")
    print()
    
    uvicorn.run(
        "server:app",
        host=HOST,
        port=PORT,
        reload=False,
        log_level="info",
    )


if __name__ == "__main__":
    main()
