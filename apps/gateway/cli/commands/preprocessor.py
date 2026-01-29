"""
Input Preprocessor

Handles @file references, !`shell` commands, and $N placeholders.
Inspired by OpenCode's file reference pattern.
"""

import re
import subprocess
import asyncio
from pathlib import Path
from typing import List, Dict, Tuple, Optional
import logging

logger = logging.getLogger(__name__)

# File reference pattern: @path/to/file.ext or @./relative/path
# Excludes: emails (word char before @), backtick-quoted references
FILE_REGEX = re.compile(r'(?<![\w`])@(\.?[^\s`,.;:!?\'"()\[\]{}]*(?:\.[^\s`,.;:!?\'"()\[\]{}]+)*)')

# Shell command pattern: !`command here`
SHELL_REGEX = re.compile(r'!`([^`]+)`')

# Argument placeholder pattern: $1, $2, $ARGUMENTS
ARG_REGEX = re.compile(r'\$(\d+|ARGUMENTS)')


async def preprocess_input(
    text: str,
    cwd: Path,
    resolve_files: bool = True,
    execute_shell: bool = True,
    shell_timeout: float = 30.0
) -> Tuple[str, List[Dict]]:
    """
    Process @file references and !`shell` commands in user input.

    Args:
        text: User input text
        cwd: Current working directory for resolving paths
        resolve_files: Whether to resolve @file references
        execute_shell: Whether to execute !`shell` commands
        shell_timeout: Timeout for shell commands in seconds

    Returns:
        Tuple of (processed_text, file_parts)
        - processed_text: Text with shell outputs inlined
        - file_parts: List of {"path": str, "content": str} for files
    """
    file_parts = []
    processed_text = text

    # Resolve @file references
    if resolve_files:
        file_parts = await _resolve_file_references(text, cwd)

    # Execute !`shell` commands
    if execute_shell:
        processed_text = await _execute_shell_commands(text, cwd, shell_timeout)

    return processed_text, file_parts


async def _resolve_file_references(text: str, cwd: Path) -> List[Dict]:
    """
    Find and resolve all @file references in text.

    Returns list of {"path": str, "content": str, "type": "file"|"directory"}
    """
    file_parts = []
    seen_paths = set()

    for match in FILE_REGEX.finditer(text):
        path_str = match.group(1)

        # Skip empty matches
        if not path_str:
            continue

        # Skip if already processed
        if path_str in seen_paths:
            continue
        seen_paths.add(path_str)

        # Resolve path
        try:
            resolved = _resolve_path(path_str, cwd)

            if resolved.is_file():
                content = await _read_file_async(resolved)
                file_parts.append({
                    "path": path_str,
                    "resolved_path": str(resolved),
                    "content": content,
                    "type": "file"
                })
                logger.debug(f"Resolved file: @{path_str} -> {resolved}")

            elif resolved.is_dir():
                listing = _list_directory(resolved)
                file_parts.append({
                    "path": path_str,
                    "resolved_path": str(resolved),
                    "content": listing,
                    "type": "directory"
                })
                logger.debug(f"Resolved directory: @{path_str} -> {resolved}")

            else:
                logger.warning(f"Path not found: @{path_str}")

        except Exception as e:
            logger.warning(f"Error resolving @{path_str}: {e}")

    return file_parts


def _resolve_path(path_str: str, cwd: Path) -> Path:
    """Resolve a path string to an absolute Path."""
    # Handle home directory
    if path_str.startswith("~/"):
        return Path.home() / path_str[2:]

    # Handle relative paths
    path = Path(path_str)
    if not path.is_absolute():
        path = cwd / path

    return path.resolve()


async def _read_file_async(path: Path, max_size: int = 1_000_000) -> str:
    """Read file content asynchronously with size limit."""
    def read_sync():
        size = path.stat().st_size
        if size > max_size:
            return f"[File too large: {size:,} bytes, max {max_size:,}]"

        try:
            return path.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            return f"[Binary file: {path.suffix or 'unknown type'}]"

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, read_sync)


def _list_directory(path: Path, max_items: int = 100) -> str:
    """List directory contents."""
    items = []
    try:
        for i, item in enumerate(sorted(path.iterdir())):
            if i >= max_items:
                items.append(f"... and {len(list(path.iterdir())) - max_items} more")
                break

            suffix = "/" if item.is_dir() else ""
            items.append(f"  {item.name}{suffix}")

    except PermissionError:
        return "[Permission denied]"

    header = f"Directory: {path}\n"
    return header + "\n".join(items)


async def _execute_shell_commands(
    text: str,
    cwd: Path,
    timeout: float
) -> str:
    """
    Execute !`shell` commands and inline their output.

    Returns text with shell commands replaced by their output.
    """
    result = text

    for match in SHELL_REGEX.finditer(text):
        cmd = match.group(1)
        full_match = match.group(0)

        try:
            output = await _run_shell_async(cmd, cwd, timeout)
            # Format as code block
            replacement = f"```\n$ {cmd}\n{output}```"
            result = result.replace(full_match, replacement)
            logger.debug(f"Executed shell: {cmd[:50]}...")

        except asyncio.TimeoutError:
            result = result.replace(full_match, f"```\n$ {cmd}\n[Timeout after {timeout}s]\n```")
            logger.warning(f"Shell command timed out: {cmd}")

        except Exception as e:
            result = result.replace(full_match, f"```\n$ {cmd}\n[Error: {e}]\n```")
            logger.warning(f"Shell command failed: {cmd} - {e}")

    return result


async def _run_shell_async(
    cmd: str,
    cwd: Path,
    timeout: float
) -> str:
    """Run a shell command asynchronously."""
    proc = await asyncio.create_subprocess_shell(
        cmd,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
        cwd=str(cwd)
    )

    try:
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(),
            timeout=timeout
        )
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        raise

    output = stdout.decode("utf-8", errors="replace")
    if stderr:
        error_output = stderr.decode("utf-8", errors="replace")
        if error_output.strip():
            output += f"\n[stderr]\n{error_output}"

    return output.strip()


def substitute_arguments(
    template: str,
    args: List[str],
    full_args: str = ""
) -> str:
    """
    Substitute $1, $2, $ARGUMENTS placeholders in a template.

    Args:
        template: Template string with placeholders
        args: List of positional arguments
        full_args: Full arguments string for $ARGUMENTS

    Returns:
        Template with placeholders replaced
    """
    result = template

    # Replace $ARGUMENTS with full args string
    result = result.replace("$ARGUMENTS", full_args)

    # Replace positional $1, $2, etc.
    for i, arg in enumerate(args, 1):
        result = result.replace(f"${i}", arg)

    # Remove unfilled positional placeholders
    result = re.sub(r'\$\d+', '', result)

    return result


def extract_file_references(text: str) -> List[str]:
    """Extract all @file references from text without resolving them."""
    return [match.group(1) for match in FILE_REGEX.finditer(text) if match.group(1)]


def extract_shell_commands(text: str) -> List[str]:
    """Extract all !`shell` commands from text without executing them."""
    return [match.group(1) for match in SHELL_REGEX.finditer(text)]


def format_file_context(file_parts: List[Dict]) -> str:
    """
    Format resolved file parts as context to prepend to a message.

    Returns formatted string with file contents in code blocks.
    """
    if not file_parts:
        return ""

    blocks = []
    for part in file_parts:
        path = part["path"]
        content = part["content"]
        file_type = part.get("type", "file")

        if file_type == "file":
            # Detect language from extension
            ext = Path(path).suffix.lstrip(".")
            lang = _ext_to_lang(ext)
            blocks.append(f"**File: {path}**\n```{lang}\n{content}\n```")
        else:
            blocks.append(f"**{content}**")

    return "\n\n".join(blocks)


def _ext_to_lang(ext: str) -> str:
    """Map file extension to markdown language identifier."""
    mapping = {
        "py": "python",
        "js": "javascript",
        "ts": "typescript",
        "tsx": "typescript",
        "jsx": "javascript",
        "rs": "rust",
        "go": "go",
        "rb": "ruby",
        "sh": "bash",
        "yml": "yaml",
        "yaml": "yaml",
        "json": "json",
        "md": "markdown",
        "sql": "sql",
        "css": "css",
        "html": "html",
        "xml": "xml",
        "toml": "toml",
    }
    return mapping.get(ext.lower(), ext or "")
