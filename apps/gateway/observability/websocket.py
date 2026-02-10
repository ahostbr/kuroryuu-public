"""
Observability WebSocket Handler
WebSocket endpoint for real-time hook event streaming
"""
from fastapi import WebSocket, WebSocketDisconnect
from typing import Set, Dict, Any, Optional
import asyncio
import json
import logging
from datetime import datetime, timedelta

from ..websocket import validate_websocket_origin

logger = logging.getLogger(__name__)

PING_INTERVAL_SECONDS = 30
PONG_TIMEOUT_SECONDS = 60


class ObservabilityWebSocketManager:
    """
    Manages WebSocket connections for observability event streaming.
    Handles connection lifecycle, heartbeat, and event broadcasting.
    """

    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self._broadcast_lock = asyncio.Lock()
        self._subscriptions: Dict[WebSocket, Dict[str, Any]] = {}
        self._last_activity: Dict[WebSocket, datetime] = {}
        self._ping_loop_task: Optional[asyncio.Task] = None
        self._running = False

    @property
    def connection_count(self) -> int:
        return len(self.active_connections)

    async def start_ping_loop(self):
        """Start the background ping/pong keep-alive loop"""
        if self._running:
            return
        self._running = True
        self._ping_loop_task = asyncio.create_task(self._ping_loop())
        logger.info("[ObsWS] Ping/pong keep-alive loop started")

    async def stop_ping_loop(self):
        """Stop the ping/pong keep-alive loop"""
        self._running = False
        if self._ping_loop_task:
            self._ping_loop_task.cancel()
            try:
                await self._ping_loop_task
            except asyncio.CancelledError:
                pass
            self._ping_loop_task = None
        logger.info("[ObsWS] Ping/pong keep-alive loop stopped")

    async def _ping_loop(self):
        """Background loop that sends pings and checks connection health"""
        while self._running:
            try:
                await asyncio.sleep(PING_INTERVAL_SECONDS)
                if not self.active_connections:
                    continue
                await self._send_pings()
                await self._check_connection_health()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"[ObsWS] Ping loop error: {e}")

    async def _send_pings(self):
        """Send ping messages to all active connections"""
        if not self.active_connections:
            return

        async with self._broadcast_lock:
            disconnected = set()
            ping_message = {
                "type": "ping",
                "timestamp": datetime.now().isoformat()
            }

            for connection in self.active_connections:
                try:
                    await connection.send_json(ping_message)
                except Exception:
                    disconnected.add(connection)

            for connection in disconnected:
                await self._cleanup_connection(connection)

    async def _check_connection_health(self):
        """Check for and disconnect timed-out connections"""
        now = datetime.now()
        timeout_threshold = now - timedelta(seconds=PONG_TIMEOUT_SECONDS)

        async with self._broadcast_lock:
            timed_out = set()

            for connection in self.active_connections:
                last_activity = self._last_activity.get(connection)
                if last_activity and last_activity < timeout_threshold:
                    timed_out.add(connection)

            for connection in timed_out:
                await self._cleanup_connection(connection)

            if timed_out:
                logger.info(f"[ObsWS] Cleaned up {len(timed_out)} timed-out connection(s)")

    async def _cleanup_connection(self, websocket: WebSocket):
        """Clean up a single connection and all its tracking data"""
        self.active_connections.discard(websocket)
        self._subscriptions.pop(websocket, None)
        self._last_activity.pop(websocket, None)
        try:
            await websocket.close()
        except Exception:
            pass

    def update_activity(self, websocket: WebSocket):
        """Update last activity timestamp for a connection"""
        self._last_activity[websocket] = datetime.now()

    async def connect(self, websocket: WebSocket):
        """Accept new WebSocket connection"""
        await websocket.accept()
        self.active_connections.add(websocket)
        self._last_activity[websocket] = datetime.now()
        logger.debug(f"[ObsWS] Client connected. Total: {len(self.active_connections)}")

        if not self._running:
            await self.start_ping_loop()

        await websocket.send_json({
            "type": "connected",
            "timestamp": datetime.now().isoformat(),
            "message": "Observability WebSocket connected",
            "ping_interval": PING_INTERVAL_SECONDS,
            "pong_timeout": PONG_TIMEOUT_SECONDS,
        })

    async def disconnect(self, websocket: WebSocket):
        """Remove WebSocket connection"""
        self.active_connections.discard(websocket)
        self._subscriptions.pop(websocket, None)
        self._last_activity.pop(websocket, None)
        logger.debug(f"[ObsWS] Client disconnected. Total: {len(self.active_connections)}")

        if not self.active_connections and self._running:
            await self.stop_ping_loop()

    async def broadcast_event(self, event: Dict[str, Any]):
        """Broadcast a hook event to all connected clients"""
        if not self.active_connections:
            return

        message = {
            "type": "hook_event",
            "event": event,
        }

        async with self._broadcast_lock:
            disconnected = set()

            for connection in self.active_connections:
                try:
                    await connection.send_json(message)
                except Exception:
                    disconnected.add(connection)

            for connection in disconnected:
                self.active_connections.discard(connection)
                self._subscriptions.pop(connection, None)


# Global manager instance
obs_ws_manager = ObservabilityWebSocketManager()


async def websocket_observability_stream(websocket: WebSocket):
    """
    WebSocket endpoint for observability event streaming.

    Endpoint: /ws/observability-stream

    Supported client messages:
    - {"type": "ping"} - Keep-alive
    - {"type": "pong"} - Response to server ping
    """
    if not await validate_websocket_origin(websocket):
        await websocket.close(code=4003, reason="Forbidden: Invalid origin")
        return

    await obs_ws_manager.connect(websocket)

    try:
        while True:
            data = await websocket.receive_text()
            obs_ws_manager.update_activity(websocket)

            try:
                message = json.loads(data)
                message_type = message.get("type")

                if message_type == "ping":
                    await websocket.send_json({
                        "type": "pong",
                        "timestamp": datetime.now().isoformat()
                    })
                elif message_type == "pong":
                    logger.debug("[ObsWS] Pong received from client")
                else:
                    await websocket.send_json({
                        "type": "error",
                        "message": f"Unknown message type: {message_type}"
                    })

            except json.JSONDecodeError:
                await websocket.send_json({
                    "type": "error",
                    "message": "Invalid JSON format"
                })

    except WebSocketDisconnect:
        await obs_ws_manager.disconnect(websocket)
    except Exception as e:
        await obs_ws_manager.disconnect(websocket)
        logger.debug(f"[ObsWS] Error: {e}")
