# Claude OAuth Authentication - IMPORTANT NOTES

> **TL;DR:** OAuth works but Anthropic blocks third-party tokens. Use API key auth instead.

---

## The Situation (January 2026)

We attempted to implement OAuth 2.0 PKCE authentication for Claude Pro/Max subscriptions to allow users to use their subscription credits instead of paying for API usage. Here's what we learned:

### What We Tried

1. **Implemented full OAuth flow** in `anthropic_oauth.py`:
   - PKCE code challenge/verifier generation
   - Authorization URL generation
   - Token exchange
   - Token refresh
   - Token storage

2. **Used Claude Code's client ID** (same as OpenCode):
   ```python
   ANTHROPIC_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
   ```

3. **Correct OAuth endpoints**:
   - Auth: `https://claude.ai/oauth/authorize`
   - Token: `https://console.anthropic.com/v1/oauth/token`

4. **Required headers**:
   ```python
   "Authorization": "Bearer {access_token}"
   "anthropic-beta": "oauth-2025-04-20,interleaved-thinking-2025-05-14"
   ```

### What Happened

**OAuth login works perfectly** - tokens are issued and saved.

**BUT when making API calls**, Anthropic returns:
```
400 Bad Request
"This credential is only authorized for use with Claude Code"
```

Anthropic validates the User-Agent and other headers to ensure requests come from the official Claude Code CLI, not third-party tools.

---

## How OpenCode Does It (NOT RECOMMENDED)

OpenCode has a workaround via their `opencode-anthropic-auth` plugin that:

1. **Spoofs Claude Code's User-Agent**:
   ```
   claude-cli/2.0.29 (external, sdk-py, agent-sdk/0.1.6)
   ```

2. **Uses Claude Code's beta headers**:
   ```
   anthropic-beta: claude-code-20250219,interleaved-thinking-2025-05-14,fine-grained-tool-streaming-2025-05-14
   ```

3. **Injects metadata.user_id** from `~/.claude.json`

4. **Routes through a proxy** (OpenCode Zen) that rewrites headers

### Why We Didn't Do This

**ToS Violation Risk**: Impersonating Claude Code violates Anthropic's Terms of Service. Users have reported concerns:
- https://github.com/anomalyco/opencode/issues/6930

**Ban Risk**: Anthropic could detect and ban accounts using spoofed credentials.

**We decided API key authentication is safer** - you pay for what you use, no ToS gray areas.

---

## Current Implementation

We support **two auth modes** (see `claude_provider.py`):

### 1. API Key (RECOMMENDED)
```bash
# Put your API key in:
apps/kuroryuu_cli/claude_api.ini

# Run:
python -m kuroryuu_cli.cli --llm-provider claude --claude-auth api_key
```

### 2. OAuth (IMPLEMENTED BUT BLOCKED)
```bash
# Login:
python -m kuroryuu_cli.cli login --mode max

# Run (will fail with "credential only authorized for Claude Code"):
python -m kuroryuu_cli.cli --llm-provider claude --claude-auth oauth
```

---

## If You Want to Enable OAuth Anyway

The infrastructure exists. To make it work like OpenCode, you would need to:

1. **Create a local proxy** that rewrites headers to match Claude Code
2. **Spoof the User-Agent** to `claude-cli/X.X.X`
3. **Add the claude-code beta header**
4. **Inject metadata.user_id** from Claude Code's config

A draft implementation was planned but is not recommended.

**WE STRONGLY ADVISE AGAINST THIS** - use at your own risk.

---

## Files Related to OAuth

- `apps/kuroryuu_cli/anthropic_oauth.py` - Full OAuth implementation
- `apps/kuroryuu_cli/providers/claude_provider.py` - Provider with OAuth support
- `apps/kuroryuu_cli/cli.py` - Login/logout commands
- `~/.kuroryuu_anthropic_oauth.json` - Token storage location

---

## References

- [OpenCode Anthropic Auth Plugin](https://github.com/anomalyco/opencode-anthropic-auth)
- [OpenCode Issue #1461 - OAuth Implementation](https://github.com/sst/opencode/issues/1461)
- [Claude Code OAuth Spoof Demo](https://gist.github.com/changjonathanc/9f9d635b2f8692e0520a884eaf098351)
- [OpenCode ToS Concerns](https://github.com/anomalyco/opencode/issues/6930)

---

**Last Updated:** 2026-01-23
**Status:** OAuth implemented but blocked by Anthropic. Using API key auth.
