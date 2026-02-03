---
description: Creates a team orchestration plan for /max-parallel execution with builder/validator pairs. Generates a structured plan file that can be executed.
argument-hint: "[user request]" "[orchestration guidance - optional]"
model: opus
disallowed-tools: Task, EnterPlanMode
hooks:
  Stop:
    - hooks:
        - type: command
          command: >-
            powershell.exe -NoProfile -Command "
              $plans = Get-ChildItem -Path 'Docs/Plans/*.md' -ErrorAction SilentlyContinue |
                Where-Object { $_.LastWriteTime -gt (Get-Date).AddMinutes(-10) };
              if ($plans) {
                Write-Host 'Plan file created: ' + $plans[0].Name;
                exit 0
              } else {
                Write-Host 'ERROR: No recent plan file found in Docs/Plans/';
                exit 1
              }
            "
---

# K-Parallel Plan Generator

Create a detailed implementation plan with team orchestration for `/max-parallel` execution. This is a **template metaprompt** - a prompt that generates a structured plan document.

## Variables

| Variable | Source | Description |
|----------|--------|-------------|
| USER_PROMPT | $1 | The user's request to plan |
| ORCHESTRATION_PROMPT | $2 | Optional guidance for team composition |
| PLAN_OUTPUT | Docs/Plans/ | Output directory |
| BUILDER_AGENT | mp-builder | Builder agent type |
| VALIDATOR_AGENT | mp-validator | Validator agent type |

## Instructions

**CRITICAL: PLANNING ONLY**

- Do NOT execute, build, or deploy anything
- Do NOT spawn agents or run code
- Your ONLY output is a plan document saved to `Docs/Plans/`

### Workflow

1. **Analyze Requirements**
   - Parse USER_PROMPT to understand the core request
   - Identify scope, complexity, and deliverables

2. **Explore Codebase** (if needed)
   - Use Glob, Grep, Read to understand existing patterns
   - Identify relevant files and dependencies
   - Do NOT modify anything

3. **Design Team**
   - Use ORCHESTRATION_PROMPT to guide team composition
   - Create builder/validator pairs for each major component
   - Assign unique names to each team member

4. **Define Tasks**
   - Break work into discrete, focused tasks
   - Each task gets a builder and validator
   - Set dependencies using blockedBy

5. **Generate Filename**
   - Create descriptive kebab-case filename
   - Example: `api-error-handling-plan.md`

6. **Save Plan**
   - Write to `Docs/Plans/<filename>.md`
   - Follow the Plan Format exactly

## Plan Format

```markdown
# Plan: <descriptive task name>

## Task Description
<describe what will be accomplished based on USER_PROMPT>

## Objective
<clearly state the goal and success criteria>

## Problem Statement
<define the problem being solved - skip for simple tasks>

## Solution Approach
<describe the technical approach>

## Relevant Files
<list files to be modified/created with brief explanation>

### Existing Files
- `path/to/file.ts` - [what it does, why relevant]

### New Files
- `path/to/new.ts` - [what it will contain]

## Team Orchestration

You operate as the team lead and orchestrate the team to execute this plan.
You NEVER write code directly - you use Task and Task* tools to deploy team members.

### Team Members

- **builder-<component>**
  - Name: builder-<unique-name>
  - Role: <specific focus area>
  - Agent Type: mp-builder
  - Resume: true

- **validator-<component>**
  - Name: validator-<unique-name>
  - Role: Verify <component> implementation
  - Agent Type: mp-validator
  - Resume: false

<repeat for each component>

## Step by Step Tasks

Execute tasks in order. Use TaskCreate for each, then deploy with Task tool.

### Wave 1: Foundation (Parallel)

#### 1. <First Task Name>
- **Task ID**: `task-1-<name>`
- **Depends On**: none
- **Assigned To**: builder-<name>
- **Parallel**: true
- <action item 1>
- <action item 2>

#### 2. <Second Task Name>
- **Task ID**: `task-2-<name>`
- **Depends On**: none
- **Assigned To**: builder-<name>
- **Parallel**: true
- <action items>

### Wave 2: Validation (Parallel, after Wave 1)

#### 3. Validate Task 1
- **Task ID**: `validate-1`
- **Depends On**: task-1-<name>
- **Assigned To**: validator-<name>
- **Parallel**: true
- Verify acceptance criteria met
- Run validation commands

#### 4. Validate Task 2
- **Task ID**: `validate-2`
- **Depends On**: task-2-<name>
- **Assigned To**: validator-<name>
- **Parallel**: true
- Verify acceptance criteria met

### Wave 3: Integration (Sequential)

#### 5. Integration Task
- **Task ID**: `task-5-integration`
- **Depends On**: validate-1, validate-2
- **Assigned To**: builder-integration
- **Parallel**: false
- <integration actions>

### Wave 4: Final Validation

#### 6. Final Validation
- **Task ID**: `validate-final`
- **Depends On**: task-5-integration
- **Assigned To**: validator-final
- **Parallel**: false
- Run all validation commands
- Verify all acceptance criteria

## Acceptance Criteria

<list specific, measurable criteria>

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Validation Commands

Execute these commands to validate completion:

```bash
# Example commands
python -m pytest tests/ -v
npm run typecheck
npm run lint
```

## Notes

<optional: dependencies, considerations, warnings>
```

## Report

After saving the plan, provide a summary:

```
Plan Created: Docs/Plans/<filename>.md

Topic: <brief description>

Team:
- <list of team members with roles>

Tasks: <count> tasks in <count> waves

To execute:
/max-parallel Docs/Plans/<filename>.md
```

## Self-Validation

The Stop hook validates:
1. A new .md file exists in Docs/Plans/
2. File was created within last 10 minutes

If validation fails, you must create the plan file before stopping.
