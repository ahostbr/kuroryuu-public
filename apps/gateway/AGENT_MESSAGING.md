# Agent-to-Agent Direct Communication

This document describes the agent-to-agent messaging system added to the Kuroryuu Gateway.

## ⚠️ REFACTORED: Now Uses k_inbox Backend

**As of 2026-01-13:** This system has been refactored to use **k_inbox** as the canonical inbox backend. All messages are now stored durably in maildir format with JSON indexing.

## Overview

The agent messaging system provides **durable, WebSocket-based direct communication** between agents backed by k_inbox. It supports:

- **Point-to-point messaging**: Agent A sends directly to Agent B
- **Broadcast messaging**: Agent A broadcasts to all agents (now durable with read tracking)
- **Message queuing**: Messages are stored durably in maildir (new/cur/done folders)
- **Real-time delivery**: Online agents receive messages via WebSocket push
- **Message retrieval**: Agents can poll for queued messages via REST API or k_inbox MCP tool
- **Fast queries**: JSON index provides sub-50ms message lookups

## Communication Roles

**k_inbox is primarily for WORKER → LEADER communication:**

| Direction | Primary Channel | Fallback |
|-----------|-----------------|----------|
| Leader → Worker | **k_pty (send_line)** | k_inbox |
| Worker → Leader | **k_inbox** | (none - workers cannot write to leader terminal) |

Leaders read worker screens and write directly to their terminals. Workers always use k_inbox to report back.

## Architecture

### Components

1. **k_inbox (Canonical Storage)** ✨ NEW
   - Maildir-style durable storage (new/cur/done/dead folders)
   - JSON index for fast queries (.index/ folder)
   - v2 message schema with agent addressing
   - Automatic WebSocket trigger on message send
   - Manages message lifecycle (send, claim, complete)

2. **WebSocket Broadcasts (`websocket.py`)**
   - Real-time push notifications for online agents
   - Unified inbox broadcast functions:
     - `broadcast_inbox_message_sent()` - New message notification
     - `broadcast_inbox_message_claimed()` - Message claimed
     - `broadcast_inbox_message_completed()` - Message completed
     - `broadcast_inbox_message_read()` - Read receipt

3. **REST API (`messaging_router.py`)** (Adapter Layer)
   - HTTP endpoints for sending and retrieving messages
   - Now uses k_inbox as backend (maildir + index)
   - Integrates with agent registry for validation
   - Returns delivery status (delivered, queued, or both)
   - Maintains backward compatibility with old API

4. **Legacy (`messaging.py`)** 🗑️ OBSOLETE
   - Old in-memory queue (no longer used)
   - Kept for reference only

### Message Flow (New - k_inbox Backend)

#### Point-to-Point Message

```
Agent A (sender)
    |
    v
POST /v1/agents/messages/send
    |
    +---> Validate sender exists (agent registry)
    +---> Validate target exists (agent registry)
    +---> Send via k_inbox(action="send", from_agent=..., to_agent=...)
    |     - Write message to maildir (new/ folder)
    |     - Update JSON index (.index/by_agent.json)
    |     - Trigger WebSocket broadcast (broadcast_inbox_message_sent)
    +---> WebSocket push to online agents
    |
    v
Agent B (receiver)
    |
    +---> Receives WebSocket notification (if online)
    +---> OR polls GET /v1/agents/messages/{agent_id} (if offline)
```

#### Broadcast Message

```
Agent A (sender)
    |
    v
POST /v1/agents/messages/send
  (to_agent_id="broadcast")
    |
    +---> Validate sender exists
    +---> Broadcast via WebSocket to ALL connected clients
    |
    v
All Agents (receivers)
    |
    +---> Receive WebSocket notification
    +---> (Broadcast messages are NOT queued)
```

## API Endpoints

### Send Message

**POST** `/v1/agents/messages/send`

Send a message to another agent (point-to-point or broadcast).

**Request Body:**
```json
{
  "from_agent_id": "string",
  "to_agent_id": "string",  // or "broadcast" for all agents
  "content": "string",
  "metadata": {},  // optional
  "reply_to": "string"  // optional message ID
}
```

**Response:**
```json
{
  "ok": true,
  "message_id": "string",
  "delivered": true,  // true if delivered via WebSocket
  "queued": true,  // true if queued for retrieval
  "timestamp": "2026-01-13T..."
}
```

**Status Codes:**
- `200` - Success
- `404` - Sender or target agent not found

### Get Messages

**GET** `/v1/agents/messages/{agent_id}`

Retrieve messages for an agent.

**Query Parameters:**
- `unread_only` (bool, default: true) - Only return unread messages
- `mark_read` (bool, default: true) - Mark returned messages as read
- `limit` (int, optional) - Max messages to return

**Response:**
```json
{
  "ok": true,
  "agent_id": "string",
  "messages": [
    {
      "message_id": "string",
      "from_agent_id": "string",
      "to_agent_id": "string",
      "message_type": "direct|broadcast|reply",
      "content": "string",
      "metadata": {},
      "timestamp": "2026-01-13T...",
      "read": false,
      "reply_to": null
    }
  ],
  "count": 1,
  "unread_count": 1
}
```

### Clear Messages

**DELETE** `/v1/agents/messages/{agent_id}`

Clear messages for an agent.

**Query Parameters:**
- `message_ids` (list[string], optional) - Specific message IDs to clear. If not provided, clears all.

**Response:**
```json
{
  "ok": true,
  "agent_id": "string",
  "cleared": 5,
  "message": "Cleared 5 message(s) for agent xyz"
}
```

### Get Unread Count

**GET** `/v1/agents/messages/{agent_id}/unread`

Get count of unread messages for an agent.

**Response:**
```json
{
  "ok": true,
  "agent_id": "string",
  "unread_count": 3
}
```

### Queue Statistics

**GET** `/v1/agents/messages/stats/queue`

Get message queue statistics.

**Response:**
```json
{
  "ok": true,
  "stats": {
    "total_sent": 42,
    "direct_delivered": 30,
    "queued": 12,
    "broadcast_sent": 5,
    "total_queued_messages": 8,
    "total_unread_messages": 6,
    "agents_with_messages": 3
  }
}
```

### Test Broadcast

**POST** `/v1/agents/messages/test/broadcast`

Test endpoint to send a broadcast message (useful for testing WebSocket).

**Query Parameters:**
- `message` (string, optional) - Test message content

**Response:**
```json
{
  "ok": true,
  "message": "Broadcast sent",
  "content": "Test broadcast from gateway"
}
```

## WebSocket Events

Connect to `/ws/agents` to receive real-time agent events.

### Event Types

#### `agent_message`

Point-to-point message notification.

```json
{
  "type": "agent_message",
  "message_id": "string",
  "from_agent_id": "string",
  "to_agent_id": "string",
  "content": "string",
  "message_type": "direct|reply",
  "metadata": {},
  "reply_to": null,
  "timestamp": "2026-01-13T..."
}
```

#### `agent_broadcast`

Broadcast message to all agents.

```json
{
  "type": "agent_broadcast",
  "message_id": "string",
  "from_agent_id": "string",
  "content": "string",
  "metadata": {},
  "timestamp": "2026-01-13T..."
}
```

#### `agent_message_delivered`

Delivery confirmation for sent message.

```json
{
  "type": "agent_message_delivered",
  "message_id": "string",
  "to_agent_id": "string",
  "delivered_at": "2026-01-13T...",
  "timestamp": "2026-01-13T..."
}
```

#### `agent_message_read`

Read receipt for message.

```json
{
  "type": "agent_message_read",
  "message_id": "string",
  "agent_id": "string",
  "read_at": "2026-01-13T...",
  "timestamp": "2026-01-13T..."
}
```

## Usage Examples

### Python Client Example

```python
import httpx
import asyncio

# Register agent
async def main():
    async with httpx.AsyncClient(base_url="http://localhost:8200") as client:
        # Register agents
        r1 = await client.post("/v1/agents/register", json={
            "model_name": "agent-1",
            "role": "worker"
        })
        agent1_id = r1.json()["agent_id"]

        r2 = await client.post("/v1/agents/register", json={
            "model_name": "agent-2",
            "role": "worker"
        })
        agent2_id = r2.json()["agent_id"]

        # Send message
        await client.post("/v1/agents/messages/send", json={
            "from_agent_id": agent1_id,
            "to_agent_id": agent2_id,
            "content": "Hello from Agent 1!"
        })

        # Get messages
        messages = await client.get(f"/v1/agents/messages/{agent2_id}")
        print(messages.json())

        # Broadcast
        await client.post("/v1/agents/messages/send", json={
            "from_agent_id": agent1_id,
            "to_agent_id": "broadcast",
            "content": "Broadcast to all agents!"
        })

asyncio.run(main())
```

### JavaScript/TypeScript Client Example

```typescript
// Connect to WebSocket
const ws = new WebSocket('ws://localhost:8200/ws/agents');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  if (data.type === 'agent_message') {
    console.log(`Message from ${data.from_agent_id}: ${data.content}`);
  } else if (data.type === 'agent_broadcast') {
    console.log(`Broadcast from ${data.from_agent_id}: ${data.content}`);
  }
};

// Send message via REST API
async function sendMessage(fromId, toId, content) {
  const response = await fetch('http://localhost:8200/v1/agents/messages/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from_agent_id: fromId,
      to_agent_id: toId,
      content: content
    })
  });

  return await response.json();
}
```

## Design Decisions (Updated 2026-01-13)

### Why k_inbox as Backend?

The system now uses **k_inbox** (maildir + JSON index) as the canonical inbox for these reasons:

1. **Durability**: Maildir provides battle-tested message persistence
2. **Fast Queries**: JSON index enables sub-50ms lookups (no need for SQLite)
3. **Unified System**: All coordination (tasks, broadcasts, direct messages) flows through one inbox
4. **WebSocket Real-time**: k_inbox triggers WebSocket automatically on send
5. **Proven Reliability**: Maildir is Unix-proven for message queues
6. **Backward Compatible**: v1 and v2 schemas coexist seamlessly

### Broadcast Messages (Changed)

Broadcast messages are now **DURABLE** (changed from ephemeral). They are:
- Stored in maildir like any other message
- Include read tracking (`read_by` array)
- Allow offline agents to catch up on broadcasts
- Still delivered via WebSocket to online agents

### Message Expiration

Messages do **NOT** expire automatically. Agents should periodically use:
```python
k_inbox(action="complete", id=msg_id, status="done")
```
to move messages to the `done/` folder. A future enhancement could add TTL support.

### JSON Index vs SQLite

We chose JSON files (`.index/by_agent.json`) instead of SQLite because:
- Simpler implementation (no database connection management)
- Fast enough for <10k messages per agent
- Human-readable for debugging
- Easy to backup/restore
- No schema migrations needed

If the inbox scales to >10k messages, consider SQLite migration.

## Integration with Existing Systems

### Agent Registry

- Uses agent registry to validate sender/receiver exist
- Checks agent online status (via heartbeat) for delivery confirmation
- Compatible with leader/worker roles

### WebSocket System

- Leverages existing `ConnectionManager` in `websocket.py`
- Uses same WebSocket endpoint `/ws/agents`
- New unified event types: `inbox_message_sent`, `inbox_message_claimed`, etc.

### k_inbox (NOW THE CORE)

This system **FULLY INTEGRATES** with k_inbox:
- All messages stored in maildir (ai/inbox/)
- REST API is an adapter layer over k_inbox
- Agents can use either REST API or k_inbox MCP tool directly
- Task notifier system continues to work (pending_tasks/ unchanged)

## Testing

### Manual Testing

1. Start the gateway:
   ```bash
   cd apps/gateway
   python -m apps.gateway.server
   ```

2. Register two agents:
   ```bash
   curl -X POST http://localhost:8200/v1/agents/register \
     -H "Content-Type: application/json" \
     -d '{"model_name": "test-agent-1", "role": "worker"}'

   curl -X POST http://localhost:8200/v1/agents/register \
     -H "Content-Type: application/json" \
     -d '{"model_name": "test-agent-2", "role": "worker"}'
   ```

3. Send a message:
   ```bash
   curl -X POST http://localhost:8200/v1/agents/messages/send \
     -H "Content-Type: application/json" \
     -d '{
       "from_agent_id": "test-agent-1_...",
       "to_agent_id": "test-agent-2_...",
       "content": "Hello!"
     }'
   ```

4. Retrieve messages:
   ```bash
   curl http://localhost:8200/v1/agents/messages/test-agent-2_...
   ```

### WebSocket Testing

Use a WebSocket client like `wscat`:

```bash
npm install -g wscat
wscat -c ws://localhost:8200/ws/agents
```

Then send messages via REST API and watch them appear in the WebSocket stream.

## Future Enhancements

- [ ] Message priority levels
- [ ] Delivery confirmation/acknowledgment
- [ ] Message expiration (TTL)
- [ ] Message persistence to disk
- [ ] Message filtering/subscriptions
- [ ] End-to-end encryption
- [ ] Rate limiting
- [ ] Message search/query

## Related Files

- `apps/gateway/agents/messaging.py` - Message models and queue
- `apps/gateway/agents/messaging_router.py` - REST API endpoints
- `apps/gateway/websocket.py` - WebSocket broadcast functions
- `apps/gateway/server.py` - Main gateway server (includes router)
