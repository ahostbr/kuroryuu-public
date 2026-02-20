---
name: Research
description: Market research via Gateway research engine - web search + LLM synthesis. Use when gathering competitive intelligence, market analysis, audience insights, or industry data.
version: 1.0.0
---

# RESEARCH TOOL

You have access to the Gateway research engine at `POST /v1/marketing/research`. This replaces Perplexity with local DuckDuckGo web search + LLM synthesis.

## Endpoint Reference

```bash
POST http://127.0.0.1:8200/v1/marketing/research
Content-Type: application/json

{
  "query": "string",           # Research query (required)
  "mode": "quick|deep|reason", # Default: "quick"
  "model": "string",           # Optional: override LLM model
  "provider": "string"         # Optional: override LLM provider
}
```

**Response shape:**
```json
{
  "content": "Synthesized research content...",
  "citations": ["https://source1.com", "https://source2.com"],
  "query": "original query",
  "mode": "quick"
}
```

## Modes

| Mode | Speed | Depth | Use When |
|------|-------|-------|----------|
| `quick` | ~10s | Surface | Fast competitive intel, quick facts |
| `deep` | ~30s | Thorough | Full market analysis, audience research |
| `reason` | ~45s | Analytical | Complex strategic questions, trend synthesis |

## Usage Pattern (Bash Tool)

```bash
curl -s -X POST http://127.0.0.1:8200/v1/marketing/research \
  -H "Content-Type: application/json" \
  -d '{"query": "SaaS pricing page conversion best practices 2026", "mode": "deep"}' \
  | python3 -c "import sys, json; d=json.load(sys.stdin); print(d['content'])"
```

**Or stream the raw response:**
```bash
curl -X POST http://127.0.0.1:8200/v1/marketing/research \
  -H "Content-Type: application/json" \
  -d '{"query": "competitor analysis for project management SaaS"}'
```

**GUI auto-display:** When you call this endpoint, the Research panel in the Desktop GUI automatically updates with the result. No extra steps needed.

## WebSearch Fallback

If the Gateway is unavailable (connection refused), fall back to the `WebSearch` tool directly:

```
WebSearch: query="SaaS pricing page conversion best practices 2026"
```

Then synthesize results manually before presenting.

## Research Workflows

### Competitive Intelligence
```bash
# 1. Landscape overview
curl ... -d '{"query": "top competitors in [niche] SaaS market 2026", "mode": "deep"}'

# 2. Specific competitor deep dive
curl ... -d '{"query": "[CompanyName] pricing, positioning, target audience", "mode": "quick"}'

# 3. Gap analysis
curl ... -d '{"query": "underserved segments in [niche] market", "mode": "reason"}'
```

### Audience Research
```bash
curl ... -d '{"query": "pain points of [ICP] who use [category] tools", "mode": "deep"}'
curl ... -d '{"query": "[ICP] buying criteria for [category] software", "mode": "reason"}'
```

### Market Sizing
```bash
curl ... -d '{"query": "[niche] market size TAM SAM SOM 2025 2026", "mode": "deep"}'
```

## Citation Formatting

Always include citations when presenting research to the user:

```markdown
## Market Analysis: [Topic]

[Synthesized content from research...]

**Sources:**
- [Source 1 title](https://url1.com)
- [Source 2 title](https://url2.com)
```

## Output Artifact

Save research results to:
```
ai/artifacts/marketing/research/{company_name}_{topic}_research.md
```

**File format:**
```markdown
# Research: [Topic]

**Query:** [original query]
**Mode:** [quick/deep/reason]
**Date:** [YYYY-MM-DD]

## Findings

[research content]

## Citations

- [url1]
- [url2]

## Key Takeaways

1. [Takeaway 1]
2. [Takeaway 2]
3. [Takeaway 3]
```

## Quality Checklist

Before presenting research:
- [ ] Used `deep` or `reason` mode for strategic decisions (not `quick`)
- [ ] Citations included and relevant
- [ ] Key takeaways extracted and clearly stated
- [ ] WebSearch fallback used if Gateway returned error
- [ ] Artifact saved to `ai/artifacts/marketing/research/`
- [ ] No hallucinated statistics — all claims sourced
