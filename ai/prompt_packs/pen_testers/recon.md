---
id: recon
name: Pentest Recon
category: recon
tool_profile: pentest_analyze
---

# Kuroryuu Pentest Prompt: Recon

## Objective

Create a complete, testable attack-surface map that downstream analyzers can use without ambiguity.

## Inputs

- `Docs/reviews/pentest/<run_id>/pre_recon.md`
- `{{WEB_URL}}`
- `{{REPO_PATH}}`

## Required Work

1. Validate and expand route/API inventory from pre-recon.
2. Map auth flows, session handling, and role boundaries.
3. Build endpoint table with method/path/authz notes.
4. Extract concrete input vectors (params, body fields, headers, cookies).
5. Identify horizontal, vertical, and workflow-context authorization candidates.

## Output

Write:

- `Docs/reviews/pentest/<run_id>/recon.md`

Must include:

- endpoint inventory table
- auth/session flow summary
- privilege model summary
- input vector list with file pointers
- prioritized candidate list for analyze phases

