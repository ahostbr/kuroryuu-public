---
id: analyze_ssrf
name: Pentest SSRF Analysis
category: analysis
tool_profile: pentest_analyze
---

# Kuroryuu Pentest Prompt: SSRF Analysis

## Objective

Identify server-side request primitives where user input controls outbound destinations or protocols.

## Inputs

- `Docs/reviews/pentest/<run_id>/recon.md`
- `{{REPO_PATH}}`

## Method

1. Locate outbound request sinks (HTTP clients, URL fetchers, webhooks, file/proxy fetch).
2. Trace controllable inputs into destination URL/host/protocol/path.
3. Validate allowlists, resolver hardening, and internal-address blocking.

## Output Files

- `Docs/reviews/pentest/<run_id>/ssrf_analysis.md`
- `Docs/reviews/pentest/<run_id>/ssrf_queue.json`

## Queue Schema

```json
{
  "vulnerabilities": [
    {
      "id": "SSRF-001",
      "endpoint": "POST /api/fetch",
      "location": "path/file.ext:line",
      "control_point": "url parameter/body field",
      "reason": "unvalidated outbound target",
      "confidence": "high|med|low",
      "exploit_hint": "minimal witness"
    }
  ]
}
```

