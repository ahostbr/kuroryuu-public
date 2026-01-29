# /loadnow - Load Latest Checkpoint

Load the most recent checkpoint to restore session context.

## Related Commands
- `/savenow` - Save checkpoint and worklog
- `/k-save` - Alternative checkpoint save
- `/k-load` - Alternative checkpoint load

## Actions

1. **List Checkpoints** using `k_checkpoint` MCP tool with `action: list`, `limit: 1`

2. **Load Checkpoint** using `k_checkpoint` MCP tool with `action: load` and the latest checkpoint ID

3. **Extract Related Documents** from checkpoint data:
   - `plan_file` → Show linked plan (if present)
   - `worklog_files` → Show linked worklogs (if present)
   - `task_ids` → Show linked tasks (if present)

4. **Display Context** from the loaded checkpoint:
   - Name and summary
   - Tags
   - Key data (files modified, commits, fixes, etc.)
   - **Cross-references:** Plan, worklogs, tasks
   - Saved timestamp

## Example Output

```
Loaded checkpoint: cp_20260110_165529_684d8e9c (terminal-spawn-fixes)

Summary: Fixed terminal spawn issues...

Tags: terminal, xterm, pty, spawn, fix

Data:
- Commits: bc2c827, 21a4b4c
- Files: Terminal.tsx, TerminalGrid.tsx, ...

Ready to continue.
```
