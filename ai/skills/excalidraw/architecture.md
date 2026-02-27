---
name: Architecture Diagrams
description: Architecture diagram conventions — section-based layouts, dark theme, color coding, mixed shapes for system component visualization
version: 2.0.0
---

# ARCHITECTURE DIAGRAMS

You create architecture diagrams using `k_excalidraw` with `diagram_type="architecture"`. Architecture diagrams show system components, their relationships, and data flow.

**Two layout modes:**
1. **Section-based** (recommended) — Group nodes into visual sections/zones. Include any `type="section"` node to activate.
2. **Flat grid** — Classic 4-column grid. Used when no sections are defined.

## Tool Reference

### Section-Based Layout (Recommended)

```
k_excalidraw(
  action="create",
  name="<project>_<topic>_architecture",
  diagram_type="architecture",
  nodes=[
    # Section definitions
    {"id": "layer1", "type": "section", "title": "LAYER NAME", "title_color": "cyan",
     "description": "What this layer does", "bg_color": "dark", "nodes": ["node1", "node2"]},
    # Regular nodes (referenced by sections)
    {"id": "node1", "label": "Service A", "color": "blue", "shape": "rectangle"},
    {"id": "node2", "label": "Service B", "color": "blue"},
    ...
  ],
  connections=[
    {"from": "node1", "to": "node2", "label": "data flow"},
    ...
  ]
)
```

### Flat Grid Layout

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

## Node Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `id` | string | required | Unique identifier |
| `label` | string | id | Display text (1-3 words) |
| `color` | string | "blue" | Fill color name or hex |
| `shape` | string | "rectangle" | rectangle, ellipse, diamond |
| `stroke_style` | string | "solid" | solid, dashed, dotted |
| `text_color` | string | "#e0e0e0" | Label text color |
| `width` | int | 200/180 | Override width (min 120) |
| `height` | int | 80/70 | Override height (min 60) |

## Section Properties

| Property | Type | Description |
|----------|------|-------------|
| `type` | "section" | Required — activates section layout |
| `title` | string | Section header (uppercase recommended) |
| `title_color` | string | Accent color: cyan, green, red, yellow, magenta, purple, orange |
| `description` | string | Optional subtitle text (muted) |
| `bg_color` | string | Fill color for section zone |
| `nodes` | string[] | List of child node IDs to place inside |

## Dark Theme Color Conventions

### Fill Colors (for shapes)

| Name | Hex | Use For |
|------|-----|---------|
| `blue` | `#1e3a5f` | Services, APIs, applications |
| `green` | `#1a3a2a` | Storage, databases, caches |
| `red` | `#3a1a1a` | External systems, third-party |
| `yellow` | `#3a3a1a` | Decisions, conditions, warnings |
| `purple` | `#2a1a3a` | Clients, users, frontends |
| `orange` | `#3a2a1a` | Queues, message brokers, async |
| `gray` | `#2a2a2e` | Infrastructure, config, utilities |
| `teal` | `#1a2a2a` | Middleware, orchestration |
| `dark` | `#1a1a2e` | Section backgrounds |

### Accent Colors (for titles, highlights)

| Name | Hex | Use For |
|------|-----|---------|
| `cyan` | `#67e8f9` | Default section titles |
| `green` | `#4ade80` | Success, active states |
| `red` | `#f87171` | Errors, external alerts |
| `yellow` | `#fbbf24` | Warnings, important highlights |
| `magenta` | `#f472b6` | Special features |
| `purple` | `#a78bfa` | Client layer titles |
| `orange` | `#fb923c` | Async/queue highlights |

## Layer Organization

Organize sections top-to-bottom by layer:

```
Section 1: CLIENT LAYER (purple nodes)     — Desktop, Web, CLI
Section 2: GATEWAY / API LAYER (blue)      — Gateway, Auth, Routing
Section 3: SERVICES LAYER (blue/teal)      — Core Service, Workers
Section 4: STORAGE LAYER (green)           — PostgreSQL, Redis, S3
Section 5: EXTERNAL (red)                  — Stripe, SendGrid
```

## Templates

### Template 1: Web Application Stack (Section-Based)

```
k_excalidraw(
  action="create",
  name="myapp_web_stack_architecture",
  diagram_type="architecture",
  nodes=[
    {"id": "clients", "type": "section", "title": "CLIENT LAYER", "title_color": "purple",
     "description": "User-facing applications", "bg_color": "dark", "nodes": ["browser", "cdn"]},
    {"id": "services", "type": "section", "title": "SERVICE LAYER", "title_color": "cyan",
     "description": "Backend API and processing", "bg_color": "dark",
     "nodes": ["api", "auth", "core", "worker"]},
    {"id": "storage_sec", "type": "section", "title": "STORAGE LAYER", "title_color": "green",
     "description": "Persistence and caching", "bg_color": "dark",
     "nodes": ["db", "cache", "queue", "storage"]},

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

### Template 2: Microservices (Section-Based)

```
k_excalidraw(
  action="create",
  name="platform_microservices_architecture",
  diagram_type="architecture",
  nodes=[
    {"id": "gateway_sec", "type": "section", "title": "API GATEWAY", "title_color": "cyan",
     "bg_color": "dark", "nodes": ["gateway"]},
    {"id": "services_sec", "type": "section", "title": "MICROSERVICES", "title_color": "green",
     "description": "Domain-specific services", "bg_color": "dark",
     "nodes": ["users", "orders", "payments", "notifications"]},
    {"id": "data_sec", "type": "section", "title": "DATA & MESSAGING", "title_color": "yellow",
     "bg_color": "dark", "nodes": ["users_db", "orders_db", "event_bus"]},

    {"id": "gateway", "label": "API Gateway", "color": "blue"},
    {"id": "users", "label": "User Service", "color": "blue"},
    {"id": "orders", "label": "Order Service", "color": "blue"},
    {"id": "payments", "label": "Payment Service", "color": "blue"},
    {"id": "notifications", "label": "Notifications", "color": "blue"},
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

### Template 3: Data Pipeline (Section-Based)

```
k_excalidraw(
  action="create",
  name="analytics_pipeline_architecture",
  diagram_type="architecture",
  nodes=[
    {"id": "ingest_sec", "type": "section", "title": "INGESTION", "title_color": "orange",
     "bg_color": "dark", "nodes": ["sources", "ingestion"]},
    {"id": "process_sec", "type": "section", "title": "PROCESSING", "title_color": "cyan",
     "bg_color": "dark", "nodes": ["kafka", "transform"]},
    {"id": "output_sec", "type": "section", "title": "OUTPUT", "title_color": "green",
     "bg_color": "dark", "nodes": ["warehouse", "dashboard"]},

    {"id": "sources", "label": "Data Sources", "color": "purple"},
    {"id": "ingestion", "label": "Ingestion", "color": "blue"},
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
3. **Create sections** — One section per layer with appropriate title_color
4. **Assign colors** — Use the dark fill color convention table above
5. **Choose shapes** — rectangle (default), ellipse (start/end/external), diamond (decision points)
6. **Order nodes** — Clients first, services, storage, external. Section order = visual top-to-bottom.
7. **Map connections** — Identify data flow and dependencies between components
8. **Label connections** — Short verbs: "read/write", "auth", "cache", "publish", "consume"
9. **Name the diagram** — `{project}_{topic}_architecture`
10. **Create** — Call `k_excalidraw(action="create", ...)`
11. **Verify** — Check element count, confirm no orphans

## Quality Checklist

Before delivering the diagram:
- [ ] All shapes use dark fill colors matching the layer convention
- [ ] All text is readable (#e0e0e0 on dark backgrounds)
- [ ] Section titles use UPPERCASE and accent colors
- [ ] No orphan nodes (every node has at least one connection)
- [ ] Node labels are 1-3 words, no emoji
- [ ] Connection labels use short verbs
- [ ] Font sizes: titles >= 24px, body >= 16px, annotations >= 14px (absolute min)
- [ ] MIN_SPACING (25px) between all elements
- [ ] Nodes ordered by layer: clients > services > storage > external
- [ ] Max 16-20 nodes per diagram (split if larger)
- [ ] Diagram name follows `{project}_{topic}_architecture` pattern
- [ ] Diagram created successfully (check `ok: true` response)
