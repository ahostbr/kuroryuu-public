"""
Authentication Models

Data structures for authenticated users in the Gateway.
"""

from dataclasses import dataclass, field
from typing import Optional, List


@dataclass
class GatewayUser:
    """
    Authenticated GitHub user context.

    This is populated when a valid GitHub OAuth token is provided
    in the Authorization header of a request.
    """
    github_login: str
    github_id: int
    name: Optional[str] = None
    email: Optional[str] = None
    avatar_url: str = ""
    access_token: str = ""  # The validated token (not stored, just passed through)
    scopes: List[str] = field(default_factory=list)

    def to_dict(self) -> dict:
        """Convert to dictionary (excluding sensitive token)."""
        return {
            "github_login": self.github_login,
            "github_id": self.github_id,
            "name": self.name,
            "email": self.email,
            "avatar_url": self.avatar_url,
            "scopes": self.scopes,
        }

    @classmethod
    def from_github_response(cls, data: dict, token: str, scopes: List[str] = None) -> "GatewayUser":
        """Create from GitHub API /user response."""
        return cls(
            github_login=data.get("login", ""),
            github_id=data.get("id", 0),
            name=data.get("name"),
            email=data.get("email"),
            avatar_url=data.get("avatar_url", ""),
            access_token=token,
            scopes=scopes or [],
        )
