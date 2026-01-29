# /savenow - Save Checkpoint and Worklog

Save the current session state immediately.

Always Save All Kuroryuu Session Data, And PTY Info for persistence if available for that session.

## Related Commands
- `/loadnow` - Load checkpoint and restore context
- `/k-save` - Alternative checkpoint save
- `/k-load` - Alternative checkpoint load

## Actions

1. **Save Checkpoint** with cross-references using `k_checkpoint` MCP tool:
   - Name: Use a descriptive name based on the main work done this session
   - Summary: Brief description of what was accomplished
   - Tags: Relevant tags for the work done
   - Data: Key details PLUS cross-references:
     - `plan_file`: Active plan being worked on (or null)
     - `worklog_files`: Will add worklog path after step 2
     - `task_ids`: In-progress task IDs from ai/todo.md

2. **Write Worklog** to `Docs/worklogs/` with cross-references:
   - Filename format: `KiroWorkLog_YYYYMMDD_HHMMSS_Description.md`
   - Header MUST include:
     - `**Checkpoint:** cp_xxx` (from step 1)
     - `**Plan:** Docs/Plans/xxx.md` (or "None")
     - `**Tasks:** T001, T002` (task IDs worked on)
   - Include: Summary, issues fixed, files modified, commits, key code changes

3. **Confirm** both saves completed with checkpoint ID, worklog path, AND cross-references shown.

## Example Output

```
Saved:
- Checkpoint: cp_20260110_165529_684d8e9c (descriptive-name)
- Worklog: Docs/worklogs/KiroWorkLog_20260110_215500_Description.md
```
