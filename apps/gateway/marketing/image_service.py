"""Image Service - Google Image Generation.

Interfaces with the cloned google-image-gen-api-starter repo to generate images.

Repository: tools/marketing/google-image-gen-api-starter/
"""

from __future__ import annotations

import asyncio
import logging
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

    # Ensure output directory exists
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Progress events
    yield json.dumps({"type": "progress", "progress": 10, "message": "Initializing image generation..."})

    try:
        # Build command (assuming the repo has a Python CLI)
        # Adjust this based on actual repo structure
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        output_filename = f"image_{timestamp}.png"
        output_path = OUTPUT_DIR / output_filename

        cmd = [
            "python",
            str(IMAGE_GEN_DIR / "generate.py"),  # Adjust based on actual entry point
            "--prompt", prompt,
            "--style", style,
            "--aspect-ratio", aspect_ratio,
            "--output", str(output_path),
        ]

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
            yield json.dumps({
                "type": "error",
                "error": f"Output file not created: {output_path}"
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
    return IMAGE_GEN_DIR.exists() and (IMAGE_GEN_DIR / "generate.py").exists()
