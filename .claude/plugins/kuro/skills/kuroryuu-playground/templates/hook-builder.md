# Hook Builder Template

Use this template when the playground is about constructing Claude Code hook configurations: event types, matchers, commands, timeouts, validation rules.

Extends the official `data-explorer` template with Claude Code hook system specifics.

## Layout

```
+-------------------+----------------------+
|                   |                      |
|  Controls:        |  JSON Preview        |
|  - Event type     |  (syntax-highlighted |
|  - Matcher        |   hook config)       |
|  - Command type   |                      |
|  - Script builder |  Validation warnings |
|  - Timeout        |                      |
|  - Presets        |                      |
|                   +----------------------+
|                   |  Prompt output       |
|                   |  [ Copy Prompt ]     |
+-------------------+----------------------+
```

## Pre-populate with Kuroryuu data

Read `.claude/settings.json` to show current hook configuration as reference. Read `.claude/plugins/kuro/hooks/hooks.json` for the plugin hook format.

### Event Types

| Event | When it fires | Common matchers |
|-------|--------------|-----------------|
| `PostToolUse` | After any tool completes | `TaskCreate\|TaskUpdate`, `Write`, `Edit`, `Bash`, `*` |
| `PreToolUse` | Before tool execution | `Write\|Edit`, `Bash`, `*` |
| `Stop` | When Claude stops responding | N/A (no matcher) |
| `UserPromptSubmit` | User sends a message | N/A |
| `SubagentStop` | Subagent finishes | N/A |
| `Notification` | System notification | N/A |
| `SessionStart` | Session begins | N/A |
| `SessionEnd` | Session ends | N/A |

### Command Types

| Type | Purpose | Example |
|------|---------|---------|
| `command` | Run a script | `powershell.exe -NoProfile -File script.ps1` |
| `prompt` | Show a prompt to Claude | `"Remember to check for X"` |

### Controls

| Decision | Control | Options |
|----------|---------|---------|
| Event type | Dropdown | PostToolUse, PreToolUse, Stop, etc. |
| Matcher pattern | Text input | `*`, `TaskCreate`, `Write\|Edit`, regex |
| Command type | Toggle | command vs prompt |
| Script language | Dropdown | PowerShell, Python (uv run), Bash |
| Script path | Text input | `${CLAUDE_PLUGIN_ROOT}/scripts/...` |
| Timeout | Slider 1000-60000ms | Default: 10000 |
| Environment vars | Key-value rows | TOOL_INPUT_FILE_PATH, etc. |

### Validation Rules

Show warnings for:
- **Windows bug:** Standalone SessionStart/SessionEnd/SubagentStart hooks break terminal input on Windows Claude Code v2.1.37+
- **Timeout too low:** < 5000ms may cause script to be killed
- **Missing `${CLAUDE_PLUGIN_ROOT}`:** Scripts should use plugin-relative paths
- **`> nul` in bash:** Should be `> /dev/null`
- **BOM encoding:** PowerShell UTF8 includes BOM, use `UTF8Encoding($false)`

### Presets

1. **Python Linter** — PostToolUse on Write|Edit, runs ruff via uv
2. **Task Sync** — PostToolUse on TaskCreate|TaskUpdate, syncs to ai/todo.md
3. **TTS on Stop** — Stop event, announces completion via TTS
4. **Transcript Export** — UserPromptSubmit, exports conversation backup
5. **Observability** — PostToolUse on *, sends events to Gateway WebSocket

## JSON Preview

Render syntax-highlighted JSON showing the exact settings.json format:

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "uv run ${CLAUDE_PLUGIN_ROOT}/hooks/validators/ruff_check.py",
            "timeout": 30000
          }
        ]
      }
    ]
  }
}
```

Color-code:
- Keywords (hooks, matcher, type) in blue
- Strings in green
- Numbers in orange
- Booleans in purple

## Prompt output

Generate the hook configuration ready to paste:

```
Add this hook to .claude/settings.json under "hooks":

Event: PostToolUse
Matcher: "Write|Edit"
Command: uv run ${CLAUDE_PLUGIN_ROOT}/hooks/validators/ruff_check.py
Timeout: 30000ms
Type: command

This hook runs the ruff Python linter after every Write or Edit tool call, validating Python files for style and error issues.

JSON to add:
{
  "matcher": "Write|Edit",
  "hooks": [{"type": "command", "command": "uv run ...", "timeout": 30000}]
}
```

Include both natural language explanation and the raw JSON.
