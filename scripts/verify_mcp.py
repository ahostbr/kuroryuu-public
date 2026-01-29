#!/usr/bin/env python3
"""Verify MCP_CORE is running and tools are accessible."""
import sys
try:
    import httpx
except ImportError:
    print("[X] httpx not installed. Run: pip install httpx")
    sys.exit(1)

MCP_URL = "http://127.0.0.1:8100/mcp"

def main():
    try:
        # Health check
        health = httpx.get("http://127.0.0.1:8100/health", timeout=5.0).json()
        if not health.get("ok"):
            print("[X] MCP_CORE health check failed")
            sys.exit(1)
        
        # List tools
        response = httpx.post(MCP_URL, json={"jsonrpc": "2.0", "id": 1, "method": "tools/list"}, timeout=10.0).json()
        tools = response.get("result", {}).get("tools", [])
        
        kuroryuu_tools = [t["name"] for t in tools if "kuroryuu" in t["name"]]
        
        print(f"[OK] MCP_CORE running, {len(tools)} tools available")
        print(f"   Kuroryuu hooks: {', '.join(kuroryuu_tools)}")
        
    except httpx.ConnectError:
        print("[X] MCP_CORE not running. Start with: .\\run_all.ps1")
        sys.exit(1)
    except Exception as e:
        print(f"[X] Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
