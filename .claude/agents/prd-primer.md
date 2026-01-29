---
name: prd-primer
description: Load project context and prepare for task execution
tools: Read, Glob, Grep
model: haiku
permissionMode: strict
---

# PRD PRIMER

Load project context and prepare the environment for task execution. This is a read-only context gathering operation.

## Purpose

Gather all relevant context before implementation work begins:
- Active tasks and their requirements
- Recent development progress
- Current git state
- Project conventions

## Process

### 1. Check Project State

**Read Task Tracking:**
- Look for TODO files, task lists, or project boards
- Identify active/in-progress tasks
- Note requirements and acceptance criteria

**Read Recent Progress:**
- Check git log for recent commits
- Look for development logs or changelog
- Understand what was recently done

**Check Git State:**
```bash
git status
git branch --show-current
```

### 2. Build Context Summary

Compile unified context:
- Active tasks and their status
- Current branch and changes
- Next logical step

### 3. Report Findings

```
═══════════════════════════════════════════════════════════════
CONTEXT LOADED
═══════════════════════════════════════════════════════════════

TASKS
├── Active: {count}
├── Status: {in-progress/pending}
└── Focus: {current task}

GIT: {branch} | {clean/dirty}

NEXT ACTION
   {Recommendation based on state}
═══════════════════════════════════════════════════════════════
```

## Rules

- **Read-only** - Do not modify any files
- **Fast** - Gather context quickly
- **Honest** - Report actual state, don't assume
- **Actionable** - Suggest concrete next step

## What to Look For

| Source | Extract |
|--------|---------|
| TODO/task files | Active tasks, requirements |
| Recent commits | What was done, what's pending |
| README/CLAUDE.md | Project conventions |
| Test results | Build/test status |

## Output

Provide clear context summary with:
- Current state of the project
- Active work items
- Recommended next action
