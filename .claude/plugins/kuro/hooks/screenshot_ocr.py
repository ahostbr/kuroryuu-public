#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""
Screenshot OCR hook for Claude Code.

Strategy (in order):
  1. Read LiteWatch screen_context.txt (instant, zero deps)
  2. Start LiteWatch if not running
  3. Fallback: ensure VLM via lms_switch.py, capture + LM Studio API

Follows Local Lens ecosystem patterns.
"""

import sys
import io
import json
import re
import os
import subprocess
from pathlib import Path
from datetime import datetime

# Fix Windows console encoding
if sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
if sys.stderr.encoding != "utf-8":
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

TRIGGER_PATTERN = re.compile(
    r"(?i)"
    r"(screenshot|screen\s*shot"
    r"|what.?s on.*(screen|display)"
    r"|capture.?screen|screen.?capture"
    r"|show.?screen|see my screen"
    r"|snap.?screen|look at.*screen"
    r"|ocr.*screen|screen.*ocr)"
)

# Paths — aligned with Local Lens ecosystem
HOME = Path(os.environ.get("USERPROFILE", os.path.expanduser("~")))
SKILLS_DIR = HOME / ".claude" / "skills" / "local-lens"
SCREEN_CONTEXT = Path(os.environ.get("LITEWATCH_CONTEXT", str(SKILLS_DIR / "screen_context.txt")))
LITEWATCH_BAT = Path(os.environ.get("LITEWATCH_BAT", str(SKILLS_DIR / "LiteWatch.bat")))
LMS_SWITCH = Path(os.environ.get("LMS_SWITCH", str(SKILLS_DIR / "lms_switch.py")))
LMS_CLI = HOME / ".lmstudio" / "bin" / "lms.exe"

# LM Studio API — use LAN IP per Local Lens convention
LM_STUDIO_URL = os.environ.get("LM_STUDIO_URL", "http://169.254.83.107:1234/v1/chat/completions")
MODEL = os.environ.get("SCREENSHOT_OCR_MODEL", "qwen3.5-0.8b")
STALE_THRESHOLD = int(os.environ.get("LITEWATCH_STALE_SECS", "120"))
ALWAYS_ON = os.environ.get("SCREENSHOT_ALWAYS", "") == "1"

# Logging
LOG_DIR = Path(os.environ.get("CLAUDE_PROJECT_DIR", ".")) / "ai" / "hooks"
LOG_FILE = LOG_DIR / "screenshot_ocr.log"


def log(msg: str):
    try:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"[{datetime.now().isoformat()}] {msg}\n")
    except Exception:
        pass


def get_prompt_from_stdin() -> str:
    """Read prompt from Claude Code hook stdin JSON."""
    try:
        raw = sys.stdin.read()
        if not raw:
            return ""
        hook_data = json.loads(raw)

        # Log stdin structure once for debugging
        debug_file = LOG_DIR / "screenshot_stdin_debug.json"
        if not debug_file.exists():
            LOG_DIR.mkdir(parents=True, exist_ok=True)
            with open(debug_file, "w", encoding="utf-8") as f:
                json.dump(hook_data, f, indent=2, default=str)

        prompt = (
            hook_data.get("prompt", "")
            or hook_data.get("userMessage", "")
            or hook_data.get("message", "")
            or hook_data.get("content", "")
        )
        if isinstance(prompt, list):
            return " ".join(p.get("text", "") for p in prompt if isinstance(p, dict))
        if isinstance(prompt, dict):
            return prompt.get("content", "") or prompt.get("text", "")
        return str(prompt) if prompt else ""
    except (json.JSONDecodeError, AttributeError, TypeError) as e:
        log(f"stdin parse error: {e}")
        return ""


def check_flag_file() -> bool:
    flag = Path(os.environ.get("CLAUDE_PROJECT_DIR", ".")) / "ai" / "hooks" / ".screenshot_request"
    if flag.exists():
        flag.unlink()
        return True
    return False


def should_trigger(prompt: str) -> bool:
    if ALWAYS_ON:
        return True
    if check_flag_file():
        return True
    if prompt and TRIGGER_PATTERN.search(prompt):
        return True
    return False


# ── Strategy 1: LiteWatch screen_context.txt ──

def read_litewatch_context() -> str | None:
    """Read the latest entry from LiteWatch's screen_context.txt."""
    if not SCREEN_CONTEXT.exists():
        return None

    age = datetime.now().timestamp() - SCREEN_CONTEXT.stat().st_mtime
    if age > STALE_THRESHOLD:
        log(f"screen_context.txt stale ({age:.0f}s > {STALE_THRESHOLD}s)")
        return None

    text = SCREEN_CONTEXT.read_text(encoding="utf-8", errors="replace")
    entries = re.split(r"^## ", text, flags=re.MULTILINE)
    if len(entries) < 2:
        return None

    # Skip error entries, take first valid
    for entry in entries[1:3]:
        entry = entry.strip()
        if "ERROR:" not in entry[:50]:
            return entry

    return None


# ── Strategy 2: Start LiteWatch ──

def ensure_litewatch_running():
    """Start LiteWatch if not already running."""
    if not LITEWATCH_BAT.exists():
        log(f"LiteWatch.bat not found: {LITEWATCH_BAT}")
        return False

    if SCREEN_CONTEXT.exists():
        age = datetime.now().timestamp() - SCREEN_CONTEXT.stat().st_mtime
        if age < STALE_THRESHOLD:
            return True  # Already running

    log("Starting LiteWatch...")
    try:
        subprocess.Popen(
            ["cmd", "/c", "start", "", str(LITEWATCH_BAT)],
            creationflags=0x00000008,  # DETACHED_PROCESS
        )
        return True
    except Exception as e:
        log(f"Failed to start LiteWatch: {e}")
        return False


# ── Strategy 3: Direct capture via LM Studio API ──

def ensure_vlm_loaded():
    """Ensure a VLM is loaded via lms_switch.py or lms CLI."""
    if LMS_SWITCH.exists():
        try:
            subprocess.run(
                [sys.executable, str(LMS_SWITCH), "ensure", MODEL],
                capture_output=True, timeout=30,
            )
            return
        except Exception as e:
            log(f"lms_switch ensure failed: {e}")

    # Fallback: raw lms CLI
    if LMS_CLI.exists():
        try:
            result = subprocess.run(
                [str(LMS_CLI), "ps"],
                capture_output=True, text=True, timeout=10,
            )
            if MODEL not in (result.stdout or ""):
                subprocess.run(
                    [str(LMS_CLI), "load", MODEL, "-y", "-c", "8192", "--gpu", "max"],
                    capture_output=True, timeout=60,
                )
        except Exception as e:
            log(f"lms CLI fallback failed: {e}")


def direct_capture_ocr() -> str:
    """Capture screen + send to LM Studio vision API."""
    import base64
    import urllib.request

    try:
        from PIL import Image, ImageGrab
    except ImportError:
        return "LiteWatch not running and PIL not available. Run /litewatch to start screen capture."

    # Ensure VLM is loaded
    ensure_vlm_loaded()

    # Capture + resize
    img = ImageGrab.grab()
    max_w = 1024
    if img.width > max_w:
        ratio = max_w / img.width
        img = img.resize((max_w, int(img.height * ratio)), Image.LANCZOS)

    buf = io.BytesIO()
    img.save(buf, format="PNG", optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")

    # Send to LM Studio (using urllib to avoid requests dependency)
    payload = json.dumps({
        "model": MODEL,
        "messages": [{
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{b64}"}},
                {"type": "text", "text": "Describe everything visible on this screen. Include all text, UI elements, and layout. Be concise."},
            ],
        }],
        "max_tokens": 500,
        "temperature": 0.1,
    }).encode()

    req = urllib.request.Request(
        LM_STUDIO_URL,
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    resp = json.loads(urllib.request.urlopen(req, timeout=60).read())
    return resp["choices"][0]["message"]["content"]


def main():
    log("Hook started")
    prompt = get_prompt_from_stdin()
    log(f"Prompt: {repr(prompt[:200]) if prompt else '(empty)'}")

    if not should_trigger(prompt):
        sys.exit(0)

    log("Triggered")

    # Strategy 1: LiteWatch context (instant)
    context = read_litewatch_context()
    if context:
        log(f"LiteWatch hit: {len(context)} chars")
        print(f"[SCREEN via LiteWatch] {context}")
        return

    # Strategy 2: Start LiteWatch for next time
    ensure_litewatch_running()

    # Strategy 3: Direct capture fallback
    log("Falling back to direct capture")
    try:
        text = direct_capture_ocr()
        log(f"Direct OCR: {len(text)} chars")
        print(f"[SCREEN OCR] {text}")
    except Exception as e:
        log(f"ERROR: {e}")
        print(f"[SCREEN OCR FAILED] {e}")


if __name__ == "__main__":
    main()
