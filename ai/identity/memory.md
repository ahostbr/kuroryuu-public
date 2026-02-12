# Long-Term Memories

## Project Milestones
- All 20 phases (0-19) completed
- GenUI case study phases 1-4C done
- Agent teams system fully operational

## Key Learnings
- Windows hooks have standalone array bug — use piggyback pattern
- PowerShell UTF8 includes BOM — use UTF8Encoding($false)
- File boundary separation prevents merge conflicts in team builds
- Chokidar preferred over fs.watch for reliability

## Patterns Discovered
- IPC bridge pattern: main service -> IPC handlers -> renderer store
- Zustand stores with file-based persistence work well
- ReactFlow for graph visualization with theme support
- Atomic writes (temp + rename) for data safety
