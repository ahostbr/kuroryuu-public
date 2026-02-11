"""Video Service - Claude Code Video Toolkit Integration.

Interfaces with the cloned claude-code-video-toolkit repo for:
- Voiceover generation (ElevenLabs)
- Music generation
- Video rendering (Remotion)

Repository: tools/marketing/claude-code-video-toolkit/
"""

from __future__ import annotations

import asyncio
import logging
import pathlib
import json
from datetime import datetime
from typing import AsyncGenerator

logger = logging.getLogger("marketing.video")

# Resolve paths
PROJECT_ROOT = pathlib.Path(__file__).resolve().parents[3]
TOOLS_DIR = PROJECT_ROOT / "tools" / "marketing"
VIDEO_TOOLKIT_DIR = TOOLS_DIR / "claude-code-video-toolkit"
OUTPUT_DIR = TOOLS_DIR / "output"


# ---------------------------------------------------------------------------
# Voiceover generation
# ---------------------------------------------------------------------------

async def generate_voiceover(
    text: str,
    voice_id: str = "default",
) -> AsyncGenerator[str, None]:
    """Generate voiceover via ElevenLabs (via video toolkit).

    Yields SSE events:
    - {"type": "progress", "progress": 10, "message": "..."}
    - {"type": "complete", "path": "/path/to/audio.mp3", "metadata": {...}}
    - {"type": "error", "error": "..."}
    """
    if not VIDEO_TOOLKIT_DIR.exists():
        yield json.dumps({
            "type": "error",
            "error": f"claude-code-video-toolkit not found at {VIDEO_TOOLKIT_DIR}. Clone it first."
        })
        return

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    yield json.dumps({"type": "progress", "progress": 10, "message": "Initializing voiceover generation..."})

    try:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_filename = f"voiceover_{timestamp}.mp3"
        output_path = OUTPUT_DIR / output_filename

        # Adjust command based on actual toolkit structure
        cmd = [
            "python",
            str(VIDEO_TOOLKIT_DIR / "tools" / "voiceover.py"),  # Adjust path
            "--text", text,
            "--voice-id", voice_id,
            "--output", str(output_path),
        ]

        yield json.dumps({"type": "progress", "progress": 30, "message": "Calling ElevenLabs API..."})

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(VIDEO_TOOLKIT_DIR),
        )

        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "Voiceover generation failed"
            logger.error(f"Voiceover generation failed: {error_msg}")
            yield json.dumps({"type": "error", "error": error_msg})
            return

        yield json.dumps({"type": "progress", "progress": 90, "message": "Finalizing audio..."})

        if not output_path.exists():
            yield json.dumps({"type": "error", "error": f"Output file not created: {output_path}"})
            return

        yield json.dumps({
            "type": "complete",
            "path": str(output_path),
            "metadata": {
                "text": text,
                "voice_id": voice_id,
                "created_at": datetime.now().isoformat(),
            }
        })

    except Exception as e:
        logger.error(f"Voiceover generation error: {e}")
        yield json.dumps({"type": "error", "error": str(e)})


# ---------------------------------------------------------------------------
# Music generation
# ---------------------------------------------------------------------------

async def generate_music(
    prompt: str,
    duration: int = 30,
) -> AsyncGenerator[str, None]:
    """Generate music via video toolkit.

    Yields SSE events similar to voiceover.
    """
    if not VIDEO_TOOLKIT_DIR.exists():
        yield json.dumps({
            "type": "error",
            "error": f"claude-code-video-toolkit not found at {VIDEO_TOOLKIT_DIR}. Clone it first."
        })
        return

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    yield json.dumps({"type": "progress", "progress": 10, "message": "Initializing music generation..."})

    try:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_filename = f"music_{timestamp}.mp3"
        output_path = OUTPUT_DIR / output_filename

        cmd = [
            "python",
            str(VIDEO_TOOLKIT_DIR / "tools" / "music.py"),  # Adjust path
            "--prompt", prompt,
            "--duration", str(duration),
            "--output", str(output_path),
        ]

        yield json.dumps({"type": "progress", "progress": 30, "message": "Calling music generation API..."})

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(VIDEO_TOOLKIT_DIR),
        )

        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "Music generation failed"
            logger.error(f"Music generation failed: {error_msg}")
            yield json.dumps({"type": "error", "error": error_msg})
            return

        yield json.dumps({"type": "progress", "progress": 90, "message": "Finalizing music..."})

        if not output_path.exists():
            yield json.dumps({"type": "error", "error": f"Output file not created: {output_path}"})
            return

        yield json.dumps({
            "type": "complete",
            "path": str(output_path),
            "metadata": {
                "prompt": prompt,
                "duration": duration,
                "created_at": datetime.now().isoformat(),
            }
        })

    except Exception as e:
        logger.error(f"Music generation error: {e}")
        yield json.dumps({"type": "error", "error": str(e)})


# ---------------------------------------------------------------------------
# Video rendering
# ---------------------------------------------------------------------------

async def render_video(
    template: str = "default",
    props: dict = None,
) -> AsyncGenerator[str, None]:
    """Render video via Remotion (via video toolkit).

    Yields SSE events similar to voiceover.
    """
    if props is None:
        props = {}

    if not VIDEO_TOOLKIT_DIR.exists():
        yield json.dumps({
            "type": "error",
            "error": f"claude-code-video-toolkit not found at {VIDEO_TOOLKIT_DIR}. Clone it first."
        })
        return

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    yield json.dumps({"type": "progress", "progress": 10, "message": "Initializing video render..."})

    try:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_filename = f"video_{timestamp}.mp4"
        output_path = OUTPUT_DIR / output_filename

        # Write props to temp JSON
        props_path = OUTPUT_DIR / f"props_{timestamp}.json"
        with open(props_path, "w") as f:
            json.dump(props, f)

        cmd = [
            "python",
            str(VIDEO_TOOLKIT_DIR / "tools" / "render.py"),  # Adjust path
            "--template", template,
            "--props", str(props_path),
            "--output", str(output_path),
        ]

        yield json.dumps({"type": "progress", "progress": 30, "message": "Rendering video with Remotion..."})

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(VIDEO_TOOLKIT_DIR),
        )

        stdout, stderr = await process.communicate()

        # Cleanup temp props file
        props_path.unlink(missing_ok=True)

        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "Video rendering failed"
            logger.error(f"Video rendering failed: {error_msg}")
            yield json.dumps({"type": "error", "error": error_msg})
            return

        yield json.dumps({"type": "progress", "progress": 90, "message": "Finalizing video..."})

        if not output_path.exists():
            yield json.dumps({"type": "error", "error": f"Output file not created: {output_path}"})
            return

        yield json.dumps({
            "type": "complete",
            "path": str(output_path),
            "metadata": {
                "template": template,
                "props": props,
                "created_at": datetime.now().isoformat(),
            }
        })

    except Exception as e:
        logger.error(f"Video rendering error: {e}")
        yield json.dumps({"type": "error", "error": str(e)})


def is_installed() -> bool:
    """Check if claude-code-video-toolkit is installed."""
    return VIDEO_TOOLKIT_DIR.exists()
