"""UserPromptSubmit / PostToolUse hook: poll inbox for unread messages.

Called by Claude Code hooks via uv run.
Stdin: JSON hook payload from Claude Code (contains session_id, agent_id).
Stdout: Formatted alert if unread messages exist (appears as <system-reminder>).

Uses Gateway MCP endpoint (POST /v1/mcp/call) to call k_msg check action,
which reads from the Kuroryuu maildir inbox (ai/inbox/).
"""
import json
import os
import sys
import time
import urllib.request

GATEWAY_MCP = "http://127.0.0.1:8200/v1/mcp/call"
DEFAULT_AGENT = "claude"
COOLDOWN_SECONDS = 30
COOLDOWN_FILE = os.path.join("ai", "data", ".inbox_last_check")


def _check_cooldown() -> bool:
    """Return True if cooldown has elapsed (ok to poll), False to skip."""
    try:
        if os.path.exists(COOLDOWN_FILE):
            mtime = os.path.getmtime(COOLDOWN_FILE)
            if time.time() - mtime < COOLDOWN_SECONDS:
                return False
    except Exception:
        pass
    return True


def _update_cooldown():
    """Touch the cooldown file."""
    try:
        os.makedirs(os.path.dirname(COOLDOWN_FILE), exist_ok=True)
        with open(COOLDOWN_FILE, "w") as f:
            f.write(str(time.time()))
    except Exception:
        pass


def _sanitize(text: str, max_len: int = 60) -> str:
    """Truncate and strip shell metacharacters for safe display."""
    if not text:
        return ""
    clean = text.replace(";", "").replace("|", "").replace("&", "")
    clean = clean.replace("`", "").replace("$", "").replace("\\", "")
    if len(clean) > max_len:
        clean = clean[: max_len - 3] + "..."
    return clean.strip()


def main():
    # Check cooldown first (fast path — no I/O beyond stat)
    if not _check_cooldown():
        return

    # Read agent_id from hook payload
    agent_id = DEFAULT_AGENT
    try:
        payload = json.loads(sys.stdin.read())
        agent_id = (
            payload.get("agent_id")
            or (payload.get("agent") or {}).get("name")
            or DEFAULT_AGENT
        )
    except Exception:
        pass

    # Poll inbox via Gateway MCP (k_msg check)
    try:
        body = json.dumps({
            "tool": "k_msg",
            "arguments": {"action": "check", "agent_id": agent_id, "limit": 5},
        }).encode()
        req = urllib.request.Request(
            GATEWAY_MCP,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        resp = urllib.request.urlopen(req, timeout=3)
        data = json.loads(resp.read())
    except Exception:
        return  # Gateway down — fail silently

    # Parse MCP response: {result: {ok, count, messages}}
    result = data.get("result", data)
    if isinstance(result, str):
        try:
            result = json.loads(result)
        except Exception:
            return

    messages = result.get("messages", [])
    if not messages:
        _update_cooldown()
        return  # No messages — silent

    # Output alert (stdout → <system-reminder> in Claude conversation)
    count = len(messages)
    print(f"\n[INBOX] {count} message(s) for {agent_id}:")
    for msg in messages[:5]:
        subj = _sanitize(msg.get("subject") or "(no subject)")
        frm = _sanitize(msg.get("from_agent") or "unknown", 30)
        mid = (msg.get("id") or msg.get("message_id") or "")[:8]
        print(f'  - "{subj}" from {frm} ({mid})')
    print(f'Use k_msg(action="check", agent_id="{agent_id}") to read.\n')

    _update_cooldown()


if __name__ == "__main__":
    main()
