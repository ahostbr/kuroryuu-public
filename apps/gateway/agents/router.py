"""Agent Router - FastAPI endpoints for agent registration.

M2 Multi-Agent Message Bus implementation.

Endpoints:
- POST /v1/agents/register - Register new agent
- POST /v1/agents/heartbeat - Keep-alive ping
- GET  /v1/agents/list - List all agents
- GET  /v1/agents/{agent_id} - Get specific agent
- DELETE /v1/agents/{agent_id} - Deregister agent
- GET  /v1/agents/leader - Get current leader
- GET  /v1/agents/stats - Registry statistics
"""

from __future__ import annotations

import secrets
from typing import Optional

from fastapi import APIRouter, HTTPException, Header

from .models import (
    Agent,
    AgentListResponse,
    AgentRole,
    AgentStatus,
    HeartbeatRequest,
    HeartbeatResponse,
    RegisterRequest,
    RegisterResponse,
)
from .registry import get_registry
from ..mcp.pty_client import update_pty_ownership
from ..utils.logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/v1/agents", tags=["agents"])

# Desktop session secret for role management authentication
# Only Desktop app can register this secret; agents cannot access it
_desktop_secret: Optional[str] = None


def _validate_desktop_secret(secret: Optional[str]) -> bool:
    """Validate that the provided secret matches the registered Desktop secret.

    Uses constant-time comparison to prevent timing attacks.
    """
    if _desktop_secret is None or secret is None:
        return False
    return secrets.compare_digest(_desktop_secret, secret)


@router.post("/_x9k_desktop_auth")
async def register_desktop_secret(
    x_desktop_secret: str = Header(..., alias="X-Kuroryuu-Desktop-Secret")
):
    """Register Desktop app's session secret.

    DESKTOP-ONLY: Called once at Desktop startup.
    The secret is used to authenticate role management requests.

    Security: This prevents agents from self-promoting via curl/Bash.
    """
    global _desktop_secret

    # Validate secret format (64 hex chars = 32 bytes)
    if len(x_desktop_secret) != 64 or not all(c in '0123456789abcdef' for c in x_desktop_secret.lower()):
        raise HTTPException(status_code=400, detail="Invalid secret format")

    _desktop_secret = x_desktop_secret
    return {"ok": True, "message": "Desktop secret registered"}


@router.post("/register", response_model=RegisterResponse)
async def register_agent(req: RegisterRequest) -> RegisterResponse:
    """Register a new agent in the system.

    Generates unique agent_id: {model_name}_{timestamp}_{uuid[:8]}
    Or uses explicit agent_id if provided (for LM Studio persistent agents).

    If role=leader is requested and no leader exists, grants leader.
    Otherwise assigns worker role.

    Optionally links to a PTY session via pty_session_id.
    """
    registry = get_registry()
    agent, message = registry.register(
        model_name=req.model_name,
        role=req.role,
        capabilities=req.capabilities,
        agent_id=req.agent_id,
        pty_session_id=req.pty_session_id,
    )

    # Attempt PTY linking if session_id provided
    pty_linked = False
    pty_error = None

    if req.pty_session_id:
        result = await update_pty_ownership(
            session_id=req.pty_session_id,
            owner_agent_id=agent.agent_id,
            owner_role=agent.role.value,
        )
        if result.get("ok"):
            pty_linked = True
            logger.info(f"Linked agent {agent.agent_id} to PTY {req.pty_session_id}")
        else:
            pty_error = result.get("error", "Unknown error")
            logger.warning(f"Failed to link agent {agent.agent_id} to PTY: {pty_error}")

    return RegisterResponse(
        ok=True,
        agent_id=agent.agent_id,
        role=agent.role,
        message=message,
        pty_linked=pty_linked,
        pty_error=pty_error,
    )


@router.post("/heartbeat", response_model=HeartbeatResponse)
async def heartbeat(req: HeartbeatRequest) -> HeartbeatResponse:
    """Update agent heartbeat to keep alive.
    
    Must be called within heartbeat_timeout (default 1s) to stay alive.
    Can optionally update status and current_task_id.
    """
    registry = get_registry()
    ok, message = registry.heartbeat(
        agent_id=req.agent_id,
        status=req.status,
        current_task_id=req.current_task_id,
    )
    
    if not ok:
        raise HTTPException(status_code=404, detail=message)
    
    agent = registry.get(req.agent_id)
    return HeartbeatResponse(
        ok=True,
        agent_id=req.agent_id,
        status=agent.status if agent else AgentStatus.DEAD,
        message=message,
    )


@router.get("/list", response_model=AgentListResponse)
async def list_agents(include_dead: bool = False) -> AgentListResponse:
    """List all registered agents.
    
    Args:
        include_dead: Include agents that missed heartbeat (default False)
    """
    registry = get_registry()
    agents = registry.list_all(include_dead=include_dead)
    stats = registry.stats()
    
    return AgentListResponse(
        agents=[a.to_dict() for a in agents],
        total=stats["total"],
        alive=stats["alive"],
        dead=stats["dead"],
    )


@router.get("/stats")
async def registry_stats():
    """Get registry statistics.
    
    Returns:
        - total: Total registered agents
        - alive: Agents with recent heartbeat
        - dead: Agents that missed heartbeat
        - leader_id: Current leader agent ID
        - heartbeat_timeout: Configured timeout in seconds
    """
    registry = get_registry()
    return registry.stats()


@router.get("/leader")
async def get_leader():
    """Get the current leader agent.
    
    Returns 404 if no leader is registered or leader is dead.
    """
    registry = get_registry()
    leader = registry.get_leader()
    
    if not leader:
        raise HTTPException(status_code=404, detail="No leader registered")
    
    return leader.to_dict()


@router.delete("/dead")
async def purge_dead_agents():
    """Remove all dead agents from the registry.
    
    Useful for cleaning up after testing or when many agents have died.
    """
    registry = get_registry()
    removed = registry.purge_dead()
    
    return {
        "ok": True,
        "removed": removed,
        "message": f"Purged {removed} dead agent(s)",
    }


@router.delete("/all/purge")
async def purge_all_agents():
    """Remove ALL agents from the registry (dead and alive).
    
    Useful for resetting the registry completely between sessions.
    """
    registry = get_registry()
    removed = registry.purge_all()
    
    return {
        "ok": True,
        "removed": removed,
        "message": f"Purged all {removed} agent(s) from registry",
    }


@router.get("/{agent_id}")
async def get_agent(agent_id: str):
    """Get a specific agent by ID."""
    registry = get_registry()
    agent = registry.get(agent_id)
    
    if not agent:
        raise HTTPException(status_code=404, detail=f"Agent {agent_id} not found")
    
    return agent.to_dict()


@router.delete("/{agent_id}")
async def deregister_agent(agent_id: str):
    """Remove an agent from the registry.

    If agent is leader, clears leader slot.
    """
    registry = get_registry()
    ok, message = registry.deregister(agent_id)

    if not ok:
        raise HTTPException(status_code=404, detail=message)

    return {"ok": True, "message": message}


@router.put("/timeout")
async def set_timeout(timeout_seconds: float):
    """Update heartbeat timeout (for testing/tuning).
    
    Args:
        timeout_seconds: New timeout in seconds (minimum 0.1)
    """
    registry = get_registry()
    registry.heartbeat_timeout = timeout_seconds
    
    return {
        "ok": True,
        "heartbeat_timeout": registry.heartbeat_timeout,
        "message": f"Heartbeat timeout set to {registry.heartbeat_timeout}s",
    }


# Path-based endpoints (alternative to body-based)
# These are used by kuroryuu-cli which passes agent_id in URL path

@router.post("/{agent_id}/heartbeat", response_model=HeartbeatResponse)
async def heartbeat_by_path(
    agent_id: str,
    status: Optional[AgentStatus] = None,
    current_task_id: Optional[str] = None,
) -> HeartbeatResponse:
    """Update agent heartbeat (path-based version).
    
    Same as POST /v1/agents/heartbeat but with agent_id in path.
    """
    registry = get_registry()
    ok, message = registry.heartbeat(
        agent_id=agent_id,
        status=status,
        current_task_id=current_task_id,
    )
    
    if not ok:
        raise HTTPException(status_code=404, detail=message)
    
    agent = registry.get(agent_id)
    return HeartbeatResponse(
        ok=True,
        agent_id=agent_id,
        status=agent.status if agent else AgentStatus.DEAD,
        message=message,
    )


@router.post("/{agent_id}/deregister")
async def deregister_by_path(agent_id: str):
    """Remove an agent from the registry (path-based POST version).
    
    Same as DELETE /v1/agents/{agent_id} but using POST for compatibility.
    """
    registry = get_registry()
    ok, message = registry.deregister(agent_id)
    
    if not ok:
        raise HTTPException(status_code=404, detail=message)
    
    return {"ok": True, "message": message}