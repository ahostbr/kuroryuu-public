---
description: Load Kuroryuu checkpoint to restore session state
argument-hint: [checkpoint-id]
allowed-tools: Read, Bash
---

Load a Kuroryuu checkpoint to restore previous session state.

## Steps

1. **Determine checkpoint to load**:
   - If `$ARGUMENTS` provided: Load specific checkpoint by ID
   - If empty: Load most recent checkpoint

2. **List available checkpoints** (if needed):
   ```
   k_checkpoint(action="list", name="session", limit=5)
   ```

3. **Load checkpoint**:
   ```
   k_checkpoint(
     action="load",
     name="session",
     checkpoint_id="<id or 'latest'>"
   )
   ```

4. **Parse checkpoint payload**:
   - Extract description
   - Extract context_summary
   - Extract any todo state

5. **Restore context**:
   - Read referenced files if any
   - Resume from described work state
   - Report what was restored

6. **Confirm load**:
   Output: `Loaded checkpoint: <id>. Context: <summary>`

## Gateway Alternative

GET from `http://127.0.0.1:8200/v1/checkpoints/<id>`:
- Returns checkpoint payload
- Use "latest" for most recent

## Usage Examples

- `/k-load` - Load most recent checkpoint
- `/k-load cp_20260112_143000` - Load specific checkpoint

## Cross-Reference Extraction

When loading, extract and display related docs from checkpoint data:
- `plan_file` → Show linked plan
- `worklog_files` → Show linked worklogs
- `task_ids` → Show linked tasks

## Related Commands
- `/savenow` - Full save with worklog
- `/loadnow` - Load latest checkpoint
- `/k-save` - Save checkpoint

## See Also
- `CLAUDE.md` § Cross-Reference Rules
- `.claude/rules/agent-persistence.md` § Cross-Reference Requirements
