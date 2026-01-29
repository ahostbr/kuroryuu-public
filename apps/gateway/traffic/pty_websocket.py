"""
PTY Traffic WebSocket Handler
WebSocket endpoint for real-time PTY event streaming
"""
from fastapi import WebSocket, WebSocketDisconnect
from typing import Set, Dict, Any, Optional
import asyncio
import json
import logging
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

# Ping/Pong keep-alive constants
PING_INTERVAL_SECONDS = 30
PONG_TIMEOUT_SECONDS = 60


class PTYWebSocketManager:
    """
    Manages WebSocket connections for PTY traffic visualization.
    Handles connection lifecycle, heartbeat, and event broadcasting.
    """

    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self._broadcast_lock = asyncio.Lock()
        # Track subscription filters per connection
        self._subscriptions: Dict[WebSocket, Dict[str, Any]] = {}
        # Connection health tracking
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
        logger.info("[PTYTrafficWS] Ping/pong keep-alive loop started")

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
        logger.info("[PTYTrafficWS] Ping/pong keep-alive loop stopped")

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
                logger.error(f"[PTYTrafficWS] Ping loop error: {e}")

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
                except Exception as e:
                    logger.debug(f"[PTYTrafficWS] Ping failed: {e}")
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
                    logger.warning(
                        f"[PTYTrafficWS] Connection timed out - no activity for "
                        f"{(now - last_activity).seconds}s"
                    )
                    timed_out.add(connection)

            for connection in timed_out:
                await self._cleanup_connection(connection)

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
        logger.debug(f"[PTYTrafficWS] Client connected. Total: {len(self.active_connections)}")

        if not self._running:
            await self.start_ping_loop()

        await websocket.send_json({
            "type": "connected",
            "timestamp": datetime.now().isoformat(),
            "message": "PTY traffic WebSocket connected",
            "ping_interval": PING_INTERVAL_SECONDS,
            "pong_timeout": PONG_TIMEOUT_SECONDS
        })

    async def disconnect(self, websocket: WebSocket):
        """Remove WebSocket connection"""
        self.active_connections.discard(websocket)
        self._subscriptions.pop(websocket, None)
        self._last_activity.pop(websocket, None)
        logger.debug(f"[PTYTrafficWS] Client disconnected. Total: {len(self.active_connections)}")

        if not self.active_connections and self._running:
            await self.stop_ping_loop()

    def subscribe(self, websocket: WebSocket, filters: Dict[str, Any]):
        """
        Subscribe a client to filtered events.

        Filters:
        - actions: List of action types (e.g., ["talk", "send_line"])
        - agent_ids: List of agent IDs
        - session_ids: List of PTY session IDs
        - errors_only: Only show errors
        - blocked_only: Only show blocked commands
        """
        self._subscriptions[websocket] = filters
        logger.debug(f"[PTYTrafficWS] Client subscribed with filters: {filters}")

    def unsubscribe(self, websocket: WebSocket):
        """Remove all subscriptions for a client"""
        self._subscriptions.pop(websocket, None)

    def _matches_filters(self, websocket: WebSocket, event: Dict[str, Any]) -> bool:
        """Check if an event matches a client's subscription filters"""
        filters = self._subscriptions.get(websocket)
        if not filters:
            return True

        # Check action filter
        actions = filters.get("actions")
        if actions and event.get("action") not in actions:
            return False

        # Check agent ID filter
        agent_ids = filters.get("agent_ids")
        if agent_ids and event.get("agent_id") not in agent_ids:
            return False

        # Check session ID filter
        session_ids = filters.get("session_ids")
        if session_ids and event.get("session_id") not in session_ids:
            return False

        # Check errors only
        if filters.get("errors_only") and event.get("success", True):
            return False

        # Check blocked only
        if filters.get("blocked_only") and not event.get("blocked", False):
            return False

        return True

    async def broadcast(self, message: Dict[str, Any]):
        """Broadcast message to all connected clients"""
        if not self.active_connections:
            return

        async with self._broadcast_lock:
            disconnected = set()

            for connection in self.active_connections:
                try:
                    await connection.send_json(message)
                except Exception as e:
                    logger.debug(f"[PTYTrafficWS] Broadcast failed: {e}")
                    disconnected.add(connection)

            for connection in disconnected:
                self.active_connections.discard(connection)

    async def broadcast_pty_event(self, event: Dict[str, Any]):
        """Broadcast a PTY event to clients that match subscription filters"""
        if not self.active_connections:
            return

        message = {
            "type": "pty_event",
            "event": event
        }

        async with self._broadcast_lock:
            disconnected = set()

            for connection in self.active_connections:
                if not self._matches_filters(connection, event):
                    continue

                try:
                    await connection.send_json(message)
                except Exception as e:
                    logger.debug(f"[PTYTrafficWS] Event broadcast failed: {e}")
                    disconnected.add(connection)

            for connection in disconnected:
                self.active_connections.discard(connection)
                self._subscriptions.pop(connection, None)

    async def broadcast_stats_update(self, stats: Dict[str, Any]):
        """Broadcast statistics update to all clients"""
        await self.broadcast({
            "type": "stats_update",
            "stats": stats
        })

    def get_connection_health(self) -> Dict[str, Any]:
        """Get health statistics for all connections"""
        now = datetime.now()
        stats = {
            "total_connections": len(self.active_connections),
            "ping_loop_running": self._running,
            "connections": []
        }

        for conn in self.active_connections:
            last_activity = self._last_activity.get(conn)
            idle_seconds = (now - last_activity).total_seconds() if last_activity else 0
            stats["connections"].append({
                "idle_seconds": round(idle_seconds, 1),
                "has_subscription": conn in self._subscriptions
            })

        return stats


# Global manager instance
pty_ws_manager = PTYWebSocketManager()


async def websocket_pty_traffic(websocket: WebSocket):
    """
    WebSocket endpoint for PTY traffic visualization.

    Endpoint: /ws/pty-traffic

    Supported client messages:
    - {"type": "ping"} - Keep-alive
    - {"type": "subscribe", "filters": {...}} - Subscribe with filters
    - {"type": "unsubscribe"} - Remove filters
    - {"type": "pause"} - Pause events
    - {"type": "resume"} - Resume events

    Subscription filters:
    - actions: ["talk", "send_line", "read", "term_read"]
    - agent_ids: ["leader-1", "worker-2"]
    - session_ids: ["pty-abc123"]
    - errors_only: true
    - blocked_only: true
    """
    await pty_ws_manager.connect(websocket)

    try:
        while True:
            data = await websocket.receive_text()
            pty_ws_manager.update_activity(websocket)

            try:
                message = json.loads(data)
                message_type = message.get("type")

                if message_type == "ping":
                    await websocket.send_json({
                        "type": "pong",
                        "timestamp": datetime.now().isoformat()
                    })

                elif message_type == "pong":
                    logger.debug("[PTYTrafficWS] Pong received")

                elif message_type == "subscribe":
                    filters = message.get("filters", {})
                    pty_ws_manager.subscribe(websocket, filters)
                    await websocket.send_json({
                        "type": "subscribed",
                        "filters": filters,
                        "message": "Subscription filters applied"
                    })

                elif message_type == "unsubscribe":
                    pty_ws_manager.unsubscribe(websocket)
                    await websocket.send_json({
                        "type": "unsubscribed",
                        "message": "Subscription filters removed"
                    })

                elif message_type == "pause":
                    pty_ws_manager.subscribe(websocket, {"actions": []})
                    await websocket.send_json({
                        "type": "paused",
                        "message": "Event stream paused"
                    })

                elif message_type == "resume":
                    pty_ws_manager.unsubscribe(websocket)
                    await websocket.send_json({
                        "type": "resumed",
                        "message": "Event stream resumed"
                    })

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
        await pty_ws_manager.disconnect(websocket)
    except Exception as e:
        await pty_ws_manager.disconnect(websocket)
        logger.debug(f"[PTYTrafficWS] Error: {e}")
