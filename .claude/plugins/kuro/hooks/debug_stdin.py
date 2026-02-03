#!/usr/bin/env python3
"""Debug hook to capture stdin from Claude Code."""
import sys
import json
from datetime import datetime

try:
    data = sys.stdin.read()
    with open("ai/hooks/stdin_debug.txt", "a") as f:
        f.write(f"\n=== {datetime.now().isoformat()} ===\n")
        f.write(f"Raw: {repr(data)}\n")
        try:
            parsed = json.loads(data) if data else None
            f.write(f"Parsed: {json.dumps(parsed, indent=2)}\n")
        except:
            f.write("Not valid JSON\n")
except Exception as e:
    with open("ai/hooks/stdin_debug.txt", "a") as f:
        f.write(f"Error: {e}\n")
