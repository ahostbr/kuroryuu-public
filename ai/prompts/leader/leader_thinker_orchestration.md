---
id: leader_thinker_orchestration
name: Thinker Orchestration
type: leader
version: "1.0"
description: Guide the leader through spawning, monitoring, and synthesizing thinker debates
---

# Leader: Thinker Orchestration

> Use this prompt when you need multiple perspectives on a complex decision.

---

## When to Use Thinkers

Spawn a thinker debate when:
- Architectural decisions have significant trade-offs
- Security-sensitive implementations need adversarial review
- UX decisions could go multiple ways
- You suspect bias confirmation in current thinking
- Team disagreements need structured resolution

Do NOT use thinkers for:
- Simple implementation tasks
- Clear-cut decisions with obvious answers
- Time-critical hotfixes

---

## Phase 1: Topic Selection

Before spawning thinkers, clarify:

1. **What is the decision?** (One sentence)
2. **What are the trade-offs?** (2-3 points per side)
3. **Who would naturally disagree?** (Hints at pairing)
4. **What's the risk of single-perspective bias?**

Example:
```
Decision: Should we use PostgreSQL or keep file-based storage?
Trade-offs:
  PostgreSQL: Scalability, ACID, complex queries vs. operational overhead
  File-based: Simplicity, no dependencies vs. limited querying
Natural disagreement: Visionary (scale!) vs Pragmatist (simplicity wins)
Bias risk: We've been file-based, may be anchored to it
```

---

## Phase 2: Pairing Selection

Choose thinker pair based on decision type:

| Decision Type | Recommended Pair | Why |
|---------------|------------------|-----|
| New feature ideation | visionary + skeptic | Balance innovation with critique |
| Security review | red_team + blue_team | Adversarial testing |
| Architecture decisions | first_principles + systems_thinker | Deep decomposition + holistic view |
| UX decisions | user_advocate + pragmatist | User needs meet implementation reality |
| Conflict resolution | skeptic + synthesizer | Critical analysis feeds integration |
| Stress testing bold ideas | devils_advocate + visionary | Structured opposition |
| Roadmap planning | visionary + pragmatist | Vision meets execution |
| Meta-cognitive review | reasoning_referee + (topic thinker) | Challenge reasoning quality, not conclusions |
| Reasoning quality audit | reasoning_referee + first_principles | Process audit + decomposition check |
| Decision confidence check | reasoning_referee + synthesizer | Challenge premature or comfortable synthesis |
| Bias detection | reasoning_referee + visionary | Is the vision creative or just linear thinking? |

**Persona files:** `ai/prompt_packs/thinkers/`

### When to Include Reasoning Referee

The Reasoning Referee is a special persona that challenges HOW thinkers reason, not WHAT they conclude. Include it when:

- **Reasoning quality matters more than domain coverage** — the other thinkers have enough domain expertise, but you want to ensure their reasoning process is sound
- **You suspect unexamined assumptions** — the debate feels productive but the foundations haven't been stress-tested
- **Consensus came too quickly** — both thinkers agree, and nobody challenged the process
- **Post-debate audit** — after a 2-thinker debate, spawn reasoning_referee to review the synthesis quality

**Key distinction from Devil's Advocate**: The Devil's Advocate argues the opposite position (content-level). The Reasoning Referee audits the reasoning process itself (meta-level). They are complementary, not redundant.

### 3-Thinker Configurations with Reasoning Referee

When using reasoning_referee as a third thinker:

1. **Spawn the two domain thinkers first** — let them establish positions (Round 1)
2. **Spawn reasoning_referee after Round 1-2** — it needs to observe reasoning patterns before intervening
3. **Reasoning Referee enters as process auditor** — it will apply 1-3 relevant meta-cognitive lenses per round
4. **Watch for self-correction** — when domain thinkers start catching their own reasoning flaws, reasoning_referee's job is done

**Recommended 3-thinker configurations:**

| Configuration | Use Case |
|---------------|----------|
| visionary + pragmatist + reasoning_referee | Ensure vision-vs-execution debate has sound reasoning |
| first_principles + systems_thinker + reasoning_referee | Deep analysis with reasoning quality guardrails |
| devils_advocate + visionary + reasoning_referee | Stress-test ideas AND audit the stress-testing process |
| synthesizer + skeptic + reasoning_referee | Ensure synthesis isn't just conflict avoidance |

**Timing for reasoning_referee entry:**
```
Round 1: Domain thinkers establish positions → reasoning_referee observes silently
Round 2: Domain thinkers engage → reasoning_referee may make light observations
Round 3: Reasoning Referee delivers process audit → domain thinkers adjust reasoning
Round 4+: Reasoning Referee yields when thinkers self-correct
```

### Individual Meta-Cognition Thinkers

In addition to the Reasoning Referee (who holds all 6 lenses), each lens has a dedicated specialist thinker. Use these when you want deep, focused application of a single meta-cognitive lens rather than broad process auditing.

| Decision Type | Recommended Pair | Why |
|---------------|------------------|-----|
| Detecting linear thinking | nonlinear_thinker + (topic thinker) | Map actual variable relationships, catch feedback loops and thresholds |
| Breaking binary framing | gray_thinker + (topic thinker) | Find the spectrum between endpoints, reveal intermediate solutions |
| Complexity audit | occams_auditor + first_principles | Ensure decomposition didn't over-simplify, name the black boxes |
| Problem reframing | reframer + visionary | Challenge inherited frames with fresh vision |
| Blind spot detection | comfort_challenger + synthesizer | Challenge comfortable synthesis, probe for unexamined consensus |
| Cognitive debt check | cognitive_debt + pragmatist | Ensure practical plan doesn't defer the hard parts |
| Full reasoning audit | reasoning_referee + (topic thinker) | All 6 lenses, process-level challenge |

**When to use specialists vs. Reasoning Referee:**

- **Reasoning Referee**: Best when you want broad process auditing across multiple lenses. It applies whichever 1-3 lenses are most relevant per round.
- **Individual specialists**: Best when you already know which cognitive blind spot is most relevant. They go deeper into their single lens than the Reasoning Referee would.

**Specialist 3-thinker configurations:**

| Configuration | Use Case |
|---------------|----------|
| visionary + pragmatist + nonlinear_thinker | Catch linear assumptions in vision-vs-execution debates |
| first_principles + pragmatist + occams_auditor | Ensure practical decomposition didn't hide complexity |
| visionary + skeptic + reframer | Challenge inherited frames in innovation debates |
| synthesizer + pragmatist + comfort_challenger | Stress-test comfortable consensus in planning |
| visionary + first_principles + cognitive_debt | Prevent bold plans from deferring hard decisions |
| skeptic + pragmatist + gray_thinker | Break binary framing in technical decision-making |

---

## Phase 3: Spawn Debate

### Step 1: Read the prompts
```python
visionary_prompt = k_files(action="read", path="ai/prompt_packs/thinkers/_base_thinker.md")
visionary_persona = k_files(action="read", path="ai/prompt_packs/thinkers/visionary.md")

skeptic_prompt = k_files(action="read", path="ai/prompt_packs/thinkers/_base_thinker.md")
skeptic_persona = k_files(action="read", path="ai/prompt_packs/thinkers/skeptic.md")
```

### Step 2: Spawn via k_pty
```python
# Spawn first thinker
k_pty(action="spawn_cli", cli_provider="claude", role="worker",
      custom_prompt=visionary_prompt + "\n\n" + visionary_persona)

# Spawn second thinker
k_pty(action="spawn_cli", cli_provider="claude", role="worker",
      custom_prompt=skeptic_prompt + "\n\n" + skeptic_persona)
```

### Step 3: Inject debate topic
```python
# Wait for thinkers to initialize (~5 seconds)
# Then inject the topic to the first thinker

k_thinker_channel(action="send_line", target_agent_id="visionary_001",
                  data="""DEBATE TOPIC:

Should we use PostgreSQL or keep file-based storage for the Kuroryuu project?

Context:
- Current: File-based JSONL storage
- Scale: Expected 10-50 concurrent users initially
- Queries: Need search, but mostly key-value access

Please begin the debate. 3 rounds maximum.""")
```

---

## Phase 4: Monitor Debate

### Watch for convergence signals
Take periodic screenshots to observe the debate:
```python
k_capture(action="get_latest")
```

Look for in thinker output:
- "I think we're converging on something here..."
- "We seem to agree that..."
- "**SYNTHESIS ATTEMPT**"

### Convergence timing
- **Round 1-2**: Position establishment, expect disagreement
- **Round 2-3**: Nuance and acknowledgment of valid points
- **Round 3+**: Synthesis attempts, look for convergence

### If stuck after 3 rounds
Inject redirection:
```python
k_thinker_channel(action="send_line", target_agent_id="visionary_001",
                  data="LEADER: Please attempt synthesis now. What's the middle ground?")
```

---

## Phase 5: Extract Synthesis

When debate concludes:

1. **Read both terminals** via k_capture
2. **Identify key insights** from each thinker
3. **Note points of agreement**
4. **Note remaining tensions**
5. **Make your decision** as Leader

### Synthesis template
```markdown
## Thinker Debate Summary

**Topic:** [Original question]
**Pairing:** [Thinker A] + [Thinker B]
**Rounds:** [N]

### Insights from [Thinker A]
- [Key point 1]
- [Key point 2]

### Insights from [Thinker B]
- [Key point 1]
- [Key point 2]

### Points of Agreement
- [Shared insight]

### Remaining Tension
- [Unresolved aspect]

### Leader Decision
[Your final call with rationale]
```

---

## Phase 6: Record Outcome

Log the debate result to collective intelligence:

```python
k_collective(
    action="record_success",
    task_type="thinker_debate",
    approach="visionary_skeptic_pairing",
    evidence="Converged on hybrid approach: file-based for MVP, migration path to PostgreSQL designed"
)
```

---

## Quick Reference

### Spawn Commands
```python
k_pty(action="spawn_cli", cli_provider="claude", role="worker", custom_prompt="...")
k_thinker_channel(action="send_line", target_agent_id="...", data="...")
```

### Monitor Commands
```python
k_capture(action="get_latest")
k_thinker_channel(action="read", target_agent_id="...", timeout_ms=5000)
```

### Pairings
| Use Case | Pair |
|----------|------|
| Innovation | visionary + skeptic |
| Security | red_team + blue_team |
| Architecture | first_principles + systems_thinker |
| UX | user_advocate + pragmatist |
| Reasoning audit | reasoning_referee + (topic thinker) |
| Decision confidence | reasoning_referee + synthesizer |
| Linear thinking check | nonlinear_thinker + (topic thinker) |
| Binary framing check | gray_thinker + (topic thinker) |
| Complexity audit | occams_auditor + first_principles |
| Problem reframing | reframer + visionary |
| Blind spot detection | comfort_challenger + synthesizer |
| Cognitive debt check | cognitive_debt + pragmatist |

### Personas Location
`ai/prompt_packs/thinkers/`
