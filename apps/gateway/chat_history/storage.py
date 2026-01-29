"""Chat history storage - disk-based persistence for web UI chat sessions."""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Dict, List, Optional, Any
from datetime import datetime
import hashlib


class ChatHistoryStorage:
    """Simple file-based chat history storage per user."""
    
    def __init__(self, base_path: Optional[Path] = None):
        """Initialize storage with base path."""
        if base_path is None:
            # Default to ai/chat_history in project root
            project_root = Path(__file__).parent.parent.parent.parent
            base_path = project_root / "ai" / "chat_history"
        self.base_path = Path(base_path)
        self.base_path.mkdir(parents=True, exist_ok=True)
    
    def _user_dir(self, username: str) -> Path:
        """Get user's chat history directory."""
        # Hash username for safety (no special chars in path)
        safe_name = hashlib.sha256(username.encode()).hexdigest()[:16]
        user_dir = self.base_path / safe_name
        user_dir.mkdir(exist_ok=True)
        return user_dir
    
    def _sessions_file(self, username: str) -> Path:
        """Get the sessions index file for a user."""
        return self._user_dir(username) / "sessions.json"
    
    def get_sessions(self, username: str) -> List[Dict[str, Any]]:
        """Get all sessions for a user (without full message history)."""
        sessions_file = self._sessions_file(username)
        if not sessions_file.exists():
            return []
        
        try:
            with open(sessions_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                # Return sessions without messages (just metadata)
                return [
                    {
                        "id": s["id"],
                        "title": s.get("title", "New Chat"),
                        "createdAt": s.get("createdAt", 0),
                        "messageCount": len(s.get("messages", [])),
                    }
                    for s in data.get("sessions", [])
                ]
        except (json.JSONDecodeError, KeyError):
            return []
    
    def get_session(self, username: str, session_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific session with full message history."""
        sessions_file = self._sessions_file(username)
        if not sessions_file.exists():
            return None
        
        try:
            with open(sessions_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                for s in data.get("sessions", []):
                    if s["id"] == session_id:
                        return s
        except (json.JSONDecodeError, KeyError):
            pass
        return None
    
    def save_session(self, username: str, session: Dict[str, Any]) -> bool:
        """Save or update a session."""
        sessions_file = self._sessions_file(username)
        
        # Load existing
        sessions = []
        if sessions_file.exists():
            try:
                with open(sessions_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    sessions = data.get("sessions", [])
            except (json.JSONDecodeError, KeyError):
                sessions = []
        
        # Update or add session
        found = False
        for i, s in enumerate(sessions):
            if s["id"] == session["id"]:
                sessions[i] = session
                found = True
                break
        
        if not found:
            sessions.insert(0, session)  # New sessions at top
        
        # Save
        try:
            with open(sessions_file, 'w', encoding='utf-8') as f:
                json.dump({"sessions": sessions, "updated": datetime.now().isoformat()}, f, indent=2)
            return True
        except Exception:
            return False
    
    def delete_session(self, username: str, session_id: str) -> bool:
        """Delete a session."""
        sessions_file = self._sessions_file(username)
        if not sessions_file.exists():
            return False
        
        try:
            with open(sessions_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
                sessions = data.get("sessions", [])
            
            original_len = len(sessions)
            sessions = [s for s in sessions if s["id"] != session_id]
            
            if len(sessions) < original_len:
                with open(sessions_file, 'w', encoding='utf-8') as f:
                    json.dump({"sessions": sessions, "updated": datetime.now().isoformat()}, f, indent=2)
                return True
        except (json.JSONDecodeError, KeyError):
            pass
        return False


# Singleton instance
_storage: Optional[ChatHistoryStorage] = None

def get_chat_storage() -> ChatHistoryStorage:
    """Get singleton storage instance."""
    global _storage
    if _storage is None:
        _storage = ChatHistoryStorage()
    return _storage
