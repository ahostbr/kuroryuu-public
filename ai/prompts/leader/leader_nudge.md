# Leader Nudge & Evidence Generation (Phase 0 - Tier 1.2)

> **Hackathon Stats:** 23 days | 437 sessions | 431 tasks | 16 MCP tools → 118 actions

**Phase**: Phase 0 Governance Hardening
**Tier**: Tier 1 (Foundation)
**Status**: ENFORCED (Hard Rule)

---

## Overview

**Nudge** = Any intervention by leader when worker is stuck (send hint, input, or fix code)

**Evidence Pack** = Mandatory artifact capturing BEFORE/AFTER state of every nudge

**Key Principle**: Zero nudges without evidence. Every intervention is auditable.

---

## Nudge Workflow

### Step 1: Detect Stuck Worker
Worker reports `<promise>STUCK:error</promise>` OR silent 5+ min with task claimed

### Step 2: Capture BEFORE State
- Screenshot via k_capture
- PTY output via k_pty read
- Git state via git status

### Step 3: Classify Problem
- code_issue: ImportError, SyntaxError, TypeError
- ui_issue: Layout, visibility, positioning
- external: Network, dependency, system

### Step 4: Send Nudge (PTY PRIMARY, inbox FALLBACK)

**PRIMARY - Direct terminal injection:**
```python
worker_pty = k_pty(action="resolve", agent_id="worker_abc")
k_pty(action="send_line", session_id=worker_pty["session_id"],
      data="Try importing from 'utils' instead of 'helpers' - check src/utils/index.ts:45")
```

**FALLBACK - Use inbox if PTY unavailable:**
```python
k_inbox(action="send", to_agent="worker_abc", subject="Hint: Fix import", body="...")
```

- Hint message with file:line references
- Input to PTY if waiting on prompt
- Direct code fix if Level 4 emergency

### Step 5: Capture AFTER State
- Screenshot showing result
- PTY output showing progress
- Git state showing changes

### Step 6: Generate Evidence Pack
Save to ai/evidence/[TASK_ID]/nudge_[N]/ with:
- before.png, after.png
- evidence.json (full metadata)
- summary.txt (what happened)

---

## Evidence Pack JSON

```json
{
  "version": 1,
  "timestamp": "2026-01-11T18:35:22Z",
  "task_id": "T042",
  "worker_id": "claude_worker_001",
  "problem": {
    "type": "code_issue",
    "message": "ImportError: cannot import name X",
    "location": "TerminalGrid.tsx:234"
  },
  "intervention": {
    "level": 3,
    "method": "hint_via_inbox",
    "hint": "Fix import at line 234"
  },
  "evidence": {
    "before_screenshot": "nudge_001/before.png",
    "after_screenshot": "nudge_001/after.png",
    "success": true
  }
}
```

---

## Files to Create

- [ ] apps/gateway/utils/evidence_pack.py
- [ ] ai/prompts/leader_nudge_full.md (detailed guide)
- [ ] ai/config/nudge_templates.json (hint templates)

---

## See Also

- KURORYUU_LAWS.md section 2.2 - Evidence Requirement
- ai/prompts/leader_escalate.md - When to escalate
- apps/mcp_core/tools_capture.py - k_capture integration
