# Claude Code CLI - Technical Reference

> **Updated 2026-01-27** - Direct API access is blocked. Use CLI subprocess instead.

---

## TL;DR

| Approach | Works? | TOS? |
|----------|--------|------|
| ❌ Extract OAuth tokens, call API directly | **BLOCKED** by Anthropic | Violation |
| ✅ Run `claude` CLI as subprocess | **WORKS** | Legitimate use |

**Kuroryuu implements the CLI subprocess approach** via the `claude-cli` backend.

---

## What Doesn't Work: Direct API Access

### The Attempt

```typescript
// Reading credentials
const creds = JSON.parse(fs.readFileSync('~/.claude/.credentials.json'));
const token = creds.claudeAiOauth.accessToken;

// Calling API directly
fetch('https://api.anthropic.com/v1/messages', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'anthropic-version': '2023-06-01',
    'anthropic-beta': 'oauth-2025-04-20',
  },
  body: JSON.stringify({ model: 'claude-opus-4-5-20251101', ... })
});
```

### The Result

```json
{
  "type": "error",
  "error": {
    "type": "invalid_request_error",
    "message": "This credential is only authorized for use with Claude Code and cannot be used for other API requests."
  }
}
```

**Anthropic actively blocks** OAuth tokens from being used outside the Claude Code CLI. They validate more than just the token - likely client fingerprinting, session state, etc.

---

## What Works: CLI Subprocess

### How Clawdbot Does It

From `clawdbot-main/src/agents/cli-backends.ts`:

```typescript
const DEFAULT_CLAUDE_BACKEND: CliBackendConfig = {
  command: "claude",
  args: ["-p", "--output-format", "json", "--dangerously-skip-permissions"],
  output: "json",
  modelArg: "--model",
  modelAliases: { opus: "opus", sonnet: "sonnet", haiku: "haiku" },
};
```

They spawn the Claude CLI as a subprocess, pass prompts to it, and parse the JSON output.

### How Kuroryuu Does It

**Backend:** `apps/gateway/llm/backends/claude_cli.py`

```python
cmd = [
    "claude",
    "-p",                      # Print mode (non-interactive)
    "--output-format", "json", # Machine-readable output
    "--model", "opus",         # Model selection
    prompt,
]

proc = await asyncio.create_subprocess_exec(*cmd, ...)
stdout, stderr = await proc.communicate()
result = json.loads(stdout)
```

### Verification

```bash
$ claude -p --output-format json --model opus "What model are you?"

{
  "result": "claude-opus-4-5-20251101",
  "total_cost_usd": 0.17,
  "modelUsage": {"claude-opus-4-5-20251101": {...}}
}
```

Real Opus 4.5 confirmed.

---

## Why CLI Subprocess is Legitimate

1. **Official CLI flags** - `-p`, `--output-format json`, `--model` are documented features
2. **Designed for automation** - The CLI explicitly supports non-interactive/programmatic use
3. **No credential extraction** - The CLI manages auth internally
4. **Used by major projects** - Clawdbot, Auto-Claude, etc. use this pattern openly
5. **No TOS violation** - You're using the tool as Anthropic designed it

---

## Credential Reference (For Understanding Only)

### Location

| Platform | Path |
|----------|------|
| Windows | `%USERPROFILE%\.claude\.credentials.json` |
| macOS | `~/.claude/.credentials.json` + Keychain |
| Linux | `~/.claude/.credentials.json` |

### Structure

```json
{
  "claudeAiOauth": {
    "accessToken": "sk-ant-oat01-...",
    "refreshToken": "sk-ant-ort01-...",
    "expiresAt": 1769582842135,
    "scopes": ["user:inference", "user:mcp_servers", "user:profile", "user:sessions:claude_code"],
    "subscriptionType": "max",
    "rateLimitTier": "default_claude_max_20x"
  }
}
```

### Token Prefixes

| Prefix | Type |
|--------|------|
| `sk-ant-oat01-` | OAuth access token |
| `sk-ant-ort01-` | OAuth refresh token |

**Note:** Both OAuth tokens and setup-tokens use the same `sk-ant-oat01-` prefix. Both are blocked from direct API use.

---

## Kuroryuu Implementation

### Model Entry

In model selector, select **OPUS4.5-MAX** (Claude section):
- Provider: `claude-cli`
- Routes to: `ClaudeCliBackend`
- Uses: Real Opus 4.5 via Claude Code CLI

### Files

| File | Purpose |
|------|---------|
| `apps/gateway/llm/backends/claude_cli.py` | Backend implementation |
| `apps/gateway/llm/backends/registry.py` | Backend registration |
| `apps/desktop/.../model-registry.ts` | Model entry |
| `apps/desktop/.../domain-config.ts` | Provider type |

### Requirements

- Claude Code CLI installed (`claude` command available)
- Max or Pro subscription (logged in via `claude` CLI)

---

## Alternatives

| Option | Access | Cost |
|--------|--------|------|
| **Claude CLI (subprocess)** | Real Opus 4.5 | Subscription (Max/Pro) |
| **Anthropic API Key** | All models | Pay per token |
| **CLIProxyAPI** | Multiple providers | Free (may downgrade models) |
| **Kiro (AWS)** | Sonnet 4 | Free (no Opus in CLI) |

---

## Reference Projects

- [Clawdbot](https://github.com/mariozechner/clawdbot) - Uses CLI subprocess pattern
- [Auto-Claude](https://github.com/MULTI-ON/auto-claude) - Similar approach
- [OpenCode](https://github.com/opencode-dev/opencode) - Own credential system
