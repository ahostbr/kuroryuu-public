# Traffic Monitoring Integration Guide

## Overview
The traffic monitoring module provides real-time visualization of HTTP traffic through the gateway.

## Integration Steps

### 1. Add Imports to `server.py`

```python
# Add these imports at the top
from .traffic.middleware import TrafficMonitoringMiddleware
from .traffic.router import router as traffic_router
from .traffic.websocket import websocket_traffic_flow
```

### 2. Add Middleware to FastAPI App

Add the traffic monitoring middleware AFTER CORS middleware but BEFORE other route handlers:

```python
# After CORS middleware
app.add_middleware(
    CORSMiddleware,
    # ... existing CORS config
)

# Add traffic monitoring middleware
app.add_middleware(TrafficMonitoringMiddleware)
```

### 3. Register REST Router

Add the traffic router with other API routers:

```python
# With other routers
app.include_router(agents_router)
app.include_router(chat_router)
# ... other routers

# Add traffic router
app.include_router(traffic_router)
```

### 4. Register WebSocket Endpoint

Add the traffic WebSocket endpoint with other WebSocket routes:

```python
# With other WebSocket endpoints
@app.websocket("/ws/agents/{agent_id}")
async def websocket_agent_endpoint(websocket: WebSocket, agent_id: str):
    # ... existing code

# Add traffic WebSocket endpoint
@app.websocket("/ws/traffic-flow")
async def ws_traffic_flow(websocket: WebSocket):
    await websocket_traffic_flow(websocket)
```

## Testing

1. Start the gateway server
2. Open the desktop app and navigate to "Network Traffic" (shortcut: T)
3. Make API requests through the gateway
4. Verify traffic events appear in the visualization

## Configuration

The traffic monitoring system uses these default settings:
- **Time Window**: 60 seconds (configurable in `tracker.py`)
- **Max Events**: 100 (configurable in Zustand store)
- **WebSocket Endpoint**: `ws://127.0.0.1:8200/ws/traffic-flow`

## TODO Items

The following items need backend implementation:

1. **Middleware (`middleware.py`)**
   - Event broadcasting to WebSocket clients
   - Integration with traffic_tracker
   - Request/response payload capture

2. **WebSocket (`websocket.py`)**
   - Connection lifecycle management
   - Heartbeat/ping-pong mechanism
   - Connection authentication

3. **Tracker (`tracker.py`)**
   - Thread-safe operations
   - Periodic statistics broadcasting
   - Historical data persistence

4. **Router (`router.py`)**
   - Caching for statistics
   - Endpoint-specific breakdowns
   - Advanced filtering

## Architecture

```
Client Request
     ↓
TrafficMonitoringMiddleware (captures event)
     ↓
Gateway Handler
     ↓
Response + Statistics Update
     ↓
WebSocket Broadcast to Desktop App
     ↓
ReactFlow Visualization
```
