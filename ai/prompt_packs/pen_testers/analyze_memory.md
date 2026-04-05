---
id: analyze_memory
name: Pentest Memory Safety Analysis
category: analysis
tool_profile: pentest_analyze
---

# Kuroryuu Pentest Prompt: Memory Safety Analysis

## Objective

Locate user-controlled data paths that reach unsafe memory operations — buffer overflows, heap corruption, use-after-free, double-free, integer overflows, and format string bugs — in C, C++, and unsafe Rust/Go code.

## Inputs

- `Docs/reviews/pentest/<run_id>/recon.md`
- `{{REPO_PATH}}`

## Method

1. Enumerate all memory-unsafe operations: `memcpy`, `memmove`, `strcpy`, `strcat`, `sprintf`, `gets`, `scanf`, raw pointer arithmetic, manual `malloc`/`free` pairs, `realloc` misuse.
2. Trace user-controlled data (network input, file input, environment variables, IPC messages) to each sink.
3. Check for size/bounds validation before the sink: is the check bypassable via integer wrap, sign confusion (signed vs. unsigned comparison), or off-by-one?
4. For heap operations: track allocation lifetimes — is freed memory referenced later? Are there double-free paths via error branches?
5. For format strings: find any `printf`-family call where the format argument is not a string literal.
6. Identify integer arithmetic feeding allocation sizes or copy lengths: multiplication overflow, truncation from 64-bit to 32-bit or to `size_t`.
7. Note compiler mitigations present (ASLR, stack canaries, PIE, RELRO, SafeStack, CFI) — these affect exploitability, not presence of the bug.

## Output Files

- `Docs/reviews/pentest/<run_id>/memory_analysis.md`
- `Docs/reviews/pentest/<run_id>/memory_queue.json`

## Queue Schema

```json
{
  "vulnerabilities": [
    {
      "id": "MEM-001",
      "class": "stack_overflow|heap_overflow|use_after_free|double_free|integer_overflow|format_string|off_by_one",
      "sink": "path/file.ext:line",
      "operation": "memcpy / strcpy / printf / free / etc.",
      "vector": "user-controlled input path",
      "size_control": "attacker-controlled length? yes|partial|no",
      "mitigations": ["ASLR", "canary", "PIE", "RELRO"],
      "confidence": "high|med|low",
      "exploit_hint": "minimal witness"
    }
  ]
}
```
