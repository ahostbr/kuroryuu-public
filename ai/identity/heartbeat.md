# Heartbeat Standing Instructions

When the heartbeat fires, perform these checks in order:

## 1. Task Status
- Read ai/todo.md for pending tasks
- Check if any tasks are stale (created >24h ago, still pending)
- Report overdue or blocked tasks

## 2. Recent Activity
- Check recent worklogs in Docs/worklogs/
- Check recent checkpoints in ai/checkpoints/
- Summarize what happened since last heartbeat

## 3. Project Health
- Check for uncommitted changes (git status)
- Check if any identity files need updating based on new learnings

## 4. Proactive Suggestions
- Identify tasks that could be automated
- Suggest next priorities based on project state
- Flag any potential issues or risks

## Configuration
- Default interval: 30 minutes
- Max actions per run: 5
- Timeout: 5 minutes per run
