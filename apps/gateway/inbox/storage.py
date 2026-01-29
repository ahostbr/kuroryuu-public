"""Inbox Storage - Persistence layer for messages.

M3 Multi-Agent Message Bus implementation.
"""

from __future__ import annotations

import json
import threading
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional

from .models import Message, MessagePriority, MessageStatus
from ..utils.logging_config import get_logger

logger = get_logger(__name__)


class InboxStorage:
    """Thread-safe message storage with JSON persistence.
    
    Messages are stored in a single JSON file with structure:
    {
        "messages": { message_id: message_dict, ... },
        "updated_at": "2026-01-07T..."
    }
    """
    
    def __init__(self, persist_path: Optional[Path] = None):
        """Initialize storage.
        
        Args:
            persist_path: Path to JSON file for persistence
        """
        self._messages: Dict[str, Message] = {}
        self._lock = threading.RLock()
        self._persist_path = persist_path
        
        if persist_path and persist_path.exists():
            self._load()
    
    def save(self, message: Message) -> None:
        """Save or update a message."""
        with self._lock:
            self._messages[message.message_id] = message
            self._persist()
    
    def get(self, message_id: str) -> Optional[Message]:
        """Get message by ID."""
        with self._lock:
            return self._messages.get(message_id)
    
    def delete(self, message_id: str) -> bool:
        """Delete a message."""
        with self._lock:
            if message_id in self._messages:
                del self._messages[message_id]
                self._persist()
                return True
            return False
    
    def list_all(
        self,
        to_agent: Optional[str] = None,
        status: Optional[MessageStatus] = None,
        priority: Optional[MessagePriority] = None,
        limit: int = 100,
    ) -> List[Message]:
        """List messages with optional filters.
        
        Args:
            to_agent: Filter by recipient (exact match, 'broadcast', or 'workers')
            status: Filter by status
            priority: Filter by priority
            limit: Max messages to return
        """
        with self._lock:
            messages = list(self._messages.values())
            
            # Apply filters
            if to_agent is not None:
                messages = [
                    m for m in messages 
                    if m.to_agent == to_agent 
                    or m.to_agent == "broadcast"
                    or (to_agent != "broadcast" and m.to_agent == "workers")
                ]
            
            if status is not None:
                messages = [m for m in messages if m.status == status]
            
            if priority is not None:
                messages = [m for m in messages if m.priority == priority]
            
            # Sort by priority (high first) then by created_at (oldest first)
            priority_order = {
                MessagePriority.HIGH: 0,
                MessagePriority.NORMAL: 1,
                MessagePriority.LOW: 2,
            }
            messages.sort(key=lambda m: (priority_order[m.priority], m.created_at))
            
            return messages[:limit]
    
    def list_pending_for_agent(self, agent_id: str, limit: int = 20) -> List[Message]:
        """List pending messages that an agent can claim.
        
        Returns messages where:
        - to_agent matches agent_id exactly, OR
        - to_agent is 'broadcast', OR
        - to_agent is 'workers' (any worker can claim)
        """
        with self._lock:
            messages = [
                m for m in self._messages.values()
                if m.status == MessageStatus.PENDING
                and (m.to_agent == agent_id or m.to_agent in ("broadcast", "workers"))
            ]
            
            # Sort by priority then age
            priority_order = {
                MessagePriority.HIGH: 0,
                MessagePriority.NORMAL: 1,
                MessagePriority.LOW: 2,
            }
            messages.sort(key=lambda m: (priority_order[m.priority], m.created_at))
            
            return messages[:limit]
    
    def stats(self) -> dict:
        """Get storage statistics."""
        with self._lock:
            total = len(self._messages)
            by_status = {}
            for status in MessageStatus:
                by_status[status.value] = sum(
                    1 for m in self._messages.values() if m.status == status
                )
            
            return {
                "total": total,
                "pending": by_status.get("pending", 0),
                "claimed": by_status.get("claimed", 0),
                "in_progress": by_status.get("in_progress", 0),
                "completed": by_status.get("completed", 0),
                "failed": by_status.get("failed", 0),
            }
    
    def cleanup_completed(self, older_than_hours: int = 24) -> int:
        """Remove completed/failed messages older than threshold.
        
        Returns number of messages removed.
        """
        with self._lock:
            cutoff = datetime.utcnow()
            to_remove = []
            
            for msg_id, msg in self._messages.items():
                if msg.status in (MessageStatus.COMPLETED, MessageStatus.FAILED):
                    if msg.completed_at:
                        age_hours = (cutoff - msg.completed_at).total_seconds() / 3600
                        if age_hours > older_than_hours:
                            to_remove.append(msg_id)
            
            for msg_id in to_remove:
                del self._messages[msg_id]
            
            if to_remove:
                self._persist()
            
            return len(to_remove)
    
    def _persist(self) -> None:
        """Persist messages to JSON file."""
        if not self._persist_path:
            return
        
        data = {
            "messages": {
                msg_id: msg.to_dict() 
                for msg_id, msg in self._messages.items()
            },
            "updated_at": datetime.utcnow().isoformat(),
        }
        
        self._persist_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self._persist_path, "w") as f:
            json.dump(data, f, indent=2)
    
    def _load(self) -> None:
        """Load messages from JSON file."""
        if not self._persist_path or not self._persist_path.exists():
            return
        
        try:
            with open(self._persist_path) as f:
                data = json.load(f)
            
            for msg_id, msg_data in data.get("messages", {}).items():
                # Parse datetime strings
                for dt_field in ("claimed_at", "completed_at", "created_at", "updated_at"):
                    if msg_data.get(dt_field):
                        msg_data[dt_field] = datetime.fromisoformat(msg_data[dt_field])
                
                # Parse enums
                msg_data["priority"] = MessagePriority(msg_data["priority"])
                msg_data["status"] = MessageStatus(msg_data["status"])
                
                self._messages[msg_id] = Message(**msg_data)
        except Exception as e:
            logger.warning(f"Failed to load inbox state: {e}")


# ═══════════════════════════════════════════════════════════════════════════════
# Global Storage Singleton
# ═══════════════════════════════════════════════════════════════════════════════

_storage: Optional[InboxStorage] = None


def get_storage() -> InboxStorage:
    """Get the global inbox storage singleton."""
    global _storage
    if _storage is None:
        import os
        persist_path = Path(os.environ.get(
            "KURORYUU_INBOX_PATH",
            "ai/inbox_messages.json"
        ))
        _storage = InboxStorage(persist_path=persist_path)
    return _storage
