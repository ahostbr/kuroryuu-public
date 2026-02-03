#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.8"
# dependencies = [
#     "requests",
#     "edge-tts",
# ]
# ///

"""
Smart TTS Hook for Kuroryuu

Combines task summarization with TTS playback.
When smart summaries are enabled, generates contextual AI announcements
using Kuroryuu's multi-provider Gateway system.
Otherwise uses the fallback message.

Usage:
  uv run smart_tts.py "Fallback message" --type stop
  uv run smart_tts.py "Fallback message" --type subagent --task "Task description"
  uv run smart_tts.py "Fallback message" --type notification
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

# Gateway endpoint
GATEWAY_URL = "http://127.0.0.1:8200/v1/chat/proxy"


def get_settings():
    """Load kuroPlugin settings from .claude/settings.json"""
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


def generate_summary_via_gateway(task_description: str, summary_type: str, agent_name: str = None,
                                  user_name: str = "Ryan", provider: str = "gateway-auto",
                                  model: str = None) -> str:
    """Generate an AI summary using Kuroryuu Gateway (any provider)."""
    try:
        import requests

        if summary_type == "stop":
            context = "A coding session has ended."
        elif summary_type == "subagent":
            context = f"A subagent ({agent_name or 'builder'}) completed a task."
        else:
            context = "The user's attention is needed."

        prompt = f"""Generate a brief TTS announcement summarizing COMPLETED work.

{task_description}
Context: {context}

Requirements:
- ALWAYS start with "{user_name}, " (name followed by comma)
- Under 20 words total
- Summarize the SPECIFIC outcome - mention key details from the result
- If files were found, mention count or names
- If code was written, mention what was created
- If a check was done, mention what was verified
- Use past tense - work is DONE
- Be specific, not generic
- Return ONLY the announcement text, no quotes

IMPORTANT: Summarize the ACTUAL result above, not these examples!

Style guide (DO NOT copy these literally):
- Mention specific numbers, file counts, or key findings from the result
- Keep it brief and factual

Bad (TOO GENERIC - never say these):
- "the task is complete"
- "that wrapped up nicely"
- "background work finished"
- "authentication endpoints" (unless that's actually what was done!)

Generate ONE specific announcement:"""

        # Map provider names to Gateway backend values
        backend_map = {
            "gateway-auto": "gateway-auto",
            "lmstudio": "lmstudio",
            "cliproxy": "cliproxyapi",
            "claude": "claude"
        }
        backend = backend_map.get(provider, "gateway-auto")

        # Build request payload
        payload = {
            "messages": [{"role": "user", "content": prompt}],
            "stream": False,
            "max_tokens": 100,
            "temperature": 0.7,
            "backend": backend
        }

        # Add model if specified (for LMStudio)
        if model:
            payload["model"] = model

        response = requests.post(
            GATEWAY_URL,
            json=payload,
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
                print(f"[SmartTTS] Unexpected response format: {data}", file=sys.stderr)
                return None
        else:
            print(f"[SmartTTS] Gateway error {response.status_code}: {response.text}", file=sys.stderr)
            return None

    except Exception as e:
        print(f"[SmartTTS] Summary failed: {e}", file=sys.stderr)
        return None


def speak(text: str, voice: str = "en-GB-SoniaNeural"):
    """Generate and play TTS audio."""
    try:
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
            tmp_path = tmp.name

        try:
            uv_path = r"C:\Users\Ryan\.local\bin\uv.exe"

            # Generate audio
            result = subprocess.run(
                [uv_path, "run", "--with", "edge-tts", "edge-tts",
                 "--voice", voice, "--text", text, "--write-media", tmp_path],
                capture_output=True,
                text=True,
                timeout=30
            )

            if result.returncode != 0:
                print(f"[SmartTTS] Generation error: {result.stderr}", file=sys.stderr)
                return False

            # Play using PowerShell MediaPlayer
            ps_cmd = f'''
            Add-Type -AssemblyName presentationCore
            $player = New-Object System.Windows.Media.MediaPlayer
            $player.Open("{tmp_path}")
            Start-Sleep -Milliseconds 300
            $player.Play()
            $duration = $player.NaturalDuration
            if ($duration.HasTimeSpan) {{
                $ms = $duration.TimeSpan.TotalMilliseconds + 500
                Start-Sleep -Milliseconds $ms
            }} else {{
                Start-Sleep -Seconds 5
            }}
            $player.Close()
            '''
            subprocess.run(
                ["powershell.exe", "-NoProfile", "-Command", ps_cmd],
                capture_output=True,
                timeout=30
            )

            print(f"[SmartTTS] Announced: {text}")
            return True

        finally:
            try:
                os.unlink(tmp_path)
            except:
                pass

    except Exception as e:
        print(f"[SmartTTS] Error: {e}", file=sys.stderr)
        return False


def read_stdin_context():
    """Read hook context from stdin (Claude Code passes JSON)."""
    try:
        # Read all stdin data
        data = sys.stdin.read()
        if data:
            return json.loads(data)
    except Exception:
        pass
    return None


def get_task_and_result_from_transcript(transcript_path: str, retries: int = 3, delay: float = 0.5) -> tuple:
    """Extract task description AND final result from agent transcript file.

    Returns:
        tuple: (task_description, result_summary) - result_summary contains what was actually done
    """
    task = None
    result = None

    for attempt in range(retries):
        try:
            # Check if file exists first
            if not os.path.exists(transcript_path):
                if attempt < retries - 1:
                    time.sleep(delay)
                    continue
                return None, None

            with open(transcript_path, 'r', encoding='utf-8') as f:
                lines = f.readlines()

            # Parse all entries
            last_assistant_text = None
            for line in lines:
                if not line.strip():
                    continue
                try:
                    entry = json.loads(line.strip())
                    entry_type = entry.get("type")

                    # First user message = task
                    if entry_type == "user" and task is None:
                        msg = entry.get("message", {})
                        content = msg.get("content") if isinstance(msg, dict) else None
                        if content and isinstance(content, str):
                            task = content[:200]

                    # Track last assistant message = result
                    elif entry_type == "assistant":
                        msg = entry.get("message", {})
                        content_list = msg.get("content", [])
                        # Extract text from content blocks
                        for block in content_list:
                            if isinstance(block, dict) and block.get("type") == "text":
                                text = block.get("text", "")
                                if text:
                                    last_assistant_text = text
                except json.JSONDecodeError:
                    continue

            # Use last assistant response as result (truncated)
            if last_assistant_text:
                result = last_assistant_text[:500]

            return task, result

        except Exception as e:
            if attempt < retries - 1:
                time.sleep(delay)
            else:
                print(f"[SmartTTS] Transcript read error after {retries} attempts: {e}", file=sys.stderr)

    return None, None


def main():
    parser = argparse.ArgumentParser(description="Smart TTS with optional AI summaries")
    parser.add_argument("fallback", nargs="?", default="Task complete", help="Fallback message")
    parser.add_argument("--type", "-t", choices=["stop", "subagent", "notification"],
                        default="subagent", help="Announcement type")
    parser.add_argument("--task", default=None, help="Task description for AI summary")
    parser.add_argument("--agent", "-a", default=None, help="Agent name")
    parser.add_argument("--voice", "-v", default=None, help="TTS voice override")
    parser.add_argument("--provider", "-p", default=None, help="Summary provider override")
    parser.add_argument("--model", "-m", default=None, help="LLM model override (for LMStudio)")
    args = parser.parse_args()

    # Load settings
    settings = get_settings()
    smart_summaries = settings.get("smartSummaries", False)
    user_name = settings.get("userName", "Ryan")
    voice = args.voice or settings.get("voice", "en-GB-SoniaNeural")
    provider = args.provider or settings.get("summaryProvider", "gateway-auto")
    model = args.model or settings.get("summaryModel", "")

    message = None

    # Try to get task and result from stdin (Claude Code hook context)
    task = args.task
    result = None
    stdin_context = read_stdin_context()

    if stdin_context:
        # SubagentStop: read task AND result from agent transcript file
        transcript_path = stdin_context.get("agent_transcript_path")
        if transcript_path:
            task, result = get_task_and_result_from_transcript(transcript_path)

    # Check if task description is valid (not empty, not unexpanded variable)
    if task and (task.startswith('$') or task == '' or task == 'null'):
        task = None

    # Try AI summary if enabled AND we have actual content to summarize
    if smart_summaries and (result or task):
        # Build context for AI - include actual results if available
        if result:
            # We have actual results - summarize what was accomplished
            task_for_ai = f"Task: {task or 'Background task'}\n\nResult: {result}"
        else:
            task_for_ai = task

        message = generate_summary_via_gateway(
            task_description=task_for_ai,
            summary_type=args.type,
            agent_name=args.agent,
            user_name=user_name,
            provider=provider,
            model=model if model else None
        )

    # Fall back to provided message (prepend userName if not already present)
    if not message:
        fallback = args.fallback
        # Prepend name if fallback doesn't start with it
        if fallback and not fallback.startswith(user_name):
            message = f"{user_name}{fallback}" if fallback.startswith(",") else f"{user_name}, {fallback}"
        else:
            message = fallback

    # Speak the message
    speak(message, voice)


if __name__ == "__main__":
    main()
