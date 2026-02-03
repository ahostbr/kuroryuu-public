#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.8"
# dependencies = [
#     "requests",
# ]
# ///

"""
Task Summarizer for Kuroryuu TTS

Generates contextual, personalized task completion announcements using Kuroryuu Gateway.
Falls back to default messages when smart summaries are disabled or API fails.

Usage:
  uv run task_summarizer.py "Task description" --type stop
  uv run task_summarizer.py "Task description" --type subagent --agent builder
  uv run task_summarizer.py "Task description" --type notification
"""

import argparse
import json
import sys
from pathlib import Path

# Gateway endpoint
GATEWAY_URL = "http://127.0.0.1:8200/v1/chat/proxy"


def get_settings():
    """Load kuroPlugin settings from .claude/settings.json"""
    # Find project root (where .claude folder is)
    current = Path.cwd()
    while current != current.parent:
        settings_path = current / ".claude" / "settings.json"
        if settings_path.exists():
            try:
                with open(settings_path) as f:
                    settings = json.load(f)
                    return settings.get("kuroPlugin", {})
            except Exception:
                pass
        current = current.parent
    return {}


def generate_summary(task_description: str, summary_type: str, agent_name: str = None,
                     user_name: str = "Ryan", provider: str = "gateway-auto") -> str:
    """Generate an AI summary using Kuroryuu Gateway."""
    try:
        import requests

        # Build context-aware prompt
        if summary_type == "stop":
            context = "This is for announcing that a coding session has ended."
        elif summary_type == "subagent":
            context = f"This is for announcing that a subagent ({agent_name or 'builder'}) has completed its task."
        else:
            context = "This is for notifying the user that their attention is needed."

        prompt = f"""Generate a brief, conversational announcement for audio TTS.

Task/Context: {task_description}
Type: {summary_type}
{context}

Requirements:
- ALWAYS start with "{user_name}, " (name followed by comma)
- Keep it under 15 words total
- Be conversational and warm
- Focus on the outcome
- Do NOT use quotes, formatting, or explanations
- Return ONLY the announcement text

Examples for reference:
- "{user_name}, the authentication system is ready to use."
- "{user_name}, your file watcher is now monitoring for changes."
- "{user_name}, the API endpoints are set up."
- "{user_name}, I need your input on something."""

        # Map provider names to Gateway backend values
        backend_map = {
            "gateway-auto": "gateway-auto",
            "lmstudio": "lmstudio",
            "cliproxy": "cliproxyapi",
            "claude": "claude"
        }
        backend = backend_map.get(provider, "gateway-auto")

        response = requests.post(
            GATEWAY_URL,
            json={
                "messages": [{"role": "user", "content": prompt}],
                "stream": False,
                "max_tokens": 100,
                "temperature": 0.7,
                "backend": backend
            },
            timeout=30
        )

        if response.status_code == 200:
            data = response.json()
            # Gateway returns content directly, not in OpenAI format
            if "content" in data:
                return data["content"].strip()
            # Fallback to OpenAI format if present
            elif "choices" in data:
                return data["choices"][0]["message"]["content"].strip()
            else:
                print(f"Unexpected response format: {data}", file=sys.stderr)
                return None
        else:
            print(f"Gateway error {response.status_code}: {response.text}", file=sys.stderr)
            return None

    except Exception as e:
        print(f"Summary generation failed: {e}", file=sys.stderr)
        return None


def get_fallback_message(summary_type: str, settings: dict) -> str:
    """Get the fallback message from settings or defaults."""
    defaults = {
        "stop": "Work complete",
        "subagent": "Task finished",
        "notification": "Your attention is needed"
    }

    # These would come from the TTS messages in settings
    # For now, use defaults
    return defaults.get(summary_type, "Task complete")


def main():
    parser = argparse.ArgumentParser(description="Generate task completion announcements")
    parser.add_argument("task", nargs="?", default="Task completed", help="Task description")
    parser.add_argument("--type", "-t", choices=["stop", "subagent", "notification"],
                        default="subagent", help="Type of announcement")
    parser.add_argument("--agent", "-a", default=None, help="Agent name (for subagent type)")
    parser.add_argument("--fallback", "-f", default=None, help="Fallback message if AI fails")
    parser.add_argument("--provider", "-p", default=None, help="Summary provider override")
    args = parser.parse_args()

    # Load settings
    settings = get_settings()
    smart_summaries = settings.get("smartSummaries", False)
    user_name = settings.get("userName", "Ryan")
    provider = args.provider or settings.get("summaryProvider", "gateway-auto")

    message = None

    if smart_summaries:
        # Try to generate AI summary
        message = generate_summary(
            task_description=args.task,
            summary_type=args.type,
            agent_name=args.agent,
            user_name=user_name,
            provider=provider
        )

    if not message:
        # Use fallback
        message = args.fallback or get_fallback_message(args.type, settings)

    # Output the message (to be piped to TTS)
    print(message)


if __name__ == "__main__":
    main()
