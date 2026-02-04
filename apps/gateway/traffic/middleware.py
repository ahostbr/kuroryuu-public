"""
Traffic Monitoring Middleware
Captures all HTTP requests with full body/header data and broadcasts events via WebSocket.
Includes security integration for threat detection and auto-blocking.
"""
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import StreamingResponse
import time
import uuid
import asyncio
import re
from datetime import datetime
from typing import Callable, Dict, Any
from io import BytesIO

from .websocket import traffic_ws_manager
from .tracker import traffic_tracker
from .models import TrafficEventDetail, filter_headers, truncate_body, create_body_preview, MAX_BODY_SIZE
from .storage import traffic_storage
from ..utils.logging_config import get_logger
from ..config import config

# Security imports
from ..security.blocklist import blocklist, ThreatInfo
from ..security.intel import gather_intel, broadcast_intel_update
from ..security.defense import is_lockdown_mode, broadcast_ip_blocked

logger = get_logger(__name__)


# =============================================================================
# ORIGIN VALIDATION MIDDLEWARE (Security Hardening - Phase 4)
# =============================================================================

class OriginValidationMiddleware(BaseHTTPMiddleware):
    """Validates Origin header for state-changing requests (POST/PUT/DELETE).

    SECURITY: Prevents CSRF attacks by rejecting requests from foreign origins.

    Allows:
    - All GET/HEAD/OPTIONS requests (read-only, safe methods)
    - Requests with valid X-Kuroryuu-Desktop-Secret header
    - Localhost-to-localhost requests (server-to-server, CLI tools)
    - Browser requests with localhost Origin header
    - Requests with "null" Origin (Electron renderer)

    Rejects:
    - POST/PUT/DELETE from foreign origins (e.g., evil.com)
    """

    # Paths that should bypass origin validation (webhooks, callbacks, etc.)
    BYPASS_PATHS = {
        "/v1/health",
        "/login",
        "/logout",
    }

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Allow safe methods (GET, HEAD, OPTIONS)
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return await call_next(request)

        # Allow bypass paths
        path = request.url.path
        if path in self.BYPASS_PATHS:
            return await call_next(request)

        # Allow if request has valid Desktop secret
        desktop_secret = request.headers.get("x-kuroryuu-desktop-secret")
        if desktop_secret:
            # Desktop secret validation is handled by the endpoint itself
            # If header is present, it's likely a legitimate Desktop request
            return await call_next(request)

        # Get client IP
        client_ip = request.client.host if request.client else None

        # Allow localhost-to-localhost (server-to-server, CLI tools)
        if client_ip in ("127.0.0.1", "::1", "localhost"):
            return await call_next(request)

        # Check Origin header for browser requests
        origin = request.headers.get("origin")

        if origin:
            # Allow localhost origins
            if "localhost" in origin or "127.0.0.1" in origin:
                return await call_next(request)

            # Allow "null" origin (Electron renderer, file:// protocol)
            if origin == "null":
                return await call_next(request)

            # Reject foreign origins
            logger.warning(
                f"[SECURITY] Blocked request from foreign origin: {origin} "
                f"to {request.method} {path}"
            )
            return Response(
                content='{"error": "Forbidden", "detail": "Invalid origin"}',
                status_code=403,
                media_type="application/json",
            )

        # No Origin header - check Referer as fallback
        referer = request.headers.get("referer")
        if referer:
            if "localhost" in referer or "127.0.0.1" in referer:
                return await call_next(request)

            logger.warning(
                f"[SECURITY] Blocked request with foreign referer: {referer} "
                f"to {request.method} {path}"
            )
            return Response(
                content='{"error": "Forbidden", "detail": "Invalid referer"}',
                status_code=403,
                media_type="application/json",
            )

        # No Origin or Referer - likely a direct API call (curl, CLI, etc.)
        # Allow if from localhost IP (already checked above), otherwise block
        if client_ip and not client_ip.startswith("127.") and client_ip not in ("::1", "localhost"):
            logger.warning(
                f"[SECURITY] Blocked external API call without origin: {client_ip} "
                f"to {request.method} {path}"
            )
            return Response(
                content='{"error": "Forbidden", "detail": "External access requires valid origin"}',
                status_code=403,
                media_type="application/json",
            )

        return await call_next(request)

# Endpoints to exclude from traffic monitoring (high frequency / internal)
EXCLUDED_PATHS = {
    "/health",
    "/ws/traffic-flow",
    "/v1/traffic/stats",
    "/v1/traffic/history",
    "/v1/traffic/events",
    "/v1/traffic/endpoints",
    "/favicon.ico",
}

# Content types to capture body for
CAPTURABLE_CONTENT_TYPES = {
    "application/json",
    "application/xml",
    "text/plain",
    "text/html",
    "text/xml",
    "application/x-www-form-urlencoded",
}


def normalize_endpoint(path: str) -> str:
    """
    Normalize endpoint path by replacing dynamic segments with :id placeholders.

    This prevents endpoint explosion from unique agent IDs, session IDs, etc.

    Examples:
        /v1/agents/cli-00baet6n/heartbeat -> /v1/agents/:id/heartbeat
        /v1/sessions/550e8400-e29b-41d4-a716-446655440000 -> /v1/sessions/:id
        /v1/agents/kuroryuu_cli_20260130_231349_a35fa3ca/heartbeat -> /v1/agents/:id/heartbeat
        /v1/leader/messages/worker_custom_1767991969081 -> /v1/leader/messages/:id
    """
    # UUID pattern (8-4-4-4-12 hex)
    path = re.sub(
        r'/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=/|$)',
        '/:id',
        path,
        flags=re.IGNORECASE
    )
    # Kuroryuu-style agent IDs: kuroryuu_cli_YYYYMMDD_HHMMSS_xxxxxxxx
    path = re.sub(
        r'/kuroryuu_[a-z]+_\d{8}_\d{6}_[a-z0-9]+(?=/|$)',
        '/:id',
        path,
        flags=re.IGNORECASE
    )
    # CLI-style short IDs: cli-XXXXXXXX (8+ alphanumeric)
    path = re.sub(
        r'/cli-[a-z0-9]{6,}(?=/|$)',
        '/:id',
        path,
        flags=re.IGNORECASE
    )
    # Worker/agent IDs with underscores and numbers: worker_custom_1767991969081
    path = re.sub(
        r'/worker_[a-z]+_\d{10,}(?=/|$)',
        '/:id',
        path,
        flags=re.IGNORECASE
    )
    # Generic alphanumeric IDs (8+ chars that look like IDs, not common words)
    # Only match if it contains both letters and numbers (to avoid matching words like "heartbeat")
    path = re.sub(
        r'/(?=[a-z0-9]*[0-9])(?=[a-z0-9]*[a-z])[a-z0-9_-]{8,}(?=/|$)',
        '/:id',
        path,
        flags=re.IGNORECASE
    )
    # Numeric IDs (pure numbers, 3+ digits)
    path = re.sub(r'/\d{3,}(?=/|$)', '/:id', path)

    return path


class TrafficMonitoringMiddleware(BaseHTTPMiddleware):
    """
    Middleware to capture and monitor all HTTP traffic through the gateway.
    Broadcasts events via WebSocket, tracks statistics, and persists to storage.
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Skip excluded paths
        path = request.url.path
        if path in EXCLUDED_PATHS or path.startswith("/static"):
            return await call_next(request)

        # Generate unique event ID and correlation ID
        event_id = str(uuid.uuid4())[:8]
        correlation_id = request.headers.get("x-correlation-id") or str(uuid.uuid4())
        start_time = time.time()
        timestamp = datetime.now()

        # Determine endpoint category
        category = self._categorize_endpoint(path)

        # Normalize endpoint for storage (replace dynamic IDs with :id)
        # This prevents endpoint explosion from unique agent/session IDs
        normalized_path = normalize_endpoint(path)

        # Extract client info
        client_ip = self._get_client_ip(request)
        user_agent = request.headers.get("user-agent", "")

        # ============================================
        # SECURITY CHECK: Blocklist and External IPs
        # ============================================

        # Check if IP is already blocked
        if blocklist.is_blocked(client_ip):
            blocklist.increment_request_count(client_ip)
            logger.warning(f"[SECURITY] Blocked request from {client_ip} to {path}")
            return Response(
                content='{"error": "Forbidden", "detail": "Your IP has been blocked"}',
                status_code=403,
                media_type="application/json",
            )

        # Check for external connections
        # SECURITY: External connections are ALWAYS blocked.
        # Use Cloudflare Tunnel or Tailscale for secure remote access.
        if self._is_external_connection(client_ip):
            logger.warning(f"[SECURITY] EXTERNAL CONNECTION DETECTED: {client_ip}")

            # Create threat info with request details
            threat_info = ThreatInfo(
                ip=client_ip,
                first_seen=timestamp,
                last_seen=timestamp,
                user_agent=user_agent,
                endpoint=path,
                method=request.method,
                headers=filter_headers(dict(request.headers)),
            )

            # Auto-block the IP
            blocklist.block(client_ip, threat_info)

            # Emit security alert via WebSocket
            asyncio.create_task(self._emit_security_alert(
                client_ip=client_ip,
                user_agent=user_agent,
                endpoint=path,
                method=request.method,
                headers=dict(request.headers),
                timestamp=timestamp,
                event_id=event_id,
            ))

            # Gather intel in background (don't block request)
            asyncio.create_task(self._gather_and_broadcast_intel(client_ip))

            # Broadcast IP blocked event
            asyncio.create_task(broadcast_ip_blocked(client_ip, auto=True))

            # Return 403 to external connection
            # NOTE: For remote access, use Cloudflare Tunnel or Tailscale
            return Response(
                content='{"error": "Forbidden", "detail": "External connections not allowed. Use Cloudflare Tunnel or Tailscale for remote access."}',
                status_code=403,
                media_type="application/json",
            )

        # Capture request headers (filtered)
        request_headers = filter_headers(dict(request.headers))

        # Capture query params
        query_params = dict(request.query_params) if request.query_params else {}

        # Capture request body
        request_body = None
        request_body_size = 0
        request_body_truncated = False
        content_type = request.headers.get("content-type", "").split(";")[0].lower()

        if self._should_capture_body(content_type, request.method):
            try:
                body_bytes = await request.body()
                request_body_size = len(body_bytes)
                if body_bytes:
                    body_text = body_bytes.decode("utf-8", errors="replace")
                    request_body, request_body_truncated = truncate_body(body_text)
            except Exception:
                request_body = "[ERROR READING BODY]"

        # Broadcast request event (fire and forget, using normalized endpoint)
        asyncio.create_task(traffic_ws_manager.broadcast_traffic_event({
            "id": event_id,
            "type": "http_request",
            "endpoint": normalized_path,
            "method": request.method,
            "source": "client",
            "destination": "gateway",
            "timestamp": timestamp.isoformat(),
            "metadata": {
                "category": category,
                "query_params": query_params,
                "content_type": content_type,
                "body_size": request_body_size,
            }
        }))

        # Process request
        response = await call_next(request)

        # Calculate duration
        duration = round((time.time() - start_time) * 1000, 2)
        response_timestamp = datetime.now()

        # Capture response headers
        response_headers = filter_headers(dict(response.headers))

        # Capture response body (need to wrap streaming response)
        response_body = None
        response_body_size = 0
        response_body_truncated = False
        response_content_type = response.headers.get("content-type", "").split(";")[0].lower()

        if self._should_capture_body(response_content_type, request.method):
            # Consume the response body
            body_chunks = []
            async for chunk in response.body_iterator:
                body_chunks.append(chunk)
            response_body_bytes = b"".join(body_chunks)
            response_body_size = len(response_body_bytes)

            if response_body_bytes:
                body_text = response_body_bytes.decode("utf-8", errors="replace")
                response_body, response_body_truncated = truncate_body(body_text)

            # Recreate the response with the consumed body
            response = Response(
                content=response_body_bytes,
                status_code=response.status_code,
                headers=dict(response.headers),
                media_type=response.media_type,
            )

        # Determine error info
        error_type = None
        error_message = None
        if response.status_code >= 400:
            error_type = "client_error" if response.status_code < 500 else "server_error"
            # Try to extract error message from response body
            if response_body:
                try:
                    import json
                    error_data = json.loads(response_body)
                    raw_msg = error_data.get("detail") or error_data.get("message") or error_data.get("error")
                    # Ensure error_message is a string (FastAPI returns list for validation errors)
                    if isinstance(raw_msg, list):
                        error_message = json.dumps(raw_msg)
                    elif raw_msg is not None:
                        error_message = str(raw_msg)
                except:
                    pass

        # Create detailed event for storage (using normalized endpoint)
        detailed_event = TrafficEventDetail(
            id=event_id,
            endpoint=normalized_path,
            method=request.method,
            status=response.status_code,
            duration=duration,
            category=category,
            timestamp=timestamp,
            request_headers=request_headers,
            request_body=request_body,
            request_body_size=request_body_size,
            request_body_truncated=request_body_truncated,
            query_params=query_params,
            response_headers=response_headers,
            response_body=response_body,
            response_body_size=response_body_size,
            response_body_truncated=response_body_truncated,
            client_ip=client_ip,
            user_agent=user_agent,
            correlation_id=correlation_id,
            error_type=error_type,
            error_message=error_message,
        )

        # Store event (fire and forget)
        asyncio.create_task(asyncio.to_thread(traffic_storage.store_event, detailed_event))

        # Broadcast response event with body preview (using normalized endpoint)
        asyncio.create_task(traffic_ws_manager.broadcast_traffic_event({
            "id": event_id,
            "type": "http_response",
            "endpoint": normalized_path,
            "method": request.method,
            "status": response.status_code,
            "duration": duration,
            "source": "gateway",
            "destination": "client",
            "timestamp": response_timestamp.isoformat(),
            "metadata": {
                "category": category,
                "body_size": response_body_size,
                "has_body": bool(response_body),
                "body_preview": create_body_preview(response_body),
                "request_body_preview": create_body_preview(request_body),
                "error_type": error_type,
                "error_message": error_message[:100] if error_message else None,
            }
        }))

        # Update statistics tracker (using normalized endpoint)
        traffic_tracker.add_event({
            "endpoint": normalized_path,
            "method": request.method,
            "status": response.status_code,
            "duration": duration,
            "category": category,
        })

        # Periodically broadcast stats (every 10th request or on errors)
        if traffic_tracker.get_stats()["totalRequests"] % 10 == 0 or response.status_code >= 400:
            asyncio.create_task(traffic_ws_manager.broadcast_stats_update(
                traffic_tracker.get_stats()
            ))

        return response

    def _categorize_endpoint(self, path: str) -> str:
        """Categorize endpoint for grouping in visualization"""
        if path.startswith("/v1/agents"):
            return "agents"
        elif path.startswith("/v1/chat"):
            return "chat"
        elif path.startswith("/v1/mcp"):
            return "mcp"
        elif path.startswith("/v1/tasks"):
            return "tasks"
        elif path.startswith("/v1/canvas"):
            return "canvas"
        elif path.startswith("/v1/browser"):
            return "browser"
        elif path.startswith("/v1/traffic"):
            return "traffic"
        elif path.startswith("/ws"):
            return "websocket"
        else:
            return "other"

    def _get_client_ip(self, request: Request) -> str:
        """Extract client IP from request.

        SECURITY: Only use validated request.client.host.
        Do NOT read X-Forwarded-For/X-Real-IP directly here.

        If running behind a trusted proxy, configure KURORYUU_TRUSTED_PROXIES
        and ProxyHeadersMiddleware will handle header validation and set
        request.client.host correctly.

        Reading these headers directly allows attackers to spoof their IP
        by simply adding X-Forwarded-For: 127.0.0.1 to bypass localhost checks.
        """
        if request.client:
            return request.client.host
        return "unknown"

    def _should_capture_body(self, content_type: str, method: str) -> bool:
        """Determine if request/response body should be captured"""
        # Don't capture for certain methods
        if method in ("HEAD", "OPTIONS"):
            return False

        # Check content type
        return content_type in CAPTURABLE_CONTENT_TYPES

    def _is_external_connection(self, client_ip: str) -> bool:
        """Check if connection is from outside localhost."""
        if not client_ip or client_ip == "unknown":
            return False
        # Localhost patterns
        if client_ip.startswith("127."):
            return False
        if client_ip.lower() in {"::1", "localhost", "0.0.0.0"}:
            return False
        return True

    async def _emit_security_alert(
        self,
        client_ip: str,
        user_agent: str,
        endpoint: str,
        method: str,
        headers: Dict[str, Any],
        timestamp: datetime,
        event_id: str,
    ):
        """Broadcast security alert for external connection via WebSocket."""
        from ..websocket import manager

        await manager.broadcast({
            "type": "security_alert",
            "severity": "critical",
            "event_id": event_id,
            "client_ip": client_ip,
            "user_agent": user_agent,
            "endpoint": endpoint,
            "method": method,
            "headers": filter_headers(headers),
            "timestamp": timestamp.isoformat(),
            "auto_blocked": True,
            "message": f"SECURITY ALERT: External connection detected from {client_ip}",
        })
        logger.info(f"[SECURITY] Alert broadcast: {client_ip} -> {method} {endpoint}")

    async def _gather_and_broadcast_intel(self, client_ip: str):
        """Gather threat intelligence and broadcast update."""
        try:
            intel = await gather_intel(client_ip)
            if intel:
                await broadcast_intel_update(client_ip, intel)
        except Exception as e:
            logger.error(f"[SECURITY] Failed to gather intel for {client_ip}: {e}")
