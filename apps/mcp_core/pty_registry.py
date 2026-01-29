"""PTY Session Registry - Tracks local and Desktop PTY sessions.

Central registry allowing k_pty to route commands to either:
- Local sessions (pywinpty) - managed by pty_manager.py
- Desktop sessions (node-pty) - managed by Desktop app via HTTP bridge

Desktop sessions are registered via HTTP endpoints when spawned.

Persistence:
- Registry state saved to ai/checkpoints/pty/_registry.json
- Events logged to ai/checkpoints/pty/_registry_events.jsonl
- Automatic restore from disk on startup
"""

from __future__ import annotations

import datetime as dt
import logging
import threading
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, TYPE_CHECKING

if TYPE_CHECKING:
    from apps.mcp_core.pty_persistence import PTYPersistence

logger = logging.getLogger("kuroryuu.pty_registry")

# ============================================================================
# Data classes
# ============================================================================

@dataclass
class RegisteredSession:
    """A PTY session registered in the central registry."""

    session_id: str          # e.g., "claude_abc123" or "pty_xyz789"
    source: str              # "local" | "desktop"
    desktop_url: Optional[str]  # e.g., "http://127.0.0.1:8201" (only for desktop)
    cli_type: str            # "claude" | "kiro" | "codex" | "shell"
    pid: int
    created_at: dt.datetime = field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    last_heartbeat: dt.datetime = field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))

    # Ownership metadata for targeted routing (Plan: PTY_TargetedRouting)
    owner_agent_id: Optional[str] = None      # e.g., "worker_abc123" - primary routing key
    owner_session_id: Optional[str] = None    # k_session.session_id - secondary routing key
    owner_role: Optional[str] = None          # "leader" | "worker"
    label: Optional[str] = None               # Human-friendly label, e.g., "Worker A"

    def to_dict(self) -> Dict[str, Any]:
        """Convert to serializable dict."""
        return {
            "session_id": self.session_id,
            "source": self.source,
            "desktop_url": self.desktop_url,
            "cli_type": self.cli_type,
            "pid": self.pid,
            "created_at": self.created_at.isoformat(timespec="seconds"),
            "last_heartbeat": self.last_heartbeat.isoformat(timespec="seconds"),
            # Ownership metadata
            "owner_agent_id": self.owner_agent_id,
            "owner_session_id": self.owner_session_id,
            "owner_role": self.owner_role,
            "label": self.label,
        }


# ============================================================================
# PTY Registry
# ============================================================================

class PTYRegistry:
    """Central registry for all PTY sessions (local + desktop).

    Thread-safe registry that allows:
    - Desktop app to register/unregister sessions via HTTP
    - k_pty to look up session routing (local vs desktop)
    - List all active sessions across both sources
    """

    def __init__(self):
        self._sessions: Dict[str, RegisteredSession] = {}
        self._lock = threading.Lock()

    def register(
        self,
        session_id: str,
        source: str,
        cli_type: str,
        pid: int,
        desktop_url: Optional[str] = None,
        # Ownership metadata for targeted routing
        owner_agent_id: Optional[str] = None,
        owner_session_id: Optional[str] = None,
        owner_role: Optional[str] = None,
        label: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Register a PTY session.

        Args:
            session_id: Unique session identifier
            source: "local" or "desktop"
            cli_type: Type of CLI ("claude", "kiro", "codex", "shell")
            pid: Process ID
            desktop_url: Desktop bridge URL (required for source="desktop")
            owner_agent_id: Agent ID that owns this PTY (primary routing key)
            owner_session_id: k_session.session_id (secondary routing key)
            owner_role: "leader" or "worker"
            label: Human-friendly label

        Returns:
            {ok: True} or {ok: False, error: str}
        """
        if not session_id:
            return {"ok": False, "error": "session_id is required"}

        if source not in ("local", "desktop"):
            return {"ok": False, "error": f"Invalid source: {source}. Must be 'local' or 'desktop'"}

        if source == "desktop" and not desktop_url:
            return {"ok": False, "error": "desktop_url is required for source='desktop'"}

        # Validate owner_role if provided
        if owner_role and owner_role not in ("leader", "worker"):
            return {"ok": False, "error": f"Invalid owner_role: {owner_role}. Must be 'leader' or 'worker'"}

        with self._lock:
            if session_id in self._sessions:
                # Update existing
                existing = self._sessions[session_id]
                existing.last_heartbeat = dt.datetime.now(dt.timezone.utc)
                existing.desktop_url = desktop_url
                existing.pid = pid
                # Update ownership if provided (don't overwrite with None)
                if owner_agent_id is not None:
                    existing.owner_agent_id = owner_agent_id
                if owner_session_id is not None:
                    existing.owner_session_id = owner_session_id
                if owner_role is not None:
                    existing.owner_role = owner_role
                if label is not None:
                    existing.label = label
                logger.info(f"Updated registered session: {session_id} (source={source})")
                return {"ok": True, "updated": True}

            # Create new
            session = RegisteredSession(
                session_id=session_id,
                source=source,
                desktop_url=desktop_url,
                cli_type=cli_type or "shell",
                pid=pid,
                owner_agent_id=owner_agent_id,
                owner_session_id=owner_session_id,
                owner_role=owner_role,
                label=label,
            )
            self._sessions[session_id] = session
            logger.info(f"Registered new session: {session_id} (source={source}, cli={cli_type}, owner={owner_agent_id})")

            # Persistence: Log event and schedule save with rollback on failure
            try:
                self._persist_event("session_created", session_id, source=source, cli_type=cli_type, pid=pid, owner_agent_id=owner_agent_id)
                self._schedule_persist()
            except Exception as e:
                # Rollback: remove from memory to maintain consistency
                del self._sessions[session_id]
                logger.error(f"Persistence failed for {session_id}, rolled back: {e}")
                return {"ok": False, "error": f"Persistence failed: {e}", "rolled_back": True}

            return {"ok": True, "created": True}

    def unregister(self, session_id: str, force: bool = False) -> Dict[str, Any]:
        """Unregister a PTY session.

        Args:
            session_id: Session to unregister
            force: If True, bypass leader protection (for cleanup only)

        Returns:
            {ok: True} or {ok: False, error: str}
        """
        with self._lock:
            if session_id not in self._sessions:
                return {"ok": False, "error": f"Session not found: {session_id}"}

            session = self._sessions[session_id]

            # SECURITY: Block unregistering leader sessions (unless force=True for cleanup)
            if session.owner_role == "leader" and not force:
                logger.warning(f"BLOCKED: Attempt to unregister leader session: {session_id}")
                return {
                    "ok": False,
                    "error": "LEADER_PROTECTED",
                    "message": "Leader session cannot be unregistered programmatically",
                }

            # Store session before deletion for potential rollback
            deleted_session = self._sessions[session_id]
            del self._sessions[session_id]
            logger.info(f"Unregistered session: {session_id}")

            # Persistence: Log event and schedule save with rollback on failure
            try:
                self._persist_event("session_killed", session_id, reason="unregister")
                self._schedule_persist()
            except Exception as e:
                # Rollback: restore the session to memory to maintain consistency
                self._sessions[session_id] = deleted_session
                logger.error(f"Persistence failed for unregister {session_id}, rolled back: {e}")
                return {"ok": False, "error": f"Persistence failed: {e}", "rolled_back": True}

            return {"ok": True}

    def get(self, session_id: str) -> Optional[RegisteredSession]:
        """Get a session by ID.

        Args:
            session_id: Session ID to look up

        Returns:
            RegisteredSession or None
        """
        with self._lock:
            return self._sessions.get(session_id)

    def list_all(self) -> List[RegisteredSession]:
        """List all registered sessions.

        Returns:
            List of all sessions
        """
        with self._lock:
            return list(self._sessions.values())

    def list_by_source(self, source: str) -> List[RegisteredSession]:
        """List sessions filtered by source.

        Args:
            source: "local" or "desktop"

        Returns:
            List of sessions from the specified source
        """
        with self._lock:
            return [s for s in self._sessions.values() if s.source == source]

    def heartbeat(self, session_id: str) -> Dict[str, Any]:
        """Update last_heartbeat for a session.

        Args:
            session_id: Session ID

        Returns:
            {ok: True} or {ok: False, error: str}
        """
        with self._lock:
            if session_id not in self._sessions:
                return {"ok": False, "error": f"Session not found: {session_id}"}

            self._sessions[session_id].last_heartbeat = dt.datetime.now(dt.timezone.utc)
            return {"ok": True}

    def to_dict(self) -> Dict[str, Any]:
        """Get registry state as dict.

        Returns:
            {sessions: [...], count: int, by_source: {...}}
        """
        with self._lock:
            sessions = [s.to_dict() for s in self._sessions.values()]
            local_count = sum(1 for s in self._sessions.values() if s.source == "local")
            desktop_count = sum(1 for s in self._sessions.values() if s.source == "desktop")

            return {
                "sessions": sessions,
                "count": len(sessions),
                "by_source": {
                    "local": local_count,
                    "desktop": desktop_count,
                },
            }

    # ========================================================================
    # Targeted Routing (Plan: PTY_TargetedRouting)
    # ========================================================================

    def resolve(
        self,
        agent_id: Optional[str] = None,
        owner_session_id: Optional[str] = None,
        label: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Resolve owner identity to PTY session_id.

        Deterministic targeting: returns exactly one PTY or an error.
        Never broadcasts - ambiguity is an explicit error.

        Args:
            agent_id: Owner agent ID (primary routing key)
            owner_session_id: k_session.session_id (secondary key)
            label: Human-friendly label

        Returns:
            - If exactly 1 match: {ok: True, session_id: "...", session: {...}}
            - If 0 matches: {ok: False, error_code: "NOT_FOUND", ...}
            - If >1 matches: {ok: False, error_code: "AMBIGUOUS", matches: [...]}
        """
        if not any([agent_id, owner_session_id, label]):
            return {
                "ok": False,
                "error_code": "MISSING_PARAM",
                "error": "At least one of agent_id, owner_session_id, or label is required",
            }

        with self._lock:
            matches: List[RegisteredSession] = []

            for session in self._sessions.values():
                # Match on any provided criteria
                if agent_id and session.owner_agent_id == agent_id:
                    matches.append(session)
                elif owner_session_id and session.owner_session_id == owner_session_id:
                    matches.append(session)
                elif label and session.label == label:
                    matches.append(session)

            if len(matches) == 0:
                return {
                    "ok": False,
                    "error_code": "NOT_FOUND",
                    "error": f"No PTY found for: agent_id={agent_id}, owner_session_id={owner_session_id}, label={label}",
                    "query": {"agent_id": agent_id, "owner_session_id": owner_session_id, "label": label},
                }

            if len(matches) > 1:
                return {
                    "ok": False,
                    "error_code": "AMBIGUOUS",
                    "error": f"Multiple PTYs match query ({len(matches)} found). Use more specific criteria.",
                    "matches": [m.to_dict() for m in matches],
                    "query": {"agent_id": agent_id, "owner_session_id": owner_session_id, "label": label},
                }

            # Exactly one match
            matched = matches[0]
            logger.info(f"Resolved PTY: {matched.session_id} for agent_id={agent_id}")
            return {
                "ok": True,
                "session_id": matched.session_id,
                "session": matched.to_dict(),
            }

    # ========================================================================
    # Persistence Methods
    # ========================================================================

    def _persist_event(self, event_type: str, session_id: str, **extra) -> None:
        """Log event to persistence layer (non-blocking)."""
        try:
            try:
                from apps.mcp_core.pty_persistence import get_pty_persistence
            except ImportError:
                from pty_persistence import get_pty_persistence
            get_pty_persistence().log_event(event_type, session_id, **extra)
        except Exception as e:
            logger.debug(f"Persistence event logging failed (non-critical): {e}")

    def _schedule_persist(self) -> None:
        """Schedule debounced persistence save."""
        try:
            try:
                from apps.mcp_core.pty_persistence import get_pty_persistence
                from apps.mcp_core.pty_manager import get_pty_manager
            except ImportError:
                from pty_persistence import get_pty_persistence
                from pty_manager import get_pty_manager
            get_pty_persistence().schedule_save(self, get_pty_manager())
        except Exception as e:
            logger.debug(f"Persistence scheduling failed (non-critical): {e}")

    def restore_from_disk(self) -> Dict[str, Any]:
        """Restore registry state from disk on startup.

        Only restores desktop sessions (they may still be running).
        Local sessions are not restored since pywinpty processes are gone.

        Returns:
            {ok: True, restored: int, skipped: int} or {ok: False, error: str}
        """
        import json

        try:
            try:
                from apps.mcp_core.pty_persistence import get_pty_persistence
            except ImportError:
                from pty_persistence import get_pty_persistence
            persistence = get_pty_persistence()
            result = persistence.load_registry()

            if not result["ok"]:
                return result

            restored = 0
            skipped = 0

            for session_data in result.get("sessions", []):
                source = session_data.get("source", "local")

                # Only restore desktop sessions - local pywinpty processes are gone after restart
                if source != "desktop":
                    skipped += 1
                    continue

                # Register the session (without triggering persistence again)
                with self._lock:
                    session = RegisteredSession(
                        session_id=session_data["session_id"],
                        source=source,
                        desktop_url=session_data.get("desktop_url"),
                        cli_type=session_data.get("cli_type", "shell"),
                        pid=session_data.get("pid", 0),
                        owner_agent_id=session_data.get("owner_agent_id"),
                        owner_session_id=session_data.get("owner_session_id"),
                        owner_role=session_data.get("owner_role"),
                        label=session_data.get("label"),
                    )
                    self._sessions[session_data["session_id"]] = session
                    restored += 1

            logger.info(f"Restored {restored} PTY sessions from disk (skipped {skipped} local sessions)")
            return {"ok": True, "restored": restored, "skipped": skipped}

        except FileNotFoundError:
            logger.info("No registry file found on disk - starting fresh")
            return {"ok": True, "restored": 0, "skipped": 0, "note": "no_file"}
        except json.JSONDecodeError as e:
            logger.error(f"Corrupted registry file: {e}")
            return {"ok": False, "error": f"JSON decode error: {e}", "restored": 0, "skipped": 0}
        except KeyError as e:
            logger.error(f"Missing required key in registry data: {e}")
            return {"ok": False, "error": f"Missing key: {e}", "restored": 0, "skipped": 0}
        except Exception as e:
            logger.error(f"Unexpected error restoring registry from disk: {e}")
            raise  # Re-raise unexpected exceptions for visibility

    def save_now(self) -> Dict[str, Any]:
        """Immediate save of registry state (for shutdown)."""
        try:
            try:
                from apps.mcp_core.pty_persistence import get_pty_persistence
                from apps.mcp_core.pty_manager import get_pty_manager
            except ImportError:
                from pty_persistence import get_pty_persistence
                from pty_manager import get_pty_manager
            return get_pty_persistence().save_now(self, get_pty_manager())
        except Exception as e:
            logger.error(f"Failed to save registry: {e}")
            return {"ok": False, "error": str(e)}

    def reset_all(self, clear_persistence: bool = True) -> int:
        """Clear all registered sessions from registry.

        Args:
            clear_persistence: Also clear persisted data on disk

        Returns:
            Number of sessions cleared
        """
        with self._lock:
            count = len(self._sessions)
            self._sessions.clear()
            logger.info(f"PTY registry reset: cleared {count} sessions")

        if clear_persistence:
            try:
                from .pty_persistence import get_pty_persistence
            except ImportError:
                from pty_persistence import get_pty_persistence
            persistence = get_pty_persistence()
            persistence.reset_all()

        return count


# ============================================================================
# Global registry instance
# ============================================================================

_registry: Optional[PTYRegistry] = None


def get_pty_registry() -> PTYRegistry:
    """Get global PTY registry instance."""
    global _registry
    if _registry is None:
        _registry = PTYRegistry()
    return _registry
