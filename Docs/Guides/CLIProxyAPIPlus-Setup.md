# CLIProxyAPIPlus Setup Guide

**Version:** January 2026
**Source:** [github.com/router-for-me/CLIProxyAPIPlus](https://github.com/router-for-me/CLIProxyAPIPlus)

---

## Overview

CLIProxyAPIPlus is a multi-provider CLI proxy that exposes an **OpenAI-compatible API** (port 8317) for accessing multiple AI providers through a unified interface.

### Supported Providers

| Provider | Models | Tool Support | Auth Method |
|----------|--------|--------------|-------------|
| **Claude (Anthropic)** | 8+ | Yes | OAuth |
| **OpenAI GPT/Codex** | 9+ | Yes | OAuth |
| **Gemini (Google)** | 5+ | Yes | OAuth |
| **GitHub Copilot** | 17+ | Yes | OAuth |
| **Kiro (AWS)** | 9+ | No | AWS Builder ID |
| **Antigravity** | 6+ | No | Google OAuth |

### Key Features

- OpenAI-compatible `/v1/chat/completions` endpoint
- Automatic token refresh
- Built-in rate limiting
- Multi-account load balancing
- Request metrics/monitoring

---

## Prerequisites

- **Windows 10/11**, **macOS**, or **Linux**
- **Internet connection** for OAuth flows
- **One of:**
  - Docker Desktop (for Docker mode)
  - Direct download permissions (for Native mode)

---

## Installation

CLIProxyAPIPlus can be installed in two modes: **Native** (recommended) or **Docker**.

### Option A: Native Mode (Recommended)

Native mode runs CLIProxyAPIPlus as a standalone binary.

#### Automatic Installation (Kuroryuu Desktop)

1. Open **Kuroryuu Desktop**
2. Go to **Settings** > **CLI Proxy**
3. Click **Setup Wizard**
4. Select **Native Mode**
5. Click **Install** - the binary will be downloaded automatically

#### Manual Installation

1. Download the latest release for your platform:
   ```
   Windows: CLIProxyAPIPlus_latest_windows_amd64.zip
   macOS:   CLIProxyAPIPlus_latest_darwin_amd64.tar.gz
   Linux:   CLIProxyAPIPlus_latest_linux_amd64.tar.gz
   ```
   From: https://github.com/router-for-me/CLIProxyAPIPlus/releases/latest

2. Extract to your project's `.cliproxyapi/` directory:
   ```
   <project-root>/
   └── .cliproxyapi/
       ├── CLIProxyAPIPlus.exe  (or CLIProxyAPIPlus on Unix)
       ├── config.yaml
       └── auth/
   ```

3. Create `config.yaml`:
   ```yaml
   # CLIProxyAPIPlus Configuration
   port: 8317
   auth_token: "kuroryuu-local"
   auth-dir: "./auth"

   # OAuth callback ports
   gemini_callback_port: 8085
   claude_callback_port: 54545
   openai_callback_port: 1455
   copilot_callback_port: 54546
   kiro_callback_port: 54547
   antigravity_callback_port: 51121
   ```

4. Start the binary:
   ```bash
   ./.cliproxyapi/CLIProxyAPIPlus -config ./.cliproxyapi/config.yaml
   ```

#### Directory Priority

CLIProxyAPIPlus searches for configuration in this order:
1. **Project-local:** `<project>/.cliproxyapi/` (portable, recommended)
2. **Global (Windows):** `%APPDATA%\Kuroryuu\cliproxyapi\`
3. **Global (macOS):** `~/Library/Application Support/Kuroryuu/cliproxyapi/`
4. **Global (Linux):** `~/.config/Kuroryuu/cliproxyapi/`

### Option B: Docker Mode

Docker mode runs CLIProxyAPIPlus in a container.

1. Install [Docker Desktop](https://www.docker.com/products/docker-desktop)

2. Clone or configure the CLIProxyAPIPlus container path

3. Start via Docker Compose:
   ```bash
   cd /path/to/cliproxyapi
   docker compose up -d
   ```

4. Verify container is running:
   ```bash
   docker ps --filter name=cli-proxy-api
   ```

---

## Configuration Options

### config.yaml Reference

```yaml
# Server Configuration
host: ""              # Bind address (empty = all interfaces)
port: 8317            # API port

# Authentication
auth_token: "kuroryuu-local"  # Bearer token for API access
auth-dir: "./auth"            # Directory for OAuth tokens

# OAuth Callback Ports
gemini_callback_port: 8085        # Google OAuth
claude_callback_port: 54545       # Anthropic OAuth
openai_callback_port: 1455        # OpenAI OAuth
copilot_callback_port: 54546      # GitHub OAuth
kiro_callback_port: 54547         # AWS Builder ID
antigravity_callback_port: 51121  # Antigravity OAuth
```

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `KURORYUU_CLIPROXYAPI_URL` | `http://127.0.0.1:8317/v1` | API endpoint |
| `KURORYUU_CLIPROXYAPI_MODEL` | `claude-sonnet-4-20250514` | Default model |
| `CLIPROXYAPI_DOCKER_PATH` | (none) | Docker compose directory |

---

## OAuth Authentication

Each provider requires separate OAuth authentication. You only need to authenticate providers you plan to use.

### Via Kuroryuu Desktop (Recommended)

1. Open **Settings** > **CLI Proxy**
2. Click **Setup Wizard**
3. For each provider, click **Authenticate**
4. Complete the OAuth flow in your browser

### Via Command Line

#### Gemini (Google)
```bash
CLIProxyAPIPlus -login -no-browser -config config.yaml
# Copy the URL and complete in browser
```

#### Claude (Anthropic)
```bash
CLIProxyAPIPlus -claude-login -no-browser -config config.yaml
```

#### OpenAI/Codex
```bash
CLIProxyAPIPlus -codex-login -no-browser -config config.yaml
```

#### GitHub Copilot
```bash
CLIProxyAPIPlus -github-copilot-login -no-browser -config config.yaml
```

#### Kiro (AWS CodeWhisperer)
```bash
CLIProxyAPIPlus -kiro-aws-authcode -no-browser -config config.yaml
```

#### Antigravity
```bash
CLIProxyAPIPlus -antigravity-login -no-browser -config config.yaml
```

### Token Storage

OAuth tokens are stored in `<config-dir>/auth/`:
```
auth/
├── claude-*.json
├── codex-*.json
├── github-copilot-*.json
├── gemini-*.json
├── kiro-*.json
└── antigravity-*.json
```

---

## Usage Examples

### Verify Installation

```bash
# Check if API is responding
curl http://127.0.0.1:8317/v1/models \
  -H "Authorization: Bearer kuroryuu-local"

# Expected: JSON list of available models
```

### Check Binary Version

```bash
./.cliproxyapi/CLIProxyAPIPlus -version
```

### List Available Models

```bash
curl -s http://127.0.0.1:8317/v1/models \
  -H "Authorization: Bearer kuroryuu-local" | jq '.data[].id'
```

### Chat Completion Request

```bash
curl http://127.0.0.1:8317/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer kuroryuu-local" \
  -d '{
    "model": "claude-sonnet-4-20250514",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### Using with Kuroryuu CLI

```bash
# Run agent with Claude Opus
python -m apps.gateway.cli.agent_runner --model opus

# Run with GPT-5 Codex
python -m apps.gateway.cli.agent_runner --model codex

# Run with Gemini Pro
python -m apps.gateway.cli.agent_runner --model gemini
```

### Using with Kuroryuu Gateway

The Gateway backend automatically connects to CLIProxyAPIPlus:

```python
from apps.gateway.llm.backends.cliproxyapi import CLIProxyAPIBackend

backend = CLIProxyAPIBackend()
health = await backend.health_check()
print(health)  # {'ok': True, 'backend': 'cliproxyapi', ...}
```

---

## Migration: Global to Project-Local

To migrate from global (`%APPDATA%`) to project-local (`.cliproxyapi/`):

```powershell
# Windows PowerShell
powershell -ExecutionPolicy Bypass -File apps/desktop/scripts/migrate-cliproxy-to-local.ps1
```

This copies:
- Binary (`CLIProxyAPIPlus.exe`)
- Auth tokens (`auth/*.json`)
- Creates new `config.yaml` with relative paths

---

## Troubleshooting

### API Not Responding (Connection Refused)

**Cause:** CLIProxyAPIPlus not running

**Solution:**
```bash
# Check if process is running
# Windows:
tasklist | findstr CLIProxyAPIPlus

# Start manually:
./.cliproxyapi/CLIProxyAPIPlus -config ./.cliproxyapi/config.yaml
```

### 401 Unauthorized

**Cause:** Wrong auth token or no providers authenticated

**Solution:**
1. Verify `auth_token` in config.yaml matches your request header
2. Authenticate at least one provider (see OAuth Authentication section)

### No Models Available

**Cause:** No providers authenticated

**Solution:**
```bash
# Check which providers are authenticated
curl http://127.0.0.1:8317/v1/models \
  -H "Authorization: Bearer kuroryuu-local"

# Authenticate missing providers
CLIProxyAPIPlus -claude-login -config config.yaml
```

### OAuth Flow Stuck

**Cause:** Browser didn't complete the flow

**Solution:**
1. Use `-no-browser` flag to get URL manually
2. Copy URL to browser
3. Complete authentication
4. Wait for "Authentication successful" message

### Port Already in Use

**Cause:** Another instance running or port conflict

**Solution:**
```bash
# Windows - find process using port 8317
netstat -ano | findstr :8317
taskkill /PID <pid> /F

# Linux/macOS
lsof -i :8317
kill <pid>
```

### Binary Permission Denied (Unix)

**Cause:** Binary not executable

**Solution:**
```bash
chmod +x ./.cliproxyapi/CLIProxyAPIPlus
```

---

## Related Documentation

- [CLI Multi-Provider Reference](./CLI_MULTI_PROVIDER_REFERENCE.md) - Model shorthands and interactive commands
- [Gateway Architecture](../Architecture/GATEWAY_ARCHITECTURE.md) - Backend integration details

---

*Generated: 2026-01-30*
