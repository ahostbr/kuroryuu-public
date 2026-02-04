# Kuroryuu Security Guide

This document describes Kuroryuu's security model and best practices for deployment.

## TL;DR

- **Kuroryuu is localhost-only by default** - all services bind to 127.0.0.1
- **External access requires a tunnel** - use Cloudflare Tunnel or Tailscale
- **Never expose ports directly to the internet** - this bypasses all security

---

## Security Model

Kuroryuu is designed as a **local-first** application. The gateway, MCP server, and all services assume they are running on the same machine as the user and are not exposed to untrusted networks.

### Why Localhost-Only?

1. **No authentication on API endpoints** - The API is designed for local agent communication
2. **Desktop secret can be registered by any local process** - Only localhost can register
3. **WebSocket connections carry sensitive data** - Agent messages, terminal output, etc.
4. **MCP tools have system access** - File operations, shell commands, etc.

### What's Protected

| Attack Vector | Protection |
|---------------|------------|
| CORS/CSRF from malicious websites | CORS restricted to localhost + Electron |
| X-Forwarded-For header spoofing | Only use request.client.host |
| Wildcard proxy trust | Startup fails if `*` configured |
| Direct external exposure | All external IPs are auto-blocked |
| WebSocket from foreign origin | Origin validation on all WS endpoints |
| Desktop auth from external IP | 403 Forbidden |
| POST/PUT/DELETE from foreign origin | Origin validation middleware |

---

## Secure Remote Access

If you need to access Kuroryuu remotely, **do not expose ports directly**. Instead, use a secure tunnel:

### Option 1: Cloudflare Tunnel (Recommended)

Cloudflare Tunnel provides:
- Zero-trust authentication
- DDoS protection
- SSL/TLS encryption
- Access policies

Setup:
```bash
# Install cloudflared
# https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/

# Create tunnel
cloudflared tunnel create kuroryuu

# Configure tunnel to point to localhost:8200
cloudflared tunnel route dns kuroryuu kuroryuu.yourdomain.com

# Run tunnel
cloudflared tunnel run kuroryuu
```

### Option 2: Tailscale

Tailscale provides:
- WireGuard-based VPN
- Device authentication
- No port forwarding required
- Works through NAT

Setup:
```bash
# Install Tailscale
# https://tailscale.com/download

# Authenticate
tailscale up

# Access from other Tailscale devices via:
# http://<tailscale-ip>:8200
```

---

## Docker Deployment

When running in Docker, all ports are bound to localhost by default:

```yaml
ports:
  - "127.0.0.1:8200:8200"  # Gateway
  - "127.0.0.1:8100:8100"  # MCP Core
  - "127.0.0.1:3000:3000"  # Web UI
```

**Never change these to `0.0.0.0:8200:8200`** - this exposes the service to the network.

The containers internally bind to `0.0.0.0` (required for Docker networking), but the host port mapping restricts access to localhost.

---

## Configuration Reference

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `KURORYUU_GATEWAY_HOST` | `127.0.0.1` | Server bind address |
| `KURORYUU_CORS_ORIGINS` | localhost variants | Allowed CORS origins |
| `KURORYUU_TRUSTED_PROXIES` | (none) | Trusted proxy IPs (no wildcards) |

### CORS Origins

Default allowed origins:
- `http://localhost:3000` (Web UI)
- `http://127.0.0.1:3000`
- `http://localhost:5173` (Vite dev)
- `http://127.0.0.1:5173`
- `http://localhost:8200` (Gateway)
- `http://127.0.0.1:8200`
- `null` (Electron renderer)

### Trusted Proxies

If running behind a reverse proxy (nginx, Caddy):

```bash
# CORRECT: Specific proxy IPs
KURORYUU_TRUSTED_PROXIES=10.0.0.1,10.0.0.2

# WRONG: Wildcard (startup will fail)
KURORYUU_TRUSTED_PROXIES=*
```

---

## Security Checklist

Before deploying Kuroryuu:

- [ ] All ports bound to `127.0.0.1` (not `0.0.0.0`)
- [ ] No wildcard CORS (`*`) configured
- [ ] No wildcard proxy trust (`*`) configured
- [ ] Remote access via tunnel (Cloudflare/Tailscale), not direct exposure
- [ ] Desktop app runs on same machine as gateway
- [ ] Firewall blocks external access to ports 8200, 8100, 3000, 7072-7073

---

## Reporting Security Issues

If you discover a security vulnerability, please report it privately rather than opening a public issue.

Contact: [security contact information]

---

## Changelog

- **2026-02-04**: Initial security hardening
  - Removed `ALLOW_EXTERNAL` config option
  - Added origin validation for WebSocket and POST requests
  - Restricted desktop auth to localhost
  - Docker ports bound to localhost
  - Reject wildcard proxy trust
  - Fixed X-Forwarded-For header trust vulnerability
