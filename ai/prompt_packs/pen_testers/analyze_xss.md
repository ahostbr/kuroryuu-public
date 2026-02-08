---
id: analyze_xss
name: Pentest XSS Analysis
category: analysis
tool_profile: pentest_analyze
---

# Kuroryuu Pentest Prompt: XSS Analysis

## Objective

Identify reflected/stored/DOM XSS paths with clear source-to-render evidence.

## Inputs

- `Docs/reviews/pentest/<run_id>/recon.md`
- `{{REPO_PATH}}`

## Method

1. Locate render sinks (`innerHTML`, unsafe template render, markdown/html passthrough).
2. Trace user input into sink.
3. Validate encoding/sanitization correctness for actual context (HTML/attr/JS/URL).

## Output Files

- `Docs/reviews/pentest/<run_id>/xss_analysis.md`
- `Docs/reviews/pentest/<run_id>/xss_queue.json`

## Queue Schema

```json
{
  "vulnerabilities": [
    {
      "id": "XSS-001",
      "endpoint": "GET /search?q=",
      "sink": "path/file.ext:line",
      "context": "html|attribute|javascript|url",
      "reason": "insufficient output encoding",
      "confidence": "high|med|low",
      "exploit_hint": "minimal witness"
    }
  ]
}
```

