#!/usr/bin/env python3
"""Stdio MCP bridge - forwards JSON-RPC from stdin to HTTP MCP_CORE.

Supports both:
- MCP stdio framing (Content-Length headers)
- Legacy newline-delimited JSON-RPC messages
"""
import json
import os
import sys
from typing import Optional, Tuple

try:
    import httpx
except ImportError:
    print(
        '{"jsonrpc":"2.0","id":null,"error":{"code":-32603,'
        '"message":"httpx not installed. Run: pip install httpx"}}',
        flush=True,
    )
    sys.exit(1)


MCP_URL = os.environ.get("KURORYUU_MCP_URL", "http://127.0.0.1:8100/mcp")


def _write_json(obj: dict, framed: bool) -> None:
    payload = json.dumps(obj, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    if framed:
        out = sys.stdout.buffer
        out.write(f"Content-Length: {len(payload)}\r\n\r\n".encode("ascii"))
        out.write(payload)
        out.flush()
        return
    sys.stdout.write(payload.decode("utf-8") + "\n")
    sys.stdout.flush()


def _read_message() -> Tuple[Optional[str], bool]:
    """Read one request from stdin.

    Returns: (raw_json_text | None on EOF, is_framed)
    """
    first = sys.stdin.buffer.readline()
    if not first:
        return None, False

    # Framed MCP/LSP style
    if first.lower().startswith(b"content-length:"):
        try:
            content_length = int(first.split(b":", 1)[1].strip())
        except Exception:
            return "{}", True

        # Consume remaining headers until blank line.
        while True:
            hdr = sys.stdin.buffer.readline()
            if not hdr or hdr in (b"\r\n", b"\n"):
                break

        body = sys.stdin.buffer.read(content_length)
        if not body:
            return None, True
        return body.decode("utf-8", errors="replace"), True

    # Legacy line-delimited JSON.
    line = first.decode("utf-8", errors="replace").strip()
    if not line:
        return "", False
    return line, False


def main() -> None:
    session_id: Optional[str] = None

    with httpx.Client(timeout=30.0) as client:
        while True:
            raw, framed = _read_message()
            if raw is None:
                break
            if not raw.strip():
                continue

            req_id = None
            try:
                request = json.loads(raw)
                if not isinstance(request, dict):
                    raise ValueError("JSON-RPC request must be an object")

                has_id = "id" in request
                req_id = request.get("id") if has_id else None
                method = request.get("method", "")

                # JSON-RPC notification: no "id" field => server must not reply.
                # MCP clients typically send notifications/initialized during handshake.
                if not has_id and isinstance(method, str) and method.startswith("notifications/"):
                    continue

                headers = {}
                if session_id:
                    headers["mcp-session-id"] = session_id

                http_resp = client.post(MCP_URL, json=request, headers=headers)
                maybe_session = http_resp.headers.get("mcp-session-id")
                if maybe_session:
                    session_id = maybe_session

                try:
                    response = http_resp.json()
                except Exception:
                    response = {
                        "jsonrpc": "2.0",
                        "id": req_id,
                        "error": {
                            "code": -32603,
                            "message": f"Invalid JSON from MCP_CORE (status {http_resp.status_code})",
                        },
                    }

                if has_id:
                    _write_json(response, framed=framed)
            except json.JSONDecodeError as e:
                _write_json(
                    {
                        "jsonrpc": "2.0",
                        "id": req_id,
                        "error": {"code": -32700, "message": f"Parse error: {e}"},
                    },
                    framed=framed,
                )
            except httpx.RequestError as e:
                _write_json(
                    {
                        "jsonrpc": "2.0",
                        "id": req_id,
                        "error": {"code": -32603, "message": f"MCP_CORE unreachable: {e}"},
                    },
                    framed=framed,
                )
            except Exception as e:
                _write_json(
                    {
                        "jsonrpc": "2.0",
                        "id": req_id,
                        "error": {"code": -32603, "message": str(e)},
                    },
                    framed=framed,
                )


if __name__ == "__main__":
    main()
