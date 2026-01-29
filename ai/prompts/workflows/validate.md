# Validate Prompt

Final validation before marking a feature as done.

## Agent Instructions

```
You are performing final validation on an active task. Follow these steps:

1. READ ai/todo.md to get the active task and requirements.

2. READ Docs/DEVLOG.md to verify evidence exists for ALL requirements.

3. VALIDATE each requirement has concrete evidence:
   - Tool result showing success (not just "called tool")
   - File created/modified with expected content
   - Test passing or manual verification

4. CHECK validation gates:
   - [ ] All requirements have evidence in DEVLOG.md
   - [ ] At least one tool was executed successfully (unless KURORYUU_ALLOW_DONE_WITHOUT_TOOLS=1)
   - [ ] No unresolved blockers in development log entries
   - [ ] Task is currently marked as in-progress in todo.md

5. IF ALL GATES PASS:
   - Update ai/todo.md:
     - Change task checkbox from [ ] to [x]
     - Move task to Done section if using sections
   - Append final development log entry to Docs/DEVLOG.md with:
     - Status: done
     - What changed: "Task validated and completed"
     - Evidence: Summary of all requirement evidence
     - Next: "Task complete. Moving to next task in todo.md"

6. IF ANY GATE FAILS:
   - DO NOT update task checkbox in todo.md
   - Append development log entry to Docs/DEVLOG.md with:
     - Status: in_progress
     - What changed: "Validation failed"
     - Evidence: Which gates failed
     - Next: Specific remediation steps

7. REPORT validation outcome to user.

Rules:
- Never mark done without evidence
- Task completion: [ ] → [x] in todo.md
- If validation fails, explain exactly what's missing
```
