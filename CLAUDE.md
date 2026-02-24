## Behavioral Rules

- **Tasks:** Use `TaskCreate`/`TaskUpdate` tools — never manually edit `ai/todo.md`. The hook handles formatting and timestamps.
- **Task IDs:** Session-local IDs (#1, #2) from TaskCreate are NOT the same as `ai/todo.md` T### IDs. Read `ai/todo.md` for real IDs when saving checkpoints.
- **Checkpoints:** Append to current checkpoint — don't create new ones each save.
- **TTS:** When Ryan says "speak", "use TTS", or any voice request — use `k_tts(action="speak", text="...")`. No other method.
- **PTY reads:** Use `max_lines=5-10` for `k_pty term_read`. Start small.
- **Null redirection:** This is Windows with bash shell. Use `>/dev/null` not `>nul` (creates literal file).
- **MCP search priority:** When Kuroryuu MCP is connected: k_rag → k_repo_intel → git → Glob/Grep fallback.
- **Deprecated files:** Never use `ai/progress.md` or `ai/feature_list.json`.
