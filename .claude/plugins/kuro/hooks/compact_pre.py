#!/usr/bin/env python3
# /// script
# requires-python = ">=3.8"
# dependencies = []
# ///
"""PreCompact project hook: backup transcript JSONL to ai/exports/pre-compact/."""
import json
import os
import shutil
import sys
from datetime import datetime
from pathlib import Path


def main():
    try:
        data = json.loads(sys.stdin.read())
    except Exception:
        return

    transcript_path = data.get("transcript_path", "")
    trigger = data.get("trigger", "unknown")
    session_id = data.get("session_id", "unknown")
    session_short = session_id[:8] if session_id else "unknown"

    if not transcript_path:
        return

    src = Path(transcript_path)
    if not src.exists():
        return

    project_dir = os.environ.get("CLAUDE_PROJECT_DIR", os.getcwd())
    target_dir = Path(project_dir) / "ai" / "exports" / "pre-compact"
    target_dir.mkdir(parents=True, exist_ok=True)

    date_str = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{date_str}_{trigger}_{session_short}.jsonl"
    shutil.copy2(src, target_dir / filename)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        pass  # Never block Claude Code
