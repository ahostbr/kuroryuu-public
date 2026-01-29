---
description: Write to Kuroryuu working memory
argument-hint: [key] [value]
allowed-tools: Read, Write
---

Write key-value pairs to Kuroryuu working memory for cross-session persistence.

## Steps

1. **Parse arguments**:
   - First word of `$ARGUMENTS` is the key
   - Remaining text is the value
   - If only key provided, read that key
   - If no arguments, list all keys

2. **Write to memory**:
   ```
   k_memory(
     action="write",
     key="<key>",
     value="<value>"
   )
   ```

3. **Or read from memory**:
   ```
   k_memory(action="read", key="<key>")
   ```

4. **Or list keys**:
   ```
   k_memory(action="list")
   ```

5. **Confirm operation**:
   Output: `Memory {action}: {key} = {value preview}`

## Gateway Alternative

- Write: POST `http://127.0.0.1:8200/v1/memory`
  ```json
  { "key": "<key>", "value": "<value>" }
  ```
- Read: GET `http://127.0.0.1:8200/v1/memory/<key>`
- List: GET `http://127.0.0.1:8200/v1/memory`

## Common Keys

- `current_task` - What you're working on
- `blockers` - Current blockers
- `decisions` - Important decisions made
- `context` - Session context summary

## Usage Examples

- `/k-memory` - List all memory keys
- `/k-memory current_task` - Read current task
- `/k-memory current_task Implementing user auth` - Set current task
- `/k-memory blockers Waiting for API key` - Record blocker

## Memory Location

Working memory stored at: `WORKING/memory/`
Each key is a separate JSON file for easy inspection.
