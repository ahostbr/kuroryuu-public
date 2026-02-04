# Coding Agents UI Components Review

**Date:** 2026-02-04
**Reviewer:** Claude Opus 4.5
**Components Reviewed:**
- `SessionLogViewer.tsx`
- `SessionCard.tsx`
- `SpawnAgentDialog.tsx`

**Location:** `apps/desktop/src/renderer/components/coding-agents/`

---

## Executive Summary

The coding-agents UI components provide a functional interface for spawning, monitoring, and interacting with background coding agents. While the implementation is generally solid, there are several bugs, accessibility issues, and code quality improvements that should be addressed.

**Overall Assessment:** Functional with moderate issues

| Category | Rating | Issues Found |
|----------|--------|--------------|
| Bugs | Fair | 5 issues |
| Accessibility | Poor | 8 issues |
| Code Quality | Good | 4 issues |
| Security | Fair | 2 issues |

---

## 1. SessionLogViewer.tsx

### 1.1 Bugs

#### BUG-SLV-001: Memory Leak - Stream Output Not Cleared on Session Change
**Severity:** Medium
**Location:** Lines 26-35

When switching between sessions, the `streamOutput` from `useBashOutputStream` may retain stale data from the previous session before the new stream connects. The `displayLog` logic at line 33-35 can show mixed content.

```tsx
// Current problematic logic
const displayLog = session.running && streamOutput
  ? streamOutput  // May contain stale data from previous session
  : log;
```

**Fix:** Clear stream output when session.id changes or add session ID validation.

#### BUG-SLV-002: Race Condition in fetchLog After sendInput
**Severity:** Low
**Location:** Lines 80-88

The `setTimeout(fetchLog, 500)` at line 86 is a fragile pattern. If the user sends input rapidly, multiple delayed fetches can overlap and cause UI flicker.

```tsx
if (success) {
  setInput('');
  setTimeout(fetchLog, 500);  // Race condition if called rapidly
}
```

**Fix:** Debounce the fetch or use a flag to prevent concurrent fetches.

#### BUG-SLV-003: Polling Continues When Streaming is Active
**Severity:** Low
**Location:** Lines 48-62

When WebSocket streaming is connected (`streamConnected`), polling still occurs every 2 seconds. This wastes resources and may cause UI inconsistencies.

**Fix:** Skip polling when `streamConnected` is true:
```tsx
if (session.running && !streamConnected) {
  pollIntervalRef.current = setInterval(fetchLog, 2000);
}
```

### 1.2 Accessibility Issues

#### A11Y-SLV-001: Buttons Missing Accessible Labels
**Severity:** High
**Location:** Lines 141-178

Icon-only buttons use `title` attribute but lack `aria-label`. Screen readers may not announce the button purpose correctly.

```tsx
<button
  onClick={fetchLog}
  title="Refresh"  // Not accessible to screen readers
  className="..."
>
  <RefreshCw className="..." />
</button>
```

**Fix:** Add `aria-label` to all icon-only buttons.

#### A11Y-SLV-002: Log Container Not Announced as Live Region
**Severity:** Medium
**Location:** Lines 202-210

The `<pre>` element showing log output doesn't use ARIA live regions. Screen reader users won't be notified of new content.

**Fix:** Add `aria-live="polite"` and `role="log"`:
```tsx
<pre
  ref={logRef}
  role="log"
  aria-live="polite"
  aria-label="Session output log"
  ...
>
```

#### A11Y-SLV-003: Input Field Missing Label Association
**Severity:** Medium
**Location:** Lines 215-222

The text input has a placeholder but no associated `<label>` element.

**Fix:** Add a visually hidden label or use `aria-label`.

#### A11Y-SLV-004: Status Badges Lack Screen Reader Context
**Severity:** Low
**Location:** Lines 113-133

Status indicators (Running, Exit code) are purely visual. Add `role="status"` and descriptive `aria-label`.

### 1.3 Code Quality

#### CQ-SLV-001: Duplicated formatTime Function
**Severity:** Low
**Location:** Lines 98-105

This helper is duplicated in `SessionCard.tsx`. Extract to a shared utility.

#### CQ-SLV-002: Magic Numbers
**Severity:** Low
**Location:** Lines 41, 54, 75, 86

Several magic numbers: `2000` (log lines), `2000` (poll interval), `50` (scroll threshold), `500` (fetch delay). Extract to named constants.

```tsx
const LOG_POLL_INTERVAL_MS = 2000;
const SCROLL_THRESHOLD_PX = 50;
const FETCH_DELAY_AFTER_INPUT_MS = 500;
```

---

## 2. SessionCard.tsx

### 2.1 Bugs

#### BUG-SC-001: Path Splitting May Fail on Mixed Separators
**Severity:** Low
**Location:** Line 74

The regex `/[/\\]/` correctly handles both separators, but if `workdir` is empty or undefined, `.pop()` returns `undefined`.

```tsx
{session.workdir.split(/[/\\]/).pop()}  // May be undefined
```

**Fix:** Add fallback:
```tsx
{session.workdir.split(/[/\\]/).pop() || session.workdir || 'Unknown'}
```

### 2.2 Accessibility Issues

#### A11Y-SC-001: Card Not Keyboard Accessible
**Severity:** High
**Location:** Lines 30-38

The card uses `onClick` but is a `<div>`, making it inaccessible via keyboard.

```tsx
<div
  onClick={onSelect}
  className="... cursor-pointer ..."
>
```

**Fix:** Use `<button>` or add `role="button"`, `tabIndex={0}`, and `onKeyDown` handler:
```tsx
<div
  role="button"
  tabIndex={0}
  onClick={onSelect}
  onKeyDown={(e) => e.key === 'Enter' && onSelect()}
  aria-selected={isSelected}
  ...
>
```

#### A11Y-SC-002: Kill Button Lacks Context
**Severity:** Medium
**Location:** Lines 91-100

The "Kill" button doesn't indicate which session it will terminate.

**Fix:** Add `aria-label={`Kill session ${session.id}`}`.

#### A11Y-SC-003: Status Icons Not Announced
**Severity:** Medium
**Location:** Lines 43-55

`<Play>` and `<Square>` icons have no accessible text alternative.

**Fix:** Add `aria-hidden="true"` to icons and ensure text content is sufficient, or use `<span className="sr-only">`.

#### A11Y-SC-004: Missing Selection State Announcement
**Severity:** Low
**Location:** Lines 30-38

Screen readers don't know when a card is selected.

**Fix:** Add `aria-selected={isSelected}` and wrap cards in a list with `role="listbox"`.

### 2.3 Code Quality

#### CQ-SC-001: Duplicated formatTime Function
**Severity:** Low
**Location:** Lines 15-22

Same helper exists in `SessionLogViewer.tsx`. Extract to shared utility.

#### CQ-SC-002: Inline Style Logic is Complex
**Severity:** Low
**Location:** Lines 32-37

The conditional class logic is hard to read. Consider using `clsx` or `cn` utility.

---

## 3. SpawnAgentDialog.tsx

### 3.1 Bugs

#### BUG-SAD-001: Command Injection via Prompt
**Severity:** High (Security)
**Location:** Lines 90-91

The prompt is inserted directly into the command string without sanitization:

```tsx
const finalCommand = command.replace('{prompt}', prompt);
```

If a user enters a malicious prompt like `"; rm -rf /; echo "`, this becomes:
```
claude -p ""; rm -rf /; echo ""
```

**Fix:** Escape shell special characters or use a safer parameter passing mechanism. At minimum, escape quotes:
```tsx
const escapedPrompt = prompt.replace(/"/g, '\\"').replace(/`/g, '\\`').replace(/\$/g, '\\$');
const finalCommand = command.replace('{prompt}', escapedPrompt);
```

#### BUG-SAD-002: Dropdown Not Closed on Outside Click
**Severity:** Low
**Location:** Lines 150-170

The preset dropdown only closes when a selection is made or the toggle button is clicked. Clicking elsewhere in the dialog doesn't close it.

**Fix:** Add a click-outside handler or close on any dialog interaction.

#### BUG-SAD-003: State Not Reset on Close
**Severity:** Low
**Location:** Lines 69-76

When the dialog is closed and reopened, previous values persist. This may be intentional but could confuse users.

**Fix:** Reset state in `useEffect` when `isOpen` changes to `true`, or document this as intentional.

#### BUG-SAD-004: Workdir Not Validated
**Severity:** Low
**Location:** Lines 210-216

The working directory input accepts any string without validation. Invalid paths will cause spawn failures with unclear error messages.

**Fix:** Validate path existence client-side or show clear error from spawn failure.

### 3.2 Accessibility Issues

#### A11Y-SAD-001: Modal Not Properly Announced
**Severity:** High
**Location:** Lines 102-110

The dialog lacks proper ARIA attributes for modal behavior.

**Fix:**
```tsx
<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="spawn-dialog-title"
  className="..."
>
  ...
  <h2 id="spawn-dialog-title" className="...">Spawn Agent</h2>
```

#### A11Y-SAD-002: Escape Key Doesn't Close Dialog
**Severity:** Medium
**Location:** Component scope

Standard modal behavior expects Escape key to close.

**Fix:** Add `useEffect` with keydown listener for Escape.

#### A11Y-SAD-003: Focus Not Trapped in Modal
**Severity:** High
**Location:** Component scope

Users can Tab out of the modal to elements behind it.

**Fix:** Implement focus trap using a library like `focus-trap-react` or manual implementation.

#### A11Y-SAD-004: Close Button Lacks Label
**Severity:** Medium
**Location:** Lines 117-122

The X button needs an accessible label.

**Fix:** Add `aria-label="Close dialog"`.

#### A11Y-SAD-005: Custom Toggle Not Accessible
**Severity:** High
**Location:** Lines 224-235

The PTY toggle is a custom implementation that lacks:
- `role="switch"`
- `aria-checked` state
- Keyboard support (Space to toggle)
- Associated label via `id`/`htmlFor`

**Fix:**
```tsx
<button
  role="switch"
  aria-checked={usePty}
  aria-labelledby="pty-label"
  onClick={() => setUsePty(!usePty)}
  onKeyDown={(e) => e.key === ' ' && setUsePty(!usePty)}
  className="..."
>
```

#### A11Y-SAD-006: Dropdown Not Keyboard Navigable
**Severity:** Medium
**Location:** Lines 149-170

The preset dropdown doesn't support:
- Arrow key navigation
- Enter/Space to select
- Escape to close

**Fix:** Implement listbox pattern or use a proper combobox component.

### 3.3 Code Quality

#### CQ-SAD-001: AGENT_PRESETS Should Be External Configuration
**Severity:** Low
**Location:** Lines 16-52

Hardcoded presets limit extensibility. Consider loading from configuration file.

#### CQ-SAD-002: Error Handling Only Logs to Console
**Severity:** Medium
**Location:** Lines 94-95

Spawn failures are only logged, not shown to the user.

```tsx
} catch (error) {
  console.error('Failed to spawn agent:', error);
}
```

**Fix:** Show error in UI via toast or inline message.

### 3.4 Security Issues

#### SEC-SAD-001: Command Injection (see BUG-SAD-001)
**Severity:** High
Already documented above.

#### SEC-SAD-002: No Validation of Custom Commands
**Severity:** Medium
**Location:** Lines 190-202

The custom command preset allows arbitrary command execution. While this may be intentional functionality, consider:
- Warning users about security implications
- Optional command allowlist for enterprise deployments
- Logging all spawned commands for audit

---

## 4. Cross-Cutting Issues

### 4.1 Missing Error Boundaries

None of the components have error boundaries. A crash in one component (e.g., bad session data) will crash the entire panel.

**Fix:** Wrap each component in an ErrorBoundary.

### 4.2 No Loading States for Initial Data

`SessionCard` and `SessionLogViewer` don't show skeleton loaders during initial data fetch.

### 4.3 Inconsistent Component Patterns

- `SpawnAgentDialog` has `export default` plus named export
- Other components only have named exports

**Fix:** Standardize on one pattern (prefer named exports).

### 4.4 Missing TypeScript Strict Checks

Several potential null/undefined access patterns would be caught by stricter TypeScript config:
- `session.workdir.split(...)` without null check
- `logRef.current` accessed without null check in some places

---

## 5. Recommendations Summary

### Priority 1 (High - Fix Immediately)
1. **SEC-SAD-001**: Command injection vulnerability in SpawnAgentDialog
2. **A11Y-SC-001**: Make SessionCard keyboard accessible
3. **A11Y-SAD-001/003**: Modal accessibility (role, focus trap)
4. **A11Y-SAD-005**: PTY toggle accessibility

### Priority 2 (Medium - Fix Soon)
1. **BUG-SLV-001**: Stream output memory leak on session change
2. **A11Y-SLV-001**: Button aria-labels
3. **A11Y-SAD-002**: Escape key to close dialog
4. **CQ-SAD-002**: Show spawn errors to users

### Priority 3 (Low - Technical Debt)
1. Extract shared `formatTime` utility
2. Replace magic numbers with constants
3. Add error boundaries
4. Standardize export patterns
5. Close dropdown on outside click

---

## 6. Appendix: Accessibility Checklist

| Criterion | SessionLogViewer | SessionCard | SpawnAgentDialog |
|-----------|-----------------|-------------|------------------|
| Keyboard navigation | Partial | No | Partial |
| Screen reader support | Poor | Poor | Poor |
| Focus management | N/A | N/A | Missing trap |
| Color contrast | OK | OK | OK |
| ARIA attributes | Missing | Missing | Missing |
| Form labels | Missing | N/A | Partial |

---

**End of Review**
