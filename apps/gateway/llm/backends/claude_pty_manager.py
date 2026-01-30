"""Claude PTY Manager - Manages persistent Claude CLI PTY sessions.

Creates and manages persistent Claude Code CLI sessions in PTY.
Each conversation gets its own CLI session with full features:
- /compact, /clear, all slash commands
- MCP tools
- Natural context retention
- Real-time streaming

Usage:
    manager = ClaudePTYManager()
    session = await manager.get_or_create(conversation_id, model="opus")
    async for chunk in manager.send_message(conversation_id, "Hello"):
        print(chunk, end="")
"""

from __future__ import annotations

import asyncio
import datetime as dt
import logging
import os
import re
import threading
import time
import uuid
from collections import deque
from dataclasses import dataclass, field
from typing import Any, AsyncGenerator, Dict, Optional

logger = logging.getLogger("kuroryuu.gateway.claude_pty")

# Configuration
DEFAULT_MODEL = os.environ.get("KURORYUU_CLAUDE_PTY_MODEL", "opus")

# Claude CLI path discovery
def _find_claude_cli() -> str:
    """Find the claude CLI executable.

    Searches in order:
    1. KURORYUU_CLAUDE_CLI_PATH environment variable
    2. Common Windows installation paths
    3. Fall back to 'claude' (rely on PATH)
    """
    # Check environment variable first
    env_path = os.environ.get("KURORYUU_CLAUDE_CLI_PATH")
    if env_path and os.path.exists(env_path):
        logger.info(f"Using claude CLI from env: {env_path}")
        return env_path

    # Common Windows paths for Claude CLI
    home = os.path.expanduser("~")
    candidates = [
        os.path.join(home, ".claude", "node_modules", ".bin", "claude.cmd"),
        os.path.join(home, ".claude", "node_modules", ".bin", "claude"),
        os.path.join(home, "AppData", "Local", "Programs", "claude", "claude.exe"),
        os.path.join(home, "AppData", "Roaming", "npm", "claude.cmd"),
        "C:\\Program Files\\Claude\\claude.exe",
    ]

    for path in candidates:
        if os.path.exists(path):
            logger.info(f"Found claude CLI at: {path}")
            return path

    # Fall back to PATH lookup
    logger.warning("Claude CLI not found in common paths, falling back to 'claude' in PATH")
    return "claude"

# Cache the path
CLAUDE_CLI_PATH = _find_claude_cli()
SESSION_TIMEOUT_SECONDS = int(os.environ.get("KURORYUU_CLAUDE_PTY_TIMEOUT", "1800"))  # 30 min
MAX_SESSIONS = int(os.environ.get("KURORYUU_CLAUDE_PTY_MAX_SESSIONS", "5"))
PROMPT_IDLE_TIMEOUT_MS = int(os.environ.get("KURORYUU_CLAUDE_PTY_IDLE_MS", "2000"))  # 2 sec
BUFFER_MAX_SIZE = 200 * 1024  # 200KB

# Prompt detection patterns
# Claude CLI shows various prompts when ready for input
# The prompt often contains ANSI escape codes, so we match more loosely
PROMPT_PATTERNS = [
    r'>\s*$',            # Simple ">" prompt (anywhere in line due to ANSI codes)
    r'❯\s*$',            # Unicode prompt
    r'\$\s*$',           # Shell-style prompt
    r'claude>\s*$',      # Named prompt
    r'\x1b\[\?25h\s*$',  # Cursor show sequence (often at prompt)
]
PROMPT_REGEX = re.compile('|'.join(PROMPT_PATTERNS), re.MULTILINE)


# Check for pywinpty
PYWINPTY_AVAILABLE = False
PtyProcess = None

try:
    from winpty import PtyProcess as _PtyProcess
    PtyProcess = _PtyProcess
    PYWINPTY_AVAILABLE = True
except ImportError:
    logger.warning("pywinpty not available - Claude PTY backend disabled")


# ═══════════════════════════════════════════════════════════════════════════════
# Terminal Output Filter - Strips ANSI codes and Claude CLI UI elements
# ═══════════════════════════════════════════════════════════════════════════════

# ANSI escape sequence patterns
ANSI_ESCAPE_REGEX = re.compile(r'\x1b\[[0-9;]*[a-zA-Z]')  # CSI sequences
ANSI_OSC_REGEX = re.compile(r'\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?')  # OSC sequences (window titles)
ANSI_OTHER_REGEX = re.compile(r'\x1b[^[\]].?')  # Other escape sequences

# Claude CLI UI patterns to filter out (be SPECIFIC to avoid filtering real content)
# These patterns must be very precise - we only filter lines that are CLEARLY UI elements
CLI_UI_PATTERNS = [
    r'^0;.*Claude.*$',                  # Window title: 0;✳ Claude Code
    r'^[\s]*[✶✢✻✽●·\*]+[\s]*$',         # Spinner characters ONLY (nothing else on line)
    r'^Channeling…$',                   # Exact channeling spinner
    r'^Slithering…$',                   # Exact slithering spinner
    r'^Wrangling…$',                    # Exact wrangling spinner
    r'^Thinking…$',                     # Exact thinking spinner
    r'^\s*·\s*thinking\)\s*$',          # Thinking indicator
    # Asterisk-prefixed spinner lines: *Vibing..., *Thinking..., etc.
    r'^\*(?:Vibing|Thinking|Channeling|Slithering|Wrangling)\.{2,}$',
    r'^\*(?:Vibing|Thinking|Channeling|Slithering|Wrangling)…$',
    r'^\*[A-Za-z]+\.{2,}$',             # Generic *Word...
    r'^\(esc to interrupt.*\)$',        # Interrupt hint
    r'^ctrl\+[a-z] to edit in Notepad$', # Keyboard hint
    r'^─{10,}$',                        # Separator lines (10+ dashes only)
    r'^Opus \d+\.\d+\s+\d+%\s+[\d.]+[KM]?/[\d.]+[KM]?$', # Progress: Opus 4.5 17% 34K/200K
    r'^Sonnet \d+\.\d+\s+\d+%\s+[\d.]+[KM]?/[\d.]+[KM]?$', # Progress: Sonnet
    r'^Haiku \d+\.\d+\s+\d+%\s+[\d.]+[KM]?/[\d.]+[KM]?$',  # Progress: Haiku
    r'^\d+%\s+[\d.]+[KM]?/[\d.]+[KM]?$', # Just progress: 17% 34K/200K
    r'^[\d.]+[KM]?/[\d.]+[KM]?$',       # Just token counts: 34K/200K
    r'^❯\s*$',                          # Empty prompt only
    r'^>\s*$',                          # Empty prompt only
    r'^\s*$',                           # Completely empty lines
]
CLI_UI_REGEX = re.compile('|'.join(CLI_UI_PATTERNS), re.MULTILINE)

# Inline patterns to strip (can appear anywhere in text, not just whole lines)
INLINE_SPINNER_PATTERNS = [
    re.compile(r'\*(?:Vibing|Thinking|Channeling|Slithering|Wrangling)\.{2,}\s*', re.IGNORECASE),
    re.compile(r'\*(?:Vibing|Thinking|Channeling|Slithering|Wrangling)…\s*', re.IGNORECASE),
    re.compile(r'\*[A-Za-z]+\.{2,}\s*'),  # Generic *Word...
]


def filter_terminal_output(text: str) -> str:
    """Filter terminal output to extract clean response text.

    Removes:
    - ANSI escape sequences (colors, cursor movement, etc.)
    - Claude CLI UI elements (spinners, progress bars, hints)
    - Window title sequences (OSC)

    IMPORTANT: This filter is designed to be CONSERVATIVE.
    We only strip things that are DEFINITELY terminal UI junk.
    When in doubt, we keep the content.

    Returns clean text suitable for display.
    """
    if not text:
        return ""

    # Step 1: Remove ANSI escape sequences (colors, cursor movement)
    text = ANSI_ESCAPE_REGEX.sub('', text)
    text = ANSI_OSC_REGEX.sub('', text)
    text = ANSI_OTHER_REGEX.sub('', text)

    # Step 1.5: Strip inline spinner patterns (can appear anywhere in text)
    for pattern in INLINE_SPINNER_PATTERNS:
        text = pattern.sub(' ', text)

    # Step 2: Handle carriage returns (used for progress bar overwrites)
    # Split into lines first, then handle \r within each line
    lines = text.split('\n')
    cleaned_lines = []

    for line in lines:
        # Handle carriage returns - take only the last segment
        # This handles progress bars that overwrite themselves
        if '\r' in line:
            segments = line.split('\r')
            # Take last non-empty segment
            for seg in reversed(segments):
                if seg.strip():
                    line = seg
                    break
            else:
                line = segments[-1]

        # Step 3: Skip lines that are ONLY CLI UI elements
        line_stripped = line.strip()

        # Skip empty lines
        if not line_stripped:
            continue

        # Skip lines matching our specific UI patterns
        if CLI_UI_REGEX.match(line_stripped):
            continue

        # Skip isolated spinner characters (1-3 chars that are all spinners)
        if len(line_stripped) <= 3 and all(c in '✶✢✻✽●·*' for c in line_stripped):
            continue

        # Keep the line! Preserve original spacing within the line
        cleaned_lines.append(line.rstrip())

    # Step 4: Join with newlines to preserve structure
    result = '\n'.join(cleaned_lines)

    # Step 5: Clean up excessive newlines (more than 2 in a row)
    result = re.sub(r'\n{3,}', '\n\n', result)

    return result.strip()


@dataclass
class OutputBuffer:
    """Thread-safe ring buffer for PTY output."""

    _chunks: deque = field(default_factory=deque)
    _total_size: int = 0
    _max_size: int = BUFFER_MAX_SIZE
    _lock: threading.Lock = field(default_factory=threading.Lock)
    _new_data_event: asyncio.Event = field(default_factory=asyncio.Event)

    def append(self, data: str) -> None:
        """Append data and signal waiters."""
        with self._lock:
            self._chunks.append(data)
            self._total_size += len(data)

            # Trim oldest if over limit
            while self._total_size > self._max_size and self._chunks:
                removed = self._chunks.popleft()
                self._total_size -= len(removed)

        # Signal that new data arrived (for async waiters)
        try:
            loop = asyncio.get_running_loop()
            loop.call_soon_threadsafe(self._new_data_event.set)
        except RuntimeError:
            pass  # No event loop running

    def get_all(self) -> str:
        """Get all buffered content."""
        with self._lock:
            return "".join(self._chunks)

    def get_new_since(self, marker: int) -> tuple[str, int]:
        """Get content added since marker position. Returns (new_content, new_marker)."""
        with self._lock:
            all_content = "".join(self._chunks)
            new_content = all_content[marker:] if marker < len(all_content) else ""
            return new_content, len(all_content)

    def clear(self) -> None:
        """Clear buffer."""
        with self._lock:
            self._chunks.clear()
            self._total_size = 0

    async def wait_for_new_data(self, timeout: float = 1.0) -> bool:
        """Wait for new data, return True if data arrived."""
        self._new_data_event.clear()
        try:
            await asyncio.wait_for(self._new_data_event.wait(), timeout=timeout)
            return True
        except asyncio.TimeoutError:
            return False

    @property
    def size(self) -> int:
        return self._total_size


@dataclass
class ClaudePTYSession:
    """Represents a persistent Claude CLI PTY session."""

    session_id: str
    conversation_id: str
    model: str
    created_at: dt.datetime
    last_activity: dt.datetime
    process: Any = None  # PtyProcess instance
    buffer: OutputBuffer = field(default_factory=OutputBuffer)
    ready: bool = False  # True when waiting for input (initial startup)
    streaming_response: bool = False  # True while waiting for Claude to respond
    _reader_thread: Optional[threading.Thread] = None
    _stop_reader: bool = False

    def is_alive(self) -> bool:
        """Check if PTY process is still running."""
        if self.process is None:
            return False
        return self.process.isalive()

    def update_activity(self) -> None:
        """Update last activity timestamp."""
        self.last_activity = dt.datetime.now(dt.timezone.utc)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to serializable dict."""
        return {
            "session_id": self.session_id,
            "conversation_id": self.conversation_id,
            "model": self.model,
            "created_at": self.created_at.isoformat(timespec="seconds"),
            "last_activity": self.last_activity.isoformat(timespec="seconds"),
            "is_alive": self.is_alive(),
            "ready": self.ready,
            "buffer_size": self.buffer.size,
        }


class ClaudePTYManager:
    """Manages persistent Claude CLI PTY sessions.

    Each conversation gets its own Claude CLI session that persists
    across messages, providing full CLI features.
    """

    def __init__(self):
        self._sessions: Dict[str, ClaudePTYSession] = {}
        self._lock = threading.Lock()

        # Start cleanup thread
        self._stop_cleanup = False
        self._cleanup_thread = threading.Thread(
            target=self._cleanup_loop,
            daemon=True,
            name="claude-pty-cleanup",
        )
        self._cleanup_thread.start()

    def _cleanup_loop(self) -> None:
        """Background thread to cleanup idle sessions."""
        while not self._stop_cleanup:
            time.sleep(60)  # Check every minute
            self._cleanup_idle_sessions()

    def _cleanup_idle_sessions(self) -> None:
        """Remove sessions idle for too long."""
        now = dt.datetime.now(dt.timezone.utc)
        timeout = dt.timedelta(seconds=SESSION_TIMEOUT_SECONDS)

        with self._lock:
            to_remove = []
            for conv_id, session in self._sessions.items():
                if now - session.last_activity > timeout:
                    to_remove.append(conv_id)

            for conv_id in to_remove:
                logger.info(f"Cleaning up idle session: {conv_id}")
                self._destroy_session_locked(conv_id)

    def _destroy_session_locked(self, conversation_id: str) -> None:
        """Destroy session (caller must hold lock)."""
        session = self._sessions.pop(conversation_id, None)
        if session:
            session._stop_reader = True
            if session.process and session.is_alive():
                try:
                    # Send exit command
                    session.process.write("exit\r")
                    time.sleep(0.1)
                except Exception:
                    pass
                try:
                    # Force terminate if still alive
                    if session.is_alive():
                        session.process.terminate()
                except Exception:
                    pass
            logger.info(f"Destroyed Claude PTY session: {session.session_id}")

    async def get_or_create(
        self,
        conversation_id: str,
        model: str = DEFAULT_MODEL,
    ) -> ClaudePTYSession:
        """Get existing session or create new one for conversation."""
        with self._lock:
            # Check for existing session
            if conversation_id in self._sessions:
                session = self._sessions[conversation_id]
                if session.is_alive():
                    session.update_activity()
                    return session
                else:
                    # Session died, remove it
                    self._destroy_session_locked(conversation_id)

            # Check session limit
            if len(self._sessions) >= MAX_SESSIONS:
                # Remove oldest session
                oldest = min(
                    self._sessions.items(),
                    key=lambda x: x[1].last_activity,
                )
                logger.info(f"Session limit reached, removing oldest: {oldest[0]}")
                self._destroy_session_locked(oldest[0])

            # Create new session
            session = await self._create_session(conversation_id, model)
            self._sessions[conversation_id] = session
            return session

    async def _create_session(
        self,
        conversation_id: str,
        model: str,
    ) -> ClaudePTYSession:
        """Create a new Claude CLI PTY session."""
        if not PYWINPTY_AVAILABLE:
            raise RuntimeError("pywinpty not available - cannot create PTY session")

        session_id = f"claude_pty_{uuid.uuid4().hex[:8]}"
        now = dt.datetime.now(dt.timezone.utc)

        # Spawn Claude CLI in interactive mode
        # --model selects model, no -p flag = interactive mode
        # pywinpty expects a list of arguments
        # Use discovered CLI path (handles Windows where 'claude' may not be in PATH)
        cmd_args = [CLAUDE_CLI_PATH, "--model", model]
        cmd_str = " ".join(cmd_args)

        logger.info(f"Creating Claude PTY session: {session_id}, model={model}")
        logger.info(f"Spawning: {cmd_str}")

        try:
            process = PtyProcess.spawn(cmd_args, cwd=os.getcwd())
        except Exception as e:
            logger.error(f"Failed to spawn Claude CLI: {e}")
            raise RuntimeError(f"Failed to spawn Claude CLI: {e}")

        session = ClaudePTYSession(
            session_id=session_id,
            conversation_id=conversation_id,
            model=model,
            created_at=now,
            last_activity=now,
            process=process,
            ready=False,
        )

        # Start background reader thread
        reader_thread = threading.Thread(
            target=self._background_reader,
            args=(session,),
            daemon=True,
            name=f"claude-pty-reader-{session_id}",
        )
        session._reader_thread = reader_thread
        reader_thread.start()

        # Wait for initial prompt (CLI ready)
        await self._wait_for_ready(session, timeout=30.0)

        return session

    def _background_reader(self, session: ClaudePTYSession) -> None:
        """Background thread that continuously reads PTY output.

        Note: pywinpty's read() is blocking without timeout support.
        We read small chunks and rely on the daemon thread to be killed when done.
        """
        logger.info(f"PTY reader started: {session.session_id}")

        consecutive_errors = 0
        max_consecutive_errors = 5

        while not session._stop_reader:
            if not session.is_alive():
                logger.info(f"PTY process died: {session.session_id}")
                break

            try:
                # Read small chunk - this will block if no data
                data = session.process.read(1024)
                consecutive_errors = 0  # Reset on successful read

                if data:
                    # Ensure data is properly encoded (pywinpty may return str)
                    if isinstance(data, bytes):
                        data = data.decode("utf-8", errors="replace")

                    session.buffer.append(data)
                    logger.debug(f"PTY read {len(data)} chars from {session.session_id}")

                    # Check if prompt appeared (session ready for initial startup)
                    # Only set ready during initial startup, not during message streaming
                    # Look for the actual CLI input prompt at end of line
                    if not session.ready and not session.streaming_response:
                        # Initial prompt detection patterns (stricter)
                        if data.strip().endswith(">") or "❯" in data:
                            session.ready = True
                            logger.info(f"PTY initial prompt detected: {session.session_id}")
                else:
                    # Empty read, small delay to prevent CPU spin
                    time.sleep(0.05)

            except EOFError:
                logger.info(f"PTY EOF: {session.session_id}")
                break
            except UnicodeError as e:
                # Unicode errors can happen with ANSI art/special chars
                # Log and continue - this is recoverable
                logger.debug(f"PTY unicode error (recoverable): {session.session_id}: {e}")
                consecutive_errors += 1
                if consecutive_errors >= max_consecutive_errors:
                    logger.warning(f"Too many consecutive errors: {session.session_id}")
                    break
                time.sleep(0.1)
            except Exception as e:
                logger.warning(f"PTY reader error: {session.session_id}: {e}")
                consecutive_errors += 1
                if consecutive_errors >= max_consecutive_errors:
                    logger.warning(f"Too many consecutive errors: {session.session_id}")
                    break
                time.sleep(0.1)

        logger.info(f"PTY reader stopped: {session.session_id}")

    async def _wait_for_ready(
        self,
        session: ClaudePTYSession,
        timeout: float = 30.0,
    ) -> bool:
        """Wait for session to be ready (showing prompt)."""
        start = time.time()
        last_buffer_size = 0
        idle_count = 0

        while time.time() - start < timeout:
            if session.ready:
                logger.info(f"Claude CLI ready (prompt detected): {session.session_id}")
                return True

            # Check if buffer is growing (CLI is outputting something)
            current_size = session.buffer.size
            if current_size > last_buffer_size:
                last_buffer_size = current_size
                idle_count = 0
            else:
                idle_count += 1
                # If buffer hasn't changed for 50 iterations (5 seconds) and has content,
                # assume CLI is ready (prompt may not match pattern)
                if idle_count > 50 and current_size > 0:
                    logger.info(f"Claude CLI ready (idle with content): {session.session_id}")
                    session.ready = True
                    return True

            await asyncio.sleep(0.1)

        # On timeout, log buffer content for debugging
        buffer_content = session.buffer.get_all()
        logger.warning(f"Timeout waiting for Claude CLI ready: {session.session_id}")
        logger.warning(f"Buffer content ({len(buffer_content)} chars): {buffer_content[:500]}...")

        # Set ready anyway if we have content (graceful fallback)
        if buffer_content:
            session.ready = True
            return True

        return False

    async def send_message(
        self,
        conversation_id: str,
        message: str,
        model: str = DEFAULT_MODEL,
    ) -> AsyncGenerator[str, None]:
        """Send message to session and stream response.

        Yields text chunks as they arrive from Claude CLI.
        """
        session = await self.get_or_create(conversation_id, model)
        session.update_activity()
        session.streaming_response = True  # Prevent prompt detection during streaming

        # Record buffer position before sending
        _, marker = session.buffer.get_new_since(0)
        marker = session.buffer.size  # Start from current position
        logger.info(f"Buffer marker set at {marker}, buffer has {session.buffer.size} bytes")

        # Write message to PTY
        logger.info(f"Sending to Claude PTY {session.session_id}: {message[:100]}...")

        # Wait for CLI to be fully ready for input
        await asyncio.sleep(2.0)

        # Clear any pending input by sending Escape first
        session.process.write("\x1b")  # ESC to clear any input mode
        await asyncio.sleep(0.2)

        # Type the message
        session.process.write(message)
        await asyncio.sleep(0.5)

        # Try multiple ways to submit:
        # 1. First try newline
        session.process.write("\n")
        await asyncio.sleep(0.5)
        # 2. Then try carriage return
        session.process.write("\r")

        # Wait for response to start
        # Claude CLI may take 10-30 seconds for first token with Opus
        # Model processing time: Haiku ~2-5s, Sonnet ~5-15s, Opus ~15-45s
        message_sent_time = time.time()
        last_output_time = time.time()
        min_wait_time = 60.0  # Wait at least 60 seconds for first response (Opus can be slow)
        idle_threshold = 10.0  # Consider idle after 10 seconds of no output (once started)
        max_response_time = 180.0  # Maximum time to wait for response (3 min)

        logger.info(f"Waiting for response from {session.session_id} (min_wait={min_wait_time}s, idle={idle_threshold}s)...")

        iteration = 0
        while True:
            iteration += 1
            elapsed = time.time() - message_sent_time

            # Timeout check
            if elapsed > max_response_time:
                logger.warning(f"Response timeout ({max_response_time}s): {session.session_id}")
                print(f"[PTY DEBUG] Response timeout at {elapsed:.1f}s")
                break

            # Get new content since last read
            new_content, marker = session.buffer.get_new_since(marker)

            if new_content:
                last_output_time = time.time()
                logger.debug(f"Got {len(new_content)} chars from {session.session_id}")

                # Apply terminal output filter to remove ANSI codes and CLI UI junk
                filtered = filter_terminal_output(new_content)
                if filtered:
                    yield filtered

            # Check for idle timeout (but only after min wait time)
            # We detect end of response by watching for idle period after output stops
            time_since_last_output = time.time() - last_output_time
            if elapsed > min_wait_time and time_since_last_output > idle_threshold:
                print(f"[PTY DEBUG] iter={iteration}: IDLE TIMEOUT at elapsed={elapsed:.1f}s, idle={time_since_last_output:.1f}s")
                # Double-check by waiting a bit more
                await asyncio.sleep(1.0)
                new_content, marker = session.buffer.get_new_since(marker)
                if not new_content:
                    # Still no output, assume done
                    logger.info(f"Idle timeout ({time_since_last_output:.1f}s), assuming done: {session.session_id}")
                    print(f"[PTY DEBUG] Confirmed idle, breaking loop")
                    session.streaming_response = False  # Reset streaming flag
                    break
                else:
                    last_output_time = time.time()
                    yield new_content

            # Wait for new data with timeout
            await session.buffer.wait_for_new_data(timeout=0.2)

        # Ensure streaming flag is reset even on timeout/error
        session.streaming_response = False

    async def destroy(self, conversation_id: str) -> bool:
        """Destroy a session explicitly."""
        with self._lock:
            if conversation_id in self._sessions:
                self._destroy_session_locked(conversation_id)
                return True
            return False

    def list_sessions(self) -> Dict[str, Any]:
        """List all active sessions."""
        with self._lock:
            return {
                "sessions": [s.to_dict() for s in self._sessions.values()],
                "count": len(self._sessions),
                "max_sessions": MAX_SESSIONS,
            }

    async def health_check(self) -> Dict[str, Any]:
        """Check manager health."""
        with self._lock:
            active = sum(1 for s in self._sessions.values() if s.is_alive())
            return {
                "ok": PYWINPTY_AVAILABLE,
                "backend": "claude-cli-pty",
                "pywinpty_available": PYWINPTY_AVAILABLE,
                "sessions": {
                    "active": active,
                    "total": len(self._sessions),
                    "max": MAX_SESSIONS,
                },
            }

    def get_session_id(self, conversation_id: str) -> Optional[str]:
        """Get the PTY session ID for a conversation.

        Returns:
            The session_id string, or None if no session exists.
        """
        with self._lock:
            session = self._sessions.get(conversation_id)
            return session.session_id if session else None

    def shutdown(self) -> None:
        """Shutdown manager and cleanup all sessions."""
        self._stop_cleanup = True
        with self._lock:
            for conv_id in list(self._sessions.keys()):
                self._destroy_session_locked(conv_id)


# Global singleton instance
_manager: Optional[ClaudePTYManager] = None


def get_claude_pty_manager() -> ClaudePTYManager:
    """Get or create the global Claude PTY manager."""
    global _manager
    if _manager is None:
        _manager = ClaudePTYManager()
    return _manager
