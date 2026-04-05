---
id: sweep
name: Pentest Sweep
category: meta
tool_profile: pentest_analyze
---

# Kuroryuu Pentest Prompt: Sweep

## Objective

Spam a standardized vulnerability-scan prompt across every source file in the repo, collect all raw findings into a queue, then run a verification pass to eliminate false positives — producing a consolidated sweep report with confirmed issues ranked by severity.

## Inputs

- `{{REPO_PATH}}`
- `Docs/reviews/pentest/<run_id>/recon.md` (optional; enriches context)

## Method

### Phase 1 — File Enumeration

Enumerate all source files in `{{REPO_PATH}}`. Exclude:
- Binary files, compiled artifacts, build output directories (`dist/`, `build/`, `target/`, `node_modules/`, `.git/`, `__pycache__/`, `*.pyc`, `*.class`, `*.o`, `*.so`, `*.dll`).
- Generated files (migration snapshots, protobuf generated code, OpenAPI generated SDKs unless the generator config itself is interesting).
- Test fixtures and mock data files unless they contain hardcoded secrets or real credentials.

Produce a file list grouped by extension and directory.

### Phase 2 — Per-File Scan

For each source file in the enumerated list, apply the following standardized scan prompt independently:

```
File: <path>

Scan this file for security vulnerabilities. For each finding, output a single JSON object:
{
  "file": "<path>",
  "line": <line_number>,
  "class": "<vulnerability_class>",
  "severity": "critical|high|med|low|info",
  "title": "<one-line description>",
  "detail": "<what makes this a vulnerability>",
  "confidence": "high|med|low"
}

Vulnerability classes to check:
- injection (SQL, NoSQL, command, template, LDAP, XPath)
- xss (reflected, stored, DOM)
- auth (broken auth, insecure session, hardcoded credentials)
- authz (missing access control, IDOR, privilege escalation)
- ssrf (outbound request with user-controlled destination)
- memory (overflow, use-after-free, format string, integer overflow)
- deserialization (unsafe deserialization of untrusted data)
- crypto (weak algorithm, hardcoded secret, insecure random, JWT issue)
- config (debug enabled, default credential, missing security header, exposed file)
- race (TOCTOU, double-spend, unguarded shared state)
- dependency (imported package known-vulnerable pattern, unsafe require)
- evasion (exec with user-controlled args, LOLbin invocation)

Output one JSON object per finding. Output nothing if no findings.
```

Batch files in groups of 10–20 to maintain throughput. Write raw findings as they arrive to:

- `Docs/reviews/pentest/<run_id>/sweep_raw.jsonl` (one JSON object per line)

### Phase 3 — Deduplication and Triage

After all files are scanned:

1. Load `sweep_raw.jsonl`.
2. Deduplicate findings with the same `file`, `line`, and `class` (keep the highest-confidence entry).
3. Group findings by `class` and `severity`.
4. Filter out `info`-severity findings with `confidence: low` from the verification queue (retain in raw log).

Produce an intermediate triage list at:

- `Docs/reviews/pentest/<run_id>/sweep_triage.json`

### Phase 4 — Verification Pass

For each finding in the triage list, perform a targeted verification:

1. Read the flagged file at the reported line.
2. Confirm the vulnerability class by tracing the data flow or confirming the unsafe pattern is actually present.
3. Assess exploitability: is the sink reachable from an external input vector?
4. Update `confirmed: true|false` and add `verification_note` explaining the decision.

Write verified results to:

- `Docs/reviews/pentest/<run_id>/sweep_verified.json`

### Phase 5 — Consolidated Report

Generate a sweep report at:

- `Docs/reviews/pentest/<run_id>/sweep_report.md`

Report structure:

1. **Executive Summary** — total files scanned, raw finding count, confirmed count, severity breakdown.
2. **Critical and High Findings** — one section per confirmed finding with file, line, class, title, detail, and recommended fix.
3. **Medium Findings** — condensed table format.
4. **False Positive Log** — brief notes on what was flagged and why it was ruled out.
5. **Coverage Gaps** — file types or directories excluded; areas that require manual review.

## Output Files

- `Docs/reviews/pentest/<run_id>/sweep_raw.jsonl`
- `Docs/reviews/pentest/<run_id>/sweep_triage.json`
- `Docs/reviews/pentest/<run_id>/sweep_verified.json`
- `Docs/reviews/pentest/<run_id>/sweep_report.md`
