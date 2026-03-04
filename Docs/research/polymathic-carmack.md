# Polymathic Carmack — Deep Research

## Primary Sources
- `.plan` files (1996-2003) — id Software's public development logs, posted on fingerd server
- GDC and QuakeCon keynotes (1999-2013) — annual technical deep-dives
- Lex Fridman Podcast #309 (2022) — 5+ hour conversation covering career, philosophy, AI
- "Inlined Code" email (2007) — internal id Software email on eliminating function call overhead, later made public
- "Functional Programming in C++" (2013) — QuakeCon talk on state management
- Michael Abrash's *Graphics Programming Black Book* — collaboration context
- Armadillo Aerospace development logs (2000-2013) — rocket engineering applying software principles
- Meta/Oculus departure commentary (2022-2023) — organizational criticism
- Twitter/X posts on optimization philosophy and engineering process
- Joe Rogan Experience #1342 (2019) — discussion on programming, rockets, VR

---

## Documented Cognitive Methods

### 1. "Change the Problem" — The Fundamental Optimization Move
**Source:** Twitter/X post, repeated across multiple talks and interviews.

**The principle:** "The secret to optimization is changing the problem to make it easier to optimize!" Carmack's signature move is not finding faster solutions to existing problems — it's reformulating the problem so that a fast solution becomes obvious.

**Key examples:**
- **BSP trees for Doom (1993):** The rendering problem was "how do I draw 3D rooms fast enough on a 386?" The brute-force answer was faster drawing routines. Carmack's answer was to change what "rendering" meant — instead of sorting and drawing all polygons per frame, use a Binary Space Partition tree to pre-compute visibility ordering. The hard problem (real-time 3D sorting) became a trivial problem (tree traversal). Doom was the first game to use BSP for rendering, adapted from a 1969 academic paper.
- **Carmack's Reverse (shadow volumes):** The standard approach to stencil shadow volumes failed at the near clipping plane. Instead of fixing the edge cases, Carmack inverted the algorithm — rendering from the back face instead of the front face, which eliminated the near-plane problem entirely. The patent (later invalidated due to prior art) was a reformulation, not an optimization.
- **MegaTexture (id Tech 5):** Instead of tiling repeating textures (which creates visual repetition), create one enormous unique texture for the entire terrain and stream only the visible portions. Changed the problem from "how do we make tiled textures look unique?" to "how do we stream from a single unique texture?" — a much more tractable engineering problem.

**Why it matters as cognitive method:** Most engineers optimize within the existing problem formulation. Carmack's first move is to question the formulation itself. This is not lateral thinking for its own sake — it's recognizing that the right problem formulation makes the solution obvious, while the wrong formulation makes even clever optimization insufficient.

### 2. The Paper-to-Production Pipeline
**Source:** Multiple .plan entries, GDC talks, Abrash collaboration.

**The method:** Carmack systematically reads academic computer science and mathematics papers, then extracts the "implementable kernel" — the one key insight that can be turned into shipping code, stripped of academic formalism.

**Key examples:**
- BSP trees: adapted from Fuchs, Kedem, and Naylor's 1980 paper "On Visible Surface Generation by a Priori Tree Structures"
- Stencil shadows: drawn from Crow's 1977 shadow volume concept
- Surface caching and light maps: synthesized from multiple rendering research papers
- Carmack's approach to VR latency: drew on vestibular perception research to determine acceptable motion-to-photon latency thresholds

**The specific practice:** Read the paper. Ignore the proofs and academic framing. Find the one paragraph that describes the core data structure or algorithm. Implement it in the simplest possible way. Test whether it actually delivers the theoretical performance in practice. If yes, integrate. If no, the paper lied about the constants.

**Why it matters:** Most engineers either ignore academic research entirely (reinventing wheels) or over-respect it (implementing everything as specified, including irrelevant generality). Carmack's pipeline is surgical extraction — the minimum insight, immediately tested against reality.

### 3. The Inlined Code Discipline
**Source:** 2007 internal id Software email, widely circulated; 2013 QuakeCon talk on functional programming.

**The story:** While writing flight control software for Armadillo Aerospace rockets, Carmack inlined all subroutine calls into a single long function. To his surprise, this revealed hidden bugs that had been invisible when the logic was spread across multiple functions:

> "The flight control code wound up as a single function over 3,000 lines long... I started to notice previously-hidden bugs."

The bugs were hidden because function boundaries created implicit assumptions about state. When everything was visible in one continuous flow, unexpected state mutations became obvious.

**The evolution:** This experience pushed Carmack toward functional programming principles even in C/C++:

> "I have gotten much more bullish about pure functional programming, even in C/C++. The real enemy is not a particular language paradigm — it's unexpected dependency and mutation of state."

**The cognitive method:** When you can't find a bug, increase visibility by reducing abstraction. Function calls are not free — they hide state transitions. Sometimes the 3,000-line function is more debuggable than the 30 functions it replaced, because nothing is hidden.

### 4. Constraint-First Engineering (The Bottleneck Obsession)
**Source:** Across all major projects; formalized in talks and interviews.

**The discipline:** Before writing any code, identify the actual hardware constraint. Not the one you assume — the one the math confirms.

**Key examples:**
- **Doom (1993):** The constraint was not "3D is hard" — it was that a 33MHz 386 could push about 35,000 filled pixels per frame at acceptable framerates. This specific number drove every design decision: BSP for visibility, no room-over-room, no looking up/down, fixed-height walls.
- **Quake (1996):** The constraint shifted to "floating-point math on early Pentiums is fast enough for true 3D, but memory bandwidth for texture sampling is the bottleneck." This drove surface caching — pre-computing lit textures and caching them.
- **VR at Oculus (2012+):** The constraint was motion-to-photon latency. Carmack identified 20ms as the threshold for vestibular comfort. Every architectural decision derived from that number: asynchronous timewarp, predictive tracking, dedicated sensor fusion thread.
- **Armadillo Aerospace:** The constraint for rocket control was not computation speed — it was reliability. A software crash at altitude is not recoverable. This drove the inlined code approach — simplicity over elegance when lives are at stake.

**The cognitive method:** Name the constraint as a specific number before writing a line of code. "It needs to be fast" is not a constraint. "We have 16ms per frame and texture sampling takes 11ms of that" is a constraint. The specific number drives the solution.

### 5. The .plan File Practice (Public Technical Journaling)
**Source:** id Software .plan files (1996-2003), accessible via finger protocol.

**The practice:** Carmack maintained a public development log — his `.plan` file — where he wrote detailed technical notes about current problems, approaches, and decisions. These weren't polished blog posts. They were working notes made public.

**Examples of .plan content:**
- Detailed analysis of OpenGL driver bugs and workarounds
- Real-time thinking through rendering algorithm trade-offs
- Honest post-mortems on approaches that didn't work
- Technical opinions on industry trends (stated as opinions, not pronouncements)

**Why it matters as cognitive method:** Writing forces clarity. Public writing forces honesty. Carmack's .plan files served three functions: (1) rubber-duck debugging through written explanation, (2) accountability — you can't claim you always knew the answer when your wrong turns are public, (3) teaching — the game development community learned real engineering practice from these logs.

### 6. The "60 Hours, 8 Hours Sleep" Productivity System
**Source:** Multiple interviews; Lex Fridman podcast.

**The practice:** Carmack worked approximately 60 hours per week for decades — roughly 10 hours per day, 6 days a week. He was adamant about 8 hours of sleep. No all-nighters. No crunch-week heroics. Consistent, sustainable intensity.

**The focus measurement:** During Quake engine development, Carmack would play a CD when he sat down to work and pause it when he was interrupted or lost focus. He tracked how much of the CD played versus wall clock time, using it as a concrete measure of focus time. Some days he'd only get 3-4 hours of real focus in 10 hours of "work."

**The night shift:** For particularly demanding work (the Quake engine), Carmack shifted to working at night when the office was empty, specifically to eliminate interruptions. Not because he was a night owl by nature — because the math on focus time showed interruptions were the real bottleneck.

**Why it matters:** Carmack's productivity comes from consistency and focus measurement, not heroics. He treats his own attention like a hardware constraint — measure it, identify the bottleneck (interruptions), and optimize for it (eliminate interruptions).

### 7. "Software Engineering Is a Social Science"
**Source:** Lex Fridman podcast #309; Twitter posts.

**The insight:** "The algorithms are computer science. The optimization of those algorithms is engineering. But the actual job of software engineering — getting people to write code together, to agree on interfaces, to maintain systems over time — that's a social science."

**The implication:** Carmack argues that most software failures are not algorithmic — they're organizational. Code quality degrades not because algorithms rot but because teams fail to maintain shared understanding. This is why he values:
- Code that can be read by strangers (it survives team turnover)
- Minimal abstraction (each layer is a communication barrier)
- Working code over documentation (documentation lies; code runs)
- Small teams over large ones (communication overhead grows quadratically)

**The Meta experience (2013-2022):** Carmack increasingly cited organizational dysfunction at Meta/Oculus as the primary obstacle to VR progress. His departure letter criticized the "ridiculous amount of people and resources" being deployed with "half the effectiveness of the old team." He specifically called out silo mentality and excessive futureproofing as organizational diseases.

### 8. Gradient Descent as Engineering Philosophy
**Source:** Lex Fridman podcast; various interviews.

**The analogy:** Carmack explicitly compares iterative engineering to gradient descent in machine learning: "Small, incremental steps are the fastest route to meaningful and disruptive innovation." Take a step, measure, adjust, repeat. The path is never straight, but you converge.

**The anti-pattern this opposes:** Grand architectural planning that tries to reach the optimal solution in one leap. Carmack's argument: you can't know the loss landscape (the full problem space) in advance. Taking many small measured steps discovers the terrain.

**Application:** This is why Carmack ships early and iterates. Doom shipped with known limitations. Quake shipped and was immediately improved. Each release was a measured step, and the measurements informed the next step.

---

## Signature Heuristics (Named Decision Rules)

1. **"Profile before you optimize."** Intuition about where code is slow is almost always wrong. Measure. The bottleneck is never where you think. This saved Carmack from optimizing rendering code when the real bottleneck was texture sampling memory bandwidth.

2. **"No abstraction without three concrete cases."** Don't generalize until you have evidence that generalization is needed. Three similar blocks of copy-pasted code is a better starting point than a premature abstraction. The abstraction might be the wrong one — the copy-paste makes the actual pattern visible.

3. **"Working code is the deliverable."** Not architecture diagrams. Not type hierarchies. Not planning documents. Working code that you can run and measure. Everything else is overhead.

4. **"Every feature is an obstacle to future expansion."** Adding a feature is not just the cost of implementing it — it's the cost of maintaining it forever and working around it in every future change. This is why Carmack cuts features aggressively.

5. **"A 500-line function you can read beats 50 abstractions you have to trace."** Clarity of reading flow trumps theoretical elegance. When a bug appears in the 500-line function, you find it by reading. When a bug appears in 50 abstractions, you find it by tracing call chains across files. The 500-line function is often cheaper to debug.

6. **"Throw it away."** If a better approach appears, abandon the current code without regret. Code is disposable. The understanding you gained writing it is not. Sunk cost attachment to working code blocks adoption of superior approaches.

7. **"The right answer now beats the perfect answer later."** Ship the 80% solution today and iterate. The 100% solution planned for next quarter usually ships at 60% six months late. Shipping generates real feedback that planning cannot.

8. **"Read the paper, ignore the proofs."** Academic research contains valuable algorithms, but the academic presentation buries the implementable insight in formalism. Extract the core data structure or approach, implement it simply, and test whether the theoretical performance holds in practice.

9. **"Assume you'll rewrite it."** Design code for replaceability, not permanence. If the code can be thrown away and rewritten without affecting the rest of the system, the architecture is good. If throwing it away would cascade, the coupling is the real problem.

10. **"Measure your focus, not your hours."** Time at the desk is not productive time. Carmack's CD-player metric revealed that real focus time was often 30-40% of wall clock time. Optimize for focus, not for hours.

---

## Known Blind Spots and Failure Modes

### 1. Organizational Scale Problems
Carmack's methods are optimized for small, elite teams (id Software was typically 10-20 engineers during its best work). His approach to code clarity (long inline functions, minimal abstraction) works when 1-3 engineers own the entire codebase but becomes harder to maintain with 50+ contributors. His Meta experience showed the gap — he couldn't apply his methods to a 1,000-person engineering organization.

**Impact on agent:** The Carmack agent may recommend approaches that are optimal for small teams but impractical for large organizations. Minimal abstraction assumes that a single person can hold the full codebase in their head.

### 2. Hardware-Centric Thinking
Carmack's career is rooted in hardware-constrained engineering — 386 processors, VR headset latencies, rocket control systems. His instinct is always to ask "what can the hardware do?" For problems where the constraint is not hardware (organizational complexity, UX design, business logic), the bottleneck-first approach may focus on the wrong dimension entirely.

**Impact on agent:** The agent may default to performance optimization when the actual constraint is usability, maintainability, or developer productivity. Not every problem is a hardware problem.

### 3. Undervaluing Abstraction
Carmack's anti-abstraction stance is well-earned (premature abstraction has caused him real pain) but can be overcorrected. In large, long-lived codebases, good abstractions are essential for managing complexity across teams and years. His preference for inline code works for rocket control and game engines but not for enterprise systems with multiple teams and long maintenance horizons.

**Impact on agent:** The agent may be too aggressive in recommending against abstraction layers that serve real organizational and maintenance purposes.

### 4. The Solo Genius Model
Like Feynman, Carmack's most legendary work was largely solo or in very small collaborations. The Quake engine was essentially one person's work. His methods don't naturally account for team-based development, knowledge sharing, onboarding, or distributed decision-making.

**Impact on agent:** The agent may not recommend collaborative practices (pair programming, code review processes, architecture decision records) that matter in team contexts.

### 5. Survivorship Bias in "Ship and Iterate"
Carmack's "ship early, iterate" philosophy works when you have a deep understanding of the problem domain and rapid feedback loops (games ship, players respond, next version improves). It works less well when shipping has high switching costs (infrastructure, APIs with external consumers, hardware products). Shipping a bad API and iterating creates a breaking-change treadmill for consumers.

**Impact on agent:** The agent may recommend shipping prematurely in contexts where the cost of iteration (breaking changes, migration overhead) is high.

---

## Contrasts With Other Agents

### vs. Feynman (Understanding vs. Shipping)
Both are anti-abstraction and constraint-first, but with opposite immediate goals. **Carmack** prioritizes *working code* — ship the minimum viable solution, measure, iterate. Understanding follows from building. **Feynman** prioritizes *understanding* — re-derive from first principles, ensure genuine comprehension before writing a line of code. Carmack says "ship and learn." Feynman says "understand, then build." Use Carmack when you have a working mental model and need to move fast. Use Feynman when you don't understand why something is broken and need to build understanding before fixing.

### vs. Shannon (Empirical vs. Structural)
Both find the essential constraint, but through different methods. **Carmack** finds the constraint *empirically* — profile, measure, identify the actual bottleneck in running code. **Shannon** finds the constraint *structurally* — strip domain semantics, find the mathematical invariant. Carmack asks "what does profiling show?" Shannon asks "what does the math say?" Use Carmack when you need to optimize real running systems. Use Shannon when you need to simplify architecture or find hidden structural problems.

### vs. Musk (Bottleneck vs. Deletion)
Both engineers strip aggressively, but target different things. **Carmack** identifies the *performance bottleneck* — the specific constraint that, once removed, makes the system fast enough. **Musk** identifies *unnecessary requirements* — questioning whether each requirement should exist at all. Carmack changes the problem to make it tractable. Musk deletes the problem to make it unnecessary. Use Carmack for technical optimization. Use Musk for requirement questioning.

### vs. Linus (Shipping vs. Taste)
Both value working code over theoretical elegance, but with different emphasis. **Carmack** optimizes for *shipping speed and iteration* — get it out, learn, improve. **Linus** optimizes for *long-term code quality and structural elegance* — "good taste" means the simple, correct approach that maintains well. Carmack will ship a 3,000-line function if it works. Linus would demand it be restructured before merging. Use Carmack when speed matters most. Use Linus when maintainability over decades matters most.
