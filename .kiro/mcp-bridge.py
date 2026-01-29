#!/usr/bin/env python3
"""Stdio-to-HTTP bridge for Kuroryuu MCP_CORE.

Reads JSON-RPC from stdin, POSTs to Kuroryuu HTTP endpoint, writes response to stdout.
"""
import json
import os
import sys
import urllib.request
import urllib.error

MCP_URL = os.environ.get("KURORYUU_MCP_URL", "http://127.0.0.1:8100/mcp")


def send_request(data: dict) -> dict:
    """POST JSON-RPC to Kuroryuu and return response."""
    req = urllib.request.Request(
        MCP_URL,
        data=json.dumps(data).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.URLError as e:
        return {"jsonrpc": "2.0", "id": data.get("id"), "error": {"code": -32000, "message": str(e)}}
    except Exception as e:
        return {"jsonrpc": "2.0", "id": data.get("id"), "error": {"code": -32603, "message": str(e)}}


def main():
    """Main loop: read stdin line-by-line, forward to HTTP, write response."""
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
            response = send_request(request)
            sys.stdout.write(json.dumps(response) + "\n")
            sys.stdout.flush()
        except json.JSONDecodeError as e:
            err = {"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": f"Parse error: {e}"}}
            sys.stdout.write(json.dumps(err) + "\n")
            sys.stdout.flush()


if __name__ == "__main__":
    main()
