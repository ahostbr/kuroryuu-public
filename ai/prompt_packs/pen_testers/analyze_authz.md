---
id: analyze_authz
name: Pentest Authorization Analysis
category: analysis
tool_profile: pentest_analyze
---

# Kuroryuu Pentest Prompt: Authorization Analysis

## Objective

Find horizontal, vertical, and workflow-state authorization failures with precise guard evidence.

## Inputs

- `Docs/reviews/pentest/<run_id>/recon.md`
- `{{REPO_PATH}}`

## Method

1. For each candidate endpoint, verify guard placement before side effects.
2. Validate ownership checks, role checks, tenant checks, and workflow-state checks.
3. Record only paths where side effects are reachable without sufficient guarding.

## Output Files

- `Docs/reviews/pentest/<run_id>/authz_analysis.md`
- `Docs/reviews/pentest/<run_id>/authz_queue.json`

## Queue Schema

```json
{
  "vulnerabilities": [
    {
      "id": "AUTHZ-001",
      "endpoint": "PATCH /api/resource/{id}",
      "location": "path/file.ext:line",
      "class": "horizontal|vertical|workflow",
      "missing_guard": "ownership|role|state validation",
      "side_effect": "unauthorized read/write action",
      "confidence": "high|med|low",
      "exploit_hint": "minimal witness"
    }
  ]
}
```

