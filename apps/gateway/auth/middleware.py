"""
Authentication Middleware

FastAPI dependencies for extracting and validating GitHub OAuth tokens.
"""

import httpx
from typing import Optional
from fastapi import Header, HTTPException, Depends

from .models import GatewayUser
from ..utils.logging_config import get_logger

logger = get_logger(__name__)

# Cache validated tokens temporarily to reduce GitHub API calls
# Key: token, Value: (GatewayUser, timestamp)
_token_cache: dict[str, tuple[GatewayUser, float]] = {}
_CACHE_TTL_SECONDS = 300  # 5 minutes


async def validate_github_token(token: str) -> Optional[GatewayUser]:
    """
    Validate a GitHub OAuth token by calling the GitHub API.

    Returns GatewayUser if valid, None if invalid.
    Caches successful validations for 5 minutes.
    """
    import time

    # Check cache first
    if token in _token_cache:
        user, cached_at = _token_cache[token]
        if time.time() - cached_at < _CACHE_TTL_SECONDS:
            return user
        else:
            del _token_cache[token]

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(
                "https://api.github.com/user",
                headers={
                    "Authorization": f"Bearer {token}",
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
                timeout=10.0,
            )

            if response.status_code != 200:
                return None

            data = response.json()

            # Parse scopes from response headers
            scopes_header = response.headers.get("X-OAuth-Scopes", "")
            scopes = [s.strip() for s in scopes_header.split(",") if s.strip()]

            user = GatewayUser.from_github_response(data, token, scopes)

            # Cache the result
            _token_cache[token] = (user, time.time())

            return user

    except Exception as e:
        logger.warning(f"[Auth] GitHub token validation failed: {e}")
        return None


async def get_current_user(
    authorization: Optional[str] = Header(None, alias="Authorization"),
) -> Optional[GatewayUser]:
    """
    Extract and validate GitHub token from Authorization header.

    Returns GatewayUser if valid token provided, None otherwise.
    Does NOT raise exceptions - use require_auth for mandatory auth.
    """
    if not authorization:
        return None

    if not authorization.startswith("Bearer "):
        return None

    token = authorization[7:]  # Strip "Bearer "

    if not token:
        return None

    return await validate_github_token(token)


async def require_auth(
    user: Optional[GatewayUser] = Depends(get_current_user),
) -> GatewayUser:
    """
    Require valid authentication.

    Raises HTTPException 401 if not authenticated.
    Use this for endpoints that require authentication.
    """
    if user is None:
        raise HTTPException(
            status_code=401,
            detail="Authentication required. Provide a valid GitHub OAuth token.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


async def optional_auth(
    user: Optional[GatewayUser] = Depends(get_current_user),
) -> Optional[GatewayUser]:
    """
    Optional authentication.

    Returns GatewayUser if authenticated, None otherwise.
    Does not raise exceptions.
    """
    return user


def clear_token_cache() -> int:
    """Clear the token validation cache. Returns number of entries cleared."""
    count = len(_token_cache)
    _token_cache.clear()
    return count
