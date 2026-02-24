---
name: Code to Diagram
description: Code analysis to diagram - Glob/Grep/Read strategies, auto-type selection, node extraction from source code
version: 1.0.0
---

# CODE TO DIAGRAM

You analyze source code and automatically generate diagrams from it using `k_excalidraw`. This mode reads files, extracts components/functions/classes, determines the best diagram type, and creates a visual representation.

## Tool Reference

This mode uses code analysis tools first, then `k_excalidraw` to create:

```
# Step 1: Analyze code
Glob("src/**/*.ts")           # Find files
Grep("class |function |export") # Find components
Read("/path/to/file.ts")       # Read implementations

# Step 2: Create diagram
k_excalidraw(
  action="create",
  name="<project>_<topic>_<auto_type>",
  diagram_type="<auto_detected>",
  nodes=[...extracted nodes...],
  connections=[...extracted connections...]
)
```

## Auto-Type Selection

After analyzing the code, select the diagram type:

| Code Pattern | Diagram Type | Reasoning |
|-------------|-------------|-----------|
| Multiple classes/modules with imports | `architecture` | Shows component relationships |
| Functions calling functions in sequence | `flowchart` | Shows execution flow |
| Request handlers with middleware chains | `flowchart` | Shows processing pipeline |
| Client-server communication, API routes | `sequence` | Shows interaction protocol |
| Service files with RPC/HTTP calls | `sequence` | Shows service communication |
| Mixed patterns | `architecture` | Default — shows system overview |

## Analysis Strategies

### Strategy 1: Directory → Architecture

For a directory of modules/services:

```
1. Glob("{dir}/**/*.{ts,py,go}")     → list all source files
2. Grep("import|from|require", dir)   → find dependency graph
3. Extract module names and relationships
4. Create architecture diagram with modules as nodes, imports as connections
```

**Node extraction:**
- Each file/module = 1 node
- `label` = module name (without extension)
- `color` = based on directory (e.g., `services/` → blue, `models/` → green)

**Connection extraction:**
- `import X from './Y'` → connection from current module to Y
- `require('./Y')` → connection from current module to Y

### Strategy 2: Function → Flowchart

For a specific function or algorithm:

```
1. Read the file containing the function
2. Trace control flow: if/else, switch, loops, returns
3. Extract each branch as a decision node
4. Extract each action as a process node
5. Create flowchart with execution path
```

**Node extraction:**
- Function entry = `start` node
- `if/else` conditions = `decision` node, label = the condition
- Action lines = `process` node, label = what it does
- `return` statements = `end` node

**Connection extraction:**
- Sequential flow = connection to next node
- `if true` branch = connection labeled "Yes"
- `if false`/`else` branch = connection labeled "No"

### Strategy 3: API Routes → Sequence

For API endpoint files:

```
1. Grep("@app\.|router\.|app\.(get|post|put|delete)", dir)  → find routes
2. Read route handler files
3. Trace: request → middleware → handler → service → database
4. Create sequence diagram with participants and messages
```

**Participant extraction:**
- Client = purple participant
- Each middleware = blue participant (if significant)
- Route handler / service = blue participant
- Database calls = green participant
- External API calls = red participant

**Message extraction:**
- HTTP method + path = request message
- Database query = message to DB participant
- External API call = message to external participant
- Return value = response message

## Code Pattern Recognition

### Python
```
# Classes → architecture nodes
class UserService:          → node: {id: "user_service", label: "UserService", color: "blue"}

# FastAPI routes → sequence messages
@router.post("/users")      → message: {label: "POST /users"}

# Function calls → flowchart/connections
db.query(User)              → connection to database node
```

### TypeScript
```
# Exports → architecture nodes
export class AuthModule     → node: {id: "auth_module", label: "AuthModule", color: "blue"}

# Express routes → sequence messages
app.get('/api/data')        → message: {label: "GET /api/data"}

# Imports → connections
import { DB } from './db'   → connection from current to "db"
```

### Go
```
# Packages → architecture nodes
package handlers            → node: {id: "handlers", label: "Handlers", color: "blue"}

# HTTP handlers → sequence messages
http.HandleFunc("/api")     → message: {label: "request /api"}

# Imports → connections
import "myapp/services"     → connection from current to "services"
```

## Templates

### Template: Analyze a Python Package

```
# 1. Find all Python files
Glob("apps/gateway/routers/*.py")

# 2. Extract router names
Grep("^from |^import ", "apps/gateway/routers/")

# 3. Read main entry point
Read("apps/gateway/main.py")

# 4. Create architecture diagram
k_excalidraw(
  action="create",
  name="gateway_routers_architecture",
  diagram_type="architecture",
  nodes=[
    {"id": "main", "label": "FastAPI App", "color": "blue"},
    {"id": "auth_router", "label": "Auth Router", "color": "blue"},
    {"id": "users_router", "label": "Users Router", "color": "blue"},
    {"id": "db", "label": "Database", "color": "green"}
  ],
  connections=[
    {"from": "main", "to": "auth_router", "label": "include"},
    {"from": "main", "to": "users_router", "label": "include"},
    {"from": "auth_router", "to": "db", "label": "query"},
    {"from": "users_router", "to": "db", "label": "query"}
  ]
)
```

### Template: Analyze a Single Function

```
# 1. Read the function
Read("src/auth/validate.ts")

# 2. Identify control flow, create flowchart
k_excalidraw(
  action="create",
  name="auth_validate_flowchart",
  diagram_type="flowchart",
  nodes=[
    {"id": "start", "label": "validateToken()", "type": "start", "color": "green"},
    {"id": "check_format", "label": "Valid JWT Format?", "type": "decision", "color": "yellow"},
    {"id": "decode", "label": "Decode Payload", "type": "process", "color": "blue"},
    {"id": "check_expiry", "label": "Token Expired?", "type": "decision", "color": "yellow"},
    {"id": "return_user", "label": "Return User", "type": "end", "color": "green"},
    {"id": "return_error", "label": "Return Error", "type": "end", "color": "red"}
  ],
  connections=[
    {"from": "start", "to": "check_format"},
    {"from": "check_format", "to": "decode", "label": "Yes"},
    {"from": "check_format", "to": "return_error", "label": "No"},
    {"from": "decode", "to": "check_expiry"},
    {"from": "check_expiry", "to": "return_error", "label": "Yes"},
    {"from": "check_expiry", "to": "return_user", "label": "No"}
  ]
)
```

## Step-by-Step Instructions

1. **Understand the scope** — Is it a directory, file, function, or class?
2. **Discover files** — Use `Glob` to find relevant source files
3. **Search for patterns** — Use `Grep` to find classes, functions, imports, routes
4. **Read key files** — Use `Read` on the most important files (max 3-5 for a diagram)
5. **Extract nodes** — Identify components, classify them, assign colors
6. **Extract connections** — Trace imports, function calls, API routes
7. **Select diagram type** — Use auto-type selection rules above
8. **Build the diagram** — Call `k_excalidraw(action="create", ...)`
9. **Explain the diagram** — Tell the user what components were found and how they relate

## Quality Checklist

Before delivering the diagram:
- [ ] Actually read the code (don't guess from file names alone)
- [ ] Nodes represent real code components (classes, modules, services)
- [ ] Connections represent real code relationships (imports, calls, data flow)
- [ ] Diagram type matches the code pattern (auto-type selection was applied)
- [ ] Labels match actual code names (class names, function names, route paths)
- [ ] Colors follow semantic conventions from the matching sub-skill
- [ ] Max 16-20 nodes (summarize/group if code has more components)
- [ ] Explained to user what was found and any simplifications made
- [ ] Diagram created successfully (check `ok: true` response)
