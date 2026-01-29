"""Anthropic OAuth authentication for Claude Pro/Max subscriptions.

!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
!! IMPORTANT: READ OAUTH_NOTES.md BEFORE WORKING ON THIS MODULE            !!
!!                                                                          !!
!! OAuth login WORKS but Anthropic BLOCKS third-party tokens with:         !!
!!   "This credential is only authorized for use with Claude Code"         !!
!!                                                                          !!
!! OpenCode works around this by spoofing Claude Code's headers - this     !!
!! violates Anthropic's ToS and risks account bans.                        !!
!!                                                                          !!
!! RECOMMENDATION: Use API key authentication instead (claude_api.ini)      !!
!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

This module implements OAuth 2.0 PKCE flow to authenticate with Anthropic's
OAuth endpoints, allowing users with Claude Pro/Max subscriptions to use
their subscription credits instead of API keys.

Endpoints extracted from opencode-anthropic-auth:
- Authorization: https://claude.ai/oauth/authorize (Max) or https://console.anthropic.com/oauth/authorize (Console)
- Token: https://console.anthropic.com/v1/oauth/token
- API Key Creation: https://api.anthropic.com/api/oauth/claude_cli/create_api_key
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import json
import logging
import os
import secrets
import time
import webbrowser
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, Literal, Optional
from urllib.parse import urlencode

try:
    import aiohttp
except ImportError:
    aiohttp = None  # type: ignore

try:
    from aiohttp import web
except ImportError:
    web = None  # type: ignore

logger = logging.getLogger(__name__)

# ============================================================================
# Constants - Extracted from opencode-anthropic-auth
# ============================================================================

# OAuth Client ID (public, used by OpenCode/Claude CLI)
ANTHROPIC_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"

# OAuth Endpoints
OAUTH_AUTHORIZE_MAX = "https://claude.ai/oauth/authorize"
OAUTH_AUTHORIZE_CONSOLE = "https://console.anthropic.com/oauth/authorize"
OAUTH_TOKEN_ENDPOINT = "https://console.anthropic.com/v1/oauth/token"
OAUTH_CREATE_API_KEY = "https://api.anthropic.com/api/oauth/claude_cli/create_api_key"

# Redirect URI (same as opencode)
OAUTH_REDIRECT_URI = "https://console.anthropic.com/oauth/code/callback"

# OAuth Scopes
OAUTH_SCOPES = "org:create_api_key user:profile user:inference"

# Local callback server
OAUTH_CALLBACK_PORT = 19275  # Different from opencode to avoid conflicts

# Required headers for OAuth API calls
ANTHROPIC_BETA_HEADERS = "oauth-2025-04-20,interleaved-thinking-2025-05-14"
USER_AGENT = "kuroryuu-cli/1.0.0 (external, cli)"

# Token storage
TOKEN_FILE = ".kuroryuu_anthropic_oauth.json"


# ============================================================================
# PKCE Utilities
# ============================================================================

def generate_pkce_pair() -> tuple[str, str]:
    """Generate PKCE code verifier and challenge.
    
    Returns:
        (verifier, challenge) tuple
    """
    # Generate 43-byte random verifier (base64url encoded = ~58 chars)
    verifier_bytes = secrets.token_bytes(32)
    verifier = base64.urlsafe_b64encode(verifier_bytes).decode('ascii').rstrip('=')
    
    # Generate challenge = base64url(sha256(verifier))
    challenge_hash = hashlib.sha256(verifier.encode('ascii')).digest()
    challenge = base64.urlsafe_b64encode(challenge_hash).decode('ascii').rstrip('=')
    
    return verifier, challenge


def generate_state() -> str:
    """Generate random state parameter for CSRF protection."""
    return base64.urlsafe_b64encode(secrets.token_bytes(32)).decode('ascii').rstrip('=')


# ============================================================================
# Token Storage
# ============================================================================

@dataclass
class OAuthTokens:
    """OAuth token storage."""
    
    access_token: str
    refresh_token: str
    expires_at: float  # Unix timestamp
    token_type: str = "Bearer"
    
    # Optional metadata
    account_id: Optional[str] = None
    email: Optional[str] = None
    
    def is_expired(self, buffer_seconds: int = 60) -> bool:
        """Check if access token is expired or about to expire."""
        return time.time() >= (self.expires_at - buffer_seconds)
    
    def to_dict(self) -> Dict[str, Any]:
        """Serialize to dict for storage."""
        return {
            "access_token": self.access_token,
            "refresh_token": self.refresh_token,
            "expires_at": self.expires_at,
            "token_type": self.token_type,
            "account_id": self.account_id,
            "email": self.email,
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "OAuthTokens":
        """Deserialize from dict."""
        return cls(
            access_token=data["access_token"],
            refresh_token=data["refresh_token"],
            expires_at=data["expires_at"],
            token_type=data.get("token_type", "Bearer"),
            account_id=data.get("account_id"),
            email=data.get("email"),
        )


def get_token_path() -> Path:
    """Get path to token storage file."""
    # Store in user's home directory
    return Path.home() / TOKEN_FILE


def save_tokens(tokens: OAuthTokens) -> None:
    """Save tokens to disk."""
    path = get_token_path()
    path.write_text(json.dumps(tokens.to_dict(), indent=2), encoding='utf-8')
    # Restrict permissions on Unix
    try:
        os.chmod(path, 0o600)
    except (OSError, AttributeError):
        pass  # Windows doesn't support chmod the same way
    logger.info(f"Saved OAuth tokens to {path}")


def load_tokens() -> Optional[OAuthTokens]:
    """Load tokens from disk."""
    path = get_token_path()
    if not path.exists():
        return None
    try:
        data = json.loads(path.read_text(encoding='utf-8'))
        return OAuthTokens.from_dict(data)
    except (json.JSONDecodeError, KeyError) as e:
        logger.warning(f"Failed to load OAuth tokens: {e}")
        return None


def clear_tokens() -> None:
    """Clear stored tokens."""
    path = get_token_path()
    if path.exists():
        path.unlink()
        logger.info("Cleared OAuth tokens")


# ============================================================================
# OAuth Flow Implementation
# ============================================================================

@dataclass
class OAuthFlow:
    """Manages the OAuth authorization flow."""
    
    mode: Literal["max", "console"] = "max"
    _verifier: str = field(default="", init=False)
    _state: str = field(default="", init=False)
    
    def get_authorization_url(self) -> str:
        """Generate the authorization URL for browser redirect.
        
        Returns:
            Full authorization URL with all required parameters
        """
        self._verifier, challenge = generate_pkce_pair()
        self._state = generate_state()
        
        base_url = OAUTH_AUTHORIZE_MAX if self.mode == "max" else OAUTH_AUTHORIZE_CONSOLE
        
        params = {
            "code": "true",
            "client_id": ANTHROPIC_CLIENT_ID,
            "response_type": "code",
            "redirect_uri": OAUTH_REDIRECT_URI,
            "scope": OAUTH_SCOPES,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "state": self._verifier,  # opencode uses verifier as state
        }
        
        return f"{base_url}?{urlencode(params)}"
    
    async def exchange_code(self, code: str) -> OAuthTokens:
        """Exchange authorization code for tokens.
        
        Args:
            code: The authorization code from callback (may include state after #)
            
        Returns:
            OAuthTokens object
            
        Raises:
            OAuthError: If token exchange fails
        """
        if aiohttp is None:
            raise ImportError("aiohttp is required for OAuth. Install with: pip install aiohttp")
        
        # Code may be in format "code#state"
        if "#" in code:
            code, received_state = code.split("#", 1)
        else:
            received_state = None
        
        payload = {
            "code": code,
            "state": received_state or self._state,
            "grant_type": "authorization_code",
            "client_id": ANTHROPIC_CLIENT_ID,
            "redirect_uri": OAUTH_REDIRECT_URI,
            "code_verifier": self._verifier,
        }
        
        async with aiohttp.ClientSession() as session:
            async with session.post(
                OAUTH_TOKEN_ENDPOINT,
                json=payload,
                headers={"Content-Type": "application/json"}
            ) as resp:
                if not resp.ok:
                    error_text = await resp.text()
                    raise OAuthError(f"Token exchange failed ({resp.status}): {error_text}")
                
                data = await resp.json()
        
        expires_in = data.get("expires_in", 3600)
        tokens = OAuthTokens(
            access_token=data["access_token"],
            refresh_token=data["refresh_token"],
            expires_at=time.time() + expires_in,
        )
        
        return tokens


async def refresh_access_token(refresh_token: str) -> OAuthTokens:
    """Refresh an expired access token.
    
    Args:
        refresh_token: The refresh token
        
    Returns:
        New OAuthTokens object
    """
    if aiohttp is None:
        raise ImportError("aiohttp is required for OAuth. Install with: pip install aiohttp")
    
    payload = {
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "client_id": ANTHROPIC_CLIENT_ID,
    }
    
    async with aiohttp.ClientSession() as session:
        async with session.post(
            OAUTH_TOKEN_ENDPOINT,
            json=payload,
            headers={"Content-Type": "application/json"}
        ) as resp:
            if not resp.ok:
                error_text = await resp.text()
                raise OAuthError(f"Token refresh failed ({resp.status}): {error_text}")
            
            data = await resp.json()
    
    expires_in = data.get("expires_in", 3600)
    return OAuthTokens(
        access_token=data["access_token"],
        refresh_token=data.get("refresh_token", refresh_token),
        expires_at=time.time() + expires_in,
    )


async def create_api_key(access_token: str) -> str:
    """Create an API key using OAuth token.
    
    This is useful for console flow where user wants a persistent API key.
    
    Args:
        access_token: Valid OAuth access token
        
    Returns:
        The raw API key string
    """
    if aiohttp is None:
        raise ImportError("aiohttp is required for OAuth. Install with: pip install aiohttp")
    
    async with aiohttp.ClientSession() as session:
        async with session.post(
            OAUTH_CREATE_API_KEY,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {access_token}",
            }
        ) as resp:
            if not resp.ok:
                error_text = await resp.text()
                raise OAuthError(f"API key creation failed ({resp.status}): {error_text}")
            
            data = await resp.json()
    
    return data["raw_key"]


# ============================================================================
# Token Management
# ============================================================================

async def get_valid_access_token() -> Optional[str]:
    """Get a valid access token, refreshing if necessary.
    
    Returns:
        Valid access token or None if not authenticated
    """
    tokens = load_tokens()
    if tokens is None:
        return None
    
    if tokens.is_expired():
        logger.info("Access token expired, refreshing...")
        try:
            new_tokens = await refresh_access_token(tokens.refresh_token)
            save_tokens(new_tokens)
            return new_tokens.access_token
        except OAuthError as e:
            logger.error(f"Failed to refresh token: {e}")
            clear_tokens()
            return None
    
    return tokens.access_token


def is_authenticated() -> bool:
    """Check if user has valid stored OAuth tokens."""
    tokens = load_tokens()
    return tokens is not None


# ============================================================================
# Interactive Login Flow
# ============================================================================

async def interactive_login(
    mode: Literal["max", "console"] = "max",
    callback: Optional[Callable[[str], None]] = None,
) -> OAuthTokens:
    """Run interactive OAuth login flow.
    
    Opens browser for user authorization, then waits for the code to be
    pasted back (since Anthropic's redirect doesn't support localhost).
    
    Args:
        mode: "max" for Claude Pro/Max, "console" for Console/API key creation
        callback: Optional callback for status updates
        
    Returns:
        OAuthTokens object
    """
    flow = OAuthFlow(mode=mode)
    auth_url = flow.get_authorization_url()
    
    def log(msg: str):
        if callback:
            callback(msg)
        else:
            print(msg)
    
    log(f"\n{'='*60}")
    log("Anthropic OAuth Login")
    log(f"{'='*60}")
    log(f"\nMode: {'Claude Pro/Max' if mode == 'max' else 'Anthropic Console'}")
    log("\n1. Opening browser for authorization...")
    log(f"\n   URL: {auth_url}")
    
    # Try to open browser
    try:
        webbrowser.open(auth_url)
        log("\n   (Browser opened automatically)")
    except Exception:
        log("\n   (Could not open browser automatically - please copy the URL)")
    
    log("\n2. After authorizing, you'll see a code. Copy and paste it below.")
    log("   The code may look like: abc123...#xyz789...")
    log(f"\n{'='*60}")
    
    # Wait for user to paste the code
    code = input("\nPaste authorization code: ").strip()
    
    if not code:
        raise OAuthError("No authorization code provided")
    
    log("\n3. Exchanging code for tokens...")
    tokens = await flow.exchange_code(code)
    
    # Save tokens
    save_tokens(tokens)
    
    log("\nSuccess! OAuth tokens saved.")
    log(f"Token expires at: {time.ctime(tokens.expires_at)}")
    
    return tokens


# ============================================================================
# HTTP Client Utilities for OAuth-authenticated requests
# ============================================================================

def get_oauth_headers(access_token: str, include_claude_code: bool = False) -> Dict[str, str]:
    """Get headers for OAuth-authenticated Anthropic API requests.
    
    Args:
        access_token: Valid OAuth access token
        include_claude_code: Whether to include claude-code beta header
        
    Returns:
        Headers dict for API requests
    """
    betas = ["oauth-2025-04-20", "interleaved-thinking-2025-05-14"]
    if include_claude_code:
        betas.append("claude-code-20250219")
    
    return {
        "Authorization": f"Bearer {access_token}",
        "anthropic-beta": ",".join(betas),
        "User-Agent": USER_AGENT,
        # Note: Do NOT include x-api-key when using OAuth
    }


# ============================================================================
# Exceptions
# ============================================================================

class OAuthError(Exception):
    """OAuth-related error."""
    pass


# ============================================================================
# CLI Entry Point
# ============================================================================

async def main():
    """CLI entry point for testing OAuth flow."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Anthropic OAuth authentication")
    parser.add_argument(
        "--mode",
        choices=["max", "console"],
        default="max",
        help="OAuth mode: 'max' for Claude Pro/Max, 'console' for API key creation"
    )
    parser.add_argument(
        "--logout",
        action="store_true",
        help="Clear stored tokens"
    )
    parser.add_argument(
        "--status",
        action="store_true",
        help="Check authentication status"
    )
    parser.add_argument(
        "--create-api-key",
        action="store_true",
        help="Create an API key (requires console mode login first)"
    )
    
    args = parser.parse_args()
    
    if args.logout:
        clear_tokens()
        print("Logged out successfully")
        return
    
    if args.status:
        tokens = load_tokens()
        if tokens is None:
            print("Not authenticated")
        elif tokens.is_expired():
            print("Authenticated but token expired (will refresh on next use)")
        else:
            print(f"Authenticated")
            print(f"  Token expires: {time.ctime(tokens.expires_at)}")
            if tokens.email:
                print(f"  Email: {tokens.email}")
        return
    
    if args.create_api_key:
        token = await get_valid_access_token()
        if not token:
            print("Not authenticated. Run login first with --mode console")
            return
        api_key = await create_api_key(token)
        print(f"\nAPI Key created: {api_key}")
        print("\nStore this key securely - it won't be shown again!")
        return
    
    # Run login flow
    await interactive_login(mode=args.mode)


if __name__ == "__main__":
    asyncio.run(main())
