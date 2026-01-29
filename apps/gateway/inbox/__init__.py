"""Kuroryuu Inbox Module - M3 Multi-Agent Message Bus.

Provides inter-agent messaging with send/claim/complete workflow.
Implements k_inbox routed tool pattern.
"""

from .models import (
    Message,
    MessagePriority,
    MessageStatus,
    SendRequest,
    SendResponse,
    ClaimRequest,
    ClaimResponse,
    CompleteRequest,
    CompleteResponse,
    ListResponse,
)
from .storage import InboxStorage, get_storage
from .service import InboxService, get_inbox

__all__ = [
    # Models
    "Message",
    "MessagePriority",
    "MessageStatus",
    "SendRequest",
    "SendResponse",
    "ClaimRequest",
    "ClaimResponse",
    "CompleteRequest",
    "CompleteResponse",
    "ListResponse",
    # Storage
    "InboxStorage",
    "get_storage",
    # Service
    "InboxService",
    "get_inbox",
]
