"""
Gateway Authentication Module

Provides GitHub OAuth token validation and user context for Gateway endpoints.
Desktop app handles the OAuth flow; Gateway validates tokens passed in requests.
"""

from .models import GatewayUser
from .middleware import get_current_user, require_auth, optional_auth
from .router import router as auth_router

__all__ = [
    "GatewayUser",
    "get_current_user",
    "require_auth",
    "optional_auth",
    "auth_router",
]
