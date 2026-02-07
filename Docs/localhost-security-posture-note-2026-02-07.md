# Localhost Security Posture Note (2026-02-07)

## Purpose
Document the agreed security model for Kuroryuu local deployment and Docker runtime.

## Agreed Threat Model
- System is operated by a trusted local owner.
- Services are intentionally localhost-only.
- If an attacker already has local/admin execution on the host, the machine is considered compromised.
- Additional network controls beyond localhost binding do not materially change that local-compromise scenario.

## Confirmed Runtime Posture
- Docker Compose publishes service ports to loopback only:
  - `127.0.0.1:8100:8100` (`docker-compose.yml`)
  - `127.0.0.1:8200:8200` (`docker-compose.yml`)
  - `127.0.0.1:7072:7072` and `127.0.0.1:7073:7073` (`docker-compose.yml`)
  - `127.0.0.1:3000:3000` (`docker-compose.yml`)
- Container-internal `0.0.0.0` binds are expected in Docker and acceptable when host publish remains loopback-only.
- Gateway includes request-level blocking for external connections (`apps/gateway/traffic/middleware.py`).
- Project guidance for remote access is tunnel-based (Cloudflare Tunnel or Tailscale), not direct external exposure.

## Operational Guardrails
- Do not change Compose port publishing from `127.0.0.1:...` to `0.0.0.0:...` or bare host ports.
- Do not expose gateway/MCP directly to LAN/WAN.
- If remote access is needed, use authenticated tunnel patterns (Cloudflare/Tailscale).

## Conclusion
Under this threat model and current configuration, external network exposure is closed and the localhost-only posture is consistent with the intended security design.
