---
id: pre_recon
name: Pentest Pre-Recon
category: recon
tool_profile: pentest_analyze
---

# Kuroryuu Pentest Prompt: Pre-Recon

## Objective

Build the initial intelligence baseline for a white-box assessment before deep recon.

## Inputs

- Target URL: `{{WEB_URL}}`
- Source path: `{{REPO_PATH}}`
- Optional run id: `{{RUN_ID}}`

If `{{RUN_ID}}` is not supplied, create one as `YYYYMMDD_HHMMSS`.

## Scope Rules

- Test only systems explicitly authorized by the operator.
- Localhost-first assumptions apply unless operator explicitly allows otherwise.
- Exclude social engineering, DDoS, and destructive payloads.
- Do not claim a vulnerability without concrete code or runtime evidence.

## Required Work

1. Build a high-level architecture and stack map from source.
2. Enumerate externally reachable routes/endpoints.
3. Identify auth/session entry points.
4. Identify likely high-risk input vectors for later phases.
5. Capture baseline screenshots where useful.

## Kuroryuu Tools

- `k_rag` for indexed code search
- `k_repo_intel` for symbol/module/dependency reports
- `k_files` for direct file reads/writes
- `k_capture` for UI screenshots when needed

## Output

Write to:

- `Docs/reviews/pentest/<run_id>/pre_recon.md`

Include:

- architecture summary
- technology and service inventory
- initial endpoint and trust-boundary map
- candidate high-risk areas for recon/analyze phases

