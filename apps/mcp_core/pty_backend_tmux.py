"""
Tmux-based PTY backend for Linux containers.

This module provides a drop-in replacement for pywinpty using tmux.
It is ONLY imported on Linux systems - Windows continues using pywinpty unchanged.

Usage:
    # This import only happens on Linux via platform detection in pty_manager.py
    from pty_backend_tmux import TmuxPtyProcess, spawn
"""

import subprocess
import os
import uuid
import time
import logging
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)


class TmuxPtyProcess:
    """
    Drop-in replacement for pywinpty.PtyProcess using tmux.

    Provides terminal session management via tmux subprocess calls.
    Designed for headless Linux container environments.
    """

    def __init__(self, session_name: str, shell: str = "/bin/bash",
                 cols: int = 120, rows: int = 30, cwd: str = None,
                 env: Dict[str, str] = None):
        self.session_name = session_name
        self.shell = shell
        self.cols = cols
        self.rows = rows
        self.cwd = cwd or os.getcwd()
        self.env = env or {}
        self._pid = None
        self._create_session()

    def _create_session(self):
        """Create a new tmux session."""
        try:
            # Build environment string for tmux
            env_args = []
            for key, value in self.env.items():
                env_args.extend(["-e", f"{key}={value}"])

            cmd = [
                "tmux", "new-session", "-d",
                "-s", self.session_name,
                "-x", str(self.cols),
                "-y", str(self.rows),
                "-c", self.cwd,
            ] + env_args + [self.shell]

            result = subprocess.run(cmd, capture_output=True, text=True)
            if result.returncode != 0:
                logger.error(f"Failed to create tmux session: {result.stderr}")
                raise RuntimeError(f"tmux session creation failed: {result.stderr}")

            # Get the PID of the shell process
            pid_result = subprocess.run(
                ["tmux", "display-message", "-t", self.session_name, "-p", "#{pane_pid}"],
                capture_output=True, text=True
            )
            if pid_result.returncode == 0 and pid_result.stdout.strip():
                self._pid = int(pid_result.stdout.strip())

            logger.info(f"Created tmux session: {self.session_name} (pid={self._pid})")

        except FileNotFoundError:
            raise RuntimeError("tmux is not installed. Install with: apt-get install tmux")

    def write(self, data: str):
        """Send input to the tmux session."""
        try:
            # Use send-keys with literal flag for proper character handling
            subprocess.run(
                ["tmux", "send-keys", "-t", self.session_name, "-l", data],
                check=True, capture_output=True
            )
        except subprocess.CalledProcessError as e:
            logger.error(f"Failed to write to tmux session: {e}")

    def read(self, timeout: float = 0.1) -> str:
        """Capture output from tmux pane."""
        try:
            # Capture the entire pane content
            result = subprocess.run(
                ["tmux", "capture-pane", "-t", self.session_name, "-p", "-S", "-1000"],
                capture_output=True, text=True, timeout=timeout + 1
            )
            return result.stdout if result.returncode == 0 else ""
        except subprocess.TimeoutExpired:
            return ""
        except subprocess.CalledProcessError:
            return ""

    def resize(self, cols: int, rows: int):
        """Resize the tmux pane."""
        try:
            subprocess.run(
                ["tmux", "resize-pane", "-t", self.session_name, "-x", str(cols), "-y", str(rows)],
                check=False, capture_output=True
            )
            self.cols = cols
            self.rows = rows
        except Exception as e:
            logger.warning(f"Failed to resize tmux pane: {e}")

    def kill(self):
        """Kill the tmux session."""
        try:
            subprocess.run(
                ["tmux", "kill-session", "-t", self.session_name],
                check=False, capture_output=True
            )
            logger.info(f"Killed tmux session: {self.session_name}")
        except Exception as e:
            logger.warning(f"Failed to kill tmux session: {e}")

    @property
    def isalive(self) -> bool:
        """Check if session exists and is running."""
        try:
            result = subprocess.run(
                ["tmux", "has-session", "-t", self.session_name],
                capture_output=True
            )
            return result.returncode == 0
        except Exception:
            return False

    @property
    def pid(self) -> Optional[int]:
        """Return the PID of the shell process."""
        return self._pid

    def send_line(self, line: str):
        """Send a line of input followed by Enter."""
        self.write(line)
        subprocess.run(
            ["tmux", "send-keys", "-t", self.session_name, "Enter"],
            check=False, capture_output=True
        )

    def send_control(self, char: str):
        """Send a control character (e.g., 'c' for Ctrl+C)."""
        subprocess.run(
            ["tmux", "send-keys", "-t", self.session_name, f"C-{char}"],
            check=False, capture_output=True
        )


def spawn(shell: str = None, cwd: str = None, env: dict = None,
          cols: int = 120, rows: int = 30) -> TmuxPtyProcess:
    """
    Spawn a new tmux PTY session.

    This function signature matches pywinpty.PtyProcess.spawn() for compatibility.

    Args:
        shell: Shell executable (default: $KURORYUU_PTY_SHELL or /bin/bash)
        cwd: Working directory for the session
        env: Environment variables to set
        cols: Terminal width in columns
        rows: Terminal height in rows

    Returns:
        TmuxPtyProcess instance
    """
    session_name = f"kuro_{uuid.uuid4().hex[:8]}"
    shell = shell or os.environ.get("KURORYUU_PTY_SHELL", "/bin/bash")

    return TmuxPtyProcess(
        session_name=session_name,
        shell=shell,
        cols=cols,
        rows=rows,
        cwd=cwd,
        env=env or {}
    )


def list_sessions() -> list:
    """List all Kuroryuu tmux sessions."""
    try:
        result = subprocess.run(
            ["tmux", "list-sessions", "-F", "#{session_name}"],
            capture_output=True, text=True
        )
        if result.returncode == 0:
            return [s for s in result.stdout.strip().split('\n') if s.startswith('kuro_')]
        return []
    except Exception:
        return []


def cleanup_sessions():
    """Kill all Kuroryuu tmux sessions."""
    for session in list_sessions():
        try:
            subprocess.run(
                ["tmux", "kill-session", "-t", session],
                check=False, capture_output=True
            )
        except Exception:
            pass
