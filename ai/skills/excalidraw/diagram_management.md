---
name: Diagram Management
description: Read/update/list/delete lifecycle - element ID handling, incremental modification workflows for existing diagrams
version: 1.0.0
---

# DIAGRAM MANAGEMENT

You manage the lifecycle of existing Excalidraw diagrams — listing, reading, updating, and deleting. This mode handles incremental modifications, element ID tracking, and multi-step diagram refinement.

## Tool Reference

### List All Diagrams

```
k_excalidraw(action="list")
```

Returns: `{ok, count, diagrams: [{name, path, size_bytes, element_count, modified}]}`

### Read a Diagram

```
k_excalidraw(action="read", name="diagram_name")
```

Returns: `{ok, path, name, document, element_count}`

The `document` contains the full Excalidraw JSON including all `elements`. Each element has an `id` field you'll need for updates.

### Update a Diagram

```
k_excalidraw(
  action="update",
  name="diagram_name",
  add_elements=[...],    # New raw elements to append
  remove_ids=["id1"],    # Element IDs to remove
  modify=[               # Partial updates to existing elements
    {"id": "existing_id", "backgroundColor": "#b2f2bb"}
  ]
)
```

Returns: `{ok, path, name, element_count, changes: {added, removed, modified}}`

### Delete a Diagram

```
k_excalidraw(action="delete", name="diagram_name")
```

Returns: `{ok, name, path, message}`

## Update Operations

### Adding Nodes to an Existing Diagram

To add nodes, you need raw Excalidraw element JSON. The simplest approach:

1. Read the existing diagram to understand current layout
2. Calculate positions for new elements (avoid overlapping)
3. Use `add_elements` with properly structured elements

**Shortcut:** Create a temporary diagram with just the new nodes, read it to get the elements, then add those elements to the target diagram.

### Removing Elements

1. Read the diagram to find element IDs
2. Identify the IDs of elements to remove (nodes + their bound text labels + connected arrows)
3. Pass all related IDs to `remove_ids`

**Important:** When removing a node, also remove:
- Its bound text element (check `boundElements` on the node for text bindings)
- Arrows connected to it (check `boundElements` for arrow bindings)

### Modifying Elements

Use `modify` to change properties of existing elements:

```
k_excalidraw(
  action="update",
  name="diagram_name",
  modify=[
    {"id": "abc123", "backgroundColor": "#ffc9c9"},       # Change color
    {"id": "def456", "text": "New Label"},                 # Change text
    {"id": "ghi789", "x": 400, "y": 200},                 # Move element
    {"id": "jkl012", "width": 250, "height": 100},        # Resize
    {"id": "mno345", "strokeStyle": "dashed"}              # Change style
  ]
)
```

### Common Modifications

| Change | Property | Example |
|--------|----------|---------|
| Color | `backgroundColor` | `"#b2f2bb"` |
| Label text | `text` (on text element) | `"New Name"` |
| Position | `x`, `y` | `400, 200` |
| Size | `width`, `height` | `250, 100` |
| Border style | `strokeStyle` | `"dashed"`, `"dotted"`, `"solid"` |
| Border color | `strokeColor` | `"#e03131"` |
| Border width | `strokeWidth` | `1`, `2`, `4` |
| Opacity | `opacity` | `50` (0-100) |

## Workflows

### Workflow 1: Refine a Diagram

```
# 1. List available diagrams
k_excalidraw(action="list")

# 2. Read the target diagram
k_excalidraw(action="read", name="my_diagram")

# 3. Identify changes needed (analyze elements, find IDs)

# 4. Apply changes
k_excalidraw(
  action="update",
  name="my_diagram",
  modify=[
    {"id": "found_id_1", "backgroundColor": "#b2f2bb"},
    {"id": "found_id_2", "text": "Updated Label"}
  ]
)
```

### Workflow 2: Extend a Diagram

```
# 1. Read existing diagram
result = k_excalidraw(action="read", name="my_diagram")

# 2. Find the rightmost/bottommost element to calculate new positions
# (Scan element x, y, width, height to find open space)

# 3. Create new elements at calculated positions
# Note: For complex additions, create a temporary diagram to get element JSON

# 4. Add new elements
k_excalidraw(
  action="update",
  name="my_diagram",
  add_elements=[...new_elements...]
)
```

### Workflow 3: Clean Up a Diagram

```
# 1. Read the diagram
result = k_excalidraw(action="read", name="my_diagram")

# 2. Identify orphan nodes (no connections)
# 3. Identify duplicate connections
# 4. Find miscolored nodes

# 5. Remove orphans, fix colors
k_excalidraw(
  action="update",
  name="my_diagram",
  remove_ids=["orphan_id_1", "orphan_text_id_1"],
  modify=[
    {"id": "wrong_color_id", "backgroundColor": "#a5d8ff"}
  ]
)
```

### Workflow 4: Replace a Diagram

When changes are too extensive for incremental updates:

```
# 1. Read the existing diagram to understand it
k_excalidraw(action="read", name="old_diagram")

# 2. Delete the old version
k_excalidraw(action="delete", name="old_diagram")

# 3. Create a new version with the same name
k_excalidraw(
  action="create",
  name="old_diagram",
  diagram_type="architecture",
  nodes=[...updated_nodes...],
  connections=[...updated_connections...]
)
```

## Element ID Guide

Every Excalidraw element has a unique `id` (20-char hex string). When working with updates:

- **Shape elements** (rectangle, diamond, ellipse): The main container. Has `boundElements` listing text and arrows bound to it.
- **Text elements**: Bound to a shape via `containerId`. Editing text requires modifying the text element, not the shape.
- **Arrow elements**: May have `startBinding.elementId` and `endBinding.elementId` referencing the shapes they connect.

**To find element IDs:** Read the diagram, scan `document.elements`, match by `type` and visual properties (label text, position, color).

## Step-by-Step Instructions

1. **List diagrams** — Start with `k_excalidraw(action="list")` to see what exists
2. **Read the target** — Get full document with element IDs
3. **Understand the structure** — Identify which elements are shapes, text, arrows
4. **Plan changes** — Decide what to add, remove, or modify
5. **Execute atomically** — Use a single `update` call with all changes if possible
6. **Verify result** — Check the response for `ok: true` and correct change counts
7. **Re-read if needed** — Read again to confirm the diagram looks right

## Quality Checklist

Before delivering management operations:
- [ ] Listed diagrams before attempting to read/update (know what exists)
- [ ] Read the diagram before modifying (know current state)
- [ ] When removing nodes: also removed bound text and connected arrows
- [ ] When modifying text: targeted the text element, not the shape
- [ ] Verified `ok: true` in response after each operation
- [ ] Reported change counts to user (added/removed/modified)
- [ ] Did not lose data — preserved elements not being changed
- [ ] For extensive changes: considered delete + recreate instead of many modifications
