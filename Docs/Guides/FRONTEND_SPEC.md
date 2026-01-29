# Frontend Creation Spec — Kuroryuu UI

**Prepared:** 2026-01-06  
**Phase:** BUILD_15 (Frontend)  
**Backend Status:** ✅ All 15/15 tests passing

---

## Overview

Create a minimal chat UI that connects to the Kuroryuu Gateway for the vertical slice demo (F001).

## Backend Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/v1/health` | GET | Health check |
| `/v1/harness` | GET | Get harness state (todo, feature_list) |
| `/v1/hooks` | GET | List registered hooks |
| `/v2/chat/stream` | POST | SSE chat streaming |

**Base URL:** `http://127.0.0.1:8200`

---

## Feature Requirements (F001 Acceptance)

1. ✅ Gateway streams tokens to UI
2. ✅ rag.query tool invoked successfully  
3. ⬜ Tool result displayed in UI
4. ⬜ Progress entry appended

---

## UI Components

### 1. Chat Interface
- Message input field
- Send button
- Message history (user/assistant bubbles)
- Streaming token display

### 2. Harness Panel (Optional)
- Active feature display
- Todo list from harness state
- Hook indicators

### 3. Status Bar
- Connection status (Gateway health)
- Active session indicator

---

## Technical Approach Options

### Option A: Vanilla HTML/JS (Recommended for hackathon)
```
apps/
  frontend/
    index.html      # Single-page app
    app.js          # Chat logic + SSE handling
    style.css       # Minimal styling
```

**Pros:** Zero build step, instant reload, simple  
**Cons:** No component reuse, manual DOM manipulation

### Option B: React/Vite
```
apps/
  frontend/
    package.json
    src/
      App.tsx
      components/
        Chat.tsx
        Harness.tsx
```

**Pros:** Component model, TypeScript  
**Cons:** Build step, more setup time

### Option C: Svelte
**Pros:** Minimal bundle, reactive  
**Cons:** Less familiar, build step

---

## Recommended: Option A (Vanilla)

For hackathon speed, vanilla HTML/JS with:
- Fetch API for REST calls
- EventSource for SSE streaming
- CSS Grid/Flexbox for layout
- No build step required

---

## Chat Stream Integration

### Request Format
```javascript
const response = await fetch('http://127.0.0.1:8200/v2/chat/stream', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messages: [{ role: 'user', content: userMessage }],
    model: 'claude-3-5-sonnet-20241022',
    stream: true
  })
});

// SSE parsing
const reader = response.body.getReader();
const decoder = new TextDecoder();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const chunk = decoder.decode(value);
  // Parse SSE events: data: {...}
}
```

### SSE Event Types
```
data: {"type": "text_delta", "content": "Hello"}
data: {"type": "tool_call", "name": "rag.query", "arguments": {...}}
data: {"type": "tool_result", "content": "..."}
data: {"type": "done"}
```

---

## File Structure (Proposed)

```
apps/
  frontend/
    index.html          # Main page
    app.js              # Application logic
    style.css           # Styles
    README.md           # Frontend docs
```

---

## Startup Integration

Add to `run_all.ps1`:
```powershell
# Optionally serve frontend
if ($ServeFrontend) {
    Start-Process python -ArgumentList "-m http.server 3000 -d apps/frontend"
}
```

Or use Gateway to serve static files (add route).

---

## Next Actions

1. [ ] Create `apps/frontend/` directory
2. [ ] Build `index.html` with chat layout
3. [ ] Implement `app.js` with SSE streaming
4. [ ] Style with `style.css`
5. [ ] Test vertical slice: User → Gateway → LLM → Tool → UI
6. [ ] Update F001 status to `done`

---

## Success Criteria

- User can type message and see streaming response
- Tool calls are visible in UI (at minimum logged)
- Tool results displayed inline
- No JavaScript errors in console
- Works in Chrome/Edge/Firefox
