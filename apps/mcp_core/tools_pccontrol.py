"""k_pccontrol - Full Desktop Access via Pure PowerShell/Win32 APIs.

DANGER: This tool provides FULL control of the Windows desktop.
When enabled, Claude can:
- Click anywhere on screen (single, double, right-click)
- Type into any application
- Send keypress commands (Enter, Tab, Escape, etc.)
- Launch any application
- List open windows

This is a HIGH-RISK feature that must be explicitly enabled by the user
via the Kuroryuu Desktop settings (Settings -> Integrations -> Full Desktop Access).

SECURITY: Actions are gated by an "armed" flag file that Desktop writes when user
enables Full Desktop Access. Without this file, all actions except help/status are blocked.

No external dependencies required - uses pure PowerShell with Win32 APIs.

IMPORTANT: For accurate click coordinates, set Windows display scaling to 100%.
If your display scaling is set to 125%, 150%, or higher, the coordinates will be
offset and clicks will miss their targets. Go to Windows Settings -> Display ->
Scale and layout -> Set to 100%.
"""

from __future__ import annotations

import datetime
import json
import logging
import os
import platform
import subprocess
from pathlib import Path
from typing import Any, Dict, Optional

logger = logging.getLogger("kuroryuu.k_pccontrol")

# ============================================================================
# Platform guard - Windows-only tool
# Windows: enabled by default (existing behavior, unchanged)
# Linux: disabled by default (no PowerShell + Win32 APIs available)
# ============================================================================

if platform.system() == "Windows":
    PCCONTROL_ENABLED = os.environ.get("KURORYUU_PCCONTROL_ENABLED", "1") == "1"
else:
    # Linux/Mac: disabled by default, can force enable with env var (won't work though)
    PCCONTROL_ENABLED = os.environ.get("KURORYUU_PCCONTROL_ENABLED", "0") == "1"

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

# Audit log path
AUDIT_LOG_PATH = _get_project_root() / "ai" / "logs" / "pc-automation.log"

# Armed flag file - written by Kuroryuu Desktop when user enables Full Desktop Access
ARMED_FLAG_PATH = _get_project_root() / "ai" / "config" / "pccontrol-armed.flag"


# ============================================================================
# Security Gate
# ============================================================================

def _is_armed() -> bool:
    """Check if Full Desktop Access is armed (flag file exists).

    The Kuroryuu Desktop app writes this file when the user enables
    Full Desktop Access. Without this file, all actions are blocked.
    """
    return ARMED_FLAG_PATH.exists()


def _require_armed() -> Optional[Dict[str, Any]]:
    """Return error response if not armed, None if armed.

    Call this at the start of any action that requires armed state.
    """
    if not _is_armed():
        return {
            "ok": False,
            "error": "Full Desktop Access is not enabled. Open Kuroryuu Desktop -> Settings -> Integrations -> Full Desktop Access to enable.",
            "error_code": "NOT_ARMED",
            "armed": False,
            "how_to_enable": [
                "1. Open Kuroryuu Desktop",
                "2. Go to Settings -> Integrations",
                "3. Click 'Full Desktop Access'",
                "4. Complete the 2-step wizard to enable",
            ],
        }
    return None


# ============================================================================
# Helper functions
# ============================================================================

def _audit_log(action: str, args: Dict, result: str) -> None:
    """Append to audit log."""
    try:
        AUDIT_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        ts = datetime.datetime.now().isoformat()
        # Sanitize sensitive data from logs
        safe_args = dict(args)
        if "text" in safe_args and len(safe_args.get("text", "")) > 50:
            safe_args["text"] = safe_args["text"][:50] + "...[truncated]"
        with open(AUDIT_LOG_PATH, "a", encoding="utf-8") as f:
            f.write(f"[{ts}] [{action}] {json.dumps(safe_args)} -> {result}\n")
    except Exception as e:
        logger.warning(f"Failed to write audit log: {e}")


def _ok(data: Any = None, **kwargs) -> Dict[str, Any]:
    """Success response."""
    result = {"ok": True}
    if data is not None:
        result["data"] = data
    result.update(kwargs)
    return result


def _err(error: str, error_code: str = "ERROR", **kwargs) -> Dict[str, Any]:
    """Error response."""
    result = {
        "ok": False,
        "error": error,
        "error_code": error_code,
    }
    result.update(kwargs)
    return result


def _run_powershell(script: str, timeout: int = 10) -> subprocess.CompletedProcess:
    """Run a PowerShell script and return result."""
    return subprocess.run(
        ["powershell", "-ExecutionPolicy", "Bypass", "-Command", script],
        capture_output=True,
        text=True,
        timeout=timeout
    )


# ============================================================================
# Action implementations
# ============================================================================

def _action_help(**kwargs) -> Dict[str, Any]:
    """List available actions."""
    return _ok({
        "tool": "k_pccontrol",
        "description": "Full Desktop Access - control Windows PC via PowerShell/Win32 APIs",
        "actions": {
            "help": "List available actions and their parameters",
            "status": "Check if Full Desktop Access is ready",
            "click": "Click at coordinates (x, y) - left click by default",
            "doubleclick": "Double-click at coordinates (x, y)",
            "rightclick": "Right-click at coordinates (x, y)",
            "type": "Type text at current focus",
            "keypress": "Send special key (Enter, Tab, Escape, etc.)",
            "launch_app": "Launch an application by path",
            "get_windows": "Get list of open windows with titles",
        },
        "examples": {
            "click": 'k_pccontrol(action="click", x=500, y=300)',
            "doubleclick": 'k_pccontrol(action="doubleclick", x=500, y=300)',
            "rightclick": 'k_pccontrol(action="rightclick", x=500, y=300)',
            "type": 'k_pccontrol(action="type", text="Hello World")',
            "keypress": 'k_pccontrol(action="keypress", key="Enter")',
            "launch_app": 'k_pccontrol(action="launch_app", path="notepad.exe")',
        },
        "warning": "DANGER: This tool has FULL control of your PC when enabled!",
        "note": "No WinAppDriver required - uses pure PowerShell with Win32 APIs",
        "dpi_warning": "IMPORTANT: For accurate click coordinates, set Windows display scaling to 100%. If your display is set to 125%, 150%, or higher, coordinates will be offset. Go to Windows Settings -> Display -> Scale and layout -> Set to 100%.",
    })


def _action_status(**kwargs) -> Dict[str, Any]:
    """Check Full Desktop Access readiness and armed state."""
    armed = _is_armed()

    # Test that PowerShell can run and import System.Windows.Forms
    test_script = '''
Add-Type -AssemblyName System.Windows.Forms
Write-Output "ready"
'''
    try:
        result = _run_powershell(test_script, timeout=5)
        powershell_ready = result.returncode == 0 and "ready" in result.stdout

        return _ok(
            armed=armed,
            powershell_ready=powershell_ready,
            method="powershell",
            note="Pure PowerShell/Win32 - no external dependencies" if armed else "Enable in Kuroryuu Desktop to use",
            status="ARMED - Ready for desktop control" if armed else "DISARMED - Enable in Desktop settings",
        )
    except Exception as e:
        return _err(
            str(e),
            error_code="STATUS_FAILED",
            armed=armed,
            powershell_ready=False
        )


def _action_click(
    x: Optional[int] = None,
    y: Optional[int] = None,
    **kwargs
) -> Dict[str, Any]:
    """Left-click at coordinates.

    Args:
        x: X coordinate for click
        y: Y coordinate for click
    """
    # Security gate - require armed state
    if err := _require_armed():
        return err

    if x is None or y is None:
        return _err("x and y coordinates are required", error_code="MISSING_PARAM")

    ps_script = f'''
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MouseOps {{
    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")]
    public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
    public const int MOUSEEVENTF_LEFTDOWN = 0x02;
    public const int MOUSEEVENTF_LEFTUP = 0x04;
}}
"@
[MouseOps]::SetCursorPos({x}, {y})
Start-Sleep -Milliseconds 50
[MouseOps]::mouse_event([MouseOps]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
[MouseOps]::mouse_event([MouseOps]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
'''
    try:
        result = _run_powershell(ps_script)
        if result.returncode != 0:
            _audit_log("click", {"x": x, "y": y}, f"error: {result.stderr}")
            return _err(f"Click failed: {result.stderr}", error_code="CLICK_FAILED")

        _audit_log("click", {"x": x, "y": y}, "success")
        return _ok(clicked="left", x=x, y=y)
    except Exception as e:
        _audit_log("click", {"x": x, "y": y}, f"error: {e}")
        return _err(str(e), error_code="CLICK_FAILED")


def _action_doubleclick(
    x: Optional[int] = None,
    y: Optional[int] = None,
    **kwargs
) -> Dict[str, Any]:
    """Double-click at coordinates.

    Args:
        x: X coordinate for click
        y: Y coordinate for click
    """
    # Security gate - require armed state
    if err := _require_armed():
        return err

    if x is None or y is None:
        return _err("x and y coordinates are required", error_code="MISSING_PARAM")

    ps_script = f'''
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MouseOps {{
    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")]
    public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
    public const int MOUSEEVENTF_LEFTDOWN = 0x02;
    public const int MOUSEEVENTF_LEFTUP = 0x04;
}}
"@
[MouseOps]::SetCursorPos({x}, {y})
Start-Sleep -Milliseconds 50
# First click
[MouseOps]::mouse_event([MouseOps]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
[MouseOps]::mouse_event([MouseOps]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
Start-Sleep -Milliseconds 50
# Second click
[MouseOps]::mouse_event([MouseOps]::MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
[MouseOps]::mouse_event([MouseOps]::MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
'''
    try:
        result = _run_powershell(ps_script)
        if result.returncode != 0:
            _audit_log("doubleclick", {"x": x, "y": y}, f"error: {result.stderr}")
            return _err(f"Double-click failed: {result.stderr}", error_code="DOUBLECLICK_FAILED")

        _audit_log("doubleclick", {"x": x, "y": y}, "success")
        return _ok(clicked="double", x=x, y=y)
    except Exception as e:
        _audit_log("doubleclick", {"x": x, "y": y}, f"error: {e}")
        return _err(str(e), error_code="DOUBLECLICK_FAILED")


def _action_rightclick(
    x: Optional[int] = None,
    y: Optional[int] = None,
    **kwargs
) -> Dict[str, Any]:
    """Right-click at coordinates.

    Args:
        x: X coordinate for click
        y: Y coordinate for click
    """
    # Security gate - require armed state
    if err := _require_armed():
        return err

    if x is None or y is None:
        return _err("x and y coordinates are required", error_code="MISSING_PARAM")

    ps_script = f'''
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MouseOps {{
    [DllImport("user32.dll")]
    public static extern bool SetCursorPos(int X, int Y);
    [DllImport("user32.dll")]
    public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, int dwExtraInfo);
    public const int MOUSEEVENTF_RIGHTDOWN = 0x08;
    public const int MOUSEEVENTF_RIGHTUP = 0x10;
}}
"@
[MouseOps]::SetCursorPos({x}, {y})
Start-Sleep -Milliseconds 50
[MouseOps]::mouse_event([MouseOps]::MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0)
[MouseOps]::mouse_event([MouseOps]::MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0)
'''
    try:
        result = _run_powershell(ps_script)
        if result.returncode != 0:
            _audit_log("rightclick", {"x": x, "y": y}, f"error: {result.stderr}")
            return _err(f"Right-click failed: {result.stderr}", error_code="RIGHTCLICK_FAILED")

        _audit_log("rightclick", {"x": x, "y": y}, "success")
        return _ok(clicked="right", x=x, y=y)
    except Exception as e:
        _audit_log("rightclick", {"x": x, "y": y}, f"error: {e}")
        return _err(str(e), error_code="RIGHTCLICK_FAILED")


def _action_type(text: str = "", **kwargs) -> Dict[str, Any]:
    """Type text at current focus using SendKeys.

    Args:
        text: The text to type
    """
    # Security gate - require armed state
    if err := _require_armed():
        return err

    if not text:
        return _err("text parameter is required", error_code="MISSING_PARAM")

    # Escape special SendKeys characters
    # See: https://docs.microsoft.com/en-us/dotnet/api/system.windows.forms.sendkeys
    escaped = text
    # These characters have special meaning in SendKeys and need braces
    for char in ['+', '^', '%', '~', '(', ')', '{', '}', '[', ']']:
        escaped = escaped.replace(char, '{' + char + '}')

    # Escape quotes for PowerShell
    escaped = escaped.replace('"', '`"')

    ps_script = f'''
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait("{escaped}")
'''
    try:
        result = _run_powershell(ps_script)
        if result.returncode != 0:
            _audit_log("type", {"length": len(text)}, f"error: {result.stderr}")
            return _err(f"Type failed: {result.stderr}", error_code="TYPE_FAILED")

        log_text = text[:50] + "..." if len(text) > 50 else text
        _audit_log("type", {"text": log_text, "length": len(text)}, "success")
        return _ok(typed=True, length=len(text))
    except Exception as e:
        _audit_log("type", {"length": len(text)}, f"error: {e}")
        return _err(str(e), error_code="TYPE_FAILED")


def _action_keypress(key: str = "", **kwargs) -> Dict[str, Any]:
    """Send a special key using SendKeys.

    Args:
        key: Key name (Enter, Tab, Escape, Backspace, Delete, Up, Down, Left, Right, F1-F12, etc.)
    """
    # Security gate - require armed state
    if err := _require_armed():
        return err

    if not key:
        return _err("key parameter is required", error_code="MISSING_PARAM")

    # Map common key names to SendKeys format
    key_map = {
        "enter": "{ENTER}",
        "return": "{ENTER}",
        "tab": "{TAB}",
        "escape": "{ESC}",
        "esc": "{ESC}",
        "backspace": "{BACKSPACE}",
        "bs": "{BACKSPACE}",
        "delete": "{DELETE}",
        "del": "{DELETE}",
        "insert": "{INSERT}",
        "ins": "{INSERT}",
        "home": "{HOME}",
        "end": "{END}",
        "pageup": "{PGUP}",
        "pgup": "{PGUP}",
        "pagedown": "{PGDN}",
        "pgdn": "{PGDN}",
        "up": "{UP}",
        "down": "{DOWN}",
        "left": "{LEFT}",
        "right": "{RIGHT}",
        "space": " ",
        "f1": "{F1}", "f2": "{F2}", "f3": "{F3}", "f4": "{F4}",
        "f5": "{F5}", "f6": "{F6}", "f7": "{F7}", "f8": "{F8}",
        "f9": "{F9}", "f10": "{F10}", "f11": "{F11}", "f12": "{F12}",
        # Modifier combinations
        "ctrl+a": "^a", "ctrl+c": "^c", "ctrl+v": "^v", "ctrl+x": "^x",
        "ctrl+z": "^z", "ctrl+y": "^y", "ctrl+s": "^s",
        "alt+f4": "%{F4}",
        "alt+tab": "%{TAB}",
    }

    key_lower = key.lower().strip()
    sendkey = key_map.get(key_lower)

    if not sendkey:
        # Check if it's a single character
        if len(key) == 1:
            sendkey = key
        else:
            return _err(
                f"Unknown key: {key}",
                error_code="UNKNOWN_KEY",
                available_keys=list(key_map.keys())
            )

    ps_script = f'''
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait("{sendkey}")
'''
    try:
        result = _run_powershell(ps_script)
        if result.returncode != 0:
            _audit_log("keypress", {"key": key}, f"error: {result.stderr}")
            return _err(f"Keypress failed: {result.stderr}", error_code="KEYPRESS_FAILED")

        _audit_log("keypress", {"key": key}, "success")
        return _ok(pressed=key, sendkey=sendkey)
    except Exception as e:
        _audit_log("keypress", {"key": key}, f"error: {e}")
        return _err(str(e), error_code="KEYPRESS_FAILED")


def _action_launch_app(path: str = "", **kwargs) -> Dict[str, Any]:
    """Launch an application by path using Start-Process.

    Args:
        path: Full path to the executable or app name (e.g., notepad.exe, calc.exe)
    """
    # Security gate - require armed state
    if err := _require_armed():
        return err

    if not path:
        return _err("path parameter is required", error_code="MISSING_PARAM")

    # Escape path for PowerShell
    escaped_path = path.replace("'", "''")

    ps_script = f"Start-Process -FilePath '{escaped_path}'"

    try:
        result = _run_powershell(ps_script, timeout=30)
        if result.returncode != 0:
            _audit_log("launch_app", {"path": path}, f"error: {result.stderr}")
            return _err(f"Launch failed: {result.stderr}", error_code="LAUNCH_FAILED")

        _audit_log("launch_app", {"path": path}, "success")
        return _ok(launched=True, path=path)
    except Exception as e:
        _audit_log("launch_app", {"path": path}, f"error: {e}")
        return _err(str(e), error_code="LAUNCH_FAILED")


def _action_get_windows(**kwargs) -> Dict[str, Any]:
    """Get list of open windows with their titles."""
    # Security gate - require armed state
    if err := _require_armed():
        return err

    ps_script = '''
Get-Process | Where-Object {$_.MainWindowTitle -ne ""} | ForEach-Object {
    [PSCustomObject]@{
        ProcessName = $_.ProcessName
        Title = $_.MainWindowTitle
        Id = $_.Id
        MainWindowHandle = $_.MainWindowHandle
    }
} | ConvertTo-Json -Compress
'''
    try:
        result = _run_powershell(ps_script)
        if result.returncode != 0:
            return _err(f"Get windows failed: {result.stderr}", error_code="GET_WINDOWS_FAILED")

        # Parse JSON output
        output = result.stdout.strip()
        if not output:
            return _ok(windows=[], count=0)

        windows = json.loads(output)
        # Ensure it's a list (single result comes as object, not array)
        if isinstance(windows, dict):
            windows = [windows]

        return _ok(windows=windows, count=len(windows))
    except json.JSONDecodeError as e:
        return _err(f"Failed to parse window list: {e}", error_code="PARSE_FAILED")
    except Exception as e:
        return _err(str(e), error_code="GET_WINDOWS_FAILED")


# ============================================================================
# Action router
# ============================================================================

ACTION_HANDLERS = {
    "help": _action_help,
    "status": _action_status,
    "click": _action_click,
    "doubleclick": _action_doubleclick,
    "rightclick": _action_rightclick,
    "type": _action_type,
    "keypress": _action_keypress,
    "launch_app": _action_launch_app,
    "get_windows": _action_get_windows,
}


def k_pccontrol(
    action: str,
    x: Optional[int] = None,
    y: Optional[int] = None,
    text: str = "",
    key: str = "",
    path: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """k_pccontrol - Full Desktop Access via Pure PowerShell/Win32 APIs.

    DANGER: This tool has FULL control of your Windows PC when enabled!

    Actions:
        help        - List available actions
        status      - Check if Full Desktop Access is ready
        click       - Left-click at (x, y)
        doubleclick - Double-click at (x, y)
        rightclick  - Right-click at (x, y)
        type        - Type text at focus
        keypress    - Send special key (Enter, Tab, etc.)
        launch_app  - Launch application
        get_windows - List open windows

    Args:
        action: Action to perform (required)
        x: X coordinate for click actions
        y: Y coordinate for click actions
        text: Text to type (for type action)
        key: Key to press (for keypress action)
        path: Application path (for launch_app action)
    """
    # Platform guard: Windows-only tool
    if not PCCONTROL_ENABLED:
        return _err(
            "k_pccontrol requires Windows (PowerShell + Win32 APIs). "
            "This tool is disabled on Linux/Mac containers.",
            error_code="PLATFORM_UNSUPPORTED",
            platform=platform.system(),
            enabled=False,
        )

    act = (action or "").strip().lower()

    if not act:
        return _err(
            "action is required",
            error_code="MISSING_PARAM",
            available_actions=list(ACTION_HANDLERS.keys()),
        )

    handler = ACTION_HANDLERS.get(act)
    if not handler:
        return _err(
            f"Unknown action: {act}",
            error_code="UNKNOWN_ACTION",
            available_actions=list(ACTION_HANDLERS.keys()),
        )

    return handler(x=x, y=y, text=text, key=key, path=path, **kwargs)


# ============================================================================
# Tool registration
# ============================================================================

def register_pccontrol_tools(registry) -> None:
    """Register k_pccontrol with the tool registry."""
    registry.register(
        name="k_pccontrol",
        description=(
            "Full Desktop Access - control Windows PC via PowerShell/Win32 APIs. "
            "DANGER: Has FULL control of PC when enabled! "
            "Actions: help, status, click, doubleclick, rightclick, type, keypress, launch_app, get_windows. "
            "No WinAppDriver required."
        ),
        input_schema={
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": list(ACTION_HANDLERS.keys()),
                    "description": "Action to perform",
                },
                "x": {
                    "type": "integer",
                    "description": "X coordinate for click actions",
                },
                "y": {
                    "type": "integer",
                    "description": "Y coordinate for click actions",
                },
                "text": {
                    "type": "string",
                    "description": "Text to type (for type action)",
                },
                "key": {
                    "type": "string",
                    "description": "Key to press (for keypress action) - Enter, Tab, Escape, etc.",
                },
                "path": {
                    "type": "string",
                    "description": "Application path (for launch_app action)",
                },
            },
            "required": ["action"],
        },
        handler=k_pccontrol,
    )
