"""Gateway Configuration - Centralized config with environment variable support.

Load settings from environment variables with sensible defaults.
Use .env file for local development (loaded automatically by python-dotenv).

Environment Variables:
    KURORYUU_GATEWAY_HOST: Server bind address (default: 127.0.0.1)
    KURORYUU_GATEWAY_PORT: Server port (default: 8200)
    KURORYUU_AUTH_ENABLED: Enable web UI auth (default: true)
    KURORYUU_AUTH_USERNAME: Auth username (default: Guest)
    KURORYUU_AUTH_PASSWORD_HASH: Pre-hashed password (SHA256)
    KURORYUU_SESSION_TTL_DAYS: Session cookie TTL (default: 7)
    KURORYUU_CORS_ORIGINS: Comma-separated origins (default: localhost only)
    KURORYUU_PUBLIC_DOMAIN: Public domain for tunnel access
    KURORYUU_MCP_URL: MCP server URL (default: http://127.0.0.1:8100)
    KURORYUU_PROXY_PORT: Tunnel proxy port (default: 8199)
    KURORYUU_TRUSTED_PROXIES: Trusted proxy IPs for X-Forwarded headers (default: none)

SECURITY NOTE:
    External access is NOT supported via direct exposure. Use Cloudflare Tunnel
    or Tailscale for secure remote access. The gateway is designed to run on
    localhost only.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional

# Load .env file if present (must be called before reading env vars)
try:
    from dotenv import load_dotenv
    # Look for .env in gateway directory first, then project root
    gateway_dir = Path(__file__).parent
    project_root = gateway_dir.parent.parent

    env_file = gateway_dir / ".env"
    if not env_file.exists():
        env_file = project_root / ".env"

    if env_file.exists():
        load_dotenv(env_file)
except ImportError:
    pass  # python-dotenv not installed, rely on system env vars


def _parse_bool(value: str, default: bool = False) -> bool:
    """Parse boolean from environment variable string."""
    if not value:
        return default
    return value.lower() in ("true", "1", "yes", "on")


def _parse_list(value: str, default: List[str] = None) -> List[str]:
    """Parse comma-separated list from environment variable."""
    if not value:
        return default or []
    return [item.strip() for item in value.split(",") if item.strip()]


@dataclass
class GatewayConfig:
    """Centralized gateway configuration.

    All settings are loaded from environment variables with defaults.
    Use .env file for local development.
    """

    # Server
    host: str = field(default_factory=lambda: os.environ.get("KURORYUU_GATEWAY_HOST", "127.0.0.1"))
    port: int = field(default_factory=lambda: int(os.environ.get("KURORYUU_GATEWAY_PORT", "8200")))

    # Authentication (Web UI only - API endpoints are unprotected)
    auth_enabled: bool = field(default_factory=lambda: _parse_bool(
        os.environ.get("KURORYUU_AUTH_ENABLED", "true"), default=True
    ))
    auth_username: str = field(default_factory=lambda: os.environ.get("KURORYUU_AUTH_USERNAME", "Guest"))
    auth_password_hash: str = field(default_factory=lambda: os.environ.get(
        "KURORYUU_AUTH_PASSWORD_HASH",
        ""  # Must be set via environment variable - use: python -c "import hashlib; print(hashlib.sha256(b'yourpassword').hexdigest())"
    ))
    session_ttl_days: int = field(default_factory=lambda: int(
        os.environ.get("KURORYUU_SESSION_TTL_DAYS", "7")
    ))

    # CORS - Restricted by default to localhost origins + Electron renderer
    # SECURITY: Do NOT use "*" in production - it allows CSRF attacks from any website
    cors_origins: List[str] = field(default_factory=lambda: _parse_list(
        os.environ.get("KURORYUU_CORS_ORIGINS", ""),
        default=[
            "http://localhost:3000",      # Web UI dev server
            "http://127.0.0.1:3000",
            "http://localhost:5173",      # Vite dev server
            "http://127.0.0.1:5173",
            "http://localhost:8200",      # Gateway self (for SPA)
            "http://127.0.0.1:8200",
            "null",                        # Electron renderer (file:// origin)
        ]
    ))

    # External Access (via tunnels only - direct external access NOT supported)
    # Use Cloudflare Tunnel or Tailscale for secure remote access
    public_domain: str = field(default_factory=lambda: os.environ.get(
        "KURORYUU_PUBLIC_DOMAIN", ""
    ))
    # NOTE: KURORYUU_ALLOW_EXTERNAL has been REMOVED for security.
    # External access should ONLY be via Cloudflare Tunnel or Tailscale.

    # MCP Server (centralized - previously duplicated in 3 files)
    mcp_url: str = field(default_factory=lambda: os.environ.get(
        "KURORYUU_MCP_URL", "http://127.0.0.1:8100"
    ))

    # Tunnel Proxy
    proxy_port: int = field(default_factory=lambda: int(
        os.environ.get("KURORYUU_PROXY_PORT", "8199")
    ))

    # Trusted Proxies (for running behind nginx/Caddy)
    # Set to "*" to trust all, or comma-separated IPs/CIDRs
    # When set, X-Forwarded-For headers will be trusted
    trusted_proxies: List[str] = field(default_factory=lambda: _parse_list(
        os.environ.get("KURORYUU_TRUSTED_PROXIES", ""),
        default=[]
    ))

    @property
    def session_ttl_seconds(self) -> int:
        """Session TTL in seconds (for cookie max_age)."""
        return self.session_ttl_days * 86400

    @property
    def cors_allow_all(self) -> bool:
        """Check if CORS allows all origins."""
        return "*" in self.cors_origins or not self.cors_origins


# Global singleton - instantiated once at import time
config = GatewayConfig()


def get_config() -> GatewayConfig:
    """Get the global config instance."""
    return config


def reload_config() -> GatewayConfig:
    """Reload config from environment (useful for testing)."""
    global config
    config = GatewayConfig()
    return config


__all__ = [
    "GatewayConfig",
    "config",
    "get_config",
    "reload_config",
]
