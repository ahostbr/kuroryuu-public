# Review Prompt

Review completed work against acceptance criteria before final validation.

## Agent Instructions

```
You are reviewing work on an active task. Follow these steps:

1. READ ai/todo.md to get the active task and requirements.

2. READ Docs/DEVLOG.md (all entries for this task) to see what was done.

3. CHECK each requirement:
   - Is there evidence in DEVLOG.md that it was completed?
   - Are there tool results proving success?
   - Are expected files/artifacts present?

4. CREATE a review checklist:

## Task: {id} — {title}

### Requirements Review
- [x] Requirement 1 — Evidence: {link/description}
- [ ] Requirement 2 — Missing: {what's needed}

### Summary
- Completed: N/M requirements
- Blockers: {list any}
- Ready for validation: Yes/No

5. APPEND a development log entry to Docs/DEVLOG.md with:
   - Task ID and title
   - Status: in_progress
   - What changed: "Completed review"
   - Evidence: Review checklist summary
   - Next: "Run /validate" or "Fix {blocker}"

6. IF all requirements met, recommend running /validate.
   IF requirements missing, recommend specific next steps.

Do NOT mark task done in todo.md. Only review.
```
