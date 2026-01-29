"""
Session Manager

Save, load, and list CLI sessions for persistence across runs.
Sessions are stored as JSON files in ai/cli_sessions/.
"""

import json
import hashlib
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Optional, Any
import logging

logger = logging.getLogger(__name__)

# Default sessions directory relative to project root
SESSIONS_DIR = Path("ai/cli_sessions")


class SessionManager:
    """
    Manages CLI session persistence.

    Sessions contain:
    - Conversation history (messages)
    - Model/backend configuration
    - Metadata (timestamps, name, etc.)
    """

    def __init__(self, project_root: Path):
        """
        Initialize session manager.

        Args:
            project_root: Project root directory
        """
        self.project_root = Path(project_root)
        self.sessions_dir = self.project_root / SESSIONS_DIR
        self._ensure_sessions_dir()

    def _ensure_sessions_dir(self) -> None:
        """Create sessions directory if it doesn't exist."""
        self.sessions_dir.mkdir(parents=True, exist_ok=True)
        logger.debug(f"Sessions directory: {self.sessions_dir}")

    def _generate_session_id(self) -> str:
        """Generate a unique session ID."""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        hash_suffix = hashlib.sha256(
            f"{timestamp}{id(self)}".encode()
        ).hexdigest()[:8]
        return f"ses_{timestamp}_{hash_suffix}"

    async def save(
        self,
        session_id: Optional[str],
        messages: List[Dict[str, Any]],
        model: Optional[str] = None,
        backend: Optional[str] = None,
        name: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Save a session to disk.

        Args:
            session_id: Session ID (generated if None)
            messages: Conversation messages
            model: Current model name
            backend: Current backend name
            name: Human-readable session name
            metadata: Additional metadata

        Returns:
            Session info dict with path and ID
        """
        if session_id is None:
            session_id = self._generate_session_id()

        now = datetime.now()

        data = {
            "id": session_id,
            "name": name or session_id,
            "saved_at": now.isoformat(),
            "model": model,
            "backend": backend,
            "message_count": len(messages),
            "messages": messages,
            "metadata": metadata or {},
        }

        path = self.sessions_dir / f"{session_id}.json"
        path.write_text(json.dumps(data, indent=2, default=str))

        logger.info(f"Saved session: {session_id} ({len(messages)} messages)")

        return {
            "id": session_id,
            "name": data["name"],
            "path": str(path),
            "message_count": len(messages),
        }

    async def load(self, session_id: str) -> Dict[str, Any]:
        """
        Load a session from disk.

        Args:
            session_id: Session ID or name to load

        Returns:
            Session data dict

        Raises:
            FileNotFoundError: If session doesn't exist
        """
        # Try exact ID match first
        path = self.sessions_dir / f"{session_id}.json"

        if not path.exists():
            # Try to find by name
            path = self._find_session_by_name(session_id)

        if not path or not path.exists():
            raise FileNotFoundError(f"Session not found: {session_id}")

        data = json.loads(path.read_text())
        logger.info(f"Loaded session: {data['id']} ({data.get('message_count', '?')} messages)")

        return data

    def _find_session_by_name(self, name: str) -> Optional[Path]:
        """Find a session file by name (fuzzy match)."""
        name_lower = name.lower()

        for path in self.sessions_dir.glob("*.json"):
            try:
                data = json.loads(path.read_text())
                session_name = data.get("name", "").lower()
                if name_lower in session_name or session_name in name_lower:
                    return path
            except (json.JSONDecodeError, KeyError):
                continue

        return None

    async def list_sessions(
        self,
        limit: int = 20,
        sort_by: str = "saved_at",
        reverse: bool = True
    ) -> List[Dict[str, Any]]:
        """
        List all saved sessions.

        Args:
            limit: Maximum number of sessions to return
            sort_by: Field to sort by (saved_at, name, message_count)
            reverse: Sort in descending order

        Returns:
            List of session info dicts (without full messages)
        """
        sessions = []

        for path in self.sessions_dir.glob("*.json"):
            try:
                data = json.loads(path.read_text())
                sessions.append({
                    "id": data["id"],
                    "name": data.get("name", data["id"]),
                    "saved_at": data.get("saved_at"),
                    "model": data.get("model"),
                    "backend": data.get("backend"),
                    "message_count": data.get("message_count", len(data.get("messages", []))),
                })
            except (json.JSONDecodeError, KeyError) as e:
                logger.warning(f"Error reading session {path}: {e}")
                continue

        # Sort
        if sort_by in ("saved_at", "name", "message_count"):
            sessions.sort(
                key=lambda x: x.get(sort_by) or "",
                reverse=reverse
            )

        return sessions[:limit]

    async def delete(self, session_id: str) -> bool:
        """
        Delete a session.

        Args:
            session_id: Session ID to delete

        Returns:
            True if deleted, False if not found
        """
        path = self.sessions_dir / f"{session_id}.json"

        if not path.exists():
            path = self._find_session_by_name(session_id)

        if path and path.exists():
            path.unlink()
            logger.info(f"Deleted session: {session_id}")
            return True

        return False

    async def get_latest(self) -> Optional[Dict[str, Any]]:
        """Get the most recently saved session."""
        sessions = await self.list_sessions(limit=1)
        if sessions:
            return await self.load(sessions[0]["id"])
        return None

    def format_session_list(self, sessions: List[Dict[str, Any]]) -> str:
        """Format session list for display."""
        if not sessions:
            return "No saved sessions."

        lines = ["Saved sessions:", ""]

        for s in sessions:
            saved_at = s.get("saved_at", "unknown")
            if isinstance(saved_at, str) and "T" in saved_at:
                # Parse ISO format and make human-readable
                try:
                    dt = datetime.fromisoformat(saved_at)
                    saved_at = dt.strftime("%Y-%m-%d %H:%M")
                except ValueError:
                    pass

            model = s.get("model", "?")
            if model and "/" in model:
                model = model.split("/")[-1]  # Just model name, not provider

            lines.append(
                f"  {s['name']:20} | {s.get('message_count', '?'):3} msgs | "
                f"{model:15} | {saved_at}"
            )

        lines.append("")
        lines.append("Use /resume <name> to load a session")

        return "\n".join(lines)
