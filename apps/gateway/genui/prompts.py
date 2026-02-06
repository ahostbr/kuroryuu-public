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

COMPONENT_SELECTION_PROMPT = """You are an expert A2UI component architect. Generate diverse dashboard components.

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

## VARIETY RULES (CRITICAL)

1. **Cover ALL major sections** - generate components for every section, not just first few
2. **Scale with size**: short (<500 words) 5-8, medium (500-2000) 10-15, long (2000+) 15-25
3. **Min 4 different types** - do NOT create 10 components of only 2-3 types
4. **No 3+ consecutive same type** - intersperse different types
5. **No single type >40%** - balanced distribution
6. **Use semantic zones**: hero, metrics, insights, content, media, resources, tags
7. **Width hints**: full (code/tables), half (callouts), third (stats/cards), quarter (badges)

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
