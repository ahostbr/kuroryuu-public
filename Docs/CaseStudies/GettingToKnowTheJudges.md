# Getting To Know The Judges — Cole Medin Intel

> **Purpose**: Intel doc for Dynamous × Kiro Hackathon (Jan 5-23, 2026)  
> **Prize Pool**: $17,000 ($5k 1st, $3k 2nd, $2k 3rd, $1k 4th-10th)

---

## Cole Medin — Primary Judge

### Philosophy (Direct Quotes)

> **"Context Engineering > Prompt Engineering > Vibe Coding"**

Cole explicitly values **original systems over templates**:
> "If you're taking something like the BMAD method or GitHub spec kit or your own custom system... it is always optimal to apply it specifically to your codebase."

### What He Values

| Signal | Evidence |
|--------|----------|
| **Original architectures** | Archon (13.5k★) — his own MCP + knowledge system |
| **Context as first-class citizen** | context-engineering-intro (12.1k★) — PRP workflow |
| **Real-world value** | Dynamous credits API = production dogfooding |
| **Transparent process** | Devlog format: time blocks, challenges/solutions, personality |

### Key Repositories

| Repo | Stars | Relevance |
|------|-------|-----------|
| `coleam00/Archon` | 13.5k | MCP server for knowledge + task management — validates our approach |
| `coleam00/context-engineering-intro` | 12.1k | PRP (Product Requirements Prompt) workflow |
| `coleam00/dynamous-kiro-hackathon` | Template | **Official hackathon starter** — Innovation pts INCREASED to 15 |
| `coleam00/mcp-crawl4ai-server` | MCP | Web crawling server — MCP ecosystem validation |

---

## Updated Judging Rubric (100 pts)

> ⚠️ **Innovation increased from 10 → 15 pts** in official template (differs from transcript)

| Criteria | Points | Breakdown |
|----------|--------|-----------|
| **Application Quality** | 40 | Functionality 15, Real-World Value 15, Code Quality 10 |
| **Kiro CLI Usage** | 20 | Effective Features 10, Custom Commands 7, Innovation 3 |
| **Documentation** | 20 | Completeness 9, Clarity 7, Process Transparency 4 |
| **Innovation** | 15 | Uniqueness 8, Creative Problem-Solving 7 |
| **Presentation** | 5 | Demo Video 3, README 2 |

---

## What Kuroryuu Does Well (Cole's Lens)

### ✅ Original System (Innovation = 15 pts)
- **Hooks framework** — Kiro CLI–compatible, not a template clone
- **todo_sot_enforcer** — Mandatory todo.md source-of-truth
- **Harness context injection** — Automatic progress tracking
- **Checkpoint/harness integration** — Unique to Kuroryuu

### ✅ MCP Expertise (validates via Archon)
- 11 tools across RAG/Inbox/Checkpoint
- JSON-RPC 2.0 protocol compliance
- Provider-agnostic backend (Claude SDK + LM Studio)

### ✅ Real-World Value
- Solves "agent drift" problem with enforced todo tracking
- Works across any repo (not SOTS-specific)
- Self-documenting via harness progress.md

---

## Gaps To Address

| Gap | Impact | Fix |
|-----|--------|-----|
| Demo video missing | -3 pts (Presentation) | Record 2-min demo |
| DEVLOG depth | -8 pts (Documentation) | Rewrite with Cole's style |
| README quickstart | -2 pts | Docker one-liner |

---

## Cole's PIV Loop (What He'll Look For)

1. **@prime** — Did you load project context systematically?
2. **@plan-feature** — Are plans structured markdown?
3. **@execute** — Did you use validation tools?
4. **@code-review** — Self-evaluation evidence?
5. **@code-review-hackathon** — Rubric self-scoring?
6. **Devlog** — Challenges/solutions documented with personality?
7. **System Evolution** — Did steering docs evolve based on learnings?

---

## Devlog Style Signals (from dev.to examples)

- 🕐 **Time-per-session blocks** ("Session 1 [2h]: 14:00-16:00")
- 🎯 **Explicit emoji headers** (🔧 Fix, ⚡ Feature, 🐛 Bug)
- 💬 **Personality/voice** ("This one was tricky...")
- 🚧 **Challenges with solutions** (not just "fixed X")
- 📊 **Stats** (lines added, files touched, test coverage)
- 🤖 **Kiro CLI callouts** ("Used `/plan` to structure the approach")

---

## Score Estimate

| Criteria | Current | Target | Delta |
|----------|---------|--------|-------|
| App Quality | 32/40 | 36/40 | +4 |
| Kiro CLI | 18/20 | 17/20 | +5 |
| Documentation | 14/20 | 18/20 | +4 |
| Innovation | 12/15 | 14/15 | +2 |
| Presentation | 2/5 | 5/5 | +3 |
| **TOTAL** | **92/100** | **90/100** | **+18** |

---

*Last updated: 2026-01-23 23:00 by Kiro (claude-opus-4)*
