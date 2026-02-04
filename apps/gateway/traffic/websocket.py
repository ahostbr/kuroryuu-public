"""
Traffic WebSocket Handler
WebSocket endpoint for real-time traffic event streaming
"""
from fastapi import WebSocket, WebSocketDisconnect
from typing import Set, Dict, Any, Optional
import asyncio
import json
import logging
from datetime import datetime, timedelta

# Import origin validation from main websocket module
from ..websocket import validate_websocket_origin

logger = logging.getLogger(__name__)

# Ping/Pong keep-alive constants
PING_INTERVAL_SECONDS = 30  # Send ping every 30 seconds
PONG_TIMEOUT_SECONDS = 60   # Disconnect if no activity for 60 seconds


class TrafficWebSocketManager:
    """
    Manages WebSocket connections for traffic flow visualization.
    Handles connection lifecycle, heartbeat, and event broadcasting.
    """

    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self._broadcast_lock = asyncio.Lock()
        # Track subscription filters per connection
        self._subscriptions: Dict[WebSocket, Dict[str, Any]] = {}
        # Connection health tracking for ping/pong keep-alive
        self._last_activity: Dict[WebSocket, datetime] = {}
        self._ping_tasks: Dict[WebSocket, asyncio.Task] = {}
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
        logger.info("[TrafficWS] Ping/pong keep-alive loop started")

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
        logger.info("[TrafficWS] Ping/pong keep-alive loop stopped")

    async def _ping_loop(self):
        """Background loop that sends pings and checks connection health"""
        while self._running:
            try:
                await asyncio.sleep(PING_INTERVAL_SECONDS)
                if not self.active_connections:
                    continue

                # Send ping to all connections and check health
                await self._send_pings()
                await self._check_connection_health()

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"[TrafficWS] Ping loop error: {e}")

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
                    logger.debug(f"[TrafficWS] Ping sent to client")
                except Exception as e:
                    logger.debug(f"[TrafficWS] Ping failed, marking for disconnect: {e}")
                    disconnected.add(connection)

            # Clean up connections that failed to receive ping
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
                        f"[TrafficWS] Connection timed out - no activity for "
                        f"{(now - last_activity).seconds}s"
                    )
                    timed_out.add(connection)

            # Disconnect timed-out connections
            for connection in timed_out:
                await self._cleanup_connection(connection)

            if timed_out:
                logger.info(
                    f"[TrafficWS] Cleaned up {len(timed_out)} timed-out connection(s). "
                    f"Active: {len(self.active_connections)}"
                )

    async def _cleanup_connection(self, websocket: WebSocket):
        """Clean up a single connection and all its tracking data"""
        self.active_connections.discard(websocket)
        self._subscriptions.pop(websocket, None)
        self._last_activity.pop(websocket, None)
        if websocket in self._ping_tasks:
            self._ping_tasks[websocket].cancel()
            self._ping_tasks.pop(websocket, None)
        try:
            await websocket.close()
        except Exception:
            pass  # Connection may already be closed

    def update_activity(self, websocket: WebSocket):
        """Update last activity timestamp for a connection (call on any client message)"""
        self._last_activity[websocket] = datetime.now()

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
            if last_activity:
                idle_seconds = (now - last_activity).total_seconds()
            else:
                idle_seconds = 0

            stats["connections"].append({
                "idle_seconds": round(idle_seconds, 1),
                "has_subscription": conn in self._subscriptions
            })

        return stats

    async def connect(self, websocket: WebSocket):
        """Accept new WebSocket connection and send initial state"""
        await websocket.accept()
        self.active_connections.add(websocket)
        # Initialize activity tracking for keep-alive
        self._last_activity[websocket] = datetime.now()
        logger.debug(f"[TrafficWS] Client connected. Total: {len(self.active_connections)}")

        # Start ping loop if not already running
        if not self._running:
            await self.start_ping_loop()

        # Send connection confirmation
        await websocket.send_json({
            "type": "connected",
            "timestamp": datetime.now().isoformat(),
            "message": "Traffic flow WebSocket connected",
            "ping_interval": PING_INTERVAL_SECONDS,
            "pong_timeout": PONG_TIMEOUT_SECONDS
        })

    async def disconnect(self, websocket: WebSocket):
        """Remove WebSocket connection and cleanup subscriptions"""
        self.active_connections.discard(websocket)
        self._subscriptions.pop(websocket, None)
        self._last_activity.pop(websocket, None)
        logger.debug(f"[TrafficWS] Client disconnected. Total: {len(self.active_connections)}")

        # Stop ping loop if no more connections
        if not self.active_connections and self._running:
            await self.stop_ping_loop()

    def subscribe(self, websocket: WebSocket, filters: Dict[str, Any]):
        """
        Subscribe a client to filtered events.

        Filters can include:
        - event_types: List of event types to receive (e.g., ["request", "response"])
        - agent_ids: List of agent IDs to filter by
        - min_severity: Minimum severity level
        """
        self._subscriptions[websocket] = filters
        logger.debug(f"[TrafficWS] Client subscribed with filters: {filters}")

    def unsubscribe(self, websocket: WebSocket):
        """Remove all subscriptions for a client"""
        self._subscriptions.pop(websocket, None)
        logger.debug(f"[TrafficWS] Client unsubscribed")

    def _matches_filters(self, websocket: WebSocket, event: Dict[str, Any]) -> bool:
        """Check if an event matches a client's subscription filters"""
        filters = self._subscriptions.get(websocket)
        if not filters:
            return True  # No filters = receive everything

        # Check event type filter
        event_types = filters.get("event_types")
        if event_types and event.get("type") not in event_types:
            return False

        # Check agent ID filter
        agent_ids = filters.get("agent_ids")
        if agent_ids:
            event_agent = event.get("agent_id") or event.get("from_agent")
            if event_agent and event_agent not in agent_ids:
                return False

        return True

    async def broadcast(self, message: Dict[str, Any]):
        """
        Broadcast message to all connected clients.
        Thread-safe with automatic cleanup of dead connections.
        """
        if not self.active_connections:
            return

        async with self._broadcast_lock:
            disconnected = set()

            for connection in self.active_connections:
                try:
                    await connection.send_json(message)
                except Exception as e:
                    logger.debug(f"[TrafficWS] Broadcast failed: {e}")
                    disconnected.add(connection)

            # Clean up disconnected clients
            for connection in disconnected:
                self.active_connections.discard(connection)

    async def broadcast_traffic_event(self, event: Dict[str, Any]):
        """Broadcast a traffic event to clients that match subscription filters"""
        if not self.active_connections:
            return

        message = {
            "type": "traffic_event",
            "event": event
        }

        async with self._broadcast_lock:
            disconnected = set()

            for connection in self.active_connections:
                # Only send if event matches client's filters
                if not self._matches_filters(connection, event):
                    continue

                try:
                    await connection.send_json(message)
                except Exception as e:
                    logger.debug(f"[TrafficWS] Event broadcast failed: {e}")
                    disconnected.add(connection)

            # Clean up disconnected clients
            for connection in disconnected:
                self.active_connections.discard(connection)
                self._subscriptions.pop(connection, None)

    async def broadcast_stats_update(self, stats: Dict[str, Any]):
        """Broadcast statistics update to all clients"""
        await self.broadcast({
            "type": "stats_update",
            "stats": stats
        })


# Global manager instance
traffic_ws_manager = TrafficWebSocketManager()


async def websocket_traffic_flow(websocket: WebSocket):
    """
    WebSocket endpoint for traffic flow visualization.

    Endpoint: /ws/traffic-flow

    Supported client messages:
    - {"type": "ping"} - Keep-alive, server responds with {"type": "pong"}
    - {"type": "subscribe", "filters": {...}} - Subscribe with filters
    - {"type": "unsubscribe"} - Remove subscription filters

    Subscription filters:
    - event_types: ["request", "response", "error"] - Filter by event type
    - agent_ids: ["agent_1", "agent_2"] - Filter by agent ID
    """
    # SECURITY: Validate origin before accepting connection
    if not await validate_websocket_origin(websocket):
        await websocket.close(code=4003, reason="Forbidden: Invalid origin")
        return

    await traffic_ws_manager.connect(websocket)

    try:
        while True:
            # Wait for messages from client
            data = await websocket.receive_text()

            # Update activity timestamp on ANY message (for keep-alive tracking)
            traffic_ws_manager.update_activity(websocket)

            try:
                message = json.loads(data)
                message_type = message.get("type")

                if message_type == "ping":
                    # Client-initiated ping, respond with pong
                    await websocket.send_json({
                        "type": "pong",
                        "timestamp": datetime.now().isoformat()
                    })

                elif message_type == "pong":
                    # Client responding to server ping - activity already updated above
                    logger.debug("[TrafficWS] Pong received from client")

                elif message_type == "subscribe":
                    # Apply subscription filters
                    filters = message.get("filters", {})
                    traffic_ws_manager.subscribe(websocket, filters)
                    await websocket.send_json({
                        "type": "subscribed",
                        "filters": filters,
                        "message": "Subscription filters applied"
                    })

                elif message_type == "unsubscribe":
                    # Remove subscription filters
                    traffic_ws_manager.unsubscribe(websocket)
                    await websocket.send_json({
                        "type": "unsubscribed",
                        "message": "Subscription filters removed"
                    })

                elif message_type == "pause":
                    # Pause events (unsubscribe with empty filter)
                    traffic_ws_manager.subscribe(websocket, {"event_types": []})
                    await websocket.send_json({
                        "type": "paused",
                        "message": "Event stream paused"
                    })

                elif message_type == "resume":
                    # Resume events (remove filters)
                    traffic_ws_manager.unsubscribe(websocket)
                    await websocket.send_json({
                        "type": "resumed",
                        "message": "Event stream resumed"
                    })

                else:
                    logger.debug(f"[TrafficWS] Unknown message type: {message_type}")
                    await websocket.send_json({
                        "type": "error",
                        "message": f"Unknown message type: {message_type}"
                    })

            except json.JSONDecodeError:
                logger.debug(f"[TrafficWS] Invalid JSON received: {data}")
                await websocket.send_json({
                    "type": "error",
                    "message": "Invalid JSON format"
                })

    except WebSocketDisconnect:
        await traffic_ws_manager.disconnect(websocket)
        logger.debug("[TrafficWS] Client disconnected normally")
    except Exception as e:
        await traffic_ws_manager.disconnect(websocket)
        logger.debug(f"[TrafficWS] Error: {e}")
