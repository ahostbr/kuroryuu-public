---
id: analyze_dependency
name: Pentest Dependency / Supply Chain Analysis
category: analysis
tool_profile: pentest_analyze
---

# Kuroryuu Pentest Prompt: Dependency / Supply Chain Analysis

## Objective

Identify exploitable known CVEs in transitive dependencies, dependency confusion attack surfaces, typosquatting candidates, and lockfile integrity issues across all package ecosystems present in the repo.

## Inputs

- `Docs/reviews/pentest/<run_id>/recon.md`
- `{{REPO_PATH}}`

## Method

1. **Manifest inventory**: locate all package manifests and lockfiles — `package.json`, `package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`, `bun.lockb`, `requirements.txt`, `Pipfile.lock`, `poetry.lock`, `Cargo.toml`, `Cargo.lock`, `go.mod`, `go.sum`, `Gemfile.lock`, `pom.xml`, `build.gradle`, `*.csproj`, `packages.lock.json`.
2. **CVE scan**: for each direct and transitive dependency, cross-reference against known vulnerability databases (OSV, NVD, GitHub Advisory Database, Snyk, npm audit, pip-audit, cargo-audit, govulncheck). Record CVE ID, CVSS score, affected versions, and fixed version.
3. **Exploitability triage**: for each CVE found, determine whether the vulnerable code path is actually reachable from the application — is the affected function called? Is the vulnerable behavior triggered by attacker-controlled input?
4. **Dependency confusion**: identify internal or private package names (scoped `@org/` packages, PyPI packages with no public registration, Go module paths on private domains). Assess whether an attacker could register a higher-versioned public package with the same name.
5. **Typosquatting**: flag package names that are one character away from high-value packages or that mirror common typos (e.g., `lodahs`, `reqeusts`, `nod-fetch`).
6. **Pinning analysis**: identify dependencies pinned only to a major or minor version range rather than an exact version or commit SHA. Flag `*` or `latest` tags.
7. **Lockfile integrity**: check whether lockfiles are committed, whether they are consistent with manifests, and whether integrity hashes (`integrity` field in npm, `hash` in pip) are present and correct.
8. **Script hooks**: audit `postinstall`, `prepare`, `preinstall` scripts in `package.json` and equivalent hooks in other ecosystems — these execute during `npm install` and are a common supply-chain vector.

## Output Files

- `Docs/reviews/pentest/<run_id>/dependency_analysis.md`
- `Docs/reviews/pentest/<run_id>/dependency_queue.json`

## Queue Schema

```json
{
  "vulnerabilities": [
    {
      "id": "DEP-001",
      "class": "known_cve|dependency_confusion|typosquatting|unpinned|lockfile_missing|malicious_script",
      "ecosystem": "npm|pypi|cargo|go|rubygems|maven|nuget",
      "package": "package-name",
      "version_installed": "x.y.z",
      "cve_id": "CVE-YYYY-NNNNN",
      "cvss": "9.8",
      "fixed_version": "x.y.z+1",
      "reachable": "yes|no|unknown",
      "confidence": "high|med|low",
      "exploit_hint": "minimal witness"
    }
  ]
}
```
