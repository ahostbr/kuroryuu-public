#!/usr/bin/env python3
# /// script
# requires-python = ">=3.10"
# dependencies = ["aiohttp"]
# ///
"""
model_router.py — Smart reverse proxy for Anthropic API requests.

Routes by model ID:
  - devstral / mistral  →  LM Studio  (http://169.254.83.107:1234)
  - everything else     →  Anthropic  (https://api.anthropic.com)

Listens on http://127.0.0.1:5111
"""

import asyncio
import json
import os
import signal
import sys
from pathlib import Path

import aiohttp
from aiohttp import web

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

LISTEN_HOST = "127.0.0.1"
LISTEN_PORT = 5111

ANTHROPIC_BASE = "https://api.anthropic.com"
LM_STUDIO_BASE = "http://169.254.83.107:1234"

TIMEOUT_LM_STUDIO = aiohttp.ClientTimeout(total=120)
TIMEOUT_ANTHROPIC = aiohttp.ClientTimeout(total=300)

# Headers to strip when forwarding to LM Studio
LM_STUDIO_STRIP_HEADERS = {"x-api-key"}

# Resolve PID file relative to this script's directory
SCRIPT_DIR = Path(__file__).resolve().parent
PID_FILE = SCRIPT_DIR / "proxy.pid"


# ---------------------------------------------------------------------------
# Routing logic
# ---------------------------------------------------------------------------

def _resolve_backend(model: str | None) -> tuple[str, str, aiohttp.ClientTimeout]:
    """Return (backend_base_url, label, timeout) for the given model string."""
    if model and any(kw in model.lower() for kw in ("devstral", "mistral")):
        return LM_STUDIO_BASE, "LM Studio", TIMEOUT_LM_STUDIO
    return ANTHROPIC_BASE, "Anthropic", TIMEOUT_ANTHROPIC


def _build_forward_headers(
    original_headers: "web.CIMultiDictProxy[str]",
    strip: set[str] | None = None,
) -> dict[str, str]:
    """Copy headers, optionally stripping a set of names (case-insensitive)."""
    strip_lower = {h.lower() for h in (strip or set())}
    return {
        k: v
        for k, v in original_headers.items()
        if k.lower() not in strip_lower
        # Drop hop-by-hop headers that aiohttp manages itself
        and k.lower() not in {"host", "transfer-encoding", "connection"}
    }


# ---------------------------------------------------------------------------
# Health endpoint
# ---------------------------------------------------------------------------

async def handle_health(request: web.Request) -> web.Response:
    return web.json_response({"status": "ok", "port": LISTEN_PORT})


# ---------------------------------------------------------------------------
# Proxy handler
# ---------------------------------------------------------------------------

async def handle_proxy(request: web.Request) -> web.StreamResponse:
    body_bytes = await request.read()

    # Attempt to parse model from JSON body
    model: str | None = None
    try:
        payload = json.loads(body_bytes)
        model = payload.get("model") if isinstance(payload, dict) else None
    except (json.JSONDecodeError, ValueError):
        pass  # Non-JSON body — route to Anthropic by default

    backend_base, backend_label, timeout = _resolve_backend(model)

    # Build target URL: backend_base + original path + query string
    target_url = backend_base.rstrip("/") + str(request.rel_url)

    # Decide which headers to strip
    strip = LM_STUDIO_STRIP_HEADERS if backend_label == "LM Studio" else None
    forward_headers = _build_forward_headers(request.headers, strip=strip)

    print(
        f"[proxy] {request.method} {request.path}"
        f" model={model or '<none>'} → {backend_label}",
        file=sys.stderr,
        flush=True,
    )

    session: aiohttp.ClientSession = request.app["session"]

    try:
        async with session.request(
            method=request.method,
            url=target_url,
            headers=forward_headers,
            data=body_bytes,
            timeout=timeout,
            allow_redirects=True,
        ) as upstream:
            # Prepare streaming response
            response = web.StreamResponse(
                status=upstream.status,
                reason=upstream.reason,
            )

            # Forward response headers (skip hop-by-hop)
            hop_by_hop = {
                "transfer-encoding",
                "connection",
                "keep-alive",
                "proxy-authenticate",
                "proxy-authorization",
                "te",
                "trailers",
                "upgrade",
            }
            for key, value in upstream.headers.items():
                if key.lower() not in hop_by_hop:
                    response.headers[key] = value

            await response.prepare(request)

            # Stream chunks through without buffering
            async for chunk in upstream.content.iter_any():
                await response.write(chunk)

            await response.write_eof()
            return response

    except aiohttp.ClientConnectorError as exc:
        print(f"[proxy] Connection error to {backend_label}: {exc}", file=sys.stderr, flush=True)
        return web.Response(
            status=502,
            text=json.dumps({"error": f"Proxy could not connect to {backend_label}: {exc}"}),
            content_type="application/json",
        )
    except asyncio.TimeoutError:
        print(f"[proxy] Timeout waiting for {backend_label}", file=sys.stderr, flush=True)
        return web.Response(
            status=504,
            text=json.dumps({"error": f"Upstream timeout ({backend_label})"}),
            content_type="application/json",
        )


# ---------------------------------------------------------------------------
# PID management
# ---------------------------------------------------------------------------

def _check_existing_pid() -> None:
    """Exit if another instance is already running."""
    if not PID_FILE.exists():
        return
    try:
        pid = int(PID_FILE.read_text().strip())
    except (ValueError, OSError):
        PID_FILE.unlink(missing_ok=True)
        return

    # Check if the process is alive
    try:
        os.kill(pid, 0)  # signal 0 = existence check, no-op otherwise
        print(
            f"[proxy] Already running (PID {pid}). "
            f"Remove {PID_FILE} to force restart.",
            file=sys.stderr,
        )
        sys.exit(1)
    except (ProcessLookupError, PermissionError):
        # Process gone — stale PID file
        PID_FILE.unlink(missing_ok=True)


def _write_pid() -> None:
    PID_FILE.parent.mkdir(parents=True, exist_ok=True)
    PID_FILE.write_text(str(os.getpid()))


def _remove_pid() -> None:
    PID_FILE.unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# App lifecycle
# ---------------------------------------------------------------------------

async def on_startup(app: web.Application) -> None:
    connector = aiohttp.TCPConnector(ssl=True)
    app["session"] = aiohttp.ClientSession(connector=connector)
    _write_pid()
    print(f"[proxy] Listening on http://{LISTEN_HOST}:{LISTEN_PORT}", file=sys.stderr, flush=True)


async def on_cleanup(app: web.Application) -> None:
    await app["session"].close()
    _remove_pid()
    print("[proxy] Shutdown complete.", file=sys.stderr, flush=True)


def build_app() -> web.Application:
    app = web.Application()
    app.on_startup.append(on_startup)
    app.on_cleanup.append(on_cleanup)

    app.router.add_get("/health", handle_health)
    # Catch-all: forward everything else
    app.router.add_route("*", "/{path_info:.*}", handle_proxy)

    return app


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    _check_existing_pid()

    app = build_app()
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)

    runner = web.AppRunner(app)

    async def _run() -> None:
        await runner.setup()
        site = web.TCPSite(runner, LISTEN_HOST, LISTEN_PORT)
        await site.start()

        stop_event = asyncio.Event()

        def _signal_handler(*_):
            stop_event.set()

        for sig in (signal.SIGINT, signal.SIGTERM):
            try:
                loop.add_signal_handler(sig, _signal_handler)
            except NotImplementedError:
                # Windows does not support add_signal_handler for all signals
                signal.signal(sig, _signal_handler)

        await stop_event.wait()
        await runner.cleanup()

    try:
        loop.run_until_complete(_run())
    finally:
        loop.close()


if __name__ == "__main__":
    main()
