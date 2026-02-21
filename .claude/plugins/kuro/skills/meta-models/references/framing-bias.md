# Meta-Model 4: Framing Bias

> *"Just because it's logical doesn't mean it's right."*

---

## The Core Insight

The way a problem is presented to you shapes how you think about it. A frame is the structure, categories, and assumptions embedded in a description of a problem. Most frames are invisible — you inherit them without realizing it, and they constrain your thinking to a narrow solution space.

The bias isn't having a frame. All thinking requires frames. The bias is not knowing you have one, not questioning it, and not considering alternatives. The person who framed the problem made choices about what to include, what to exclude, and how to categorize things. Those choices may have been wrong, outdated, or optimized for a different goal.

---

## What Framing Bias Detects

- **Inherited categories**: Using someone else's breakdown without questioning it
- **Invisible assumptions**: Premises embedded in the problem description
- **Single perspective lock-in**: Seeing only one way to organize the information
- **Framework over-application**: Using a familiar framework for a problem it doesn't fit
- **Problem definition capture**: Accepting "this is the problem" without checking if that's actually the problem

---

## The Key Question

**"Who framed this problem, and what does that framing assume?"**

When someone presents a problem (including yourself), ask:
- Who decided these are the relevant categories?
- What does this framing include? What does it exclude?
- What would this look like framed differently?
- Is this frame optimized for understanding the problem or for something else?
- What's the problem *behind* the problem?

---

## Software Engineering Examples

### Example 1: "We need a better search"

**Inherited frame**: The problem is search quality. Our search returns bad results. We need better algorithms, better indexing, better ranking.

**Alternative frames**:
- **Navigation frame**: Users aren't searching — they're trying to find something. Maybe better categorization, breadcrumbs, or information architecture would eliminate the need for search.
- **Content frame**: Search results are bad because content is bad. Duplicate content, missing metadata, inconsistent naming. Fix the content, not the search.
- **Intent frame**: Users search because they don't know where things are. Better onboarding, contextual links, or intelligent defaults might reduce search to a fallback mechanism.
- **Question frame**: "Better search" is the *solution* someone proposed. The actual problem might be "users can't find what they need." Those lead to very different investigations.

**Why framing matters**: "Better search" leads you to search algorithms. "Users can't find things" leads you to information architecture, content quality, navigation design, AND search — a much richer solution space.

### Example 2: "The deployment is too slow"

**Inherited frame**: The deployment pipeline is the bottleneck. Optimize CI/CD.

**Alternative frames**:
- **Batch size frame**: Deployments are slow because they're large. Smaller, more frequent deployments would each be fast.
- **Confidence frame**: Deployments are slow because of extensive manual verification. Better automated testing would let you deploy faster with equal confidence.
- **Risk frame**: Deployments feel slow because rollback is scary. If rollback were instant, deployment speed would matter less.
- **Organizational frame**: Deployments are slow because 5 teams need to coordinate. The real issue is coupling between teams, not pipeline speed.

**Why framing matters**: "Optimize CI/CD" is a technical fix. The actual bottleneck might be batch size, test confidence, rollback fear, or organizational coupling — each requiring a fundamentally different intervention.

### Example 3: "We need to reduce tech debt"

**Inherited frame**: Tech debt is bad. We have too much. We need to pay it down.

**Alternative frames**:
- **Investment frame**: Not all debt is bad. Some debt was strategic (ship fast, learn, then fix). The question isn't "reduce debt" but "which debt has the highest interest rate?"
- **Symptom frame**: "Tech debt" might be a symptom of something else — unclear requirements, team churn, no code review, missing architecture decisions. Paying down debt without fixing the cause just creates more debt.
- **Topology frame**: Where is the debt? Concentrated in one module (isolatable) or spread across the codebase (systemic)? The distribution pattern determines the intervention.
- **Cost-of-capital frame**: What's the actual cost of this debt? Some debt costs us hours per week. Some costs us nothing. "Reduce tech debt" treats all debt as equally expensive.

**Why framing matters**: "Reduce tech debt" leads to refactoring sprints. "What debt has the highest interest rate, and why does it keep accumulating?" leads to targeted interventions and process changes.

### Example 4: The SDLC Frame

**The frame**: Software Development Life Cycle — Requirements → Design → Implement → Test → Deploy → Maintain.

**Problems this frame creates**:
- Assumes sequential phases (waterfall thinking, even in "agile" teams)
- Separates "design" from "implementation" (in practice they're interleaved)
- Makes "maintenance" a separate phase (it's actually the majority of all software work)
- Implies a linear flow when the actual process is full of loops and backtracking

**Alternative frames**:
- **Continuous discovery/delivery**: Discovering what to build and building it happen simultaneously
- **Build-measure-learn**: Every cycle is an experiment, not a phase
- **Wardley mapping**: Positioning activities on evolution axis (genesis → custom → product → commodity)

**Why framing matters**: Teams "doing agile" inside an SDLC frame end up doing waterfall in 2-week batches. The frame constrains the thinking even when the methodology tries to escape it.

---

## The Toyota Andon Cord Example

In the 1950s, manufacturing was framed around one assumption: **efficiency = keeping the production line moving**. Every framework for improving manufacturing optimized for uptime.

Toyota reframed: **efficiency = constantly learning**. They gave every worker the ability to stop the entire production line (the Andon cord) whenever they spotted a problem. Supervisors would swarm the issue, diagnose it, and fix the process immediately.

This was heretical within the existing frame. It violated the core assumption. But the reframe led to the lean manufacturing revolution of the 1980s — one of the most significant improvements in production efficiency in history.

The lesson: **The biggest breakthroughs come from reframing, not from optimizing within the existing frame.**

---

## Exercises

### Exercise 1: Frame Identification
Take a problem you're working on:
1. Write down how the problem was presented to you
2. Identify 3 assumptions embedded in that presentation
3. For each assumption, ask "What if this assumption is wrong?"
4. Rewrite the problem statement without those assumptions

### Exercise 2: Forced Reframe
Take a problem and reframe it from 3 different perspectives:
1. **User's frame**: How does the end user experience this problem?
2. **System's frame**: How does the system create this problem?
3. **Business's frame**: What business outcome does solving this problem serve?
4. Compare: which frame leads to the most productive investigation?

### Exercise 3: Frame Source Audit
For any problem description:
1. Who originally framed this problem?
2. What was their role/perspective when they framed it?
3. What would someone with a different role see that they missed?
4. Is the frame optimized for understanding the problem or for something else (e.g., getting budget approval, assigning blame)?

---

## Red Flags in Reasoning

| Phrase | What It Signals |
|--------|----------------|
| "The problem is X" | Problem definition accepted without examination |
| "Everyone thinks about it this way" | Inherited frame, possibly outdated |
| "The framework says..." | Framework may not fit the current problem |
| "We just need to..." | Solution framing masquerading as problem analysis |
| "Obviously the categories are..." | Categories seem natural only within the current frame |
| "The real question is..." | Reframing — this is actually good. Listen carefully. |

---

## When The Current Frame Is Fine

Not every frame needs challenging. Sometimes the frame is appropriate:
- It was explicitly chosen and the choice was justified
- Alternative frames were considered and rejected with reasons
- The frame produces a productive solution space
- People working within the frame are getting good results

**How to tell**: If challenging the frame leads to "we already considered that, here's why we chose this frame," the frame is probably fine. If challenging the frame produces surprise or discomfort, it probably hasn't been examined.

---

## Connection to Other Lenses

- **Nonlinearity**: The frame determines which relationships you see. A different frame reveals different dynamics.
- **Gray Thinking**: Binary frames ("A or B") are a specific type of framing bias
- **Occam's Bias**: The frame determines what gets simplified away (things outside the frame vanish)
- **Anti-Comfort**: Questioning frames is uncomfortable — the current frame feels "natural"
- **Delayed Discomfort**: Using an inherited frame feels easy now. Discovering it was wrong later is expensive.

---

## The Takeaway

The way you think about a problem is 90% of the battle. A great thinker isn't someone with better answers — they're someone who asks better questions, which comes from seeing the problem through better frames.

**Rule of thumb**: If you can only see one way to frame a problem, you're locked in someone else's frame. Find at least one alternative before committing to any analysis.
