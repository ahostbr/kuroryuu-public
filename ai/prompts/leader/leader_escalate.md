# Leader Escalation Ladder (Phase 0 - Tier 1.3)

**Phase**: Phase 0 Governance Hardening
**Tier**: Tier 1 (Foundation)
**Status**: ENFORCED (Hard Rule)

---

## Overview

The escalation ladder defines **when** and **how** a leader should intervene when a worker is stuck, blocked, or underperforming. It prevents random "poking" and ensures every nudge is structured, auditable, and evidence-based.

**Key principle**: Start at Level 0 (default). Only escalate when the previous level has failed.

---

## 5-Level Escalation Ladder

### Level 0: WAIT (Default)

**When**: Worker is active in inbox (has claimed a task, is making progress)

**Action**: Do nothing. Let the worker work.

**Duration**: For active tasks, wait at least 5 minutes before escalating.

**Evidence**: None needed (worker is making progress)

**Example**:
- Worker claimed task T042 at 18:00
- Worker posted progress update at 18:02 (PROGRESS:30%)
- At 18:07: Still see heartbeat, status=BUSY → Stay at Level 0

**Decision Tree**:
- Has worker claimed this task? → YES
- Is their heartbeat recent (< 1 min ago)? → YES
- Have they posted progress in last 5 min? → YES
- **→ LEVEL 0: WAIT**

---

### Level 1: OBSERVE (No Activity)

**When**: Worker has been silent for 5+ minutes (no inbox updates, no heartbeat refresh)

**Action**: Read worker's PTY terminal to see their state

**How**:
```bash
k_pty(action="read", session_id="{worker_session_id}", mode="viewport", max_bytes=4096)
```

**What you're looking for**:
- Prompt hanging (waiting for input?)
- Error message visible
- Process still running
- Network issues?

**Evidence**: PTY read output (stored in observation note)

**Duration**: Observe for up to 2 minutes (read every 30s if needed)

**Next step**:
- If you see clear output → move to Level 2 (Verify)
- If empty/blank → might be hang, move to Level 2

**Example**:
- Worker claimed task T042
- 5 minutes of silence, no heartbeat update
- k_pty read shows: Python traceback (ImportError)
- **→ LEVEL 2: VERIFY**

**Decision Tree**:
- Is worker still alive (heartbeat < 30s OR in PTY)? → NO
- How long silent? → 5+ min
- Have I read the PTY yet? → NO
- **→ LEVEL 1: OBSERVE** (read PTY output)

---

### Level 2: VERIFY (Suspicious Claims)

**When**: Worker claims are suspicious OR you need proof they're really stuck

**Actions** (choose based on situation):

#### 2a. Verify Claims
```bash
# Check if they really completed the task
k_pty(action="talk", command="git diff HEAD~1", sentinel=true)
k_pty(action="talk", command="git status", sentinel=true)
```

#### 2b. Validate Execution
```bash
# Did they actually run tests?
k_pty(action="talk", command="npm test -- --listTests", sentinel=true)

# Did build succeed?
k_pty(action="talk", command="npm run build", sentinel=true)
```

#### 2c. Check Environment
```bash
# What's actually in the file?
k_pty(action="talk", command="cat apps/desktop/src/renderer/App.tsx | head -20", sentinel=true)

# What's the error really saying?
k_pty(action="talk", command="cat {log_file_path}", sentinel=true)
```

**Evidence**: Command output + screenshot (before verification)

**Duration**: Max 5 minutes of verification. If you can't verify claim → escalate to Level 3.

**Decision Tree**:
- Do I trust this claim? → NO
- Have I verified git state? → NO
- Have I verified test results? → NO
- **→ LEVEL 2: VERIFY** (run commands to check)

**Example**:
- Worker says: "Tests all pass, ready to merge"
- But you smell something wrong
- Level 2: `git status` shows uncommitted files
- **→ LEVEL 3: INTERVENE** (tell them to commit)

---

### Level 3: INTERVENE (Worker Stuck)

**When**:
- Level 1/2 revealed worker is truly stuck (not blocked by external, genuine deadlock/error)
- Worker reported STUCK promise or error
- You've verified the problem exists

**Actions**:

#### 3a. Provide Context/Hint
```
Send via k_msg (preferred, or k_inbox for advanced features):
{
  "title": "Hint for T042",
  "payload": {
    "task_id": "T042",
    "message": "The import statement needs the full path. See line 234 in apps/desktop/src/renderer/components/Terminal/TerminalGrid.tsx",
    "level": 3,
    "evidence": {
      "screenshot": "path/to/stuck_screenshot.png",
      "file_line": "apps/desktop/src/renderer/components/Terminal/TerminalGrid.tsx:234",
      "type": "code_issue"
    }
  }
}
```

#### 3b. Provide Input (if interactive prompt)
```bash
# Worker stuck at prompt?
k_pty(action="send_line", session_id="{worker_pty}", data="y\r\n")
# Or specific input
k_pty(action="send_line", session_id="{worker_pty}", data="path/to/file\r\n")
```

#### 3c. Restart Session (if corrupted state)
```bash
# Kill the stuck process
k_pty(action="kill", session_id="{worker_pty}")
# Worker will restart and claim next task
```

**Evidence**: MANDATORY
- Screenshot before intervention
- Screenshot after intervention
- Hint message sent
- Intervention log entry

**Duration**: Send hint, wait max 2 minutes for response.

**Decision Tree**:
- Have I verified the problem exists? → YES
- Can I describe the fix in a hint? → YES
- Does worker need input (prompt)? → NO
- **→ LEVEL 3: INTERVENE** (send hint via inbox)

**Example**:
```
Worker stuck on ImportError.
Screenshot + verify shows: Line 234 has wrong import path
Send hint: "Change line 234 from 'from requests' to 'from urllib.request'"
Worker sees hint, fixes immediately
[Back to work]
```

---

### Level 4: EMERGENCY HOTFIX (Critical Bug)

**When**:
- Level 3 interventions have failed (multiple nudges, still stuck)
- System is in critical state
- Faster to fix directly than guide worker

**Actions**:

#### 4a. Direct Code Fix
```bash
# Make the fix directly in worker's repo
k_pty(action="talk", command="cat > file.py << 'EOF'\n[new code]\nEOF", sentinel=true)
```

#### 4b. Immediate Restart
```bash
k_pty(action="kill", session_id="{worker_pty}")
# Triggers worker restart, pick up from where left off
```

**Evidence**: MANDATORY - Must be most detailed
```
{
  "level": 4,
  "action": "direct_code_fix",
  "before_screenshot": "path/to/before.png",
  "after_screenshot": "path/to/after.png",
  "git_diff": "[full diff output]",
  "reason": "Worker stuck for 15 minutes on typo. Critical path blocked.",
  "approved_by": "Leader explicit decision",
  "evidence_pack": {
    "files_modified": ["file.py"],
    "lines_changed": [234, 235],
    "diff": "[unified diff]",
    "timestamp": "2026-01-11T18:35:22Z"
  }
}
```

**Decision Tree**:
- Have I tried Level 3 nudges? → YES (multiple)
- Did they work? → NO
- Is this critical path? → YES
- Can I fix faster than guiding? → YES
- **→ LEVEL 4: EMERGENCY HOTFIX**

**Example**:
```
Worker T042 stuck for 20 min on same error despite 3 nudges.
Critical path: This blocks T043-T050.
Decision: Fix directly.

Action: Edit file directly, commit, push.
Evidence: Full diff + before/after screenshots + rationale.
Worker wakes up to fixed code, continues.
```

**IMPORTANT - Level 4 is RARE**: Most problems resolve at Level 2-3. Level 4 is only for:
- Genuine system bugs (not worker mistakes)
- Critical path blocks
- Time-sensitive issues

---

## Decision Tree Summary

```
┌─ Worker claimed task?
│  ├─ NO → [Not your problem yet, wait for next task claim]
│  └─ YES → Active in inbox?
│     ├─ YES, recent heartbeat → Level 0: WAIT
│     └─ NO, 5+ min silent → Level 1: OBSERVE
│        └─ Can you see state in PTY?
│           ├─ YES, looks stuck → Level 2: VERIFY
│           │  └─ Can you confirm problem?
│           │     ├─ YES, genuine block → Level 3: INTERVENE
│           │     │  └─ Hint works?
│           │     │     ├─ YES → Back to work
│           │     │     └─ NO → Level 4: HOTFIX (rare)
│           │     └─ NO → Maybe external, wait longer
│           └─ NO → Might be dead, try Level 2 verify
```

---

## Implementation Notes

### Sentinel Pattern (Critical for all k_pty commands)

Every k_pty talk MUST use sentinel pattern:
```python
# DO THIS:
k_pty(action="talk",
  command="git status && echo __KR_DONE_a1b2c3__",
  sentinel="__KR_DONE_a1b2c3__"
)

# NOT THIS:
k_pty(action="talk", command="git status")
```

### Evidence Packing

Every escalation Level 2+ MUST create evidence:
```python
evidence_pack = {
  "escalation_level": 2,
  "timestamp": "2026-01-11T18:35:00Z",
  "worker_id": "T042",
  "problem": "ImportError: cannot import name X",
  "action_taken": "Verified via git status + npm test",
  "result": "Confirmed worker hasn't committed changes",
  "next_action": "Send hint to commit before continuing"
}
```

### Screenshots at Key Points

- **Before Level 1 OBSERVE**: Capture current PTY state
- **Before Level 2 VERIFY**: Run command, get output screenshot
- **Before Level 3 NUDGE**: Show what worker will see
- **Before Level 4 HOTFIX**: Show what's broken, what you're fixing

---

## Escalation Examples

### Example 1: Quick Escalation (Happy Path)

```
18:00 - Worker claims T042 (Edit form for user settings)
18:01 - Worker posts: <promise>PROGRESS:25%</promise>
18:02 - Worker posts: <promise>PROGRESS:50%</promise>
18:03 - Worker posts: <promise>PROGRESS:75%</promise>
18:04 - Worker posts: <promise>PROGRESS:100%</promise>
→ LEVEL 0 entire time (worker making progress)
```

### Example 2: Silent then Quick Verify

```
18:00 - Worker claims T042
18:01 - Worker posts: <promise>PROGRESS:40%</promise>
18:06 - [5 min of silence]
→ LEVEL 1: OBSERVE - read PTY
18:06 - Read shows: "npm test hanging..."
→ LEVEL 2: VERIFY - run git status
18:07 - Confirms: tests aren't complete
→ LEVEL 3: INTERVENE - hint: "Use npm test -- --testPathPattern=settings"
18:08 - Worker sees hint, runs correct command
18:09 - Tests pass, worker continues
```

### Example 3: Genuine Stuck → Hotfix

```
18:00 - Worker claims T042
18:05 - Worker posts: <promise>STUCK:SyntaxError on line 234</promise>
→ LEVEL 1: OBSERVE - read PTY
18:05 - Confirm: SyntaxError visible
→ LEVEL 2: VERIFY - read the file
18:06 - Confirm: Missing closing brace on line 234
→ LEVEL 3: INTERVENE - hint: "Line 234 needs closing } before } on 235"
18:07 - Worker doesn't respond (might be recompiling, stuck in debug)
18:09 - Still stuck
18:10 - Level 3 failed, time-sensitive (T042 blocks 5 others)
→ LEVEL 4: HOTFIX - Fix the brace directly
18:10 - Run: sed -i '234 s/$/}/' file.js
18:11 - Commit + push
18:11 - Worker restarts, sees fixed code, continues
```

---

## Anti-Patterns (What NOT to do)

❌ **Don't**: Random nudging at different levels without structure
✅ **Do**: Follow ladder methodically, escalate only when previous level fails

❌ **Don't**: Intervene before Level 1 OBSERVE
✅ **Do**: Always read state before sending hints

❌ **Don't**: Jump to Level 4 hotfix without trying Level 3
✅ **Do**: Try context hints first, only direct fix if 3 fails

❌ **Don't**: No evidence for interventions
✅ **Do**: Screenshot + context + command output for every escalation

❌ **Don't**: Trust claims without verification (Level 2)
✅ **Do**: Verify git status, test results, file state

---

## Automation Opportunities (Future)

Once Phase 0 is stable, can automate:
- **Level 1**: Auto-observe every 5 min if worker silent
- **Level 2**: Auto-verify git state on certain error types
- **Level 3**: Template-based hint generation from error type
- **Level 4**: Only for pre-approved hotfix patterns

But for now (Phase 0), this is **manual leadership**. You decide each step.

---

## See Also

- KURORYUU_LAWS.md section 2.3 - Escalation Protocol
- KURORYUU_LEADER.md section 5 - PTY Escalation in practice
- ai/prompts/leader_nudge.md - Hint formatting (Phase 0 Tier 1.2)

