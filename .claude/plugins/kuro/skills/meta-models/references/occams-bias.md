# Meta-Model 3: Occam's Bias

> *"Reality doesn't owe it to you to be simple."*

---

## The Core Insight

Occam's Razor says "the simplest explanation is usually correct." Occam's Bias is what happens when you apply this too aggressively: you simplify away crucial variables because thinking about them is hard. Every simplification has a cost — you're choosing to ignore something, and that something might matter.

The bias isn't simplification itself. Simplification is essential. The bias is *unconscious* simplification — not knowing what you cut away, not understanding the risk you created, not even recognizing that you simplified at all.

---

## What Occam's Bias Detects

- **Over-attribution**: Forcing multiple symptoms to fit a single cause
- **Unconscious simplification**: Not knowing what was cut away
- **Comfort-driven reduction**: Simplifying because the full picture is overwhelming
- **Lost variables**: Factors that were removed from analysis without evaluating their importance
- **False confidence**: Feeling certain about a simplified model that discarded crucial details

---

## The Key Question

**"What did simplification cost?"**

When you (or someone) simplifies a problem, ask:
- What was cut away?
- Was that cut conscious or unconscious?
- What risk does the simplified model now expose you to?
- Where are the black boxes — areas of complexity you chose not to explore?
- Can you at least *name* what you don't know?

---

## The Black Box Concept

A **black box** is an area of complexity you know exists but haven't explored. The critical distinction:

| | Aware of Black Box | Unaware of Black Box |
|--|-------------------|---------------------|
| **You know what you don't know** | "Auth is complex, I haven't figured out the edge cases yet" | — |
| **You don't know what you don't know** | — | "This is simple" (but it isn't) |

Seeing the black box — even without understanding its contents — is vastly better than not seeing it at all. When things go wrong, you know where to look.

---

## Software Engineering Examples

### Example 1: "It's basically a CRUD app"

**Simplification**: "This is just a CRUD app. Users create, read, update, and delete records. Straightforward."

**What was cut away**:
- Permission model: Who can CRUD what? Role-based? Attribute-based? Row-level security?
- Concurrency: What happens when two users update the same record?
- Audit trail: Do we need to know who changed what and when?
- Validation: Business rules that govern what constitutes valid data?
- Relationships: How do records relate to each other? Cascading deletes?
- Performance: What happens with 10M records? Does the simple CRUD query still work?

**The cost**: Planning and estimating as if it's "just CRUD" when the real complexity is in permissions, concurrency, and business rules. The CRUD operations are maybe 20% of the actual work.

**Better reasoning**: "The CRUD operations themselves are simple. The complexity lives in [permissions / concurrency / validation]. Let me separate the simple part from the complex part and plan accordingly."

### Example 2: "Just add a cache"

**Simplification**: "The API is slow. Just add a cache. Problem solved."

**What was cut away**:
- Invalidation: When does the cache become stale? How do you know?
- Consistency: What happens when cached data diverges from the database?
- Cold start: What happens when the cache is empty? (thundering herd)
- Memory pressure: How much memory does the cache need? What gets evicted?
- Distributed caching: If you have multiple servers, do they share a cache?
- Debugging: When something's wrong, is it the cache or the source?

**The cost**: "Just add a cache" creates 6 new problems to solve. The original problem (slow API) might have been better solved by fixing the slow query, adding an index, or restructuring the data access pattern.

**Better reasoning**: "Before caching, understand *why* it's slow. If caching is the answer, name the invalidation strategy, consistency guarantees, and cold-start behavior upfront."

### Example 3: "We'll use an event-driven architecture"

**Simplification**: "Events decouple everything. Services emit events, other services consume them. Clean separation."

**What was cut away**:
- Ordering: Do events need to be processed in order? What if they arrive out of order?
- Exactly-once delivery: What if an event is processed twice? Or not at all?
- Schema evolution: What happens when the event schema changes?
- Debugging: How do you trace a request that spans 5 services via events?
- Eventual consistency: Users see stale data. Is that acceptable?
- Operational complexity: Now you need a message broker, monitoring, dead letter queues...

**The cost**: Event-driven architecture trades one type of complexity (coupling) for another (distributed systems complexity). The simplification "events decouple everything" hides the new complexity behind a black box.

**Better reasoning**: "Events solve coupling. They create distribution problems. Let me name those distribution problems and decide if the trade-off is worth it."

### Example 4: "The bug is in module X"

**Simplification**: "The error occurs in module X. The bug must be in module X."

**What was cut away**:
- Module X might be correctly reporting an error caused by module Y
- The data flowing into module X might be corrupted upstream
- A race condition between modules Z and W might produce bad state that X exposes
- Module X might be the *symptom*, not the *cause*

**The cost**: Fixing module X when the bug is actually in module Y. Or worse, "fixing" module X by suppressing the error, hiding the real problem.

**Better reasoning**: "The error manifests in module X. Before fixing X, trace the data backwards. Where did the bad state originate?"

---

## The Three Types of Simplification

### 1. Signal-Preserving Simplification (Good)
You understand the full picture, deliberately remove noise, and keep the signal. You know what you cut and why.

**Example**: "There are 20 factors here. After analysis, 3 of them drive 90% of the outcome. I'll focus on those 3 and monitor the others."

### 2. Comfort-Driven Simplification (Dangerous)
You feel overwhelmed by complexity, so you ignore most of it to feel better. You may not even know what you cut.

**Example**: "This is complicated. Let's just focus on the parts we understand and hope the rest works out."

### 3. Unconscious Simplification (Most Dangerous)
You don't even realize you're simplifying. The simplified model IS your understanding of reality.

**Example**: "It's basically a CRUD app." (Said without having considered permissions, concurrency, or business rules.)

---

## Exercises

### Exercise 1: Name Your Black Boxes
For any plan or decision:
1. List what you DO understand about the problem
2. List what you DON'T understand or haven't explored
3. For each black box, rate: "How much could this hurt me if I'm wrong?" (Low/Medium/High)
4. For High items: explore them before committing

### Exercise 2: The Simplification Audit
Take a "simple" description of a system or plan:
1. For each claim of simplicity, ask "What was cut away to make this simple?"
2. List the cut items
3. For each cut item, ask "Is this noise or signal?"
4. If you can't tell, it's probably signal

### Exercise 3: Hickham's Dictum Test
When you've attributed multiple symptoms to one cause:
1. Ask "Could these symptoms have independent causes?"
2. For each symptom, name at least one alternative cause
3. Check if any alternative cause is more likely than the unified explanation

---

## Red Flags in Reasoning

| Phrase | What It Signals |
|--------|----------------|
| "It's basically just X" | Major simplification — what was lost? |
| "Let's not overcomplicate this" | Possible comfort-driven simplification |
| "The simple answer is..." | Is it simple because of insight or because of omission? |
| "This is straightforward" | Might be unconscious simplification |
| "The root cause is X" | Single attribution — consider Hickham's Dictum |
| "Don't overthink it" | Could be wisdom or could be avoidance |

---

## Connection to Other Lenses

- **Nonlinearity**: Linearizing IS simplifying — nonlinearity helps you see what simplification cut
- **Gray Thinking**: Reducing to binary IS simplifying — the spectrum reveals what was lost
- **Framing Bias**: The frame determines what "looks simple" and what gets cut
- **Anti-Comfort**: Simplification feels comfortable. That comfort is the bias.
- **Delayed Discomfort**: Simplifying now means confronting the cut variables later

---

## The Takeaway

Simplification is necessary. You can't think about everything at once. The meta-model isn't "don't simplify" — it's "simplify consciously." Know what you cut. Know what risk that creates. Name your black boxes, even if you can't explore them yet.

**Rule of thumb**: If simplifying a problem makes you feel relieved, that relief is a signal. You may have just swept risk under the rug instead of reducing it.
