---
description: Final verification and completion of hackathon feature implementation (Kuroryuu)
---

# Hackathon Complete

Verify implementation against PRD requirements and finalize the feature.

## Purpose

This is the final step in the hackathon-prd workflow. You've created a PRD, planned the implementation, and executed. Now verify everything works and document completion.

## Input Artifacts

You should have access to:
- `prd.md` - The Product Requirements Document
- `plan.md` - The implementation plan
- `implementation_report.md` - What was actually built

## Verification Steps

### 1. Requirements Check

Read the PRD and verify each requirement:

```markdown
| Requirement | PRD Section | Status | Notes |
|-------------|-------------|--------|-------|
| {req_name} | {section} | PASS/PARTIAL/FAIL | {details} |
```

### 2. Plan Adherence

Compare `plan.md` with actual implementation:
- Did all planned steps complete?
- Were there unplanned additions?
- Were any planned items skipped?

### 3. Functional Verification

Run available tests and checks:

```bash
# Type checking (if TypeScript/Python)
npm run typecheck  # or: python -m mypy
# Linting
npm run lint       # or: ruff check
# Unit tests
npm test           # or: pytest
```

### 4. Integration Check

Verify the feature works in context:
- Does it integrate with existing code?
- Are there any runtime errors?
- Does the UI render correctly (if applicable)?

## Generate Completion Report

Save to: `ai/reports/{feature-name}-completion.md`

```markdown
# Completion Report: {Feature Name}

## Meta
| Attribute | Value |
|-----------|-------|
| Feature | {feature_name} |
| PRD | ai/prds/{feature-name}.md |
| Plan | ai/plans/{feature-name}.md |
| Completed | {timestamp} |

## Requirements Status

| # | Requirement | Status | Evidence |
|---|-------------|--------|----------|
| 1 | {req from PRD} | PASS | {where to verify} |
| 2 | {req from PRD} | PASS | {where to verify} |

**Coverage:** {N}/{total} requirements satisfied ({percentage}%)

## Verification Results

| Check | Command | Result |
|-------|---------|--------|
| Types | {cmd} | PASS/FAIL |
| Lint | {cmd} | PASS/FAIL |
| Tests | {cmd} | {N} passed, {N} failed |
| Build | {cmd} | PASS/FAIL |

## Files Changed

| File | Action | Purpose |
|------|--------|---------|
| {path} | created/modified | {why} |

## Divergences from PRD

### {Divergence Title} (if any)
- **PRD stated:** {original requirement}
- **Implemented:** {actual implementation}
- **Reason:** {why different}
- **Impact:** Positive/Neutral/Negative

## Known Issues

| Issue | Severity | Follow-up |
|-------|----------|-----------|
| {description} | low/medium/high | {ticket or note} |

## Demo Steps

How to see the feature working:
1. {step}
2. {step}
3. {step}

## Conclusion

**Status:** COMPLETE / PARTIAL / BLOCKED

{Brief summary of what was achieved and any remaining work}
```

## Completion Criteria

Mark the task COMPLETE when:
- [ ] All critical requirements pass
- [ ] No failing tests
- [ ] No type errors
- [ ] Feature is usable
- [ ] Completion report generated

## Promise

If all criteria met:
```
<promise>DONE</promise>
```

If some requirements unmet but feature is usable:
```
<promise>PROGRESS: {N}/{total} requirements met, feature functional</promise>
```

If blocked by external issue:
```
<promise>BLOCKED: {what's blocking}</promise>
```

## Important

- Be honest about partial completions
- Document known issues rather than hiding them
- Provide clear demo steps so others can verify
- Link to evidence (file paths, screenshots, test output)
