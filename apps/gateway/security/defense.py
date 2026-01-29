"""
Defense Actions

Emergency controls for server protection.
"""

import asyncio
import os
import signal
import sys
from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional

from .blocklist import blocklist
from ..utils.logging_config import get_logger

logger = get_logger(__name__)


# Global defense state
_lockdown_mode: bool = False
_lockdown_since: Optional[datetime] = None


@dataclass
class DefenseStatus:
    """Current defense system status."""
    lockdown_mode: bool
    lockdown_since: Optional[datetime]
    blocked_ip_count: int
    blocked_ips: List[str]
    recent_threats: List[dict]  # Last 10 threat events

    def to_dict(self) -> dict:
        return {
            "lockdown_mode": self.lockdown_mode,
            "lockdown_since": self.lockdown_since.isoformat() if self.lockdown_since else None,
            "blocked_ip_count": self.blocked_ip_count,
            "blocked_ips": self.blocked_ips,
            "recent_threats": self.recent_threats,
        }


def is_lockdown_mode() -> bool:
    """Check if server is in lockdown mode."""
    return _lockdown_mode


async def enable_lockdown_mode() -> None:
    """
    Enable lockdown mode - reject all non-localhost connections.
    """
    global _lockdown_mode, _lockdown_since

    if _lockdown_mode:
        logger.info("[DEFENSE] Already in lockdown mode")
        return

    _lockdown_mode = True
    _lockdown_since = datetime.now()
    logger.info("[DEFENSE] LOCKDOWN MODE ENABLED - Rejecting all external connections")

    # Broadcast state change
    await _broadcast_defense_change("lockdown_enabled")


async def disable_lockdown_mode() -> None:
    """
    Disable lockdown mode - allow connections again.
    """
    global _lockdown_mode, _lockdown_since

    if not _lockdown_mode:
        logger.info("[DEFENSE] Not in lockdown mode")
        return

    _lockdown_mode = False
    _lockdown_since = None
    logger.info("[DEFENSE] Lockdown mode disabled")

    # Broadcast state change
    await _broadcast_defense_change("lockdown_disabled")


async def emergency_shutdown(reason: str = "Manual shutdown") -> None:
    """
    Emergency server shutdown.

    Broadcasts shutdown notification and terminates the process.
    """
    logger.warning(f"[DEFENSE] EMERGENCY SHUTDOWN INITIATED: {reason}")

    # Broadcast shutdown notification
    try:
        from ..websocket import manager

        await manager.broadcast({
            "type": "server_shutting_down",
            "reason": reason,
            "timestamp": datetime.now().isoformat(),
        })

        # Give clients time to receive the message
        await asyncio.sleep(0.5)
    except Exception as e:
        logger.error(f"[DEFENSE] Failed to broadcast shutdown: {e}")

    # Shutdown the process
    logger.info("[DEFENSE] Terminating server process...")
    os._exit(0)


def get_defense_status() -> DefenseStatus:
    """Get current defense system status."""
    all_intel = blocklist.get_all_intel()

    # Get recent threats (last 10, sorted by last_seen)
    recent = sorted(
        all_intel.values(),
        key=lambda x: x.last_seen,
        reverse=True
    )[:10]

    return DefenseStatus(
        lockdown_mode=_lockdown_mode,
        lockdown_since=_lockdown_since,
        blocked_ip_count=blocklist.count,
        blocked_ips=blocklist.get_all_blocked(),
        recent_threats=[t.to_dict() for t in recent],
    )


async def _broadcast_defense_change(event_type: str) -> None:
    """Broadcast defense mode change."""
    try:
        from ..websocket import manager

        status = get_defense_status()
        await manager.broadcast({
            "type": "defense_mode_changed",
            "event": event_type,
            "status": status.to_dict(),
            "timestamp": datetime.now().isoformat(),
        })
    except Exception as e:
        logger.error(f"[DEFENSE] Failed to broadcast defense change: {e}")


async def broadcast_ip_blocked(ip: str, auto: bool = True) -> None:
    """Broadcast IP blocked event."""
    try:
        from ..websocket import manager

        intel = blocklist.get_intel(ip)
        await manager.broadcast({
            "type": "ip_blocked",
            "ip": ip,
            "auto": auto,
            "intel": intel.to_dict() if intel else None,
            "total_blocked": blocklist.count,
            "timestamp": datetime.now().isoformat(),
        })
    except Exception as e:
        logger.error(f"[DEFENSE] Failed to broadcast IP blocked: {e}")
