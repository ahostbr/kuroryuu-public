"""
Threat Intelligence Service

Gathers information about threat IPs using external services.
Uses a proxy to hide our identity when making lookups.
"""

import asyncio
import aiohttp
from datetime import datetime
from typing import Optional
import os

from .blocklist import blocklist, ThreatInfo
from ..utils.logging_config import get_logger

logger = get_logger(__name__)

# Proxy configuration (optional - set via environment)
INTEL_PROXY = os.environ.get("KURORYUU_INTEL_PROXY", "")  # e.g., "http://proxy:8080"

# API endpoints for IP intelligence (free tiers)
IP_API_URL = "http://ip-api.com/json/{ip}?fields=status,message,country,countryCode,region,regionName,city,isp,org,as,proxy,hosting,query"


async def gather_intel(ip: str, timeout: float = 10.0) -> Optional[ThreatInfo]:
    """
    Gather intelligence about an IP address.

    Uses ip-api.com for geolocation and network info.
    Optionally routes through a proxy to hide our identity.

    Args:
        ip: The IP address to investigate
        timeout: Request timeout in seconds

    Returns:
        ThreatInfo object with gathered data, or None on failure
    """
    logger.info(f"[INTEL] Gathering intelligence on {ip}...")

    # Get existing intel if any
    existing = blocklist.get_intel(ip)

    try:
        # Configure proxy if set
        connector = None
        if INTEL_PROXY:
            connector = aiohttp.TCPConnector()

        async with aiohttp.ClientSession(connector=connector) as session:
            # Query ip-api.com
            url = IP_API_URL.format(ip=ip)
            proxy = INTEL_PROXY if INTEL_PROXY else None

            async with session.get(url, timeout=aiohttp.ClientTimeout(total=timeout), proxy=proxy) as resp:
                if resp.status != 200:
                    logger.warning(f"[INTEL] ip-api.com returned status {resp.status}")
                    return existing

                data = await resp.json()

                if data.get("status") != "success":
                    logger.warning(f"[INTEL] ip-api.com error: {data.get('message', 'unknown')}")
                    return existing

                # Build or update threat info
                now = datetime.now()

                if existing:
                    # Update existing
                    existing.country = data.get("country")
                    existing.country_code = data.get("countryCode")
                    existing.city = data.get("city")
                    existing.region = data.get("regionName")
                    existing.isp = data.get("isp")
                    existing.org = data.get("org")
                    existing.as_number = data.get("as")
                    existing.is_proxy = data.get("proxy", False)
                    existing.is_hosting = data.get("hosting", False)
                    existing.last_seen = now

                    # Calculate threat score
                    existing.threat_score = _calculate_threat_score(existing)

                    # Update in blocklist
                    blocklist.update_intel(ip, existing)
                    intel = existing
                else:
                    # Create new
                    intel = ThreatInfo(
                        ip=ip,
                        first_seen=now,
                        last_seen=now,
                        country=data.get("country"),
                        country_code=data.get("countryCode"),
                        city=data.get("city"),
                        region=data.get("regionName"),
                        isp=data.get("isp"),
                        org=data.get("org"),
                        as_number=data.get("as"),
                        is_proxy=data.get("proxy", False),
                        is_hosting=data.get("hosting", False),
                    )
                    intel.threat_score = _calculate_threat_score(intel)
                    blocklist.update_intel(ip, intel)

                logger.info(f"[INTEL] Gathered intel for {ip}: {intel.country}, {intel.city}, ISP: {intel.isp}, Score: {intel.threat_score}")
                return intel

    except asyncio.TimeoutError:
        logger.warning(f"[INTEL] Timeout gathering intel for {ip}")
        return existing
    except Exception as e:
        logger.error(f"[INTEL] Error gathering intel for {ip}: {e}")
        return existing


def _calculate_threat_score(info: ThreatInfo) -> int:
    """
    Calculate a threat score (0-100) based on gathered intel.

    Higher score = more suspicious.
    """
    score = 50  # Base score for any external connection

    # Proxy/VPN/Tor indicators
    if info.is_proxy:
        score += 20
    if info.is_vpn:
        score += 15
    if info.is_tor:
        score += 30

    # Hosting provider (could be botnet)
    if info.is_hosting:
        score += 10

    # Multiple requests = persistent threat
    if info.request_count > 5:
        score += 10
    if info.request_count > 20:
        score += 10

    # Cap at 100
    return min(score, 100)


async def broadcast_intel_update(ip: str, intel: ThreatInfo) -> None:
    """Broadcast intel update via WebSocket."""
    try:
        from ..websocket import manager

        await manager.broadcast({
            "type": "threat_intel_update",
            "ip": ip,
            "intel": intel.to_dict(),
            "timestamp": datetime.now().isoformat(),
        })
    except Exception as e:
        logger.error(f"[INTEL] Failed to broadcast intel update: {e}")
