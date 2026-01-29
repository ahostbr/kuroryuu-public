"""Embedding providers for semantic search.

Provides:
- LocalEmbedder: sentence-transformers based (free, offline)
- Cosine similarity helper

Default model: all-MiniLM-L6-v2 (384 dimensions, ~90MB)
"""

from __future__ import annotations

import logging
import os
from abc import ABC, abstractmethod
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

try:
    from .paths import get_project_root
except ImportError:
    from paths import get_project_root

logger = logging.getLogger(__name__)

# ============================================================================
# Configuration
# ============================================================================

def _get_embedding_model() -> str:
    """Get embedding model name from env."""
    return os.environ.get(
        "KURORYUU_RAG_EMBEDDING_MODEL",
        "all-MiniLM-L6-v2"
    )


def _get_cache_dir() -> Path:
    """Get model cache directory."""
    default = get_project_root() / "ai" / "models"
    return Path(os.environ.get("KURORYUU_MODEL_CACHE_DIR", str(default)))


# ============================================================================
# Abstract base
# ============================================================================

class EmbeddingProvider(ABC):
    """Abstract embedding provider interface."""

    @abstractmethod
    def embed_text(self, text: str) -> List[float]:
        """Embed a single text string."""
        ...

    @abstractmethod
    def embed_batch(self, texts: List[str], show_progress: bool = False) -> List[List[float]]:
        """Embed multiple texts."""
        ...

    @property
    @abstractmethod
    def dimension(self) -> int:
        """Return embedding dimension."""
        ...


# ============================================================================
# Local embedder (sentence-transformers)
# ============================================================================

class LocalEmbedder(EmbeddingProvider):
    """
    Local embedding using sentence-transformers.

    Model: all-MiniLM-L6-v2 (default)
    - 384 dimensions
    - ~90MB download on first use
    - Fast inference (~1000 texts/sec on CPU)
    """

    _instance: Optional["LocalEmbedder"] = None
    _model: Any = None

    def __init__(self, model_name: Optional[str] = None):
        self.model_name = model_name or _get_embedding_model()
        self._dim: Optional[int] = None

    @classmethod
    def get(cls) -> "LocalEmbedder":
        """Get singleton instance (lazy loading)."""
        if cls._instance is None:
            cls._instance = cls()
        return cls._instance

    def _load_model(self) -> Any:
        """Load model lazily."""
        if LocalEmbedder._model is not None:
            return LocalEmbedder._model

        try:
            from sentence_transformers import SentenceTransformer

            logger.info(f"Loading embedding model: {self.model_name}")
            cache_dir = _get_cache_dir()
            cache_dir.mkdir(parents=True, exist_ok=True)

            LocalEmbedder._model = SentenceTransformer(
                self.model_name,
                cache_folder=str(cache_dir)
            )
            self._dim = LocalEmbedder._model.get_sentence_embedding_dimension()
            logger.info(f"Model loaded: {self.model_name} ({self._dim} dims)")

            return LocalEmbedder._model

        except ImportError:
            raise RuntimeError(
                "sentence-transformers not installed. "
                "Install with: pip install sentence-transformers"
            )

    def embed_text(self, text: str) -> List[float]:
        """Embed a single text string."""
        model = self._load_model()

        # Truncate very long texts (model has max length)
        max_len = 512 * 4  # ~512 tokens * 4 chars
        if len(text) > max_len:
            text = text[:max_len]

        embedding = model.encode(text, convert_to_numpy=True)
        return embedding.tolist()

    def embed_batch(
        self,
        texts: List[str],
        show_progress: bool = False,
        batch_size: int = 32
    ) -> List[List[float]]:
        """Embed multiple texts with batching."""
        if not texts:
            return []

        model = self._load_model()

        # Truncate long texts
        max_len = 512 * 4
        texts = [t[:max_len] if len(t) > max_len else t for t in texts]

        embeddings = model.encode(
            texts,
            convert_to_numpy=True,
            show_progress_bar=show_progress,
            batch_size=batch_size
        )

        return embeddings.tolist()

    @property
    def dimension(self) -> int:
        """Return embedding dimension."""
        if self._dim is None:
            self._load_model()
        return self._dim or 384  # Default for MiniLM


# ============================================================================
# Similarity functions
# ============================================================================

def cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
    """
    Compute cosine similarity between two vectors.

    Returns value in [-1, 1], where 1 is identical.
    """
    a = np.array(vec_a, dtype=np.float32)
    b = np.array(vec_b, dtype=np.float32)

    dot = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)

    if norm_a == 0 or norm_b == 0:
        return 0.0

    return float(dot / (norm_a * norm_b))


def cosine_similarity_batch(
    query: List[float],
    candidates: List[List[float]]
) -> List[float]:
    """
    Compute cosine similarity between query and multiple candidates.

    Optimized for batch computation.
    """
    if not candidates:
        return []

    q = np.array(query, dtype=np.float32)
    c = np.array(candidates, dtype=np.float32)

    # Normalize
    q_norm = q / (np.linalg.norm(q) + 1e-8)
    c_norms = c / (np.linalg.norm(c, axis=1, keepdims=True) + 1e-8)

    # Dot product
    similarities = np.dot(c_norms, q_norm)

    return similarities.tolist()


# ============================================================================
# Embedding cache
# ============================================================================

class EmbeddingCache:
    """
    Simple file-based embedding cache.

    Avoids re-embedding unchanged content.
    """

    def __init__(self, cache_path: Optional[Path] = None):
        self.cache_path = cache_path or (_get_cache_dir() / "embedding_cache.json")
        self._cache: Dict[str, List[float]] = {}
        self._loaded = False

    def _load(self) -> None:
        """Load cache from disk."""
        if self._loaded:
            return

        if self.cache_path.exists():
            try:
                import json
                with self.cache_path.open("r", encoding="utf-8") as f:
                    self._cache = json.load(f)
                logger.debug(f"Loaded {len(self._cache)} cached embeddings")
            except Exception as e:
                logger.warning(f"Failed to load embedding cache: {e}")
                self._cache = {}

        self._loaded = True

    def _save(self) -> None:
        """Save cache to disk."""
        try:
            import json
            self.cache_path.parent.mkdir(parents=True, exist_ok=True)
            with self.cache_path.open("w", encoding="utf-8") as f:
                json.dump(self._cache, f)
        except Exception as e:
            logger.warning(f"Failed to save embedding cache: {e}")

    def _hash_text(self, text: str) -> str:
        """Create hash key for text."""
        import hashlib
        return hashlib.md5(text.encode("utf-8")).hexdigest()

    def get(self, text: str) -> Optional[List[float]]:
        """Get cached embedding."""
        self._load()
        key = self._hash_text(text)
        return self._cache.get(key)

    def put(self, text: str, embedding: List[float]) -> None:
        """Cache embedding."""
        self._load()
        key = self._hash_text(text)
        self._cache[key] = embedding

    def save(self) -> None:
        """Persist cache to disk."""
        self._save()


# ============================================================================
# Convenience functions
# ============================================================================

@lru_cache(maxsize=1)
def get_embedder() -> LocalEmbedder:
    """Get default embedder instance."""
    return LocalEmbedder.get()


def embed_text(text: str) -> List[float]:
    """Embed text using default embedder."""
    return get_embedder().embed_text(text)


def embed_batch(texts: List[str], show_progress: bool = False) -> List[List[float]]:
    """Embed texts using default embedder."""
    return get_embedder().embed_batch(texts, show_progress=show_progress)
