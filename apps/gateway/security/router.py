"""
Security REST API Router

Provides endpoints for security management:
- IP blocking/unblocking
- Threat intelligence
- Defense mode controls
- Emergency shutdown
"""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

from .blocklist import blocklist, ThreatInfo
from .intel import gather_intel, broadcast_intel_update
from .defense import (
    emergency_shutdown,
    enable_lockdown_mode,
    disable_lockdown_mode,
    get_defense_status,
    is_lockdown_mode,
    broadcast_ip_blocked,
)


router = APIRouter(prefix="/v1/security", tags=["security"])


# Request/Response Models

class BlockIPRequest(BaseModel):
    ip: str
    reason: Optional[str] = None


class ShutdownRequest(BaseModel):
    reason: str = "Manual emergency shutdown"
    confirm: bool = False  # Must be True to actually shutdown


class LockdownRequest(BaseModel):
    enable: bool


class BlocklistResponse(BaseModel):
    count: int
    ips: List[str]


class IntelResponse(BaseModel):
    ip: str
    found: bool
    intel: Optional[dict] = None


class DefenseStatusResponse(BaseModel):
    lockdown_mode: bool
    lockdown_since: Optional[str]
    blocked_ip_count: int
    blocked_ips: List[str]
    recent_threats: List[dict]


# Endpoints

@router.get("/status", response_model=DefenseStatusResponse)
async def get_status():
    """Get current defense system status."""
    status = get_defense_status()
    return DefenseStatusResponse(
        lockdown_mode=status.lockdown_mode,
        lockdown_since=status.lockdown_since.isoformat() if status.lockdown_since else None,
        blocked_ip_count=status.blocked_ip_count,
        blocked_ips=status.blocked_ips,
        recent_threats=status.recent_threats,
    )


@router.get("/blocklist", response_model=BlocklistResponse)
async def get_blocklist():
    """Get all blocked IPs."""
    ips = blocklist.get_all_blocked()
    return BlocklistResponse(count=len(ips), ips=ips)


@router.post("/block")
async def block_ip(req: BlockIPRequest):
    """Manually block an IP address."""
    if not req.ip:
        raise HTTPException(status_code=400, detail="IP address required")

    # Check if already blocked
    if blocklist.is_blocked(req.ip):
        return {"ok": True, "message": f"IP {req.ip} is already blocked"}

    # Create threat info
    now = datetime.now()
    info = ThreatInfo(
        ip=req.ip,
        first_seen=now,
        last_seen=now,
    )

    blocklist.block(req.ip, info)

    # Broadcast the block
    await broadcast_ip_blocked(req.ip, auto=False)

    # Gather intel in background
    import asyncio
    asyncio.create_task(gather_intel(req.ip))

    return {"ok": True, "message": f"Blocked IP {req.ip}", "total_blocked": blocklist.count}


@router.delete("/block/{ip}")
async def unblock_ip(ip: str):
    """Unblock an IP address."""
    if not ip:
        raise HTTPException(status_code=400, detail="IP address required")

    if not blocklist.is_blocked(ip):
        raise HTTPException(status_code=404, detail=f"IP {ip} is not blocked")

    blocklist.unblock(ip)

    return {"ok": True, "message": f"Unblocked IP {ip}", "total_blocked": blocklist.count}


@router.get("/intel/{ip}", response_model=IntelResponse)
async def get_intel(ip: str, refresh: bool = Query(False, description="Force refresh from external APIs")):
    """Get threat intelligence for an IP."""
    if not ip:
        raise HTTPException(status_code=400, detail="IP address required")

    intel = blocklist.get_intel(ip)

    # Refresh if requested or not found
    if refresh or not intel:
        intel = await gather_intel(ip)
        if intel:
            await broadcast_intel_update(ip, intel)

    if intel:
        return IntelResponse(ip=ip, found=True, intel=intel.to_dict())
    else:
        return IntelResponse(ip=ip, found=False)


@router.post("/lockdown")
async def set_lockdown(req: LockdownRequest):
    """Enable or disable lockdown mode."""
    if req.enable:
        await enable_lockdown_mode()
        return {"ok": True, "message": "Lockdown mode enabled", "lockdown": True}
    else:
        await disable_lockdown_mode()
        return {"ok": True, "message": "Lockdown mode disabled", "lockdown": False}


@router.post("/shutdown")
async def shutdown_server(req: ShutdownRequest):
    """
    Emergency server shutdown.

    Requires confirm=true to actually shutdown.
    """
    if not req.confirm:
        return {
            "ok": False,
            "message": "Shutdown not confirmed. Set confirm=true to actually shutdown.",
            "warning": "This will terminate the server process immediately!",
        }

    # This will not return - server will terminate
    await emergency_shutdown(req.reason)

    # Should never reach here
    return {"ok": True, "message": "Shutting down..."}


@router.post("/clear")
async def clear_blocklist():
    """Clear all blocked IPs. Use with caution."""
    count = blocklist.count
    blocklist.clear()

    return {"ok": True, "message": f"Cleared {count} blocked IPs", "total_blocked": 0}
