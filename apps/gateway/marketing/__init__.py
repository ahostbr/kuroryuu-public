"""Marketing Module - Research, Web Scraping, and Asset Generation.

Perplexity replacement: Research engine via DuckDuckGo + LLM synthesis.
Firecrawl replacement: Web scraper via Playwright + readability.
Asset generation: Images, voiceovers, music, video via cloned toolkits.

Endpoints registered at /v1/marketing/*.
"""

from .router import router

__all__ = ["router"]
