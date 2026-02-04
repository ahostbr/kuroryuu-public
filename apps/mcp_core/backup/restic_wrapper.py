"""Restic wrapper - Safe binary invocation with password handling.

Provides a clean interface for running restic commands with:
- Automatic password injection via environment variable
- Repository path handling
- JSON output parsing
- Background execution with streaming
"""

from __future__ import annotations

import json
import os
import subprocess
import threading
import time
import uuid
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional

from .config import BackupConfig, get_bin_dir
from .downloader import ensure_restic, get_binary_path
from .streaming import (
    emit_error,
    emit_heartbeat,
    emit_log_line,
    emit_progress,
    emit_summary,
)
from .snapshot_utils import parse_restic_json_progress


class ResticWrapper:
    """Safe wrapper for restic binary invocation."""

    def __init__(self, config: Optional[BackupConfig] = None) -> None:
        self.config = config or BackupConfig()
        self._binary_path: Optional[Path] = None

    def _get_binary(self) -> Path:
        """Get restic binary path, downloading if needed."""
        if self._binary_path and self._binary_path.exists():
            return self._binary_path

        result = ensure_restic()
        if not result.get("ok"):
            raise FileNotFoundError(
                f"Restic binary not found and download failed: {result.get('error')}"
            )

        self._binary_path = Path(result["path"])
        return self._binary_path

    def _get_env(self, password: Optional[str] = None) -> Dict[str, str]:
        """Get environment with RESTIC_PASSWORD set."""
        env = os.environ.copy()

        # Get password from argument, config cache, or fail
        pwd = password or self.config.get_password()
        if pwd:
            env["RESTIC_PASSWORD"] = pwd

        # Set repository path
        repo_path = self.config.get_repo_path()
        env["RESTIC_REPOSITORY"] = str(repo_path)

        return env

    def _base_args(self) -> List[str]:
        """Get base command arguments."""
        binary = self._get_binary()
        repo_path = self.config.get_repo_path()
        return [str(binary), "-r", str(repo_path)]

    def run_command(
        self,
        args: List[str],
        password: Optional[str] = None,
        timeout: int = 300,
        capture_output: bool = True,
    ) -> Dict[str, Any]:
        """Run restic command and wait for completion.

        Args:
            args: Command arguments (excluding binary and repo)
            password: Repository password (uses cached if not provided)
            timeout: Timeout in seconds
            capture_output: Whether to capture stdout/stderr

        Returns:
            {ok, output, exit_code} or {ok: False, error}
        """
        try:
            cmd = self._base_args() + args
            env = self._get_env(password)

            result = subprocess.run(
                cmd,
                env=env,
                capture_output=capture_output,
                text=True,
                timeout=timeout,
            )

            output = result.stdout
            if result.stderr:
                output = output + "\n" + result.stderr if output else result.stderr

            return {
                "ok": result.returncode == 0,
                "output": output.strip(),
                "exit_code": result.returncode,
            }

        except subprocess.TimeoutExpired:
            return {"ok": False, "error": "Command timed out", "exit_code": -1}
        except FileNotFoundError:
            return {"ok": False, "error": "Restic binary not found", "exit_code": -1}
        except Exception as e:
            return {"ok": False, "error": str(e), "exit_code": -1}

    def run_json_command(
        self,
        args: List[str],
        password: Optional[str] = None,
        timeout: int = 300,
    ) -> Dict[str, Any]:
        """Run restic command with --json flag and parse output.

        Returns:
            {ok, data} or {ok: False, error}
        """
        result = self.run_command(args + ["--json"], password, timeout)
        if not result.get("ok"):
            return result

        try:
            output = result.get("output", "")
            # Handle both single JSON and JSON lines
            if output.startswith("["):
                data = json.loads(output)
            else:
                # Try to find JSON array in output
                start = output.find("[")
                end = output.rfind("]")
                if start >= 0 and end > start:
                    data = json.loads(output[start : end + 1])
                else:
                    data = json.loads(output)

            return {"ok": True, "data": data}
        except json.JSONDecodeError as e:
            return {"ok": False, "error": f"Failed to parse JSON: {e}", "output": result.get("output")}

    def run_streaming(
        self,
        args: List[str],
        session_id: str,
        password: Optional[str] = None,
        timeout: int = 3600,
        on_line: Optional[Callable[[str], None]] = None,
    ) -> Dict[str, Any]:
        """Run restic command with real-time streaming.

        Streams output to Gateway via emit functions.

        Args:
            args: Command arguments
            session_id: Session ID for streaming
            password: Repository password
            timeout: Timeout in seconds
            on_line: Optional callback for each output line

        Returns:
            {ok, output, exit_code, summary} or {ok: False, error}
        """
        try:
            # Add --json for parseable progress output
            cmd = self._base_args() + args
            if "--json" not in args:
                cmd.append("--json")

            env = self._get_env(password)

            proc = subprocess.Popen(
                cmd,
                env=env,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )

            output_lines = []
            summary_data = None
            start_time = time.time()

            # Start heartbeat thread
            heartbeat_stop = threading.Event()
            def heartbeat_loop():
                while not heartbeat_stop.is_set():
                    emit_heartbeat(session_id)
                    time.sleep(5)

            heartbeat_thread = threading.Thread(target=heartbeat_loop, daemon=True)
            heartbeat_thread.start()

            try:
                for line in iter(proc.stdout.readline, ""):
                    # Check timeout
                    if time.time() - start_time > timeout:
                        proc.terminate()
                        emit_error(session_id, "Command timed out", "TIMEOUT")
                        return {"ok": False, "error": "Command timed out", "exit_code": -1}

                    line = line.rstrip("\n")
                    output_lines.append(line)

                    # Try to parse as JSON progress
                    parsed = parse_restic_json_progress(line)
                    if parsed:
                        if parsed["type"] == "progress":
                            emit_progress(
                                session_id,
                                parsed.get("percent", 0),
                                parsed.get("files_done", 0),
                                parsed.get("bytes_done", 0),
                                parsed.get("total_files", 0),
                                parsed.get("total_bytes", 0),
                                (parsed.get("current_files") or [None])[0],
                            )
                        elif parsed["type"] == "summary":
                            summary_data = parsed
                            emit_summary(
                                session_id,
                                parsed.get("snapshot_id", ""),
                                parsed.get("files_new", 0),
                                parsed.get("files_changed", 0),
                                parsed.get("files_unmodified", 0),
                                parsed.get("dirs_new", 0),
                                parsed.get("dirs_changed", 0),
                                parsed.get("dirs_unmodified", 0),
                                parsed.get("data_added", 0),
                                parsed.get("total_files_processed", 0),
                                parsed.get("total_bytes_processed", 0),
                                time.time() - start_time,
                            )
                        elif parsed["type"] == "error":
                            emit_error(session_id, parsed.get("message", "Unknown error"))
                    else:
                        # Emit as raw log line
                        emit_log_line(session_id, line)

                    # Call optional callback
                    if on_line:
                        on_line(line)

                proc.wait()

            finally:
                heartbeat_stop.set()

            return {
                "ok": proc.returncode == 0,
                "output": "\n".join(output_lines),
                "exit_code": proc.returncode,
                "summary": summary_data,
            }

        except FileNotFoundError:
            emit_error(session_id, "Restic binary not found", "BINARY_NOT_FOUND")
            return {"ok": False, "error": "Restic binary not found", "exit_code": -1}
        except Exception as e:
            emit_error(session_id, str(e))
            return {"ok": False, "error": str(e), "exit_code": -1}

    # =========================================================================
    # High-level operations
    # =========================================================================

    def init_repository(self, password: str) -> Dict[str, Any]:
        """Initialize a new restic repository."""
        repo_path = self.config.get_repo_path()
        repo_path.mkdir(parents=True, exist_ok=True)

        result = self.run_command(["init"], password=password, timeout=60)
        if result.get("ok"):
            self.config.set("repository.initialized", True)
            self.config.set_password(password)

        return result

    def check_repository(self) -> Dict[str, Any]:
        """Check if repository exists and is accessible."""
        repo_path = self.config.get_repo_path()

        if not repo_path.exists():
            return {"ok": False, "exists": False, "error": "Repository path does not exist"}

        # Try to list snapshots to verify access
        result = self.run_command(["snapshots", "--json"], timeout=30)

        return {
            "ok": result.get("ok", False),
            "exists": True,
            "accessible": result.get("ok", False),
            "error": result.get("error") if not result.get("ok") else None,
        }

    def list_snapshots(self, limit: int = 50) -> Dict[str, Any]:
        """List all snapshots in repository."""
        result = self.run_json_command(["snapshots"])
        if not result.get("ok"):
            return result

        snapshots = result.get("data", [])
        # Sort by time descending (newest first)
        snapshots.sort(key=lambda s: s.get("time", ""), reverse=True)

        return {
            "ok": True,
            "snapshots": snapshots[:limit],
            "total_count": len(snapshots),
        }

    def create_backup(
        self,
        source_path: str,
        message: str = "",
        tags: Optional[List[str]] = None,
        session_id: Optional[str] = None,
        exclude_patterns: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        """Create a new backup snapshot.

        Args:
            source_path: Path to back up
            message: Commit message (stored as tag)
            tags: Additional tags
            session_id: Session ID for streaming (if provided, streams progress)
            exclude_patterns: Patterns to exclude

        Returns:
            {ok, snapshot_id, ...} or {ok: False, error}
        """
        args = ["backup", source_path]

        # Add tags
        all_tags = list(tags or [])
        if message:
            # Store message as tag (restic-compatible)
            safe_msg = message.replace(" ", "_")[:48]
            all_tags.append(f"msg_{safe_msg}")

        for tag in all_tags:
            args.extend(["--tag", tag])

        # Add exclusions
        patterns = exclude_patterns or self.config.get_exclusions()
        for pattern in patterns:
            args.extend(["--exclude", pattern])

        # Run with or without streaming
        if session_id:
            return self.run_streaming(args, session_id)
        else:
            return self.run_command(args, timeout=3600)

    def restore_snapshot(
        self,
        snapshot_id: str,
        target_path: str,
        include_paths: Optional[List[str]] = None,
        session_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Restore files from a snapshot.

        Args:
            snapshot_id: Snapshot ID to restore
            target_path: Where to restore files
            include_paths: Optional list of paths to include
            session_id: Session ID for streaming

        Returns:
            {ok, ...} or {ok: False, error}
        """
        args = ["restore", snapshot_id, "--target", target_path]

        if include_paths:
            for path in include_paths:
                args.extend(["--include", path])

        if session_id:
            return self.run_streaming(args, session_id)
        else:
            return self.run_command(args, timeout=3600)

    def diff_snapshot(
        self,
        snapshot_id: str,
        compare_to: str = "latest",
    ) -> Dict[str, Any]:
        """Compare snapshot to another snapshot or current state.

        Args:
            snapshot_id: Snapshot ID to compare
            compare_to: "latest" or another snapshot ID

        Returns:
            {ok, added, removed, modified} or {ok: False, error}
        """
        if compare_to == "latest":
            # Compare to most recent snapshot
            list_result = self.list_snapshots(limit=1)
            if not list_result.get("ok") or not list_result.get("snapshots"):
                return {"ok": False, "error": "No snapshots to compare"}
            compare_to = list_result["snapshots"][0]["id"]

        result = self.run_command(["diff", snapshot_id, compare_to], timeout=300)
        if not result.get("ok"):
            return result

        # Parse diff output
        from .snapshot_utils import parse_restic_diff_output
        diff_data = parse_restic_diff_output(result.get("output", ""))

        return {
            "ok": True,
            "snapshot_id": snapshot_id,
            "compare_to": compare_to,
            **diff_data,
        }

    def forget_snapshot(
        self,
        snapshot_id: str,
        prune: bool = False,
    ) -> Dict[str, Any]:
        """Remove a snapshot from repository.

        Args:
            snapshot_id: Snapshot ID to remove
            prune: Also run prune to reclaim space

        Returns:
            {ok, ...} or {ok: False, error}
        """
        args = ["forget", snapshot_id]
        if prune:
            args.append("--prune")

        return self.run_command(args, timeout=600)

    def prune_repository(self) -> Dict[str, Any]:
        """Prune repository to reclaim unused space."""
        return self.run_command(["prune"], timeout=3600)

    def check_integrity(self) -> Dict[str, Any]:
        """Check repository integrity."""
        return self.run_command(["check"], timeout=3600)
