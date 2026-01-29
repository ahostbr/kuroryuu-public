"""Semantic and code-aware chunking for RAG.

Provides:
- SemanticChunker: Structure-aware document splitting
- CodeChunker: Language-aware code splitting
- SimpleChunker: Fixed-size fallback

Replaces fixed 100-line chunks with intelligent splitting.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


# ============================================================================
# Data structures
# ============================================================================

@dataclass
class Chunk:
    """A chunk of content with metadata."""
    chunk_id: str
    path: str
    start_line: int
    end_line: int
    text: str
    metadata: Dict[str, Any] = field(default_factory=dict)


# ============================================================================
# Language patterns for code-aware chunking
# ============================================================================

LANGUAGE_PATTERNS: Dict[str, List[str]] = {
    # Python: class, function, async function definitions
    ".py": [
        r"^class\s+\w+",
        r"^def\s+\w+",
        r"^async\s+def\s+\w+",
        r"^@\w+",  # Decorators often mark boundaries
    ],
    # TypeScript/JavaScript
    ".ts": [
        r"^export\s+(default\s+)?(class|function|const|interface|type)",
        r"^(class|function|const|interface|type)\s+\w+",
        r"^async\s+function",
    ],
    ".tsx": [
        r"^export\s+(default\s+)?(class|function|const|interface|type)",
        r"^(class|function|const|interface|type)\s+\w+",
    ],
    ".js": [
        r"^(class|function|const)\s+\w+",
        r"^export\s+(default\s+)?(class|function|const)",
        r"^module\.exports",
    ],
    ".jsx": [
        r"^(class|function|const)\s+\w+",
        r"^export\s+(default\s+)?(class|function|const)",
    ],
    # Markdown: headers
    ".md": [
        r"^#{1,3}\s+",  # H1, H2, H3
        r"^---$",  # Horizontal rule
    ],
    # Go
    ".go": [
        r"^func\s+",
        r"^type\s+\w+\s+(struct|interface)",
    ],
    # Rust
    ".rs": [
        r"^(pub\s+)?(fn|struct|enum|impl|trait|mod)\s+",
    ],
    # YAML/TOML config files
    ".yaml": [r"^\w+:$"],
    ".yml": [r"^\w+:$"],
    ".toml": [r"^\[\w+"],
}


# ============================================================================
# Simple chunker (fallback)
# ============================================================================

class SimpleChunker:
    """
    Simple fixed-size chunking with overlap.

    Used as fallback when semantic chunking isn't applicable.
    """

    def __init__(
        self,
        chunk_size: int = 100,  # lines
        overlap: int = 10,  # lines
    ):
        self.chunk_size = chunk_size
        self.overlap = overlap

    def chunk(self, content: str, path: str) -> List[Chunk]:
        """Split content into fixed-size chunks."""
        lines = content.splitlines()
        chunks: List[Chunk] = []

        i = 0
        while i < len(lines):
            end = min(i + self.chunk_size, len(lines))
            chunk_lines = lines[i:end]
            chunk_text = "\n".join(chunk_lines)

            chunk_id = f"{path}:{i+1}-{end}"
            chunks.append(Chunk(
                chunk_id=chunk_id,
                path=path,
                start_line=i + 1,
                end_line=end,
                text=chunk_text,
            ))

            # Move forward with overlap
            i += self.chunk_size - self.overlap
            if i >= len(lines):
                break

        return chunks


# ============================================================================
# Code-aware chunker
# ============================================================================

class CodeChunker:
    """
    Language-aware chunking for source code.

    Splits at function/class definitions rather than arbitrary lines.
    Falls back to simple chunking for unknown languages.
    """

    def __init__(
        self,
        max_chunk_size: int = 150,  # max lines per chunk
        min_chunk_size: int = 20,   # min lines (merge small chunks)
        overlap: int = 5,           # overlap lines
    ):
        self.max_chunk_size = max_chunk_size
        self.min_chunk_size = min_chunk_size
        self.overlap = overlap
        self.simple_chunker = SimpleChunker(
            chunk_size=max_chunk_size,
            overlap=overlap
        )

    def _get_patterns(self, ext: str) -> List[re.Pattern]:
        """Get compiled patterns for file extension."""
        patterns = LANGUAGE_PATTERNS.get(ext.lower(), [])
        return [re.compile(p, re.MULTILINE) for p in patterns]

    def _find_boundaries(self, lines: List[str], patterns: List[re.Pattern]) -> List[int]:
        """Find line indices that are natural boundaries."""
        boundaries = [0]  # Start is always a boundary

        for i, line in enumerate(lines):
            for pattern in patterns:
                if pattern.match(line):
                    if i > 0:  # Don't add 0 twice
                        boundaries.append(i)
                    break

        boundaries.append(len(lines))  # End is always a boundary
        return sorted(set(boundaries))

    def chunk(self, content: str, path: str) -> List[Chunk]:
        """Split content at natural code boundaries."""
        ext = Path(path).suffix.lower()
        patterns = self._get_patterns(ext)

        # Fall back to simple chunking if no patterns
        if not patterns:
            return self.simple_chunker.chunk(content, path)

        lines = content.splitlines()
        if not lines:
            return []

        boundaries = self._find_boundaries(lines, patterns)
        chunks: List[Chunk] = []

        # Create chunks between boundaries
        for i in range(len(boundaries) - 1):
            start = boundaries[i]
            end = boundaries[i + 1]

            # Handle very large sections by splitting
            while start < end:
                chunk_end = min(start + self.max_chunk_size, end)
                chunk_lines = lines[start:chunk_end]
                chunk_text = "\n".join(chunk_lines)

                chunk_id = f"{path}:{start+1}-{chunk_end}"
                chunks.append(Chunk(
                    chunk_id=chunk_id,
                    path=path,
                    start_line=start + 1,
                    end_line=chunk_end,
                    text=chunk_text,
                    metadata={"language": ext.lstrip(".")},
                ))

                start = chunk_end

        # Merge small chunks
        chunks = self._merge_small_chunks(chunks)

        return chunks

    def _merge_small_chunks(self, chunks: List[Chunk]) -> List[Chunk]:
        """Merge chunks smaller than min_chunk_size."""
        if len(chunks) <= 1:
            return chunks

        merged: List[Chunk] = []
        current: Optional[Chunk] = None

        for chunk in chunks:
            if current is None:
                current = chunk
                continue

            current_lines = current.end_line - current.start_line + 1
            chunk_lines = chunk.end_line - chunk.start_line + 1

            # Merge if current is small and combined wouldn't exceed max
            if current_lines < self.min_chunk_size:
                combined_lines = current_lines + chunk_lines
                if combined_lines <= self.max_chunk_size:
                    # Merge
                    current = Chunk(
                        chunk_id=f"{current.path}:{current.start_line}-{chunk.end_line}",
                        path=current.path,
                        start_line=current.start_line,
                        end_line=chunk.end_line,
                        text=current.text + "\n" + chunk.text,
                        metadata=current.metadata,
                    )
                    continue

            merged.append(current)
            current = chunk

        if current:
            merged.append(current)

        return merged


# ============================================================================
# Semantic chunker (embedding-based)
# ============================================================================

class SemanticChunker:
    """
    Semantic chunking using embedding similarity.

    Finds natural break points where content changes topic.
    More expensive than code chunking but better for prose.
    """

    def __init__(
        self,
        max_chunk_size: int = 500,  # max characters
        similarity_threshold: float = 0.5,
    ):
        self.max_chunk_size = max_chunk_size
        self.similarity_threshold = similarity_threshold
        self._embedder = None

    def _get_embedder(self):
        """Lazy load embedder."""
        if self._embedder is None:
            from .embeddings import LocalEmbedder
            self._embedder = LocalEmbedder.get()
        return self._embedder

    def chunk(self, content: str, path: str) -> List[Chunk]:
        """Split content at semantic boundaries."""
        # Split into sentences/paragraphs first
        paragraphs = self._split_paragraphs(content)

        if len(paragraphs) <= 1:
            return [Chunk(
                chunk_id=f"{path}:1-{len(content.splitlines())}",
                path=path,
                start_line=1,
                end_line=len(content.splitlines()),
                text=content,
            )]

        try:
            embedder = self._get_embedder()
            from .embeddings import cosine_similarity

            # Embed all paragraphs
            embeddings = embedder.embed_batch([p["text"] for p in paragraphs])

            # Find boundaries where similarity drops
            boundaries = [0]
            for i in range(1, len(embeddings)):
                sim = cosine_similarity(embeddings[i-1], embeddings[i])
                if sim < self.similarity_threshold:
                    boundaries.append(i)
            boundaries.append(len(paragraphs))

            # Create chunks
            chunks: List[Chunk] = []
            for i in range(len(boundaries) - 1):
                start_idx = boundaries[i]
                end_idx = boundaries[i + 1]

                chunk_paragraphs = paragraphs[start_idx:end_idx]
                chunk_text = "\n\n".join(p["text"] for p in chunk_paragraphs)

                start_line = chunk_paragraphs[0]["start_line"]
                end_line = chunk_paragraphs[-1]["end_line"]

                chunks.append(Chunk(
                    chunk_id=f"{path}:{start_line}-{end_line}",
                    path=path,
                    start_line=start_line,
                    end_line=end_line,
                    text=chunk_text,
                ))

            return chunks

        except Exception as e:
            logger.warning(f"Semantic chunking failed, using simple chunking: {e}")
            simple = SimpleChunker()
            return simple.chunk(content, path)

    def _split_paragraphs(self, content: str) -> List[Dict[str, Any]]:
        """Split content into paragraphs with line numbers."""
        paragraphs = []
        current_para = []
        current_start = 1
        line_num = 0

        for line in content.splitlines():
            line_num += 1
            stripped = line.strip()

            if not stripped:
                # Empty line - end current paragraph
                if current_para:
                    paragraphs.append({
                        "text": "\n".join(current_para),
                        "start_line": current_start,
                        "end_line": line_num - 1,
                    })
                    current_para = []
                current_start = line_num + 1
            else:
                current_para.append(line)

        # Final paragraph
        if current_para:
            paragraphs.append({
                "text": "\n".join(current_para),
                "start_line": current_start,
                "end_line": line_num,
            })

        return paragraphs


# ============================================================================
# Auto-chunker (picks best strategy)
# ============================================================================

class AutoChunker:
    """
    Automatically selects best chunking strategy based on file type.

    - Code files → CodeChunker
    - Markdown → SemanticChunker or CodeChunker
    - Other → SimpleChunker
    """

    def __init__(self):
        self.code_chunker = CodeChunker()
        self.semantic_chunker = SemanticChunker()
        self.simple_chunker = SimpleChunker()

    def chunk(self, content: str, path: str) -> List[Chunk]:
        """Auto-select chunking strategy and chunk content."""
        ext = Path(path).suffix.lower()

        # Code files
        if ext in LANGUAGE_PATTERNS:
            return self.code_chunker.chunk(content, path)

        # Markdown - use semantic for prose, code for docs
        if ext in {".md", ".txt", ".rst"}:
            # Use code chunker (cheaper) for now
            # Could add semantic chunker for long prose
            return self.code_chunker.chunk(content, path)

        # Unknown - simple chunking
        return self.simple_chunker.chunk(content, path)


# ============================================================================
# Convenience functions
# ============================================================================

def chunk_file(path: Path, content: Optional[str] = None) -> List[Chunk]:
    """Chunk a file using auto-selected strategy."""
    if content is None:
        try:
            content = path.read_text(encoding="utf-8", errors="replace")
        except Exception as e:
            logger.error(f"Failed to read {path}: {e}")
            return []

    rel_path = str(path).replace("\\", "/")
    chunker = AutoChunker()
    return chunker.chunk(content, rel_path)


def chunks_to_dicts(chunks: List[Chunk]) -> List[Dict[str, Any]]:
    """Convert Chunk objects to dicts for serialization."""
    return [
        {
            "chunk_id": c.chunk_id,
            "path": c.path,
            "start_line": c.start_line,
            "end_line": c.end_line,
            "text": c.text,
            "metadata": c.metadata,
        }
        for c in chunks
    ]
