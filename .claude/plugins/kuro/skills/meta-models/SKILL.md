---
name: Meta-Models
description: This skill should be used when the user asks to "challenge my thinking", "check my reasoning", "am I being linear", "reframe this", "what am I missing", "find blind spots", "what could make me wrong", "reasoning quality check", "meta-cognitive review", "audit my reasoning", "check for bias", "is my logic sound", or needs help applying meta-cognitive frameworks to evaluate HOW they think about a problem rather than WHAT they think. Does NOT trigger on "devil's advocate" (use devils_advocate persona instead).
version: 1.0.0
---

# 6 Meta-Models for Thinking

> *Mental models tell you WHAT to think. Meta-models tell you HOW to think.*
> *These sit above all other frameworks and catch reasoning flaws before they compound.*

---

## Quick Reference

| # | Lens | Core Question | Detects |
|---|------|---------------|---------|
| 1 | **Nonlinearity** | Is the relationship what you assume? | Linear causal thinking |
| 2 | **Gray Thinking** | Where is the spectrum? | False dichotomies |
| 3 | **Occam's Bias** | What did simplification cost? | Over-simplification |
| 4 | **Framing Bias** | Who framed this and what does it assume? | Invisible frames |
| 5 | **Anti-Comfort** | What should make you uncomfortable? | Comfortable blind spots |
| 6 | **Delayed Discomfort** | Are you deferring hard thinking? | Cognitive debt |

---

## When to Apply

Apply these meta-models **before** choosing a mental model, **during** analysis to catch reasoning drift, and **after** reaching a conclusion to stress-test it.

### High-Value Situations
- Architectural decisions with long-term consequences
- Plans that "feel right" but haven't been challenged
- Decisions where everyone agrees (suspiciously easy consensus)
- Problems that keep recurring despite "solutions"
- Any time you catch yourself saying "it's simple" about something complex

### Low-Value Situations
- Trivial, reversible decisions
- Well-understood problems with established solutions
- Time-critical emergencies where any action beats analysis

---

## Application Pattern

### Quick Scan (2 minutes)
Run through all 6 questions mentally. Note which lenses trigger concern.

1. Am I assuming a linear relationship? (Nonlinearity)
2. Am I forcing a binary choice? (Gray Thinking)
3. What did I lose when I simplified? (Occam's Bias)
4. Who framed this problem and why? (Framing Bias)
5. What about this should make me uncomfortable? (Anti-Comfort)
6. Am I deferring the hard thinking to later? (Delayed Discomfort)

### Deep Dive (per lens, when triggered)
Pick 1-3 lenses that triggered. For each:
1. **Name the pattern** — What specific reasoning flaw might be present?
2. **Find evidence** — Where in the reasoning does this pattern appear?
3. **Challenge it** — What would the reasoning look like without this flaw?
4. **Restate** — Reformulate the position with the flaw corrected.

### Output Format (for structured reviews)
```markdown
## Meta-Model Review: [Topic]

### Lens: [Name]
- **Pattern detected:** [What reasoning flaw was found]
- **Evidence:** [Where it appears in the reasoning]
- **Severity:** Critical | Important | Minor
- **Challenge:** [Question that exposes the flaw]
- **Reframe:** [How the reasoning should change]

### Overall Reasoning Quality: [A-F]
[Brief assessment of reasoning PROCESS, not conclusion correctness]
```

---

## The 6 Lenses (Summary)

### 1. Nonlinearity
**Core insight:** Your brain craves linear cause-and-effect. Reality is a web of interacting factors.

**Red flags:** "If we do X, then Y will happen." "A leads to B." Step-by-step chains with no branches or feedback loops.

**Exercise:** Map all variables. Draw connections between them. If your map looks like a straight line, you're not seeing reality.

> See: `references/nonlinearity.md`

### 2. Gray Thinking
**Core insight:** Most things exist on a spectrum. Binary framing ("either A or B") is almost always a false dichotomy.

**Red flags:** "Should we do A or B?" "It's either fast or good." "We have to choose between X and Y."

**Exercise:** When you see a binary choice, ask "What's the spectrum between these endpoints?" and "Can we have elements of both?"

> See: `references/gray-thinking.md`

### 3. Occam's Bias
**Core insight:** Simplification is necessary but costly. Every time you simplify, you're choosing to ignore something — and that something might matter.

**Red flags:** "It's basically just X." "Let's not overcomplicate this." "The simple answer is..." Feeling of relief after simplifying a complex problem.

**Exercise:** Name your black boxes. What did you cut away? What risk does that expose? Can you at least acknowledge what you don't know?

> See: `references/occams-bias.md`

### 4. Framing Bias
**Core insight:** The way a problem is presented to you shapes how you think about it. Just because it's logical doesn't mean the frame is right.

**Red flags:** Accepting the first framing of a problem. Using inherited categories without questioning them. "Everyone thinks about it this way."

**Exercise:** Force yourself to find at least one alternative way to frame the problem. If you can only see one framing, you're locked in.

> See: `references/framing-bias.md`

### 5. Anti-Comfort
**Core insight:** Comfort in your reasoning is a warning sign. If your conclusion feels easy and reassuring, you may be missing something.

**Red flags:** Feeling confident without having been challenged. Arriving at a conclusion that confirms what you already believed. No discomfort during analysis.

**Exercise:** Ask "What should make me uncomfortable about this conclusion?" and "What would someone who disagrees say?"

> See: `references/anti-comfort.md`

### 6. Delayed Discomfort
**Core insight:** Avoiding hard thinking now creates harder problems later. The discomfort doesn't disappear — it compounds with interest.

**Red flags:** "We'll figure that out later." "Let's just ship it and see." Choosing the easy path because the hard path "takes too long." Creating TODO items for the hard parts.

**Exercise:** Ask "Am I deferring this because it's strategically correct, or because it's uncomfortable?" If the latter, pay the cost now.

> See: `references/delayed-discomfort.md`

---

## Key Distinction: Meta-Models vs. Devil's Advocate

| | Devil's Advocate | Meta-Models |
|--|-----------------|-------------|
| **Level** | Content (argues opposite position) | Process (audits reasoning quality) |
| **Question** | "What if you're wrong about X?" | "How did you arrive at X? Is that reasoning sound?" |
| **Output** | Strengthened or abandoned position | Upgraded reasoning process |
| **Trigger** | "play devil's advocate" | "check my reasoning", "what am I missing" |

The Devil's Advocate challenges WHAT you think. Meta-models challenge HOW you think.

---

## Detailed References

For deep dives with exercises, software engineering examples, and detailed application guidance:

- `references/nonlinearity.md` — Detecting and correcting linear thinking
- `references/gray-thinking.md` — Finding the spectrum in false dichotomies
- `references/occams-bias.md` — Understanding the cost of simplification
- `references/framing-bias.md` — Breaking free of inherited frames
- `references/anti-comfort.md` — Using discomfort as a reasoning signal
- `references/delayed-discomfort.md` — Recognizing and resolving cognitive debt
