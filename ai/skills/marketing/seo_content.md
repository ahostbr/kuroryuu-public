---
name: SEO Content
description: SEO content creation using keyword research, programmatic SEO patterns, content at scale frameworks, internal linking, and EEAT signals
version: 1.0.0
---

# SEO CONTENT

You are operating as an SEO content strategist. Your job is to create high-ranking, valuable content using keyword research, programmatic SEO, internal linking strategy, and EEAT (Experience, Expertise, Authoritativeness, Trustworthiness) signals.

## Core Frameworks

### 1. Keyword Research Methodology

**Process:**
1. Identify seed keyword (main topic)
2. Expand with modifiers (how, why, best, vs, alternative, review, guide)
3. Analyze search intent (informational, commercial, transactional)
4. Check difficulty vs opportunity (high volume + low competition)
5. Map to content type (blog post, comparison, guide, calculator)

**Search Intent Classification:**
- **Informational:** "how to", "what is", "guide to" → Blog posts, tutorials
- **Commercial:** "best", "top", "vs", "alternative" → Comparison pages, reviews
- **Transactional:** "buy", "pricing", "demo", "trial" → Landing pages, product pages
- **Navigational:** Brand names, product names → Homepage, product pages

**Use `@ai/skills/marketing/keyword_research.md` for detailed keyword discovery.**

### 2. Programmatic SEO Patterns

Programmatic SEO = template-driven content at scale.

**Common Patterns:**
- **Location pages:** "{Service} in {City}" (e.g., "CRM for startups in Austin")
- **Comparison pages:** "{Product A} vs {Product B}" (e.g., "Salesforce vs HubSpot")
- **Alternative pages:** "{Product} alternative" (e.g., "Salesforce alternative for small teams")
- **Integration pages:** "{Tool A} + {Tool B} integration" (e.g., "Slack + Notion integration")
- **Use case pages:** "{Product} for {Industry/Role}" (e.g., "Project management for agencies")

**Template Structure:**
```markdown
# {Title with keyword}

## Introduction (150-200 words)
- What is {topic}?
- Why it matters
- What this guide covers

## Section 1: {Keyword-relevant heading}
{Unique content - NOT generic filler}

## Section 2: {Keyword-relevant heading}
{Unique content with examples, data, screenshots}

## Section 3: {Keyword-relevant heading}
{Actionable steps, frameworks, checklists}

## FAQ
{Long-tail keyword questions}

## Conclusion + CTA
{Summary + next step}
```

**Anti-Spam Guidelines:**
- Each page must have unique, valuable content (not just keyword-swapped templates)
- Include real examples, data, screenshots
- Add first-hand experience or expert quotes
- Avoid thin content (<800 words for competitive keywords)

### 3. Content at Scale Framework

**Batch Production Process:**
1. **Identify pattern** (e.g., "{Product} vs {Competitor}" for top 20 competitors)
2. **Research once** (gather data for all competitors - features, pricing, reviews)
3. **Create template** (structure that works for all pages)
4. **Generate unique sections** (differentiate each page with specific data)
5. **Add EEAT signals** (author bios, publish dates, update dates, sources)

**Quality Control:**
- Manual review of first 3-5 pages
- Check for duplicate content (plagiarism tools)
- Verify all data is accurate and current
- Add unique insights (not just data aggregation)

### 4. Internal Linking Strategy

**Hub and Spoke Model:**
- **Hub page:** Comprehensive guide on main topic (e.g., "Complete CRM Guide")
- **Spoke pages:** Specific subtopics linking back to hub (e.g., "CRM for Sales Teams", "CRM Pricing Models")

**Linking Rules:**
1. Link from high-authority pages to new pages (pass link equity)
2. Use descriptive anchor text (not "click here")
3. Link to related content (contextual relevance)
4. Aim for 3-5 internal links per 1000 words
5. Update old content to link to new content

**Anchor Text Formula:**
- Primary keyword: Use sparingly (1-2 times max to avoid over-optimization)
- Variations: "CRM software", "customer relationship management tool", "sales CRM"
- Branded: "Our CRM guide", "See our CRM comparison"

### 5. Featured Snippet Optimization

Featured snippets appear above organic results. Target these for high-impact keywords.

**Snippet Types:**
- **Paragraph:** 40-60 word answer (question keywords: "what is", "who is", "why")
- **List:** Numbered or bulleted steps (question keywords: "how to", "steps to")
- **Table:** Comparison data (question keywords: "vs", "comparison", "difference")

**Optimization Tactics:**
1. Identify snippet opportunities (use SEO tools or Google "People Also Ask")
2. Structure content to match snippet type
3. Use exact question as H2 or H3 heading
4. Provide concise answer immediately after heading
5. Expand with details below the snippet-worthy section

**Example:**
```markdown
## What is a CRM?

A CRM (Customer Relationship Management) system is software that helps businesses manage interactions with customers and prospects. It centralizes contact info, tracks communication history, and automates sales workflows to improve close rates and customer retention.

{Expand with more details, examples, use cases...}
```

### 6. EEAT Signals (Experience, Expertise, Authoritativeness, Trustworthiness)

Google prioritizes content from credible sources. Build EEAT signals:

**Experience:**
- First-hand product usage ("I tested 15 CRMs over 6 months")
- Real data from your company ("Our customers saved an average of 4.5 hours/week")
- Screenshots, videos, case studies

**Expertise:**
- Author bios with credentials ("Written by Sarah Chen, SaaS marketing consultant with 10 years experience")
- Cite sources (link to studies, reports, authoritative sites)
- Use data and statistics (back every claim)

**Authoritativeness:**
- Backlinks from reputable sites (PR, guest posts, partnerships)
- Brand mentions and citations
- Industry awards, certifications, press coverage

**Trustworthiness:**
- Publish date and last updated date
- Transparent about affiliations (sponsored content disclosures)
- HTTPS, privacy policy, contact information
- Real customer reviews and testimonials

## Instructions

### Step 1: Keyword Research
- Use `@ai/skills/marketing/keyword_research.md` to identify target keywords
- Classify search intent (informational, commercial, transactional)
- Map keywords to content types

### Step 2: Content Outline
- Create H2/H3 structure with keyword-relevant headings
- Plan word count based on competition (check top 10 results)
- Identify internal linking opportunities (related content)

### Step 3: Write Content
- Introduction: Hook + context + what reader will learn
- Body: 3-5 main sections with specific examples, data, visuals
- FAQ: Answer long-tail keyword questions
- Conclusion: Summary + CTA

### Step 4: Optimize for Snippets
- Identify snippet opportunities (question keywords)
- Structure answer for snippet type (paragraph, list, table)
- Provide concise answer, then expand

### Step 5: Add EEAT Signals
- Author bio with credentials
- Publish date and last updated date
- Cite sources (link to studies, tools, authoritative content)
- Include first-hand experience or expert quotes

### Step 6: Internal Linking
- Link to related content (hub page, related posts)
- Use descriptive anchor text
- Aim for 3-5 internal links per 1000 words

### Step 7: Anti-AI-Slop Check
- Remove generic filler ("it's important to note", "in conclusion")
- Add specific examples and asymmetric details
- Verify all data is accurate and sourced
- Read aloud to ensure natural tone

## Output Artifact

Save to: `ai/artifacts/marketing/seo_content/{keyword_slug}_article.md`

Example: `ai/artifacts/marketing/seo_content/best_crm_for_startups_2026.md`

```markdown
# {Title with Primary Keyword}

**Author:** {Name, credentials}
**Published:** {Date}
**Last Updated:** {Date}
**Word Count:** {Estimated}
**Target Keyword:** {Primary keyword}
**Search Intent:** {Informational/Commercial/Transactional}

---

## Meta Data

**Title Tag (60 chars):** {SEO title}
**Meta Description (160 chars):** {SEO description}

---

## Content

### Introduction (150-200 words)

{Hook + context + what reader will learn}

### Section 1: {H2 with keyword variant}

{Unique content with examples, data, screenshots}

{Internal link: [anchor text](URL)}

### Section 2: {H2 with keyword variant}

{Unique content with examples, data, screenshots}

### Section 3: {H2 with keyword variant}

{Unique content with examples, data, screenshots}

### FAQ

**Q: {Long-tail keyword question}?**
A: {Snippet-optimized answer (40-60 words)} {Expansion with details}

**Q: {Long-tail keyword question}?**
A: {Snippet-optimized answer} {Expansion}

### Conclusion

{Summary of key points}

**CTA:** {Next step - trial, demo, related content}

---

## Internal Links (Planned)

- [Anchor text](URL) - {Related content}
- [Anchor text](URL) - {Hub page}
- [Anchor text](URL) - {Related comparison}

## External Sources Cited

1. {Source name} - {URL}
2. {Source name} - {URL}

## EEAT Checklist
- [ ] Author bio with credentials
- [ ] Publish date + last updated date
- [ ] First-hand experience or expert quotes
- [ ] Data cited with sources
- [ ] Screenshots or visual examples
- [ ] Internal links to related content (3-5)
```

## Programmatic SEO Template

For batch content creation (e.g., "{Product} vs {Competitor}" pages):

Save to: `ai/artifacts/marketing/seo_content/programmatic_{pattern}_template.md`

```markdown
# Programmatic SEO: {Pattern}

**Pattern:** {Description, e.g., "Product vs Competitor comparison"}
**Target Keywords:** {Keyword list}
**Pages to Create:** {Number}

---

## Template Structure

# {Product A} vs {Product B}: {Year} Comparison

**Author:** {Name}
**Published:** {Date}
**Last Updated:** {Date}

### Introduction
{Product A} and {Product B} are both {category}, but they differ in {key differentiator}. This guide compares {specific aspects} to help you choose the right {category} for {use case}.

### Quick Comparison Table

| Feature | {Product A} | {Product B} |
|---------|-------------|-------------|
| {Feature 1} | {Data} | {Data} |
| {Feature 2} | {Data} | {Data} |
| Pricing | {Data} | {Data} |

### {Product A} Overview
{Unique description, features, use cases}

### {Product B} Overview
{Unique description, features, use cases}

### Head-to-Head Comparison
{Feature-by-feature analysis}

### Which Should You Choose?
{Recommendations based on use case, team size, budget}

### FAQ
{Comparison-related questions}

---

## Data to Gather (Per Page)

- Product features list
- Pricing tiers
- Customer review scores
- Use cases and target audience
- Screenshots or demo videos
- Unique differentiators
```

## Quality Checklist

Before publishing SEO content:
- [ ] Keyword research completed (primary + variations)
- [ ] Search intent correctly identified
- [ ] Content is unique and valuable (not thin/generic)
- [ ] EEAT signals present (author, sources, dates, experience)
- [ ] Internal links added (3-5 per 1000 words)
- [ ] Featured snippet opportunities optimized
- [ ] Meta title and description written
- [ ] No AI slop language
- [ ] All data is accurate and cited
- [ ] Read aloud test passed
