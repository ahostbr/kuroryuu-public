"""Web Scraper - Firecrawl Replacement.

Pipeline:
1. Launch headless Playwright browser (async)
2. Navigate to URL, wait for content load
3. Mode "markdown": Extract HTML → readability-lxml → clean → markdownify
4. Mode "screenshot": Full-page screenshot → save to output dir
5. Mode "extract": Extract + send to LLM for structured data
6. Return ScrapeResponse

Uses Playwright for browser automation, readability-lxml for content extraction,
and markdownify for HTML→Markdown conversion.
"""

from __future__ import annotations

import logging
import pathlib
import hashlib
from datetime import datetime, timezone
from typing import Any

from ..llm import get_backend, get_healthy_backend, LLMConfig, LLMMessage

from .models import ScrapeResponse

logger = logging.getLogger("marketing.scraper")

# Optional dependencies
try:
    from playwright.async_api import async_playwright, TimeoutError as PlaywrightTimeout
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False
    logger.warning("playwright not installed. Install with: pip install playwright && playwright install")

try:
    from readability import Document
    READABILITY_AVAILABLE = True
except ImportError:
    READABILITY_AVAILABLE = False
    logger.warning("readability-lxml not installed. Install with: pip install readability-lxml")

try:
    from markdownify import markdownify
    MARKDOWNIFY_AVAILABLE = True
except ImportError:
    MARKDOWNIFY_AVAILABLE = False
    logger.warning("markdownify not installed. Install with: pip install markdownify")


# Resolve paths
PROJECT_ROOT = pathlib.Path(__file__).resolve().parents[3]  # gateway -> apps -> Kuroryuu
TOOLS_DIR = PROJECT_ROOT / "tools" / "marketing"
OUTPUT_DIR = TOOLS_DIR / "output"


# ---------------------------------------------------------------------------
# Scraper pipeline
# ---------------------------------------------------------------------------

async def scrape(
    url: str,
    mode: str = "markdown",
    model: str | None = None,
    provider: str | None = None,
) -> ScrapeResponse:
    """Execute web scraping pipeline.

    Args:
        url: URL to scrape
        mode: Scrape mode (markdown, screenshot, extract)
        model: LLM model override (for extract mode)
        provider: LLM provider override (for extract mode)

    Returns:
        ScrapeResponse with scraped content

    Raises:
        RuntimeError: If required dependencies are missing or scraping fails
    """
    if not PLAYWRIGHT_AVAILABLE:
        raise RuntimeError(
            "Playwright is not available. Install with: pip install playwright && playwright install"
        )

    # Validate mode
    if mode not in {"markdown", "screenshot", "extract"}:
        logger.warning(f"Invalid mode '{mode}', defaulting to 'markdown'")
        mode = "markdown"

    # Ensure output directory exists
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    # Launch browser and fetch content
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()

        try:
            # Navigate to URL
            logger.info(f"Navigating to {url}")
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)

            # Wait for content to load
            await page.wait_for_load_state("networkidle", timeout=10000)

            # Get page title
            title = await page.title()

            # Mode-specific processing
            if mode == "markdown":
                content, word_count = await _extract_markdown(page)
            elif mode == "screenshot":
                content, word_count = await _take_screenshot(page, url)
            else:  # extract
                content, word_count = await _extract_structured(page, url, model, provider)

            await browser.close()

            return ScrapeResponse(
                content=content,
                title=title,
                url=url,
                word_count=word_count,
                extracted_at=datetime.now(timezone.utc).isoformat(),
                mode=mode,
            )

        except PlaywrightTimeout as e:
            await browser.close()
            raise RuntimeError(f"Page load timeout: {e}")
        except Exception as e:
            await browser.close()
            logger.error(f"Scraping failed: {e}")
            raise RuntimeError(f"Scraping failed: {e}")


async def _extract_markdown(page: Any) -> tuple[str, int]:
    """Extract page content as clean markdown.

    Returns:
        (markdown_content, word_count)
    """
    if not READABILITY_AVAILABLE:
        raise RuntimeError("readability-lxml is required for markdown mode. Install with: pip install readability-lxml")

    if not MARKDOWNIFY_AVAILABLE:
        raise RuntimeError("markdownify is required for markdown mode. Install with: pip install markdownify")

    # Get page HTML
    html = await page.content()

    # Extract main content with readability
    doc = Document(html)
    clean_html = doc.summary()

    # Convert to markdown
    markdown = markdownify(clean_html, heading_style="ATX")

    # Count words
    word_count = len(markdown.split())

    return markdown, word_count


async def _take_screenshot(page: Any, url: str) -> tuple[str, int]:
    """Take full-page screenshot.

    Returns:
        (screenshot_path, 0)
    """
    # Generate unique filename from URL
    url_hash = hashlib.md5(url.encode()).hexdigest()[:12]
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"screenshot_{timestamp}_{url_hash}.png"
    screenshot_path = OUTPUT_DIR / filename

    # Take screenshot
    logger.info(f"Taking screenshot: {screenshot_path}")
    await page.screenshot(path=str(screenshot_path), full_page=True)

    return str(screenshot_path), 0


async def _extract_structured(
    page: Any,
    url: str,
    model: str | None = None,
    provider: str | None = None,
) -> tuple[str, int]:
    """Extract structured data via LLM.

    Returns:
        (json_content, word_count)
    """
    # First get markdown content
    markdown, word_count = await _extract_markdown(page)

    # Truncate if too long (max ~8000 tokens ≈ 6000 words)
    MAX_WORDS = 6000
    if word_count > MAX_WORDS:
        words = markdown.split()[:MAX_WORDS]
        markdown = " ".join(words) + "\n\n[Content truncated...]"
        word_count = MAX_WORDS

    # Call LLM for structured extraction
    system_prompt = """You are a data extraction assistant. Extract structured information from the provided web page content.

Return a JSON object with the following fields:
- title: Page title
- summary: Brief summary (2-3 sentences)
- key_points: List of key points or findings
- entities: Object with lists of people, organizations, locations mentioned
- metadata: Any other relevant metadata (dates, categories, tags, etc.)

Return ONLY the JSON object, no markdown code fences."""

    user_prompt = f"""URL: {url}

Content:

{markdown}

Extract structured data from this web page."""

    logger.info(f"Calling LLM for structured extraction: provider={provider}, model={model}")
    json_content = await _gateway_llm_call(
        prompt=user_prompt,
        system_prompt=system_prompt,
        max_tokens=2000,
        temperature=0.3,
        model=model,
        provider=provider,
    )

    return json_content, word_count


async def _gateway_llm_call(
    prompt: str,
    system_prompt: str = "",
    max_tokens: int = 4000,
    temperature: float = 0.7,
    model: str | None = None,
    provider: str | None = None,
) -> str:
    """Call LLM via Gateway backend."""
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
