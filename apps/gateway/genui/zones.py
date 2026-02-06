"""Semantic zone definitions and default mappings for A2UI components.

Zones control dashboard layout grouping:
- hero: Top of page, prominent full-width content
- metrics: Key statistics and data
- insights: Key findings and observations
- content: Primary detailed content
- media: Videos, images, embeds
- resources: Links and references
- tags: Categories and labels
"""

from __future__ import annotations


ZONE_ORDER: list[str] = [
    "hero", "metrics", "insights", "content", "media", "resources", "tags"
]


# Default zone for each component type (without a2ui. prefix)
COMPONENT_DEFAULT_ZONES: dict[str, str] = {
    # Hero
    "TLDR": "hero",
    "ExecutiveSummary": "hero",
    # Metrics
    "StatCard": "metrics",
    "TrendIndicator": "metrics",
    "MetricRow": "metrics",
    "ProgressRing": "metrics",
    "MiniChart": "metrics",
    "ComparisonBar": "metrics",
    # Insights
    "KeyTakeaways": "insights",
    "CalloutCard": "insights",
    "QuoteCard": "insights",
    "ExpertTip": "insights",
    "RankedItem": "insights",
    "HeadlineCard": "insights",
    # Content
    "CodeBlock": "content",
    "DataTable": "content",
    "StepCard": "content",
    "ChecklistItem": "content",
    "ProConItem": "content",
    "BulletPoint": "content",
    "CommandCard": "content",
    "TableOfContents": "content",
    "ComparisonTable": "content",
    "FeatureMatrix": "content",
    "PricingTable": "content",
    "VsCard": "content",
    "Accordion": "content",
    "TimelineEvent": "content",
    "NewsTicker": "content",
    # Media
    "VideoCard": "media",
    "ImageCard": "media",
    "PlaylistCard": "media",
    "PodcastCard": "media",
    # Resources
    "LinkCard": "resources",
    "ToolCard": "resources",
    "BookCard": "resources",
    "RepoCard": "resources",
    "ProfileCard": "resources",
    "CompanyCard": "resources",
    # Tags
    "TagCloud": "tags",
    "CategoryBadge": "tags",
    "StatusIndicator": "tags",
    "PriorityBadge": "tags",
    "DifficultyBadge": "tags",
    "Tag": "tags",
    "Badge": "tags",
    "CategoryTag": "tags",
    "TagGroup": "tags",
    # Layout (default to content)
    "Section": "content",
    "Grid": "content",
    "Columns": "content",
    "Tabs": "content",
    "Carousel": "content",
    "Sidebar": "content",
}


# Default width hint for each component type
COMPONENT_DEFAULT_WIDTHS: dict[str, str] = {
    # Full width
    "TLDR": "full",
    "ExecutiveSummary": "full",
    "CodeBlock": "full",
    "DataTable": "full",
    "TableOfContents": "full",
    "Section": "full",
    "ComparisonTable": "full",
    "FeatureMatrix": "full",
    "PricingTable": "full",
    "BulletPoint": "full",
    "StepCard": "full",
    "CommandCard": "full",
    "TimelineEvent": "full",
    "NewsTicker": "full",
    # Half width
    "KeyTakeaways": "half",
    "QuoteCard": "half",
    "CalloutCard": "half",
    "VsCard": "half",
    "ExpertTip": "half",
    "RankedItem": "half",
    "ProConItem": "half",
    "ChecklistItem": "half",
    "HeadlineCard": "half",
    # Third width
    "StatCard": "third",
    "LinkCard": "third",
    "RepoCard": "third",
    "VideoCard": "third",
    "ToolCard": "third",
    "BookCard": "third",
    "ProfileCard": "third",
    "CompanyCard": "third",
    "TrendIndicator": "third",
    "MetricRow": "third",
    "ImageCard": "third",
    "MiniChart": "third",
    "ComparisonBar": "third",
    "ProgressRing": "third",
    "PlaylistCard": "third",
    "PodcastCard": "third",
    # Quarter width
    "Badge": "quarter",
    "Tag": "quarter",
    "CategoryBadge": "quarter",
    "DifficultyBadge": "quarter",
    "StatusIndicator": "quarter",
    "PriorityBadge": "quarter",
    "CategoryTag": "quarter",
}


def get_zone(component_type: str, explicit_zone: str | None = None) -> str:
    """Get the zone for a component, using explicit override or default."""
    if explicit_zone:
        return explicit_zone
    # Strip a2ui. prefix if present
    clean = component_type.replace("a2ui.", "")
    zone = COMPONENT_DEFAULT_ZONES.get(clean)
    if zone is None:
        # Case-insensitive fallback
        lower = clean.lower()
        for key, value in COMPONENT_DEFAULT_ZONES.items():
            if key.lower() == lower:
                return value
    return zone or "content"


def get_width(component_type: str, explicit_width: str | None = None) -> str:
    """Get the width hint for a component, using explicit override or default."""
    if explicit_width:
        return explicit_width
    clean = component_type.replace("a2ui.", "")
    return COMPONENT_DEFAULT_WIDTHS.get(clean, "full")
