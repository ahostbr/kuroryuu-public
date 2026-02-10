"""
Observability REST API Router
REST endpoints for hook event telemetry
"""
from fastapi import APIRouter, Query, HTTPException
from typing import Dict, Any, List, Optional

from .storage import observability_storage
from .websocket import obs_ws_manager
from .models import HookEventCreate

from ..utils.logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/v1/observability", tags=["observability"])


@router.post("/events")
async def ingest_event(event: HookEventCreate) -> Dict[str, Any]:
    """
    Ingest a hook event from a PowerShell hook script.
    Stores in SQLite and broadcasts via WebSocket.
    """
    # Extract tool_name from payload if not provided
    tool_name = event.tool_name
    if not tool_name and event.payload:
        tool_name = event.payload.get("tool_name") or event.payload.get("tool", {}).get("name")

    if tool_name:
        event.tool_name = tool_name

    event_id = observability_storage.store_event(event)
    if event_id is None:
        raise HTTPException(status_code=500, detail="Failed to store event")

    # Broadcast to WebSocket clients
    broadcast_data = {
        "id": event_id,
        "source_app": event.source_app,
        "session_id": event.session_id,
        "agent_id": event.agent_id,
        "hook_event_type": event.hook_event_type,
        "tool_name": tool_name,
        "payload": event.payload,
        "summary": event.summary,
        "model_name": event.model_name,
        "timestamp": event.timestamp,
    }
    await obs_ws_manager.broadcast_event(broadcast_data)

    return {"status": "ok", "id": event_id}


@router.get("/events/recent")
async def get_recent_events(
    limit: int = Query(default=300, ge=1, le=1000),
    session_id: Optional[str] = Query(default=None),
    source_app: Optional[str] = Query(default=None),
    event_type: Optional[str] = Query(default=None),
    tool_name: Optional[str] = Query(default=None),
) -> Dict[str, Any]:
    """Get recent hook events with optional filtering."""
    events = observability_storage.get_recent_events(
        limit=limit,
        session_id=session_id,
        source_app=source_app,
        event_type=event_type,
        tool_name=tool_name,
    )
    return {"events": events, "count": len(events)}


@router.get("/events/filters")
async def get_event_filters() -> Dict[str, List[str]]:
    """Get distinct source_apps, sessions, and event types for filter dropdowns."""
    return observability_storage.get_filters()


@router.get("/stats")
async def get_observability_stats() -> Dict[str, Any]:
    """Get aggregate statistics: events/min, tool counts, active sessions."""
    stats = observability_storage.get_stats()
    stats["websocket_clients"] = obs_ws_manager.connection_count
    return stats


@router.get("/health")
async def observability_health() -> Dict[str, Any]:
    """Check observability system health."""
    stats = observability_storage.get_stats()
    return {
        "status": "ok",
        "total_events": stats["total_events"],
        "events_per_minute": stats["events_per_minute"],
        "active_sessions": stats["active_sessions"],
        "websocket_clients": obs_ws_manager.connection_count,
        "storage": stats["storage"],
    }
