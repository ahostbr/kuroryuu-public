---
description: Plan a feature implementation citing PRD as north star (Kuroryuu)
---

# Leader Plan Feature

Create a comprehensive implementation plan for a feature, ensuring alignment with the project PRD (north star).

## Purpose

Transform a feature request into an actionable implementation plan that:
1. Aligns with the PRD's mission and constraints
2. Follows existing codebase patterns
3. Can be broken down into worker-executable subtasks

**Core Principle:** We do NOT write code in this phase. We create a context-rich plan that enables workers to succeed on first attempt.

## Inputs

| Input | Source | Required |
|-------|--------|----------|
| Feature request | User or task queue | Yes |
| PRD path | `ai/prds/{{project}}.md` | Yes |
| Task ID | Orchestration (if exists) | Optional |

## PRD Alignment Check

**Before planning, verify alignment with PRD:**

1. Read the PRD thoroughly
2. Check feature against:
   - Mission statement (does it align?)
   - MVP scope (is it in-scope?)
   - Technology stack (does it fit?)
   - User stories (which does it address?)
3. If feature conflicts with PRD:
   - STOP and clarify with human
   - Do not proceed with misaligned work

```markdown
## PRD Alignment

**PRD:** {{prd_path}}
**Feature:** {{feature_name}}

| Check | Result | Notes |
|-------|--------|-------|
| Mission alignment | PASS/FAIL | {{explanation}} |
| In MVP scope | PASS/FAIL | {{explanation}} |
| Tech stack fit | PASS/FAIL | {{explanation}} |
| User story match | US-{{N}} | {{story reference}} |

**Verdict:** ALIGNED / NEEDS CLARIFICATION / OUT OF SCOPE
```

## Planning Process

### Phase 1: Feature Understanding

Extract from the feature request:
- Core problem being solved
- User value and business impact
- Feature type: New Capability / Enhancement / Refactor / Bug Fix
- Complexity: Low / Medium / High
- Affected systems and components

Create user story:
```
As a {{user_type}}
I want to {{action}}
So that {{benefit}}
```

### Phase 2: Codebase Intelligence

**Search Priority:** k_rag → k_repo_intel → git → fallback

1. **Check index freshness:**
   ```
   k_rag(action="status")
   k_repo_intel(action="status")
   ```

2. **Find similar implementations:**
   ```
   k_rag(action="query", query="<feature pattern>", scope="code")       # Find implementation patterns
   k_rag(action="query", query="<feature>", scope="worklogs")           # Prior work on similar features
   k_rag(action="query", query="<feature>", scope="checkpoints")        # Session context history
   ```

3. **Get architecture context:**
   ```
   k_repo_intel(action="get", report="routes")      # API endpoints
   k_repo_intel(action="get", report="components") # React components
   k_repo_intel(action="get", report="module_graph", query="<area>")
   ```

4. **Check history if needed:**
   ```
   git log --oneline -10 -- <relevant_path>
   ```

Search for:
- **Similar implementations** - Patterns to follow
- **Integration points** - Where new code connects
- **Testing patterns** - How to test this type of feature
- **Naming conventions** - Match existing style

### Phase 3: Research (if needed)

For features requiring external knowledge:
- Library documentation with specific sections
- Best practices for the technology
- Known gotchas and workarounds

### Phase 4: Strategic Design

Consider:
- How does this fit the existing architecture?
- What are the critical dependencies?
- What could go wrong? (edge cases, errors)
- How will this be tested?
- Performance implications?
- Security considerations?

### Phase 5: Plan Generation

## Plan Template

Output to: `ai/plans/{{feature-name}}.md`

```markdown
# Feature: {{feature_name}}

## PRD Alignment

**PRD Reference:** ai/prds/{{project}}.md
**User Story:** US-{{N}} from PRD Section {{X}}
**Mission Alignment:** {{how this supports the PRD mission}}

## Feature Description

{{Detailed description}}

## User Story

As a {{user_type}}
I want to {{action}}
So that {{benefit}}

## Feature Metadata

| Attribute | Value |
|-----------|-------|
| Type | New Capability / Enhancement / Refactor / Bug Fix |
| Complexity | Low / Medium / High |
| Affected Systems | {{list}} |
| Dependencies | {{external libs/services}} |

---

## CONTEXT REFERENCES

### Must-Read Files (before implementing)

| File | Lines | Why |
|------|-------|-----|
| {{path}} | {{range}} | {{reason}} |

### New Files to Create

| File | Purpose |
|------|---------|
| {{path}} | {{description}} |

### Patterns to Follow

**From codebase:**
- {{pattern description}} - see `{{file}}:{{line}}`

**From PRD:**
- {{constraint or pattern from PRD}}

---

## IMPLEMENTATION PHASES

### Phase 1: Foundation
{{foundational setup tasks}}

### Phase 2: Core Implementation
{{main feature work}}

### Phase 3: Integration
{{connecting to existing code}}

### Phase 4: Testing & Validation
{{test strategy}}

---

## STEP-BY-STEP TASKS

Each task should be atomic and independently verifiable.

### Task 1: {{ACTION}} {{target}}
- **Implement:** {{specific detail}}
- **Pattern:** {{reference file:line}}
- **Validate:** `{{command}}`

### Task 2: {{ACTION}} {{target}}
...

---

## VALIDATION COMMANDS

| Level | Command | Expected |
|-------|---------|----------|
| Syntax | `{{lint cmd}}` | No errors |
| Types | `{{type cmd}}` | No errors |
| Tests | `{{test cmd}}` | All pass |
| Build | `{{build cmd}}` | Success |

---

## ACCEPTANCE CRITERIA

From PRD and feature requirements:
- [ ] {{criterion 1}}
- [ ] {{criterion 2}}
- [ ] All validation commands pass
- [ ] Code follows project conventions

---

## NOTES

{{design decisions, trade-offs, considerations}}
```

## Orchestration Integration

After plan is complete:

```http
PATCH /v1/orchestration/tasks/{{task_id}}
Content-Type: application/json

{
  "status": "PLANNED",
  "plan_path": "ai/plans/{{feature-name}}.md",
  "metadata": {
    "complexity": "{{complexity}}",
    "estimated_subtasks": {{count}},
    "prd_alignment": "verified"
  }
}
```

## Next Step

After plan is approved, proceed to: `leader_breakdown.md`

This will convert the plan into executable subtasks for workers.

## Agent Instructions

```
You are the LEADER creating an implementation plan.

CRITICAL RULES:
1. READ the PRD first - it is your north star
2. VERIFY alignment before planning
3. DO NOT write code - only plan
4. SEARCH codebase for patterns to follow
5. MAKE plans specific enough for one-pass implementation

PLANNING WORKFLOW:
1. Verify PRD alignment
2. Understand the feature deeply
3. Search codebase for similar implementations
4. Research external docs if needed
5. Design the approach
6. Generate the plan document
7. Save to ai/plans/{{feature-name}}.md
8. Update orchestration task status

OUTPUT:
- Plan file at ai/plans/{{feature-name}}.md
- Task status updated to PLANNED
- Ready for breakdown into subtasks
```

## Quality Checklist

Before completing:
- [ ] PRD alignment verified
- [ ] Feature scope is clear
- [ ] Codebase patterns identified
- [ ] All tasks have validation commands
- [ ] Plan is specific enough for workers
- [ ] Plan saved to ai/plans/
