"""Text-to-speech tool for agent-initiated speech.

Gives agents voice agency — call k_tts(action='speak', text='...') anytime
to speak to Ryan via Edge TTS (Sonia voice), using the existing TTS queue
to prevent audio overlap.

Routed tool: k_tts(action, text, ...)
Actions: speak (direct), smart (AI-summarized first)
"""

from __future__ import annotations

import importlib.util
import logging
import os
import subprocess
import sys
import tempfile
import threading
from typing import Any, Dict

try:
    from .paths import get_project_root
except ImportError:
    from paths import get_project_root

logger = logging.getLogger("kuroryuu.mcp_core.k_tts")

# Fixed voice — no param, per Ryan's decision
VOICE = "en-GB-SoniaNeural"

# Gateway endpoint for AI summaries
GATEWAY_URL = "http://127.0.0.1:8200/v1/chat/proxy"


# ============================================================================
# Helpers
# ============================================================================

def _get_uv_path() -> str:
    """Get UV executable path dynamically."""
    if os.environ.get("UV_PATH"):
        return os.environ["UV_PATH"]
    if sys.platform == "win32":
        return os.path.join(os.path.expanduser("~"), ".local", "bin", "uv.exe")
    return "uv"


def _load_tts_queue():
    """Dynamically load tts_queue.py from the hooks utils directory.

    Returns the module or None if unavailable.
    """
    queue_path = (
        get_project_root()
        / ".claude"
        / "plugins"
        / "kuro"
        / "hooks"
        / "utils"
        / "tts"
        / "tts_queue.py"
    )
    if not queue_path.exists():
        logger.warning(f"TTS queue not found at {queue_path}")
        return None
    try:
        spec = importlib.util.spec_from_file_location("tts_queue", str(queue_path))
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        return mod
    except Exception as e:
        logger.error(f"Failed to load tts_queue: {e}")
        return None


def _generate_summary(text: str, context: str = "") -> str | None:
    """Generate a ~20-word AI summary via Gateway chat proxy.

    Returns summary string on success, None on failure.
    """
    import requests

    context_line = f"\nContext: {context}" if context else ""
    prompt = f"""Generate a brief TTS announcement summarizing the following.

{text}{context_line}

Requirements:
- ALWAYS start with "Ryan, " (name followed by comma)
- Under 20 words total
- Summarize the SPECIFIC content — mention key details
- Use past tense if describing completed work
- Be specific, not generic
- Return ONLY the announcement text, no quotes"""

    payload = {
        "messages": [{"role": "user", "content": prompt}],
        "stream": False,
        "max_tokens": 100,
        "temperature": 0.7,
        "backend": "gateway-auto",
    }

    try:
        resp = requests.post(GATEWAY_URL, json=payload, timeout=15)
        if resp.status_code == 200:
            data = resp.json()
            # Gateway returns content directly, fallback to OpenAI format
            if "content" in data:
                return data["content"].strip()
            elif "choices" in data:
                return data["choices"][0]["message"]["content"].strip()
            else:
                logger.warning(f"Unexpected Gateway response format: {data}")
                return None
        else:
            logger.warning(f"Gateway error {resp.status_code}: {resp.text[:200]}")
            return None
    except Exception as e:
        logger.warning(f"Summary generation failed: {e}")
        return None


def _speak_internal(text: str, timeout: int = 60) -> bool:
    """Generate MP3 via edge-tts and play via PowerShell MediaPlayer.

    Acquires TTS queue lock, generates audio, plays, cleans up.
    Returns True on success.
    """
    tts_queue = _load_tts_queue()
    agent_id = f"k_tts_{os.getpid()}_{threading.current_thread().ident}"

    # Acquire TTS lock
    if tts_queue:
        if not tts_queue.acquire_tts_lock(agent_id, timeout=25):
            logger.warning("TTS queue busy after 25s — skipping")
            return False

    try:
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
            tmp_path = tmp.name

        try:
            uv = _get_uv_path()

            # Generate audio
            result = subprocess.run(
                [uv, "run", "--with", "edge-tts", "edge-tts",
                 "--voice", VOICE, "--text", text, "--write-media", tmp_path],
                capture_output=True,
                text=True,
                timeout=30,
            )

            if result.returncode != 0:
                logger.error(f"edge-tts generation failed: {result.stderr[:300]}")
                return False

            # Play via PowerShell MediaPlayer (battle-tested Phase 15 pattern)
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
                # No duration info — position polling fallback
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
                timeout=timeout,
            )

            logger.info(f"Spoke: {text[:80]}")
            return True

        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass

    except Exception as e:
        logger.error(f"TTS playback error: {e}")
        return False
    finally:
        if tts_queue:
            tts_queue.release_tts_lock(agent_id)


def _tts_thread(text: str, timeout: int = 60) -> None:
    """Background thread wrapper for _speak_internal."""
    try:
        _speak_internal(text, timeout=timeout)
    except Exception as e:
        logger.error(f"TTS thread error: {e}")


# ============================================================================
# Action handlers
# ============================================================================

def _action_speak(text: str = "", wait: bool = False, timeout: int = 60, **kwargs: Any) -> Dict[str, Any]:
    """Speak text directly via Edge TTS."""
    if not text or not text.strip():
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "'text' is required (the text to speak)",
        }

    text = text.strip()

    if wait:
        success = _speak_internal(text, timeout=timeout)
        return {
            "ok": success,
            "action": "speak",
            "message": "Finished speaking." if success else "Playback failed.",
            "text": text[:100],
        }
    else:
        t = threading.Thread(target=_tts_thread, args=(text, timeout), daemon=True)
        t.start()
        return {
            "ok": True,
            "action": "speak",
            "message": "Speaking...",
            "text": text[:100],
        }


def _action_smart(
    text: str = "",
    context: str = "",
    wait: bool = False,
    timeout: int = 60,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Generate AI summary of text, then speak it."""
    if not text or not text.strip():
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "'text' is required (raw content to summarize and speak)",
        }

    text = text.strip()

    # Generate summary via Gateway
    summary = _generate_summary(text, context)

    if not summary:
        # Fallback: speak first sentence of text directly
        fallback = text.split(".")[0].strip()
        if not fallback:
            fallback = text[:100]
        logger.info(f"Smart summary failed, falling back to: {fallback[:60]}")
        summary = fallback

    if wait:
        success = _speak_internal(summary, timeout=timeout)
        return {
            "ok": success,
            "action": "smart",
            "message": "Finished speaking summary." if success else "Playback failed.",
            "summary": summary,
            "original": text[:100],
        }
    else:
        t = threading.Thread(target=_tts_thread, args=(summary, timeout), daemon=True)
        t.start()
        return {
            "ok": True,
            "action": "smart",
            "message": "Speaking summary...",
            "summary": summary,
            "original": text[:100],
        }


# ============================================================================
# Routed tool
# ============================================================================

ACTION_HANDLERS = {
    "speak": _action_speak,
    "smart": _action_smart,
}


def k_tts(
    action: str,
    text: str = "",
    context: str = "",
    wait: bool = False,
    timeout: int = 60,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Kuroryuu Text-to-Speech — speak text aloud via Edge TTS.

    Routed tool with actions: speak, smart

    Args:
        action: Action to perform (required)
            - speak: Speak text directly
            - smart: AI-summarize text first, then speak
        text: Text to speak (required for both actions)
        context: Extra framing for smart summaries (optional)
        wait: If True, block until playback finishes (default False)
        timeout: Playback timeout in seconds (default 60, increase for long text)

    Returns:
        {ok, action, message, ...} response dict
    """
    act = (action or "").strip().lower()

    if not act:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "action is required. Use 'speak' or 'smart'.",
            "details": {"available_actions": list(ACTION_HANDLERS.keys())},
        }

    handler = ACTION_HANDLERS.get(act)
    if not handler:
        return {
            "ok": False,
            "error_code": "UNKNOWN_ACTION",
            "message": f"Unknown action: {act}",
            "details": {"available_actions": list(ACTION_HANDLERS.keys())},
        }

    return handler(text=text, context=context, wait=wait, timeout=timeout, **kwargs)


# ============================================================================
# Tool registration
# ============================================================================

def register_tts_tools(registry: "ToolRegistry") -> None:
    """Register k_tts routed tool with the registry."""

    registry.register(
        name="k_tts",
        description="Speak text aloud via Edge TTS. Actions: speak (direct), smart (AI-summarized first). Fire-and-forget by default.",
        input_schema={
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": ["speak", "smart"],
                    "description": "Action: 'speak' for direct TTS, 'smart' for AI-summarized TTS",
                },
                "text": {
                    "type": "string",
                    "description": "Text to speak (speak) or raw content to summarize (smart)",
                },
                "context": {
                    "type": "string",
                    "description": "Extra framing for smart summaries (e.g. 'Code review session')",
                },
                "wait": {
                    "type": "boolean",
                    "default": False,
                    "description": "If true, block until playback finishes. Default: false (fire-and-forget)",
                },
                "timeout": {
                    "type": "integer",
                    "default": 60,
                    "description": "Playback timeout in seconds. Increase for long text (e.g. 120-180). Default: 60",
                },
            },
            "required": ["action", "text"],
        },
        handler=k_tts,
    )
