---
id: analyze_auth
name: Pentest Authentication Analysis
category: analysis
tool_profile: pentest_analyze
---

# Kuroryuu Pentest Prompt: Authentication Analysis

## Objective

Find authentication weaknesses that could enable account takeover or session compromise.

## Inputs

- `Docs/reviews/pentest/<run_id>/recon.md`
- `{{REPO_PATH}}`

## Method

1. Review login, reset, token issuance, and session lifecycle.
2. Validate brute-force controls, MFA handling, token validation, and secret management.
3. Document only evidence-backed exploit opportunities.

## Output Files

- `Docs/reviews/pentest/<run_id>/auth_analysis.md`
- `Docs/reviews/pentest/<run_id>/auth_queue.json`

## Queue Schema

```json
{
  "vulnerabilities": [
    {
      "id": "AUTH-001",
      "endpoint": "POST /auth/login",
      "location": "path/file.ext:line",
      "weakness": "missing rate limit|weak token validation|reset bypass",
      "reason": "specific control gap",
      "confidence": "high|med|low",
      "exploit_hint": "minimal witness"
    }
  ]
}
```

