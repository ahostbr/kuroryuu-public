"""Prompt templates for the GenUI 3-stage pipeline.

Three master prompts:
1. CONTENT_ANALYSIS_PROMPT - Markdown classification + entity extraction
2. LAYOUT_SELECTION_PROMPT - Optimal layout type selection
3. COMPONENT_SELECTION_PROMPT - A2UI component generation with variety enforcement
"""

from __future__ import annotations

# ============================================================================
# CONTENT ANALYSIS PROMPT
# ============================================================================

CONTENT_ANALYSIS_PROMPT = """You are an expert content analyst specializing in Markdown document classification and entity extraction.

Analyze the provided Markdown document and extract structured information.

## Document to Analyze

{markdown_content}

## Analysis Requirements

### 1. Document Classification
Classify into ONE type:
- **tutorial**: Step-by-step guides with code examples
- **research**: Academic papers, research notes, data-driven content
- **article**: Blog posts, news, opinion pieces
- **guide**: Reference documentation, comprehensive overviews
- **notes**: Personal notes, quick references
- **technical_doc**: API docs, technical specs
- **overview**: High-level summaries, executive briefings

### 2. Entity Extraction
Extract:
- **Technologies**: Frameworks, platforms, libraries, services
- **Tools**: Development tools, applications
- **Languages**: Programming/markup languages mentioned
- **Concepts**: Important topics from headers

### 3. Structural Analysis
Identify title, section count, code blocks, tables, links, special content.

## Output Format (JSON only)

```json
{{
  "document_type": "tutorial",
  "title": "Document Title",
  "entities": {{
    "technologies": ["React", "FastAPI"],
    "tools": ["npm", "uvicorn"],
    "languages": ["Python", "TypeScript"],
    "concepts": ["REST API", "Async"]
  }},
  "confidence": 0.95,
  "reasoning": "Brief explanation"
}}
```

Respond with valid JSON only."""


# ============================================================================
# LAYOUT SELECTION PROMPT
# ============================================================================

LAYOUT_SELECTION_PROMPT = """You are an expert UI/UX designer. Select the BEST layout type for this content.

## Content Analysis

{content_analysis}

## Available Layout Types

1. **instructional_layout** - Tutorials, code guides, step-by-step
2. **data_layout** - Research, statistics, tables, comparisons
3. **news_layout** - Articles, blog posts, news stories
4. **list_layout** - Guides, checklists, resource collections
5. **summary_layout** - Notes, quick references, TL;DR
6. **reference_layout** - API docs, technical specs, many sections
7. **media_layout** - Visual content, video tutorials, multimedia

## Selection Criteria (priority order)

1. Content Structure (40%): code blocks -> instructional, tables -> data, media -> media
2. Document Type (30%): tutorial -> instructional, research -> data, article -> news
3. User Intent (20%): learn -> instructional, analyze -> data, reference -> summary
4. Content Length (10%): short -> summary, long+sections -> reference

## Output Format (JSON only)

```json
{{
  "layout_type": "instructional_layout",
  "confidence": 0.92,
  "reasoning": "Explanation referencing specific content characteristics",
  "alternative_layouts": ["reference_layout", "list_layout"],
  "component_priorities": ["CodeBlock", "StepCard", "CalloutCard"]
}}
```

Respond with valid JSON only."""


# ============================================================================
# COMPONENT SELECTION PROMPT
# ============================================================================

COMPONENT_SELECTION_PROMPT = """You are an expert A2UI component architect for Kuroryuu — a dark imperial-themed desktop application. Generate diverse dashboard components that feel dramatic, atmospheric, and cohesive.

## FRONTEND DESIGN PHILOSOPHY (CRITICAL — Read before generating)

You are creating components for a distinctive, production-grade interface. Avoid generic "AI slop" aesthetics.

### Design Thinking
- **Purpose**: Each component solves a specific information display need.
- **Tone**: Dark imperial luxury — dramatic, atmospheric, refined. Think military command center meets Japanese imperial court.
- **Differentiation**: Every dashboard should feel UNFORGETTABLE. The content drives the component selection — match the drama of the data to the weight of the component.

### Aesthetics Guidelines
- **Typography**: The system uses Share Tech Mono (monospace terminal) for data/metrics and serif fonts for body text. Write content that reads well in these fonts — short, punchy labels for monospace; flowing prose for serif.
- **Color & Theme**: Crimson and gold dominate. When writing content for components, think about how it reads against near-black backgrounds with gold accents. Avoid mentioning colors in props (the renderer handles theming).
- **Spatial Composition**: Use width_hint to create unexpected layouts. Not everything should be "full" width. Mix third-width stat cards with half-width callouts and full-width tables. Create visual rhythm through variety.
- **Content Quality**: NEVER use generic placeholder text. Every label, value, title, and description must contain real, specific, meaningful data extracted from the source document. The content IS the design.

### What Makes It Imperial
- Concise, authoritative language (not casual or chatty)
- Data presented with precision (exact numbers, not approximations)
- Hierarchical information flow (TLDR hero → metrics → insights → details → resources → tags)
- Military-grade labeling (short, uppercase-friendly labels: "ADOPTION RATE" not "The rate at which people adopt things")

## DESIGN AESTHETIC (Visual System Tokens)

The Kuroryuu interface uses a **dark imperial aesthetic** with these design tokens:
- **Primary palette**: Crimson `#8b2635` (dramatic accents), Sacred Gold `#c9a962` (highlights, labels, borders)
- **Backgrounds**: Near-black `rgba(17,17,19)` to `rgba(26,26,30)` — deep, atmospheric
- **Text**: Off-white `rgba(250,250,250,0.85)` body, gold `rgba(201,169,98,0.75)` for labels/headers
- **Fonts**: Monospace terminal fonts (Share Tech Mono, VT323) for data/metrics, serif for body text
- **Border style**: Subtle gold or crimson borders `rgba(201,169,98,0.08)` to `rgba(139,38,53,0.3)`
- **Effects**: Subtle scanline overlays, gold glow on hover, staggered reveal animations

### Component Styling Guidelines
When setting props, follow these rules:
- **StatCard**: Use short, punchy labels (2-4 words, uppercase-friendly). Values should be bold numbers with units. Include trend direction (up/down/neutral) when data supports it.
- **TLDR**: Write a compelling 1-2 sentence summary. This renders as the hero banner with crimson-gold gradient. Make it authoritative.
- **KeyTakeaways**: Each item should be a concise insight (1 sentence). Assign categories like "Performance", "Security", "Architecture" etc.
- **CalloutCard**: Use type "tip" for gold accent, "warning" for amber, "danger" for crimson, "info" for blue. Keep title short (2-4 words), content 1-2 sentences.
- **TableOfContents**: Every item MUST have a non-empty "title" field. Use level 0 for main sections, 1 for subsections.
- **TagCloud**: Tags should be short (1-3 words). They render in uppercase monospace terminal style.
- **ExecutiveSummary**: Include 3-5 key_metrics with label/value/unit/trend. Recommendations should be actionable.
- **QuoteCard/ExpertTip**: Attribute quotes properly. Tips should feel authoritative and commanding.

### Width Hints (map to grid columns — USE VARIETY)
- `"full"` → 12 columns (hero banners, tables, code blocks, executive summaries)
- `"half"` → 6 columns (callouts, summaries, comparisons, key takeaways)
- `"third"` → 4 columns (stat cards, metric cards, profile cards)
- `"quarter"` → 3 columns (tags, small badges, indicators)

Create visual rhythm: do NOT make everything "full" or "half". Mix widths aggressively.

## Content Analysis

{content_analysis}

## Selected Layout

{layout_decision}

## Available A2UI Component Types (59 total)

### Data & Statistics
- **StatCard**: Key metrics, KPIs, numbers
- **MetricRow**: Multiple related metrics in a row
- **ProgressRing**: Circular progress indicators
- **ComparisonBar**: Side-by-side metric comparisons
- **DataTable**: Structured tabular data
- **MiniChart**: Small inline charts

### Summary
- **TLDR**: Too Long; Didn't Read summaries
- **KeyTakeaways**: Main points (3-5 items)
- **ExecutiveSummary**: High-level overview
- **TableOfContents**: Navigation for long docs

### Instructional
- **StepCard**: Numbered tutorial steps
- **CodeBlock**: Code examples with syntax highlighting
- **CalloutCard**: Notes, warnings, tips, info boxes
- **CommandCard**: Terminal commands, CLI instructions

### Lists & Rankings
- **RankedItem**: Numbered lists, top N items
- **ChecklistItem**: To-do items, action items
- **ProConItem**: Pros/cons lists
- **BulletPoint**: Simple bulleted items

### Resources & Links
- **LinkCard**: External links (MUST have valid https:// URL)
- **ToolCard**: Software tools (MUST have valid https:// URL)
- **BookCard**: Books, papers, reading materials
- **RepoCard**: GitHub repositories

### People & Social
- **ProfileCard**: Author profiles, contributors
- **CompanyCard**: Companies, organizations
- **QuoteCard**: Quotes, testimonials
- **ExpertTip**: Tips, advice, best practices

### News & Trends
- **HeadlineCard**: Breaking news, announcements
- **TrendIndicator**: Trends with direction (up/down/stable)
- **TimelineEvent**: Chronological events, milestones
- **NewsTicker**: Live updates, rolling news

### Media
- **VideoCard**: YouTube, video embeds
- **ImageCard**: Featured images, diagrams
- **PlaylistCard**: Video/audio playlists
- **PodcastCard**: Podcast episodes

### Comparison
- **ComparisonTable**: Feature comparison across products
- **VsCard**: Head-to-head comparisons
- **FeatureMatrix**: Feature availability across tiers
- **PricingTable**: Pricing tiers, plans

### Layout
- **Section**: Group related components (use sparingly)

### Tags
- **TagCloud**: Collection of related tags
- **CategoryBadge**: Category label with color
- **DifficultyBadge**: Difficulty level
- **StatusIndicator**: Status with colored dot
- **PriorityBadge**: Priority level badge

## VARIETY RULES (CRITICAL — FOLLOW EXACTLY)

1. **Scale with document size** (MOST IMPORTANT):
   - Short (<500 words): **5-8 components MAXIMUM**. Do NOT generate more than 8!
   - Medium (500-2000 words): 10-15 components
   - Long (2000+ words): 15-25 components
2. **Only use REAL data from the document** — never invent numbers, URLs, or names not in the source
3. **Cover ALL major sections** — generate components for every section, not just first few
4. **Min 4 different types** — do NOT create 10 components of only 2-3 types
5. **No 3+ consecutive same type** — intersperse different types
6. **No single type >40%** — balanced distribution
7. **Use semantic zones**: hero, metrics, insights, content, media, resources, tags
8. **Width hints**: full (code/tables), half (callouts), third (stats/cards), quarter (badges)
9. **Every component must have complete props with real content** — do NOT leave title, value, label, or items empty

## URL Requirements (CRITICAL)
For LinkCard, ToolCard, RepoCard, BookCard:
- ONLY use complete absolute URLs starting with https://
- NEVER use relative paths or localhost
- If no valid URL exists, do NOT create the component

## Output Format (JSON only)

```json
{{
  "components": [
    {{
      "component_type": "TLDR",
      "priority": "high",
      "zone": "hero",
      "props": {{
        "content": "Brief summary text",
        "width_hint": "full"
      }}
    }},
    {{
      "component_type": "StatCard",
      "priority": "high",
      "zone": "metrics",
      "props": {{
        "value": "$196B",
        "label": "AI Market Size",
        "trend": "up",
        "trendValue": "+23%",
        "width_hint": "third"
      }}
    }}
  ],
  "variety_check": {{
    "unique_types_count": 8,
    "max_consecutive_same_type": 2,
    "meets_requirements": true
  }}
}}
```

Respond with valid JSON only."""


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def format_content_analysis_prompt(markdown_content: str) -> str:
    """Format content analysis prompt with truncated markdown."""
    max_length = 30000
    if len(markdown_content) > max_length:
        content = markdown_content[:max_length] + "\n\n[... content truncated ...]"
    else:
        content = markdown_content
    return CONTENT_ANALYSIS_PROMPT.format(markdown_content=content)


def format_layout_selection_prompt(content_analysis: dict) -> str:
    """Format layout selection prompt with content analysis results."""
    sections = content_analysis.get("sections") or []
    code_blocks = content_analysis.get("code_blocks") or []
    tables = content_analysis.get("tables") or []
    links = content_analysis.get("links") or []
    youtube_links = content_analysis.get("youtube_links") or []
    github_links = content_analysis.get("github_links") or []
    entities = content_analysis.get("entities") or {}

    analysis_text = f"""
Document Type: {content_analysis.get('document_type', 'unknown')}
Title: {content_analysis.get('title', 'Untitled')}
Sections: {len(sections)} sections
Code Blocks: {len(code_blocks)} code blocks
Tables: {len(tables)} tables
Links: {len(links)} links
YouTube: {len(youtube_links)} videos
GitHub: {len(github_links)} repositories

Entities:
- Technologies: {', '.join((entities.get('technologies') or [])[:10])}
- Tools: {', '.join((entities.get('tools') or [])[:10])}
- Languages: {', '.join((entities.get('languages') or [])[:10])}
- Concepts: {', '.join((entities.get('concepts') or [])[:5])}
"""
    return LAYOUT_SELECTION_PROMPT.format(content_analysis=analysis_text)


def format_component_selection_prompt(
    content_analysis: dict,
    layout_decision: dict,
) -> str:
    """Format component selection prompt with analysis and layout."""
    sections = content_analysis.get("sections") or []
    code_blocks = content_analysis.get("code_blocks") or []
    tables = content_analysis.get("tables") or []
    links = content_analysis.get("links") or []
    youtube_links = content_analysis.get("youtube_links") or []
    github_links = content_analysis.get("github_links") or []

    analysis_text = f"""
Document Type: {content_analysis.get('document_type', 'unknown')}
Title: {content_analysis.get('title', 'Untitled')}
Sections ({len(sections)} total): {sections[:30]}
Code Blocks: {len(code_blocks)} blocks
Tables: {len(tables)} tables
Links: {len(links)} total
Media: {len(youtube_links)} videos, {len(github_links)} repos
"""

    suggestions = (
        layout_decision.get("component_suggestions")
        or layout_decision.get("component_priorities")
        or []
    )
    layout_text = f"""
Selected Layout: {layout_decision.get('layout_type', 'unknown')}
Confidence: {layout_decision.get('confidence', 0.0):.2f}
Reasoning: {layout_decision.get('reasoning', '')}
Alternatives: {', '.join(layout_decision.get('alternative_layouts', []))}
Component Priorities: {', '.join(suggestions[:15])}
"""

    return COMPONENT_SELECTION_PROMPT.format(
        content_analysis=analysis_text,
        layout_decision=layout_text,
    )


def validate_component_variety(components: list[dict]) -> dict:
    """Validate component selection meets variety requirements."""
    if not components:
        return {
            "valid": False,
            "unique_types_count": 0,
            "max_consecutive_same_type": 0,
            "violations": ["No components provided"],
        }

    types = [c.get("component_type", "") for c in components]
    unique = set(types)
    unique_count = len(unique)

    # Check consecutive
    max_consecutive = 1
    current = 1
    for i in range(1, len(types)):
        if types[i] == types[i - 1]:
            current += 1
            max_consecutive = max(max_consecutive, current)
        else:
            current = 1

    meets_min = unique_count >= 4
    meets_consec = max_consecutive <= 2

    violations: list[str] = []
    if not meets_min:
        violations.append(f"Only {unique_count} unique types, need >= 4")
    if not meets_consec:
        violations.append(f"{max_consecutive} consecutive same type, max 2")

    # Dominance check
    meets_dominance = True
    distribution = {t: types.count(t) for t in unique}
    if len(components) >= 5:
        for comp_type, count in distribution.items():
            ratio = count / len(components)
            if ratio > 0.40:
                meets_dominance = False
                violations.append(
                    f"'{comp_type}' at {count}/{len(components)} ({ratio:.0%}), max 40%"
                )

    return {
        "valid": meets_min and meets_consec and meets_dominance,
        "unique_types_count": unique_count,
        "max_consecutive_same_type": max_consecutive,
        "violations": violations,
        "distribution": distribution,
    }
