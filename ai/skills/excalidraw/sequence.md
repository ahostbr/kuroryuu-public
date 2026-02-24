---
name: Sequence Diagrams
description: Sequence diagram conventions - participant lifelines, request/response arrow patterns for API and service interaction visualization
version: 1.0.0
---

# SEQUENCE DIAGRAMS

You create sequence diagrams using `k_excalidraw` with `diagram_type="sequence"`. Sequence diagrams show interactions between participants over time, with horizontal arrows representing messages on vertical lifelines.

## Tool Reference

```
k_excalidraw(
  action="create",
  name="<project>_<topic>_sequence",
  diagram_type="sequence",
  nodes=[
    {"id": "participant_id", "label": "Display Name", "color": "blue"},
    ...
  ],
  connections=[
    {"from": "source_id", "to": "target_id", "label": "message"},
    ...
  ]
)
```

**Layout engine:** Participants as boxes across the top. Dashed vertical lifelines below each. Horizontal arrows for messages, ordered top-to-bottom chronologically.

**Node params (participants):** `id` (unique string), `label` (display text), `color` (name or hex)

**Connection params (messages):** `from` (sender participant id), `to` (receiver participant id), `label` (message text — method name, HTTP verb, event name)

**Message ordering:** Messages render top-to-bottom in array order. The first connection is the first message in time.

## Color Conventions

| Participant Type | Color | Use For |
|-----------------|-------|---------|
| Client / User | `purple` | Browser, mobile app, CLI, end user |
| API / Gateway | `blue` | API gateway, load balancer, proxy |
| Backend Service | `blue` | Application services, business logic |
| Database | `green` | Database, cache, data store |
| External Service | `red` | Third-party API, SaaS provider |
| Queue / Broker | `orange` | Message queue, event bus |

## Message Conventions

### Label Format

Use concise, specific labels:

| Pattern | Example | When |
|---------|---------|------|
| HTTP verb + path | `POST /api/users` | REST API calls |
| Method name | `authenticate()` | Internal service calls |
| Event name | `order.created` | Event-driven messages |
| Response code | `200 OK` | Response arrows |
| Data description | `user data` | Data return |

### Request/Response Pairs

Model request-response pairs as two messages:

```
{"from": "client", "to": "server", "label": "GET /api/users"},
{"from": "server", "to": "client", "label": "200 [users]"},
```

Convention: requests use `VERB /path`, responses use `status [data]`.

### Self-Calls

For internal processing, a participant calls itself:

```
{"from": "server", "to": "server", "label": "validate input"},
```

## Templates

### Template 1: REST API Request

```
k_excalidraw(
  action="create",
  name="api_user_create_sequence",
  diagram_type="sequence",
  nodes=[
    {"id": "client", "label": "Client", "color": "purple"},
    {"id": "gateway", "label": "API Gateway", "color": "blue"},
    {"id": "auth", "label": "Auth Service", "color": "blue"},
    {"id": "users", "label": "User Service", "color": "blue"},
    {"id": "db", "label": "PostgreSQL", "color": "green"}
  ],
  connections=[
    {"from": "client", "to": "gateway", "label": "POST /api/users"},
    {"from": "gateway", "to": "auth", "label": "validate token"},
    {"from": "auth", "to": "gateway", "label": "200 valid"},
    {"from": "gateway", "to": "users", "label": "createUser()"},
    {"from": "users", "to": "db", "label": "INSERT user"},
    {"from": "db", "to": "users", "label": "user row"},
    {"from": "users", "to": "gateway", "label": "201 user"},
    {"from": "gateway", "to": "client", "label": "201 Created"}
  ]
)
```

### Template 2: Authentication Flow

```
k_excalidraw(
  action="create",
  name="auth_oauth_sequence",
  diagram_type="sequence",
  nodes=[
    {"id": "browser", "label": "Browser", "color": "purple"},
    {"id": "app", "label": "App Server", "color": "blue"},
    {"id": "oauth", "label": "OAuth Provider", "color": "red"},
    {"id": "db", "label": "Database", "color": "green"}
  ],
  connections=[
    {"from": "browser", "to": "app", "label": "GET /login"},
    {"from": "app", "to": "browser", "label": "302 → OAuth"},
    {"from": "browser", "to": "oauth", "label": "authorize"},
    {"from": "oauth", "to": "browser", "label": "auth code"},
    {"from": "browser", "to": "app", "label": "callback?code=abc"},
    {"from": "app", "to": "oauth", "label": "exchange code"},
    {"from": "oauth", "to": "app", "label": "access token"},
    {"from": "app", "to": "db", "label": "upsert user"},
    {"from": "db", "to": "app", "label": "user record"},
    {"from": "app", "to": "browser", "label": "200 + session cookie"}
  ]
)
```

### Template 3: Event-Driven Processing

```
k_excalidraw(
  action="create",
  name="order_processing_sequence",
  diagram_type="sequence",
  nodes=[
    {"id": "client", "label": "Client", "color": "purple"},
    {"id": "orders", "label": "Order Service", "color": "blue"},
    {"id": "queue", "label": "Event Bus", "color": "orange"},
    {"id": "payments", "label": "Payment Service", "color": "blue"},
    {"id": "email", "label": "Email Service", "color": "blue"}
  ],
  connections=[
    {"from": "client", "to": "orders", "label": "POST /orders"},
    {"from": "orders", "to": "orders", "label": "validate order"},
    {"from": "orders", "to": "queue", "label": "order.created"},
    {"from": "orders", "to": "client", "label": "202 Accepted"},
    {"from": "queue", "to": "payments", "label": "order.created"},
    {"from": "payments", "to": "payments", "label": "charge card"},
    {"from": "payments", "to": "queue", "label": "payment.completed"},
    {"from": "queue", "to": "email", "label": "payment.completed"},
    {"from": "email", "to": "email", "label": "send receipt"}
  ]
)
```

## Step-by-Step Instructions

1. **Identify participants** — List all systems/services involved in the interaction
2. **Classify participants** — Assign colors based on type (client, service, storage, external)
3. **Order participants** — Left-to-right: initiator first, then services in call order, storage/external last
4. **List messages chronologically** — Write out every request, response, and event in time order
5. **Label messages** — Use the label format conventions (HTTP verbs, method names, event names)
6. **Pair requests and responses** — Every request should have a corresponding response
7. **Name the diagram** — `{project}_{topic}_sequence`
8. **Create** — Call `k_excalidraw(action="create", ...)`
9. **Verify** — Confirm creation, check participant count and message count

## Quality Checklist

Before delivering the diagram:
- [ ] Participants ordered logically (initiator → services → storage → external)
- [ ] All participants have semantic colors matching the convention
- [ ] Messages are in chronological order (array order = time order)
- [ ] Request-response pairs are matched (every request has a response)
- [ ] Labels follow the convention (HTTP verbs, method names, or event names)
- [ ] No participant is unused (every participant sends or receives at least one message)
- [ ] Max 6-8 participants per diagram (split complex flows into phases)
- [ ] Max 15-20 messages per diagram (keep it readable)
- [ ] Diagram name follows `{project}_{topic}_sequence` pattern
- [ ] Diagram created successfully (check `ok: true` response)
