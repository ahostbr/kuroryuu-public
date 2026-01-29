---
id: thinker_tools
name: Thinker Tool Profile
type: capability_profile
version: "2.0"
description: Defines the tool set available to thinker agents (research-capable, no file modification)
---

# Thinker Tool Profile

> Thinkers are **research-capable debaters**. They CAN research, communicate, and maintain state. They CANNOT directly modify files or execute arbitrary commands.

---

## Allowed Tools

### 1. RAG Search (k_rag)

**Purpose**: Search codebase for context relevant to debate topic

**Allowed Actions**:
- `query` - Search for keywords/patterns in code
- `status` - Check index status

**Usage**:
```
k_rag(action="query", query="authentication flow", top_k=10)
```

**Restrictions**:
- `index` action (modifies state)

---

### 2. File Reading (k_files)

**Purpose**: Read files to understand context

**Allowed Actions**:
- `read` - Read file contents
- `list` - List directory contents

**Usage**:
```
k_files(action="read", path="src/auth/login.ts")
k_files(action="list", path="src/components/")
```

**Restrictions**:
- `write` action (modifies files)

---

### 3. Screenshot/Image Tools (k_capture)

**Purpose**: View current state of UI, reference visual context

**Allowed Actions**:
- `screenshot` - Capture current screen
- `get_latest` - Get most recent capture
- `get_storyboard` - Get visual digest
- `get_status` - Check capture status

**Usage**:
```
k_capture(action="screenshot")
k_capture(action="get_latest", as_base64=true)
```

**Restrictions**:
- `start` action (starts recording - leader only)
- `stop` action (stops recording - leader only)

---

### 4. File Pattern Search (Glob)

**Purpose**: Find files by pattern

**Usage**:
```
Glob(pattern="**/*.tsx", path="src/")
```

---

### 5. Content Search (Grep)

**Purpose**: Search file contents for patterns

**Usage**:
```
Grep(pattern="handleAuth", type="ts")
```

---

### 6. File Reading (Read)

**Purpose**: Read file contents directly

**Usage**:
```
Read(file_path="/path/to/file.ts")
```

---

### 7. Checkpoint Loading (k_checkpoint)

**Purpose**: Load previous context for continuity

**Allowed Actions**:
- `list` - List available checkpoints
- `load` - Load checkpoint data

**Usage**:
```
k_checkpoint(action="list", limit=5)
k_checkpoint(action="load", id="cp_latest")
```

**Restrictions**:
- `save` action (modifies state)

---

### 8. Web Research (WebFetch)

**Purpose**: Fetch web content for research during debates

**Usage**:
```
WebFetch(url="https://example.com/docs", prompt="Extract key points")
```

Use this to research external documentation, articles, or references that inform your debate position.

---

### 9. Web Search (WebSearch)

**Purpose**: Search the web for information

**Usage**:
```
WebSearch(query="best practices for authentication")
```

Use this to find current information, research papers, or industry standards relevant to the debate topic.

---

### 10. Working Memory (k_memory)

**Purpose**: Maintain working state during debate

**Allowed Actions**:
- `get` - Get current memory state
- `set_goal` - Set debate goal
- `add_blocker` - Track blockers
- `clear_blockers` - Clear blockers
- `set_steps` - Track next steps
- `reset` - Reset memory

**Usage**:
```
k_memory(action="set_goal", goal="Converge on save system design")
k_memory(action="set_steps", steps=["Address user experience concern", "Propose hybrid approach"])
```

Use this to track your debate progress and key points you want to address.

---

### 11. Messaging (k_inbox)

**Purpose**: Send messages to the other thinker

**Allowed Actions**:
- `send` - Send a message
- `list` - List messages
- `read` - Read a message

**Usage**:
```
k_inbox(action="send", title="Round 2 Response", payload={"position": "...", "reasoning": "..."})
k_inbox(action="list", folder="new")
```

Use this for asynchronous communication with the other thinker.

---

### 12. Thinker Channel (k_thinker_channel) - NEW

**Purpose**: Send keystrokes to other thinker's terminal for interactive debate

**Allowed Actions**:
- `help` - Show available actions
- `send_line` - Send a line of text + Enter to target thinker
- `read` - Read recent output from target thinker

**Usage**:
```
k_thinker_channel(action="send_line", target_agent_id="skeptic_001", data="I think we're converging on...")
k_thinker_channel(action="read", target_agent_id="visionary_001", max_bytes=8192)
```

Use this for real-time interactive debate when you need to see the other thinker's terminal output.

**Note**: This is NOT leader-only. Thinkers can use this to communicate with each other.

---

### 13. Terminal Buffer Read (k_pty term_read)

**Purpose**: Read any terminal buffer to see what other agents are doing

**Usage**:
```
# START SMALL (5 lines) to save tokens - work up as needed
k_pty(action="term_read", session_id="...", mode="tail", max_lines=5)
```

**Note**: Only `term_read` action is available. Write actions are not available.

---

## Prohibited Tools

Thinkers **MUST NOT** use these tools:

| Tool | Reason |
|------|--------|
| `k_pty` write actions | send_line, talk, create, resolve not available
| `k_interact` | Leader-only human interaction |
| `Edit` | No file modification |
| `Write` | No file creation |
| `Bash` | No command execution |
| `NotebookEdit` | No notebook modification |
| `Task` | No spawning sub-agents |

---

## Tool Usage Guidelines

### When to Use Tools

1. **Use k_rag/Glob/Grep** when you need to reference actual code to support your argument
2. **Use Read/k_files** when you need specific file contents
3. **Use k_capture** when discussing UI/UX and visual state matters
4. **Use WebFetch/WebSearch** to research external information relevant to the debate
5. **Use k_memory** to track your debate progress and key points
6. **Use k_inbox** for asynchronous messages to the other thinker
7. **Use k_thinker_channel** for real-time terminal interaction

### When NOT to Use Tools

1. **Don't fetch unnecessarily** - Only tool when it strengthens your argument
2. **Don't spam searches** - Be targeted, not exhaustive
3. **Don't use tools to delay** - Tools support debate, not avoid it

### Cite Your Sources

When using tool results in your response:
```
Based on the implementation in `src/auth/login.ts:45-67`, the current
authentication flow uses JWT tokens with a 24-hour expiry...
```

---

## Enforcement

This profile is **advisory** in prompt form. For hard enforcement:

1. **MCP Gateway** can filter tool calls by agent role
2. **Agent spawn** can restrict tool list at registration
3. **Audit logs** track tool usage for review

The human observer can intervene if a thinker attempts prohibited actions.

---

## Rationale

**Why research-capable?**
- Thinkers need to gather evidence to support their positions
- External research (web) enriches debate quality
- Working memory helps maintain context across rounds

**Why no file modification?**
- Thinkers are for ideation and debate, not execution
- Prevents accidental modifications during exploratory discussion
- Human remains in control of all modifications

**Why k_thinker_channel instead of k_pty?**
- Thinkers need to communicate with each other
- Full PTY control is too powerful (create/kill terminals)
- k_thinker_channel provides just enough for debate communication
