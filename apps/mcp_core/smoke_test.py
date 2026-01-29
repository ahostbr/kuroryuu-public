"""Smoke test for MCP_CORE server.

Run with server already started:
  python smoke_test.py

Or specify host/port:
  python smoke_test.py --host 127.0.0.1 --port 8000
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any, Dict, Optional

try:
    import httpx
except ImportError:
    print("ERROR: httpx not installed. Run: pip install httpx")
    sys.exit(1)


def _post(client: httpx.Client, url: str, body: Dict[str, Any], session_id: Optional[str] = None) -> tuple[Dict[str, Any], Optional[str]]:
    """POST JSON-RPC request and return (response, session_id)."""
    headers = {"Content-Type": "application/json"}
    if session_id:
        headers["mcp-session-id"] = session_id
    
    resp = client.post(url, json=body, headers=headers)
    resp.raise_for_status()
    new_session = resp.headers.get("mcp-session-id")
    return resp.json(), new_session or session_id


def main() -> int:
    parser = argparse.ArgumentParser(description="Smoke test MCP_CORE server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    
    base_url = f"http://{args.host}:{args.port}"
    mcp_url = f"{base_url}/mcp"
    
    print(f"=== MCP_CORE Smoke Test ===")
    print(f"Target: {base_url}")
    print()
    
    failures = []
    session_id: Optional[str] = None
    
    with httpx.Client(timeout=30.0) as client:
        # 1. Health check
        print("[1] Health check (GET /)...", end=" ")
        try:
            resp = client.get(base_url)
            data = resp.json()
            if data.get("status") == "ok":
                print(f"PASS - {len(data.get('tools', []))} tools")
            else:
                print("FAIL")
                failures.append("health check")
        except Exception as e:
            print(f"FAIL - {e}")
            failures.append("health check")
            return 1  # Can't continue without server
        
        # 2. Initialize session
        print("[2] Initialize MCP session...", end=" ")
        try:
            body = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {"tools": {}},
                    "clientInfo": {"name": "smoke_test", "version": "1.0"},
                },
            }
            data, session_id = _post(client, mcp_url, body)
            if "result" in data and session_id:
                print(f"PASS - session: {session_id[:20]}...")
            else:
                print("FAIL")
                failures.append("initialize")
        except Exception as e:
            print(f"FAIL - {e}")
            failures.append("initialize")
        
        # 3. List tools
        print("[3] List tools (tools/list)...", end=" ")
        try:
            body = {"jsonrpc": "2.0", "id": 2, "method": "tools/list"}
            data, _ = _post(client, mcp_url, body, session_id)
            tools = data.get("result", {}).get("tools", [])
            if len(tools) >= 11:  # 3 RAG + 5 Inbox + 3 Checkpoint
                print(f"PASS - {len(tools)} tools")
            else:
                print(f"WARN - only {len(tools)} tools")
        except Exception as e:
            print(f"FAIL - {e}")
            failures.append("tools/list")
        
        # 4. Inbox flow: send -> list -> claim -> complete
        print("[4] Inbox: send message...", end=" ")
        inbox_filename = None
        try:
            body = {
                "jsonrpc": "2.0",
                "id": 3,
                "method": "tools/call",
                "params": {
                    "name": "inbox.send",
                    "arguments": {
                        "to_agent": "test_agent",
                        "subject": "Smoke test message",
                        "body": "This is a test",
                        "from_agent": "smoke_test",
                    },
                },
            }
            data, _ = _post(client, mcp_url, body, session_id)
            content = data.get("result", {}).get("content", [])
            if content:
                result = json.loads(content[0].get("text", "{}"))
                if result.get("ok"):
                    inbox_filename = result.get("filename")
                    print(f"PASS - {inbox_filename}")
                else:
                    print(f"FAIL - {result.get('message')}")
                    failures.append("inbox.send")
        except Exception as e:
            print(f"FAIL - {e}")
            failures.append("inbox.send")
        
        print("[5] Inbox: list messages...", end=" ")
        try:
            body = {
                "jsonrpc": "2.0",
                "id": 4,
                "method": "tools/call",
                "params": {
                    "name": "inbox.list",
                    "arguments": {"agent": "test_agent", "box": "new"},
                },
            }
            data, _ = _post(client, mcp_url, body, session_id)
            content = data.get("result", {}).get("content", [])
            if content:
                result = json.loads(content[0].get("text", "{}"))
                if result.get("ok") and result.get("count", 0) > 0:
                    print(f"PASS - {result.get('count')} messages")
                else:
                    print("WARN - no messages")
        except Exception as e:
            print(f"FAIL - {e}")
            failures.append("inbox.list")
        
        if inbox_filename:
            print("[6] Inbox: claim message...", end=" ")
            claimed_filename = None
            try:
                body = {
                    "jsonrpc": "2.0",
                    "id": 5,
                    "method": "tools/call",
                    "params": {
                        "name": "inbox.claim",
                        "arguments": {"agent": "test_agent", "filename": inbox_filename},
                    },
                }
                data, _ = _post(client, mcp_url, body, session_id)
                content = data.get("result", {}).get("content", [])
                if content:
                    result = json.loads(content[0].get("text", "{}"))
                    if result.get("ok"):
                        claimed_filename = result.get("new_filename")
                        print(f"PASS")
                    else:
                        print(f"FAIL - {result.get('message')}")
                        failures.append("inbox.claim")
            except Exception as e:
                print(f"FAIL - {e}")
                failures.append("inbox.claim")
            
            if claimed_filename:
                print("[7] Inbox: complete message...", end=" ")
                try:
                    body = {
                        "jsonrpc": "2.0",
                        "id": 6,
                        "method": "tools/call",
                        "params": {
                            "name": "inbox.complete",
                            "arguments": {"agent": "test_agent", "filename": claimed_filename, "note": "smoke test done"},
                        },
                    }
                    data, _ = _post(client, mcp_url, body, session_id)
                    content = data.get("result", {}).get("content", [])
                    if content:
                        result = json.loads(content[0].get("text", "{}"))
                        if result.get("ok"):
                            print("PASS")
                        else:
                            print(f"FAIL - {result.get('message')}")
                            failures.append("inbox.complete")
                except Exception as e:
                    print(f"FAIL - {e}")
                    failures.append("inbox.complete")
        
        # 5. Checkpoint flow: save -> list -> load
        print("[8] Checkpoint: save...", end=" ")
        try:
            body = {
                "jsonrpc": "2.0",
                "id": 7,
                "method": "tools/call",
                "params": {
                    "name": "checkpoint.save",
                    "arguments": {
                        "name": "smoke_test",
                        "data": {"test": True, "counter": 42},
                        "summary": "Smoke test checkpoint",
                    },
                },
            }
            data, _ = _post(client, mcp_url, body, session_id)
            content = data.get("result", {}).get("content", [])
            if content:
                result = json.loads(content[0].get("text", "{}"))
                if result.get("ok"):
                    print(f"PASS - {result.get('id')}")
                else:
                    print(f"FAIL - {result.get('message')}")
                    failures.append("checkpoint.save")
        except Exception as e:
            print(f"FAIL - {e}")
            failures.append("checkpoint.save")
        
        print("[9] Checkpoint: list...", end=" ")
        try:
            body = {
                "jsonrpc": "2.0",
                "id": 8,
                "method": "tools/call",
                "params": {
                    "name": "checkpoint.list",
                    "arguments": {"name": "smoke_test"},
                },
            }
            data, _ = _post(client, mcp_url, body, session_id)
            content = data.get("result", {}).get("content", [])
            if content:
                result = json.loads(content[0].get("text", "{}"))
                if result.get("ok") and result.get("count", 0) > 0:
                    print(f"PASS - {result.get('count')} checkpoints")
                else:
                    print("WARN - no checkpoints")
        except Exception as e:
            print(f"FAIL - {e}")
            failures.append("checkpoint.list")
        
        print("[10] Checkpoint: load latest...", end=" ")
        try:
            body = {
                "jsonrpc": "2.0",
                "id": 9,
                "method": "tools/call",
                "params": {
                    "name": "checkpoint.load",
                    "arguments": {"name": "smoke_test", "id": "latest"},
                },
            }
            data, _ = _post(client, mcp_url, body, session_id)
            content = data.get("result", {}).get("content", [])
            if content:
                result = json.loads(content[0].get("text", "{}"))
                if result.get("ok"):
                    cp = result.get("checkpoint", {})
                    if cp.get("data", {}).get("test") is True:
                        print("PASS")
                    else:
                        print("WARN - data mismatch")
                else:
                    print(f"FAIL - {result.get('message')}")
                    failures.append("checkpoint.load")
        except Exception as e:
            print(f"FAIL - {e}")
            failures.append("checkpoint.load")
        
        # 6. RAG query (may fail if no index)
        print("[11] RAG: query...", end=" ")
        try:
            body = {
                "jsonrpc": "2.0",
                "id": 10,
                "method": "tools/call",
                "params": {
                    "name": "rag.query",
                    "arguments": {"query": "FastAPI", "top_k": 3},
                },
            }
            data, _ = _post(client, mcp_url, body, session_id)
            content = data.get("result", {}).get("content", [])
            if content:
                result = json.loads(content[0].get("text", "{}"))
                if result.get("ok"):
                    print(f"PASS - {result.get('count')} matches ({result.get('rag_mode')})")
                else:
                    print(f"WARN - {result.get('message')}")
        except Exception as e:
            print(f"FAIL - {e}")
            failures.append("rag.query")
    
    # Summary
    print()
    print("=== Summary ===")
    if failures:
        print(f"FAILURES: {', '.join(failures)}")
        return 1
    else:
        print("ALL TESTS PASSED")
        return 0


if __name__ == "__main__":
    sys.exit(main())
