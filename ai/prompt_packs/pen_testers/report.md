---
id: report
name: Pentest Executive Report
category: report
tool_profile: pentest_report
---

# Kuroryuu Pentest Prompt: Final Report

## Objective

Assemble a clean, evidence-first final report from all prior phase artifacts.

## Inputs

- `pre_recon.md`
- `recon.md`
- `*_analysis.md`
- `*_evidence.md`

All expected under:

- `Docs/reviews/pentest/<run_id>/`

## Report Rules

- Prioritize proven findings over speculative risk.
- Separate "exploited" vs "analyzed but blocked".
- Include reproducible steps and code pointers.
- Keep executive summary concise and technically accurate.

## Output

- `Docs/reviews/pentest/<run_id>/final_report.md`

## Required Sections

1. Executive Summary
2. Scope and Method
3. Attack Surface Summary
4. Findings by Class (Injection, XSS, Auth, AuthZ, SSRF)
5. Exploited Findings (with severity and evidence)
6. Blocked Findings (controls that worked)
7. Remediation Plan (ordered by risk and effort)
8. Residual Risk and Next Validation Cycle

