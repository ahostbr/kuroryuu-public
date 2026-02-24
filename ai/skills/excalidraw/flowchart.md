---
name: Flowchart Diagrams
description: Flowchart conventions - start/end ellipses, decision diamonds, vertical flow templates for process and algorithm visualization
version: 1.0.0
---

# FLOWCHART DIAGRAMS

You create flowchart diagrams using `k_excalidraw` with `diagram_type="flowchart"`. Flowcharts show processes, decisions, and algorithms using a vertical top-to-bottom layout with shape semantics.

## Tool Reference

```
k_excalidraw(
  action="create",
  name="<project>_<topic>_flowchart",
  diagram_type="flowchart",
  nodes=[
    {"id": "unique_id", "label": "Display Name", "type": "process", "color": "blue"},
    ...
  ],
  connections=[
    {"from": "source_id", "to": "target_id", "label": "condition"},
    ...
  ]
)
```

**Layout engine:** Vertical flow, centered. Nodes stacked top-to-bottom with consistent spacing. Arrows flow downward.

**Node params:** `id` (unique string), `label` (display text), `type` (shape type), `color` (name or hex)

**Node types:**

| Type | Shape | Use For |
|------|-------|---------|
| `start` | Ellipse | Entry point of the flow |
| `end` | Ellipse | Terminal/exit point |
| `process` | Rectangle | Actions, operations, steps |
| `decision` | Diamond | Yes/no branches, conditions |

**Connection params:** `from` (source node id), `to` (target node id), `label` (optional — use "Yes"/"No" on decision branches)

## Color Conventions

| Element | Color | Use For |
|---------|-------|---------|
| Start/End | `green` | Flow entry and exit points |
| Process | `blue` | Standard actions and operations |
| Decision | `yellow` | Conditional branches |
| Error/Fail | `red` | Error states, failure paths |
| External Action | `orange` | Async operations, external calls |
| Sub-process | `purple` | References to other flows |

## Flow Organization

Standard vertical flowchart structure:

```
Start (ellipse, green)
  ↓
Process Step (rectangle, blue)
  ↓
Decision? (diamond, yellow)
  ↓ Yes          ↓ No
Process A       Process B
  ↓               ↓
End (ellipse, green)
```

**Branching:** For decision nodes, the "Yes" path continues downward in the main flow. The "No" path is a side branch. Label connections "Yes" and "No" explicitly.

**Merging:** If branches converge, both connect to the same downstream node.

## Templates

### Template 1: User Authentication Flow

```
k_excalidraw(
  action="create",
  name="auth_login_flowchart",
  diagram_type="flowchart",
  nodes=[
    {"id": "start", "label": "User Visits Login", "type": "start", "color": "green"},
    {"id": "enter_creds", "label": "Enter Credentials", "type": "process", "color": "blue"},
    {"id": "validate", "label": "Valid Credentials?", "type": "decision", "color": "yellow"},
    {"id": "check_2fa", "label": "2FA Enabled?", "type": "decision", "color": "yellow"},
    {"id": "send_code", "label": "Send 2FA Code", "type": "process", "color": "orange"},
    {"id": "verify_code", "label": "Code Valid?", "type": "decision", "color": "yellow"},
    {"id": "create_session", "label": "Create Session", "type": "process", "color": "blue"},
    {"id": "show_error", "label": "Show Error", "type": "process", "color": "red"},
    {"id": "dashboard", "label": "Dashboard", "type": "end", "color": "green"}
  ],
  connections=[
    {"from": "start", "to": "enter_creds"},
    {"from": "enter_creds", "to": "validate"},
    {"from": "validate", "to": "check_2fa", "label": "Yes"},
    {"from": "validate", "to": "show_error", "label": "No"},
    {"from": "check_2fa", "to": "send_code", "label": "Yes"},
    {"from": "check_2fa", "to": "create_session", "label": "No"},
    {"from": "send_code", "to": "verify_code"},
    {"from": "verify_code", "to": "create_session", "label": "Yes"},
    {"from": "verify_code", "to": "show_error", "label": "No"},
    {"from": "create_session", "to": "dashboard"}
  ]
)
```

### Template 2: CI/CD Pipeline

```
k_excalidraw(
  action="create",
  name="cicd_pipeline_flowchart",
  diagram_type="flowchart",
  nodes=[
    {"id": "push", "label": "Git Push", "type": "start", "color": "green"},
    {"id": "lint", "label": "Lint & Format", "type": "process", "color": "blue"},
    {"id": "test", "label": "Run Tests", "type": "process", "color": "blue"},
    {"id": "tests_pass", "label": "Tests Pass?", "type": "decision", "color": "yellow"},
    {"id": "build", "label": "Build Image", "type": "process", "color": "blue"},
    {"id": "deploy_staging", "label": "Deploy Staging", "type": "process", "color": "orange"},
    {"id": "approval", "label": "Approved?", "type": "decision", "color": "yellow"},
    {"id": "deploy_prod", "label": "Deploy Production", "type": "process", "color": "blue"},
    {"id": "notify_fail", "label": "Notify Failure", "type": "process", "color": "red"},
    {"id": "done", "label": "Complete", "type": "end", "color": "green"}
  ],
  connections=[
    {"from": "push", "to": "lint"},
    {"from": "lint", "to": "test"},
    {"from": "test", "to": "tests_pass"},
    {"from": "tests_pass", "to": "build", "label": "Yes"},
    {"from": "tests_pass", "to": "notify_fail", "label": "No"},
    {"from": "build", "to": "deploy_staging"},
    {"from": "deploy_staging", "to": "approval"},
    {"from": "approval", "to": "deploy_prod", "label": "Yes"},
    {"from": "approval", "to": "notify_fail", "label": "No"},
    {"from": "deploy_prod", "to": "done"}
  ]
)
```

### Template 3: Error Handling Flow

```
k_excalidraw(
  action="create",
  name="error_handling_flowchart",
  diagram_type="flowchart",
  nodes=[
    {"id": "request", "label": "Receive Request", "type": "start", "color": "green"},
    {"id": "validate", "label": "Validate Input", "type": "process", "color": "blue"},
    {"id": "valid", "label": "Input Valid?", "type": "decision", "color": "yellow"},
    {"id": "process", "label": "Process Request", "type": "process", "color": "blue"},
    {"id": "success", "label": "Success?", "type": "decision", "color": "yellow"},
    {"id": "return_ok", "label": "Return 200 OK", "type": "end", "color": "green"},
    {"id": "return_400", "label": "Return 400", "type": "process", "color": "red"},
    {"id": "retry", "label": "Retries Left?", "type": "decision", "color": "yellow"},
    {"id": "return_500", "label": "Return 500", "type": "process", "color": "red"},
    {"id": "end", "label": "End", "type": "end", "color": "green"}
  ],
  connections=[
    {"from": "request", "to": "validate"},
    {"from": "validate", "to": "valid"},
    {"from": "valid", "to": "process", "label": "Yes"},
    {"from": "valid", "to": "return_400", "label": "No"},
    {"from": "process", "to": "success"},
    {"from": "success", "to": "return_ok", "label": "Yes"},
    {"from": "success", "to": "retry", "label": "No"},
    {"from": "retry", "to": "process", "label": "Yes"},
    {"from": "retry", "to": "return_500", "label": "No"},
    {"from": "return_400", "to": "end"},
    {"from": "return_500", "to": "end"}
  ]
)
```

## Step-by-Step Instructions

1. **Identify the process** — What flow is being diagrammed? What triggers it?
2. **List all steps** — Write out every action, decision, and outcome
3. **Classify each step** — Assign a node type: start, end, process, or decision
4. **Assign colors** — Use the color convention table
5. **Order vertically** — Start at top, end at bottom. Main path goes straight down.
6. **Map connections** — Connect each step to the next. Label decision branches "Yes"/"No".
7. **Check for dead ends** — Every non-end node must have at least one outgoing connection
8. **Name the diagram** — `{project}_{topic}_flowchart`
9. **Create** — Call `k_excalidraw(action="create", ...)`
10. **Verify** — Confirm creation, report element count

## Quality Checklist

Before delivering the diagram:
- [ ] Flow has exactly one `start` node and at least one `end` node
- [ ] All decisions use diamond shape (`type: "decision"`)
- [ ] Decision branches labeled "Yes" and "No" (or equivalent)
- [ ] No dead-end process nodes (every non-end node has an outgoing connection)
- [ ] Colors follow the convention (green start/end, yellow decisions, blue processes)
- [ ] Labels are concise actions or questions (not full sentences)
- [ ] Max 16-20 nodes per flowchart
- [ ] Diagram name follows `{project}_{topic}_flowchart` pattern
- [ ] Diagram created successfully (check `ok: true` response)
