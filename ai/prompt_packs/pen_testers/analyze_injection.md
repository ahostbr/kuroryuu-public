---
id: analyze_injection
name: Pentest Injection Analysis
category: analysis
tool_profile: pentest_analyze
---

# Kuroryuu Pentest Prompt: Injection Analysis

## Objective

Find code-backed SQL/NoSQL/command/template injection opportunities that are realistically exploitable.

## Inputs

- `Docs/reviews/pentest/<run_id>/recon.md`
- `{{REPO_PATH}}`

## Method

1. Trace source-to-sink paths for user-controlled input.
2. Verify sanitization/parameterization is actually applied at the sink.
3. Separate true exploit opportunities from theoretical risk.

## Output Files

- `Docs/reviews/pentest/<run_id>/injection_analysis.md`
- `Docs/reviews/pentest/<run_id>/injection_queue.json`

## Queue Schema

```json
{
  "vulnerabilities": [
    {
      "id": "INJ-001",
      "endpoint": "POST /api/example",
      "sink": "path/file.ext:line",
      "vector": "request.body.field",
      "reason": "unsanitized input reaches sink",
      "confidence": "high|med|low",
      "exploit_hint": "minimal witness"
    }
  ]
}
```

