#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "python-dotenv",
# ]
# ///

"""
Status Line v5 - Cost Tracking

Ported from claude-code-hooks-mastery for Kuroryuu.

Display: [Model] $ $0.0123 | +156/-23 lines | 45s

Shows total_cost_usd, lines added/removed, duration.

Configure in .claude/settings.json:
  "statusLine": {
    "command": "uv run ${CLAUDE_PLUGIN_ROOT}/status_lines/status_line_v5.py"
  }
"""

import json
import sys

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # dotenv is optional


# ANSI color codes
CYAN = "\033[36m"
GREEN = "\033[32m"
RED = "\033[31m"
YELLOW = "\033[33m"
BRIGHT_WHITE = "\033[97m"
DIM = "\033[90m"
RESET = "\033[0m"


def format_cost(cost_usd):
    """Format cost with appropriate precision."""
    if cost_usd is None or cost_usd == 0:
        return "$0.00"
    elif cost_usd < 0.01:
        return f"${cost_usd:.4f}"
    elif cost_usd < 1.00:
        return f"${cost_usd:.3f}"
    else:
        return f"${cost_usd:.2f}"


def format_duration(duration_ms):
    """Format duration in human-readable format."""
    if duration_ms is None or duration_ms == 0:
        return "0s"

    total_seconds = duration_ms / 1000

    if total_seconds < 60:
        return f"{int(total_seconds)}s"
    elif total_seconds < 3600:
        minutes = int(total_seconds // 60)
        seconds = int(total_seconds % 60)
        return f"{minutes}m {seconds}s"
    else:
        hours = int(total_seconds // 3600)
        minutes = int((total_seconds % 3600) // 60)
        return f"{hours}h {minutes}m"


def generate_status_line(input_data):
    """Generate the cost tracking status line."""
    # Get model name
    model_info = input_data.get("model", {})
    model_name = model_info.get("display_name", "Claude")

    # Get cost data
    cost_data = input_data.get("cost", {})
    total_cost = cost_data.get("total_cost_usd", 0) or 0
    total_duration = cost_data.get("total_duration_ms", 0) or 0
    lines_added = cost_data.get("total_lines_added", 0) or 0
    lines_removed = cost_data.get("total_lines_removed", 0) or 0

    # Format values
    cost_str = format_cost(total_cost)
    duration_str = format_duration(total_duration)

    # Build status line
    parts = []

    # Model name in cyan
    parts.append(f"{CYAN}[{model_name}]{RESET}")

    # Cost with dollar sign
    parts.append(f"{YELLOW}${RESET} {BRIGHT_WHITE}{cost_str}{RESET}")

    # Lines changed (green for added, red for removed)
    lines_str = f"{GREEN}+{lines_added}{RESET}/{RED}-{lines_removed}{RESET} lines"
    parts.append(lines_str)

    # Duration with @ symbol
    parts.append(f"{DIM}@{RESET} {BRIGHT_WHITE}{duration_str}{RESET}")

    return " | ".join(parts)


def main():
    try:
        # Read JSON input from stdin
        input_data = json.loads(sys.stdin.read())

        # Generate status line
        status_line = generate_status_line(input_data)

        # Output the status line
        print(status_line)

        # Success
        sys.exit(0)

    except json.JSONDecodeError:
        # Handle JSON decode errors gracefully
        print(f"{RED}[Claude] $ Error: Invalid JSON{RESET}")
        sys.exit(0)
    except Exception as e:
        # Handle any other errors gracefully
        print(f"{RED}[Claude] $ Error: {str(e)}{RESET}")
        sys.exit(0)


if __name__ == "__main__":
    main()
