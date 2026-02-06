# /savenow - Save Checkpoint and Worklog

Save the current session state immediately.

Always Save All Kuroryuu Session Data, And PTY Info for persistence if available for that session.

## Related Commands
- `/loadnow` - Load checkpoint and restore context
- `/k-save` - Alternative checkpoint save
- `/k-load` - Alternative checkpoint load

## Actions

**Single call** using `k_checkpoint` MCP tool with `worklog: true`:

```
k_checkpoint(
  action="save",
  name="descriptive-name",
  summary="Brief description of what was accomplished",
  tags=["relevant", "tags"],
  data={
    "plan_file": "Docs/Plans/xxx.md",   // or null
    "task_ids": ["T001", "T002"],        // from ai/todo.md
    "files_modified": ["path/to/file"],  // files changed this session
    "changes": { "key": "description" }, // summary of changes
    "agent": "claude"                    // agent identifier
  },
  worklog=true   // <-- auto-generates KuroRyuuWorkLog_ file
)
```

The `worklog=true` flag automatically:
- Creates `Docs/worklogs/KuroRyuuWorkLog_YYYYMMDD_HHMMSS_Name.md`
- Populates header with checkpoint ID, plan, tasks cross-references
- Renders files modified, changes, summary, and tags sections
- Back-patches the worklog path into the checkpoint data

**Confirm** the save completed — response includes both `path` and `worklog_path`.

## Example Output

```
Saved:
- Checkpoint: cp_20260205_220000_a1b2c3d4 (descriptive-name)
- Worklog: Docs/worklogs/KuroRyuuWorkLog_20260205_220000_descriptive_name.md
```
