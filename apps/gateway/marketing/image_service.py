"""Image Service - Google Image Generation.

Interfaces with the cloned google-image-gen-api-starter repo to generate images.

Repository: tools/marketing/google-image-gen-api-starter/
"""

from __future__ import annotations

import asyncio
import logging
import os
import pathlib
import json
from datetime import datetime
from typing import AsyncGenerator

logger = logging.getLogger("marketing.image")

# Resolve paths
PROJECT_ROOT = pathlib.Path(__file__).resolve().parents[3]
TOOLS_DIR = PROJECT_ROOT / "tools" / "marketing"
IMAGE_GEN_DIR = TOOLS_DIR / "google-image-gen-api-starter"
OUTPUT_DIR = TOOLS_DIR / "output"


# ---------------------------------------------------------------------------
# Image generation
# ---------------------------------------------------------------------------

async def generate_image(
    prompt: str,
    style: str = "photorealistic",
    aspect_ratio: str = "16:9",
) -> AsyncGenerator[str, None]:
    """Generate image via google-image-gen-api-starter.

    Yields SSE events:
    - {"type": "progress", "progress": 10, "message": "..."}
    - {"type": "complete", "path": "/path/to/image.png", "metadata": {...}}
    - {"type": "error", "error": "..."}

    Args:
        prompt: Image generation prompt
        style: Visual style preset
        aspect_ratio: Aspect ratio (16:9, 1:1, 9:16)
    """
    # Check if tool is installed
    if not IMAGE_GEN_DIR.exists():
        yield json.dumps({
            "type": "error",
            "error": f"google-image-gen-api-starter not found at {IMAGE_GEN_DIR}. Clone it first."
        })
        return

    # Check for API key (.env file or environment)
    env_file = IMAGE_GEN_DIR / ".env"
    has_env_key = env_file.exists()
    has_os_key = bool(os.environ.get("GOOGLE_AI_API_KEY"))
    if not has_env_key and not has_os_key:
        yield json.dumps({
            "type": "error",
            "error": (
                "GOOGLE_AI_API_KEY not configured. "
                "Create tools/marketing/google-image-gen-api-starter/.env with: "
                "GOOGLE_AI_API_KEY=your_key_here  "
                "(Get key from https://aistudio.google.com/apikey)"
            ),
        })
        return

    # Ensure output directory exists
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Progress events
    yield json.dumps({"type": "progress", "progress": 10, "message": "Initializing image generation..."})

    try:
        # google-image-gen-api-starter CLI:
        #   uv run python main.py <output> <prompt> [--style <file>] [--aspect <ratio>]
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_filename = f"image_{timestamp}.png"
        output_path = OUTPUT_DIR / output_filename

        cmd = [
            "uv", "run", "python",
            str(IMAGE_GEN_DIR / "main.py"),
            str(output_path),
            prompt,
        ]

        # Add style template if not default
        if style and style != "photorealistic":
            style_file = IMAGE_GEN_DIR / "styles" / f"{style}.md"
            if style_file.exists():
                cmd.extend(["--style", str(style_file)])

        # Add aspect ratio
        if aspect_ratio:
            cmd.extend(["--aspect", aspect_ratio])

        yield json.dumps({"type": "progress", "progress": 30, "message": "Calling image generation API..."})

        # Run subprocess
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=str(IMAGE_GEN_DIR),
        )

        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "Image generation failed"
            logger.error(f"Image generation failed: {error_msg}")
            yield json.dumps({"type": "error", "error": error_msg})
            return

        yield json.dumps({"type": "progress", "progress": 90, "message": "Finalizing image..."})

        # Check if output file exists
        if not output_path.exists():
            # Include stdout — main.py prints errors but exits 0
            stdout_msg = stdout.decode().strip() if stdout else ""
            yield json.dumps({
                "type": "error",
                "error": f"Output file not created. Tool output: {stdout_msg}" if stdout_msg
                    else f"Output file not created: {output_path}",
            })
            return

        # Success
        yield json.dumps({
            "type": "complete",
            "path": str(output_path),
            "metadata": {
                "prompt": prompt,
                "style": style,
                "aspect_ratio": aspect_ratio,
                "created_at": datetime.now().isoformat(),
            }
        })

    except Exception as e:
        logger.error(f"Image generation error: {e}")
        yield json.dumps({"type": "error", "error": str(e)})


def is_installed() -> bool:
    """Check if google-image-gen-api-starter is installed."""
    return IMAGE_GEN_DIR.exists() and (IMAGE_GEN_DIR / "main.py").exists()
