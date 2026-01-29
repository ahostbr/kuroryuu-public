"""PTY Manager - Windows pseudo-terminal session management.

Uses pywinpty for ConPTY support on Windows 10+.

Session lifecycle:
  spawn(shell, cwd, cols, rows) -> session_id
  write(session_id, data) -> None
  read(session_id, max_bytes, timeout_ms) -> str
  run(session_id, command, sentinel, timeout_ms) -> str (with sentinel pattern)
  resize(session_id, cols, rows) -> None
  kill(session_id) -> None

Leader-only: All operations require leader role verification.
"""

from __future__ import annotations

import datetime as dt
import logging
import os
import threading
import time
import uuid
from collections import deque
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    from .paths import get_project_root
except ImportError:
    from paths import get_project_root

# ============================================================================
# Configuration
# ============================================================================

import platform

# Platform-specific default shell
if platform.system() == "Windows":
    DEFAULT_SHELL = os.environ.get("KURORYUU_PTY_SHELL", "powershell.exe")
else:
    # Linux/Mac: use bash
    DEFAULT_SHELL = os.environ.get("KURORYUU_PTY_SHELL", "/bin/bash")
DEFAULT_COLS = int(os.environ.get("KURORYUU_PTY_COLS", "120"))
DEFAULT_ROWS = int(os.environ.get("KURORYUU_PTY_ROWS", "30"))
MAX_BUFFER_SIZE = int(os.environ.get("KURORYUU_PTY_BUFFER_SIZE", str(100 * 1024)))  # 100KB
DEFAULT_TIMEOUT_MS = int(os.environ.get("KURORYUU_PTY_TIMEOUT_MS", "30000"))
SENTINEL_PREFIX = "__KR_DONE_"
SENTINEL_SUFFIX = "__"

logger = logging.getLogger("kuroryuu.pty")

# ============================================================================
# Check for PTY backend availability (platform-specific)
# Windows: pywinpty (existing behavior, unchanged)
# Linux/Mac: tmux backend (new)
# ============================================================================

PYWINPTY_AVAILABLE = False
PtyProcess = None

if platform.system() == "Windows":
    # Windows: use pywinpty (EXISTING BEHAVIOR - UNCHANGED)
    try:
        from winpty import PtyProcess as _PtyProcess
        PtyProcess = _PtyProcess
        PYWINPTY_AVAILABLE = True
    except ImportError:
        logger.warning("pywinpty not installed. PTY features unavailable. Install with: pip install pywinpty")
else:
    # Linux/Mac: use tmux backend (NEW - only runs on non-Windows)
    try:
        from pty_backend_tmux import TmuxPtyProcess as _PtyProcess, spawn as _tmux_spawn
        PtyProcess = _PtyProcess
        PYWINPTY_AVAILABLE = True  # Reuse flag name for compatibility
        logger.info("Using tmux PTY backend for Linux/Mac")
    except ImportError:
        logger.warning("tmux backend not available. PTY features unavailable. Install tmux: apt-get install tmux")


# ============================================================================
# Data classes
# ============================================================================

@dataclass
class OutputBuffer:
    """Ring buffer for PTY output with configurable max size."""

    _chunks: deque = field(default_factory=deque)
    _total_size: int = 0
    _max_size: int = MAX_BUFFER_SIZE
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def append(self, data: str) -> None:
        """Append data to buffer, trimming oldest if over limit."""
        with self._lock:
            self._chunks.append(data)
            self._total_size += len(data)

            # Trim oldest chunks if over limit
            while self._total_size > self._max_size and self._chunks:
                removed = self._chunks.popleft()
                self._total_size -= len(removed)

    def get_all(self) -> str:
        """Get all buffered content."""
        with self._lock:
            return "".join(self._chunks)

    def clear(self) -> None:
        """Clear buffer."""
        with self._lock:
            self._chunks.clear()
            self._total_size = 0

    @property
    def size(self) -> int:
        """Current buffer size in bytes."""
        return self._total_size


@dataclass
class PTYSession:
    """Represents an active PTY session."""

    session_id: str
    shell: str
    cwd: str
    cols: int
    rows: int
    created_at: dt.datetime
    process: Any = None  # PtyProcess instance
    buffer: OutputBuffer = field(default_factory=OutputBuffer)
    last_activity: dt.datetime = field(default_factory=lambda: dt.datetime.now(dt.timezone.utc))
    _reader_thread: Optional[threading.Thread] = None
    _stop_reader: bool = False

    def is_alive(self) -> bool:
        """Check if PTY process is still running."""
        if self.process is None:
            return False
        return self.process.isalive()

    def to_dict(self) -> Dict[str, Any]:
        """Convert to serializable dict."""
        return {
            "session_id": self.session_id,
            "shell": self.shell,
            "cwd": self.cwd,
            "cols": self.cols,
            "rows": self.rows,
            "created_at": self.created_at.isoformat(timespec="seconds"),
            "last_activity": self.last_activity.isoformat(timespec="seconds"),
            "is_alive": self.is_alive(),
            "buffer_size": self.buffer.size,
        }


# ============================================================================
# PTY Manager
# ============================================================================

class PTYManager:
    """Manages PTY sessions for Leader-only CLI control."""

    def __init__(self):
        self._sessions: Dict[str, PTYSession] = {}
        self._lock = threading.Lock()

    def _check_pywinpty(self) -> Optional[Dict[str, Any]]:
        """Check if pywinpty is available."""
        if not PYWINPTY_AVAILABLE:
            return {
                "ok": False,
                "error_code": "PTY_NOT_AVAILABLE",
                "message": "pywinpty not installed. Install with: pip install pywinpty",
                "details": {},
            }
        return None

    def spawn(
        self,
        shell: str = DEFAULT_SHELL,
        cwd: Optional[str] = None,
        cols: int = DEFAULT_COLS,
        rows: int = DEFAULT_ROWS,
    ) -> Dict[str, Any]:
        """Spawn a new PTY session.

        Args:
            shell: Shell executable (default: powershell.exe)
            cwd: Working directory (default: project root)
            cols: Terminal columns (default: 120)
            rows: Terminal rows (default: 30)

        Returns:
            {ok: True, session_id: str, ...} or {ok: False, error: str}
        """
        err = self._check_pywinpty()
        if err:
            return err

        process = None  # Track for cleanup on failure
        try:
            # Default cwd
            if not cwd:
                cwd = str(get_project_root())

            cwd_path = Path(cwd).resolve()
            if not cwd_path.exists():
                return {
                    "ok": False,
                    "error_code": "PTY_SPAWN_FAILED",
                    "message": f"Working directory does not exist: {cwd}",
                    "details": {"cwd": cwd},
                }

            # Generate session ID
            session_id = f"pty_{uuid.uuid4().hex[:8]}"
            now = dt.datetime.now(dt.timezone.utc)

            # Spawn PTY process
            process = PtyProcess.spawn(
                shell,
                cwd=str(cwd_path),
                dimensions=(rows, cols),
            )

            # Create session
            session = PTYSession(
                session_id=session_id,
                shell=shell,
                cwd=str(cwd_path),
                cols=cols,
                rows=rows,
                created_at=now,
                process=process,
            )

            # Add session to dict BEFORE starting reader thread
            # This ensures the session is accessible if any code needs to look it up
            with self._lock:
                self._sessions[session_id] = session

            # Start background reader thread AFTER session is registered
            session._stop_reader = False
            session._reader_thread = threading.Thread(
                target=self._background_reader,
                args=(session,),
                daemon=True,
            )
            session._reader_thread.start()

            logger.info(f"Spawned PTY session: {session_id} (shell={shell})")

            return {
                "ok": True,
                "session_id": session_id,
                "shell": shell,
                "cwd": str(cwd_path),
                "cols": cols,
                "rows": rows,
            }

        except Exception as e:
            # Clean up orphaned process if spawn succeeded but setup failed
            if process is not None:
                try:
                    process.terminate(force=True)
                    logger.warning(f"Cleaned up orphaned PTY process after spawn failure")
                except Exception as cleanup_err:
                    logger.error(f"Failed to clean up orphaned PTY process: {cleanup_err}")

            logger.exception(f"Failed to spawn PTY: {e}")
            return {
                "ok": False,
                "error_code": "PTY_SPAWN_FAILED",
                "message": str(e),
                "details": {"shell": shell, "cwd": cwd},
            }

    def _background_reader(self, session: PTYSession) -> None:
        """Background thread to continuously read PTY output into buffer."""
        buffer_persist_counter = 0
        BUFFER_PERSIST_INTERVAL = 100  # Persist every 100 read cycles (~10KB at 100 bytes avg)

        while not session._stop_reader and session.is_alive():
            try:
                data = session.process.read(4096)
                if data:
                    session.buffer.append(data)
                    session.last_activity = dt.datetime.now(dt.timezone.utc)

                    # Periodically schedule buffer persistence
                    buffer_persist_counter += 1
                    if buffer_persist_counter >= BUFFER_PERSIST_INTERVAL:
                        buffer_persist_counter = 0
                        self._schedule_buffer_persist()

            except EOFError:
                break
            except OSError as e:
                # Handle I/O errors (e.g., broken pipe, process terminated)
                logger.debug(f"Reader OSError for {session.session_id}: {e}")
                time.sleep(0.01)
            except ValueError as e:
                # Handle invalid operations on closed process
                logger.debug(f"Reader ValueError for {session.session_id}: {e}")
                break
            except Exception as e:
                # Log unexpected errors before continuing
                logger.warning(f"Unexpected error in reader thread for {session.session_id}: {e}")
                time.sleep(0.01)

        logger.debug(f"Reader thread stopped for session: {session.session_id}")

    def write(self, session_id: str, data: str) -> Dict[str, Any]:
        """Write data to PTY input.

        Args:
            session_id: Session ID
            data: Data to write (use \\r\\n for Enter on Windows)

        Returns:
            {ok: True, bytes_written: int} or {ok: False, error: str}
        """
        session = self._get_session(session_id)
        if session is None:
            return {
                "ok": False,
                "error_code": "PTY_SESSION_NOT_FOUND",
                "message": f"Session not found: {session_id}",
                "details": {"session_id": session_id},
            }

        if not session.is_alive():
            return {
                "ok": False,
                "error_code": "PTY_PROCESS_EXITED",
                "message": f"PTY process has exited: {session_id}",
                "details": {"session_id": session_id},
            }

        try:
            session.process.write(data)
            session.last_activity = dt.datetime.now(dt.timezone.utc)

            return {
                "ok": True,
                "bytes_written": len(data),
            }

        except Exception as e:
            return {
                "ok": False,
                "error_code": "PTY_WRITE_FAILED",
                "message": str(e),
                "details": {"session_id": session_id},
            }

    def read(
        self,
        session_id: str,
        max_bytes: int = 4096,
        timeout_ms: int = 5000,
    ) -> Dict[str, Any]:
        """Read from PTY output buffer.

        Args:
            session_id: Session ID
            max_bytes: Maximum bytes to return (default: 4096)
            timeout_ms: Timeout in milliseconds (default: 5000)

        Returns:
            {ok: True, output: str, bytes_read: int} or {ok: False, error: str}
        """
        session = self._get_session(session_id)
        if session is None:
            return {
                "ok": False,
                "error_code": "PTY_SESSION_NOT_FOUND",
                "message": f"Session not found: {session_id}",
                "details": {"session_id": session_id},
            }

        try:
            # Wait for data if buffer is empty
            start = time.time()
            timeout_s = timeout_ms / 1000.0

            while session.buffer.size == 0 and (time.time() - start) < timeout_s:
                if not session.is_alive():
                    break
                time.sleep(0.01)

            output = session.buffer.get_all()
            if max_bytes and len(output) > max_bytes:
                output = output[-max_bytes:]  # Return most recent

            return {
                "ok": True,
                "output": output,
                "bytes_read": len(output),
                "session_alive": session.is_alive(),
            }

        except Exception as e:
            return {
                "ok": False,
                "error_code": "PTY_READ_FAILED",
                "message": str(e),
                "details": {"session_id": session_id},
            }

    def run(
        self,
        session_id: str,
        command: str,
        sentinel: str = "",
        timeout_ms: int = DEFAULT_TIMEOUT_MS,
    ) -> Dict[str, Any]:
        """Execute command with sentinel pattern for reliable completion detection.

        Args:
            session_id: Session ID
            command: Command to execute
            sentinel: Sentinel string (auto-generated if empty)
            timeout_ms: Timeout in milliseconds (default: 30000)

        Returns:
            {ok: True, output: str, sentinel: str} or {ok: False, error: str}
        """
        session = self._get_session(session_id)
        if session is None:
            return {
                "ok": False,
                "error_code": "PTY_SESSION_NOT_FOUND",
                "message": f"Session not found: {session_id}",
                "details": {"session_id": session_id},
            }

        if not session.is_alive():
            return {
                "ok": False,
                "error_code": "PTY_PROCESS_EXITED",
                "message": f"PTY process has exited: {session_id}",
                "details": {"session_id": session_id},
            }

        try:
            # Generate sentinel if not provided
            if not sentinel:
                sentinel = f"{SENTINEL_PREFIX}{uuid.uuid4().hex[:8]}{SENTINEL_SUFFIX}"

            # Clear buffer before command
            session.buffer.clear()

            # Build full command with sentinel
            # PowerShell: use semicolon to chain commands
            full_cmd = f"{command}; echo {sentinel}\r\n"

            # Write command
            session.process.write(full_cmd)
            session.last_activity = dt.datetime.now(dt.timezone.utc)

            # Read until sentinel or timeout
            start = time.time()
            timeout_s = timeout_ms / 1000.0

            while True:
                elapsed = time.time() - start
                if elapsed > timeout_s:
                    output = session.buffer.get_all()
                    return {
                        "ok": False,
                        "error_code": "PTY_TIMEOUT",
                        "message": f"Command timed out after {timeout_ms}ms",
                        "details": {
                            "session_id": session_id,
                            "command": command,
                            "partial_output": output,
                        },
                    }

                output = session.buffer.get_all()
                if sentinel in output:
                    # Extract output before sentinel
                    parts = output.split(sentinel)
                    clean_output = parts[0].strip()

                    # Remove command echo if present
                    lines = clean_output.split("\n")
                    if lines and command.strip() in lines[0]:
                        clean_output = "\n".join(lines[1:]).strip()

                    return {
                        "ok": True,
                        "output": clean_output,
                        "sentinel": sentinel,
                        "raw_output": output,
                    }

                if not session.is_alive():
                    return {
                        "ok": False,
                        "error_code": "PTY_PROCESS_EXITED",
                        "message": "PTY process exited during command execution",
                        "details": {
                            "session_id": session_id,
                            "partial_output": output,
                        },
                    }

                time.sleep(0.05)

        except Exception as e:
            return {
                "ok": False,
                "error_code": "PTY_RUN_FAILED",
                "message": str(e),
                "details": {"session_id": session_id, "command": command},
            }

    def resize(self, session_id: str, cols: int, rows: int) -> Dict[str, Any]:
        """Resize PTY terminal.

        Args:
            session_id: Session ID
            cols: New column count
            rows: New row count

        Returns:
            {ok: True, cols: int, rows: int} or {ok: False, error: str}
        """
        session = self._get_session(session_id)
        if session is None:
            return {
                "ok": False,
                "error_code": "PTY_SESSION_NOT_FOUND",
                "message": f"Session not found: {session_id}",
                "details": {"session_id": session_id},
            }

        if not session.is_alive():
            return {
                "ok": False,
                "error_code": "PTY_PROCESS_EXITED",
                "message": f"PTY process has exited: {session_id}",
                "details": {"session_id": session_id},
            }

        try:
            session.process.setwinsize(rows, cols)
            session.cols = cols
            session.rows = rows

            return {
                "ok": True,
                "cols": cols,
                "rows": rows,
            }

        except Exception as e:
            return {
                "ok": False,
                "error_code": "PTY_RESIZE_FAILED",
                "message": str(e),
                "details": {"session_id": session_id},
            }

    def kill(self, session_id: str) -> Dict[str, Any]:
        """Kill PTY session.

        Args:
            session_id: Session ID

        Returns:
            {ok: True} or {ok: False, error: str}
        """
        session = self._get_session(session_id)
        if session is None:
            return {
                "ok": False,
                "error_code": "PTY_SESSION_NOT_FOUND",
                "message": f"Session not found: {session_id}",
                "details": {"session_id": session_id},
            }

        try:
            # Stop reader thread first
            session._stop_reader = True

            # Wait for reader thread to stop (with timeout to avoid hanging)
            if session._reader_thread and session._reader_thread.is_alive():
                session._reader_thread.join(timeout=2.0)
                if session._reader_thread.is_alive():
                    logger.warning(f"Reader thread for {session_id} did not stop within timeout")

            # Kill process after reader thread has stopped
            if session.process and session.is_alive():
                session.process.terminate(force=True)

            # Remove from sessions only after thread is stopped
            with self._lock:
                if session_id in self._sessions:
                    del self._sessions[session_id]

            logger.info(f"Killed PTY session: {session_id}")

            return {
                "ok": True,
                "message": f"Session {session_id} terminated",
            }

        except Exception as e:
            return {
                "ok": False,
                "error_code": "PTY_KILL_FAILED",
                "message": str(e),
                "details": {"session_id": session_id},
            }

    def list_sessions(self) -> Dict[str, Any]:
        """List all active PTY sessions.

        Returns:
            {ok: True, sessions: List[dict]}
        """
        try:
            with self._lock:
                sessions = [
                    session.to_dict()
                    for session in self._sessions.values()
                ]

            return {
                "ok": True,
                "sessions": sessions,
                "count": len(sessions),
            }

        except Exception as e:
            return {
                "ok": False,
                "error_code": "PTY_LIST_FAILED",
                "message": str(e),
                "details": {},
            }

    def _get_session(self, session_id: str) -> Optional[PTYSession]:
        """Get session by ID."""
        with self._lock:
            return self._sessions.get(session_id)

    # ========================================================================
    # Persistence Methods
    # ========================================================================

    def _schedule_buffer_persist(self) -> None:
        """Schedule debounced buffer persistence."""
        try:
            from apps.mcp_core.pty_persistence import get_pty_persistence
            get_pty_persistence().schedule_buffer_save(self)
        except Exception as e:
            logger.debug(f"Buffer persistence scheduling failed (non-critical): {e}")

    def restore_session_buffer(self, session_id: str) -> Optional[str]:
        """Load buffer content from disk for a session.

        Args:
            session_id: PTY session ID

        Returns:
            Buffer content string or None if not found
        """
        try:
            from apps.mcp_core.pty_persistence import get_pty_persistence
            result = get_pty_persistence().load_session_buffer(session_id)
            if result.get("ok") and result.get("content"):
                return result["content"]
            return None
        except Exception as e:
            logger.debug(f"Failed to restore buffer for {session_id}: {e}")
            return None

    def save_all_buffers(self) -> Dict[str, Any]:
        """Immediately save all session buffers to disk.

        Returns:
            {ok: True, saved: int} or {ok: False, error: str}
        """
        try:
            from apps.mcp_core.pty_persistence import get_pty_persistence
            persistence = get_pty_persistence()

            # Copy session data while holding lock (fast)
            # Then do I/O outside lock to avoid blocking other threads
            buffers_to_save = []
            with self._lock:
                for session in self._sessions.values():
                    buffers_to_save.append((
                        session.session_id,
                        session.buffer.get_all()
                    ))

            # Perform I/O outside lock
            saved = 0
            for session_id, buffer_content in buffers_to_save:
                result = persistence.save_session_buffer(session_id, buffer_content)
                if result.get("ok"):
                    saved += 1

            return {"ok": True, "saved": saved}
        except Exception as e:
            logger.error(f"Failed to save buffers: {e}")
            return {"ok": False, "error": str(e)}


# ============================================================================
# Global manager instance
# ============================================================================

_manager: Optional[PTYManager] = None


def get_pty_manager() -> PTYManager:
    """Get global PTY manager instance."""
    global _manager
    if _manager is None:
        _manager = PTYManager()
    return _manager


# ============================================================================
# Role-based bootstrap injection
# ============================================================================

CLI_PROVIDERS = {
    "kiro": {
        "name": "Kiro CLI",
        "cmd": "kiro",
        "supports_system_prompt": True,
        "system_prompt_arg": "--append-system-prompt",
    },
    "kuroryuu": {
        "name": "Kuroryuu CLI",
        "cmd": "kuroryuu-cli",
        "supports_system_prompt": False,
        "role_arg": "--role",
    },
    "shell": {
        "name": "Shell",
        "cmd": "powershell.exe" if os.name == "nt" else "bash",
        "supports_system_prompt": False,
    },
}


def get_role_bootstrap(role: str, cwd: str) -> Tuple[str, Optional[str]]:
    """Read role-appropriate bootstrap file.

    Args:
        role: 'leader' or 'worker'
        cwd: Working directory (project root)

    Returns:
        Tuple of (bootstrap_content, error_message)
    """
    bootstrap_file = "KURORYUU_LEADER.md" if role == "leader" else "KURORYUU_WORKER.md"
    bootstrap_path = Path(cwd) / bootstrap_file

    if not bootstrap_path.exists():
        return "", f"Bootstrap file not found: {bootstrap_path}"

    try:
        content = bootstrap_path.read_text(encoding="utf-8")
        return content, None
    except Exception as e:
        return "", f"Failed to read bootstrap: {e}"


def build_cli_command(
    cli_provider: str,
    role: str,
    cwd: str,
    custom_prompt: Optional[str] = None,
) -> Tuple[str, List[str], Dict[str, str], Optional[str]]:
    """Build CLI command with role-based bootstrap.

    Args:
        cli_provider: 'claude' | 'kiro' | 'kuroryuu' | 'shell'
        role: 'leader' | 'worker'
        cwd: Working directory
        custom_prompt: Optional custom system prompt (overrides bootstrap)

    Returns:
        Tuple of (cmd, args, env, error_message)
    """
    provider = CLI_PROVIDERS.get(cli_provider)
    if not provider:
        return "", [], {}, f"Unknown CLI provider: {cli_provider}"

    cmd = provider["cmd"]
    args = []
    env = {}
    error = None

    # Get bootstrap content if provider supports system prompt
    if provider.get("supports_system_prompt"):
        if custom_prompt:
            bootstrap = custom_prompt
        else:
            bootstrap, error = get_role_bootstrap(role, cwd)
            if error:
                logger.warning(f"Bootstrap error (using fallback): {error}")
                # Continue without bootstrap rather than fail
                bootstrap = ""

        if bootstrap:
            args.extend([provider["system_prompt_arg"], bootstrap])

    # Handle role-specific args for kuroryuu
    if cli_provider == "kuroryuu" and provider.get("role_arg"):
        args.extend([provider["role_arg"], role])
        env["KURORYUU_ROLE"] = role

    # Set role in environment for all providers
    env["KURORYUU_AGENT_ROLE"] = role

    return cmd, args, env, None
