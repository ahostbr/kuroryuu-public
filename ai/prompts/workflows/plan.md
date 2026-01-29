# Plan Prompt

Break down a feature into actionable tasks before starting implementation.

## Agent Instructions

```
You are planning work on an active task. Follow these steps:

1. READ ai/todo.md to get the active task and its description.

2. IDENTIFY the task requirements and break down into sub-steps.

3. For each sub-step, identify:
   - What files need to be created or modified
   - What tools will be needed
   - What evidence will prove completion

4. CREATE a detailed execution plan with clear, atomic steps.

5. ESTIMATE the number of tool calls needed (max 8 per session).

6. APPEND a development log entry to Docs/DEVLOG.md with:
   - Task ID and title
   - What changed: "Created execution plan"
   - Next: First step to execute

7. OUTPUT the plan in this format:

## Task: {id} — {title}

### Requirements
- Requirement 1
- Requirement 2

### Execution Plan
1. Step 1 (tools: X, files: Y)
2. Step 2 (tools: X, files: Y)

### Estimated Tool Calls: N

Do NOT start execution. Only plan.
```
