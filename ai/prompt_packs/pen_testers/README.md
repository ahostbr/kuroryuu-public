# Kuroryuu Pen Testers Prompt Pack

This pack is a Kuroryuu-specific adaptation of a Shannon-style phased pentest workflow.

## Workflow

1. `pre_recon.md`
2. `recon.md`
3. `analyze_*` (parallel by vuln class)
4. `exploit_*` (only when queue has exploitable findings)
5. `report.md`

## Output Convention

Use a per-run directory:

- `Docs/reviews/pentest/<run_id>/`

Expected artifact shape:

- `pre_recon.md`
- `recon.md`
- `<type>_analysis.md`
- `<type>_queue.json`
- `<type>_evidence.md`
- `final_report.md`

## Kuroryuu Guardrails

- Localhost-first and explicit authorization only
- No out-of-scope internet-wide scanning
- Evidence-backed findings only (no unsupported claims)
- Prefer Kuroryuu-native tools (`k_rag`, `k_repo_intel`, `k_files`, `k_capture`)

