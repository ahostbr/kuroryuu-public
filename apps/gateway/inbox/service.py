"""Inbox Service - Business logic for message operations.

M3 Multi-Agent Message Bus implementation.
"""

from __future__ import annotations

from typing import List, Optional, Tuple

from .models import (
    Message,
    MessagePriority,
    MessageStatus,
)
from .storage import InboxStorage, get_storage


class InboxService:
    """Service layer for inbox operations.
    
    Provides high-level operations:
    - send: Create and queue a message
    - claim: Exclusively claim a message for processing
    - ack: Acknowledge claim and start work
    - complete: Mark work done with result
    - release: Give up claim, return to pending
    """
    
    def __init__(self, storage: Optional[InboxStorage] = None):
        """Initialize service.
        
        Args:
            storage: Storage backend (uses singleton if not provided)
        """
        self._storage = storage or get_storage()
    
    def send(
        self,
        from_agent: str,
        to_agent: str,
        subject: str,
        body: str = "",
        priority: MessagePriority = MessagePriority.NORMAL,
        metadata: Optional[dict] = None,
    ) -> Tuple[Message, str]:
        """Send a message to an agent.
        
        Args:
            from_agent: Sender agent ID or 'system'
            to_agent: Target: agent_id, 'broadcast', or 'workers'
            subject: Brief task description
            body: Detailed content
            priority: Message priority
            metadata: Additional metadata
            
        Returns:
            Tuple of (Message, status_message)
        """
        message = Message(
            from_agent=from_agent,
            to_agent=to_agent,
            subject=subject,
            body=body,
            priority=priority,
            metadata=metadata or {},
        )
        
        self._storage.save(message)
        return message, f"Message {message.message_id} sent to {to_agent}"
    
    def claim(
        self,
        message_id: str,
        agent_id: str,
    ) -> Tuple[bool, str, Optional[Message]]:
        """Claim a message for exclusive processing.
        
        Args:
            message_id: Message to claim
            agent_id: Agent claiming
            
        Returns:
            Tuple of (success, status_message, message_if_success)
        """
        message = self._storage.get(message_id)
        
        if not message:
            return False, f"Message {message_id} not found", None
        
        if message.status != MessageStatus.PENDING:
            return False, f"Message already {message.status.value}", None
        
        # Check if agent is allowed to claim
        if message.to_agent not in (agent_id, "broadcast", "workers"):
            return False, f"Message not addressed to {agent_id}", None
        
        if not message.claim(agent_id):
            return False, "Failed to claim message", None
        
        self._storage.save(message)
        return True, f"Message claimed by {agent_id}", message
    
    def ack(
        self,
        message_id: str,
        agent_id: str,
    ) -> Tuple[bool, str]:
        """Acknowledge claim and start progress.
        
        Args:
            message_id: Message to acknowledge
            agent_id: Agent acknowledging
            
        Returns:
            Tuple of (success, status_message)
        """
        message = self._storage.get(message_id)
        
        if not message:
            return False, f"Message {message_id} not found"
        
        if message.claimed_by != agent_id:
            return False, f"Message not claimed by {agent_id}"
        
        if not message.start_progress():
            return False, f"Cannot start progress from {message.status.value}"
        
        self._storage.save(message)
        return True, f"Message {message_id} in progress"
    
    def complete(
        self,
        message_id: str,
        agent_id: str,
        success: bool = True,
        result: str = "",
    ) -> Tuple[bool, str]:
        """Mark message as completed or failed.
        
        Args:
            message_id: Message to complete
            agent_id: Agent completing
            success: True for completed, False for failed
            result: Result content or error message
            
        Returns:
            Tuple of (success, status_message)
        """
        message = self._storage.get(message_id)
        
        if not message:
            return False, f"Message {message_id} not found"
        
        if message.claimed_by != agent_id:
            return False, f"Message not claimed by {agent_id}"
        
        if success:
            if not message.complete(result):
                return False, f"Cannot complete from {message.status.value}"
            status_msg = f"Message {message_id} completed"
        else:
            if not message.fail(result):
                return False, f"Cannot fail from {message.status.value}"
            status_msg = f"Message {message_id} failed"
        
        self._storage.save(message)
        return True, status_msg
    
    def release(
        self,
        message_id: str,
        agent_id: str,
    ) -> Tuple[bool, str]:
        """Release claim on a message, return to pending.
        
        Args:
            message_id: Message to release
            agent_id: Agent releasing
            
        Returns:
            Tuple of (success, status_message)
        """
        message = self._storage.get(message_id)
        
        if not message:
            return False, f"Message {message_id} not found"
        
        if message.claimed_by != agent_id:
            return False, f"Message not claimed by {agent_id}"
        
        if not message.release():
            return False, f"Cannot release from {message.status.value}"
        
        self._storage.save(message)
        return True, f"Message {message_id} released"
    
    def get(self, message_id: str) -> Optional[Message]:
        """Get a message by ID."""
        return self._storage.get(message_id)
    
    def list_for_agent(
        self,
        agent_id: str,
        include_claimed: bool = True,
        limit: int = 20,
    ) -> List[Message]:
        """List messages available to an agent.
        
        Args:
            agent_id: Agent to list messages for
            include_claimed: Include messages claimed by this agent
            limit: Max messages to return
        """
        # Get pending messages for this agent
        pending = self._storage.list_pending_for_agent(agent_id, limit)
        
        if not include_claimed:
            return pending
        
        # Also include messages claimed by this agent
        all_messages = self._storage.list_all(limit=limit * 2)
        claimed = [
            m for m in all_messages 
            if m.claimed_by == agent_id 
            and m.status in (MessageStatus.CLAIMED, MessageStatus.IN_PROGRESS)
        ]
        
        # Combine and deduplicate
        seen_ids = set()
        result = []
        for msg in claimed + pending:  # Claimed first, then pending
            if msg.message_id not in seen_ids:
                seen_ids.add(msg.message_id)
                result.append(msg)
        
        return result[:limit]
    
    def list_all(
        self,
        status: Optional[MessageStatus] = None,
        to_agent: Optional[str] = None,
        limit: int = 50,
    ) -> List[Message]:
        """List all messages with optional filters."""
        return self._storage.list_all(
            to_agent=to_agent,
            status=status,
            limit=limit,
        )
    
    def stats(self) -> dict:
        """Get inbox statistics."""
        return self._storage.stats()
    
    def cleanup(self, older_than_hours: int = 24) -> int:
        """Cleanup old completed/failed messages."""
        return self._storage.cleanup_completed(older_than_hours)


# ═══════════════════════════════════════════════════════════════════════════════
# Global Service Singleton
# ═══════════════════════════════════════════════════════════════════════════════

_inbox: Optional[InboxService] = None


def get_inbox() -> InboxService:
    """Get the global inbox service singleton."""
    global _inbox
    if _inbox is None:
        _inbox = InboxService()
    return _inbox
