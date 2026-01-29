---
description: Request help from Ralph leader when stuck
---

# Request Help from Ralph

Use this command when you are **blocked** and need clarification or guidance.

## What This Does

1. Outputs a `<promise>STUCK:reason</promise>` signal
2. Ralph (leader) detects this and injects helpful context
3. You receive the context and continue working

## Usage

Output this EXACT format:

```
<promise>STUCK:your one-line question here</promise>
```

## Examples

### Need to know which file to modify:
```
<promise>STUCK:Which file handles user authentication?</promise>
```

### Unclear about a pattern:
```
<promise>STUCK:Should I use the repository pattern or direct DB access?</promise>
```

### Got a confusing error:
```
<promise>STUCK:Getting ECONNREFUSED on port 8200 - is gateway running?</promise>
```

### Task scope unclear:
```
<promise>STUCK:Does "fix login" include password reset flow?</promise>
```

### Missing dependency:
```
<promise>STUCK:Which date library does this project use?</promise>
```

## What Happens Next

1. Ralph reads your stuck message
2. Ralph gathers relevant context (reads files, checks patterns)
3. Ralph injects a response via k_pty with:
   - Relevant context
   - Specific recommendation
   - Instruction to continue

4. You receive the context and continue working
5. When complete, use `/ralph_done`

## Important

- Keep the reason to ONE LINE (brief but clear)
- Wait for Ralph's response before continuing
- If still stuck after Ralph's help, ask again with more detail
- After 3 interventions on same issue, Ralph may escalate to human

## Do NOT Use For

- Minor questions you can figure out (try first)
- When task is actually complete (use `/ralph_done`)
- External blockers (use `/ralph_blocked` if available)
