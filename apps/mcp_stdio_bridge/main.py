#!/usr/bin/env python3
"""Stdio MCP bridge - forwards JSON-RPC from stdin to HTTP MCP_CORE."""
import sys
import json
import os

try:
    import httpx
except ImportError:
    print('{"jsonrpc":"2.0","id":null,"error":{"code":-32603,"message":"httpx not installed. Run: pip install httpx"}}', flush=True)
    sys.exit(1)

MCP_URL = os.environ.get("KURORYUU_MCP_URL", "http://127.0.0.1:8100/mcp")

def main():
    for line in sys.stdin:
        if not line.strip():
            continue
        try:
            request = json.loads(line)
            response = httpx.post(MCP_URL, json=request, timeout=30.0).json()
            print(json.dumps(response), flush=True)
        except json.JSONDecodeError as e:
            print(json.dumps({"jsonrpc": "2.0", "id": None, "error": {"code": -32700, "message": f"Parse error: {e}"}}), flush=True)
        except httpx.RequestError as e:
            print(json.dumps({"jsonrpc": "2.0", "id": None, "error": {"code": -32603, "message": f"MCP_CORE unreachable: {e}"}}), flush=True)
        except Exception as e:
            print(json.dumps({"jsonrpc": "2.0", "id": None, "error": {"code": -32603, "message": str(e)}}), flush=True)

if __name__ == "__main__":
    main()
