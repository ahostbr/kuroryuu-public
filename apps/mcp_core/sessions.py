"""Session Manager for Spawned CLI Processes.

Tracks CLI sessions spawned by Kuroryuu agent system.
Persists to ai/sessions.json for cross-restart recovery.
"""

import json
import uuid
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from threading import Lock
from typing import Dict, List, Optional

try:
    from .paths import get_ai_dir_or_env
except ImportError:
    from paths import get_ai_dir_or_env

AI_DIR = get_ai_dir_or_env("KURORYUU_HOOKS_DIR")
SESSIONS_FILE = AI_DIR / "sessions.json"


@dataclass
class CLISession:
    """A spawned CLI session."""
    session_id: str
    process_id: int
    cli_type: str  # kiro, copilot, codex
    agent_id: str
    feature_id: Optional[str]
    status: str = "active"  # active, ended
    start_time: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    end_time: Optional[str] = None
    tool_calls: int = 0
    tool_successes: int = 0
    tool_failures: int = 0
    claude_code_session_id: Optional[str] = None  # Linked from observability events


class SessionManager:
    """Manages CLI sessions with persistence."""
    
    def __init__(self):
        self._sessions: Dict[str, CLISession] = {}
        self._lock = Lock()
        self._load()
    
    def _load(self) -> None:
        """Load sessions from disk."""
        if SESSIONS_FILE.exists():
            try:
                data = json.loads(SESSIONS_FILE.read_text(encoding="utf-8"))
                for s in data.get("sessions", []):
                    self._sessions[s["session_id"]] = CLISession(**s)
            except Exception:
                pass
    
    def _save(self) -> None:
        """Save sessions to disk."""
        AI_DIR.mkdir(parents=True, exist_ok=True)
        data = {"sessions": [asdict(s) for s in self._sessions.values()]}
        SESSIONS_FILE.write_text(json.dumps(data, indent=2), encoding="utf-8")
    
    def create(self, process_id: int, cli_type: str, agent_id: str, feature_id: Optional[str] = None) -> CLISession:
        """Create a new CLI session."""
        with self._lock:
            session_id = f"{cli_type}_{agent_id}_{uuid.uuid4().hex[:8]}"
            session = CLISession(
                session_id=session_id,
                process_id=process_id,
                cli_type=cli_type,
                agent_id=agent_id,
                feature_id=feature_id,
            )
            self._sessions[session_id] = session
            self._save()
            return session
    
    def get(self, session_id: str) -> Optional[CLISession]:
        """Get a session by ID."""
        return self._sessions.get(session_id)
    
    def end(self, session_id: str, exit_code: int = 0) -> Optional[CLISession]:
        """End a session."""
        with self._lock:
            session = self._sessions.get(session_id)
            if session:
                session.status = "ended"
                session.end_time = datetime.now(timezone.utc).isoformat()
                self._save()
            return session
    
    def track_tool(self, session_id: str, success: bool) -> None:
        """Track a tool call for a session."""
        with self._lock:
            session = self._sessions.get(session_id)
            if session:
                session.tool_calls += 1
                if success:
                    session.tool_successes += 1
                else:
                    session.tool_failures += 1
                self._save()
    
    def list_active(self) -> List[CLISession]:
        """List all active sessions."""
        return [s for s in self._sessions.values() if s.status == "active"]
    
    def list_all(self) -> List[CLISession]:
        """List all sessions."""
        return list(self._sessions.values())

    def link_claude_session(self, session_id: str, claude_code_session_id: str) -> Optional[CLISession]:
        """Link a Claude Code session_id to an existing CLI session."""
        with self._lock:
            session = self._sessions.get(session_id)
            if session:
                session.claude_code_session_id = claude_code_session_id
                self._save()
            return session


# Singleton
_manager: Optional[SessionManager] = None

def get_session_manager() -> SessionManager:
    """Get the singleton session manager."""
    global _manager
    if _manager is None:
        _manager = SessionManager()
    return _manager
