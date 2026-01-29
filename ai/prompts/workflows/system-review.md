---
description: Analyze implementation against plan for process improvements (Kuroryuu)
---

# System Review

Perform a meta-level analysis of how well the implementation followed the plan and identify process improvements.

## Purpose

**System review is NOT code review.** You're not looking for bugs in the code - you're looking for bugs in the process.

**Your job:**

- Analyze plan adherence and divergence patterns
- Identify which divergences were justified vs problematic
- Surface process improvements that prevent future issues
- Suggest updates to steering documents, prompts, and formulas

**Philosophy:**

- Good divergence reveals plan limitations → improve planning
- Bad divergence reveals unclear requirements → improve communication
- Repeated issues reveal missing automation → create formulas

## Context & Inputs

You will analyze these artifacts:

**Implementation Plan:**
Read from: `ai/plans/{feature-name}.md`

**Execution Report:**
Read from: `ai/reports/{feature-name}-execution.md`

**Task Data:**
```
GET /v1/orchestration/tasks/{task_id}
```

## Analysis Workflow

### Step 1: Understand the Planned Approach

Read the implementation plan and extract:

- What features were planned?
- What architecture was specified?
- What validation steps were defined?
- What patterns were referenced?
- What subtasks were created?

### Step 2: Understand the Actual Implementation

Read the execution report and extract:

- What was implemented?
- What diverged from the plan?
- What challenges were encountered?
- What was skipped and why?
- How many iterations did workers need?
- What promises were reported (DONE/BLOCKED/STUCK/PROGRESS)?

### Step 3: Classify Each Divergence

For each divergence identified, classify as:

**Good Divergence (Justified):**

- Plan assumed something that didn't exist in the codebase
- Better pattern discovered during implementation
- Performance optimization needed
- Security issue discovered that required different approach

**Bad Divergence (Problematic):**

- Ignored explicit constraints in plan
- Created new architecture instead of following existing patterns
- Took shortcuts that introduce tech debt
- Misunderstood requirements

### Step 4: Trace Root Causes

For each problematic divergence, identify:

- Was the plan unclear? Where, why?
- Was context missing from subtask description?
- Was validation insufficient?
- Did worker need more iterations than budgeted?
- Were leader hints effective?

### Step 5: Generate Process Improvements

Based on patterns across divergences, suggest:

- **Steering document updates:** Patterns or anti-patterns to document in `ai/steering/`
- **Prompt updates:** Instructions to clarify in `ai/prompts/`
- **Formula improvements:** Steps to add/modify in `ai/formulas/`
- **Validation additions:** Checks that would catch issues earlier

## Output Format

Save your analysis to: `ai/reviews/{feature-name}-system-review.md`

### Report Structure:

```markdown
# System Review: {Feature Name}

## Meta Information
- Plan reviewed: ai/plans/{feature-name}.md
- Execution report: ai/reports/{feature-name}-execution.md
- Task ID: {task_id}
- Date: {current date}

## Overall Alignment Score: __/10

Scoring guide:
- 10: Perfect adherence, all divergences justified
- 7-9: Minor justified divergences
- 4-6: Mix of justified and problematic divergences
- 1-3: Major problematic divergences

## Divergence Analysis

### Divergence 1: {title}
| Attribute | Value |
|-----------|-------|
| Planned | {what plan specified} |
| Actual | {what was implemented} |
| Reason | {agent's stated reason} |
| Classification | Good / Bad |
| Root Cause | {unclear plan / missing context / etc} |

## Worker Performance

| SubTask | Iterations | Budget | Promise | Hints Needed |
|---------|------------|--------|---------|--------------|
| {title} | {N} | {max} | {DONE/STUCK} | {0/1/2} |

## Pattern Compliance

- [ ] Followed codebase architecture
- [ ] Used documented patterns from steering documents
- [ ] Applied testing patterns correctly
- [ ] Met validation requirements
- [ ] Promise protocol used correctly

## System Improvement Actions

### Update Steering Documents (ai/steering/)
- [ ] Document {pattern X} discovered during implementation
- [ ] Add anti-pattern warning for {Y}

### Update Prompts (ai/prompts/)
- [ ] {prompt_name}.md: Add instruction for {missing step}
- [ ] {prompt_name}.md: Clarify {ambiguous instruction}

### Update Formulas (ai/formulas/)
- [ ] {formula_name}.toml: Add validation step for {X}

### Update Leader Behavior
- [ ] Improve hint generation for {scenario}
- [ ] Adjust iteration budget for complexity {N} tasks

## Key Learnings

**What worked well:**
- {specific things that went smoothly}

**What needs improvement:**
- {specific process gaps identified}

**For next implementation:**
- {concrete improvements to try}
```

## Important

- **Be specific:** Don't say "plan was unclear" - say "plan didn't specify which auth pattern to use"
- **Focus on patterns:** One-off issues aren't actionable. Look for repeated problems.
- **Action-oriented:** Every finding should have a concrete update suggestion
- **Track iterations:** Worker iteration counts reveal complexity estimation accuracy
