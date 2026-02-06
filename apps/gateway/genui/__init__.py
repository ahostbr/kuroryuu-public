"""GenUI - Generative UI Module.

A2UI component generation pipeline:
1. Content analysis (markdown parsing + LLM classification)
2. Layout selection (rule-based + LLM fallback)
3. Component generation (LLM-powered A2UI component specs)

Endpoints registered at /v1/genui/*.
"""

from .router import router

__all__ = ["router"]
