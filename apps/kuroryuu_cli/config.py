"""Configuration management for Kuroryuu CLI."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from enum import Enum
from pathlib import Path
from typing import Literal, Optional


class OperationMode(str, Enum):
    """Operation mode controlling tool access."""

    NORMAL = "normal"  # Full access to all tools
    PLAN = "plan"      # Read-only + planned actions shown (dry run)
    READ = "read"      # Read-only tools only


class ClaudeAuthMode(str, Enum):
    """Claude authentication mode."""
    
    API_KEY = "api_key"  # Traditional API key authentication
    OAUTH = "oauth"      # OAuth (Claude Pro/Max subscription)


@dataclass
class Config:
    """CLI configuration with environment variable fallbacks."""

    # Agent settings
    role: str = "auto"  # leader, worker, auto
    agent_name: Optional[str] = None

    # LLM provider settings
    llm_provider: str = field(default_factory=lambda: os.environ.get(
        "KURORYUU_LLM_PROVIDER", "lmstudio"
    ))  # lmstudio or claude

    # Local LLM settings (LMStudio backend)
    lmstudio_url: str = field(default_factory=lambda: os.environ.get(
        "KURORYUU_LMSTUDIO_BASE_URL",
        os.environ.get("SOTS_LMSTUDIO_BASE", "http://127.0.0.1:1234")
    ))
    model: str = field(default_factory=lambda: os.environ.get(
        "KURORYUU_LMSTUDIO_MODEL",
        os.environ.get("SOTS_LMSTUDIO_MODEL", "mistralai/devstral-small-2-2512")
    ))

    # CLIProxyAPI fallback (Claude Code CLI wrapper)
    cliproxy_url: str = field(default_factory=lambda: os.environ.get(
        "KURORYUU_CLIPROXYAPI_URL", "http://127.0.0.1:8317"
    ))
    cliproxy_model: str = field(default_factory=lambda: os.environ.get(
        "KURORYUU_CLIPROXYAPI_MODEL", "claude-sonnet-4-20250514"
    ))

    # Claude API settings
    claude_api_key: Optional[str] = None  # Loaded from file or env
    claude_model: str = field(default_factory=lambda: os.environ.get(
        "KURORYUU_CLAUDE_MODEL", "claude-opus-4-5-20251101"
    ))
    
    # Claude OAuth settings (for Pro/Max subscription users)
    claude_auth_mode: ClaudeAuthMode = field(default_factory=lambda: ClaudeAuthMode(
        os.environ.get("KURORYUU_CLAUDE_AUTH_MODE", "api_key")
    ))
    claude_oauth_token: Optional[str] = None  # Loaded from OAuth storage

    # Gateway settings
    gateway_url: str = field(default_factory=lambda: os.environ.get(
        "KURORYUU_GATEWAY_URL",
        f"http://127.0.0.1:{os.environ.get('KURORYUU_GATEWAY_PORT', '8200')}"
    ))

    # MCP settings
    mcp_url: str = field(default_factory=lambda: os.environ.get(
        "KURORYUU_MCP_URL", "http://127.0.0.1:8100"
    ))

    # Project settings
    project_root: Path = field(default_factory=lambda: Path(
        os.environ.get("KURORYUU_PROJECT_ROOT", os.getcwd())
    ))

    # Agent limits (0 = unlimited, leader can set via /v1/leader/worker-config)
    max_tool_calls: int = field(default_factory=lambda: int(
        os.environ.get("KURORYUU_MAX_TOOL_CALLS", "0")
    ))

    # Heartbeat settings
    heartbeat_interval: float = 5.0  # seconds
    heartbeat_timeout: float = 30.0  # seconds

    # UI settings
    history_file: str = ".kuroryuu_cli_history"
    streaming: bool = True
    stateless: bool = field(default_factory=lambda: bool(
        os.environ.get("KURORYUU_STATELESS", "true").lower() in ("true", "1", "yes")
    ))  # Default TRUE: don't accumulate conversation history

    # Operation mode (normal, plan, read)
    operation_mode: OperationMode = OperationMode.NORMAL

    @staticmethod
    def _load_claude_api_key() -> Optional[str]:
        """Load Claude API key from file or environment.

        Search order:
        1. ANTHROPIC_API_KEY environment variable
        2. claude_api.ini next to this module
        3. claude_api.ini in parent directory
        4. claude_api.ini in current working directory
        """
        # Check environment first
        env_key = os.environ.get("ANTHROPIC_API_KEY")
        if env_key:
            return env_key

        # Search for file
        search_paths = [
            Path(__file__).parent / "claude_api.ini",
            Path(__file__).parent.parent / "claude_api.ini",
            Path.cwd() / "claude_api.ini",
        ]
        for path in search_paths:
            if path.exists():
                return path.read_text(encoding="utf-8").strip()
        return None
    
    @staticmethod
    def _load_claude_oauth_token() -> Optional[str]:
        """Load Claude OAuth access token from storage.
        
        This retrieves a valid access token, refreshing if necessary.
        Returns None if not authenticated via OAuth.
        """
        try:
            from .anthropic_oauth import load_tokens
            
            tokens = load_tokens()
            if tokens is None:
                return None
            
            # Return the access token (refresh handled lazily by provider)
            return tokens.access_token
        except ImportError:
            return None
        except Exception:
            return None

    @classmethod
    def from_args(cls, args) -> "Config":
        """Create config from parsed arguments."""
        config = cls()

        # Override from args
        if hasattr(args, 'role') and args.role:
            config.role = args.role
        if hasattr(args, 'name') and args.name:
            config.agent_name = args.name
        if hasattr(args, 'model') and args.model:
            config.model = args.model
        if hasattr(args, 'lmstudio_url') and args.lmstudio_url:
            config.lmstudio_url = args.lmstudio_url
        if hasattr(args, 'gateway_url') and args.gateway_url:
            config.gateway_url = args.gateway_url
        if hasattr(args, 'mcp_url') and args.mcp_url:
            config.mcp_url = args.mcp_url
        if hasattr(args, 'project_root') and args.project_root:
            config.project_root = Path(args.project_root)
        if hasattr(args, 'stateless') and args.stateless is not None:
            config.stateless = args.stateless

        # LLM provider settings
        if hasattr(args, 'llm_provider') and args.llm_provider:
            config.llm_provider = args.llm_provider
        if hasattr(args, 'claude_model') and args.claude_model:
            config.claude_model = args.claude_model
        if hasattr(args, 'claude_auth') and args.claude_auth:
            config.claude_auth_mode = ClaudeAuthMode(args.claude_auth)

        # Load Claude credentials based on auth mode
        if config.llm_provider == "claude":
            if config.claude_auth_mode == ClaudeAuthMode.OAUTH:
                # Try OAuth first
                config.claude_oauth_token = cls._load_claude_oauth_token()
                if not config.claude_oauth_token:
                    # Fallback to API key if no OAuth token
                    import logging
                    logging.getLogger(__name__).warning(
                        "OAuth mode selected but no OAuth tokens found. "
                        "Run 'python -m kuroryuu_cli.anthropic_oauth' to authenticate."
                    )
                    config.claude_api_key = cls._load_claude_api_key()
            else:
                # API key mode
                config.claude_api_key = cls._load_claude_api_key()

        # Ensure URLs don't have trailing slashes
        config.lmstudio_url = config.lmstudio_url.rstrip("/")
        config.gateway_url = config.gateway_url.rstrip("/")
        config.mcp_url = config.mcp_url.rstrip("/")

        return config

    def get_history_path(self) -> Path:
        """Get full path to history file."""
        return self.project_root / self.history_file


__all__ = ["Config", "OperationMode", "ClaudeAuthMode"]
