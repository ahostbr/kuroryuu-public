# Kuroryuu Repo Intel

Repository intelligence suite for indexing TypeScript/Python codebases. Adapted from SOTS repo_index for Kuroryuu's web app stack.

## Tools

### 1. Symbol Indexer (`repo_indexer.py`)
Scans the codebase and produces JSON indices for:
- **symbol_map.json** - All symbols (functions, classes, components, hooks, types)
- **public_api_map.json** - Exported API surface for TypeScript and Python
- **module_graph.json** - Import/export dependency graph
- **hook_usage.json** - React hook usage across components
- **route_map.json** - FastAPI endpoint routes
- **component_tree.json** - React component listing
- **file_manifest.json** - All scanned files with metadata

### 2. TODO Backlog (`todo_backlog.py`)
Scans for TODO, FIXME, HACK, @Ryan, @Buddy markers:
- **todo_backlog.json** - All TODO items by app/file

### 3. Dependency Map (`depmap.py`)
Analyzes package.json and requirements.txt:
- **dependency_map.json** - NPM and Python dependencies by app

## Usage

```bash
# Run full suite (recommended)
python ai/repo_intel/run_all_intel.py

# Full rebuild (ignore cache)
python ai/repo_intel/run_all_intel.py --full

# Run only indexer
python ai/repo_intel/run_all_intel.py --only indexer

# Run only TODO scanner
python ai/repo_intel/run_all_intel.py --only todo

# Run only dependency mapper
python ai/repo_intel/run_all_intel.py --only depmap

# Individual tools
python ai/repo_intel/run_repo_intel.py --full
python ai/repo_intel/todo_backlog.py
python ai/repo_intel/depmap.py
```

## PowerShell

```powershell
.\ai\repo_intel\run_repo_intel.ps1 -Full
```

## Arguments

| Argument | Description |
|----------|-------------|
| `--project_root` | Path to Kuroryuu project root (auto-detected if omitted) |
| `--reports_dir` | Path to output reports (default: `<project_root>/Reports/RepoIntel`) |
| `--full` | Force full rebuild, ignore cache |
| `--only` | Run only specific tool: `indexer`, `todo`, or `depmap` |
| `--verbose` | Print verbose output |

## What Gets Indexed

### TypeScript/React
- Functions (named and arrow)
- Classes
- Interfaces and Types
- Enums
- React Components (uppercase function/const)
- React Hooks (use* pattern)
- Import/export statements

### Python
- Functions and async functions
- Classes
- Pydantic models (BaseModel, BaseSettings)
- FastAPI endpoints (@router.get, etc.)
- Import statements

## Caching

The indexer uses SHA1 file hashes for incremental updates. Only changed files are re-parsed on subsequent runs. Use `--full` to force a complete rebuild.

Cache is stored in `ai/repo_intel/_cache/repo_intel_cache.json`.

## Output Directory

All reports go to `Reports/RepoIntel/`:
```
Reports/RepoIntel/
├── symbol_map.json
├── public_api_map.json
├── module_graph.json
├── hook_usage.json
├── route_map.json
├── component_tree.json
├── file_manifest.json
├── todo_backlog.json
├── dependency_map.json
└── repo_intel_report.txt
```

## Integration with RAG

The JSON outputs can be loaded into Kuroryuu's RAG system for symbol lookups and code navigation. See `tools_rag.py` in `apps/mcp_core/` for integration.
