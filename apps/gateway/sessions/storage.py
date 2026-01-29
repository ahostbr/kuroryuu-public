"""
Session Storage

RAG-integrated persistence for agent sessions.
Stores JSON files in ai/agent_sessions/ and provides
queryable + auto-indexed functionality.
"""
import json
import os
from pathlib import Path
from typing import Optional, List, Dict, Any
from datetime import datetime
import logging

from .models import AgentSession, SessionMessage, SessionMetadata, MessageRole, MessageStatus

logger = logging.getLogger(__name__)


class SessionStorage:
    """
    Persistent storage for agent sessions.
    
    Features:
    - JSON file storage in ai/agent_sessions/
    - Session listing and retrieval
    - RAG document generation for indexing
    - Session search by agent, date, or content
    """
    
    def __init__(self, base_dir: str = "ai/agent_sessions"):
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)
        self._index_file = self.base_dir / "_index.json"
        self._index: Dict[str, Dict[str, Any]] = self._load_index()
    
    def _load_index(self) -> Dict[str, Dict[str, Any]]:
        """Load the session index from disk."""
        if self._index_file.exists():
            try:
                with open(self._index_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"Failed to load index: {e}")
        return {}
    
    def _save_index(self):
        """Save the session index to disk."""
        try:
            with open(self._index_file, "w", encoding="utf-8") as f:
                json.dump(self._index, f, indent=2)
        except Exception as e:
            logger.error(f"Failed to save index: {e}")
    
    def _session_path(self, session_id: str) -> Path:
        """Get the file path for a session."""
        # Use date prefix for organization
        date_prefix = session_id.split("_")[0] if "_" in session_id else datetime.now().strftime("%Y%m%d")
        return self.base_dir / f"{date_prefix}_{session_id}.json"
    
    def create_session(
        self,
        agent_id: str,
        agent_name: str,
        model_name: Optional[str] = None,
        lmstudio_ip: Optional[str] = None,
        session_id: Optional[str] = None,
    ) -> AgentSession:
        """Create a new session."""
        if session_id is None:
            session_id = f"{datetime.now().strftime('%Y%m%d_%H%M%S')}_{agent_id[:8]}"
        
        metadata = SessionMetadata(
            agent_id=agent_id,
            agent_name=agent_name,
            model_name=model_name,
            lmstudio_ip=lmstudio_ip,
        )
        
        session = AgentSession(
            session_id=session_id,
            metadata=metadata,
        )
        
        # Save and index
        self.save_session(session)
        
        return session
    
    def save_session(self, session: AgentSession):
        """Save a session to disk and update index."""
        path = self._session_path(session.session_id)
        
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(session.to_dict(), f, indent=2)
            
            # Update index
            self._index[session.session_id] = {
                "agent_id": session.metadata.agent_id,
                "agent_name": session.metadata.agent_name,
                "model_name": session.metadata.model_name,
                "created_at": session.metadata.created_at,
                "updated_at": session.metadata.updated_at,
                "message_count": session.metadata.total_messages,
                "file_path": str(path),
            }
            self._save_index()
            
            logger.debug(f"Saved session {session.session_id} to {path}")
        except Exception as e:
            logger.error(f"Failed to save session {session.session_id}: {e}")
            raise
    
    def load_session(self, session_id: str) -> Optional[AgentSession]:
        """Load a session from disk."""
        path = self._session_path(session_id)
        
        if not path.exists():
            # Try from index
            if session_id in self._index:
                path = Path(self._index[session_id]["file_path"])
        
        if not path.exists():
            logger.warning(f"Session not found: {session_id}")
            return None
        
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            return AgentSession.from_dict(data)
        except Exception as e:
            logger.error(f"Failed to load session {session_id}: {e}")
            return None
    
    def delete_session(self, session_id: str) -> bool:
        """Delete a session from disk."""
        path = self._session_path(session_id)
        
        if session_id in self._index:
            path = Path(self._index[session_id]["file_path"])
            del self._index[session_id]
            self._save_index()
        
        if path.exists():
            try:
                path.unlink()
                logger.info(f"Deleted session {session_id}")
                return True
            except Exception as e:
                logger.error(f"Failed to delete session {session_id}: {e}")
        
        return False
    
    def list_sessions(
        self,
        agent_id: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[Dict[str, Any]]:
        """List sessions, optionally filtered by agent."""
        sessions = list(self._index.values())
        
        if agent_id:
            sessions = [s for s in sessions if s.get("agent_id") == agent_id]
        
        # Sort by updated_at descending
        sessions.sort(key=lambda s: s.get("updated_at", 0), reverse=True)
        
        return sessions[offset:offset + limit]
    
    def add_message(self, session_id: str, message: SessionMessage) -> bool:
        """Add a message to an existing session."""
        session = self.load_session(session_id)
        if not session:
            logger.error(f"Cannot add message - session not found: {session_id}")
            return False
        
        session.add_message(message)
        self.save_session(session)
        return True
    
    def get_session_for_agent(self, agent_id: str) -> Optional[AgentSession]:
        """Get the most recent session for an agent."""
        sessions = self.list_sessions(agent_id=agent_id, limit=1)
        if sessions:
            return self.load_session(sessions[0].get("session_id") or list(self._index.keys())[0])
        return None
    
    def search_sessions(
        self,
        query: str,
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        """Search sessions by content (simple text match for now)."""
        results = []
        query_lower = query.lower()
        
        for session_id in self._index:
            session = self.load_session(session_id)
            if not session:
                continue
            
            # Search in messages
            for msg in session.messages:
                if query_lower in msg.content.lower():
                    results.append({
                        "session_id": session_id,
                        "agent_name": session.metadata.agent_name,
                        "message_id": msg.id,
                        "preview": msg.content[:200],
                        "timestamp": msg.timestamp,
                    })
                    break  # One match per session
            
            if len(results) >= limit:
                break
        
        return results
    
    def generate_rag_documents(self) -> List[Dict[str, str]]:
        """Generate RAG-indexable documents for all sessions."""
        documents = []
        
        for session_id in self._index:
            session = self.load_session(session_id)
            if session:
                documents.append({
                    "id": f"session_{session_id}",
                    "content": session.to_rag_document(),
                    "metadata": {
                        "type": "agent_session",
                        "session_id": session_id,
                        "agent_id": session.metadata.agent_id,
                        "agent_name": session.metadata.agent_name,
                    }
                })
        
        return documents
    
    def get_context_for_agent(
        self,
        agent_id: str,
        max_messages: int = 20,
    ) -> str:
        """Get context from recent sessions for context injection."""
        session = self.get_session_for_agent(agent_id)
        if not session:
            return ""
        
        # Get last N messages
        recent = session.messages[-max_messages:]
        
        lines = [f"## Recent conversation with {session.metadata.agent_name}:", ""]
        for msg in recent:
            role = msg.role.value if isinstance(msg.role, MessageRole) else msg.role
            lines.append(f"**{role}**: {msg.content[:500]}")
        
        return "\n".join(lines)


# Singleton instance
_storage: Optional[SessionStorage] = None


def get_session_storage() -> SessionStorage:
    """Get the singleton session storage instance."""
    global _storage
    if _storage is None:
        _storage = SessionStorage()
    return _storage
