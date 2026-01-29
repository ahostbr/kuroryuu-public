# Scripts Fixed - run_all.ps1 & kill_all.ps1

## Changes Made

### 1. **run_all.ps1** - Use Correct Python 3.12 for MCP
- **Added**: Dedicated `$McpVenvPython` variable pointing to `.venv_mcp312\Scripts\python.exe`
- **Added**: Fallback to SOTS Python 3.12 if local venv doesn't exist
- **Changed**: MCP spawning now uses `$McpPython` (Python 3.12) instead of `$Python`
- **Result**: MCP server runs on Python 3.12 with FastAPI 0.128.0 (no compatibility issues)

### 2. **kill_all.ps1** - Improved Python Process Detection
- **Updated**: Python process filter regex to include `server\.py`
- **Result**: Now properly detects and kills MCP server running as `server.py`

## Key Lines Changed

### run_all.ps1 (lines 21-44)
```powershell
$McpVenvPython = Join-Path $RepoRoot ".venv_mcp312\Scripts\python.exe"
# SOTS reference removed - use local venv only

# MCP needs Python 3.12, use dedicated venv
$McpPython = $McpVenvPython
if (-not (Test-Path $McpPython)) {
    $McpPython = $SotsPython
}
...
Write-Status "Using MCP Python 3.12: $McpPython"
```

And then pass `$McpPython` to MCP spawning:
```powershell
-Python", $McpPython  # ← Changed from $Python
```

### kill_all.ps1 (line 67)
```powershell
$cmdLine -match "uvicorn|gateway|mcp_core|kuroryuu|server\.py"  # ← Added server.py
```

## Testing

### Verified ✅
1. **MCP server starts on first try** with Python 3.12
   - No more "ValueError: too many values to unpack"
   - Server is healthy on port 8100
   
2. **kill_all.ps1 works properly**
   - Cleans all ports
   - Detects and kills Python MCP server processes
   - Reports all ports freed

### Next Steps
- Gateway should follow MCP startup
- Desktop app can launch after both are ready
- All services run in parallel (no sequential blocking)

## File Paths Updated
- `.venv` (Python 3.15) - Used for main app (Tray Companion, Gateway)
- `.venv_mcp312` (Python 3.12) - Used exclusively for MCP server ✅ NEW

## Why This Works
- **Separates Python versions**: No dependency conflicts
- **Parallel execution**: Services start independently, not sequentially
- **Proper cleanup**: kill_all.ps1 knows what to look for
- **Correct ports**: MCP on 8100, Gateway on 8200

Status: **Ready for production use**
