"""Research Engine - Perplexity Replacement.

Pipeline:
1. Web search via DuckDuckGo Search
2. Format search results as context block
3. Send to LLM via Gateway backends for synthesis
4. Parse response, extract citation numbers [1] [2], map to URLs
5. Return ResearchResponse

Three modes:
- quick: 3 search results + fast model (Gemini Flash)
- deep: 10 results + longer synthesis + capable model
- reason: 5 results + step-by-step reasoning analysis
"""

from __future__ import annotations

import logging
import json
from datetime import datetime, timezone
from typing import Any

from ..llm import get_backend, get_healthy_backend, LLMConfig, LLMMessage

from .models import ResearchResponse, Citation

logger = logging.getLogger("marketing.research")

# Optional dependency
try:
    from duckduckgo_search import DDGS
    DDGS_AVAILABLE = True
except ImportError:
    DDGS_AVAILABLE = False
    logger.warning("duckduckgo-search not installed. Install with: pip install duckduckgo-search")


# ---------------------------------------------------------------------------
# Mode configurations
# ---------------------------------------------------------------------------

MODE_CONFIGS = {
    "quick": {
        "max_results": 3,
        "max_tokens": 2000,
        "temperature": 0.5,
        "prefer_fast": True,
    },
    "deep": {
        "max_results": 10,
        "max_tokens": 4000,
        "temperature": 0.7,
        "prefer_fast": False,
    },
    "reason": {
        "max_results": 5,
        "max_tokens": 3000,
        "temperature": 0.4,
        "prefer_fast": False,
    },
}


# ---------------------------------------------------------------------------
# System prompts
# ---------------------------------------------------------------------------

SYSTEM_PROMPT_QUICK = """You are a research assistant. Synthesize the provided web search results into a clear, concise answer.

CITATION RULES:
- Use inline citations [1], [2], [3] after each fact
- Number citations sequentially starting from [1]
- Each citation should reference ONE source
- Place citations immediately after the relevant sentence

Format your response in markdown with clear sections."""

SYSTEM_PROMPT_DEEP = """You are an expert research analyst. Synthesize the provided web search results into a comprehensive, well-structured report.

CITATION RULES:
- Use inline citations [1], [2], [3] after each fact
- Number citations sequentially starting from [1]
- Each citation should reference ONE source
- Place citations immediately after the relevant sentence

ANALYSIS REQUIREMENTS:
- Provide detailed coverage of the topic
- Include multiple perspectives when relevant
- Highlight key findings and insights
- Use clear section headings

Format your response in markdown."""

SYSTEM_PROMPT_REASON = """You are a reasoning research assistant. Analyze the provided web search results step-by-step.

CITATION RULES:
- Use inline citations [1], [2], [3] after each fact
- Number citations sequentially starting from [1]
- Each citation should reference ONE source
- Place citations immediately after the relevant sentence

REASONING REQUIREMENTS:
- Break down the analysis into clear steps
- Show your reasoning process
- Connect evidence from multiple sources
- Draw logical conclusions

Format your response in markdown with step-by-step sections."""


SYSTEM_PROMPTS = {
    "quick": SYSTEM_PROMPT_QUICK,
    "deep": SYSTEM_PROMPT_DEEP,
    "reason": SYSTEM_PROMPT_REASON,
}


# ---------------------------------------------------------------------------
# Research pipeline
# ---------------------------------------------------------------------------

async def research(
    query: str,
    mode: str = "quick",
    model: str | None = None,
    provider: str | None = None,
) -> ResearchResponse:
    """Execute research pipeline.

    Args:
        query: Research query
        mode: Research mode (quick, deep, reason)
        model: LLM model override
        provider: LLM provider override

    Returns:
        ResearchResponse with synthesized content and citations

    Raises:
        RuntimeError: If DuckDuckGo search is unavailable or search fails
    """
    if not DDGS_AVAILABLE:
        raise RuntimeError(
            "DuckDuckGo search is not available. Install with: pip install duckduckgo-search"
        )

    # Validate mode
    if mode not in MODE_CONFIGS:
        logger.warning(f"Invalid mode '{mode}', defaulting to 'quick'")
        mode = "quick"

    config = MODE_CONFIGS[mode]

    # Step 1: Web search
    logger.info(f"Searching DuckDuckGo: query={query}, max_results={config['max_results']}")
    search_results = await _web_search(query, max_results=config["max_results"])

    if not search_results:
        raise RuntimeError(f"No search results found for query: {query}")

    # Step 2: Build context block
    context_block = _format_search_context(search_results)

    # Step 3: LLM synthesis
    system_prompt = SYSTEM_PROMPTS[mode]
    user_prompt = f"""Query: {query}

Web search results:

{context_block}

Synthesize these results into a well-cited answer to the query."""

    logger.info(f"Calling LLM: mode={mode}, provider={provider}, model={model}")
    content = await _gateway_llm_call(
        prompt=user_prompt,
        system_prompt=system_prompt,
        max_tokens=config["max_tokens"],
        temperature=config["temperature"],
        model=model,
        provider=provider,
        prefer_fast=config["prefer_fast"],
    )

    # Step 4: Extract citations
    citations = _extract_citations(content, search_results)

    # Step 5: Build response
    return ResearchResponse(
        content=content,
        citations=citations,
        model_used=model or "gateway-auto",
        mode=mode,
        query=query,
        timestamp=datetime.now(timezone.utc).isoformat(),
    )


async def _web_search(query: str, max_results: int = 5) -> list[dict[str, Any]]:
    """Execute DuckDuckGo web search.

    Returns:
        List of search results with keys: title, url, snippet
    """
    try:
        ddgs = DDGS()
        results = ddgs.text(query, max_results=max_results)

        # Normalize result format
        normalized = []
        for i, result in enumerate(results, start=1):
            normalized.append({
                "index": i,
                "title": result.get("title", ""),
                "url": result.get("href", result.get("url", "")),
                "snippet": result.get("body", result.get("snippet", "")),
            })

        return normalized
    except Exception as e:
        logger.error(f"DuckDuckGo search failed: {e}")
        raise RuntimeError(f"Web search failed: {e}")


def _format_search_context(results: list[dict[str, Any]]) -> str:
    """Format search results as numbered context block."""
    lines = []
    for result in results:
        lines.append(f"[{result['index']}] {result['title']}")
        lines.append(f"URL: {result['url']}")
        lines.append(f"{result['snippet']}")
        lines.append("")
    return "\n".join(lines)


def _extract_citations(content: str, search_results: list[dict[str, Any]]) -> list[Citation]:
    """Extract citation numbers from content and map to search results."""
    citations = []

    # Build index -> result mapping
    index_map = {r["index"]: r for r in search_results}

    # Extract all citation numbers from content
    import re
    citation_pattern = r'\[(\d+)\]'
    found_citations = set()

    for match in re.finditer(citation_pattern, content):
        cite_num = int(match.group(1))
        if cite_num not in found_citations and cite_num in index_map:
            result = index_map[cite_num]
            citations.append(Citation(
                index=cite_num,
                url=result["url"],
                title=result["title"],
                snippet=result["snippet"],
            ))
            found_citations.add(cite_num)

    # Sort by index
    citations.sort(key=lambda c: c.index)

    return citations


async def _gateway_llm_call(
    prompt: str,
    system_prompt: str = "",
    max_tokens: int = 4000,
    temperature: float = 0.7,
    model: str | None = None,
    provider: str | None = None,
    prefer_fast: bool = False,
) -> str:
    """Call LLM via Gateway backend.

    If provider is specified (and not 'gateway-auto'), uses that backend directly.
    Otherwise falls back to the healthy backend chain.
    If prefer_fast=True, tries to use a fast model (Gemini Flash).
    """
    if provider and provider != "gateway-auto":
        backend = get_backend(provider)
    else:
        backend = await get_healthy_backend()

    messages: list[LLMMessage] = []
    if system_prompt:
        messages.append(LLMMessage(role="system", content=system_prompt))
    messages.append(LLMMessage(role="user", content=prompt))

    config = LLMConfig(
        model=model or "",
        temperature=temperature,
        max_tokens=max_tokens,
    )

    # Collect streaming response into full text
    chunks: list[str] = []
    async for event in backend.stream_chat(messages, config):
        if event.type == "delta" and event.text:
            chunks.append(event.text)
        elif event.type == "error":
            raise RuntimeError(f"LLM error: {event.error_message}")

    return "".join(chunks)
