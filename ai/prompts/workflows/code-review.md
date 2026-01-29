---
description: Technical code review for quality and bugs (Kuroryuu)
---

# Code Review

Perform technical code review on recently changed files.

## Core Principles

**Review Philosophy:**

- Simplicity is the ultimate sophistication - every line should justify its existence
- Code is read far more often than it's written - optimize for readability
- The best code is often the code you don't write
- Elegance emerges from clarity of intent and economy of expression

## What to Review

### Step 1: Gather Context

Start by examining:

- `README.md` or `CLAUDE.md`
- `ai/prds/{feature-name}.md` if found
- `ai/plans/{feature-name}.md` for planned approach
- Key files in the affected modules

### Step 2: Identify Changes

Run these commands:

```bash
git status
git diff HEAD
git diff --stat HEAD
```

Check new files:

```bash
git ls-files --others --exclude-standard
```

### Step 3: Review Each File

Read each changed/new file in its entirety (not just the diff) to understand full context.

For each file, analyze for:

**1. Logic Errors**
- Off-by-one errors
- Incorrect conditionals
- Missing null/undefined checks
- Race conditions
- Edge case handling

**2. Security Issues**
- SQL injection vulnerabilities
- XSS vulnerabilities
- Insecure data handling
- Exposed secrets or API keys
- Authentication/authorization gaps

**3. Performance Problems**
- N+1 queries
- Inefficient algorithms
- Memory leaks
- Unnecessary computations
- Missing caching opportunities

**4. Code Quality**
- Violations of DRY principle
- Overly complex functions (>50 lines)
- Poor naming (unclear, misleading)
- Missing type hints/annotations
- Magic numbers/strings

**5. Pattern Adherence**
- Follows project conventions from `CLAUDE.md`
- Matches existing patterns in codebase
- Uses established utilities (not reinventing)
- Logging consistent with project style
- Error handling consistent

## Verify Issues Are Real

- Run specific tests for issues found
- Confirm type errors are legitimate
- Validate security concerns with context
- Check if "issue" is actually existing pattern

## Output Format

Save to: `ai/reviews/{feature-name}-code-review.md`

```markdown
# Code Review: {Feature Name}

## Summary
{Overall assessment - 1-2 sentences}

## Stats
- Files Modified: {N}
- Files Added: {N}
- Files Deleted: {N}
- Lines Added: +{N}
- Lines Removed: -{N}

## Issues Found

### {File Path}

#### Issue 1: {Title}
| Attribute | Value |
|-----------|-------|
| Severity | critical / high / medium / low |
| Line | {line number} |
| Issue | {one-line description} |

**Detail:** {explanation of why this is a problem}

**Current:**
```{language}
{problematic code}
```

**Suggested:**
```{language}
{fixed code}
```

---

### {Next File Path}
...

## Patterns Observed

**Good patterns found:**
- {positive observation}

**Anti-patterns found:**
- {area for improvement}

## Recommendations

### Must Fix (before merge)
- [ ] {critical/high severity item}

### Should Fix (soon)
- [ ] {medium severity item}

### Consider (nice to have)
- [ ] {low severity item}

## Verdict

**PASS** / **PASS WITH CHANGES** / **NEEDS WORK**
```

If no issues found: "Code review passed. No technical issues detected."

## Severity Guide

| Severity | Description | Action |
|----------|-------------|--------|
| **critical** | Security vulnerability, data loss risk | Block merge |
| **high** | Bug that will cause failures | Fix before merge |
| **medium** | Code smell, minor bug | Fix soon |
| **low** | Style, optimization opportunity | Optional |

## Important

- Be specific (line numbers, not vague complaints)
- Focus on real bugs, not style preferences
- Suggest fixes, don't just complain
- Flag security issues as CRITICAL
- Check against `ai/plans/` to verify implementation matches intent
