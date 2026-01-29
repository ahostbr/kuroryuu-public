# Kuroryuu Thinker System

> Multi-perspective reasoning through structured AI debates.

---

## Overview

The Thinker System enables **structured debates** between specialized AI personas to explore complex decisions from multiple angles. Instead of single-perspective analysis, thinkers engage in round-based dialogue to surface insights that might be missed by individual reasoning.

**Key Principle:** The goal is not to "win" the debate but to produce valuable insights through intellectual exchange.

---

## Available Thinkers

### Exploration Category
| Thinker | Style | Good For |
|---------|-------|----------|
| **Visionary** | Expansive | Possibilities, innovation, future thinking |
| **Devil's Advocate** | Contrarian | Stress-testing, challenging assumptions |

### Evaluation Category
| Thinker | Style | Good For |
|---------|-------|----------|
| **Skeptic** | Critical | Rigorous analysis, evidence demands |
| **First Principles** | Deconstructive | Fundamental reasoning, breaking down complexity |

### Execution Category
| Thinker | Style | Good For |
|---------|-------|----------|
| **Pragmatist** | Grounded | Feasibility, practical constraints |
| **Systems Thinker** | Holistic | Interconnections, feedback loops, emergent behavior |

### Integration Category
| Thinker | Style | Good For |
|---------|-------|----------|
| **Synthesizer** | Integrative | Finding common ground, conflict resolution |

### Security Category
| Thinker | Style | Good For |
|---------|-------|----------|
| **Red Team** | Adversarial | Attack simulation, vulnerability discovery |
| **Blue Team** | Protective | Defense design, mitigation strategies |

### Experience Category
| Thinker | Style | Good For |
|---------|-------|----------|
| **User Advocate** | Empathetic | User perspective, accessibility, UX |

---

## Recommended Pairings

| Use Case | Pair | Why |
|----------|------|-----|
| Feature ideation | visionary + skeptic | Balance innovation with critique |
| Vision to execution | visionary + pragmatist | Ambitious ideas meet practical grounding |
| Security review | red_team + blue_team | Attack meets defense |
| Deep analysis | first_principles + systems_thinker | Decomposition meets integration |
| Stress testing | devils_advocate + visionary | Bold ideas face structured opposition |
| Feature design | user_advocate + pragmatist | User needs meet implementation reality |
| Conflict resolution | skeptic + synthesizer | Critical analysis feeds integration |

---

## Debate Protocol

### Round Structure

Each debate consists of 3-5 rounds:

1. **Round 1**: Initial positions established
2. **Round 2**: Counter-arguments and nuance
3. **Round 3**: Acknowledgment of valid points
4. **Round 4+**: Synthesis attempts

### Response Format

Each thinker response follows this structure:

```markdown
**[Persona Name]** - Round N

[ACKNOWLEDGE]
Brief acknowledgment of the other perspective

[POSITION]
Main argument (2-4 paragraphs)

[REASONING]
Why this position (bullet points)

[FORWARD]
Question for continued dialogue
```

### Convergence Signals

Look for these phrases indicating synthesis:
- "I think we're converging on something here..."
- "What I'm hearing across our exchange is..."
- "We seem to agree that..."
- "**SYNTHESIS ATTEMPT**"

---

## Integration Points

### Leader Role

Leaders orchestrate thinker debates:

1. **Spawn thinkers** via `k_pty(action="spawn_cli")`
2. **Inject topics** via `k_thinker_channel(action="send_line")`
3. **Monitor debate** via `sots_capture(action="get_latest")`
4. **Extract synthesis** and make final decision
5. **Record outcome** to `k_collective`

See: `ai/prompts/leader/leader_thinker_orchestration.md`

### Worker Role

Workers can consult existing thinkers:

1. **Send questions** via `k_thinker_channel(action="send_line")`
2. **Read responses** via `k_thinker_channel(action="read")`
3. Workers **CANNOT spawn** new thinkers (leader-only)

See: `KURORYUU_WORKER.md` Section 11

### Tool Access

Thinkers have **research-only** access:

| Allowed | Purpose |
|---------|---------|
| `k_rag` (query, status) | Search codebase |
| `k_files` (read, list) | Read files |
| `k_checkpoint` (list, load) | Load context |
| `sots_capture` | View screenshots |
| `Glob`, `Grep`, `Read` | File operations |
| `WebFetch`, `WebSearch` | Research |
| `k_memory` | Working state |
| `k_inbox` (send, list, read) | Messaging |
| `k_thinker_channel` | Inter-thinker communication |

| Prohibited | Reason |
|------------|--------|
| `k_interact` | Leader-only |
| `Edit`, `Write`, `Bash` | No modifications |
| `Task` | No spawning |

| Available | Purpose |
|-----------|---------|
| `k_pty` | Direct real-time dialogue with other thinkers (PRIMARY for debate) |

---

## Quick Start

### For Leaders: Spawn a Debate

```python
# 1. Read prompts
base = k_files(action="read", path="ai/prompt_packs/thinkers/_base_thinker.md")
visionary = k_files(action="read", path="ai/prompt_packs/thinkers/visionary.md")
skeptic = k_files(action="read", path="ai/prompt_packs/thinkers/skeptic.md")

# 2. Spawn thinkers
k_pty(action="spawn_cli", cli_provider="claude", role="worker",
      custom_prompt=base + "\n\n" + visionary)
k_pty(action="spawn_cli", cli_provider="claude", role="worker",
      custom_prompt=base + "\n\n" + skeptic)

# 3. Inject topic
k_thinker_channel(action="send_line", target_agent_id="visionary_001",
                  data="DEBATE TOPIC: Should we use PostgreSQL or file-based storage?")

# 4. Monitor
sots_capture(action="get_latest")
```

### For Workers: Consult a Thinker

```python
# Send question to existing thinker
k_thinker_channel(action="send_line", target_agent_id="skeptic_001",
                  data="Quick check: Is this approach sound?")

# Read response
k_thinker_channel(action="read", target_agent_id="skeptic_001", timeout_ms=10000)
```

---

## File Locations

| File | Purpose |
|------|---------|
| `ai/prompt_packs/thinkers/` | All thinker personas |
| `ai/prompt_packs/thinkers/_base_thinker.md` | Base protocol (all thinkers inherit) |
| `ai/prompt_packs/thinkers/_tool_profile.md` | Tool access rules |
| `ai/prompt_packs/thinkers/index.json` | Persona catalog and pairings |
| `ai/prompts/leader/leader_thinker_orchestration.md` | Leader orchestration guide |

---

## Best Practices

1. **Choose the right pairing** - Match personas to decision type
2. **Clear topic framing** - One decision, explicit trade-offs
3. **Let debate run** - Don't intervene too early (3 rounds minimum)
4. **Watch for convergence** - Synthesis signals indicate completion
5. **Record outcomes** - Log to k_collective for future reference
6. **Don't overuse** - Reserve for genuinely complex decisions
