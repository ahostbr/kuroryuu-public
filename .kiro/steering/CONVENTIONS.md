# Kuroryuu Conventions

> Code style, naming, and patterns used in this repo.

---

## Python Style

- **Version**: 3.10+
- **Formatter**: None enforced (keep readable)
- **Type hints**: Required on public functions
- **Docstrings**: Required on tool handlers and public APIs

```python
async def my_tool(query: str, limit: int = 10) -> dict:
    """Short description.
    
    Args:
        query: Search query string
        limit: Max results to return
        
    Returns:
        Dict with ok, results, stats keys
    """
```

---

## Response Shapes

### Success
```json
{
  "ok": true,
  "data": { ... }
}
```

### Error
```json
{
  "ok": false,
  "error_code": "TOOL_ERROR",
  "message": "Human-readable message",
  "details": { ... }
}
```

---

## Naming Conventions

| Type | Convention | Example |
|------|------------|---------|
| Files | `snake_case.py` | `harness_store.py` |
| Classes | `PascalCase` | `HarnessStore` |
| Functions | `snake_case` | `load_feature_list` |
| Constants | `UPPER_SNAKE` | `MAX_TOOL_CALLS` |
| Tool names | `scope_action` | `sots_rag_query` |

---

## Directory Structure

```
Kuroryuu/
├── .kiro/              # Kiro CLI config
│   ├── steering/       # Agent rules
│   └── prompts/        # Workflow prompts
├── ai/                 # Harness files (judge-visible)
│   ├── feature_list.json
│   ├── progress.md
│   └── prompts/
├── apps/
│   ├── gateway/        # AG-UI server
│   └── mcp_core/       # Tool server
├── WORKING/            # Runtime data (gitignored)
│   ├── checkpoints/
│   ├── inbox/
│   └── rag_index/
└── Docs/
    └── worklogs/       # Buddy worklogs
```

---

## Import Order

```python
# 1. Standard library
from __future__ import annotations
import os
import json

# 2. Third-party
from fastapi import FastAPI
from pydantic import BaseModel

# 3. Local
from .harness import get_harness_store
```

---

## Error Handling

```python
try:
    result = await some_operation()
except SpecificError as e:
    return {"ok": False, "error_code": "SPECIFIC", "message": str(e)}
except Exception as e:
    return {"ok": False, "error_code": "UNKNOWN", "message": str(e)}
```

Never swallow exceptions silently.

---

## Testing

- `smoke_test.py` for basic health
- Manual curl for tool testing
- JSON schema validation on responses
- No pytest harness (hackathon scope)
