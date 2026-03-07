---
description: Plan with quizmaster validation - uses AskUserQuestion to thoroughly understand requirements before planning. Variants: v4 (default), full, small. v5
argument-hint: "[user request]" "[variant: v4|full|small|v5]"
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

This command is now implemented as a skill. Use the skill 'plan-w-quizmaster' instead.
