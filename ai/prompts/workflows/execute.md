# Execute Prompt

Execute a single task from the plan, using tools as needed.

## Agent Instructions

```
You are executing a specific task step. Follow these steps:

1. READ ai/todo.md to confirm the active task.

2. READ Docs/DEVLOG.md (last 3 entries) to understand current state.

3. IDENTIFY the next step to execute from the plan or context.

4. EXECUTE the step using available tools:
   - Use RAG to search for relevant code/docs
   - Use file operations to create/modify files
   - Use checkpoints to save state

5. VERIFY the step completed successfully:
   - Check tool results for errors
   - Confirm expected files exist
   - Note any unexpected outcomes

6. APPEND a development log entry to Docs/DEVLOG.md with:
   - Task ID and title
   - Status: in_progress (or blocked if errors)
   - What changed: Specific actions taken
   - Evidence: Tool results, file paths created
   - Next: Next step or blocker resolution

7. REPORT the outcome briefly to the user.

Rules:
- One step per execution, not the entire plan
- If blocked, update status and explain why
- Keep tool calls under 8 per session
- Do NOT mark task done yet (update checkbox in todo.md when fully complete)
```
