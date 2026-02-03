"""k_bash - Simple shell execution with PTY and background support.

Inspired by OpenClaw's bash tool - proven, simple, effective.
Provides a simpler interface than k_pty for spawning external processes.

Usage:
    # Foreground (wait for completion)
    k_bash(command="echo hello")

    # With PTY (for interactive CLIs like codex, claude)
    k_bash(command="codex exec 'task'", pty=True)

    # Background (returns sessionId immediately)
    k_bash(command="codex exec 'task'", pty=True, background=True)
    # -> {"ok": True, "sessionId": "abc123"}

    # Then use k_process to monitor:
    k_process(action="log", sessionId="abc123")
    k_process(action="poll", sessionId="abc123")
"""

from __future__ import annotations

import os
import subprocess
import threading
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional

from protocol import ToolRegistry

# ============================================================================
# Session storage (shared with tools_process.py)
# ============================================================================

# Global session registry for background processes
BASH_SESSIONS: Dict[str, Dict[str, Any]] = {}

# Check for pywinpty (Windows PTY support)
PYWINPTY_AVAILABLE = False
PtyProcess = None

try:
    from winpty import PtyProcess as _PtyProcess
    PtyProcess = _PtyProcess
    PYWINPTY_AVAILABLE = True
except ImportError:
    pass

# ============================================================================
# Core implementation
# ============================================================================

def _run_foreground_simple(command: str, workdir: Optional[str], timeout: int) -> Dict[str, Any]:
    """Run command without PTY, wait for completion."""
    try:
        result = subprocess.run(
            command,
            shell=True,
            cwd=workdir,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
        return {
            "ok": True,
            "output": result.stdout + result.stderr,
            "exit_code": result.returncode,
        }
    except subprocess.TimeoutExpired:
        return {"ok": False, "error": "Command timed out", "exit_code": -1}
    except Exception as e:
        return {"ok": False, "error": str(e), "exit_code": -1}


def _run_foreground_pty(command: str, workdir: Optional[str], timeout: int) -> Dict[str, Any]:
    """Run command with PTY, wait for completion."""
    if not PYWINPTY_AVAILABLE:
        return {"ok": False, "error": "pywinpty not installed. Install with: pip install pywinpty"}

    try:
        # Spawn PTY process
        cwd = workdir or os.getcwd()
        # Wrap command in shell
        shell_cmd = f'powershell.exe -Command "{command}"'

        proc = PtyProcess.spawn(shell_cmd, cwd=cwd)

        output_chunks = []
        start_time = time.time()

        # Read until process exits or timeout
        while proc.isalive():
            if time.time() - start_time > timeout:
                proc.terminate()
                return {"ok": False, "error": "Command timed out", "exit_code": -1}

            try:
                data = proc.read(4096, blocking=False)
                if data:
                    output_chunks.append(data)
            except Exception:
                pass

            time.sleep(0.1)

        # Read any remaining output
        try:
            remaining = proc.read(65536, blocking=False)
            if remaining:
                output_chunks.append(remaining)
        except Exception:
            pass

        return {
            "ok": True,
            "output": "".join(output_chunks),
            "exit_code": proc.exitstatus() if hasattr(proc, 'exitstatus') else 0,
        }
    except Exception as e:
        return {"ok": False, "error": str(e), "exit_code": -1}


def _run_background(
    command: str,
    workdir: Optional[str],
    pty_mode: bool,
    timeout: int,
) -> Dict[str, Any]:
    """Run command in background, return sessionId."""
    session_id = str(uuid.uuid4())[:8]

    session = {
        "id": session_id,
        "command": command,
        "workdir": workdir or os.getcwd(),
        "pty": pty_mode,
        "started_at": datetime.now().isoformat(),
        "output": [],
        "running": True,
        "exit_code": None,
        "process": None,
        "pty_proc": None,
    }

    BASH_SESSIONS[session_id] = session

    # Start background thread
    thread = threading.Thread(
        target=_background_runner,
        args=(session, command, workdir, pty_mode, timeout),
        daemon=True,
    )
    thread.start()

    return {"ok": True, "sessionId": session_id}


def _background_runner(
    session: Dict[str, Any],
    command: str,
    workdir: Optional[str],
    pty_mode: bool,
    timeout: int,
) -> None:
    """Background thread that runs the command."""
    try:
        if pty_mode and PYWINPTY_AVAILABLE:
            _background_pty(session, command, workdir, timeout)
        else:
            _background_simple(session, command, workdir, timeout)
    except Exception as e:
        session["output"].append(f"[ERROR] {e}")
        session["running"] = False
        session["exit_code"] = -1


def _background_simple(
    session: Dict[str, Any],
    command: str,
    workdir: Optional[str],
    timeout: int,
) -> None:
    """Background subprocess without PTY."""
    try:
        proc = subprocess.Popen(
            command,
            shell=True,
            cwd=workdir,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
        )
        session["process"] = proc

        start_time = time.time()

        # Read output line by line
        for line in iter(proc.stdout.readline, ''):
            if time.time() - start_time > timeout:
                proc.terminate()
                session["output"].append("[TIMEOUT] Process killed after timeout")
                break

            session["output"].append(line.rstrip('\n'))

        proc.wait()
        session["exit_code"] = proc.returncode

    except Exception as e:
        session["output"].append(f"[ERROR] {e}")
        session["exit_code"] = -1
    finally:
        session["running"] = False


def _background_pty(
    session: Dict[str, Any],
    command: str,
    workdir: Optional[str],
    timeout: int,
) -> None:
    """Background PTY process."""
    try:
        cwd = workdir or os.getcwd()
        # Spawn PowerShell with command
        shell_cmd = f'powershell.exe -NoExit -Command "{command}"'

        proc = PtyProcess.spawn(shell_cmd, cwd=cwd)
        session["pty_proc"] = proc

        start_time = time.time()

        # Read output until process exits
        while proc.isalive():
            if time.time() - start_time > timeout:
                proc.terminate()
                session["output"].append("[TIMEOUT] Process killed after timeout")
                break

            try:
                data = proc.read(4096, blocking=False)
                if data:
                    # Split into lines for cleaner storage
                    for line in data.split('\n'):
                        if line.strip():
                            session["output"].append(line.rstrip('\r'))
            except Exception:
                pass

            time.sleep(0.1)

        # Read any remaining output
        try:
            remaining = proc.read(65536, blocking=False)
            if remaining:
                for line in remaining.split('\n'):
                    if line.strip():
                        session["output"].append(line.rstrip('\r'))
        except Exception:
            pass

        session["exit_code"] = proc.exitstatus() if hasattr(proc, 'exitstatus') else 0

    except Exception as e:
        session["output"].append(f"[ERROR] {e}")
        session["exit_code"] = -1
    finally:
        session["running"] = False


# ============================================================================
# Main tool function
# ============================================================================

def k_bash(
    command: str,
    workdir: Optional[str] = None,
    pty: bool = False,
    background: bool = False,
    timeout: int = 300,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Execute shell command with optional PTY and background mode.

    Args:
        command: Shell command to run
        workdir: Working directory (default: current)
        pty: Allocate pseudo-terminal (REQUIRED for interactive CLIs!)
        background: Run in background, return sessionId immediately
        timeout: Timeout in seconds (default: 300 = 5 minutes)

    Returns:
        Foreground: {"ok": True, "output": "...", "exit_code": 0}
        Background: {"ok": True, "sessionId": "abc123"}
    """
    if not command:
        return {"ok": False, "error": "command is required"}

    # Resolve workdir
    if workdir:
        workdir = str(Path(workdir).resolve())
        if not Path(workdir).is_dir():
            return {"ok": False, "error": f"workdir does not exist: {workdir}"}

    # Route to appropriate implementation
    if background:
        return _run_background(command, workdir, pty, timeout)
    elif pty:
        return _run_foreground_pty(command, workdir, timeout)
    else:
        return _run_foreground_simple(command, workdir, timeout)


# ============================================================================
# Registration
# ============================================================================

def register_bash_tools(registry: ToolRegistry) -> None:
    """Register k_bash tool with the registry."""

    registry.register(
        name="k_bash",
        description=(
            "Simple shell execution with PTY and background support. "
            "Use pty=true for interactive CLIs (codex, claude, pi). "
            "Use background=true for long-running tasks, returns sessionId for monitoring via k_process."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "Shell command to run",
                },
                "workdir": {
                    "type": "string",
                    "description": "Working directory (default: current)",
                },
                "pty": {
                    "type": "boolean",
                    "default": False,
                    "description": "Allocate PTY for interactive CLIs (codex, claude, pi)",
                },
                "background": {
                    "type": "boolean",
                    "default": False,
                    "description": "Run in background, return sessionId for monitoring",
                },
                "timeout": {
                    "type": "integer",
                    "default": 300,
                    "description": "Timeout in seconds (default: 300)",
                },
            },
            "required": ["command"],
        },
        handler=k_bash,
    )
