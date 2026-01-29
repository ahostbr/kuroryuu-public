"""
PTY Traffic REST API Router
REST endpoints for PTY traffic statistics, history, and detailed event inspection
"""
from fastapi import APIRouter, Query, HTTPException, Path, BackgroundTasks
from typing import Dict, Any, List, Optional
from datetime import datetime
import uuid

from .pty_storage import pty_traffic_storage
from .pty_websocket import pty_ws_manager
from .pty_models import PTYEventDetail, create_body_preview


# Create router with prefix
router = APIRouter(prefix="/v1/pty-traffic", tags=["pty-traffic"])


@router.get("/events")
async def get_pty_events(
    limit: int = Query(default=50, ge=1, le=500, description="Maximum events to return"),
    offset: int = Query(default=0, ge=0, description="Number of events to skip"),
    session_id: Optional[str] = Query(default=None, description="Filter by PTY session ID"),
    agent_id: Optional[str] = Query(default=None, description="Filter by agent ID"),
    action: Optional[str] = Query(default=None, description="Filter by action type"),
    errors_only: bool = Query(default=False, description="Only return errors"),
    blocked_only: bool = Query(default=False, description="Only return blocked commands"),
    search: Optional[str] = Query(default=None, description="Search in command and response"),
    since: Optional[str] = Query(default=None, description="ISO datetime - events after this time"),
    until: Optional[str] = Query(default=None, description="ISO datetime - events before this time"),
) -> Dict[str, Any]:
    """
    Get PTY traffic events with filtering and pagination.

    Supports filtering by session, agent, action type, errors, blocked commands.
    """
    # Parse datetime filters
    since_dt = datetime.fromisoformat(since) if since else None
    until_dt = datetime.fromisoformat(until) if until else None

    events = pty_traffic_storage.get_events(
        limit=limit,
        offset=offset,
        session_id=session_id,
        agent_id=agent_id,
        action=action,
        errors_only=errors_only,
        blocked_only=blocked_only,
        search=search,
        since=since_dt,
        until=until_dt,
    )

    return {
        "events": events,
        "count": len(events),
        "offset": offset,
        "limit": limit,
        "has_more": len(events) == limit,
    }


@router.get("/events/{event_id}")
async def get_pty_event_detail(
    event_id: str = Path(..., description="The event ID to retrieve")
) -> Dict[str, Any]:
    """
    Get full details for a specific PTY event.

    Returns complete command/response data, timing, and metadata.
    """
    event = pty_traffic_storage.get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail=f"PTY event {event_id} not found")
    return event


@router.get("/sessions")
async def get_pty_sessions() -> Dict[str, Any]:
    """
    Get summary statistics for all PTY sessions.

    Returns aggregated metrics per session including event counts,
    error rates, and byte totals.
    """
    sessions = pty_traffic_storage.get_all_sessions()
    return {
        "sessions": [
            {
                "session_id": s.session_id,
                "agent_id": s.agent_id,
                "owner_session_id": s.owner_session_id,
                "label": s.label,
                "cli_type": s.cli_type,
                "event_count": s.event_count,
                "error_count": s.error_count,
                "blocked_count": s.blocked_count,
                "error_rate": round(s.error_count / s.event_count, 4) if s.event_count > 0 else 0,
                "avg_duration": round(s.avg_duration, 2),
                "total_bytes_sent": s.total_bytes_sent,
                "total_bytes_received": s.total_bytes_received,
                "first_event_time": s.first_event_time.isoformat() if s.first_event_time else None,
                "last_event_time": s.last_event_time.isoformat() if s.last_event_time else None,
                "action_breakdown": s.action_breakdown,
            }
            for s in sessions
        ],
        "count": len(sessions),
    }


@router.get("/sessions/{session_id}")
async def get_pty_session_detail(
    session_id: str = Path(..., description="The PTY session ID"),
    recent_limit: int = Query(default=50, ge=1, le=200, description="Max recent events"),
) -> Dict[str, Any]:
    """
    Get detailed statistics for a specific PTY session.

    Includes summary metrics and recent events.
    """
    summary = pty_traffic_storage.get_session_summary(session_id)
    if not summary:
        raise HTTPException(status_code=404, detail=f"No data for PTY session: {session_id}")

    recent_events = pty_traffic_storage.get_events(
        limit=recent_limit,
        session_id=session_id,
    )

    return {
        "summary": {
            "session_id": summary.session_id,
            "agent_id": summary.agent_id,
            "owner_session_id": summary.owner_session_id,
            "label": summary.label,
            "cli_type": summary.cli_type,
            "event_count": summary.event_count,
            "error_count": summary.error_count,
            "blocked_count": summary.blocked_count,
            "error_rate": round(summary.error_count / summary.event_count, 4) if summary.event_count > 0 else 0,
            "avg_duration": round(summary.avg_duration, 2),
            "total_bytes_sent": summary.total_bytes_sent,
            "total_bytes_received": summary.total_bytes_received,
            "first_event_time": summary.first_event_time.isoformat() if summary.first_event_time else None,
            "last_event_time": summary.last_event_time.isoformat() if summary.last_event_time else None,
            "action_breakdown": summary.action_breakdown,
        },
        "recent_events": recent_events,
    }


@router.get("/stats")
async def get_pty_stats() -> Dict[str, Any]:
    """
    Get current PTY traffic statistics.

    Returns event counts, byte totals, and breakdowns by action/agent.
    """
    return pty_traffic_storage.get_stats()


@router.get("/blocked")
async def get_blocked_commands(
    limit: int = Query(default=50, ge=1, le=200, description="Max blocked commands to return"),
) -> Dict[str, Any]:
    """
    Get recent blocked PTY commands.
    """
    events = pty_traffic_storage.get_blocked_commands(limit=limit)
    return {
        "events": events,
        "count": len(events),
    }


@router.post("/emit")
async def emit_pty_event(
    event_data: Dict[str, Any],
    background_tasks: BackgroundTasks,
) -> Dict[str, Any]:
    """
    Receive and store a PTY event from MCP Core.

    This endpoint is called by MCP Core to report PTY actions.
    Events are stored and broadcast to WebSocket clients.
    """
    # Generate ID if not provided
    if "id" not in event_data:
        event_data["id"] = f"pty_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{uuid.uuid4().hex[:8]}"

    # Parse timestamp
    if "timestamp" not in event_data:
        event_data["timestamp"] = datetime.now()
    elif isinstance(event_data["timestamp"], str):
        event_data["timestamp"] = datetime.fromisoformat(event_data["timestamp"])

    # Create previews if not provided
    if "command_preview" not in event_data and event_data.get("command"):
        event_data["command_preview"] = create_body_preview(event_data["command"])
    if "response_preview" not in event_data and event_data.get("response"):
        event_data["response_preview"] = create_body_preview(event_data["response"])

    # Create event model
    try:
        event = PTYEventDetail(**event_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid event data: {e}")

    # Store event
    stored = pty_traffic_storage.store_event(event)
    if not stored:
        raise HTTPException(status_code=500, detail="Failed to store event")

    # Broadcast to WebSocket clients in background
    async def broadcast():
        await pty_ws_manager.broadcast_pty_event(event.model_dump(mode="json"))

    background_tasks.add_task(broadcast)

    return {
        "ok": True,
        "id": event.id,
        "message": "Event stored and broadcast",
    }


@router.get("/health")
async def pty_traffic_health() -> Dict[str, Any]:
    """Check PTY traffic monitoring system health"""
    stats = pty_traffic_storage.get_stats()
    ws_health = pty_ws_manager.get_connection_health()

    return {
        "status": "ok",
        "monitoring": True,
        "websocket_clients": ws_health["total_connections"],
        "ping_loop_running": ws_health["ping_loop_running"],
        "storage": {
            "event_count": stats["event_count"],
            "session_count": stats["session_count"],
            "error_count": stats["error_count"],
            "blocked_count": stats["blocked_count"],
            "db_path": stats["db_path"],
        },
    }


@router.post("/storage/cleanup")
async def trigger_pty_storage_cleanup() -> Dict[str, Any]:
    """Manually trigger storage cleanup (removes old events)"""
    pty_traffic_storage.cleanup_old_events()
    return {"status": "ok", "message": "Cleanup completed", **pty_traffic_storage.get_stats()}
