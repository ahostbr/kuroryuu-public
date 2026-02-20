---
name: Web Scraper
description: Scrape web pages via Gateway Playwright automation. Use when extracting competitor landing pages, pricing, copy, or any web content for marketing analysis.
version: 1.0.0
---

# WEB SCRAPER TOOL

You have access to the Gateway web scraper at `POST /v1/marketing/scrape`. This replaces Firecrawl with local Playwright browser automation.

## Endpoint Reference

```bash
POST http://127.0.0.1:8200/v1/marketing/scrape
Content-Type: application/json

{
  "url": "https://example.com",              # URL to scrape (required)
  "mode": "markdown|screenshot|extract",     # Default: "markdown"
  "model": "string",                         # Optional: LLM for extract mode
  "provider": "string"                       # Optional: LLM provider for extract mode
}
```

**Response shape:**
```json
{
  "content": "# Page Title\n\nExtracted markdown content...",
  "url": "https://example.com",
  "mode": "markdown",
  "metadata": {}
}
```

## Modes

| Mode | Output | Use When |
|------|--------|----------|
| `markdown` | Clean markdown text | Extracting copy, pricing, features |
| `screenshot` | Base64 image or path | Visual reference for design inspiration |
| `extract` | Structured data (LLM-parsed) | Pulling specific fields (price, features) |

## Usage Pattern (Bash Tool)

```bash
# Extract competitor landing page as markdown
curl -s -X POST http://127.0.0.1:8200/v1/marketing/scrape \
  -H "Content-Type: application/json" \
  -d '{"url": "https://competitor.com/pricing", "mode": "markdown"}' \
  | python3 -c "import sys, json; d=json.load(sys.stdin); print(d['content'])"
```

**GUI auto-display:** When you call this endpoint, the Web Scraper panel in the Desktop GUI automatically updates with the result.

## Competitive Intel Workflow

```bash
# 1. Scrape competitor homepage for positioning copy
curl ... -d '{"url": "https://competitor.com", "mode": "markdown"}'

# 2. Scrape pricing page for price points and tier names
curl ... -d '{"url": "https://competitor.com/pricing", "mode": "markdown"}'

# 3. Scrape features page for capabilities map
curl ... -d '{"url": "https://competitor.com/features", "mode": "markdown"}'
```

## Bulk Scraping Pattern

When analyzing multiple competitors:

```bash
for url in \
  "https://competitor1.com" \
  "https://competitor2.com" \
  "https://competitor3.com"; do
  echo "=== Scraping $url ==="
  curl -s -X POST http://127.0.0.1:8200/v1/marketing/scrape \
    -H "Content-Type: application/json" \
    -d "{\"url\": \"$url\", \"mode\": \"markdown\"}" \
    | python3 -c "import sys, json; d=json.load(sys.stdin); print(d.get('content','ERROR')[:2000])"
  echo ""
done
```

## Extract Mode (Structured Data)

Use `extract` mode when you need specific fields:

```bash
curl -X POST http://127.0.0.1:8200/v1/marketing/scrape \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://competitor.com/pricing",
    "mode": "extract"
  }'
```

The LLM will parse the page and return structured pricing/feature data.

## What to Look For

When analyzing scraped competitor pages:
1. **Hero copy** — Headline, subheadline, primary CTA
2. **Value proposition** — What promise do they make?
3. **Unique mechanism** — What proprietary process/tech do they claim?
4. **Social proof** — Customer logos, testimonials, case study metrics
5. **Pricing structure** — Tier names, price points, what's included
6. **Objection handling** — FAQs, guarantees, risk reversal

## Output Artifact

Save scraped content to:
```
ai/artifacts/marketing/scrape/{domain}_{page}.md
```

**File format:**
```markdown
# Scrape: [Domain] - [Page]

**URL:** [url]
**Date:** [YYYY-MM-DD]
**Mode:** markdown

## Raw Content

[scraped markdown]

## Analysis Notes

**Hero Copy:** [extracted headline]
**Primary CTA:** [button text]
**Unique Mechanism:** [their claim]
**Pricing:** [price points]
```

## Quality Checklist

Before using scraped data:
- [ ] Verified URL is accessible (not behind auth wall)
- [ ] Used `markdown` mode for text extraction (most reliable)
- [ ] Extracted key marketing elements (hero, CTA, pricing, proof)
- [ ] Saved artifact to `ai/artifacts/marketing/scrape/`
- [ ] Noted scrape date (web content changes)
- [ ] Cross-referenced with research tool for additional context
