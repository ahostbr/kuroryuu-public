"""Layout Selector - Rule-based + LLM-powered layout selection.

Ported from second-brain-research-dashboard agent/layout_selector.py.
10 layout types matched to content characteristics.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from .models import ContentAnalysis, LayoutDecision

logger = logging.getLogger("genui.layout_selector")


# ---------------------------------------------------------------------------
# Content type -> layout mappings
# ---------------------------------------------------------------------------

LAYOUT_MAPPINGS: dict[str, dict[str, Any]] = {
    "tutorial": {
        "layout": "instructional_layout",
        "components": ["CodeBlock", "StepCard", "CalloutCard", "CommandCard", "TableOfContents"],
    },
    "research": {
        "layout": "data_layout",
        "components": ["DataTable", "StatCard", "ComparisonTable", "QuoteCard", "MiniChart"],
    },
    "article": {
        "layout": "news_layout",
        "components": ["HeadlineCard", "TLDR", "QuoteCard", "LinkCard", "TagCloud"],
    },
    "guide": {
        "layout": "list_layout",
        "components": ["ChecklistItem", "StepCard", "CalloutCard", "Accordion", "TableOfContents"],
    },
    "notes": {
        "layout": "summary_layout",
        "components": ["KeyTakeaways", "TagCloud", "CalloutCard", "BulletPoint", "StatCard"],
    },
    "technical_doc": {
        "layout": "reference_layout",
        "components": ["CodeBlock", "DataTable", "CommandCard", "TableOfContents", "CalloutCard"],
    },
    "overview": {
        "layout": "media_layout",
        "components": ["ExecutiveSummary", "VideoCard", "StatCard", "TimelineEvent", "TagCloud"],
    },
}


# ---------------------------------------------------------------------------
# Rule-based selection
# ---------------------------------------------------------------------------

def _apply_rule_based(analysis: ContentAnalysis) -> LayoutDecision | None:
    """Try deterministic rule-based layout selection."""
    code_count = len(analysis.code_blocks)
    table_count = len(analysis.tables)
    media_count = len(analysis.youtube_links) + len(analysis.github_links)
    section_count = len(analysis.sections)

    if code_count > 5:
        return LayoutDecision(
            layout_type="instructional_layout",
            confidence=0.9,
            reasoning=f"High code block count ({code_count})",
            alternative_layouts=["reference_layout", "list_layout"],
            component_suggestions=LAYOUT_MAPPINGS["tutorial"]["components"],
        )

    if table_count > 2:
        return LayoutDecision(
            layout_type="data_layout",
            confidence=0.85,
            reasoning=f"High table count ({table_count})",
            alternative_layouts=["reference_layout", "summary_layout"],
            component_suggestions=LAYOUT_MAPPINGS["research"]["components"],
        )

    if media_count > 3:
        return LayoutDecision(
            layout_type="media_layout",
            confidence=0.88,
            reasoning=f"High media count ({media_count})",
            alternative_layouts=["news_layout", "summary_layout"],
            component_suggestions=LAYOUT_MAPPINGS["overview"]["components"],
        )

    if section_count > 10:
        return LayoutDecision(
            layout_type="reference_layout",
            confidence=0.82,
            reasoning=f"High section count ({section_count})",
            alternative_layouts=["list_layout", "instructional_layout"],
            component_suggestions=LAYOUT_MAPPINGS["technical_doc"]["components"],
        )

    return None


def _from_document_type(analysis: ContentAnalysis) -> LayoutDecision:
    """Map document type to layout."""
    mapping = LAYOUT_MAPPINGS.get(analysis.document_type)
    if mapping:
        alternatives = [
            m["layout"]
            for dt, m in LAYOUT_MAPPINGS.items()
            if dt != analysis.document_type
        ][:3]
        return LayoutDecision(
            layout_type=mapping["layout"],
            confidence=0.75,
            reasoning=f"Document type '{analysis.document_type}' maps to {mapping['layout']}",
            alternative_layouts=alternatives,
            component_suggestions=mapping["components"],
        )

    return LayoutDecision(
        layout_type="summary_layout",
        confidence=0.6,
        reasoning=f"Unknown type '{analysis.document_type}', defaulting to summary",
        alternative_layouts=["news_layout", "list_layout", "media_layout"],
        component_suggestions=LAYOUT_MAPPINGS["notes"]["components"],
    )


# ---------------------------------------------------------------------------
# LLM-based selection
# ---------------------------------------------------------------------------

async def _select_with_llm(
    analysis: ContentAnalysis,
    llm_call,
) -> LayoutDecision:
    """Use LLM for ambiguous layout selection."""
    from .prompts import format_layout_selection_prompt

    analysis_dict = analysis.model_dump()
    system_prompt = (
        "You are an expert UI/UX designer. Select optimal layouts and return structured JSON. "
        "Always respond with valid JSON only, no additional text."
    )
    prompt = format_layout_selection_prompt(analysis_dict)

    try:
        response = await llm_call(prompt, system_prompt)
        # Extract JSON
        m = re.search(r"```(?:json)?\s*([\s\S]*?)```", response)
        text = m.group(1).strip() if m else response
        m2 = re.search(r"\{[\s\S]*\}", text)
        text = m2.group(0) if m2 else text
        result = json.loads(text)
    except Exception as e:
        logger.warning("LLM layout selection failed: %s", e)
        return _from_document_type(analysis)

    layout_type = result.get("layout_type", "summary_layout")
    confidence = float(result.get("confidence", 0.7))
    reasoning = result.get("reasoning", "LLM analysis")
    alternatives = result.get("alternative_layouts", [])[:3]

    # Component suggestions from mapping
    components: list[str] = []
    for _dt, mapping in LAYOUT_MAPPINGS.items():
        if mapping["layout"] == layout_type:
            components = mapping["components"]
            break

    return LayoutDecision(
        layout_type=layout_type,
        confidence=confidence,
        reasoning=f"LLM: {reasoning}",
        alternative_layouts=alternatives,
        component_suggestions=components or result.get("component_priorities", []),
    )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

async def select_layout(
    analysis: ContentAnalysis,
    llm_call=None,
) -> LayoutDecision:
    """Select optimal layout using rules, document type, and optional LLM.

    Args:
        analysis: Content analysis result.
        llm_call: Optional async callable for LLM fallback.

    Returns:
        LayoutDecision with selected layout and metadata.
    """
    # Step 1: Rule-based
    rule_decision = _apply_rule_based(analysis)
    if rule_decision and rule_decision.confidence >= 0.85:
        logger.info("Rule-based layout: %s (%.2f)", rule_decision.layout_type, rule_decision.confidence)
        return rule_decision

    # Step 2: Document type mapping
    type_decision = _from_document_type(analysis)

    # Step 3: Decent rule match
    if rule_decision and rule_decision.confidence >= 0.80:
        logger.info("Rule-based layout: %s (%.2f)", rule_decision.layout_type, rule_decision.confidence)
        return rule_decision

    # Step 4: LLM if available and confidence low
    if llm_call and type_decision.confidence < 0.75:
        llm_decision = await _select_with_llm(analysis, llm_call)
        logger.info("LLM layout: %s (%.2f)", llm_decision.layout_type, llm_decision.confidence)
        return llm_decision

    # Step 5: Best available
    if rule_decision and rule_decision.confidence > type_decision.confidence:
        return rule_decision

    logger.info("Type-based layout: %s (%.2f)", type_decision.layout_type, type_decision.confidence)
    return type_decision
