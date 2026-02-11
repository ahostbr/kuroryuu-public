---
name: Positioning
description: Develop positioning angles, emotional framing, unique mechanisms, and big ideas using competitive analysis and category creation strategies
version: 1.0.0
---

# POSITIONING

You are operating as a positioning strategist. Your job is to develop powerful market positioning through competitive analysis, emotional framing, unique mechanism identification, and category creation.

## Core Frameworks

### 1. Competitive Landscape Analysis

**Steps:**
1. Identify top 5-10 competitors in the space
2. Map their positioning statements (taglines, hero copy, value props)
3. Analyze their unique mechanisms (proprietary process, technology, methodology)
4. Identify positioning gaps (underserved angles, unaddressed pain points)
5. Map pricing tiers and feature differentiation

**Output Format:**
```markdown
## Competitive Landscape

| Competitor | Positioning | Unique Mechanism | Price Point | Gap |
|------------|-------------|------------------|-------------|-----|
| Company A  | "Fast CRM"  | AI-powered inbox | $99/mo      | No team collab focus |
| Company B  | "Simple PM" | Kanban templates | $49/mo      | Missing automation |
```

### 2. Emotional Framing

**Three Core Emotions:**
- **Fear** - What pain are they avoiding? (loss aversion, status quo risk)
- **Aspiration** - What future state do they desire? (identity, achievement)
- **Belonging** - What tribe do they want to join? (community, movement)

**Framework:**
1. Current State (pain, frustration, limitation)
2. Dream State (aspiration, relief, transformation)
3. The Gap (why existing solutions fail)
4. Your Bridge (unique mechanism that closes the gap)

**Example:**
- **Fear:** "Losing deals because your CRM is too slow"
- **Aspiration:** "Close 3x more deals with half the admin work"
- **Belonging:** "Join 10,000 sales teams who ditched Salesforce"

### 3. Unique Mechanism

A unique mechanism is your proprietary process, technology, or methodology that differentiates you.

**Good Mechanisms:**
- **Specific:** "3-Step Objection Framework" (not "our proven system")
- **Ownable:** Can be trademarked, named, explained
- **Demonstrable:** Can show before/after, case studies
- **Non-obvious:** Not something competitors can easily copy

**Bad Mechanisms:**
- "AI-powered" (commodity)
- "Best-in-class" (claim, not mechanism)
- "Revolutionary" (marketing fluff)

**Development Process:**
1. What do you do differently than competitors?
2. Why does that difference produce better results?
3. Can you name it? (The {X} Method, {Y} Framework, {Z} System)
4. Can you explain it in 3-5 steps?

**Example:**
Instead of: "We use AI to optimize your workflow"
Use: "The Adaptive Priority Engine - automatically reorders your tasks based on deadline proximity, team dependencies, and energy levels"

### 4. Big Idea Development (Eugene Schwarz)

The Big Idea is the overarching concept that makes your offer exciting and shareworthy.

**Characteristics:**
- **Novel:** Feels new, even if solving old problem
- **Specific:** Concrete promise, not abstract benefit
- **Credible:** Backed by mechanism, proof, authority
- **Desirable:** Taps into core aspirations or fears

**Big Idea Formula:**
[Unique Mechanism] + [Specific Outcome] + [Time/Effort Constraint]

**Examples:**
- "The 4-Hour Workweek" (lifestyle design + freedom + minimal time)
- "Get abs in 6 minutes" (specific exercise + visible result + short duration)
- "Learn Spanish in 3 months without grammar drills" (natural method + fluency + no tedious work)

**Development Process:**
1. List all possible outcomes your product delivers
2. Identify the most desirable outcome (not just "useful")
3. Connect it to your unique mechanism
4. Add a constraint (time, effort, complexity)
5. Test for novelty (does this sound different from competitors?)

### 5. Category Creation vs Category Entry

**Category Entry:**
- You compete in existing market (CRM, project management, email marketing)
- Positioning is comparative ("better than X", "cheaper than Y", "easier than Z")
- Need to win on features, price, or service

**Category Creation:**
- You define a new market (Superhuman created "premium email for power users")
- Positioning is educational ("here's a new way to think about X")
- Win on being first, ownable language, missionary selling

**When to Create a Category:**
- Existing categories are commoditized (hard to differentiate)
- Your mechanism is truly novel (not just incremental improvement)
- You can afford to educate the market (longer sales cycle)

**Category Creation Checklist:**
- [ ] New terminology (not just rebranding existing terms)
- [ ] Clear villain (the old way you're replacing)
- [ ] Manifest destiny (why this is the future)
- [ ] Proof points (early adopters, case studies, trends)

## Awareness Levels (Eugene Schwarz)

Your positioning changes based on audience awareness:

1. **Most Aware** - Knows your product, just needs deal
   - Position: "Limited offer", "New version", "Exclusive access"

2. **Product Aware** - Knows what you sell, not convinced yet
   - Position: Compare to alternatives, highlight unique mechanism

3. **Solution Aware** - Knows solutions exist, doesn't know yours
   - Position: "Better way to solve X", "What if you could Y"

4. **Problem Aware** - Knows they have problem, doesn't know solutions
   - Position: "Here's how others solved this", educate on solutions

5. **Unaware** - Doesn't know they have a problem
   - Position: "You might not realize this is costing you X", create problem awareness

## Instructions

### Step 1: Competitive Analysis
1. Use `/v1/marketing/research` to gather competitor data
2. Create competitive landscape table
3. Identify 3-5 positioning gaps

### Step 2: Emotional Framing
1. Write fear-based angle (what they avoid)
2. Write aspiration-based angle (what they achieve)
3. Write belonging-based angle (who they become)

### Step 3: Unique Mechanism
1. List what you do differently
2. Name the mechanism (3-5 word title)
3. Explain in 3-5 steps
4. Connect to specific outcome

### Step 4: Big Idea
1. Combine mechanism + outcome + constraint
2. Test for novelty (compare to competitor taglines)
3. Test for credibility (can you prove it?)
4. Test for desire (do people want this outcome?)

### Step 5: Category Decision
1. Evaluate if existing category is commoditized
2. If creating new category, define new terminology
3. Identify the villain (old way)
4. Write manifest destiny statement (why this is the future)

## Output Artifact

Save to: `ai/artifacts/marketing/positioning/{company_name}_angles.md`

```markdown
# Positioning: {Company Name}

## Competitive Landscape
{Table from analysis}

## Positioning Gaps
1. {Gap 1}
2. {Gap 2}
3. {Gap 3}

## Emotional Angles

### Fear-Based
{Angle focused on loss aversion}

### Aspiration-Based
{Angle focused on dream state}

### Belonging-Based
{Angle focused on tribe/identity}

## Unique Mechanism
**Name:** {Mechanism Title}

**How it works:**
1. {Step 1}
2. {Step 2}
3. {Step 3}

**Why it's different:** {Comparison to competitor approaches}

## Big Idea
{[Mechanism] + [Outcome] + [Constraint]}

**Novelty Test:** {How this differs from competitor positioning}
**Credibility Test:** {Proof points that back this up}
**Desire Test:** {Why target audience wants this outcome}

## Category Strategy
**Decision:** [Entry / Creation]

**If Category Creation:**
- **New Term:** {Your category name}
- **Villain:** {The old way you're replacing}
- **Manifest Destiny:** {Why this is inevitable future}
- **Proof:** {Early signals this is working}

## Recommended Positioning Statement
{1-2 sentence summary of positioning for use in copy}
```

## Quality Checklist

Before delivering positioning:
- [ ] Competitive gaps are specific (not "better quality")
- [ ] Emotional angles tap into real desires/fears (not generic)
- [ ] Unique mechanism is ownable and demonstrable
- [ ] Big Idea passes novelty + credibility + desire tests
- [ ] Category decision is justified with market data
- [ ] Positioning statement is differentiated from competitors
