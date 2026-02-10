"""Observability hook: POST event to Gateway.

Called directly by Claude Code hooks via uv run.
Usage: uv run send_event.py <EventType>
Stdin: JSON hook payload from Claude Code.
"""
import json
import sys
import time
import urllib.request

def main():
    event_type = sys.argv[1] if len(sys.argv) > 1 else None
    if not event_type:
        return

    # Read stdin (Python handles this reliably on Windows unlike PowerShell)
    input_json = ""
    try:
        input_json = sys.stdin.read()
    except Exception:
        pass

    event = {}
    try:
        event = json.loads(input_json) if input_json.strip() else {}
    except Exception:
        pass

    session_id = event.get("session_id", "unknown")
    agent_id = event.get("agent_id") or (event.get("agent", {}) or {}).get("name")
    tool_name = event.get("tool_name") or (event.get("tool", {}) or {}).get("name")

    body = json.dumps({
        "source_app": "kuroryuu",
        "session_id": session_id,
        "hook_event_type": event_type,
        "tool_name": tool_name,
        "agent_id": agent_id,
        "payload": event,
        "timestamp": int(time.time() * 1000),
    }).encode()

    try:
        req = urllib.request.Request(
            "http://127.0.0.1:8200/v1/observability/events",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=3)
    except Exception:
        pass  # Fire-and-forget — never block Claude Code


if __name__ == "__main__":
    main()
