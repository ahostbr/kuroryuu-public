"""Cross-encoder re-ranking for two-stage retrieval.

Provides:
- Reranker: Cross-encoder based re-ranking

Model: ms-marco-MiniLM-L-6-v2 (default)
- Trained on MS MARCO passage ranking
- ~50MB download on first use
- Slower than bi-encoder but more accurate
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    from .paths import get_project_root
except ImportError:
    from paths import get_project_root

logger = logging.getLogger(__name__)


# ============================================================================
# Configuration
# ============================================================================

def _get_reranker_model() -> str:
    """Get reranker model name from env."""
    return os.environ.get(
        "KURORYUU_RAG_RERANKER_MODEL",
        "cross-encoder/ms-marco-MiniLM-L-6-v2"
    )


def _get_cache_dir() -> Path:
    """Get model cache directory."""
    default = get_project_root() / "ai" / "models"
    return Path(os.environ.get("KURORYUU_MODEL_CACHE_DIR", str(default)))


def _get_default_candidates() -> int:
    """Get default number of candidates to retrieve for re-ranking."""
    return int(os.environ.get("KURORYUU_RAG_RERANK_CANDIDATES", "20"))


# ============================================================================
# Reranker
# ============================================================================

class Reranker:
    """
    Cross-encoder re-ranker for two-stage retrieval.

    Two-stage retrieval:
    1. Fast retrieval (BM25 + vector) → many candidates
    2. Cross-encoder scoring → top k precise results

    The cross-encoder sees (query, document) pairs together,
    enabling richer semantic comparison than bi-encoders.
    """

    _instance: Optional["Reranker"] = None
    _model: Any = None

    def __init__(self, model_name: Optional[str] = None):
        self.model_name = model_name or _get_reranker_model()

    @classmethod
    def get(cls) -> "Reranker":
        """Get singleton instance (lazy loading)."""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _load_model(self) -> Any:
        """Load model lazily."""
        if Reranker._model is not None:
            return Reranker._model

        try:
            from sentence_transformers import CrossEncoder

            logger.info(f"Loading reranker model: {self.model_name}")
            cache_dir = _get_cache_dir()
            cache_dir.mkdir(parents=True, exist_ok=True)

            # CrossEncoder doesn't use cache_folder in constructor
            # It uses HuggingFace's default cache
            Reranker._model = CrossEncoder(self.model_name)
            logger.info(f"Reranker model loaded: {self.model_name}")

            return Reranker._model

        except ImportError:
            raise RuntimeError(
                "sentence-transformers not installed. "
                "Install with: pip install sentence-transformers"
            )

    def rerank(
        self,
        query: str,
        candidates: List[Dict[str, Any]],
        top_k: int = 5,
        text_key: str = "text"
    ) -> List[Dict[str, Any]]:
        """
        Re-rank candidates using cross-encoder.

        Args:
            query: Search query
            candidates: List of candidate dicts with text content
            top_k: Number of results to return
            text_key: Key in candidate dict containing text (default: "text")

        Returns:
            Top k candidates sorted by cross-encoder score
        """
        if not candidates:
            return []

        model = self._load_model()

        # Build (query, document) pairs
        pairs = []
        valid_candidates = []

        for c in candidates:
            text = c.get(text_key, "")
            if text:
                pairs.append([query, text])
                valid_candidates.append(c)

        if not pairs:
            return []

        # Score all pairs
        scores = model.predict(pairs)

        # Combine candidates with scores and sort
        reranked = sorted(
            zip(valid_candidates, scores),
            key=lambda x: x[1],
            reverse=True
        )

        # Return top k with updated scores
        results = []
        for candidate, score in reranked[:top_k]:
            result = dict(candidate)
            result["score"] = float(score)
            result["match_kind"] = "reranked"
            results.append(result)

        return results

    def score_pair(self, query: str, document: str) -> float:
        """Score a single (query, document) pair."""
        model = self._load_model()
        return float(model.predict([[query, document]])[0])


# ============================================================================
# Convenience functions
# ============================================================================

def get_reranker() -> Reranker:
    """Get default reranker instance."""
    return Reranker.get()


def rerank(
    query: str,
    candidates: List[Dict[str, Any]],
    top_k: int = 5,
    text_key: str = "text"
) -> List[Dict[str, Any]]:
    """Re-rank candidates using default reranker."""
    return get_reranker().rerank(query, candidates, top_k, text_key)
