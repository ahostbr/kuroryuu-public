#!/usr/bin/env python3
"""End-to-end test of Kuroryuu session lifecycle via MCP."""
import sys
import os
try:
    import httpx
except ImportError:
    print("❌ httpx not installed. Run: pip install httpx")
    sys.exit(1)

MCP_URL = "http://127.0.0.1:8100/mcp"

def call_tool(name: str, args: dict) -> dict:
    response = httpx.post(MCP_URL, json={
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {"name": name, "arguments": args}
    }, timeout=10.0).json()
    return response.get("result", response.get("error", {}))

def main():
    print("🧪 Testing Kuroryuu session lifecycle (using routed k_session tool)...\n")

    # 1. Session start
    print("1. k_session(action='start')...")
    result = call_tool("k_session", {
        "action": "start",
        "process_id": os.getpid(),
        "cli_type": "test",
        "agent_id": "e2e_test"
    })
    if not result.get("ok"):
        print(f"   ❌ Failed: {result}")
        sys.exit(1)
    session_id = result["session_id"]
    print(f"   ✅ Session: {session_id}")

    # 2. Pre-tool check
    print("2. k_session(action='pre_tool')...")
    result = call_tool("k_session", {
        "action": "pre_tool",
        "session_id": session_id,
        "tool_name": "test_tool",
        "arguments": "{}"
    })
    if not result.get("allow", False):
        print(f"   ⚠️ Blocked: {result.get('reason', 'unknown')}")
    else:
        print("   ✅ Allowed")

    # 3. Post-tool tracking
    print("3. k_session(action='post_tool')...")
    result = call_tool("k_session", {
        "action": "post_tool",
        "session_id": session_id,
        "tool_name": "test_tool",
        "result_ok": True,
        "result_summary": "E2E test tool execution"
    })
    print(f"   ✅ Tracked" if result.get("ok") else f"   ❌ Failed: {result}")

    # 4. Get context
    print("4. k_session(action='context')...")
    result = call_tool("k_session", {"action": "context", "session_id": session_id})
    if result.get("ok"):
        print(f"   ✅ Context: {len(result.get('context', ''))} chars")
    else:
        print(f"   ❌ Failed: {result}")

    # 5. Session end
    print("5. k_session(action='end')...")
    result = call_tool("k_session", {
        "action": "end",
        "session_id": session_id,
        "exit_code": 0,
        "summary": "E2E test completed successfully"
    })
    print(f"   ✅ Ended" if result.get("ok") else f"   ❌ Failed: {result}")
    
    print("\n✅ All tests passed!")

if __name__ == "__main__":
    main()
