"""Agent Registry Module - M2 Multi-Agent Message Bus.

Provides agent registration, heartbeat tracking, and lifecycle management.
"""

from .models import Agent, AgentRole, AgentStatus
from .registry import AgentRegistry, get_registry

__all__ = [
    "Agent",
    "AgentRole", 
    "AgentStatus",
    "AgentRegistry",
    "get_registry",
]
