"""
WebSocket Module

Real-time agent status broadcasting via WebSocket.
Replaces HTTP polling with push notifications.
"""
from __future__ import annotations

import asyncio
import json
from typing import Set, Dict, Any, Optional
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from datetime import datetime

from .utils.logging_config import get_logger

logger = get_logger(__name__)

router = APIRouter(tags=["websocket"])


class ConnectionManager:
    """Manages WebSocket connections and broadcasts."""
    
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self._lock = asyncio.Lock()
    
    async def connect(self, websocket: WebSocket):
        """Accept and track a new connection."""
        await websocket.accept()
        async with self._lock:
            self.active_connections.add(websocket)
            logger.debug(f"[WS] Client connected. Total: {len(self.active_connections)}")

    async def disconnect(self, websocket: WebSocket):
        """Remove a connection."""
        async with self._lock:
            self.active_connections.discard(websocket)
            logger.debug(f"[WS] Client disconnected. Total: {len(self.active_connections)}")
    
    async def broadcast(self, message: Dict[str, Any]):
        """Broadcast message to all connected clients."""
        msg_type = message.get("type", "unknown")
        if not self.active_connections:
            logger.debug(f"[WS] Broadcast {msg_type}: No active connections")
            return

        logger.debug(f"[WS] Broadcasting {msg_type} to {len(self.active_connections)} client(s)")
        data = json.dumps(message, default=str)  # Handle datetime serialization
        async with self._lock:
            dead_connections = set()
            for connection in self.active_connections:
                try:
                    await connection.send_text(data)
                except Exception:
                    dead_connections.add(connection)
            
            # Clean up dead connections
            self.active_connections -= dead_connections
    
    async def send_to(self, websocket: WebSocket, message: Dict[str, Any]):
        """Send message to specific connection."""
        try:
            await websocket.send_text(json.dumps(message))
        except Exception:
            await self.disconnect(websocket)


# Global connection manager
manager = ConnectionManager()


@router.websocket("/ws/agents")
async def websocket_agents(websocket: WebSocket):
    """WebSocket endpoint for real-time agent status updates.
    
    Clients receive:
    - agent_registered: New agent registered
    - agent_heartbeat: Agent heartbeat received
    - agent_status_change: Agent status changed (idle/busy/dead)
    - agent_deregistered: Agent deregistered
    - stats_update: Agent statistics update
    """
    await manager.connect(websocket)
    
    try:
        # Send initial connection confirmation
        await manager.send_to(websocket, {
            "type": "connected",
            "timestamp": datetime.now().isoformat(),
            "message": "WebSocket connected to Kuroryuu Gateway"
        })
        
        # Keep connection alive and handle incoming messages
        while True:
            try:
                # Wait for client messages (ping/pong or commands)
                data = await asyncio.wait_for(
                    websocket.receive_text(),
                    timeout=30.0  # 30s timeout for keep-alive
                )
                
                # Handle client commands
                try:
                    msg = json.loads(data)
                    if msg.get("type") == "ping":
                        await manager.send_to(websocket, {
                            "type": "pong",
                            "timestamp": datetime.now().isoformat()
                        })
                    elif msg.get("type") == "subscribe":
                        # Could add subscription filtering here
                        await manager.send_to(websocket, {
                            "type": "subscribed",
                            "topics": msg.get("topics", ["all"])
                        })
                except json.JSONDecodeError:
                    pass
                    
            except asyncio.TimeoutError:
                # Send keep-alive ping
                await manager.send_to(websocket, {
                    "type": "ping",
                    "timestamp": datetime.now().isoformat()
                })
                
    except WebSocketDisconnect:
        pass
    finally:
        await manager.disconnect(websocket)


# Broadcast helper functions for use by other modules
async def broadcast_agent_registered(agent_data: Dict[str, Any]):
    """Broadcast when a new agent registers."""
    await manager.broadcast({
        "type": "agent_registered",
        "agent": agent_data,
        "timestamp": datetime.now().isoformat()
    })


async def broadcast_agent_heartbeat(agent_id: str, status: str):
    """Broadcast agent heartbeat."""
    await manager.broadcast({
        "type": "agent_heartbeat",
        "agent_id": agent_id,
        "status": status,
        "timestamp": datetime.now().isoformat()
    })


async def broadcast_agent_status_change(agent_id: str, old_status: str, new_status: str):
    """Broadcast agent status change."""
    await manager.broadcast({
        "type": "agent_status_change",
        "agent_id": agent_id,
        "old_status": old_status,
        "new_status": new_status,
        "timestamp": datetime.now().isoformat()
    })


async def broadcast_agent_deregistered(agent_id: str):
    """Broadcast when an agent deregisters."""
    await manager.broadcast({
        "type": "agent_deregistered",
        "agent_id": agent_id,
        "timestamp": datetime.now().isoformat()
    })


async def broadcast_stats_update(stats: Dict[str, Any]):
    """Broadcast agent statistics update."""
    await manager.broadcast({
        "type": "stats_update",
        "stats": stats,
        "timestamp": datetime.now().isoformat()
    })


def get_connection_manager() -> ConnectionManager:
    """Get the global connection manager."""
    return manager


# =============================================================================
# LEADER-WORKER MESSAGE PUSH (Phase 1)
# =============================================================================

async def broadcast_leader_message(worker_id: str, message: Dict[str, Any]):
    """Broadcast leader message to specific worker.

    Replaces HTTP polling with instant push. Workers subscribe
    and filter by their worker_id on the client side.
    """
    await manager.broadcast({
        "type": "leader_message",
        "worker_id": worker_id,
        "message": message,
        "timestamp": datetime.now().isoformat()
    })


# =============================================================================
# TASK DAG UPDATES (Phase 2)
# =============================================================================

async def broadcast_task_created(task_data: Dict[str, Any]):
    """Broadcast when a new task is created."""
    await manager.broadcast({
        "type": "task_created",
        "task": task_data,
        "timestamp": datetime.now().isoformat()
    })


async def broadcast_task_breakdown(task_id: str, subtasks: list):
    """Broadcast when a task is broken down into subtasks."""
    await manager.broadcast({
        "type": "task_breakdown",
        "task_id": task_id,
        "subtasks": subtasks,
        "timestamp": datetime.now().isoformat()
    })


async def broadcast_subtask_status_change(
    task_id: str,
    subtask_id: str,
    old_status: str,
    new_status: str,
    assigned_to: Optional[str] = None
):
    """Broadcast subtask status change for DAG visualization."""
    await manager.broadcast({
        "type": "subtask_status_change",
        "task_id": task_id,
        "subtask_id": subtask_id,
        "old_status": old_status,
        "new_status": new_status,
        "assigned_to": assigned_to,
        "timestamp": datetime.now().isoformat()
    })


async def broadcast_task_completed(task_id: str, final_result: Optional[str] = None):
    """Broadcast when a task completes (all subtasks done)."""
    await manager.broadcast({
        "type": "task_completed",
        "task_id": task_id,
        "final_result": final_result,
        "timestamp": datetime.now().isoformat()
    })


# =============================================================================
# CANVAS ARTIFACT BROADCASTS (T150 - Real-time Canvas Updates)
# =============================================================================

async def broadcast_artifact_created(artifact_data: Dict[str, Any]):
    """Broadcast when a new artifact is created.

    Canvas components subscribe to this for instant artifact list updates.
    """
    await manager.broadcast({
        "type": "artifact_created",
        "artifact": artifact_data,
        "timestamp": datetime.now().isoformat()
    })


async def broadcast_artifact_updated(
    artifact_id: str,
    changes: Dict[str, Any],
    version: int,
    updated_by: Optional[str] = None,
):
    """Broadcast when an artifact is updated.

    Enables real-time collaborative editing - other viewers see changes instantly.
    """
    await manager.broadcast({
        "type": "artifact_updated",
        "artifact_id": artifact_id,
        "changes": changes,
        "version": version,
        "updated_by": updated_by,
        "timestamp": datetime.now().isoformat()
    })


async def broadcast_artifact_deleted(artifact_id: str):
    """Broadcast when an artifact is deleted.

    Canvas panels remove the artifact from their list immediately.
    """
    await manager.broadcast({
        "type": "artifact_deleted",
        "artifact_id": artifact_id,
        "timestamp": datetime.now().isoformat()
    })


async def broadcast_artifact_session_closed(
    artifact_id: str,
    selection: Optional[str] = None,
    cancelled: bool = False,
):
    """Broadcast when a canvas interactive session is closed.

    Notifies waiting agents that user has made a selection or cancelled.
    """
    await manager.broadcast({
        "type": "artifact_session_closed",
        "artifact_id": artifact_id,
        "selection": selection,
        "cancelled": cancelled,
        "timestamp": datetime.now().isoformat()
    })


async def broadcast_artifact_selection(
    artifact_id: str,
    selection_type: str,
    selection_data: Dict[str, Any],
    selected_by: Optional[str] = None,
):
    """Broadcast real-time selection changes in canvas.

    Enables collaborative cursors and selection highlighting.
    selection_type: 'text' | 'node' | 'cell' | 'seat' | 'event' | 'range'
    """
    await manager.broadcast({
        "type": "artifact_selection",
        "artifact_id": artifact_id,
        "selection_type": selection_type,
        "selection_data": selection_data,
        "selected_by": selected_by,
        "timestamp": datetime.now().isoformat()
    })


# =============================================================================
# AGENT-TO-AGENT DIRECT COMMUNICATION
# =============================================================================

async def broadcast_agent_message(
    message_id: str,
    from_agent_id: str,
    to_agent_id: str,
    content: str,
    message_type: str,
    metadata: Optional[Dict[str, Any]] = None,
    reply_to: Optional[str] = None,
):
    """Broadcast a direct message to a specific agent.

    Target agent receives message via WebSocket push. If agent is offline,
    message is queued and this still broadcasts (for logging/monitoring).

    Args:
        message_id: Unique message identifier
        from_agent_id: Sender agent ID
        to_agent_id: Target agent ID
        content: Message content
        message_type: Message type (direct, reply, etc.)
        metadata: Optional metadata dictionary
        reply_to: Optional message ID being replied to
    """
    await manager.broadcast({
        "type": "agent_message",
        "message_id": message_id,
        "from_agent_id": from_agent_id,
        "to_agent_id": to_agent_id,
        "content": content,
        "message_type": message_type,
        "metadata": metadata or {},
        "reply_to": reply_to,
        "timestamp": datetime.now().isoformat()
    })


async def broadcast_agent_broadcast_message(
    message_id: str,
    from_agent_id: str,
    content: str,
    metadata: Optional[Dict[str, Any]] = None,
):
    """Broadcast a message to all agents.

    All connected agents receive this message via WebSocket.
    Broadcast messages are ephemeral and not queued.

    Args:
        message_id: Unique message identifier
        from_agent_id: Sender agent ID
        content: Message content
        metadata: Optional metadata dictionary
    """
    await manager.broadcast({
        "type": "agent_broadcast",
        "message_id": message_id,
        "from_agent_id": from_agent_id,
        "content": content,
        "metadata": metadata or {},
        "timestamp": datetime.now().isoformat()
    })


async def broadcast_agent_message_delivered(
    message_id: str,
    to_agent_id: str,
    delivered_at: Optional[str] = None,
):
    """Broadcast message delivery confirmation.

    Notifies sender that message was delivered to target agent.

    Args:
        message_id: Message identifier
        to_agent_id: Target agent that received the message
        delivered_at: Optional delivery timestamp
    """
    await manager.broadcast({
        "type": "agent_message_delivered",
        "message_id": message_id,
        "to_agent_id": to_agent_id,
        "delivered_at": delivered_at or datetime.now().isoformat(),
        "timestamp": datetime.now().isoformat()
    })


async def broadcast_agent_message_read(
    message_id: str,
    agent_id: str,
    read_at: Optional[str] = None,
):
    """Broadcast message read receipt.

    Notifies sender that target agent has read the message.

    Args:
        message_id: Message identifier
        agent_id: Agent that read the message
        read_at: Optional read timestamp
    """
    await manager.broadcast({
        "type": "agent_message_read",
        "message_id": message_id,
        "agent_id": agent_id,
        "read_at": read_at or datetime.now().isoformat(),
        "timestamp": datetime.now().isoformat()
    })


# =============================================================================
# UNIFIED CANONICAL INBOX BROADCASTS
# =============================================================================

async def broadcast_inbox_message_sent(message: Dict[str, Any]):
    """Broadcast when new message sent to unified inbox.

    Replaces separate agent_message and agent_broadcast events.
    All coordination messages (task assignments, broadcasts, direct messages)
    flow through this unified event.

    Args:
        message: Full message dict from k_inbox (v1 or v2 schema)
    """
    # Extract fields with v1/v2 compatibility
    message_id = message.get("id", "")
    from_agent = message.get("from_agent", "system")
    to_agent = message.get("to_agent", "workers")
    subject = message.get("subject", message.get("title", ""))
    body = message.get("body", "")
    priority = message.get("priority", "normal")
    message_type = message.get("message_type", "task")
    status = message.get("status", "new")
    created_at = message.get("created_at", datetime.now().isoformat())

    # Backward compatibility fields for old clients
    content = body or str(message.get("payload", ""))
    title = subject or message.get("title", "")

    await manager.broadcast({
        "type": "inbox_message_sent",
        "message_id": message_id,
        "from_agent": from_agent,
        "to_agent": to_agent,
        "subject": subject,
        "body": body,
        "priority": priority,
        "message_type": message_type,
        "status": status,
        "timestamp": created_at,

        # Backward compatibility fields
        "content": content,  # For old agent messaging clients
        "title": title,  # For k_inbox v1 clients
    })


async def broadcast_inbox_message_claimed(
    message_id: str,
    agent_id: str,
    subject: str
):
    """Broadcast when message claimed from inbox.

    Notifies that an agent has claimed a task/message and is working on it.

    Args:
        message_id: Message identifier
        agent_id: Agent that claimed the message
        subject: Message subject for context
    """
    await manager.broadcast({
        "type": "inbox_message_claimed",
        "message_id": message_id,
        "claimed_by": agent_id,
        "subject": subject,
        "timestamp": datetime.now().isoformat()
    })


async def broadcast_inbox_message_completed(
    message_id: str,
    agent_id: str,
    success: bool,
    result: Optional[str] = None
):
    """Broadcast when message completed.

    Notifies that an agent has finished processing a task/message.

    Args:
        message_id: Message identifier
        agent_id: Agent that completed the message
        success: Whether task completed successfully (done) or failed (dead)
        result: Optional result/completion note
    """
    await manager.broadcast({
        "type": "inbox_message_completed",
        "message_id": message_id,
        "completed_by": agent_id,
        "success": success,
        "result": result,
        "timestamp": datetime.now().isoformat()
    })


async def broadcast_inbox_message_read(
    message_id: str,
    agent_id: str
):
    """Broadcast when broadcast message read by an agent.

    Used for read tracking on broadcast messages. Multiple agents
    can read the same broadcast, each triggering this event.

    Args:
        message_id: Message identifier
        agent_id: Agent that read the message
    """
    await manager.broadcast({
        "type": "inbox_message_read",
        "message_id": message_id,
        "read_by": agent_id,
        "timestamp": datetime.now().isoformat()
    })
