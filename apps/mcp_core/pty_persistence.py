"""PTY Persistence - Durable storage for PTY registry and session state.

Provides:
- Registry snapshot save/load
- Session metadata save/load
- Output buffer snapshots
- Event logging for audit trail
- Debounced and immediate save operations
- TTL-based stale session cleanup

Storage location: KURORYUU_PROJECT_ROOT/ai/checkpoints/pty/
"""

from __future__ import annotations

import datetime as dt
import json
import logging
import os
import threading
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from .pty_registry import PTYRegistry
    from .pty_manager import PTYManager

try:
    from .paths import get_project_root
except ImportError:
    from paths import get_project_root

logger = logging.getLogger("kuroryuu.pty_persistence")

# ============================================================================
# Configuration
# ============================================================================

DEBOUNCE_METADATA_MS = 1000   # Save metadata every 1s
DEBOUNCE_BUFFER_MS = 5000     # Save buffers every 5s
MAX_BUFFER_PERSIST_SIZE = 100 * 1024  # 100KB max per session
DEFAULT_TTL_DAYS = 7          # Stale session cleanup threshold


def _get_project_root() -> Path:
    """Get Kuroryuu project root directory."""
    return get_project_root()


def _get_pty_persistence_root() -> Path:
    """Get PTY persistence root directory."""
    return _get_project_root() / "ai" / "checkpoints" / "pty"


def _iso_now() -> str:
    """Get current time as ISO string."""
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


# ============================================================================
# PTY Persistence Class
# ============================================================================

class PTYPersistence:
    """Handles persistent storage for PTY sessions.

    Thread-safe persistence layer that saves:
    - Registry state snapshots
    - Session metadata
    - Output buffer content
    - Append-only event log for audit trail

    Uses debounced saves for performance with immediate save on shutdown.
    """

    def __init__(self):
        self._root = _get_pty_persistence_root()
        self._lock = threading.Lock()
        self._save_timer: Optional[threading.Timer] = None
        self._buffer_save_timer: Optional[threading.Timer] = None
        self._initialized = False

    def initialize(self) -> Dict[str, Any]:
        """Initialize persistence layer, creating directories if needed.

        Returns:
            {ok: True, root: str} or {ok: False, error: str}
        """
        try:
            self._root.mkdir(parents=True, exist_ok=True)
            (self._root / "sessions").mkdir(exist_ok=True)
            (self._root / "renderer").mkdir(exist_ok=True)
            (self._root / "renderer" / "buffers").mkdir(exist_ok=True)
            self._initialized = True
            logger.info(f"PTY persistence initialized at: {self._root}")
            return {"ok": True, "root": str(self._root)}
        except Exception as e:
            logger.error(f"Failed to initialize PTY persistence: {e}")
            return {"ok": False, "error": str(e)}

    # ========================================================================
    # Registry Persistence
    # ========================================================================

    def save_registry(self, registry: "PTYRegistry") -> Dict[str, Any]:
        """Save registry state to disk.

        Args:
            registry: PTYRegistry instance to save

        Returns:
            {ok: True, count: int, path: str} or {ok: False, error: str}
        """
        try:
            with self._lock:
                sessions = registry.list_all()
                snapshot = {
                    "schema": "pty_registry_v1",
                    "saved_at": _iso_now(),
                    "sessions": [s.to_dict() for s in sessions],
                    "count": len(sessions),
                }

                path = self._root / "_registry.json"
                self._write_json_atomic(path, snapshot)

            logger.debug(f"Saved PTY registry: {len(sessions)} sessions")
            return {"ok": True, "count": len(sessions), "path": str(path)}

        except Exception as e:
            logger.error(f"Failed to save PTY registry: {e}")
            return {"ok": False, "error": str(e)}

    def load_registry(self) -> Dict[str, Any]:
        """Load registry state from disk.

        Returns:
            {ok: True, sessions: List[dict], count: int} or {ok: False, error: str}
        """
        try:
            path = self._root / "_registry.json"
            if not path.exists():
                logger.debug("No registry snapshot found, starting fresh")
                return {"ok": True, "sessions": [], "count": 0}

            with path.open("r", encoding="utf-8") as f:
                data = json.load(f)

            # Validate schema
            if data.get("schema") != "pty_registry_v1":
                logger.warning(f"Unknown registry schema: {data.get('schema')}, starting fresh")
                return {"ok": True, "sessions": [], "count": 0}

            sessions = data.get("sessions", [])
            logger.info(f"Loaded PTY registry: {len(sessions)} sessions from {data.get('saved_at')}")

            return {
                "ok": True,
                "sessions": sessions,
                "count": len(sessions),
                "saved_at": data.get("saved_at"),
            }

        except json.JSONDecodeError as e:
            logger.error(f"Corrupted registry file: {e}")
            return {"ok": False, "error": f"JSON decode error: {e}", "sessions": [], "count": 0}
        except Exception as e:
            logger.error(f"Failed to load PTY registry: {e}")
            return {"ok": False, "error": str(e), "sessions": [], "count": 0}

    # ========================================================================
    # Session Persistence
    # ========================================================================

    def save_session_metadata(
        self,
        session_id: str,
        metadata: Dict[str, Any],
    ) -> Dict[str, Any]:
        """Save session metadata to disk.

        Args:
            session_id: PTY session ID
            metadata: Session metadata dict

        Returns:
            {ok: True, path: str} or {ok: False, error: str}
        """
        try:
            session_dir = self._root / "sessions" / session_id
            session_dir.mkdir(parents=True, exist_ok=True)

            data = {
                "schema": "pty_session_v1",
                "session_id": session_id,
                "saved_at": _iso_now(),
                **metadata,
            }

            path = session_dir / "metadata.json"
            self._write_json_atomic(path, data)

            logger.debug(f"Saved session metadata: {session_id}")
            return {"ok": True, "path": str(path)}

        except Exception as e:
            logger.error(f"Failed to save session metadata for {session_id}: {e}")
            return {"ok": False, "error": str(e)}

    def load_session_metadata(self, session_id: str) -> Dict[str, Any]:
        """Load session metadata from disk.

        Args:
            session_id: PTY session ID

        Returns:
            {ok: True, metadata: dict} or {ok: False, error: str}
        """
        try:
            path = self._root / "sessions" / session_id / "metadata.json"
            if not path.exists():
                return {"ok": True, "metadata": None}

            with path.open("r", encoding="utf-8") as f:
                data = json.load(f)

            return {"ok": True, "metadata": data}

        except Exception as e:
            logger.error(f"Failed to load session metadata for {session_id}: {e}")
            return {"ok": False, "error": str(e)}

    def save_session_buffer(
        self,
        session_id: str,
        buffer_content: str,
    ) -> Dict[str, Any]:
        """Save session output buffer to disk.

        Args:
            session_id: PTY session ID
            buffer_content: Output buffer content

        Returns:
            {ok: True, bytes_written: int} or {ok: False, error: str}
        """
        try:
            session_dir = self._root / "sessions" / session_id
            session_dir.mkdir(parents=True, exist_ok=True)

            # Truncate if too large (keep most recent)
            content = buffer_content
            if len(content) > MAX_BUFFER_PERSIST_SIZE:
                content = content[-MAX_BUFFER_PERSIST_SIZE:]

            buffer_path = session_dir / "buffer.txt"
            with buffer_path.open("w", encoding="utf-8", newline="\n") as f:
                f.write(content)

            logger.debug(f"Saved session buffer: {session_id} ({len(content)} bytes)")
            return {"ok": True, "bytes_written": len(content), "path": str(buffer_path)}

        except Exception as e:
            logger.error(f"Failed to save session buffer for {session_id}: {e}")
            return {"ok": False, "error": str(e)}

    def load_session_buffer(self, session_id: str) -> Dict[str, Any]:
        """Load session output buffer from disk.

        Args:
            session_id: PTY session ID

        Returns:
            {ok: True, content: str, bytes_read: int} or {ok: False, error: str}
        """
        try:
            buffer_path = self._root / "sessions" / session_id / "buffer.txt"
            if not buffer_path.exists():
                return {"ok": True, "content": "", "bytes_read": 0}

            with buffer_path.open("r", encoding="utf-8") as f:
                content = f.read()

            return {"ok": True, "content": content, "bytes_read": len(content)}

        except Exception as e:
            logger.error(f"Failed to load session buffer for {session_id}: {e}")
            return {"ok": False, "error": str(e), "content": ""}

    # ========================================================================
    # Event Logging (Append-Only Audit Trail)
    # ========================================================================

    def log_event(
        self,
        event_type: str,
        session_id: str,
        **extra: Any,
    ) -> None:
        """Log an event to the append-only event log.

        Args:
            event_type: Type of event (session_created, session_killed, etc.)
            session_id: PTY session ID
            **extra: Additional event data
        """
        try:
            event = {
                "ts": _iso_now(),
                "event": event_type,
                "session_id": session_id,
                **extra,
            }

            log_path = self._root / "_registry_events.jsonl"
            with log_path.open("a", encoding="utf-8", newline="\n") as f:
                f.write(json.dumps(event, ensure_ascii=False) + "\n")

        except Exception as e:
            # Non-critical - don't fail on logging errors
            logger.warning(f"Failed to log PTY event: {e}")

    def log_session_event(
        self,
        session_id: str,
        event_type: str,
        **extra: Any,
    ) -> None:
        """Log an event to session-specific event log.

        Args:
            session_id: PTY session ID
            event_type: Type of event
            **extra: Additional event data
        """
        try:
            session_dir = self._root / "sessions" / session_id
            session_dir.mkdir(parents=True, exist_ok=True)

            event = {
                "ts": _iso_now(),
                "event": event_type,
                **extra,
            }

            log_path = session_dir / "events.jsonl"
            with log_path.open("a", encoding="utf-8", newline="\n") as f:
                f.write(json.dumps(event, ensure_ascii=False) + "\n")

        except Exception as e:
            # Non-critical but log for debugging audit trail issues
            logger.warning(f"Failed to log session event for {session_id}: {e}")

    # ========================================================================
    # Debounced Save Operations
    # ========================================================================

    def schedule_save(
        self,
        registry: "PTYRegistry",
        manager: Optional["PTYManager"] = None,
    ) -> None:
        """Schedule a debounced save of registry and session metadata.

        Args:
            registry: PTYRegistry instance
            manager: Optional PTYManager for session metadata
        """
        if self._save_timer:
            self._save_timer.cancel()

        def do_save():
            self.save_registry(registry)
            if manager:
                # Acquire manager lock to safely iterate sessions
                with manager._lock:
                    sessions_snapshot = list(manager._sessions.values())
                # Save metadata outside lock to avoid holding it during I/O
                for session in sessions_snapshot:
                    self.save_session_metadata(
                        session.session_id,
                        session.to_dict(),
                    )

        self._save_timer = threading.Timer(DEBOUNCE_METADATA_MS / 1000.0, do_save)
        self._save_timer.daemon = True
        self._save_timer.start()

    def schedule_buffer_save(self, manager: "PTYManager") -> None:
        """Schedule a debounced save of all session buffers.

        Args:
            manager: PTYManager instance
        """
        if self._buffer_save_timer:
            self._buffer_save_timer.cancel()

        def do_save():
            # Acquire manager lock to safely iterate sessions and capture buffer refs
            with manager._lock:
                sessions_data = [
                    (session.session_id, session.buffer.get_all())
                    for session in manager._sessions.values()
                ]
            # Save buffers outside lock to avoid holding it during I/O
            for session_id, buffer_content in sessions_data:
                self.save_session_buffer(session_id, buffer_content)

        self._buffer_save_timer = threading.Timer(DEBOUNCE_BUFFER_MS / 1000.0, do_save)
        self._buffer_save_timer.daemon = True
        self._buffer_save_timer.start()

    def save_now(
        self,
        registry: "PTYRegistry",
        manager: Optional["PTYManager"] = None,
    ) -> Dict[str, Any]:
        """Immediate save of all state (for app shutdown).

        Args:
            registry: PTYRegistry instance
            manager: Optional PTYManager for session data

        Returns:
            {ok: True, registry_count: int, sessions_saved: int}
        """
        # Cancel any pending timers
        if self._save_timer:
            self._save_timer.cancel()
            self._save_timer = None
        if self._buffer_save_timer:
            self._buffer_save_timer.cancel()
            self._buffer_save_timer = None

        # Save registry
        reg_result = self.save_registry(registry)

        sessions_saved = 0
        if manager:
            # Acquire manager lock to safely snapshot session data
            with manager._lock:
                sessions_data = [
                    (session.session_id, session.to_dict(), session.buffer.get_all())
                    for session in manager._sessions.values()
                ]
            # Save outside lock to avoid holding it during I/O
            for session_id, metadata, buffer_content in sessions_data:
                self.save_session_metadata(session_id, metadata)
                self.save_session_buffer(session_id, buffer_content)
                sessions_saved += 1

        logger.info(f"PTY persistence save_now complete: registry={reg_result.get('count', 0)}, sessions={sessions_saved}")

        return {
            "ok": True,
            "registry_count": reg_result.get("count", 0),
            "sessions_saved": sessions_saved,
        }

    # ========================================================================
    # Cleanup Operations
    # ========================================================================

    def cleanup_stale_sessions(self, max_age_days: int = DEFAULT_TTL_DAYS) -> Dict[str, Any]:
        """Remove session data older than max_age_days.

        Args:
            max_age_days: Maximum age in days (default: 7)

        Returns:
            {ok: True, cleaned: int, errors: int}
        """
        try:
            sessions_dir = self._root / "sessions"
            if not sessions_dir.exists():
                return {"ok": True, "cleaned": 0, "errors": 0}

            cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=max_age_days)
            cleaned = 0
            errors = 0

            for session_dir in sessions_dir.iterdir():
                if not session_dir.is_dir():
                    continue

                metadata_path = session_dir / "metadata.json"
                should_clean = False

                if metadata_path.exists():
                    try:
                        with metadata_path.open("r", encoding="utf-8") as f:
                            meta = json.load(f)

                        # Check last_activity or saved_at
                        last_time_str = meta.get("last_activity") or meta.get("saved_at")
                        if last_time_str:
                            last_time = dt.datetime.fromisoformat(last_time_str.replace("Z", "+00:00"))
                            if last_time < cutoff:
                                should_clean = True
                    except Exception:
                        # If we can't read metadata, check file modification time
                        mtime = dt.datetime.fromtimestamp(
                            metadata_path.stat().st_mtime,
                            tz=dt.timezone.utc
                        )
                        if mtime < cutoff:
                            should_clean = True
                else:
                    # No metadata file - check directory modification time
                    try:
                        mtime = dt.datetime.fromtimestamp(
                            session_dir.stat().st_mtime,
                            tz=dt.timezone.utc
                        )
                        if mtime < cutoff:
                            should_clean = True
                    except Exception:
                        pass

                if should_clean:
                    try:
                        import shutil
                        shutil.rmtree(session_dir)
                        cleaned += 1
                        logger.debug(f"Cleaned stale PTY session: {session_dir.name}")
                    except Exception as e:
                        logger.warning(f"Failed to clean session {session_dir.name}: {e}")
                        errors += 1

            logger.info(f"PTY stale session cleanup: cleaned={cleaned}, errors={errors}")
            return {"ok": True, "cleaned": cleaned, "errors": errors}

        except Exception as e:
            logger.error(f"Failed to cleanup stale sessions: {e}")
            return {"ok": False, "error": str(e), "cleaned": 0, "errors": 0}

    def delete_session(self, session_id: str) -> Dict[str, Any]:
        """Delete all persisted data for a session.

        Args:
            session_id: PTY session ID

        Returns:
            {ok: True} or {ok: False, error: str}
        """
        try:
            session_dir = self._root / "sessions" / session_id
            if session_dir.exists():
                import shutil
                shutil.rmtree(session_dir)
                logger.debug(f"Deleted PTY session data: {session_id}")

            return {"ok": True}

        except Exception as e:
            logger.error(f"Failed to delete session {session_id}: {e}")
            return {"ok": False, "error": str(e)}

    def reset_all(self) -> Dict[str, Any]:
        """Clear all persisted PTY data (sessions + registry).

        Used by Desktop reset flow to ensure clean slate.

        Returns:
            {ok: True, cleared: int} or {ok: False, error: str}
        """
        try:
            import shutil
            cleared = 0

            # Clear all session directories
            sessions_dir = self._root / "sessions"
            if sessions_dir.exists():
                for session_dir in sessions_dir.iterdir():
                    if session_dir.is_dir():
                        shutil.rmtree(session_dir)
                        cleared += 1

            # Clear registry snapshot
            registry_path = self._root / "_registry.json"
            if registry_path.exists():
                registry_path.unlink()

            # Clear registry events log
            events_path = self._root / "_registry_events.jsonl"
            if events_path.exists():
                events_path.unlink()

            logger.info(f"PTY persistence reset: cleared {cleared} sessions + registry files")
            return {"ok": True, "cleared": cleared}

        except Exception as e:
            logger.error(f"Failed to reset PTY persistence: {e}")
            return {"ok": False, "error": str(e)}

    # ========================================================================
    # Helper Methods
    # ========================================================================

    def _write_json_atomic(self, path: Path, obj: Dict[str, Any]) -> None:
        """Atomic JSON write with temp file to prevent corruption.

        Args:
            path: Target file path
            obj: Object to serialize
        """
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.parent / f".{path.name}.tmp_{uuid.uuid4().hex[:8]}"

        try:
            data = json.dumps(obj, ensure_ascii=False, indent=2) + "\n"
            with tmp.open("w", encoding="utf-8", newline="\n") as f:
                f.write(data)
                f.flush()
                os.fsync(f.fileno())

            # Atomic rename (on same filesystem)
            os.replace(str(tmp), str(path))

        except Exception:
            # Clean up temp file on error
            if tmp.exists():
                tmp.unlink()
            raise

    def get_status(self) -> Dict[str, Any]:
        """Get persistence status and statistics.

        Returns:
            Status dict with counts and paths
        """
        try:
            sessions_dir = self._root / "sessions"
            session_count = sum(1 for p in sessions_dir.iterdir() if p.is_dir()) if sessions_dir.exists() else 0

            registry_path = self._root / "_registry.json"
            registry_exists = registry_path.exists()
            registry_size = registry_path.stat().st_size if registry_exists else 0

            events_path = self._root / "_registry_events.jsonl"
            events_exists = events_path.exists()
            events_size = events_path.stat().st_size if events_exists else 0

            return {
                "ok": True,
                "initialized": self._initialized,
                "root": str(self._root),
                "session_count": session_count,
                "registry_exists": registry_exists,
                "registry_size_bytes": registry_size,
                "events_exists": events_exists,
                "events_size_bytes": events_size,
            }

        except Exception as e:
            return {"ok": False, "error": str(e)}


# ============================================================================
# Global instance
# ============================================================================

_persistence: Optional[PTYPersistence] = None


def get_pty_persistence() -> PTYPersistence:
    """Get global PTY persistence instance.

    Returns:
        PTYPersistence singleton instance
    """
    global _persistence
    if _persistence is None:
        _persistence = PTYPersistence()
        _persistence.initialize()
    return _persistence
