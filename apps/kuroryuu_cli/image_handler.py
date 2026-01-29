"""Image handling utilities for vision/multimodal support.

Provides functions to detect image paths in user input, load images,
and convert them to base64-encoded data URLs for OpenAI vision API.
"""

from pathlib import Path
from typing import Tuple
import base64
import mimetypes
import re


# Supported image extensions
IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'}


def detect_image_paths(text: str) -> list[str]:
    """Detect image file paths in user input.

    Detects:
    - Absolute paths: E:\\images\\test.png
    - Relative paths: screenshots/test.png, ./test.jpg
    - Quoted paths: "my image.png"
    - Unquoted paths with spaces: myimage.png

    Args:
        text: User input text

    Returns:
        List of detected image paths (strings)
    """
    image_paths = []

    # Pattern 1: Quoted paths (handles spaces)
    # Matches: "path/to/image.png" or 'path/to/image.png'
    quoted_pattern = r'["\']([^"\']+\.(?:png|jpg|jpeg|gif|webp|bmp))["\']'
    for match in re.finditer(quoted_pattern, text, re.IGNORECASE):
        image_paths.append(match.group(1))

    # Pattern 2: Unquoted paths (no spaces)
    # Matches: path/to/image.png, ./image.jpg, E:\path\image.jpg, or C:\path\image.png
    unquoted_pattern = r'(?:^|[\s])((?:[A-Za-z]:[/\\])?(?:[^\s\'"]+[/\\])*[^\s\'"]+\.(?:png|jpg|jpeg|gif|webp|bmp))(?=[\s?!,;.]|$)'
    for match in re.finditer(unquoted_pattern, text, re.IGNORECASE):
        path = match.group(1)
        # Avoid duplicates from quoted matches
        if path not in image_paths:
            image_paths.append(path)

    return image_paths


def load_image_as_base64(path: Path) -> Tuple[str, str]:
    """Load image file and encode as base64.

    Args:
        path: Path to image file

    Returns:
        Tuple of (mime_type, base64_data)
        Example: ("image/png", "iVBORw0KGgoAAAA...")

    Raises:
        FileNotFoundError: If image doesn't exist
        IOError: If image can't be read
    """
    if not path.exists():
        raise FileNotFoundError(f"Image not found: {path}")

    # Read image bytes
    data = path.read_bytes()

    # Guess MIME type from extension
    mime_type = mimetypes.guess_type(str(path))[0]
    if not mime_type or not mime_type.startswith('image/'):
        # Fallback based on extension
        ext = path.suffix.lower()
        mime_map = {
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.bmp': 'image/bmp',
        }
        mime_type = mime_map.get(ext, 'image/png')

    # Encode to base64
    b64_data = base64.b64encode(data).decode('utf-8')

    return mime_type, b64_data


def create_image_content_block(image_path: Path) -> dict:
    """Create OpenAI-format image content block.

    Args:
        image_path: Path to image file

    Returns:
        Dict in OpenAI vision API format:
        {
            "type": "image_url",
            "image_url": {
                "url": "data:image/png;base64,..."
            }
        }

    Raises:
        FileNotFoundError: If image doesn't exist
        IOError: If image can't be read
    """
    mime_type, b64_data = load_image_as_base64(image_path)

    return {
        "type": "image_url",
        "image_url": {
            "url": f"data:{mime_type};base64,{b64_data}"
        }
    }


def is_image_file(path: str) -> bool:
    """Check if a path points to an image file based on extension.

    Args:
        path: File path as string

    Returns:
        True if path has a supported image extension
    """
    return Path(path).suffix.lower() in IMAGE_EXTENSIONS
