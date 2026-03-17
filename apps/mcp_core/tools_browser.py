"""k_browser - Browser automation via Kuroryuu Desktop's Electron bridge.

Proxies browser actions to the Desktop app's HTTP bridge (port 7425).
The Desktop app manages a real Electron WebContentsView with partition-based
cookie persistence — cookies, localStorage, and OAuth sessions survive restarts
automatically. Mirrors LiteEditor's agent-bridge architecture.

Usage:
    k_browser(action="navigate", url="https://www.instagram.com")
    k_browser(action="read_page")      # get text + indexed interactive elements
    k_browser(action="click", index=3) # click element by index
    k_browser(action="type", text="hello", index=2)
    k_browser(action="screenshot")     # base64 PNG
    k_browser(action="status")         # browser state
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, Optional
from urllib.request import Request, urlopen
from urllib.error import URLError

from protocol import ToolRegistry

logger = logging.getLogger("k_browser")

# Bridge config
BRIDGE_PORT = 7425
BRIDGE_URL = f"http://127.0.0.1:{BRIDGE_PORT}"
TOKEN_PATH = os.path.join(
    os.environ.get("HOME") or os.environ.get("USERPROFILE") or "",
    ".kuroryuu", "browser-bridge-token"
)


def _read_token() -> str:
    """Read bearer token from disk."""
    try:
        with open(TOKEN_PATH, "r") as f:
            return f.read().strip()
    except FileNotFoundError:
        return ""


def _bridge_request(endpoint: str, body: Optional[Dict] = None, method: str = "POST") -> Dict[str, Any]:
    """Send request to the Desktop browser bridge."""
    token = _read_token()
    if not token:
        return {"ok": False, "error": f"No bridge token found at {TOKEN_PATH}. Is Kuroryuu Desktop running?"}

    url = f"{BRIDGE_URL}{endpoint}"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    data = json.dumps(body or {}).encode() if method == "POST" else None
    req = Request(url, data=data, headers=headers, method=method)

    try:
        with urlopen(req, timeout=30) as resp:
            result = json.loads(resp.read().decode())
            return {"ok": True, "result": result}
    except URLError as e:
        reason = str(e.reason) if hasattr(e, "reason") else str(e)
        if "Connection refused" in reason:
            return {"ok": False, "error": "Browser bridge not running. Is Kuroryuu Desktop open?"}
        return {"ok": False, "error": f"Bridge request failed: {reason}"}
    except Exception as e:
        return {"ok": False, "error": str(e)}


# ============================================================================
# Action Handlers
# ============================================================================

def _action_help(**kwargs) -> Dict[str, Any]:
    return {"ok": True, "result": {
        "navigate": "Navigate to URL: k_browser(action='navigate', url='...')",
        "read_page": "Get page text + indexed elements: k_browser(action='read_page')",
        "screenshot": "Capture page: k_browser(action='screenshot')",
        "click": "Click element by index: k_browser(action='click', index=3)",
        "type": "Type text: k_browser(action='type', text='...', index=2)",
        "scroll": "Scroll page: k_browser(action='scroll', direction='down', amount=300)",
        "select_option": "Select dropdown: k_browser(action='select_option', index=1, option_index=2)",
        "execute_js": "Run JavaScript: k_browser(action='execute_js', script='...')",
        "console_logs": "Get console output: k_browser(action='console_logs')",
        "back": "Navigate back: k_browser(action='back')",
        "forward": "Navigate forward: k_browser(action='forward')",
        "reload": "Reload page: k_browser(action='reload')",
        "status": "Get browser state: k_browser(action='status')",
        "list_sessions": "List sessions: k_browser(action='list_sessions')",
        "create_session": "Create new session: k_browser(action='create_session')",
    }}


def _action_navigate(url: str = "", session_id: str = "", **kwargs) -> Dict[str, Any]:
    if not url:
        return {"ok": False, "error": "url is required"}
    return _bridge_request("/browser/navigate", {"url": url, "session_id": session_id})


def _action_read_page(session_id: str = "", **kwargs) -> Dict[str, Any]:
    return _bridge_request("/browser/read-page", {"session_id": session_id})


def _action_screenshot(session_id: str = "", **kwargs) -> Dict[str, Any]:
    return _bridge_request("/browser/screenshot", {"session_id": session_id})


def _action_click(index: int = 0, session_id: str = "", **kwargs) -> Dict[str, Any]:
    return _bridge_request("/browser/click", {"index": index, "session_id": session_id})


def _action_type(text: str = "", index: Optional[int] = None, session_id: str = "", **kwargs) -> Dict[str, Any]:
    if not text:
        return {"ok": False, "error": "text is required"}
    body: Dict[str, Any] = {"text": text, "session_id": session_id}
    if index is not None:
        body["index"] = index
    return _bridge_request("/browser/type", body)


def _action_scroll(direction: str = "down", amount: int = 300, session_id: str = "", **kwargs) -> Dict[str, Any]:
    return _bridge_request("/browser/scroll", {"direction": direction, "amount": amount, "session_id": session_id})


def _action_select_option(index: int = 0, option_index: int = 0, session_id: str = "", **kwargs) -> Dict[str, Any]:
    return _bridge_request("/browser/select-option", {"element_index": index, "option_index": option_index, "session_id": session_id})


def _action_execute_js(script: str = "", session_id: str = "", **kwargs) -> Dict[str, Any]:
    if not script:
        return {"ok": False, "error": "script is required"}
    return _bridge_request("/browser/execute-js", {"code": script, "session_id": session_id})


def _action_console_logs(session_id: str = "", **kwargs) -> Dict[str, Any]:
    return _bridge_request("/browser/console-logs", {"session_id": session_id})


def _action_back(session_id: str = "", **kwargs) -> Dict[str, Any]:
    return _bridge_request("/browser/go-back", {"session_id": session_id})


def _action_forward(session_id: str = "", **kwargs) -> Dict[str, Any]:
    return _bridge_request("/browser/go-forward", {"session_id": session_id})


def _action_reload(session_id: str = "", **kwargs) -> Dict[str, Any]:
    return _bridge_request("/browser/reload", {"session_id": session_id})


def _action_status(session_id: str = "", **kwargs) -> Dict[str, Any]:
    return _bridge_request("/browser/status", {"session_id": session_id})


def _action_list_sessions(**kwargs) -> Dict[str, Any]:
    return _bridge_request("/browser/list", method="GET")


def _action_create_session(**kwargs) -> Dict[str, Any]:
    return _bridge_request("/browser/create-session", {})


# ============================================================================
# Action Dispatch
# ============================================================================

ACTION_DISPATCH = {
    "help": _action_help,
    "navigate": _action_navigate,
    "read_page": _action_read_page,
    "screenshot": _action_screenshot,
    "click": _action_click,
    "type": _action_type,
    "scroll": _action_scroll,
    "select_option": _action_select_option,
    "execute_js": _action_execute_js,
    "console_logs": _action_console_logs,
    "back": _action_back,
    "forward": _action_forward,
    "reload": _action_reload,
    "status": _action_status,
    "list_sessions": _action_list_sessions,
    "create_session": _action_create_session,
}


# ============================================================================
# Main Tool Function
# ============================================================================

def k_browser(
    action: str = "",
    url: str = "",
    text: str = "",
    index: Optional[int] = None,
    option_index: int = 0,
    direction: str = "down",
    amount: int = 300,
    script: str = "",
    session_id: str = "",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Browser automation tool — proxies to Kuroryuu Desktop's Electron browser bridge.

    Uses real Electron WebContentsView with partition-based cookie persistence.
    Cookies, localStorage, and OAuth sessions survive restarts automatically.

    Actions: help, navigate, read_page, screenshot, click, type, scroll,
             select_option, execute_js, console_logs, back, forward, reload,
             status, list_sessions, create_session
    """
    if not action:
        return {"ok": False, "error": "action is required"}

    handler = ACTION_DISPATCH.get(action)
    if not handler:
        return {"ok": False, "error": f"Unknown action: {action}. Use action='help' for available actions."}

    return handler(
        action=action,
        url=url,
        text=text,
        index=index,
        option_index=option_index,
        direction=direction,
        amount=amount,
        script=script,
        session_id=session_id,
        **kwargs,
    )


# ============================================================================
# Registration
# ============================================================================

def register_browser_tools(registry: "ToolRegistry") -> None:
    """Register k_browser routed tool."""
    registry.register(
        name="k_browser",
        description=(
            "Browser automation via Kuroryuu Desktop's Electron browser. "
            "Real Chrome with persistent cookies/OAuth — no Playwright needed. "
            "Actions: help, navigate, read_page, screenshot, click, type, scroll, "
            "select_option, execute_js, console_logs, back, forward, reload, "
            "status, list_sessions, create_session"
        ),
        input_schema={
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": list(ACTION_DISPATCH.keys()),
                    "description": "Action to perform",
                },
                "url": {
                    "type": "string",
                    "description": "URL to navigate to (for navigate)",
                },
                "text": {
                    "type": "string",
                    "description": "Text to type (for type)",
                },
                "index": {
                    "type": "integer",
                    "description": "Element index from read_page (for click, type, select_option)",
                },
                "option_index": {
                    "type": "integer",
                    "description": "Option index in select dropdown (for select_option)",
                },
                "direction": {
                    "type": "string",
                    "enum": ["up", "down", "left", "right"],
                    "description": "Scroll direction (for scroll)",
                },
                "amount": {
                    "type": "integer",
                    "description": "Scroll amount in pixels (for scroll, default 300)",
                },
                "script": {
                    "type": "string",
                    "description": "JavaScript code to execute (for execute_js)",
                },
                "session_id": {
                    "type": "string",
                    "description": "Browser session ID (optional — auto-creates default)",
                },
            },
            "required": ["action"],
        },
        handler=k_browser,
    )
