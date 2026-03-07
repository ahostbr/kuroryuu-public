---
description: Creates a team orchestration plan for /max-subagents-parallel execution with builder/validator pairs. Generates a structured plan file that can be executed.
argument-hint: "[user request]" "[orchestration guidance - optional]"
model: opus
disallowed-tools: Task, EnterPlanMode
hooks:
  Stop:
    - hooks:
        - type: command
          command: >-
            powershell.exe -NoProfile -Command "
              $plans = Get-ChildItem -Path 'Docs/Plans/*.md' -ErrorAction SilentlyContinue |
                Where-Object { $_.LastWriteTime -gt (Get-Date).AddMinutes(-10) };
              if ($plans) {
                Write-Host 'Plan file created: ' + $plans[0].Name;
                exit 0
              } else {
                Write-Host 'ERROR: No recent plan file found in Docs/Plans/';
                exit 1
              }
            "
---

This command is now implemented as a skill. Use the skill 'k-plan' instead.
