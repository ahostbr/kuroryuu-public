---
description: Find and execute the right MCP tool for your task
argument-hint: [natural language query]
allowed-tools: Read
---

# k_MCPTOOLSEARCH - MCP Tool Discovery and Execution

Find and execute the right Kuroryuu MCP tool based on a natural language description. This is the primary entry point for external LLMs that don't know all available tools.

## Quick Start

```
k_MCPTOOLSEARCH(query="search for function definitions")
```

This automatically finds `k_rag` and executes it.

## Usage Modes

### 1. Execute Mode (Default)

Find and run the best matching tool in one step:

```python
k_MCPTOOLSEARCH(
    query="search for code patterns",
    params={"query": "async function", "top_k": 10}
)
```

Returns:
```json
{
    "ok": true,
    "mode": "execute",
    "tool_used": "k_rag",
    "confidence": 0.85,
    "result": { ... actual tool output ... }
}
```

### 2. Discovery Mode

Just find matching tools without executing:

```python
k_MCPTOOLSEARCH(
    query="find files in directory",
    execute=False,
    top_k=3
)
```

Returns:
```json
{
    "ok": true,
    "mode": "discovery",
    "matches": [
        {"tool": "k_files", "confidence": 0.9, "description": "..."},
        {"tool": "k_rag", "confidence": 0.5, "description": "..."}
    ]
}
```

## Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | string | (required) | Natural language description of your task |
| `execute` | bool | `true` | Run best tool or just return matches |
| `params` | dict | `{}` | Parameters to pass to the executed tool |
| `top_k` | int | `3` | Number of matches to return in discovery mode |

## Query Examples

| Query | Best Match | Notes |
|-------|------------|-------|
| "search for code patterns" | k_rag | Code search |
| "find TypeScript files" | k_files | File listing |
| "check function symbols" | k_repo_intel | Symbol analysis |
| "save a checkpoint" | k_checkpoint | Persistence |
| "send message to worker" | k_inbox | Agent messaging |
| "message agent" | k_msg | Simplified agent messaging |
| "get project dependencies" | k_repo_intel | Dependency report |
| "create a terminal" | k_pty | PTY creation |

## k_help - Companion Tool

List all available tools or get detailed help:

```python
# List all tools grouped by category
k_help()

# Get detailed help for a specific tool
k_help(tool="k_rag")
```

## Tool Categories

- **search**: k_rag (code search)
- **analysis**: k_repo_intel (symbols, routes, deps)
- **files**: k_files (read, write, list)
- **persistence**: k_checkpoint (save/load state)
- **messaging**: k_inbox, k_msg, k_thinker_channel
- **lifecycle**: k_session (agent lifecycle)
- **state**: k_memory (working memory)
- **terminal**: k_pty (PTY control)
- **browser**: k_browser (Chrome automation)
- **capture**: k_capture (screen recording)
- **learning**: k_collective (pattern sharing)

## For External LLMs

If you're an LLM connecting to Kuroryuu via MCP:

1. Use `k_MCPTOOLSEARCH` as your primary entry point
2. Describe what you want to do in natural language
3. Let it find and execute the right tool for you
4. Use `k_help()` to discover all available capabilities

Example workflow:
```
# Step 1: Discover what tools are available
k_help()

# Step 2: Find the right tool for your task
k_MCPTOOLSEARCH(query="analyze code structure", execute=False)

# Step 3: Execute with parameters
k_MCPTOOLSEARCH(
    query="analyze code structure",
    params={"action": "get", "report": "symbol_map"}
)
```

## Error Handling

| Error Code | Meaning |
|------------|---------|
| `NO_MATCH` | No tools found for query - try different keywords |
| `HANDLER_NOT_FOUND` | Tool exists but handler missing - internal error |
| `EXECUTION_FAILED` | Tool execution failed - check params |
| `MISSING_PARAM` | Query is required |
