---
name: Architecture Diagrams
description: Architecture diagram conventions - layer grouping, color coding, horizontal grid templates for system component visualization
version: 1.0.0
---

# ARCHITECTURE DIAGRAMS

You create architecture diagrams using `k_excalidraw` with `diagram_type="architecture"`. Architecture diagrams show system components, their relationships, and data flow using a horizontal grid layout.

## Tool Reference

```
k_excalidraw(
  action="create",
  name="<project>_<topic>_architecture",
  diagram_type="architecture",
  nodes=[
    {"id": "unique_id", "label": "Display Name", "color": "blue"},
    ...
  ],
  connections=[
    {"from": "source_id", "to": "target_id", "label": "relationship"},
    ...
  ]
)
```

**Layout engine:** Horizontal grid, up to 4 columns. Nodes placed left-to-right, top-to-bottom. Arrows auto-route between node edges.

**Node params:** `id` (unique string), `label` (display text), `color` (name or hex)

**Connection params:** `from` (source node id), `to` (target node id), `label` (optional relationship text)

## Color Conventions

| Layer | Color | Use For |
|-------|-------|---------|
| Client / Frontend | `purple` | Browser, mobile app, CLI, user-facing |
| Services / APIs | `blue` | Backend services, API gateways, microservices |
| Storage | `green` | Databases, caches, file systems, object stores |
| External | `red` | Third-party APIs, SaaS integrations |
| Async / Queues | `orange` | Message brokers, event buses, job queues |
| Infrastructure | `gray` | Load balancers, DNS, CDN, config servers |

## Layer Organization

Organize nodes by layer, top-to-bottom:

```
Row 1: Clients (purple)     — Browser, Mobile App, CLI
Row 2: Services (blue)      — API Gateway, Auth Service, Core Service
Row 3: Storage (green)      — PostgreSQL, Redis, S3
Row 4: External (red)       — Stripe API, SendGrid, Analytics
```

The layout engine places up to 4 nodes per row. Plan your node order so same-layer items appear together.

## Templates

### Template 1: Web Application Stack

```
k_excalidraw(
  action="create",
  name="myapp_web_stack_architecture",
  diagram_type="architecture",
  nodes=[
    {"id": "browser", "label": "Browser", "color": "purple"},
    {"id": "cdn", "label": "CDN", "color": "gray"},
    {"id": "api", "label": "API Gateway", "color": "blue"},
    {"id": "auth", "label": "Auth Service", "color": "blue"},
    {"id": "core", "label": "Core Service", "color": "blue"},
    {"id": "worker", "label": "Worker", "color": "orange"},
    {"id": "db", "label": "PostgreSQL", "color": "green"},
    {"id": "cache", "label": "Redis", "color": "green"},
    {"id": "queue", "label": "RabbitMQ", "color": "orange"},
    {"id": "storage", "label": "S3", "color": "green"}
  ],
  connections=[
    {"from": "browser", "to": "cdn", "label": "static assets"},
    {"from": "browser", "to": "api", "label": "API calls"},
    {"from": "api", "to": "auth", "label": "authenticate"},
    {"from": "api", "to": "core", "label": "route"},
    {"from": "core", "to": "db", "label": "read/write"},
    {"from": "core", "to": "cache", "label": "cache"},
    {"from": "core", "to": "queue", "label": "enqueue"},
    {"from": "worker", "to": "queue", "label": "consume"},
    {"from": "worker", "to": "storage", "label": "upload"}
  ]
)
```

### Template 2: Microservices

```
k_excalidraw(
  action="create",
  name="platform_microservices_architecture",
  diagram_type="architecture",
  nodes=[
    {"id": "gateway", "label": "API Gateway", "color": "blue"},
    {"id": "users", "label": "User Service", "color": "blue"},
    {"id": "orders", "label": "Order Service", "color": "blue"},
    {"id": "payments", "label": "Payment Service", "color": "blue"},
    {"id": "notifications", "label": "Notification Service", "color": "blue"},
    {"id": "users_db", "label": "Users DB", "color": "green"},
    {"id": "orders_db", "label": "Orders DB", "color": "green"},
    {"id": "event_bus", "label": "Event Bus", "color": "orange"},
    {"id": "stripe", "label": "Stripe", "color": "red"}
  ],
  connections=[
    {"from": "gateway", "to": "users", "label": "auth"},
    {"from": "gateway", "to": "orders", "label": "CRUD"},
    {"from": "orders", "to": "payments", "label": "charge"},
    {"from": "payments", "to": "stripe", "label": "process"},
    {"from": "users", "to": "users_db"},
    {"from": "orders", "to": "orders_db"},
    {"from": "orders", "to": "event_bus", "label": "publish"},
    {"from": "event_bus", "to": "notifications", "label": "subscribe"}
  ]
)
```

### Template 3: Data Pipeline

```
k_excalidraw(
  action="create",
  name="analytics_pipeline_architecture",
  diagram_type="architecture",
  nodes=[
    {"id": "sources", "label": "Data Sources", "color": "purple"},
    {"id": "ingestion", "label": "Ingestion Layer", "color": "blue"},
    {"id": "kafka", "label": "Kafka", "color": "orange"},
    {"id": "transform", "label": "Transform", "color": "blue"},
    {"id": "warehouse", "label": "Data Warehouse", "color": "green"},
    {"id": "dashboard", "label": "Dashboard", "color": "purple"}
  ],
  connections=[
    {"from": "sources", "to": "ingestion", "label": "raw events"},
    {"from": "ingestion", "to": "kafka", "label": "stream"},
    {"from": "kafka", "to": "transform", "label": "consume"},
    {"from": "transform", "to": "warehouse", "label": "load"},
    {"from": "warehouse", "to": "dashboard", "label": "query"}
  ]
)
```

## Step-by-Step Instructions

1. **Identify components** — List all system components the user mentions or implies
2. **Classify layers** — Assign each component to a layer (client, service, storage, external, async, infra)
3. **Assign colors** — Use the color convention table above
4. **Order nodes** — Put clients first, then services, then storage, then external. Same-layer items adjacent.
5. **Map connections** — Identify data flow and dependencies between components
6. **Label connections** — Use short verbs: "read/write", "auth", "cache", "publish", "consume"
7. **Name the diagram** — `{project}_{topic}_architecture`
8. **Create** — Call `k_excalidraw(action="create", ...)`
9. **Verify** — Check element count, confirm no orphans

## Quality Checklist

Before delivering the diagram:
- [ ] All nodes have semantic colors matching the layer convention
- [ ] No orphan nodes (every node has at least one connection)
- [ ] Node labels are 1-3 words, clear and specific
- [ ] Connection labels use short verbs describing the relationship
- [ ] Nodes ordered by layer: clients → services → storage → external
- [ ] Max 16-20 nodes (split into multiple diagrams if larger)
- [ ] Diagram name follows `{project}_{topic}_architecture` pattern
- [ ] Diagram created successfully (check `ok: true` response)
