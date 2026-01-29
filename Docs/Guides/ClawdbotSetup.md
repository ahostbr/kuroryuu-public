# Clawdbot Setup Guide

Clawdbot is an autonomous AI worker that runs in a Docker container, allowing you to delegate tasks to an independent AI agent. This guide covers setup, configuration, and usage.

## Prerequisites

1. **Docker Desktop** - Required for running the Clawdbot container
   - Download from [docker.com](https://www.docker.com/products/docker-desktop)
   - Ensure Docker is running before using Clawdbot

2. **Clawdbot Docker Image** - Must be built or pulled
   - Image name: `clawdbot:local`

## Building the Image

If you don't have the Clawdbot image:

```bash
# Clone the Clawdbot repository (if not already present)
git clone https://github.com/your-org/clawdbot.git

# Build the image
cd clawdbot
docker build -t clawdbot:local .
```

## Enabling Clawdbot

### Method 1: Kuroryuu Desktop (Recommended)

1. Open Kuroryuu Desktop
2. Go to **Settings** → **Integrations**
3. Find the **Autonomous Worker** section
4. Toggle **Clawdbot Worker** to enable
5. Click **Start Container** once Docker is available

### Method 2: Environment Variable

Set the environment variable before launching:

```bash
# Windows (PowerShell)
$env:KURORYUU_CLAWD_ENABLED = "1"

# Windows (CMD)
set KURORYUU_CLAWD_ENABLED=1

# Linux/macOS
export KURORYUU_CLAWD_ENABLED=1
```

With this set, Clawdbot will auto-start when Kuroryuu Desktop launches.

## Provider Configuration

Clawdbot supports multiple AI providers. Configure them in Kuroryuu Desktop:

### LM Studio (Local Models)

1. Open **Settings** → **Integrations** → **Clawdbot Worker**
2. Expand the **Provider Configuration** section
3. Expand **LM Studio** accordion
4. Enable and set Base URL to `http://host.docker.internal:1234/v1`
5. Click **Test Connection** to auto-discover models
6. Select a primary model
7. Click **Save Configuration**

> **Note**: Use `host.docker.internal` instead of `localhost` to access your host machine from within Docker.

### Ollama (Local Models)

1. Expand **Ollama** accordion
2. Enable and set Base URL to `http://host.docker.internal:11434`
3. Click **Test Connection** to discover available models
4. Select a primary model
5. Click **Save Configuration**

### Anthropic (Claude)

1. Expand **Anthropic (Claude)** accordion
2. Enable and enter your API key
3. Click **Test Connection** to verify
4. Click **Save Configuration**

### OpenAI (GPT)

1. Expand **OpenAI (GPT)** accordion
2. Enable and enter your API key
3. Click **Test Connection** to verify
4. Click **Save Configuration**

## Usage

### Via MCP Tool (CLI)

Use the `k_clawd` MCP tool from Claude Code or other AI agents:

```bash
# Check status
k_clawd(action="status")

# Submit a task
k_clawd(action="task", prompt="Analyze this code for security issues: ...")

# Get recent results
k_clawd(action="results")
```

### Via HOME Screen Widget

1. Go to **HOME** in Kuroryuu Desktop
2. Scroll to **Features** section
3. Expand **Clawdbot Worker**
4. Use the **Quick Task** input to submit tasks
5. View recent task results inline

### Via Control UI

1. Start the Clawdbot container
2. Click **Open Dashboard** in the Clawdbot section
3. Access the web UI at `http://localhost:18789?token=kuroryuu-clawd-2026`

## Configuration File Location

Provider configuration is stored in a Docker volume:

```
Docker Volume: clawdbot-state
Path: /home/node/.clawdbot/clawdbot.json
```

### Configuration Format

```json
{
  "gateway": {
    "mode": "local",
    "auth": { "mode": "token", "token": "kuroryuu-clawd-2026" },
    "controlUi": { "allowInsecureAuth": true }
  },
  "agents": {
    "defaults": {
      "model": { "primary": "lmstudio/mistral-small" }
    }
  },
  "models": {
    "mode": "merge",
    "providers": {
      "lmstudio": {
        "baseUrl": "http://host.docker.internal:1234/v1",
        "apiKey": "lmstudio",
        "api": "openai-responses",
        "models": [
          { "id": "mistral-small", "name": "Mistral Small", "contextWindow": 32768, "maxTokens": 4096 }
        ]
      }
    }
  }
}
```

## Troubleshooting

### Docker Not Available

- Ensure Docker Desktop is running
- Check that Docker is in your PATH
- Try restarting Docker Desktop

### Container Won't Start

1. Check if the image exists: `docker images | grep clawdbot`
2. Check for port conflicts: ports 18789 and 18790 must be free
3. View container logs: `docker logs clawdbot-gateway`

### Can't Connect to LM Studio / Ollama

- Use `host.docker.internal` instead of `localhost`
- Ensure the service is running on your host machine
- Check firewall settings

### Git Bash Issues (Windows)

If using Git Bash on Windows, the `docker exec` commands may fail due to TTY issues. Use PowerShell or CMD instead:

```powershell
# PowerShell
docker exec clawdbot-gateway node dist/index.js agent --message "Your task"
```

### API Key Issues

- API keys are masked after saving (shown as `••••••••`)
- To update an API key, enter the new key and save again
- Test the connection before saving to verify the key works

## Network Ports

| Port | Service |
|------|---------|
| 18789 | Gateway HTTP API + Control UI WebSocket |
| 18790 | Gateway HTTP API (alternative) |

## Security Considerations

- Clawdbot runs in a sandboxed Docker container
- API keys are stored in the Docker volume (encrypted at rest by Docker)
- The gateway token `kuroryuu-clawd-2026` is used for authentication
- The container has network access via `host.docker.internal`

## Auto-Start on App Launch

To have Clawdbot start automatically when Kuroryuu Desktop launches:

1. Enable Clawdbot in Integrations
2. Start the container at least once
3. Set `KURORYUU_CLAWD_ENABLED=1` environment variable
4. Restart Kuroryuu Desktop

The container will auto-start if enabled and Docker is available.

## Related Documentation

- [Kuroryuu Desktop Guide](./KuroryuuDesktop.md)
- [MCP Tools Reference](./MCPTools.md)
- [Integration Configuration](./Integrations.md)
