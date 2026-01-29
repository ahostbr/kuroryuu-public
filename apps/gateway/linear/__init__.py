"""
Linear Integration Module

Integrates with Linear.app for issue tracking and project management.
Supports syncing tasks between Kuroryuu and Linear.
"""

from .client import LinearClient, get_linear_client
from .router import router
from .models import (
    LinearIssue,
    LinearProject,
    LinearTeam,
    LinearUser,
    LinearConfig,
    SyncDirection,
    SyncResult,
)

__all__ = [
    'router',
    'LinearClient',
    'get_linear_client',
    'LinearIssue',
    'LinearProject',
    'LinearTeam',
    'LinearUser',
    'LinearConfig',
    'SyncDirection',
    'SyncResult',
]
