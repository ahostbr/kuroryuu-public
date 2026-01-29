---
description: Save Kuroryuu checkpoint with optional worklog
argument-hint: [description]
allowed-tools: Read, Write, Bash
---

Save a Kuroryuu checkpoint to preserve current session state.

## Steps

1. **Generate checkpoint metadata**:
   - Timestamp: Current datetime (YYYYMMDD_HHMMSS format)
   - Description: Use `$ARGUMENTS` if provided, otherwise "Manual checkpoint"
   - Session context from current conversation

2. **Call k_checkpoint MCP tool**:
   ```
   k_checkpoint(
     action="save",
     name="session",
     payload={
       "description": "<description>",
       "timestamp": "<timestamp>",
       "context_summary": "<brief summary of current work>"
     }
   )
   ```

3. **Write worklog** (if significant work was done):
   - Path: `Docs/worklogs/KiroWorkLog_<timestamp>_<description>.md`
   - Include: What was accomplished, files changed, next steps

4. **Update session log**:
   - Append to `ai/checkpoints/session_log.txt`

5. **Confirm save**:
   Output: `Checkpoint saved: cp_<timestamp>. Worklog: <path if created>`

## Gateway Alternative

POST to `http://127.0.0.1:8200/v1/checkpoints`:
```json
{
  "name": "session",
  "description": "<description>",
  "payload": { ... }
}
```

## Quick Mode

For rapid saves without worklog, just call k_checkpoint directly.

## Cross-Reference Requirements (HARD RULE)

Checkpoint data MUST include:
```json
{
  "plan_file": "Docs/Plans/xxx.md",      // Active plan or null
  "worklog_files": ["Docs/worklogs/..."], // Worklogs this session
  "task_ids": ["T001", "T002"]            // Tasks being worked on
}
```

## Related Commands
- `/savenow` - Full save with worklog
- `/loadnow` - Load latest checkpoint
- `/k-load` - Load specific checkpoint

## See Also
- `CLAUDE.md` § Cross-Reference Rules
- `.claude/rules/agent-persistence.md` § Cross-Reference Requirements
