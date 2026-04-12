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
# Direct LM Studio endpoint (fallback when gateway is down)
LMSTUDIO_URL = "http://169.254.83.107:1234/v1/chat/completions"


def get_settings():
    """Load kuroPlugin settings from .claude/settings.json (project or global fallback)"""
    # 0. Try CLAUDE_PROJECT_DIR first (most reliable for hooks)
    project_dir = os.environ.get("CLAUDE_PROJECT_DIR")
    if project_dir:
        settings_path = Path(project_dir) / ".claude" / "settings.json"
        if settings_path.exists():
            try:
                with open(settings_path, encoding="utf-8-sig") as f:
                    settings = json.load(f)
                    plugin = settings.get("kuroPlugin", {})
                    if plugin:
                        return plugin
            except Exception as e:
                print(f"[SmartTTS] Settings read error ({settings_path}): {e}", file=sys.stderr)

    # 1. Walk up from cwd looking for project-level settings
    current = Path.cwd()
    while current != current.parent:
        settings_path = current / ".claude" / "settings.json"
        if settings_path.exists():
            try:
                with open(settings_path, encoding="utf-8-sig") as f:
                    settings = json.load(f)
                    plugin = settings.get("kuroPlugin", {})
                    if plugin:  # Found project-level config with kuroPlugin
                        return plugin
            except Exception as e:
                print(f"[SmartTTS] Settings read error ({settings_path}): {e}", file=sys.stderr)
        current = current.parent

    # 2. Fallback: global ~/.claude/settings.json
    global_settings_path = Path.home() / ".claude" / "settings.json"
    if global_settings_path.exists():
        try:
            with open(global_settings_path, encoding="utf-8-sig") as f:
                settings = json.load(f)
                return settings.get("kuroPlugin", {})
        except Exception as e:
            print(f"[SmartTTS] Global settings read error: {e}", file=sys.stderr)

    return {}


def should_skip_global(source_arg=""):
    """Check if a local project instance will handle TTS (avoid double-fire).

    When running from global hooks (--source global or KURORYUU_TTS_SOURCE=global),
    check if CWD is in a project with local TTS hooks enabled.
    If so, skip - the local hooks will handle it.
    """
    source = source_arg or os.environ.get("KURORYUU_TTS_SOURCE", "")
    if source != "global":
        return False  # Not running from global hooks

    # Check if cwd is in a project that actually has TTS hook commands installed
    # (not just the preference flag — the flag means "user wants TTS" but the
    # commands may be absent when _teamTtsActive causes skipProjectTts)
    current = Path.cwd()
    while current != current.parent:
        settings_path = current / ".claude" / "settings.json"
        if settings_path.exists():
            try:
                with open(settings_path) as f:
                    settings = json.load(f)
                    hooks_config = settings.get("hooks", {})
                    for event in ("Stop", "SubagentStop", "Notification"):
                        for group in hooks_config.get(event, []):
                            for hook in group.get("hooks", []):
                                cmd = hook.get("command", "")
                                if "smart_tts.py" in cmd or "edge_tts.py" in cmd:
                                    return True  # TTS is actually in project hooks
            except Exception:
                pass
        current = current.parent
    return False


def _build_summary_prompt(task_description: str, summary_type: str, agent_name: str = None,
                          user_name: str = "Ryan") -> str:
    """Build the TTS summary prompt."""
    if summary_type == "stop":
        context = "A coding session has ended."
    elif summary_type == "subagent":
        context = f"A subagent ({agent_name or 'builder'}) completed a task."
    else:
        context = "The user's attention is needed."

    return f"""Generate a brief TTS announcement summarizing COMPLETED work.

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


def _call_lmstudio_direct(prompt: str, model: str = None) -> str:
    """Call LM Studio directly via OpenAI-compatible API. No gateway needed."""
    import requests

    payload = {
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "max_tokens": 100,
        "temperature": 0.7,
    }
    if model:
        payload["model"] = model

    response = requests.post(LMSTUDIO_URL, json=payload, timeout=15)
    if response.status_code == 200:
        data = response.json()
        if "choices" in data:
            return data["choices"][0]["message"]["content"].strip()
    else:
        print(f"[SmartTTS] LM Studio error {response.status_code}", file=sys.stderr)
    return None


def _call_gateway(prompt: str, provider: str, model: str = None) -> str:
    """Call Kuroryuu Gateway for summary generation."""
    import requests

    backend_map = {
        "gateway-auto": "gateway-auto",
        "lmstudio": "lmstudio",
        "cliproxy": "cliproxyapi",
        "claude": "claude"
    }
    payload = {
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "max_tokens": 100,
        "temperature": 0.7,
        "backend": backend_map.get(provider, "gateway-auto")
    }
    if model:
        payload["model"] = model

    response = requests.post(GATEWAY_URL, json=payload, timeout=10)
    if response.status_code == 200:
        data = response.json()
        if "content" in data:
            return data["content"].strip()
        elif "choices" in data:
            return data["choices"][0]["message"]["content"].strip()
    else:
        print(f"[SmartTTS] Gateway error {response.status_code}", file=sys.stderr)
    return None


def generate_summary_via_gateway(task_description: str, summary_type: str, agent_name: str = None,
                                  user_name: str = "Ryan", provider: str = "gateway-auto",
                                  model: str = None) -> str:
    """Generate an AI summary. Uses LM Studio direct when provider is 'lmstudio' (no gateway needed)."""
    try:
        prompt = _build_summary_prompt(task_description, summary_type, agent_name, user_name)

        # LM Studio: go direct — no gateway dependency
        if provider == "lmstudio":
            print(f"[SmartTTS] Using LM Studio direct ({LMSTUDIO_URL})", file=sys.stderr)
            result = _call_lmstudio_direct(prompt, model)
            if result:
                return result
            # If LM Studio is down, try gateway as last resort
            print("[SmartTTS] LM Studio direct failed, trying gateway fallback", file=sys.stderr)
            return _call_gateway(prompt, provider, model)

        # All other providers: use gateway, fall back to LM Studio direct
        result = _call_gateway(prompt, provider, model)
        if result:
            return result
        print("[SmartTTS] Gateway failed, trying LM Studio direct fallback", file=sys.stderr)
        return _call_lmstudio_direct(prompt, model)

    except Exception as e:
        print(f"[SmartTTS] Summary failed: {e}", file=sys.stderr)
        return None


def get_uv_path():
    """Get UV executable path dynamically."""
    import os
    if os.environ.get('UV_PATH'):
        return os.environ['UV_PATH']
    if sys.platform == 'win32':
        return os.path.join(os.path.expanduser('~'), '.local', 'bin', 'uv.exe')
    return 'uv'


def speak(text: str, voice: str = "en-GB-SoniaNeural"):
    """Generate and play TTS audio."""
    # Import TTS queue for serialization
    try:
        from pathlib import Path
        queue_path = Path(__file__).parent / 'utils' / 'tts' / 'tts_queue.py'
        if queue_path.exists():
            import importlib.util
            spec = importlib.util.spec_from_file_location("tts_queue", queue_path)
            tts_queue = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(tts_queue)
            use_queue = True
        else:
            use_queue = False
    except Exception:
        use_queue = False

    agent_id = f"smart_tts_{os.getpid()}"

    # Acquire TTS lock to prevent overlapping audio
    if use_queue:
        if not tts_queue.acquire_tts_lock(agent_id, timeout=25):
            print(f"[SmartTTS] Queue busy after 25s - skipping TTS", file=sys.stderr)
            return False  # Skip entirely - don't play over existing audio

    try:
        return _speak_internal(text, voice)
    finally:
        if use_queue:
            tts_queue.release_tts_lock(agent_id)


def _speak_internal(text: str, voice: str = "en-GB-SoniaNeural"):
    """Internal TTS implementation."""
    try:
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
            tmp_path = tmp.name

        try:
            uv_path = get_uv_path()

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
            Start-Sleep -Milliseconds 800
            $player.Play()
            $duration = $player.NaturalDuration
            if (-not $duration.HasTimeSpan) {{
                Start-Sleep -Milliseconds 500
                $duration = $player.NaturalDuration
            }}
            if ($duration.HasTimeSpan) {{
                $ms = $duration.TimeSpan.TotalMilliseconds + 500
                Start-Sleep -Milliseconds $ms
            }} else {{
                # No duration info — use position polling instead of fixed sleep
                $lastPos = -1
                $staleCount = 0
                $maxPolls = 120
                $polls = 0
                # Wait for playback to start
                Start-Sleep -Milliseconds 500
                while ($staleCount -lt 3 -and $polls -lt $maxPolls) {{
                    Start-Sleep -Milliseconds 500
                    $curPos = $player.Position.TotalMilliseconds
                    if ($curPos -le $lastPos) {{
                        $staleCount++
                    }} else {{
                        $staleCount = 0
                    }}
                    $lastPos = $curPos
                    $polls++
                }}
            }}
            $player.Close()
            '''
            subprocess.run(
                ["powershell.exe", "-NoProfile", "-Command", ps_cmd],
                capture_output=True,
                timeout=60
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


def speak_elevenlabs(text: str, voice_id: str, api_key: str,
                     model_id: str = "eleven_turbo_v2_5",
                     stability: float = 0.5, similarity_boost: float = 0.75):
    """Generate and play TTS audio using ElevenLabs REST API."""
    # Import TTS queue for serialization
    try:
        queue_path = Path(__file__).parent / 'utils' / 'tts' / 'tts_queue.py'
        if queue_path.exists():
            import importlib.util
            spec = importlib.util.spec_from_file_location("tts_queue", queue_path)
            tts_queue = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(tts_queue)
            use_queue = True
        else:
            use_queue = False
    except Exception:
        use_queue = False

    agent_id = f"elevenlabs_tts_{os.getpid()}"

    if use_queue:
        if not tts_queue.acquire_tts_lock(agent_id, timeout=25):
            print("[SmartTTS/ElevenLabs] Queue busy after 25s - skipping TTS", file=sys.stderr)
            return False

    try:
        return _speak_elevenlabs_internal(text, voice_id, api_key, model_id, stability, similarity_boost)
    finally:
        if use_queue:
            tts_queue.release_tts_lock(agent_id)


def _speak_elevenlabs_internal(text: str, voice_id: str, api_key: str,
                               model_id: str, stability: float, similarity_boost: float):
    """Internal ElevenLabs TTS implementation using REST API + PowerShell playback."""
    import requests

    try:
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
            tmp_path = tmp.name

        try:
            # Call ElevenLabs text-to-speech API
            url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
            headers = {
                "Accept": "audio/mpeg",
                "Content-Type": "application/json",
                "xi-api-key": api_key,
            }
            payload = {
                "text": text,
                "model_id": model_id,
                "voice_settings": {
                    "stability": stability,
                    "similarity_boost": similarity_boost,
                }
            }

            response = requests.post(url, json=payload, headers=headers, timeout=30)

            if response.status_code != 200:
                print(f"[SmartTTS/ElevenLabs] API error {response.status_code}: {response.text[:200]}", file=sys.stderr)
                return False

            # Write audio to temp file
            with open(tmp_path, 'wb') as f:
                f.write(response.content)

            # Play using PowerShell MediaPlayer (same pattern as edge_tts)
            ps_cmd = f'''
            Add-Type -AssemblyName presentationCore
            $player = New-Object System.Windows.Media.MediaPlayer
            $player.Open("{tmp_path}")
            Start-Sleep -Milliseconds 800
            $player.Play()
            $duration = $player.NaturalDuration
            if (-not $duration.HasTimeSpan) {{
                Start-Sleep -Milliseconds 500
                $duration = $player.NaturalDuration
            }}
            if ($duration.HasTimeSpan) {{
                $ms = $duration.TimeSpan.TotalMilliseconds + 500
                Start-Sleep -Milliseconds $ms
            }} else {{
                $lastPos = -1
                $staleCount = 0
                $maxPolls = 120
                $polls = 0
                Start-Sleep -Milliseconds 500
                while ($staleCount -lt 3 -and $polls -lt $maxPolls) {{
                    Start-Sleep -Milliseconds 500
                    $curPos = $player.Position.TotalMilliseconds
                    if ($curPos -le $lastPos) {{
                        $staleCount++
                    }} else {{
                        $staleCount = 0
                    }}
                    $lastPos = $curPos
                    $polls++
                }}
            }}
            $player.Close()
            '''
            subprocess.run(
                ["powershell.exe", "-NoProfile", "-Command", ps_cmd],
                capture_output=True,
                timeout=60
            )

            print(f"[SmartTTS/ElevenLabs] Announced: {text}")
            return True

        finally:
            try:
                os.unlink(tmp_path)
            except:
                pass

    except Exception as e:
        print(f"[SmartTTS/ElevenLabs] Error: {e}", file=sys.stderr)
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
    parser.add_argument("--source", default="", help="Hook source (global/project) for double-fire prevention")
    args = parser.parse_args()

    # Guard: skip if running from global hooks and local hooks are enabled
    _debug_path = Path(os.environ.get("CLAUDE_PROJECT_DIR", ".")) / "ai" / "hooks" / "smart_tts_debug.log"
    try:
        import datetime as _dt
        with open(_debug_path, "a", encoding="utf-8") as _dbg:
            _dbg.write(f"\n--- {_dt.datetime.now().isoformat()} ENTRY type={args.type} source={repr(args.source)} ---\n")
    except Exception:
        pass

    if should_skip_global(args.source):
        try:
            with open(_debug_path, "a", encoding="utf-8") as _dbg:
                _dbg.write(f"  SKIPPED (global, local hooks exist)\n")
        except Exception:
            pass
        sys.exit(0)

    # Load settings
    settings = get_settings()
    tts_config = settings.get("tts", {})  # TTS settings are nested under "tts" key
    smart_summaries = tts_config.get("smartSummaries", False)
    user_name = tts_config.get("userName", "Your Name")
    # Settings voice takes priority over CLI arg (CLI arg is baked at save time
    # and may be stale if user changed voice without restarting Claude Code)
    voice = tts_config.get("voice") or args.voice or "en-GB-SoniaNeural"
    provider = args.provider or tts_config.get("summaryProvider", "lmstudio")
    model = args.model or tts_config.get("summaryModel", "")

    message = None

    # Try to get task and result from stdin (Claude Code hook context)
    task = args.task
    result = None
    stdin_context = read_stdin_context()

    # Debug: log what we received (helps diagnose hook data issues)
    debug_path = Path(os.environ.get("CLAUDE_PROJECT_DIR", ".")) / "ai" / "hooks" / "smart_tts_debug.log"
    try:
        with open(debug_path, "a", encoding="utf-8") as dbg:
            import datetime
            dbg.write(f"\n=== {datetime.datetime.now().isoformat()} type={args.type} ===\n")
            dbg.write(f"  cwd: {Path.cwd()}\n")
            dbg.write(f"  CLAUDE_PROJECT_DIR: {os.environ.get('CLAUDE_PROJECT_DIR', 'NOT SET')}\n")
            dbg.write(f"  settings_keys: {list(settings.keys()) if settings else 'EMPTY'}\n")
            dbg.write(f"  user_name: {repr(user_name)}\n")
            dbg.write(f"  smart_summaries: {smart_summaries}\n")
            dbg.write(f"  args.task: {repr(args.task)}\n")
            dbg.write(f"  stdin_context keys: {list(stdin_context.keys()) if stdin_context else 'None'}\n")
            if stdin_context:
                # Log available fields (truncate large values)
                for k, v in stdin_context.items():
                    val_str = str(v)[:200] if v else 'None'
                    dbg.write(f"  stdin.{k}: {val_str}\n")
    except Exception:
        pass

    if stdin_context:
        # Try last_assistant_message first (newer Claude Code versions provide this directly)
        last_msg = stdin_context.get("last_assistant_message")
        if last_msg and isinstance(last_msg, str) and len(last_msg.strip()) > 5:
            result = last_msg.strip()[:500]

        # SubagentStop: read task AND result from agent transcript file (fallback)
        if not result:
            transcript_path = stdin_context.get("agent_transcript_path")
            if transcript_path:
                task, result = get_task_and_result_from_transcript(transcript_path)

    # Check if task description is valid (not empty, not unexpanded variable)
    if not task or task.startswith('$') or task.strip() == '' or task == 'null':
        task = None

    # Debug: log decision state
    try:
        with open(debug_path, "a", encoding="utf-8") as dbg:
            dbg.write(f"  DECISION: smart_summaries={smart_summaries}, task={repr(task)[:100]}, result={repr(result)[:100]}\n")
            dbg.write(f"  GATE: {'PASS' if smart_summaries and (result or task) else 'FAIL'}\n")
    except Exception:
        pass

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

    # Enforce userName prefix on AI-generated messages
    if message and user_name and user_name != "Your Name":
        if not message.startswith(user_name):
            # Strip any "Ryan, " prefix the AI may have used instead of full userName
            stripped = message
            if stripped.lower().startswith("ryan,"):
                stripped = stripped[5:].lstrip()
            elif stripped.lower().startswith("ryan "):
                stripped = stripped[4:].lstrip()
            message = f"{user_name}, {stripped}"

    # Fall back to provided message (prepend userName if not already present)
    if not message:
        fallback = args.fallback
        # Prepend name if fallback doesn't start with it
        if fallback and not fallback.startswith(user_name):
            message = f"{user_name}{fallback}" if fallback.startswith(",") else f"{user_name}, {fallback}"
        else:
            message = fallback

    # Debug: log final message
    try:
        with open(debug_path, "a", encoding="utf-8") as dbg:
            dbg.write(f"  FINAL_MESSAGE: {repr(message)[:200]}\n")
    except Exception:
        pass

    # Route to the correct TTS provider
    tts_provider = tts_config.get("provider", "edge_tts")

    if tts_provider == "elevenlabs":
        el_api_key = tts_config.get("elevenlabsApiKey", "")
        if not el_api_key:
            print("[SmartTTS] No ElevenLabs API key configured, falling back to edge_tts", file=sys.stderr)
            speak(message, voice)
        else:
            el_model = tts_config.get("elevenlabsModelId", "eleven_turbo_v2_5")
            el_stability = tts_config.get("elevenlabsStability", 0.5)
            el_similarity = tts_config.get("elevenlabsSimilarity", 0.75)
            speak_elevenlabs(message, voice, el_api_key, el_model, el_stability, el_similarity)
    else:
        # Default: edge_tts (also handles pyttsx3, openai fallback)
        speak(message, voice)


if __name__ == "__main__":
    main()
