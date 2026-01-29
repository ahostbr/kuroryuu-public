"""
Authentication Router

FastAPI router for auth-related endpoints.
"""

from typing import Optional
from fastapi import APIRouter, Depends

from .models import GatewayUser
from .middleware import get_current_user, require_auth, clear_token_cache

router = APIRouter(prefix="/v1/auth", tags=["auth"])


@router.get("/status")
async def auth_status(
    user: Optional[GatewayUser] = Depends(get_current_user),
) -> dict:
    """
    Check authentication status.

    Returns whether the provided token (if any) is valid.
    """
    if user is None:
        return {
            "authenticated": False,
            "message": "No valid authentication token provided",
        }

    return {
        "authenticated": True,
        "github_login": user.github_login,
        "scopes": user.scopes,
    }


@router.get("/user")
async def get_user(
    user: GatewayUser = Depends(require_auth),
) -> dict:
    """
    Get current authenticated user info.

    Requires valid GitHub OAuth token in Authorization header.
    """
    return {
        "ok": True,
        "user": user.to_dict(),
    }


@router.post("/logout")
async def logout(
    user: GatewayUser = Depends(require_auth),
) -> dict:
    """
    Clear cached authentication for the current token.

    Note: This only clears the Gateway's cache. The token itself
    remains valid until revoked at GitHub.
    """
    # In a full implementation, we might revoke the token at GitHub
    # For now, just clear any cached data
    cleared = clear_token_cache()
    return {
        "ok": True,
        "message": f"Logged out {user.github_login}. Cleared {cleared} cached tokens.",
    }


@router.get("/health")
async def auth_health() -> dict:
    """
    Health check for auth system.
    """
    return {
        "ok": True,
        "service": "auth",
        "status": "operational",
    }
