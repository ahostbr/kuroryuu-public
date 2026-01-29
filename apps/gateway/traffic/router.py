"""
Traffic REST API Router
REST endpoints for traffic statistics, history, and detailed event inspection
"""
from fastapi import APIRouter, Query, HTTPException, Path
from typing import Dict, Any, List, Optional
from .tracker import traffic_tracker
from .websocket import traffic_ws_manager
from .storage import traffic_storage
from .models import EndpointSummary


# Create router with prefix
router = APIRouter(prefix="/v1/traffic", tags=["traffic"])


@router.get("/stats")
async def get_traffic_stats() -> Dict[str, Any]:
    """
    Get current traffic statistics.

    Returns real-time metrics including:
    - Requests per second
    - Average latency
    - Error rate
    - Total requests tracked
    """
    return traffic_tracker.get_stats()


@router.get("/history")
async def get_traffic_history(
    limit: int = Query(default=100, ge=1, le=1000, description="Maximum number of events to return"),
    category: Optional[str] = Query(default=None, description="Filter by endpoint category")
) -> Dict[str, List[Dict[str, Any]]]:
    """
    Get recent traffic events (from in-memory tracker).

    Query parameters:
    - limit: Maximum number of events to return (1-1000)
    - category: Filter by category (agents, chat, mcp, tasks, etc.)
    """
    events = traffic_tracker.get_recent_events(limit, category)
    return {"events": events, "count": len(events)}


@router.get("/events")
async def get_traffic_events(
    limit: int = Query(default=50, ge=1, le=500, description="Maximum events to return"),
    offset: int = Query(default=0, ge=0, description="Number of events to skip"),
    endpoint: Optional[str] = Query(default=None, description="Filter by endpoint path"),
    category: Optional[str] = Query(default=None, description="Filter by category"),
    method: Optional[str] = Query(default=None, description="Filter by HTTP method"),
    status_min: Optional[int] = Query(default=None, ge=100, le=599, description="Minimum status code"),
    status_max: Optional[int] = Query(default=None, ge=100, le=599, description="Maximum status code"),
    errors_only: bool = Query(default=False, description="Only return error responses (4xx/5xx)"),
    search: Optional[str] = Query(default=None, description="Search in endpoint and body"),
) -> Dict[str, Any]:
    """
    Get traffic events with full body/header data from persistent storage.

    Supports filtering, pagination, and search.
    """
    # Apply errors_only filter
    if errors_only:
        status_min = 400

    events = traffic_storage.get_events(
        limit=limit,
        offset=offset,
        endpoint=endpoint,
        category=category,
        method=method,
        status_min=status_min,
        status_max=status_max,
        search=search,
    )

    return {
        "events": events,
        "count": len(events),
        "offset": offset,
        "limit": limit,
        "has_more": len(events) == limit,
    }


@router.get("/events/{event_id}")
async def get_traffic_event_detail(
    event_id: str = Path(..., description="The event ID to retrieve")
) -> Dict[str, Any]:
    """
    Get full details for a specific traffic event.

    Returns complete request/response headers, bodies, timing, and metadata.
    """
    event = traffic_storage.get_event(event_id)
    if not event:
        raise HTTPException(status_code=404, detail=f"Event {event_id} not found")
    return event


@router.get("/endpoints")
async def get_all_endpoints() -> Dict[str, Any]:
    """
    Get summary statistics for all tracked endpoints.

    Returns aggregated metrics per endpoint including:
    - Request count
    - Error rate
    - Average/P95 latency
    - Status code breakdown
    """
    endpoints = traffic_storage.get_all_endpoints()
    return {
        "endpoints": [
            {
                "endpoint": ep.endpoint,
                "category": ep.category,
                "request_count": ep.request_count,
                "error_count": ep.error_count,
                "error_rate": round(ep.error_count / ep.request_count, 4) if ep.request_count > 0 else 0,
                "avg_latency": round(ep.avg_latency, 2),
                "p95_latency": round(ep.p95_latency, 2),
                "last_request_time": ep.last_request_time.isoformat() if ep.last_request_time else None,
                "status_breakdown": ep.status_breakdown,
                "methods_used": ep.methods_used,
            }
            for ep in endpoints
        ],
        "count": len(endpoints),
    }


@router.get("/endpoints/{endpoint_path:path}")
async def get_endpoint_detail(
    endpoint_path: str = Path(..., description="The endpoint path (e.g., /v1/agents)")
) -> Dict[str, Any]:
    """
    Get detailed statistics for a specific endpoint.

    Includes recent requests, status breakdown, and latency metrics.
    """
    # Ensure path starts with /
    if not endpoint_path.startswith("/"):
        endpoint_path = "/" + endpoint_path

    summary = traffic_storage.get_endpoint_summary(endpoint_path)
    if not summary:
        raise HTTPException(status_code=404, detail=f"No data for endpoint: {endpoint_path}")

    recent_events = traffic_storage.get_recent_for_endpoint(endpoint_path, limit=50)

    return {
        "summary": {
            "endpoint": summary.endpoint,
            "category": summary.category,
            "request_count": summary.request_count,
            "error_count": summary.error_count,
            "error_rate": round(summary.error_count / summary.request_count, 4) if summary.request_count > 0 else 0,
            "avg_latency": round(summary.avg_latency, 2),
            "p95_latency": round(summary.p95_latency, 2),
            "min_latency": round(summary.min_latency, 2),
            "max_latency": round(summary.max_latency, 2),
            "last_request_time": summary.last_request_time.isoformat() if summary.last_request_time else None,
            "status_breakdown": summary.status_breakdown,
            "methods_used": summary.methods_used,
        },
        "recent_events": recent_events,
    }


@router.get("/breakdown")
async def get_endpoint_breakdown() -> Dict[str, Any]:
    """
    Get statistics broken down by endpoint category.

    Returns per-category metrics:
    - Request count
    - Error count and rate
    - Average latency
    """
    breakdown = traffic_tracker.get_endpoint_breakdown()
    return {"categories": breakdown}


@router.get("/storage/stats")
async def get_storage_stats() -> Dict[str, Any]:
    """Get statistics about the persistent storage"""
    return traffic_storage.get_stats()


@router.post("/storage/cleanup")
async def trigger_storage_cleanup() -> Dict[str, Any]:
    """Manually trigger storage cleanup (removes old events)"""
    traffic_storage.cleanup_old_events()
    return {"status": "ok", "message": "Cleanup completed", **traffic_storage.get_stats()}


@router.get("/health")
async def traffic_health() -> Dict[str, Any]:
    """Check traffic monitoring system health"""
    stats = traffic_tracker.get_stats()
    storage_stats = traffic_storage.get_stats()
    return {
        "status": "ok",
        "monitoring": True,
        "websocket_clients": traffic_ws_manager.connection_count,
        "currentLoad": {
            "requestsPerSecond": stats["requestsPerSecond"],
            "totalTracked": stats["totalRequests"]
        },
        "storage": {
            "event_count": storage_stats["event_count"],
            "db_path": storage_stats["db_path"],
        }
    }
