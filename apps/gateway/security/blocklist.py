"""
IP Blocklist Manager

Maintains a set of blocked IPs and associated threat intelligence.
Thread-safe for concurrent access.
"""

import asyncio
from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional, Set
from threading import Lock

from ..utils.logging_config import get_logger

logger = get_logger(__name__)


@dataclass
class ThreatInfo:
    """Intelligence gathered about a threat IP."""
    ip: str
    first_seen: datetime
    last_seen: datetime
    request_count: int = 1

    # Geolocation
    country: Optional[str] = None
    country_code: Optional[str] = None
    city: Optional[str] = None
    region: Optional[str] = None

    # Network info
    isp: Optional[str] = None
    org: Optional[str] = None
    as_number: Optional[str] = None

    # Threat indicators
    is_proxy: bool = False
    is_vpn: bool = False
    is_tor: bool = False
    is_hosting: bool = False
    threat_score: int = 0  # 0-100

    # Request details from first detection
    user_agent: Optional[str] = None
    endpoint: Optional[str] = None
    method: Optional[str] = None
    headers: Dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "ip": self.ip,
            "first_seen": self.first_seen.isoformat(),
            "last_seen": self.last_seen.isoformat(),
            "request_count": self.request_count,
            "country": self.country,
            "country_code": self.country_code,
            "city": self.city,
            "region": self.region,
            "isp": self.isp,
            "org": self.org,
            "as_number": self.as_number,
            "is_proxy": self.is_proxy,
            "is_vpn": self.is_vpn,
            "is_tor": self.is_tor,
            "is_hosting": self.is_hosting,
            "threat_score": self.threat_score,
            "user_agent": self.user_agent,
            "endpoint": self.endpoint,
            "method": self.method,
            "headers": self.headers,
        }


class IPBlocklist:
    """
    Thread-safe IP blocklist with threat intelligence storage.
    """

    def __init__(self):
        self._blocked_ips: Set[str] = set()
        self._threat_intel: Dict[str, ThreatInfo] = {}
        self._lock = Lock()

    def block(self, ip: str, info: Optional[ThreatInfo] = None) -> None:
        """Add IP to blocklist."""
        with self._lock:
            self._blocked_ips.add(ip)
            if info:
                self._threat_intel[ip] = info
            elif ip not in self._threat_intel:
                # Create minimal threat info
                now = datetime.now()
                self._threat_intel[ip] = ThreatInfo(
                    ip=ip,
                    first_seen=now,
                    last_seen=now,
                )
            logger.info(f"[SECURITY] Blocked IP: {ip}")

    def unblock(self, ip: str) -> bool:
        """Remove IP from blocklist. Returns True if IP was blocked."""
        with self._lock:
            if ip in self._blocked_ips:
                self._blocked_ips.discard(ip)
                logger.info(f"[SECURITY] Unblocked IP: {ip}")
                return True
            return False

    def is_blocked(self, ip: str) -> bool:
        """Check if IP is blocked."""
        with self._lock:
            return ip in self._blocked_ips

    def get_all_blocked(self) -> List[str]:
        """Get list of all blocked IPs."""
        with self._lock:
            return list(self._blocked_ips)

    def get_intel(self, ip: str) -> Optional[ThreatInfo]:
        """Get threat intelligence for an IP."""
        with self._lock:
            return self._threat_intel.get(ip)

    def update_intel(self, ip: str, intel: ThreatInfo) -> None:
        """Update threat intelligence for an IP."""
        with self._lock:
            self._threat_intel[ip] = intel

    def get_all_intel(self) -> Dict[str, ThreatInfo]:
        """Get all threat intelligence."""
        with self._lock:
            return dict(self._threat_intel)

    def increment_request_count(self, ip: str) -> None:
        """Increment the request count for an IP."""
        with self._lock:
            if ip in self._threat_intel:
                self._threat_intel[ip].request_count += 1
                self._threat_intel[ip].last_seen = datetime.now()

    def clear(self) -> None:
        """Clear all blocked IPs and intel."""
        with self._lock:
            self._blocked_ips.clear()
            self._threat_intel.clear()
            logger.info("[SECURITY] Cleared all blocked IPs")

    @property
    def count(self) -> int:
        """Number of blocked IPs."""
        with self._lock:
            return len(self._blocked_ips)


# Global singleton
blocklist = IPBlocklist()
