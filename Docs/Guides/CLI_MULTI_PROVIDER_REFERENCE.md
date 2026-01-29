# Kuroryuu CLI Multi-Provider Reference Guide

**Version:** January 2026 Update
**Location:** `apps/gateway/cli/agent_runner.py`

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Command Line Arguments](#command-line-arguments)
4. [Model Shorthands](#model-shorthands)
5. [Interactive Commands](#interactive-commands)
6. [Backend Architecture](#backend-architecture)
7. [OAuth System](#oauth-system)
8. [Configuration](#configuration)
9. [Troubleshooting](#troubleshooting)

---

## Overview

The Kuroryuu CLI Agent Runner is a multi-backend AI assistant that supports **46+ models across 6 providers** via CLIProxyAPI, plus local models via LMStudio.

### Supported Providers

| Provider | Models | Tool Support | Auth Method |
|----------|--------|--------------|-------------|
| **Claude (Anthropic)** | 8 | Yes | OAuth |
| **OpenAI (GPT-5)** | 9 | Yes | OAuth |
| **Gemini (Google)** | 5 | Yes | OAuth |
| **GitHub Copilot** | 17 | Yes | OAuth |
| **Kiro (AWS)** | 9 | No | OAuth |
| **Antigravity** | 6 | No | OAuth |
| **LMStudio (Local)** | Variable | Yes | None |

---

## Quick Start

```bash
# Basic usage (auto-fallback: LMStudio -> CLIProxyAPI)
python -m apps.gateway.cli.agent_runner

# Use Claude Opus via shorthand
python -m apps.gateway.cli.agent_runner --model opus

# Use GPT-5 Codex
python -m apps.gateway.cli.agent_runner --model codex

# Use Gemini Pro
python -m apps.gateway.cli.agent_runner --model gemini

# List all available models
python -m apps.gateway.cli.agent_runner --list-models

# Check OAuth status for all providers
python -m apps.gateway.cli.agent_runner --auth-status

# Start OAuth login for a provider
python -m apps.gateway.cli.agent_runner --login claude
```

---

## Command Line Arguments

### Core Arguments

| Flag | Type | Default | Description |
|------|------|---------|-------------|
| `--name` | str | Auto-generated | Agent name for identification |
| `--gateway` | str | `http://127.0.0.1:8200` | Gateway URL for agent registration |
| `--backend` | choices | `auto` | Backend: `lmstudio`, `cliproxyapi`, `claude`, `auto` |
| `--model` | str | None | Model name or shorthand (opus, gpt5, gemini) |
| `--daemon` | flag | False | Run as daemon (non-interactive polling mode) |

### Backend URLs

| Flag | Default | Description |
|------|---------|-------------|
| `--lmstudio` | `http://127.0.0.1:1234` | LMStudio backend URL |
| `--cliproxyapi` | `http://127.0.0.1:8317` | CLIProxyAPI backend URL |

### Utility Commands (Non-Interactive)

| Flag | Description |
|------|-------------|
| `--list-models` | List all available models grouped by provider |
| `--auth-status` | Show OAuth authentication status for all providers |
| `--login PROVIDER` | Start OAuth login (claude, openai, gemini, copilot, kiro, antigravity) |

---

## Model Shorthands

### Claude Family (8 models, all support tools)

| Shorthand | Full Model ID | Notes |
|-----------|---------------|-------|
| `opus` | claude-opus-4-5-20251101 | Latest, most capable |
| `opus4.5` | claude-opus-4-5-20251101 | Explicit version |
| `opus4.1` | claude-opus-4-1-20250805 | Previous stable |
| `opus4` | claude-opus-4-20250514 | Older version |
| `sonnet` | claude-sonnet-4-5-20250929 | Balanced speed/quality |
| `sonnet4.5` | claude-sonnet-4-5-20250929 | Explicit version |
| `sonnet4` | claude-sonnet-4-20250514 | Previous stable |
| `sonnet3.7` | claude-3-7-sonnet-20250219 | Older version |
| `haiku` | claude-haiku-4-5-20251001 | Fast, lightweight |
| `haiku4.5` | claude-haiku-4-5-20251001 | Explicit version |
| `haiku3.5` | claude-3-5-haiku-20241022 | Previous version |

### OpenAI/GPT Family (9 models, all support tools)

| Shorthand | Full Model ID | Notes |
|-----------|---------------|-------|
| `gpt5` | gpt-5 | Latest GPT-5 |
| `gpt5.1` | gpt-5.1 | GPT-5.1 variant |
| `gpt5.2` | gpt-5.2 | GPT-5.2 variant |
| `codex` | gpt-5-codex | Code-optimized |
| `codex5` | gpt-5-codex | Explicit version |
| `codex5.1` | gpt-5.1-codex | Code 5.1 |
| `codex-max` | gpt-5.1-codex-max | Maximum capability |
| `codex-mini` | gpt-5.1-codex-mini | Lightweight |

### Gemini Family (5 models, all support tools)

| Shorthand | Full Model ID | Notes |
|-----------|---------------|-------|
| `gemini` | gemini-2.5-pro | Default high-cap |
| `gemini-pro` | gemini-2.5-pro | Pro variant |
| `gemini2.5` | gemini-2.5-pro | Explicit version |
| `flash` | gemini-2.5-flash | Fast inference |
| `gemini-flash` | gemini-2.5-flash | Explicit naming |
| `flash-lite` | gemini-2.5-flash-lite | Lightweight |
| `gemini3` | gemini-3-pro-preview | Preview |
| `gemini3-flash` | gemini-3-flash-preview | Flash preview |

### GitHub Copilot Family (17+ models, support tools)

| Shorthand | Full Model ID | Notes |
|-----------|---------------|-------|
| `copilot` | gpt-4o | Default Copilot |
| `gpt4o` | gpt-4o | GPT-4o |
| `gpt4.1` | gpt-4.1 | GPT-4.1 |
| `grok` | grok-code-fast-1 | Grok code |
| `raptor` | oswe-vscode-prime | VSCode |

### Kiro/AWS Family (9 models, NO tool support)

| Shorthand | Full Model ID | Notes |
|-----------|---------------|-------|
| `kiro` | kiro-auto | Auto-routing |
| `kiro-opus` | kiro-claude-opus-4-5 | Opus via Kiro |
| `kiro-sonnet` | kiro-claude-sonnet-4-5 | Sonnet via Kiro |
| `kiro-haiku` | kiro-claude-haiku-4-5 | Haiku via Kiro |
| `kiro-agentic` | kiro-claude-sonnet-4-5-agentic | Agentic variant |

### Antigravity Family (6 models, NO tool support)

| Shorthand | Full Model ID | Notes |
|-----------|---------------|-------|
| `antigravity` | gemini-claude-sonnet-4-5 | Hybrid model |
| `thinking` | gemini-claude-sonnet-4-5-thinking | Extended reasoning |
| `thinking-opus` | gemini-claude-opus-4-5-thinking | Opus + thinking |
| `gpt-oss` | gpt-oss-120b-medium | OSS variant |

---

## Interactive Commands

When running in interactive mode (default), these slash commands are available:

### `/status`
Display current agent status and configuration.

```
[agent] devstral_20260126_120000_abc12345
[gateway] http://127.0.0.1:8200
[backend] cliproxyapi
[model] claude-opus-4-5-20251101
[tools] supported
[history] 5 messages
```

### `/model [shorthand]`
Switch models mid-session.

**Without argument:** Opens interactive provider menu
```
Providers (61+ models available):
  [1] Claude              8 models [tools]
  [2] OpenAI (GPT-5)      9 models [tools]
  [3] Gemini              5 models [tools]
  [4] GitHub Copilot     21 models [tools]
  [5] Kiro (AWS)          9 models [no-tools]
  [6] Antigravity        10 models [no-tools]
  [7] LMStudio (local)    ? models [tools]
```

**With argument:** Direct switch
```
/model opus        → Switches to Claude Opus 4.5
/model gpt5        → Switches to GPT-5
/model gemini      → Switches to Gemini 2.5 Pro
```

### `/providers`
Show provider health dashboard with model counts.

```
============================================================
PROVIDER HEALTH DASHBOARD
============================================================
[OK] claude              8 models  [tools]
[OK] openai              1 models  [tools]
[OK] gemini              5 models  [tools]
[OK] github-copilot     17 models  [tools]
[OK] kiro                9 models  [completion]
[OK] antigravity         6 models  [completion]
------------------------------------------------------------
Total: 46 models available
CLIProxyAPI: http://127.0.0.1:8317
```

### `/clear`
Clear conversation history (keeps model/backend settings).

### `/restart`
Restart the agent completely.

### `/quit` or `/exit`
Gracefully exit the agent.

### `/help`
Display all available commands.

---

## Backend Architecture

### Auto-Fallback Chain

When using `--backend auto` (default):
1. Try **LMStudio** first (local, fastest)
2. Fall back to **CLIProxyAPI** (multi-provider)
3. Fall back to native **Claude SDK**

### Circuit Breaker Pattern

The system protects against cascading failures:

| Parameter | Default | Env Variable |
|-----------|---------|--------------|
| Failure threshold | 3 | `KURORYUU_FALLBACK_THRESHOLD` |
| Cooldown period | 60s | `KURORYUU_FALLBACK_COOLDOWN` |
| Health cache TTL | 30s | `KURORYUU_HEALTH_CACHE_TTL` |

### Health Checking

- **Timeout:** 5 seconds per attempt
- **Retries:** 3 attempts with exponential backoff [1, 2, 4] seconds
- **Success criteria:** `health["ok"] == True`

### Tool Support Detection

| Provider | Tool Support | Notes |
|----------|--------------|-------|
| Claude | ALL models | Native tool calling |
| OpenAI GPT-4/5 | Yes | Function calling |
| OpenAI o1/o3 | **NO** | Reasoning-only |
| Gemini | ALL models | Function calling |
| Copilot | Yes | Via GitHub |
| Kiro | **NO** | Code completion only |
| Antigravity | **NO** | Proxied models |

---

## OAuth System

### Authentication Commands

```bash
# View status for all providers
python -m apps.gateway.cli.agent_runner --auth-status

# Login to specific provider
python -m apps.gateway.cli.agent_runner --login claude
python -m apps.gateway.cli.agent_runner --login openai
python -m apps.gateway.cli.agent_runner --login gemini
python -m apps.gateway.cli.agent_runner --login copilot
python -m apps.gateway.cli.agent_runner --login kiro
python -m apps.gateway.cli.agent_runner --login antigravity
```

### OAuth Provider Flags

| Provider | CLI Flag | Notes |
|----------|----------|-------|
| Claude | `-claude-login` | Anthropic OAuth |
| OpenAI | `-codex-login` | GPT models |
| Gemini | `-login` | Google OAuth |
| Copilot | `-github-copilot-login` | GitHub OAuth |
| Kiro | `-kiro-aws-authcode` | AWS Builder ID |
| Antigravity | `-antigravity-login` | Hybrid provider |

### Credential Storage

**CLIProxyAPI credentials:**
```
Priority 1: $KURORYUU_PROJECT_ROOT/.cliproxyapi/
Priority 2: %APPDATA%\Kuroryuu\cliproxyapi\
Priority 3: Docker container (cli-proxy-api)
```

**Structure:**
```
.cliproxyapi/
├── CLIProxyAPIPlus.exe    # Binary
├── config.yaml            # Configuration
└── auth/                  # OAuth tokens
    ├── claude-*.json
    ├── codex-*.json
    ├── github-copilot-*.json
    ├── kiro-*.json
    ├── antigravity-*.json
    └── gemini-*.json
```

---

## Configuration

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `KURORYUU_PROJECT_ROOT` | Auto-detect | Project root for `.cliproxyapi/` |
| `KURORYUU_LLM_BACKEND` | `lmstudio` | Primary backend |
| `KURORYUU_LLM_BACKENDS` | `lmstudio,cliproxyapi` | Fallback chain |
| `KURORYUU_LMSTUDIO_BASE_URL` | `http://127.0.0.1:1234/v1` | LMStudio endpoint |
| `KURORYUU_CLIPROXYAPI_URL` | `http://127.0.0.1:8317/v1` | CLIProxyAPI endpoint |
| `ANTHROPIC_API_KEY` | (required for direct) | Claude API key |

### Default Ports

| Service | Port | Purpose |
|---------|------|---------|
| Gateway | 8200 | Agent registration, heartbeats |
| LMStudio | 1234 | Local model inference |
| CLIProxyAPI | 8317 | Multi-provider gateway |

### Timing Configuration

| Parameter | Value | Purpose |
|-----------|-------|---------|
| Heartbeat interval | 5s | Agent keepalive |
| Poll interval | 2s | Work inbox check |
| Max retries | 3 | Backend health checks |
| Retry backoff | [1, 2, 4]s | Exponential delays |

---

## Troubleshooting

### "CLIProxyAPI returned 401"
**Cause:** CLIProxyAPI not running or not authenticated
**Solution:**
```bash
# Check if running
curl http://127.0.0.1:8317/v1/models

# Re-authenticate
python -m apps.gateway.cli.agent_runner --login claude
```

### "Backend unreachable"
**Cause:** Backend service offline
**Solution:**
1. Check service status: `python -m apps.gateway.cli.agent_runner --auth-status`
2. Start LMStudio or CLIProxyAPI
3. Verify URLs with `--lmstudio` or `--cliproxyapi` flags

### "Model not found"
**Cause:** Invalid shorthand or model ID
**Solution:**
```bash
# List available models
python -m apps.gateway.cli.agent_runner --list-models

# Use exact model ID
python -m apps.gateway.cli.agent_runner --model claude-opus-4-5-20251101
```

### "Tools not supported"
**Cause:** Using Kiro, Antigravity, or o1 models
**Solution:** Switch to Claude, GPT-5, Gemini, or Copilot models for tool support

### OAuth Flow Stuck
**Cause:** Browser didn't complete flow
**Solution:**
1. Check browser for OAuth popup
2. Manually copy auth URL if blocked
3. Retry: `python -m apps.gateway.cli.agent_runner --login <provider>`

---

## File Locations

| File | Purpose |
|------|---------|
| `apps/gateway/cli/agent_runner.py` | Main CLI (955 lines) |
| `apps/gateway/cli/model_shorthands.py` | Shorthand mappings (170 lines) |
| `apps/gateway/llm/backends/registry.py` | Backend registry + circuit breaker |
| `apps/gateway/llm/backends/cliproxyapi.py` | CLIProxyAPI backend |
| `apps/gateway/llm/backends/lmstudio.py` | LMStudio backend |
| `apps/gateway/llm/backends/claude.py` | Direct Claude backend |

---

## Version History

- **January 2026:** Multi-provider upgrade with 46+ models, OAuth integration, model shorthands, interactive commands
- **Previous:** LMStudio-only support

---

*Generated: 2026-01-26*
