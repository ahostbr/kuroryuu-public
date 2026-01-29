"""k_capture tools - Visual recording and screenshot management.

Wraps capture_ffmpeg.py for:
- Screen recording with VisualDigest
- Screenshots
- Live visual polling for orchestration

VisualDigest outputs:
  ai/capture/output/VisualDigest/latest/
    - latest.jpg (live updating)
    - storyboard.jpg (frame grid)
    - manifest.json (metadata)
"""

from __future__ import annotations

import base64
import ctypes
import json
import os
import platform
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional

# ============================================================================
# Platform guard - Windows-only tool
# Windows: enabled by default (existing behavior, unchanged)
# Linux: disabled by default (no Win32 display APIs available)
# ============================================================================

if platform.system() == "Windows":
    CAPTURE_ENABLED = os.environ.get("KURORYUU_CAPTURE_ENABLED", "1") == "1"
else:
    # Linux/Mac: disabled by default, can force enable with env var (won't work though)
    CAPTURE_ENABLED = os.environ.get("KURORYUU_CAPTURE_ENABLED", "0") == "1"

# ============================================================================
# Monitor Enumeration (Win32)
# ============================================================================

@dataclass
class MonitorInfo:
    """Monitor information from Win32 API."""
    index: int
    device: str
    left: int
    top: int
    right: int
    bottom: int

    @property
    def width(self) -> int:
        return self.right - self.left

    @property
    def height(self) -> int:
        return self.bottom - self.top


def _set_dpi_awareness() -> None:
    """Set process to DPI-aware to get physical pixel coordinates."""
    try:
        # SetProcessDpiAwarenessContext for per-monitor DPI awareness V2
        # -4 = DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2
        ctypes.windll.user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
    except Exception:
        try:
            # Fallback to SetProcessDpiAwareness (Windows 8.1+)
            # 2 = PROCESS_PER_MONITOR_DPI_AWARE
            ctypes.windll.shcore.SetProcessDpiAwareness(2)
        except Exception:
            pass  # Best effort - may already be set or not available


def get_monitors() -> List[MonitorInfo]:
    """Get list of available monitors using Win32 EnumDisplayMonitors.

    Returns PHYSICAL pixel coordinates (not DPI-scaled logical coordinates).
    """
    monitors: List[MonitorInfo] = []

    try:
        # Set DPI awareness FIRST to get physical coordinates
        _set_dpi_awareness()

        # Win32 API types
        user32 = ctypes.windll.user32

        # MONITORENUMPROC callback
        MONITORENUMPROC = ctypes.WINFUNCTYPE(
            ctypes.c_int,
            ctypes.c_void_p,  # hMonitor
            ctypes.c_void_p,  # hdcMonitor
            ctypes.POINTER(ctypes.c_long * 4),  # lprcMonitor (RECT)
            ctypes.c_void_p,  # dwData
        )

        def callback(hMonitor, hdcMonitor, lprcMonitor, dwData):
            rect = lprcMonitor.contents
            monitors.append(MonitorInfo(
                index=len(monitors),
                device=f"Monitor {len(monitors)}",
                left=rect[0],
                top=rect[1],
                right=rect[2],
                bottom=rect[3],
            ))
            return 1  # Continue enumeration

        # Enumerate monitors
        user32.EnumDisplayMonitors(None, None, MONITORENUMPROC(callback), 0)

    except Exception as e:
        # Fallback: return single desktop monitor
        try:
            _set_dpi_awareness()
            user32 = ctypes.windll.user32
            width = user32.GetSystemMetrics(0)  # SM_CXSCREEN
            height = user32.GetSystemMetrics(1)  # SM_CYSCREEN
            monitors.append(MonitorInfo(
                index=0,
                device="Primary Display",
                left=0,
                top=0,
                right=width,
                bottom=height,
            ))
        except Exception:
            pass

    return monitors


# ============================================================================
# Configuration
# ============================================================================

def _get_project_root() -> Path:
    """Get project root from env var or derive from script location."""
    env_root = os.environ.get('KURORYUU_PROJECT_ROOT')
    if env_root:
        return Path(env_root)
    # Script is at: apps/mcp_core/ -> go up 2 levels to Kuroryuu
    return Path(__file__).resolve().parent.parent.parent

# Path to capture_ffmpeg.py (local Kuroryuu copy)
K_CAPTURE_SCRIPT = Path(os.environ.get(
    "K_CAPTURE_SCRIPT",
    str(_get_project_root() / "ai" / "capture" / "capture_ffmpeg.py")
)).resolve()

# Visual digest output directory
VISUAL_DIGEST_DIR = Path(os.environ.get(
    "K_CAPTURE_DIGEST_DIR",
    str(_get_project_root() / "ai" / "capture" / "output" / "VisualDigest" / "latest")
)).resolve()

# Path to ffmpeg executable - uses system PATH by default
# Set FFMPEG_PATH env var to override
FFMPEG_EXE = Path(os.environ.get("FFMPEG_PATH", "ffmpeg"))

# Persistent state file for active recording (survives across HTTP requests)
ACTIVE_RECORDING_FILE = Path(__file__).parent / "active_recording.json"

# Active recording process (module-level state - may not persist across requests)
_active_process: Optional[subprocess.Popen] = None


def _save_recording_state(pid: int, mode: str, digest_dir: str) -> None:
    """Persist recording state to disk for cross-request access."""
    from datetime import datetime
    ACTIVE_RECORDING_FILE.write_text(json.dumps({
        "pid": pid,
        "mode": mode,
        "digest_dir": digest_dir,
        "started_at": datetime.now().isoformat()
    }))


def _load_recording_state() -> Optional[Dict[str, Any]]:
    """Load recording state from disk. Returns None if no active recording."""
    if not ACTIVE_RECORDING_FILE.exists():
        return None
    try:
        data = json.loads(ACTIVE_RECORDING_FILE.read_text())
        # Verify process is still running using psutil
        try:
            import psutil
            if psutil.pid_exists(data["pid"]):
                proc = psutil.Process(data["pid"])
                if proc.is_running():
                    return data
        except Exception:
            pass
        # Process not running, clean up stale file
        ACTIVE_RECORDING_FILE.unlink(missing_ok=True)
    except Exception:
        pass
    return None


def _clear_recording_state() -> None:
    """Clear recording state file."""
    ACTIVE_RECORDING_FILE.unlink(missing_ok=True)


def _k_capture_ok(data: Any = None, meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Success response."""
    return {"ok": True, "data": data, "error": None, "meta": meta or {}}


def _k_capture_err(error: str, data: Any = None, meta: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """Error response."""
    return {"ok": False, "data": data, "error": error, "meta": meta or {}}


# ============================================================================
# Action implementations
# ============================================================================

def _action_help(**kwargs: Any) -> Dict[str, Any]:
    """List available actions."""
    actions = {
        "help": "List available actions and their parameters",
        "list_monitors": "List available monitors with their coordinates",
        "start": "Start screen recording with optional VisualDigest. Params: fps, duration, digest, mode, monitor_index, out",
        "stop": "Stop the current recording",
        "screenshot": "Take a single screenshot. Params: out (output path), monitor_index (int, optional)",
        "get_latest": "Get the latest.jpg from VisualDigest. Params: as_base64 (bool)",
        "get_storyboard": "Get the storyboard.jpg from VisualDigest. Params: as_base64 (bool)",
        "get_status": "Get the manifest.json status from VisualDigest",
        "poll": "Poll for visual updates - returns latest.jpg path and manifest",
    }
    return _k_capture_ok({
        "actions": actions,
        "script_path": str(K_CAPTURE_SCRIPT),
        "digest_dir": str(VISUAL_DIGEST_DIR),
        "important_ask_user": {
            "monitor_count": "Ask: How many monitors do you have?",
            "monitor_layout": "Ask: What is your monitor arrangement? (left/right, top/bottom)?",
        },
        "coordinate_system": {
            "note": "Screenshots are in PHYSICAL pixels. Click coordinates match screenshot coordinates directly.",
            "workflow": "1. k_capture(action='screenshot', monitor_index=0)  2. Read screenshot, find element position  3. k_pccontrol(action='click', x=X, y=Y)",
            "no_conversion_needed": "DPI scaling is handled automatically - coordinates from screenshot work directly",
        },
        "multi_monitor_tips": {
            "use_list_monitors": "Run list_monitors to see monitor positions and indices",
            "negative_coords": "Monitors LEFT of primary have negative X coordinates",
            "monitor_index": "Use monitor_index=N to capture specific monitor (0=primary, 1=secondary, etc.)",
            "fixed_filenames": "Screenshots save to mon0.png, mon1.png, or desktop.png (overwritten each time)",
        },
    })


def _action_list_monitors(**kwargs: Any) -> Dict[str, Any]:
    """List available monitors."""
    monitors = get_monitors()
    return _k_capture_ok({
        "monitors": [
            {
                "index": m.index,
                "device": m.device,
                "left": m.left,
                "top": m.top,
                "right": m.right,
                "bottom": m.bottom,
                "width": m.width,
                "height": m.height,
            }
            for m in monitors
        ],
        "count": len(monitors),
    })


def _action_start(
    fps: float = 1.0,
    duration: float = 0.0,
    digest: bool = True,
    mode: str = "desktop",
    out: str = "",
    digest_fps: float = 0.1,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Start screen recording with VisualDigest."""
    global _active_process

    if not K_CAPTURE_SCRIPT.exists():
        return _k_capture_err(f"Capture script not found: {K_CAPTURE_SCRIPT}")

    # Check for existing recording (via persisted state, more reliable than module variable)
    existing = _load_recording_state()
    if existing:
        return _k_capture_err(f"Recording already in progress (PID {existing['pid']}). Use 'stop' first.")

    if _active_process is not None and _active_process.poll() is None:
        return _k_capture_err("Recording already in progress. Use 'stop' first.")

    # Build command
    cmd = [
        "python", str(K_CAPTURE_SCRIPT),
        "--auto",  # Skip interactive menu
        "--ffmpeg-path", str(FFMPEG_EXE),
        "--mode", mode,
        "--fps", str(fps),
        "--digest", "1" if digest else "0",
        "--digest-fps", str(digest_fps),
    ]

    if duration > 0:
        cmd.extend(["--duration", str(duration)])

    if out:
        cmd.extend(["--out", out])

    try:
        # Start process in background
        _active_process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=str(K_CAPTURE_SCRIPT.parent),
        )

        # Give it a moment to start
        time.sleep(0.5)

        if _active_process.poll() is not None:
            # Process exited immediately - error
            stdout, stderr = _active_process.communicate()
            return _k_capture_err(
                f"Recording failed to start",
                data={
                    "returncode": _active_process.returncode,
                    "stdout": stdout.decode("utf-8", errors="replace")[-1000:],
                    "stderr": stderr.decode("utf-8", errors="replace")[-1000:],
                }
            )

        # Save state to disk for cross-request access
        _save_recording_state(_active_process.pid, mode, str(VISUAL_DIGEST_DIR))

        return _k_capture_ok({
            "status": "recording",
            "pid": _active_process.pid,
            "fps": fps,
            "digest": digest,
            "digest_fps": digest_fps,
            "mode": mode,
            "digest_dir": str(VISUAL_DIGEST_DIR),
        })
    except Exception as e:
        return _k_capture_err(f"Failed to start recording: {e}")


def _action_stop(**kwargs: Any) -> Dict[str, Any]:
    """Stop the current recording."""
    global _active_process

    # Try module-level variable first (same-request stop)
    if _active_process is not None:
        if _active_process.poll() is not None:
            # Already finished
            _active_process = None
            _clear_recording_state()
            return _k_capture_ok({"status": "already_stopped"})

        try:
            # Send graceful termination
            _active_process.terminate()

            # Wait up to 5 seconds for graceful shutdown
            try:
                _active_process.wait(timeout=5)
            except subprocess.TimeoutExpired:
                _active_process.kill()
                _active_process.wait()

            pid = _active_process.pid
            _active_process = None
            _clear_recording_state()

            return _k_capture_ok({
                "status": "stopped",
                "pid": pid,
            })
        except Exception as e:
            return _k_capture_err(f"Failed to stop recording: {e}")

    # Fall back to persisted state (cross-request stop)
    state = _load_recording_state()
    if state is None:
        return _k_capture_err("No active recording to stop")

    try:
        import psutil
        pid = state["pid"]
        proc = psutil.Process(pid)
        proc.terminate()

        # Wait up to 5 seconds for graceful shutdown
        try:
            proc.wait(timeout=5)
        except psutil.TimeoutExpired:
            proc.kill()
            proc.wait()

        _clear_recording_state()
        return _k_capture_ok({
            "status": "stopped",
            "pid": pid,
        })
    except psutil.NoSuchProcess:
        _clear_recording_state()
        return _k_capture_ok({"status": "already_stopped", "pid": state["pid"]})
    except Exception as e:
        return _k_capture_err(f"Failed to stop recording: {e}")


def _action_screenshot(out: str = "", monitor_index: Optional[int] = None, **kwargs: Any) -> Dict[str, Any]:
    """Take a single screenshot.

    Args:
        out: Output file path (default: auto-generated in screenshots folder)
        monitor_index: Specific monitor to capture (0-indexed). If None, captures entire desktop.
    """
    if not K_CAPTURE_SCRIPT.exists():
        return _k_capture_err(f"Capture script not found: {K_CAPTURE_SCRIPT}")

    # Use ffmpeg directly for single screenshot
    # Fixed filenames per monitor (overwrite each time) for easier workflow
    if not out:
        out_dir = _get_project_root() / "ai" / "capture" / "output" / "screenshots"
        out_dir.mkdir(parents=True, exist_ok=True)
        if monitor_index is not None:
            out = str(out_dir / f"mon{monitor_index}.png")
        else:
            out = str(out_dir / "desktop.png")

    # Build ffmpeg command
    cmd = [
        str(FFMPEG_EXE), "-y",
        "-f", "gdigrab",
        "-framerate", "1",
    ]

    # Handle monitor selection
    monitor_info = None
    if monitor_index is not None:
        monitors = get_monitors()
        if monitor_index < 0 or monitor_index >= len(monitors):
            return _k_capture_err(
                f"Invalid monitor_index: {monitor_index}. Available: 0-{len(monitors)-1}",
                data={"monitors": [{"index": m.index, "width": m.width, "height": m.height} for m in monitors]}
            )
        monitor_info = monitors[monitor_index]
        # Add offset and size for specific monitor
        cmd.extend([
            "-offset_x", str(monitor_info.left),
            "-offset_y", str(monitor_info.top),
            "-video_size", f"{monitor_info.width}x{monitor_info.height}",
        ])

    # Input source
    cmd.extend(["-i", "desktop"])
    cmd.extend(["-frames:v", "1", out])

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            timeout=10,
        )

        if result.returncode != 0:
            return _k_capture_err(
                "Screenshot failed",
                data={
                    "returncode": result.returncode,
                    "stderr": result.stderr.decode("utf-8", errors="replace")[-500:],
                    "cmd": " ".join(cmd),
                }
            )

        out_path = Path(out)
        result_data: Dict[str, Any] = {
            "path": str(out_path),
            "size_bytes": out_path.stat().st_size if out_path.exists() else 0,
        }
        if monitor_info:
            result_data["monitor"] = {
                "index": monitor_info.index,
                "width": monitor_info.width,
                "height": monitor_info.height,
            }
        return _k_capture_ok(result_data)
    except subprocess.TimeoutExpired:
        return _k_capture_err("Screenshot timed out")
    except Exception as e:
        return _k_capture_err(f"Screenshot failed: {e}")


def _read_image_as_base64(path: Path) -> Optional[str]:
    """Read image file as base64 string."""
    if not path.exists():
        return None
    try:
        with open(path, "rb") as f:
            return base64.b64encode(f.read()).decode("ascii")
    except Exception:
        return None


def _action_get_latest(as_base64: bool = False, **kwargs: Any) -> Dict[str, Any]:
    """Get latest.jpg from VisualDigest."""
    latest_path = VISUAL_DIGEST_DIR / "latest.jpg"

    if not latest_path.exists():
        return _k_capture_err("latest.jpg not found - recording may not be active")

    result: Dict[str, Any] = {
        "path": str(latest_path),
        "size_bytes": latest_path.stat().st_size,
        "modified": latest_path.stat().st_mtime,
    }

    if as_base64:
        b64 = _read_image_as_base64(latest_path)
        if b64:
            result["base64"] = b64
            result["mime_type"] = "image/jpeg"

    return _k_capture_ok(result)


def _action_get_storyboard(as_base64: bool = False, **kwargs: Any) -> Dict[str, Any]:
    """Get storyboard.jpg from VisualDigest."""
    storyboard_path = VISUAL_DIGEST_DIR / "storyboard.jpg"

    if not storyboard_path.exists():
        return _k_capture_err("storyboard.jpg not found - recording may not be active or storyboard disabled")

    result: Dict[str, Any] = {
        "path": str(storyboard_path),
        "size_bytes": storyboard_path.stat().st_size,
        "modified": storyboard_path.stat().st_mtime,
    }

    if as_base64:
        b64 = _read_image_as_base64(storyboard_path)
        if b64:
            result["base64"] = b64
            result["mime_type"] = "image/jpeg"

    return _k_capture_ok(result)


def _action_get_status(**kwargs: Any) -> Dict[str, Any]:
    """Get manifest.json status from VisualDigest."""
    manifest_path = VISUAL_DIGEST_DIR / "manifest.json"

    if not manifest_path.exists():
        return _k_capture_err("manifest.json not found - recording may not be active")

    try:
        with open(manifest_path, "r", encoding="utf-8") as f:
            manifest = json.load(f)

        return _k_capture_ok({
            "manifest": manifest,
            "path": str(manifest_path),
            "modified": manifest_path.stat().st_mtime,
        })
    except json.JSONDecodeError as e:
        return _k_capture_err(f"Failed to parse manifest.json: {e}")
    except Exception as e:
        return _k_capture_err(f"Failed to read manifest: {e}")


def _action_poll(**kwargs: Any) -> Dict[str, Any]:
    """Poll for visual updates - leader can use this for worker monitoring."""
    global _active_process

    latest_path = VISUAL_DIGEST_DIR / "latest.jpg"
    manifest_path = VISUAL_DIGEST_DIR / "manifest.json"
    storyboard_path = VISUAL_DIGEST_DIR / "storyboard.jpg"

    # Check recording state from multiple sources for reliability
    recording_active = False

    # 1. Check module-level process (same-request)
    if _active_process is not None and _active_process.poll() is None:
        recording_active = True

    # 2. Check persisted state (cross-request reliability)
    if not recording_active:
        state = _load_recording_state()
        if state is not None:
            recording_active = True

    result: Dict[str, Any] = {
        "recording_active": recording_active,
    }

    if latest_path.exists():
        result["latest"] = {
            "path": str(latest_path),
            "size_bytes": latest_path.stat().st_size,
            "modified": latest_path.stat().st_mtime,
        }

    if storyboard_path.exists():
        result["storyboard"] = {
            "path": str(storyboard_path),
            "size_bytes": storyboard_path.stat().st_size,
            "modified": storyboard_path.stat().st_mtime,
        }

    if manifest_path.exists():
        try:
            with open(manifest_path, "r", encoding="utf-8") as f:
                result["manifest"] = json.load(f)
        except Exception:
            pass

    return _k_capture_ok(result)


# ============================================================================
# Main routed tool
# ============================================================================

ACTION_HANDLERS = {
    "help": _action_help,
    "list_monitors": _action_list_monitors,
    "start": _action_start,
    "stop": _action_stop,
    "screenshot": _action_screenshot,
    "get_latest": _action_get_latest,
    "get_storyboard": _action_get_storyboard,
    "get_status": _action_get_status,
    "poll": _action_poll,
}


def k_capture(
    action: str,
    fps: float = 1.0,
    duration: float = 0.0,
    digest: bool = True,
    mode: str = "desktop",
    out: str = "",
    digest_fps: float = 0.1,
    as_base64: bool = False,
    monitor_index: Optional[int] = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    """k_capture - Screen recording and visual digest management.

    Routed tool supporting multiple actions:
    - help: List available actions
    - list_monitors: List available monitors with coordinates
    - start: Start recording with VisualDigest
    - stop: Stop current recording
    - screenshot: Take single screenshot (supports monitor_index for specific monitor)
    - get_latest: Get latest.jpg from VisualDigest
    - get_storyboard: Get storyboard.jpg
    - get_status: Get manifest.json status
    - poll: Poll for visual updates (for leader monitoring)

    Args:
        action: The action to perform (required)
        fps: Recording FPS (for start)
        duration: Recording duration in seconds, 0=unlimited (for start)
        digest: Enable VisualDigest (for start)
        mode: Capture mode: desktop, monitor, window (for start)
        out: Output path (for start, screenshot)
        digest_fps: VisualDigest capture rate, e.g. 0.1 = 1 frame/10s (for start)
        as_base64: Return image content as base64 (for get_latest, get_storyboard)
        monitor_index: Specific monitor to capture, 0-indexed (for screenshot). Use list_monitors to see available.

    Returns:
        {ok: bool, data: Any, error: str|None, meta: dict}
    """
    # Platform guard: Windows-only tool
    if not CAPTURE_ENABLED:
        return _k_capture_err(
            "k_capture requires Windows (Win32 display APIs). "
            "This tool is disabled on Linux/Mac containers.",
            data={"platform": platform.system(), "enabled": False}
        )

    act = (action or "").strip().lower()

    if not act:
        return _k_capture_err("action is required. Use 'help' to list available actions.")

    handler = ACTION_HANDLERS.get(act)
    if not handler:
        return _k_capture_err(
            f"Unknown action: {act}",
            data={"available_actions": list(ACTION_HANDLERS.keys())}
        )

    return handler(
        fps=fps,
        duration=duration,
        digest=digest,
        mode=mode,
        out=out,
        digest_fps=digest_fps,
        as_base64=as_base64,
        monitor_index=monitor_index,
        **kwargs,
    )


# ============================================================================
# Tool registration
# ============================================================================

def register_capture_tools(registry: "ToolRegistry") -> None:
    """Register k_capture tools with the registry."""

    registry.register(
        name="k_capture",
        description="Screen capture and visual digest management. Actions: help, list_monitors, start, stop, screenshot, get_latest, get_storyboard, get_status, poll",
        input_schema={
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "description": "Action to perform: help, list_monitors, start, stop, screenshot, get_latest, get_storyboard, get_status, poll",
                    "enum": ["help", "list_monitors", "start", "stop", "screenshot", "get_latest", "get_storyboard", "get_status", "poll"],
                },
                "fps": {
                    "type": "number",
                    "description": "Recording FPS (for start)",
                    "default": 1.0,
                },
                "duration": {
                    "type": "number",
                    "description": "Recording duration in seconds, 0=unlimited (for start)",
                    "default": 0.0,
                },
                "digest": {
                    "type": "boolean",
                    "description": "Enable VisualDigest live updates (for start)",
                    "default": True,
                },
                "mode": {
                    "type": "string",
                    "description": "Capture mode (for start)",
                    "enum": ["desktop", "monitor", "window"],
                    "default": "desktop",
                },
                "out": {
                    "type": "string",
                    "description": "Output path (for start, screenshot)",
                },
                "digest_fps": {
                    "type": "number",
                    "description": "VisualDigest capture rate, e.g. 0.1 = 1 frame per 10 seconds (for start)",
                    "default": 0.1,
                },
                "as_base64": {
                    "type": "boolean",
                    "description": "Return image as base64 string (for get_latest, get_storyboard)",
                    "default": False,
                },
                "monitor_index": {
                    "type": "integer",
                    "description": "Specific monitor to capture, 0-indexed (for screenshot). Use list_monitors action to see available monitors.",
                },
            },
            "required": ["action"],
        },
        handler=k_capture,
    )
