# Buffer Monitoring Opt-In Guide

This guide explains how to enable and use the buffer-first monitoring feature in Kuroryuu.

## Overview

Buffer monitoring provides direct access to xterm.js terminal buffer text, enabling:
- **Fast** (<200ms) terminal text extraction
- **Accurate** 100% text fidelity (no OCR errors)
- **Efficient** delta-mode polling (only new content)
- **Scriptable** reliable parsing of structured output

This is an **opt-in alternative** to vision-based monitoring. The existing vision workflow remains the default and unchanged.

## Quick Start

### 1. Enable Buffer Access

Set the environment variable before starting Kuroryuu:

```bash
# PowerShell
$env:KURORYUU_TERM_BUFFER_ACCESS = "leader_only"

# Bash
export KURORYUU_TERM_BUFFER_ACCESS=leader_only
```

### 2. Verify Configuration

```python
result = k_pty(action="help")
print(result["data"]["term_buffer_access"]["current_mode"])
# Should output: "leader_only"
```

### 3. Use Buffer Reading

```python
# Read last 40 lines from terminal
result = k_pty(
    action="term_read",
    session_id="claude_abc12345",
    mode="tail",
    max_lines=5  # Start small, work up as needed
)

print(result["text"])
```

## Configuration Modes

| Mode | Value | Description |
|------|-------|-------------|
| **Off** (default) | `off` | term_read disabled |
| **Leader Only** | `leader_only` | Only leaders can use term_read |
| **All Agents** | `all` | All agents can use term_read |

Set via `KURORYUU_TERM_BUFFER_ACCESS` environment variable.

## Read Modes

### Tail Mode (Default)

Reads last N lines from cursor position. Best for "what just happened" queries.

```python
result = k_pty(
    action="term_read",
    session_id="...",
    mode="tail",
    max_lines=5  # Start small, work up as needed  # Default, cap: 200
)
```

### Viewport Mode

Reads exactly what's visible in the terminal window.

```python
result = k_pty(
    action="term_read",
    session_id="...",
    mode="viewport"
)
```

### Delta Mode

Reads only new output since last marker. Most efficient for polling.

```python
# First call: register marker
result = k_pty(
    action="term_read",
    session_id="...",
    mode="delta",
    max_lines=0  # Just get marker
)
marker_id = result["marker_id"]

# Subsequent calls: get new content
result = k_pty(
    action="term_read",
    session_id="...",
    mode="delta",
    marker_id=marker_id
)
new_content = result["text"]
```

## API Reference

### k_pty(action="term_read", ...)

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| session_id | string | required | PTY session ID |
| mode | string | "tail" | "tail", "viewport", or "delta" |
| max_lines | int | 5 | Max lines to return (start small, cap: 200) |
| max_chars | int | 12000 | Max characters (cap: 50000) |
| merge_wrapped | bool | true | Merge wrapped lines |
| marker_id | int | null | For delta mode (from previous call) |

### Response

```json
{
  "ok": true,
  "text": "terminal output as string",
  "lines": ["line1", "line2", ...],
  "truncated": false,
  "dropped_chars": 0,
  "cursor_line": 42,
  "rows": 30,
  "cols": 120,
  "buffer_type": "normal",
  "marker_id": 12345,
  "marker_line": 40,
  "marker_disposed": false
}
```

## Use Cases

### Context Monitoring

```python
# Poll for context percentage
result = k_pty(action="term_read", session_id="...", mode="tail", max_lines=10)
match = re.search(r'(\d+)%', result["text"])
if match and int(match.group(1)) <= 20:
    print("WARNING: Low context detected!")
```

### Command Output Parsing

```python
# Parse structured output
result = k_pty(action="term_read", session_id="...", mode="tail", max_lines=50)
for line in result["lines"]:
    if "error" in line.lower():
        print(f"Error detected: {line}")
```

### Idle Detection

```python
def is_idle(text):
    """Check if terminal is at idle prompt."""
    last_line = text.strip().split('\n')[-1].strip()
    return re.match(r'^[❯$>]\s*$', last_line)
```

## Comparison: Buffer vs Vision

| Aspect | Buffer (term_read) | Vision (screenshot) |
|--------|-------------------|---------------------|
| **Latency** | <200ms | ~10s |
| **Accuracy** | 100% text | OCR-dependent |
| **Cost** | Minimal | Vision API cost |
| **Scope** | Terminal text only | Entire GUI |
| **Best for** | Text extraction, parsing | Layout, GUI state |

## Forked Prompts

Buffer-first monitoring has dedicated prompts:

| Standard Prompt | Buffer-First Version |
|-----------------|---------------------|
| `leader_prime.md` | `leader_prime_buffer.md` |
| `leader_monitor.md` | `leader_monitor_buffer.md` |

These prompts use term_read as primary with vision as fallback.

## Security

### Secret Redaction

The following patterns are automatically redacted:
- API keys (`sk-...`, `ghp_...`)
- Bearer tokens
- Exported credentials (`export TOKEN=...`)
- Common API key environment variables

### Access Control

- **Leader-only mode**: Only agents with leader role can read buffers
- **All mode**: Any agent can read any terminal buffer
- **Off mode**: Feature completely disabled

## Troubleshooting

### "Terminal buffer access is disabled"

Set the environment variable:
```bash
export KURORYUU_TERM_BUFFER_ACCESS=leader_only
```

### "Session not found"

The session_id must be registered with the PTY registry. Use:
```python
sessions = k_pty(action="list")
print(sessions["sessions"])
```

### "term_read only works for desktop sessions"

Buffer reading requires xterm.js frontend. Local pywinpty sessions don't support this feature.

### "Buffer read timeout"

The desktop app may not be responding. Check:
1. Desktop app is running
2. PTY bridge is connected (port 8201)
3. Terminal component is mounted

### "Marker disposed"

Delta markers can expire. Handle by falling back to tail mode or registering a new marker.

## Best Practices

1. **Use delta mode for polling** - Only gets new content
2. **Start small (5 lines), work up** - Save tokens by reading incrementally
3. **Fall back to vision for GUI** - Buffer can't see non-terminal content
4. **Handle alternate buffer** - TUI apps use alternate buffer (term_read may not capture correctly)
5. **Register markers per-worker** - Each worker needs its own delta marker
