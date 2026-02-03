# Kuroryuu Hooks Utilities

Comprehensive utilities for Claude Code hooks, including LLM integrations, TTS systems, and validation hooks.

All utilities are implemented as **UV single-file scripts** for zero-install execution.

---

## Table of Contents

- [Overview](#overview)
- [UV Single-File Script Format](#uv-single-file-script-format)
- [LLM Utilities](#llm-utilities)
- [TTS System](#tts-system)
- [Validators](#validators)
- [Windows Compatibility](#windows-compatibility)
- [Configuration](#configuration)

---

## Overview

This directory contains utilities that power Kuroryuu's hook system:

- **LLM Utilities** (`llm/`): Fast LLM prompting for agent names, completion messages, and summaries
- **TTS System** (`tts/`): Multi-provider text-to-speech with queueing
- **Validators** (`../validators/`): Hook validators for file creation, content checking, and code quality

All utilities follow the **UV single-file script** pattern for dependency management and portability.

---

## UV Single-File Script Format

All scripts use UV's inline dependency specification:

```python
#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.8"
# dependencies = [
#     "openai",
#     "python-dotenv",
# ]
# ///
```

### Benefits

- **Zero Install**: Dependencies auto-installed in isolated environments
- **Portable**: Scripts work across machines without manual setup
- **Versioned**: Each script declares exact dependencies
- **Fast**: UV caching ensures quick execution after first run

### Execution

```bash
# Direct execution (UV auto-installs dependencies)
uv run script.py

# Or make executable and run directly
chmod +x script.py
./script.py
```

---

## LLM Utilities

Located in `.claude/plugins/kuro/hooks/utils/llm/`

Fast LLM prompting for hook-time operations using lightweight models.

### Ollama (`ollama.py`)

Local LLM integration using Ollama's OpenAI-compatible API.

**Features:**
- Runs completely offline (no API keys needed)
- Uses local models (default: `qwen2.5:3b`)
- Fast inference for quick prompts

**Setup:**
```bash
# Install Ollama
# Download model
ollama pull qwen2.5:3b

# Configure model (optional)
export OLLAMA_MODEL="qwen2.5:3b"
```

**Usage:**
```bash
# Generate agent name
uv run ollama.py --agent-name
# Output: Phoenix

# Generate completion message
uv run ollama.py --completion
# Output: All done!

# Custom prompt
uv run ollama.py "Summarize this in 5 words: ..."
```

**Functions:**
- `prompt_llm(prompt_text)` - Base prompting method
- `generate_agent_name()` - One-word agent name
- `generate_completion_message()` - Task completion message

### OpenAI (`oai.py`)

OpenAI API integration using fastest models.

**Features:**
- Ultra-fast responses (`gpt-4.1-nano`)
- Cost-effective for high-volume usage
- Fallback to hardcoded values if no API key

**Setup:**
```bash
# Add to .env
OPENAI_API_KEY=sk-...
ENGINEER_NAME="Your Name"  # Optional, for personalized messages
```

**Usage:**
```bash
# Generate agent name
uv run oai.py --agent-name
# Output: Nexus

# Generate completion message
uv run oai.py --completion
# Output: Ready for you, Alex!

# Custom prompt
uv run oai.py "What's the capital of France?"
```

**Functions:**
- `prompt_llm(prompt_text)` - Base prompting method (gpt-4.1-nano)
- `generate_agent_name()` - One-word agent name (gpt-4o-mini)
- `generate_completion_message()` - Task completion message

### Anthropic (`anth.py`)

Anthropic Claude integration using Haiku model.

**Features:**
- Fast responses (`claude-3-5-haiku-20241022`)
- High-quality completions
- Same interface as OpenAI utility

**Setup:**
```bash
# Add to .env
ANTHROPIC_API_KEY=sk-ant-...
ENGINEER_NAME="Your Name"  # Optional
```

**Usage:**
```bash
# Generate agent name
uv run anth.py --agent-name
# Output: Quantum

# Generate completion message
uv run anth.py --completion
# Output: Task finished!

# Custom prompt
uv run anth.py "Explain quantum computing in one sentence"
```

**Functions:**
- `prompt_llm(prompt_text)` - Base prompting method
- `generate_agent_name()` - One-word agent name
- `generate_completion_message()` - Task completion message

### LLM Provider Selection

All three providers implement the same interface. Choose based on your needs:

| Provider | Speed | Cost | Offline | Quality |
|----------|-------|------|---------|---------|
| Ollama | Fast | Free | Yes | Good |
| OpenAI | Ultra-fast | Low | No | Excellent |
| Anthropic | Fast | Medium | No | Excellent |

---

## TTS System

Located in `.claude/plugins/kuro/hooks/utils/tts/`

Multi-provider text-to-speech system with file-based queueing for concurrent access.

### Queue Manager (`tts_queue.py`)

File-based locking system for managing concurrent TTS announcements.

**Features:**
- Cross-platform locking (Windows: `msvcrt`, Unix: `fcntl`)
- Automatic stale lock cleanup
- Process tracking and validation

**Functions:**
```python
# Acquire lock with timeout
acquire_tts_lock(agent_id="agent1", timeout=30)  # Returns: bool

# Release lock
release_tts_lock(agent_id="agent1")

# Check lock status
is_tts_locked()  # Returns: bool

# Get lock holder info
get_lock_info()  # Returns: dict or None

# Cleanup stale locks
cleanup_stale_locks(max_age_seconds=60)
```

**CLI Usage:**
```bash
# Check lock status
uv run tts_queue.py status
# Output: Available

# Acquire lock
uv run tts_queue.py acquire agent1 30

# Release lock
uv run tts_queue.py release agent1

# Cleanup stale locks
uv run tts_queue.py cleanup 60
```

**Lock Location:**
- Path: `<PROJECT_ROOT>/ai/data/tts_queue/tts.lock`
- Metadata: JSON (agent_id, timestamp, pid)

### pyttsx3 TTS (`pyttsx3_tts.py`)

Offline text-to-speech using pyttsx3.

**Features:**
- Completely offline (no API needed)
- Native OS voices
- Configurable rate and volume
- Zero cost

**Usage:**
```bash
# Speak default message
uv run pyttsx3_tts.py
# Output: "Work complete!"

# Speak custom text
uv run pyttsx3_tts.py "Hello world"
```

**Configuration:**
```python
engine.setProperty('rate', 180)    # Words per minute
engine.setProperty('volume', 0.8)  # 0.0 to 1.0
```

### ElevenLabs TTS (`elevenlabs_tts.py`)

High-quality TTS using ElevenLabs Turbo v2.5.

**Features:**
- Ultra-fast generation (optimized for real-time)
- High-quality voice synthesis
- Stable production model
- Cost-effective for high-volume usage

**Setup:**
```bash
# Add to .env
ELEVENLABS_API_KEY=your_api_key_here
```

**Usage:**
```bash
# Speak default message
uv run elevenlabs_tts.py
# Output: "The first move is what sets everything in motion."

# Speak custom text
uv run elevenlabs_tts.py "Task complete!"
```

**Configuration:**
- Model: `eleven_turbo_v2_5`
- Voice ID: `WejK3H1m7MI9CHnIjW9K`
- Output Format: `mp3_44100_128`

### OpenAI TTS (`openai_tts.py`)

Streaming TTS using OpenAI's latest model.

**Features:**
- Streaming audio (low latency)
- High-quality synthesis
- Custom instructions for tone/style
- Live playback via LocalAudioPlayer

**Setup:**
```bash
# Add to .env
OPENAI_API_KEY=sk-...
```

**Usage:**
```bash
# Speak default message
uv run openai_tts.py
# Output: "Today is a wonderful day to build something people love!"

# Speak custom text
uv run openai_tts.py "Build complete!"
```

**Configuration:**
- Model: `gpt-4o-mini-tts`
- Voice: `nova` (engaging and warm)
- Instructions: "Speak in a cheerful, positive yet professional tone."
- Format: `mp3`

### TTS Provider Selection

| Provider | Speed | Quality | Cost | Offline | Streaming |
|----------|-------|---------|------|---------|-----------|
| pyttsx3 | Fast | Good | Free | Yes | No |
| ElevenLabs | Ultra-fast | Excellent | Medium | No | No |
| OpenAI | Fast | Excellent | Low | No | Yes |

### TTS Integration Example

Typical hook usage with queueing:

```python
from tts_queue import acquire_tts_lock, release_tts_lock
import subprocess

agent_id = "builder-agent"

# Acquire lock
if acquire_tts_lock(agent_id, timeout=10):
    try:
        # Run TTS
        subprocess.run(["uv", "run", "openai_tts.py", "Task complete!"])
    finally:
        # Always release
        release_tts_lock(agent_id)
```

---

## Validators

Located in `.claude/plugins/kuro/hooks/validators/`

Hook validators enforce file creation, content requirements, and code quality.

### File Creation Validator (`validate_new_file.py`)

**Hook Type:** Stop

Validates that a new file was created in a specified directory.

**Checks:**
1. Git status for untracked/new files
2. File modification time within specified age

**Exit Codes:**
- `0`: Validation passed (file found)
- `1`: Validation failed (no file found)

**Usage:**
```bash
# Basic usage
uv run validate_new_file.py --directory Docs/Plans --extension .md

# With max age
uv run validate_new_file.py -d output -e .json --max-age 10
```

**Hook Integration:**
```yaml
hooks:
  Stop:
    - type: command
      command: "uv run ${CLAUDE_PLUGIN_ROOT}/hooks/validators/validate_new_file.py -d Docs/Plans -e .md"
```

**Output:**
```json
// Success
{"result": "continue", "message": "New file(s) found: Docs/Plans/plan.md"}

// Failure
{"result": "block", "reason": "VALIDATION FAILED: No new file found..."}
```

### Content Validator (`validate_file_contains.py`)

**Hook Type:** Stop

Validates that a newly created file contains all required content strings.

**Checks:**
1. Find most recently created file
2. Verify file contains all required strings (case-sensitive)

**Exit Codes:**
- `0`: Validation passed (file exists with required content)
- `1`: Validation failed (file missing or missing content)

**Usage:**
```bash
# Check for multiple sections
uv run validate_file_contains.py \
  -d Docs/Plans \
  -e .md \
  --contains "## Team Orchestration" \
  --contains "## Step by Step Tasks"

# Check JSON structure
uv run validate_file_contains.py \
  --directory output \
  --extension .json \
  --contains '"status":'
```

**Hook Integration:**
```yaml
hooks:
  Stop:
    - type: command
      command: "uv run ${CLAUDE_PLUGIN_ROOT}/hooks/validators/validate_file_contains.py -d Docs/Plans -e .md --contains '## Summary' --contains '## Tasks'"
```

**Output:**
```json
// Success
{"result": "continue", "message": "File 'Docs/Plans/plan.md' contains all 2 required sections"}

// Failure
{
  "result": "block",
  "reason": "VALIDATION FAILED: File 'plan.md' is missing 1 required section(s).\n\nMISSING SECTIONS:\n  - ## Summary"
}
```

### Ruff Validator (`ruff_validator.py`)

**Hook Type:** PostToolUse (Write)

Runs `uvx ruff check` on Python files after Write operations.

**Features:**
- Automatic linting on file save
- Blocks completion if lint errors found
- Logs to `ruff_validator.log`

**Usage:**
```bash
# Manual run (reads hook input from stdin)
echo '{"tool_input": {"file_path": "script.py"}}' | uv run ruff_validator.py
```

**Hook Integration:**
```yaml
hooks:
  PostToolUse:
    Write:
      - type: command
        command: "uv run ${CLAUDE_PLUGIN_ROOT}/hooks/validators/ruff_validator.py"
```

**Output:**
```json
// Success (allow completion)
{}

// Failure (block and retry)
{
  "decision": "block",
  "reason": "Lint check failed:\nscript.py:10:5: F841 Local variable 'x' is assigned but never used"
}
```

**Behavior:**
- Skips non-Python files
- Timeout: 120 seconds
- If `uvx ruff` not found, allows through (no block)

### Type Checker Validator (`ty_validator.py`)

**Hook Type:** PostToolUse (Write)

Runs `uvx ty check` on Python files for type checking.

**Features:**
- Automatic type checking on file save
- Blocks completion if type errors found
- Logs to `ty_validator.log`

**Usage:**
```bash
# Manual run
echo '{"tool_input": {"file_path": "script.py"}}' | uv run ty_validator.py
```

**Hook Integration:**
```yaml
hooks:
  PostToolUse:
    Write:
      - type: command
        command: "uv run ${CLAUDE_PLUGIN_ROOT}/hooks/validators/ty_validator.py"
```

**Output:**
```json
// Success
{}

// Failure
{
  "decision": "block",
  "reason": "Type check failed:\nscript.py:15: error: Argument 1 has incompatible type..."
}
```

**Behavior:**
- Skips non-Python files
- Timeout: 120 seconds
- If `uvx ty` not found, allows through (no block)

### Validator Chaining

Combine validators for comprehensive quality checks:

```yaml
hooks:
  Stop:
    - type: command
      command: "uv run validate_new_file.py -d Docs/Plans -e .md"
    - type: command
      command: "uv run validate_file_contains.py -d Docs/Plans -e .md --contains '## Summary'"

  PostToolUse:
    Write:
      - type: command
        command: "uv run ruff_validator.py"
      - type: command
        command: "uv run ty_validator.py"
```

**Execution Order:**
1. Stop hooks run before response completion
2. PostToolUse hooks run after Write tool execution
3. Validators execute sequentially
4. First failure blocks and returns error

---

## Windows Compatibility

All utilities are fully Windows-compatible with platform-specific handling.

### File Locking

**Problem:** Windows doesn't support Unix `fcntl` module.

**Solution:** Platform detection with fallback:

```python
if sys.platform == 'win32':
    import msvcrt
    msvcrt.locking(fd, msvcrt.LK_NBLCK, 1)  # Non-blocking lock
else:
    import fcntl
    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
```

### Path Handling

**Problem:** Windows uses backslashes, Unix uses forward slashes.

**Solution:** Use `pathlib.Path` for all path operations:

```python
from pathlib import Path

SCRIPT_DIR = Path(__file__).parent.resolve()
PROJECT_ROOT = SCRIPT_DIR.parent.parent.parent.parent.parent
LOCK_DIR = PROJECT_ROOT / "ai" / "data" / "tts_queue"
```

### Null Device Redirection

**Problem:** Claude Code's Bash tool runs through Unix-style shell (WSL/Git Bash). Windows-style null redirection (`> nul`) creates a literal file named "nul".

**Solution:** Always use Unix-style redirection:

```bash
# WRONG (creates file on Windows bash)
command 2>nul

# CORRECT (works in bash)
command 2>/dev/null
```

### Process Detection

**Problem:** Windows process checking differs from Unix.

**Solution:** Use `os.kill(pid, 0)` which works cross-platform:

```python
try:
    os.kill(pid, 0)  # Signal 0 just checks if process exists
    # Process is running
except (OSError, ProcessLookupError):
    # Process not found
    pass
```

---

## Configuration

### Environment Variables

**LLM Utilities:**
```bash
# Ollama
OLLAMA_MODEL=qwen2.5:3b  # Default model

# OpenAI
OPENAI_API_KEY=sk-...
ENGINEER_NAME="Your Name"  # Optional, for personalized messages

# Anthropic
ANTHROPIC_API_KEY=sk-ant-...
ENGINEER_NAME="Your Name"  # Optional

# ElevenLabs TTS
ELEVENLABS_API_KEY=your_key_here
```

**File Locations:**
```bash
# TTS Queue
<PROJECT_ROOT>/ai/data/tts_queue/tts.lock

# Validator Logs
.claude/plugins/kuro/hooks/validators/validate_new_file.log
.claude/plugins/kuro/hooks/validators/validate_file_contains.log
.claude/plugins/kuro/hooks/validators/ruff_validator.log
.claude/plugins/kuro/hooks/validators/ty_validator.log
```

### Hook Configuration

Add utilities to `.claude/hooks.json`:

```json
{
  "hooks": {
    "Stop": [
      {
        "type": "command",
        "command": "uv run ${CLAUDE_PLUGIN_ROOT}/hooks/validators/validate_new_file.py -d Docs/Plans -e .md"
      }
    ],
    "PostToolUse": {
      "Write": [
        {
          "type": "command",
          "command": "uv run ${CLAUDE_PLUGIN_ROOT}/hooks/validators/ruff_validator.py"
        }
      ]
    }
  }
}
```

**Environment Expansion:**
- `${CLAUDE_PLUGIN_ROOT}` - Expands to `.claude/plugins/kuro`
- `${PROJECT_ROOT}` - Expands to repository root

### Logging

All validators log to individual log files for debugging:

```bash
# View recent validation attempts
tail -f .claude/plugins/kuro/hooks/validators/validate_new_file.log

# Check ruff validation results
cat .claude/plugins/kuro/hooks/validators/ruff_validator.log
```

**Log Format:**
```
2025-02-02 14:30:00 | INFO | Validator started
2025-02-02 14:30:00 | INFO | Args: directory=Docs/Plans, extension=.md
2025-02-02 14:30:01 | INFO | PASS: New file found: Docs/Plans/plan.md
```

---

## Development Guide

### Adding New LLM Provider

1. Create `llm/newprovider.py` with UV script header
2. Implement three functions:
   - `prompt_llm(prompt_text)` - Base prompting
   - `generate_agent_name()` - Name generation
   - `generate_completion_message()` - Completion messages
3. Add CLI interface in `if __name__ == "__main__"`
4. Document in this README

### Adding New TTS Provider

1. Create `tts/newprovider_tts.py` with UV script header
2. Use `tts_queue.py` for concurrent access control
3. Accept text as command line argument
4. Play audio synchronously (block until complete)
5. Document provider comparison table

### Adding New Validator

1. Create `validators/new_validator.py` with UV script header
2. Read hook input from stdin (JSON)
3. Output JSON decision:
   - Stop hooks: `{"result": "continue/block", "message/reason": "..."}`
   - PostToolUse hooks: `{}` or `{"decision": "block", "reason": "..."}`
4. Exit code: 0 for success, 1 for failure
5. Add logging to separate log file
6. Document hook integration examples

### Testing

```bash
# Test LLM utilities
uv run llm/ollama.py --agent-name
uv run llm/oai.py --completion
uv run llm/anth.py "test prompt"

# Test TTS system
uv run tts/tts_queue.py status
uv run tts/pyttsx3_tts.py "test"
uv run tts/elevenlabs_tts.py "test"
uv run tts/openai_tts.py "test"

# Test validators
uv run validators/validate_new_file.py -d Docs/Plans -e .md
echo '{"tool_input": {"file_path": "test.py"}}' | uv run validators/ruff_validator.py
```

---

## Troubleshooting

### UV Not Found

```bash
# Install UV
curl -LsSf https://astral.sh/uv/install.sh | sh

# Or on Windows (PowerShell)
irm https://astral.sh/uv/install.ps1 | iex
```

### Dependencies Not Installing

```bash
# Clear UV cache
uv cache clean

# Re-run script (will re-download dependencies)
uv run script.py
```

### TTS Queue Locked

```bash
# Check lock status
uv run tts/tts_queue.py status

# Force cleanup stale locks
uv run tts/tts_queue.py cleanup 0
```

### Validators Not Blocking

Check logs for detailed error messages:

```bash
tail -n 50 .claude/plugins/kuro/hooks/validators/ruff_validator.log
```

Ensure hooks are configured in `.claude/hooks.json`.

### Windows "nul" File Created

If you see a 0 KB file named `nul`, a script used Windows-style redirection in bash:

```bash
# Remove the file (use PowerShell to call WSL)
powershell.exe -Command "wsl rm -f /mnt/e/path/to/nul"
```

Fix the script to use Unix-style redirection (`2>/dev/null`).

---

## License

Part of the Kuroryuu project. See root LICENSE for details.

## Credits

Ported from [claude-code-hooks-mastery](https://github.com/alexfosterinvisible/claude-code-hooks-mastery) for Kuroryuu.

Adapted for Windows compatibility and Kuroryuu's hook system.
