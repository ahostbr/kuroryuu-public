"""Content Analyzer - Markdown parsing + LLM classification.

Ported from second-brain-research-dashboard agent/content_analyzer.py.
Uses Gateway's LLM backend instead of OpenRouter direct calls.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from .models import ContentAnalysis

logger = logging.getLogger("genui.content_analyzer")

# ---------------------------------------------------------------------------
# Regex patterns for link extraction
# ---------------------------------------------------------------------------

YOUTUBE_LINK_REGEX = re.compile(
    r"(?:https?://)?(?:www\.)?"
    r"(?:youtube\.com/(?:watch\?v=|embed/|v/|shorts/|live/)[a-zA-Z0-9_-]{6,13}|"
    r"youtu\.be/[a-zA-Z0-9_-]{6,13})"
    r"(?:[?&][^\s]*)?",
    re.IGNORECASE,
)

GITHUB_LINK_REGEX = re.compile(
    r"(?:https?://)?(?:www\.)?(?:"
    r"github\.com/[a-zA-Z0-9_-]+/[a-zA-Z0-9_.-]+(?:/[^\s)]*)?|"
    r"raw\.githubusercontent\.com/[a-zA-Z0-9_-]+/[a-zA-Z0-9_.-]+(?:/[^\s)]*)?|"
    r"gist\.github\.com/[a-zA-Z0-9_-]+(?:/[^\s)]*)?|"
    r"github\.io/[^\s)]*"
    r")",
    re.IGNORECASE,
)

URL_REGEX = re.compile(r"(?:https?://|www\.)[^\s)\]]+", re.IGNORECASE)
MARKDOWN_LINK_REGEX = re.compile(r"\[([^\]]+)\]\(([^)]+)\)", re.IGNORECASE)


# ---------------------------------------------------------------------------
# Markdown parsing (fast, no LLM)
# ---------------------------------------------------------------------------

def parse_markdown(content: str) -> dict[str, Any]:
    """Parse markdown to extract structural elements."""
    result: dict[str, Any] = {
        "title": "",
        "sections": [],
        "all_links": [],
        "youtube_links": [],
        "github_links": [],
        "code_blocks": [],
        "tables": [],
    }

    # Title (first H1)
    title_match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
    if title_match:
        result["title"] = title_match.group(1).strip()
    else:
        first_line = content.split("\n")[0].strip() if content else ""
        result["title"] = first_line[:100] if first_line else "Untitled Document"

    # Headers
    headers = re.compile(r"^(#{1,6})\s+(.+)$", re.MULTILINE).findall(content)
    result["sections"] = [h[1].strip() for h in headers]

    # Markdown links
    for _text, url in MARKDOWN_LINK_REGEX.findall(content):
        result["all_links"].append(url.strip())

    # Plain URLs
    for url in URL_REGEX.findall(content):
        cleaned = url.strip()
        if cleaned not in result["all_links"]:
            result["all_links"].append(cleaned)

    # YouTube / GitHub
    for m in YOUTUBE_LINK_REGEX.finditer(content):
        u = m.group(0)
        if u not in result["youtube_links"]:
            result["youtube_links"].append(u)

    for m in GITHUB_LINK_REGEX.finditer(content):
        u = m.group(0)
        if u not in result["github_links"]:
            result["github_links"].append(u)

    # Code blocks
    for lang, code in re.compile(r"```(\w*)\n(.*?)```", re.DOTALL).findall(content):
        result["code_blocks"].append({
            "language": lang.strip() if lang else "text",
            "code": code.strip(),
        })

    # Tables
    table_pattern = re.compile(
        r"(\|.+\|[\r\n]+\|[-:\s|]+\|[\r\n]+(?:\|.+\|[\r\n]+)*)",
        re.MULTILINE,
    )
    for table_text in table_pattern.findall(content):
        lines = [l.strip() for l in table_text.strip().split("\n") if l.strip()]
        if len(lines) >= 2:
            header_cells = [c.strip() for c in lines[0].split("|") if c.strip()]
            rows = []
            for line in lines[2:]:
                cells = [c.strip() for c in line.split("|") if c.strip()]
                if cells:
                    rows.append(cells)
            result["tables"].append({
                "headers": header_cells,
                "rows": rows,
                "row_count": len(rows),
            })

    return result


# ---------------------------------------------------------------------------
# Heuristic classification (no LLM needed)
# ---------------------------------------------------------------------------

def classify_heuristic(markdown: str, parsed: dict[str, Any]) -> str:
    """Rule-based document classification fallback."""
    lower = markdown.lower()

    if any(kw in lower for kw in ["step", "tutorial", "how to", "guide", "lesson", "walkthrough"]):
        return "tutorial"
    if any(kw in lower for kw in ["abstract", "methodology", "results", "conclusion", "references"]):
        return "research"
    if any(kw in lower for kw in ["api", "endpoint", "parameter", "function", "class"]) and len(parsed.get("code_blocks", [])) >= 2:
        return "technical_doc"
    if len(parsed.get("code_blocks", [])) >= 3:
        return "guide"
    if len(markdown) < 1000 and lower.count("\n- ") > 5:
        return "notes"
    return "article"


# ---------------------------------------------------------------------------
# Entity extraction (pattern matching)
# ---------------------------------------------------------------------------

_TECH_PATTERNS = [
    "React", "Vue", "Angular", "Node.js", "Express", "FastAPI", "Django", "Flask",
    "PostgreSQL", "MySQL", "MongoDB", "Redis", "Docker", "Kubernetes", "AWS", "Azure",
    "TensorFlow", "PyTorch", "Scikit-learn", "Pandas", "NumPy", "OpenAI", "Claude",
    "TypeScript", "JavaScript", "Rust", "Go", "Java", "C++", "C#", "Swift", "Kotlin",
]

_TOOL_PATTERNS = [
    "Git", "GitHub", "GitLab", "VS Code", "IntelliJ", "Webpack", "Vite", "npm", "yarn",
    "pip", "cargo", "gradle", "maven", "Jenkins", "CircleCI", "Playwright",
    "Selenium", "Jest", "Pytest", "Postman", "curl", "Jupyter",
]

_LANG_PATTERNS = [
    "Python", "JavaScript", "TypeScript", "Java", "C++", "C#", "Go", "Rust", "Ruby",
    "PHP", "Swift", "Kotlin", "Scala", "R", "Julia", "Haskell", "Elixir",
    "Dart", "Lua", "Shell", "Bash", "PowerShell", "SQL", "HTML", "CSS",
]


def extract_entities(markdown: str) -> dict[str, list[str]]:
    """Extract technology / tool / language / concept entities."""
    entities: dict[str, list[str]] = {
        "technologies": [],
        "tools": [],
        "languages": [],
        "concepts": [],
    }

    for tech in _TECH_PATTERNS:
        if re.search(r"\b" + re.escape(tech) + r"\b", markdown, re.IGNORECASE):
            entities["technologies"].append(tech)

    for tool in _TOOL_PATTERNS:
        if re.search(r"\b" + re.escape(tool) + r"\b", markdown, re.IGNORECASE):
            entities["tools"].append(tool)

    for lang in _LANG_PATTERNS:
        if re.search(r"\b" + re.escape(lang) + r"\b", markdown, re.IGNORECASE):
            entities["languages"].append(lang)

    # Concepts from headers
    for header in re.compile(r"^#{1,6}\s+(.+)$", re.MULTILINE).findall(markdown)[:10]:
        cleaned = header.strip()
        if len(cleaned) > 3:
            entities["concepts"].append(cleaned)

    return entities


# ---------------------------------------------------------------------------
# LLM-powered analysis (uses Gateway backend)
# ---------------------------------------------------------------------------

def _extract_json(response: str) -> dict:
    """Extract JSON from LLM response, handling code blocks."""
    # Try code block first
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", response)
    if m:
        text = m.group(1).strip()
    else:
        m = re.search(r"\{[\s\S]*\}", response)
        text = m.group(0) if m else response

    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return {}


async def analyze_content_with_llm(
    markdown_content: str,
    llm_call,
) -> dict[str, Any]:
    """Analyze content using Gateway LLM backend.

    Args:
        markdown_content: Raw markdown to analyze.
        llm_call: Async callable(prompt, system_prompt, **kwargs) -> str.

    Returns:
        Content analysis dict.
    """
    from .prompts import format_content_analysis_prompt

    system_prompt = (
        "You are an expert content analyst. Analyze documents and return structured JSON. "
        "Always respond with valid JSON only, no additional text."
    )
    prompt = format_content_analysis_prompt(markdown_content)

    logger.info("Analyzing content (prompt length: %d chars)", len(prompt))
    try:
        response = await llm_call(prompt, system_prompt)
        logger.info("Analysis response received (%d chars)", len(response))
    except Exception as e:
        logger.error("Content analysis LLM call failed: %s", e)
        response = ""

    result = _extract_json(response)

    if not result:
        parsed = parse_markdown(markdown_content)
        result = {
            "document_type": classify_heuristic(markdown_content, parsed),
            "title": parsed.get("title", "Untitled"),
            "entities": {"technologies": [], "tools": [], "languages": [], "concepts": []},
            "confidence": 0.5,
            "reasoning": "Fallback to heuristic analysis",
        }

    return result


async def analyze_content(
    markdown: str,
    llm_call=None,
) -> ContentAnalysis:
    """Full content analysis: parse + LLM classify + entity extraction.

    Args:
        markdown: Raw markdown content.
        llm_call: Optional async callable for LLM classification.

    Returns:
        ContentAnalysis model.
    """
    parsed = parse_markdown(markdown)
    entities = extract_entities(markdown)

    if llm_call:
        llm_result = await analyze_content_with_llm(markdown, llm_call)
        document_type = llm_result.get("document_type", "article")
        confidence = llm_result.get("confidence", 0.7)
        reasoning = llm_result.get("reasoning", "LLM classification")
        # Merge LLM entities with pattern-matched ones
        llm_entities = llm_result.get("entities", {})
        for key in entities:
            for item in llm_entities.get(key, []):
                if item not in entities[key]:
                    entities[key].append(item)
    else:
        document_type = classify_heuristic(markdown, parsed)
        confidence = 0.5
        reasoning = "Heuristic classification"

    return ContentAnalysis(
        title=parsed["title"],
        document_type=document_type,
        sections=parsed["sections"],
        links=parsed["all_links"],
        youtube_links=parsed["youtube_links"],
        github_links=parsed["github_links"],
        code_blocks=parsed["code_blocks"],
        tables=parsed["tables"],
        entities=entities,
        confidence=confidence,
        reasoning=reasoning,
    )
