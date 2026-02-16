"""RAG tools - keyword-based search with optional semantic mode.

Provides:
- k_rag: Routed tool for search operations

Actions:
- help: Show available actions
- query: Search project files by keyword (ripgrep or pure Python fallback)
- status: Check RAG index status
- index: Build/rebuild RAG index

Default mode: keyword_fallback (always available, no extra deps)
Ripgrep (rg) is used if available for faster searches.
"""

from __future__ import annotations

import asyncio
import datetime as dt
import json
import math
import os
import re
import shutil
import subprocess
import time
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List, Optional, Set, Tuple

import numpy as np

try:
    from .paths import get_project_root
except ImportError:
    from paths import get_project_root

# ============================================================================
# Configuration
# ============================================================================

def _get_project_root() -> Path:
    """Get project root from env or centralized paths."""
    return get_project_root()


def _get_index_dir() -> Path:
    """Get RAG index directory from env or default."""
    default = get_project_root() / "WORKING" / "rag_index"
    return Path(os.environ.get("KURORYUU_RAG_INDEX_DIR", str(default))).resolve()


def _get_max_file_bytes() -> int:
    """Get max file size to scan."""
    return int(os.environ.get("KURORYUU_RAG_MAX_FILE_BYTES", "1500000"))


def _get_default_exts() -> Set[str]:
    """Get default file extensions to search."""
    default = ".py,.md,.txt,.json,.yml,.yaml,.ts,.tsx,.js,.jsx,.html,.css,.log,.jsonl,.ps1,.sh,.bat"
    exts_str = os.environ.get("KURORYUU_RAG_DEFAULT_EXTS", default)
    return {e.strip().lower() if e.startswith(".") else f".{e.strip().lower()}" for e in exts_str.split(",") if e.strip()}


def _use_ripgrep() -> bool:
    """Check if ripgrep should be used."""
    return os.environ.get("KURORYUU_RAG_USE_RG", "1").strip() in ("1", "true", "yes")


def _allow_external_root() -> bool:
    """Check if external roots are allowed."""
    return os.environ.get("KURORYUU_ALLOW_EXTERNAL_ROOT", "0").strip() in ("1", "true", "yes")


def _validate_root(root: Optional[str]) -> Tuple[Path, List[str]]:
    """Validate and resolve root path. Returns (resolved_path, warnings)."""
    warnings: List[str] = []
    project_root = _get_project_root()

    if not root:
        return project_root, warnings

    try:
        # Prevent traversal attacks
        if ".." in root:
            warnings.append(f"Path traversal rejected: {root}")
            return project_root, warnings

        resolved = Path(root).resolve()

        # Check if under project root
        try:
            resolved.relative_to(project_root)
            return resolved, warnings
        except ValueError:
            pass

        # External root - check if allowed
        if _allow_external_root():
            warnings.append(f"Using external root: {resolved}")
            return resolved, warnings
        else:
            warnings.append(f"External root rejected (set KURORYUU_ALLOW_EXTERNAL_ROOT=1 to allow): {resolved}")
            return project_root, warnings
    except Exception as e:
        warnings.append(f"Invalid root path: {e}")
        return project_root, warnings


# ============================================================================
# Ripgrep integration
# ============================================================================

def _find_ripgrep() -> Optional[str]:
    """Find ripgrep executable."""
    if not _use_ripgrep():
        return None

    rg_path = shutil.which("rg")
    if rg_path:
        return rg_path

    # Check common Windows locations
    common_paths = [
        r"C:\Program Files\ripgrep\rg.exe",
        r"C:\scoop\shims\rg.exe",
        os.path.expanduser(r"~\scoop\shims\rg.exe"),
    ]
    for p in common_paths:
        if os.path.isfile(p):
            return p

    return None


def _search_with_ripgrep(
    query: str,
    root: Path,
    exts: Set[str],
    case_sensitive: bool,
    top_k: int,
    context_lines: int = 8,
) -> Tuple[List[Dict[str, Any]], Dict[str, int]]:
    """Search using ripgrep. Returns (matches, stats)."""
    rg_path = _find_ripgrep()
    if not rg_path:
        raise RuntimeError("ripgrep not available")

    stats = {"files_scanned": 0, "files_skipped": 0}

    # Build rg command
    cmd = [rg_path, "--line-number", "--no-heading", "--with-filename"]

    if not case_sensitive:
        cmd.append("--smart-case")
    else:
        cmd.append("--case-sensitive")

    # Add extension filters
    for ext in exts:
        ext_clean = ext.lstrip(".")
        cmd.extend(["-g", f"*.{ext_clean}"])

    # Skip common directories
    for skip_dir in [".git", "__pycache__", "node_modules", ".venv", "venv", "Binaries", "Intermediate"]:
        cmd.extend(["--glob", f"!{skip_dir}/**"])

    # Max file size
    max_bytes = _get_max_file_bytes()
    cmd.extend(["--max-filesize", str(max_bytes)])

    # Add query and root
    cmd.append(query)
    cmd.append(".")

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30,
            cwd=str(root),
        )
    except subprocess.TimeoutExpired:
        raise RuntimeError("ripgrep timed out")
    except Exception as e:
        raise RuntimeError(f"ripgrep failed: {e}")

    if result.returncode not in (0, 1):
        raise RuntimeError(result.stderr.strip() or f"ripgrep failed (code {result.returncode})")

    # Parse results: path:line:content
    matches: List[Dict[str, Any]] = []
    seen_files: Set[str] = set()
    file_matches: Dict[str, List[Tuple[int, str]]] = {}  # path -> [(line_num, text)]

    for line in result.stdout.splitlines():
        if not line.strip():
            continue

        # Parse path:line:content
        match = re.match(r"^(.*):(\d+):(.*)$", line)
        if not match:
            continue

        file_path, line_num_str, match_text = match.groups()
        line_num = int(line_num_str)

        # Normalize path
        try:
            abs_path = (root / file_path).resolve()
            rel_path = str(abs_path.relative_to(root)).replace("\\", "/")
        except Exception:
            rel_path = file_path.replace("\\", "/")

        seen_files.add(rel_path)

        if rel_path not in file_matches:
            file_matches[rel_path] = []
        file_matches[rel_path].append((line_num, match_text))

    stats["files_scanned"] = len(seen_files)

    # Build match objects with context
    ranked_files: List[Tuple[str, int, int]] = []  # (path, first_line, match_count)
    for path, hits in file_matches.items():
        first_line = min(h[0] for h in hits)
        ranked_files.append((path, first_line, len(hits)))

    # Sort by match count (desc), then first line (asc)
    ranked_files.sort(key=lambda x: (-x[2], x[1]))

    for path, first_line, match_count in ranked_files[:top_k * 2]:
        # Read file to get context
        try:
            full_path = root / path
            content = full_path.read_text(encoding="utf-8", errors="replace")
            lines = content.splitlines()

            # Get hits for this file
            hits = file_matches[path]
            best_line = hits[0][0]  # First hit

            start = max(1, best_line - context_lines)
            end = min(len(lines), best_line + context_lines)
            snippet = "\n".join(lines[start - 1:end])

            # Score: combination of match count and position
            score = min(1.0, match_count / 10) * 0.7 + (1.0 / (1 + ranked_files.index((path, first_line, match_count)))) * 0.3

            matches.append({
                "path": path,
                "start_line": start,
                "end_line": end,
                "snippet": snippet[:1000],
                "score": round(score, 4),
                "match_kind": "keyword",
            })

            if len(matches) >= top_k:
                break

        except Exception:
            continue

    return matches, stats


# ============================================================================
# Pure Python fallback search
# ============================================================================

SKIP_DIRS: Set[str] = {
    ".git", ".hg", ".svn",
    "__pycache__", "node_modules", ".venv", "venv", ".venv_mcp312",
    "Binaries", "Intermediate", "DerivedDataCache", "Saved",
    ".kiro", "dist", "build",
}

# Directories that start with . but SHOULD be indexed
ALLOWED_DOT_DIRS: Set[str] = {
    ".agents", ".claude", ".github", ".vscode", ".Cline",
}

# Reference directories - indexed but excluded by default (use scope="all" or scope="reference")
# These contain external repos/case studies for reference only
REFERENCE_DIRS: Set[str] = {
    "Docs/CaseStudies",
    "Docs/CaseStudies/REPOS",
    "ai/exports",
}


def _should_skip_dir(name: str) -> bool:
    """Check if directory should be skipped."""
    if name in SKIP_DIRS:
        return True
    if name.startswith(".") and name not in ALLOWED_DOT_DIRS:
        return True
    return False


def _is_reference_path(rel_path: str) -> bool:
    """Check if a relative path is within reference directories."""
    # Normalize path separators
    normalized = rel_path.replace("\\", "/")
    for ref_dir in REFERENCE_DIRS:
        if normalized.startswith(ref_dir + "/") or normalized == ref_dir:
            return True
    return False


def _filter_matches_by_scope(matches: List[Dict[str, Any]], scope: str) -> List[Dict[str, Any]]:
    """Filter search matches based on scope setting.

    Args:
        matches: List of match dicts with 'path' key
        scope: "project" (exclude reference), "all" (include all), "reference" (only reference)

    Returns:
        Filtered list of matches
    """
    if scope == "all":
        return matches

    filtered = []
    for m in matches:
        path = m.get("path", "")
        is_ref = _is_reference_path(path)

        if scope == "reference":
            # Only include reference paths
            if is_ref:
                filtered.append(m)
        else:  # scope == "project" (default)
            # Exclude reference paths
            if not is_ref:
                filtered.append(m)

    return filtered


def _search_python_fallback(
    query: str,
    root: Path,
    exts: Set[str],
    case_sensitive: bool,
    top_k: int,
    context_lines: int = 8,
) -> Tuple[List[Dict[str, Any]], Dict[str, int]]:
    """Search using pure Python. Returns (matches, stats)."""
    stats = {"files_scanned": 0, "files_skipped": 0}
    max_bytes = _get_max_file_bytes()

    # Tokenize query into words for multi-word matching
    query_lower = query.lower()
    query_words = [w for w in re.split(r'\s+', query_lower) if len(w) >= 2]
    if not query_words:
        query_words = [query_lower]  # Fallback to full query

    file_hits: List[Tuple[str, int, int, List[int]]] = []  # (path, first_line, match_count, all_lines)

    for path in root.rglob("*"):
        if not path.is_file():
            continue

        # Skip symlinks
        if path.is_symlink():
            stats["files_skipped"] += 1
            continue

        # Check directory exclusions
        skip = False
        try:
            rel_parts = path.relative_to(root).parts[:-1]
            for p in rel_parts:
                if _should_skip_dir(p):
                    skip = True
                    break
        except ValueError:
            skip = True

        if skip:
            stats["files_skipped"] += 1
            continue

        # Check extension
        ext = path.suffix.lower()
        if exts and ext not in exts:
            stats["files_skipped"] += 1
            continue

        # Check file size
        try:
            if path.stat().st_size > max_bytes:
                stats["files_skipped"] += 1
                continue
        except Exception:
            stats["files_skipped"] += 1
            continue

        stats["files_scanned"] += 1

        try:
            content = path.read_text(encoding="utf-8", errors="replace")
            content_lower = content.lower()

            # Check if ANY query word appears in file
            word_matches = sum(1 for w in query_words if w in content_lower)
            if word_matches == 0:
                continue

            # Find all matching lines (lines containing any query word)
            lines = content.splitlines()
            lines_lower = [line.lower() for line in lines]
            match_lines: List[int] = []

            for i, line in enumerate(lines_lower):
                line_word_matches = sum(1 for w in query_words if w in line)
                if line_word_matches > 0:
                    match_lines.append(i + 1)

            if match_lines:
                rel_path = str(path.relative_to(root)).replace("\\", "/")
                # Store word coverage (how many unique query words matched)
                content_lower_check = content_lower
                words_matched = sum(1 for w in query_words if w in content_lower_check)
                file_hits.append((rel_path, match_lines[0], len(match_lines), match_lines, words_matched))

        except Exception:
            continue

    # Sort by: 1) word coverage (desc), 2) match count (desc), 3) first line (asc)
    file_hits.sort(key=lambda x: (-x[4], -x[2], x[1]))

    matches: List[Dict[str, Any]] = []

    for path, first_line, match_count, all_lines, words_matched in file_hits[:top_k]:
        try:
            full_path = root / path
            content = full_path.read_text(encoding="utf-8", errors="replace")
            lines = content.splitlines()

            # Get context around first match
            start = max(1, first_line - context_lines)
            end = min(len(lines), first_line + context_lines)
            snippet = "\n".join(lines[start - 1:end])

            # Score: based on word coverage, match count, and rank
            rank = next(i for i, h in enumerate(file_hits) if h[0] == path)
            word_coverage = words_matched / len(query_words) if query_words else 0
            score = word_coverage * 0.5 + min(1.0, match_count / 10) * 0.3 + (1.0 / (1 + rank)) * 0.2

            matches.append({
                "path": path,
                "start_line": start,
                "end_line": end,
                "snippet": snippet[:1000],
                "score": round(score, 4),
                "match_kind": "keyword",
            })

        except Exception:
            continue

    return matches, stats


# ============================================================================
# BM25 Implementation (for indexed search)
# ============================================================================

TOKEN_PATTERN = re.compile(r"[A-Za-z0-9_]+")


def tokenize(text: str) -> List[str]:
    """Tokenize text for BM25."""
    return [tok.lower() for tok in TOKEN_PATTERN.findall(text)]


class SimpleBM25:
    """Minimal BM25 implementation."""

    def __init__(self, k1: float = 1.5, b: float = 0.75):
        self.k1 = k1
        self.b = b
        self.docs: Dict[str, Counter] = {}
        self.doc_lengths: Dict[str, int] = {}
        self.term_doc_freq: Counter = Counter()

    def add_document(self, doc_id: str, tokens: List[str]) -> None:
        if doc_id in self.docs:
            self.remove_document(doc_id)
        freq = Counter(tokens)
        self.docs[doc_id] = freq
        self.doc_lengths[doc_id] = sum(freq.values())
        for term in freq.keys():
            self.term_doc_freq[term] += 1

    def remove_document(self, doc_id: str) -> None:
        freq = self.docs.pop(doc_id, None)
        if not freq:
            return
        for term in freq.keys():
            self.term_doc_freq[term] -= 1
            if self.term_doc_freq[term] <= 0:
                del self.term_doc_freq[term]
        self.doc_lengths.pop(doc_id, None)

    def _idf(self, term: str) -> float:
        df = self.term_doc_freq.get(term, 0)
        N = len(self.docs)
        return math.log(1 + (N - df + 0.5) / (df + 0.5)) if N else 0.0

    def score(self, query_tokens: List[str], doc_id: str) -> float:
        freq = self.docs.get(doc_id)
        if not freq:
            return 0.0
        doc_len = self.doc_lengths.get(doc_id, 0)
        avg_len = sum(self.doc_lengths.values()) / len(self.docs) if self.docs else 0
        score = 0.0
        for term in query_tokens:
            tf = freq.get(term, 0)
            if tf == 0:
                continue
            idf = self._idf(term)
            denom = tf + self.k1 * (1 - self.b + self.b * (doc_len / avg_len if avg_len else 0))
            score += idf * ((tf * (self.k1 + 1)) / denom) if denom else 0.0
        return score

    def search(self, query_tokens: List[str], top_k: int = 10) -> List[Tuple[str, float]]:
        if not query_tokens:
            return []
        scores = [(doc_id, self.score(query_tokens, doc_id)) for doc_id in self.docs]
        scores = [(d, s) for d, s in scores if s > 0]
        scores.sort(key=lambda x: x[1], reverse=True)
        return scores[:top_k]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "docs": {k: dict(v) for k, v in self.docs.items()},
            "doc_lengths": dict(self.doc_lengths),
            "term_doc_freq": dict(self.term_doc_freq),
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "SimpleBM25":
        inst = cls()
        inst.docs = {k: Counter(v) for k, v in data.get("docs", {}).items()}
        inst.doc_lengths = dict(data.get("doc_lengths", {}))
        inst.term_doc_freq = Counter(data.get("term_doc_freq", {}))
        return inst


# ============================================================================
# Index management
# ============================================================================

INDEX_FILE = "bm25_index.json"
CHUNKS_FILE = "chunks.jsonl"


def _load_index(index_dir: Path) -> Tuple[SimpleBM25, Dict[str, Dict[str, Any]]]:
    """Load BM25 index and chunk metadata."""
    bm25 = SimpleBM25()
    chunks: Dict[str, Dict[str, Any]] = {}

    index_path = index_dir / INDEX_FILE
    chunks_path = index_dir / CHUNKS_FILE

    if index_path.exists():
        try:
            data = json.loads(index_path.read_text(encoding="utf-8"))
            bm25 = SimpleBM25.from_dict(data)
        except Exception:
            pass

    if chunks_path.exists():
        try:
            with chunks_path.open("r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line:
                        chunk = json.loads(line)
                        cid = chunk.get("chunk_id")
                        if cid:
                            chunks[cid] = chunk
        except Exception:
            pass

    return bm25, chunks


def _save_index(index_dir: Path, bm25: SimpleBM25, chunks: Dict[str, Dict[str, Any]]) -> None:
    """Save BM25 index and chunk metadata."""
    index_dir.mkdir(parents=True, exist_ok=True)

    with (index_dir / INDEX_FILE).open("w", encoding="utf-8") as f:
        json.dump(bm25.to_dict(), f)

    with (index_dir / CHUNKS_FILE).open("w", encoding="utf-8") as f:
        for chunk in chunks.values():
            f.write(json.dumps(chunk) + "\n")


def _chunk_file(path: Path, root: Path, chunk_lines: int = 100) -> List[Dict[str, Any]]:
    """Chunk a file into indexable pieces."""
    try:
        content = path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return []

    lines = content.splitlines()
    rel_path = str(path.relative_to(root)).replace("\\", "/")

    chunks: List[Dict[str, Any]] = []
    for i in range(0, len(lines), chunk_lines):
        chunk_lines_slice = lines[i:i + chunk_lines]
        chunk_text = "\n".join(chunk_lines_slice)
        chunk_id = f"{rel_path}:{i+1}-{min(i + chunk_lines, len(lines))}"
        chunks.append({
            "chunk_id": chunk_id,
            "path": rel_path,
            "start_line": i + 1,
            "end_line": min(i + chunk_lines, len(lines)),
            "text": chunk_text,
        })

    return chunks


# ============================================================================
# Action implementations
# ============================================================================

def _action_help(**kwargs: Any) -> Dict[str, Any]:
    """List available actions for k_rag."""
    return {
        "ok": True,
        "data": {
            "tool": "k_rag",
            "description": "Multi-strategy code search with BM25 + semantic vector search",
            "llm_guidance": (
                "Use this tool to search codebases. Start with 'query' for exact matches "
                "(function names, class names, error messages). Use 'query_agentic' when unsure - "
                "it auto-selects the best strategy. Use 'query_semantic' for conceptual questions "
                "(e.g., 'how does auth work'). Always check 'status' first if unsure about index freshness."
            ),
            "actions": {
                "help": {
                    "summary": "Show this help with LLM guidance",
                    "when_to_use": "When you need to understand available RAG capabilities",
                },
                "query": {
                    "summary": "Fast keyword search using BM25 + ripgrep",
                    "params": "query (required), top_k, exts, root, case_sensitive",
                    "when_to_use": "BEST FOR: Exact matches - function names, class names, variable names, error strings, imports. Use when you know the exact term to find.",
                    "example": "query='def authenticate', query='class UserService', query='ImportError'",
                },
                "status": {
                    "summary": "Check RAG index health and configuration",
                    "when_to_use": "Call FIRST if results seem stale or incomplete. Shows index age, chunk count, and ripgrep availability.",
                },
                "index": {
                    "summary": "Build/rebuild the BM25 keyword index",
                    "params": "root, force",
                    "when_to_use": "When status shows stale index, or after major codebase changes. Use force=True to rebuild from scratch.",
                },
                "query_semantic": {
                    "summary": "Pure vector similarity search using embeddings",
                    "params": "query, top_k, root",
                    "when_to_use": "BEST FOR: Conceptual/natural language questions - 'how does the auth flow work', 'where is error handling done', 'find code similar to X'. Returns semantically related code even without exact keyword matches.",
                    "requires": "index_semantic must be run first",
                },
                "query_hybrid": {
                    "summary": "Combined BM25 + vector search (default balanced approach)",
                    "params": "query, top_k, bm25_weight (0-1, default 0.3), root",
                    "when_to_use": "BEST FOR: General-purpose search when you want both exact matches AND semantic relevance. Good default choice.",
                },
                "query_reranked": {
                    "summary": "Hybrid search + cross-encoder re-ranking for precision",
                    "params": "query, top_k, root",
                    "when_to_use": "BEST FOR: High-stakes queries where precision matters more than speed. Use for complex questions, bug investigations, or when hybrid results seem noisy.",
                    "note": "Slower but more accurate. Retrieves 4x candidates then re-ranks.",
                },
                "query_multi": {
                    "summary": "Search with multiple query variations, deduplicated",
                    "params": "query, top_k, variations (default 3), root",
                    "when_to_use": "BEST FOR: Ambiguous queries, typos, or when initial search returns few results. Automatically generates query variations.",
                },
                "query_reflective": {
                    "summary": "Self-correcting search loop that refines query if results are poor",
                    "params": "query, top_k, max_iterations, quality_threshold, root",
                    "when_to_use": "BEST FOR: Complex research tasks, exploratory searches, or when you're not sure of the right keywords. Will iteratively improve the query.",
                },
                "query_agentic": {
                    "summary": "Auto-selects best strategy based on query analysis",
                    "params": "query, strategy (auto|keyword|semantic|hybrid|reranked|multi|reflective), top_k, root",
                    "when_to_use": "USE THIS when unsure which strategy to pick. Analyzes query structure and selects optimal approach. Set strategy='auto' (default) for full automation.",
                    "decision_logic": "Short queries -> keyword, Questions -> semantic, Technical identifiers -> keyword, Long/complex -> multi",
                },
                "index_semantic": {
                    "summary": "Build vector embeddings for semantic search",
                    "params": "root, force, batch_size",
                    "when_to_use": "Run ONCE after index, or when adding semantic search capability. Required before query_semantic/query_hybrid work.",
                    "note": "Requires sentence-transformers. May take a few minutes for large codebases.",
                },
                "query_interactive": {
                    "summary": "Human-in-the-loop RAG with result filtering",
                    "params": "query, strategy (default: hybrid), top_k, root",
                    "when_to_use": "BEST FOR: When you want the HUMAN to select which RAG results to include in context. Presents numbered results, user picks which to keep. Reduces context pollution and improves relevance.",
                    "flow": "1) Run query with strategy → 2) Show results to human → 3) Human selects (e.g., '1,3,5' or 'all' or 'none') → 4) Return only selected results",
                    "user_input": "'1,3,5' = keep results 1,3,5 | 'all' = keep all | 'none' = discard all",
                    "note": "Requires k_interact. Falls back to returning all results if unavailable.",
                },
            },
            "strategy_selection_guide": {
                "know_exact_term": "query (keyword)",
                "conceptual_question": "query_semantic",
                "general_search": "query_hybrid or query_agentic",
                "need_precision": "query_reranked",
                "ambiguous_query": "query_multi",
                "exploratory_research": "query_reflective",
                "unsure": "query_agentic with strategy='auto'",
                "human_curation_needed": "query_interactive",
            },
            "project_root": str(_get_project_root()),
            "index_dir": str(_get_index_dir()),
            "ripgrep_available": _find_ripgrep() is not None,
        },
        "error": None,
    }


def _action_query(
    query: str = "",
    top_k: int = 8,
    exts: Optional[List[str]] = None,
    root: Optional[str] = None,
    case_sensitive: bool = False,
    scope: str = "project",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Search project files by keyword.

    Args:
        scope: Search scope - "project" (default, excludes reference dirs like CaseStudies),
               "all" (includes everything), "reference" (only reference dirs)
    """
    start_time = time.time()

    # Validate query
    if not query or not query.strip():
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "query is required",
            "details": {},
        }

    query = query.strip()

    # Validate scope
    scope = (scope or "project").lower()
    if scope not in ("project", "all", "reference"):
        scope = "project"

    # Clamp top_k - fetch extra if filtering by scope
    fetch_k = top_k * 3 if scope != "all" else top_k
    fetch_k = max(1, min(75, fetch_k))

    # Validate root
    search_root, warnings = _validate_root(root)

    # Build extension filter
    if exts:
        ext_filter = {e.lower() if e.startswith(".") else f".{e.lower()}" for e in exts if e}
    else:
        ext_filter = _get_default_exts()

    try:
        matches: List[Dict[str, Any]] = []
        stats: Dict[str, int] = {"files_scanned": 0, "files_skipped": 0, "elapsed_ms": 0}
        rag_mode = "keyword_fallback"

        # Try ripgrep first
        rg_path = _find_ripgrep()
        if rg_path:
            try:
                matches, stats = _search_with_ripgrep(
                    query, search_root, ext_filter, case_sensitive, fetch_k
                )
                rag_mode = "keyword_rg"
            except Exception as e:
                # Fall back to Python
                warnings.append(f"ripgrep failed ({e}), using Python fallback")
                matches, stats = _search_python_fallback(
                    query, search_root, ext_filter, case_sensitive, fetch_k
                )
        else:
            matches, stats = _search_python_fallback(
                query, search_root, ext_filter, case_sensitive, fetch_k
            )

        # Apply scope filtering
        matches = _filter_matches_by_scope(matches, scope)
        matches = matches[:top_k]  # Trim to requested top_k

        elapsed_ms = int((time.time() - start_time) * 1000)
        stats["elapsed_ms"] = elapsed_ms

        result: Dict[str, Any] = {
            "ok": True,
            "rag_mode": rag_mode,
            "query": query,
            "root": str(search_root),
            "scope": scope,
            "matches": matches,
            "stats": stats,
        }

        if warnings:
            result["warnings"] = warnings

        return result

    except Exception as e:
        return {
            "ok": False,
            "error_code": "QUERY_FAILED",
            "message": str(e),
            "details": {"root": str(search_root)},
        }


def _action_status(**kwargs: Any) -> Dict[str, Any]:
    """Check RAG index status."""
    try:
        project_root = _get_project_root()
        index_dir = _get_index_dir()

        bm25, chunks = _load_index(index_dir)
        rg_path = _find_ripgrep()

        return {
            "ok": True,
            "indexed": len(bm25.docs) > 0,
            "chunk_count": len(chunks),
            "doc_count": len(bm25.docs),
            "index_path": str(index_dir),
            "project_root": str(project_root),
            "ripgrep_available": rg_path is not None,
            "ripgrep_path": rg_path,
            "max_file_bytes": _get_max_file_bytes(),
            "default_exts": list(_get_default_exts()),
        }
    except Exception as e:
        return {
            "ok": False,
            "error_code": "STATUS_FAILED",
            "message": str(e),
            "details": {},
        }


def _action_index(
    root: Optional[str] = None,
    force: bool = False,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Build or rebuild RAG index (BM25)."""
    start_time = time.time()

    try:
        search_root, warnings = _validate_root(root)
        index_dir = _get_index_dir()
        max_bytes = _get_max_file_bytes()
        allowed_exts = _get_default_exts()

        bm25 = SimpleBM25()
        chunks: Dict[str, Dict[str, Any]] = {}
        files_processed = 0
        files_skipped = 0

        for path in search_root.rglob("*"):
            if not path.is_file():
                continue

            # Skip symlinks
            if path.is_symlink():
                files_skipped += 1
                continue

            # Check directory exclusions
            skip = False
            try:
                rel_parts = path.relative_to(search_root).parts[:-1]
                for p in rel_parts:
                    if _should_skip_dir(p):
                        skip = True
                        break
            except ValueError:
                skip = True

            if skip:
                files_skipped += 1
                continue

            # Check extension
            ext = path.suffix.lower()
            if ext not in allowed_exts:
                files_skipped += 1
                continue

            # Check file size
            try:
                if path.stat().st_size > max_bytes:
                    files_skipped += 1
                    continue
            except Exception:
                files_skipped += 1
                continue

            file_chunks = _chunk_file(path, search_root)
            if file_chunks:
                files_processed += 1
                for chunk in file_chunks:
                    cid = chunk["chunk_id"]
                    chunks[cid] = chunk
                    tokens = tokenize(chunk.get("text", ""))
                    bm25.add_document(cid, tokens)

        _save_index(index_dir, bm25, chunks)

        elapsed_ms = int((time.time() - start_time) * 1000)

        result: Dict[str, Any] = {
            "ok": True,
            "chunks_indexed": len(chunks),
            "files_processed": files_processed,
            "files_skipped": files_skipped,
            "index_path": str(index_dir),
            "elapsed_ms": elapsed_ms,
        }

        if warnings:
            result["warnings"] = warnings

        return result

    except Exception as e:
        return {
            "ok": False,
            "error_code": "INDEX_FAILED",
            "message": str(e),
            "details": {},
        }


# ============================================================================
# Semantic search configuration
# ============================================================================

def _get_bm25_weight() -> float:
    """Get BM25 weight for hybrid search (0-1)."""
    return float(os.environ.get("KURORYUU_RAG_BM25_WEIGHT", "0.3"))


def _get_embeddings_file() -> Path:
    """Get embeddings storage file."""
    return _get_index_dir() / "embeddings.json"


def _cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
    """Compute cosine similarity between two vectors."""
    a = np.array(vec_a, dtype=np.float32)
    b = np.array(vec_b, dtype=np.float32)
    dot = np.dot(a, b)
    norm_a = np.linalg.norm(a)
    norm_b = np.linalg.norm(b)
    if norm_a == 0 or norm_b == 0:
        return 0.0
    return float(dot / (norm_a * norm_b))


def _load_embeddings() -> Dict[str, List[float]]:
    """Load embeddings from disk."""
    emb_file = _get_embeddings_file()
    if not emb_file.exists():
        return {}
    try:
        return json.loads(emb_file.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _save_embeddings(embeddings: Dict[str, List[float]]) -> None:
    """Save embeddings to disk."""
    emb_file = _get_embeddings_file()
    emb_file.parent.mkdir(parents=True, exist_ok=True)
    with emb_file.open("w", encoding="utf-8") as f:
        json.dump(embeddings, f)


# ============================================================================
# Semantic search actions
# ============================================================================

def _action_query_semantic(
    query: str = "",
    top_k: int = 8,
    root: Optional[str] = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Pure vector semantic search."""
    start_time = time.time()

    if not query or not query.strip():
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "query is required"}

    query = query.strip()
    top_k = max(1, min(25, top_k))
    search_root, warnings = _validate_root(root)

    try:
        from .embeddings import LocalEmbedder

        embedder = LocalEmbedder.get()
        query_embedding = embedder.embed_text(query)

        # Load chunk embeddings
        embeddings = _load_embeddings()
        bm25, chunks = _load_index(_get_index_dir())

        if not embeddings:
            return {
                "ok": False,
                "error_code": "NO_EMBEDDINGS",
                "message": "No embeddings found. Run action='index_semantic' first.",
            }

        # Score all chunks by cosine similarity
        results = []
        for chunk_id, chunk in chunks.items():
            if chunk_id not in embeddings:
                continue

            similarity = _cosine_similarity(query_embedding, embeddings[chunk_id])
            results.append({
                "path": chunk.get("path", ""),
                "start_line": chunk.get("start_line", 1),
                "end_line": chunk.get("end_line", 1),
                "snippet": chunk.get("text", "")[:1000],
                "score": round(similarity, 4),
                "match_kind": "semantic",
            })

        # Sort by similarity
        results.sort(key=lambda x: x["score"], reverse=True)
        results = results[:top_k]

        elapsed_ms = int((time.time() - start_time) * 1000)

        return {
            "ok": True,
            "rag_mode": "semantic",
            "query": query,
            "matches": results,
            "stats": {"elapsed_ms": elapsed_ms, "chunks_searched": len(embeddings)},
            "warnings": warnings if warnings else None,
        }

    except ImportError:
        return {
            "ok": False,
            "error_code": "MISSING_DEPS",
            "message": "sentence-transformers not installed",
        }
    except Exception as e:
        return {"ok": False, "error_code": "QUERY_FAILED", "message": str(e)}


def _action_query_hybrid(
    query: str = "",
    top_k: int = 8,
    bm25_weight: Optional[float] = None,
    root: Optional[str] = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Hybrid search: BM25 + vector semantic."""
    start_time = time.time()

    if not query or not query.strip():
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "query is required"}

    query = query.strip()
    top_k = max(1, min(25, top_k))
    bm25_weight = bm25_weight if bm25_weight is not None else _get_bm25_weight()
    search_root, warnings = _validate_root(root)

    try:
        from .embeddings import LocalEmbedder

        embedder = LocalEmbedder.get()
        query_embedding = embedder.embed_text(query)

        # Load indexes
        embeddings = _load_embeddings()
        bm25, chunks = _load_index(_get_index_dir())

        if not chunks:
            return {"ok": False, "error_code": "NO_INDEX", "message": "No index found. Run action='index' first."}

        # BM25 scores
        query_tokens = tokenize(query)
        bm25_results = bm25.search(query_tokens, top_k=len(chunks))
        bm25_scores = {doc_id: score for doc_id, score in bm25_results}

        # Normalize BM25 scores
        max_bm25 = max(bm25_scores.values()) if bm25_scores else 1.0
        bm25_norm = {k: v / max_bm25 for k, v in bm25_scores.items()} if max_bm25 > 0 else {}

        # Compute combined scores
        results = []
        for chunk_id, chunk in chunks.items():
            bm25_score = bm25_norm.get(chunk_id, 0.0)

            # Vector score (if embedding exists)
            vec_score = 0.0
            if chunk_id in embeddings:
                vec_score = _cosine_similarity(query_embedding, embeddings[chunk_id])

            # Combined score
            combined = bm25_score * bm25_weight + vec_score * (1 - bm25_weight)

            if combined > 0:
                results.append({
                    "path": chunk.get("path", ""),
                    "start_line": chunk.get("start_line", 1),
                    "end_line": chunk.get("end_line", 1),
                    "snippet": chunk.get("text", "")[:1000],
                    "score": round(combined, 4),
                    "bm25_score": round(bm25_score, 4),
                    "vec_score": round(vec_score, 4),
                    "match_kind": "hybrid",
                })

        # Sort and limit
        results.sort(key=lambda x: x["score"], reverse=True)
        results = results[:top_k]

        elapsed_ms = int((time.time() - start_time) * 1000)

        return {
            "ok": True,
            "rag_mode": "hybrid",
            "query": query,
            "bm25_weight": bm25_weight,
            "matches": results,
            "stats": {"elapsed_ms": elapsed_ms, "chunks_searched": len(chunks)},
            "warnings": warnings if warnings else None,
        }

    except ImportError:
        # Fall back to keyword search
        return _action_query(query=query, top_k=top_k, root=root, **kwargs)
    except Exception as e:
        return {"ok": False, "error_code": "QUERY_FAILED", "message": str(e)}


def _action_query_reranked(
    query: str = "",
    top_k: int = 5,
    candidate_multiplier: int = 4,
    root: Optional[str] = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Two-stage retrieval: hybrid search + cross-encoder re-ranking."""
    start_time = time.time()

    if not query or not query.strip():
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "query is required"}

    query = query.strip()
    top_k = max(1, min(15, top_k))
    candidate_limit = min(top_k * candidate_multiplier, 30)

    try:
        from .reranker import Reranker

        # Stage 1: Get candidates via hybrid search
        hybrid_result = _action_query_hybrid(
            query=query,
            top_k=candidate_limit,
            root=root,
            **kwargs
        )

        if not hybrid_result.get("ok"):
            return hybrid_result

        candidates = hybrid_result.get("matches", [])
        if not candidates:
            return {"ok": True, "rag_mode": "reranked", "query": query, "matches": [], "stats": {}}

        # Stage 2: Re-rank with cross-encoder
        reranker = Reranker.get()

        # Convert to format expected by reranker
        candidate_dicts = [{"text": c["snippet"], **c} for c in candidates]
        reranked = reranker.rerank(query, candidate_dicts, top_k=top_k)

        # Format results
        results = []
        for r in reranked:
            results.append({
                "path": r.get("path", ""),
                "start_line": r.get("start_line", 1),
                "end_line": r.get("end_line", 1),
                "snippet": r.get("snippet", r.get("text", ""))[:1000],
                "score": round(r.get("score", 0), 4),
                "match_kind": "reranked",
            })

        elapsed_ms = int((time.time() - start_time) * 1000)

        return {
            "ok": True,
            "rag_mode": "reranked",
            "query": query,
            "matches": results,
            "stats": {
                "elapsed_ms": elapsed_ms,
                "candidates_retrieved": len(candidates),
                "results_returned": len(results),
            },
        }

    except ImportError:
        # Fall back to hybrid search
        return _action_query_hybrid(query=query, top_k=top_k, root=root, **kwargs)
    except Exception as e:
        return {"ok": False, "error_code": "QUERY_FAILED", "message": str(e)}


def _generate_query_variations(query: str, n: int = 3) -> List[str]:
    """Generate query variations using heuristics (no LLM)."""
    variations = []

    # Quoted exact phrase
    if '"' not in query:
        variations.append(f'"{query}"')

    # Common prefixes
    prefixes = ["how to", "what is", "where is", "find", "search for"]
    for prefix in prefixes:
        if not query.lower().startswith(prefix):
            variations.append(f"{prefix} {query}")
            if len(variations) >= n:
                break

    return variations[:n]


def _action_query_multi(
    query: str = "",
    top_k: int = 8,
    variations: int = 3,
    root: Optional[str] = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Multi-query RAG: search with multiple query variations, deduplicate."""
    start_time = time.time()

    if not query or not query.strip():
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "query is required"}

    query = query.strip()
    top_k = max(1, min(25, top_k))

    # Generate variations
    all_queries = [query] + _generate_query_variations(query, variations)

    # Search each query
    all_results: Dict[str, Dict[str, Any]] = {}

    for q in all_queries:
        result = _action_query_hybrid(query=q, top_k=top_k * 2, root=root, **kwargs)
        if result.get("ok"):
            for match in result.get("matches", []):
                key = f"{match['path']}:{match['start_line']}"
                if key not in all_results or match["score"] > all_results[key]["score"]:
                    all_results[key] = match

    # Sort and limit
    results = sorted(all_results.values(), key=lambda x: x["score"], reverse=True)[:top_k]

    elapsed_ms = int((time.time() - start_time) * 1000)

    return {
        "ok": True,
        "rag_mode": "multi",
        "query": query,
        "variations_used": all_queries,
        "matches": results,
        "stats": {
            "elapsed_ms": elapsed_ms,
            "queries_executed": len(all_queries),
            "unique_results": len(all_results),
        },
    }


def _score_result_quality(query: str, results: List[Dict]) -> float:
    """Heuristic quality scoring (no LLM)."""
    if not results:
        return 0.0

    avg_score = sum(r.get("score", 0) for r in results) / len(results)
    query_terms = set(tokenize(query))

    covered = 0
    for r in results:
        result_terms = set(tokenize(r.get("snippet", "")))
        if query_terms & result_terms:
            covered += 1

    coverage = covered / len(results) if results else 0
    return avg_score * 0.6 + coverage * 0.4


def _refine_query(original: str, results: List[Dict]) -> str:
    """Refine query based on results."""
    all_text = " ".join(r.get("snippet", "")[:500] for r in results[:3])
    tokens = tokenize(all_text)
    freq = Counter(tokens)

    original_tokens = set(tokenize(original))
    new_terms = [t for t, _ in freq.most_common(10) if t not in original_tokens and len(t) > 2][:2]

    if new_terms:
        return f"{original} {' '.join(new_terms)}"
    return original


def _action_query_reflective(
    query: str = "",
    top_k: int = 8,
    max_iterations: int = 2,
    quality_threshold: float = 0.5,
    root: Optional[str] = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Self-reflective RAG: evaluate and refine search if needed."""
    start_time = time.time()

    if not query or not query.strip():
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "query is required"}

    query = query.strip()
    top_k = max(1, min(25, top_k))

    iteration = 0
    current_query = query
    all_attempts = []
    final_results = []

    while iteration < max_iterations:
        result = _action_query_hybrid(query=current_query, top_k=top_k, root=root, **kwargs)

        if not result.get("ok"):
            break

        matches = result.get("matches", [])
        quality = _score_result_quality(current_query, matches)

        all_attempts.append({
            "query": current_query,
            "quality": round(quality, 3),
            "result_count": len(matches),
        })

        final_results = matches

        if quality >= quality_threshold or not matches:
            break

        # Refine query
        current_query = _refine_query(query, matches)
        iteration += 1

    elapsed_ms = int((time.time() - start_time) * 1000)

    return {
        "ok": True,
        "rag_mode": "reflective",
        "query": query,
        "final_query": current_query,
        "iterations": iteration + 1,
        "attempts": all_attempts,
        "matches": final_results,
        "stats": {"elapsed_ms": elapsed_ms},
    }


def _auto_select_strategy(query: str) -> str:
    """Heuristic-based strategy selection."""
    words = query.split()

    # Short queries → keyword
    if len(words) <= 2:
        return "keyword"

    # Exact match requested
    if '"' in query or "exact" in query.lower():
        return "keyword"

    # Question format → semantic
    question_words = {"how", "what", "why", "where", "when", "which"}
    if words[0].lower() in question_words:
        return "semantic"

    # Technical identifiers → keyword
    if any(re.match(r"[A-Z][a-z]+[A-Z]", w) or "_" in w for w in words):
        return "keyword"

    # Long/complex → multi
    if len(words) > 10:
        return "multi"

    # Default
    return "hybrid"


def _action_query_agentic(
    query: str = "",
    strategy: str = "auto",
    top_k: int = 8,
    root: Optional[str] = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Agentic RAG: auto-select search strategy based on query."""
    if not query or not query.strip():
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "query is required"}

    query = query.strip()

    if strategy == "auto":
        strategy = _auto_select_strategy(query)

    handlers = {
        "keyword": _action_query,
        "semantic": _action_query_semantic,
        "hybrid": _action_query_hybrid,
        "reranked": _action_query_reranked,
        "multi": _action_query_multi,
        "reflective": _action_query_reflective,
    }

    handler = handlers.get(strategy, _action_query_hybrid)
    result = handler(query=query, top_k=top_k, root=root, **kwargs)
    result["strategy_used"] = strategy
    return result


def _action_index_semantic(
    root: Optional[str] = None,
    force: bool = False,
    batch_size: int = 32,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Build semantic embeddings for all indexed chunks."""
    start_time = time.time()

    try:
        from .embeddings import LocalEmbedder

        search_root, warnings = _validate_root(root)

        # First ensure BM25 index exists
        bm25, chunks = _load_index(_get_index_dir())
        if not chunks:
            # Build it first
            index_result = _action_index(root=root, force=force)
            if not index_result.get("ok"):
                return index_result
            bm25, chunks = _load_index(_get_index_dir())

        # Load existing embeddings
        existing_embeddings = {} if force else _load_embeddings()

        # Find chunks needing embeddings
        to_embed = []
        for chunk_id, chunk in chunks.items():
            if chunk_id not in existing_embeddings:
                to_embed.append((chunk_id, chunk.get("text", "")))

        if not to_embed:
            return {
                "ok": True,
                "message": "All chunks already have embeddings",
                "chunks_total": len(chunks),
                "chunks_embedded": 0,
            }

        # Embed in batches
        embedder = LocalEmbedder.get()
        new_embeddings = {}

        for i in range(0, len(to_embed), batch_size):
            batch = to_embed[i:i + batch_size]
            texts = [text for _, text in batch]
            ids = [cid for cid, _ in batch]

            batch_embeddings = embedder.embed_batch(texts)
            for cid, emb in zip(ids, batch_embeddings):
                new_embeddings[cid] = emb

        # Merge and save
        all_embeddings = {**existing_embeddings, **new_embeddings}
        _save_embeddings(all_embeddings)

        elapsed_ms = int((time.time() - start_time) * 1000)

        result: Dict[str, Any] = {
            "ok": True,
            "chunks_total": len(chunks),
            "chunks_embedded": len(new_embeddings),
            "embedding_dimension": embedder.dimension,
            "elapsed_ms": elapsed_ms,
        }

        if warnings:
            result["warnings"] = warnings

        return result

    except ImportError:
        return {
            "ok": False,
            "error_code": "MISSING_DEPS",
            "message": "sentence-transformers not installed. Install with: pip install sentence-transformers",
        }
    except Exception as e:
        return {"ok": False, "error_code": "INDEX_FAILED", "message": str(e)}


def _action_query_interactive(
    query: str = "",
    strategy: str = "hybrid",
    top_k: int = 10,
    root: Optional[str] = None,
    **kwargs: Any,
) -> Dict[str, Any]:
    """Human-in-the-loop RAG: run query, let user select which results to keep.

    This action enables selective filtering of RAG results before they are
    passed back to the LLM context. The user sees numbered results and can
    choose which ones are relevant.

    Flow:
    1. Execute query using specified strategy
    2. Present numbered results to user via k_interact
    3. User selects which results to keep (e.g., "1,3,5" or "all")
    4. Return only selected results

    This reduces context pollution and lets humans guide retrieval relevance.
    """
    start_time = time.time()

    if not query or not query.strip():
        return {"ok": False, "error_code": "MISSING_PARAM", "message": "query is required"}

    query = query.strip()
    top_k = max(1, min(25, top_k))

    # Step 1: Run the underlying query
    result = _action_query_agentic(
        query=query,
        strategy=strategy,
        top_k=top_k,
        root=root,
        **kwargs,
    )

    if not result.get("ok"):
        return result

    matches = result.get("matches", [])
    if not matches:
        return {
            "ok": True,
            "rag_mode": "interactive",
            "query": query,
            "matches": [],
            "filtered": False,
            "message": "No results to filter",
        }

    # Step 2: Format results for human review
    result_summary_lines = []
    for i, m in enumerate(matches):
        path = m.get("path", "?")
        start_line = m.get("start_line", "?")
        score = m.get("score", 0)
        snippet_preview = (m.get("snippet", "") or "")[:80].replace("\n", " ").strip()
        result_summary_lines.append(
            f"[{i+1}] {path}:{start_line} (score: {score:.2f})\n    {snippet_preview}..."
        )

    result_summary = "\n".join(result_summary_lines)

    # Note: k_interact was removed. query_interactive now returns all results
    # with the summary for the caller to filter manually or via AskUserQuestion.
    result["rag_mode"] = "interactive"
    result["filtered"] = False
    result["result_summary"] = result_summary
    result["note"] = "Use AskUserQuestion or manual filtering to select results"
    return result


# ============================================================================
# Routed tool
# ============================================================================

ACTION_HANDLERS = {
    "help": _action_help,
    "query": _action_query,
    "status": _action_status,
    "index": _action_index,
    # Semantic search actions
    "query_semantic": _action_query_semantic,
    "query_hybrid": _action_query_hybrid,
    "query_reranked": _action_query_reranked,
    "query_multi": _action_query_multi,
    "query_reflective": _action_query_reflective,
    "query_agentic": _action_query_agentic,
    "index_semantic": _action_index_semantic,
    # Human-in-the-loop
    "query_interactive": _action_query_interactive,
}


def k_rag(
    action: str,
    query: str = "",
    top_k: int = 8,
    exts: Optional[List[str]] = None,
    root: Optional[str] = None,
    case_sensitive: bool = False,
    force: bool = False,
    strategy: str = "auto",
    bm25_weight: Optional[float] = None,
    variations: int = 3,
    scope: str = "project",
    **kwargs: Any,
) -> Dict[str, Any]:
    """Kuroryuu RAG - Multi-strategy code search.

    Routed tool with actions:
    - help: Show available actions with LLM guidance
    - query: Keyword search (BM25 + ripgrep) - best for exact matches
    - status: Check index status and freshness
    - index: Build BM25 index
    - query_semantic: Pure vector search - best for conceptual questions
    - query_hybrid: BM25 + vector combined - balanced default
    - query_reranked: Hybrid + cross-encoder re-ranking - high precision
    - query_multi: Multiple query variations - ambiguous queries
    - query_reflective: Self-correcting search loop - exploratory research
    - query_agentic: Auto strategy selection - when unsure
    - query_interactive: Human-in-the-loop result filtering - user picks which results to keep
    - index_semantic: Build vector embeddings

    Args:
        action: Action to perform (required)
        query: Search query (for query actions)
        top_k: Max results to return
        exts: File extensions to search
        root: Root directory to search/index
        case_sensitive: Case-sensitive search
        force: Force full rebuild (for index)
        strategy: Search strategy for query_agentic/query_interactive (auto|keyword|semantic|hybrid|reranked|multi|reflective)
        bm25_weight: BM25 weight for hybrid search (0-1, default 0.3)
        variations: Number of query variations for query_multi
        scope: Search scope - "project" (default, excludes reference dirs), "all" (everything), "reference" (only CaseStudies/REPOS)

    Returns:
        {ok, ...} response dict
    """
    act = (action or "").strip().lower()

    if not act:
        return {
            "ok": False,
            "error_code": "MISSING_PARAM",
            "message": "action is required. Use action='help' for available actions.",
            "details": {"available_actions": list(ACTION_HANDLERS.keys())},
        }

    handler = ACTION_HANDLERS.get(act)
    if not handler:
        return {
            "ok": False,
            "error_code": "UNKNOWN_ACTION",
            "message": f"Unknown action: {act}",
            "details": {"available_actions": list(ACTION_HANDLERS.keys())},
        }

    return handler(
        query=query,
        top_k=top_k,
        exts=exts,
        root=root,
        case_sensitive=case_sensitive,
        force=force,
        strategy=strategy,
        bm25_weight=bm25_weight,
        variations=variations,
        scope=scope,
        **kwargs,
    )


# ============================================================================
# Tool registration
# ============================================================================

def register_rag_tools(registry: "ToolRegistry") -> None:
    """Register k_rag routed tool with the registry."""

    registry.register(
        name="k_rag",
        description="Multi-strategy code search. Actions: help, query, status, index, query_semantic, query_hybrid, query_reranked, query_multi, query_reflective, query_agentic, query_interactive, index_semantic. Use query_interactive for human-in-the-loop result filtering.",
        input_schema={
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "enum": [
                        "help", "query", "status", "index",
                        "query_semantic", "query_hybrid", "query_reranked",
                        "query_multi", "query_reflective", "query_agentic",
                        "query_interactive", "index_semantic"
                    ],
                    "description": "Action to perform. Use 'query_interactive' for human-in-the-loop result selection.",
                },
                "query": {
                    "type": "string",
                    "description": "Search query (for query actions)",
                },
                "top_k": {
                    "type": "integer",
                    "default": 8,
                    "description": "Max results to return",
                },
                "exts": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "File extensions to search (for keyword query)",
                },
                "root": {
                    "type": "string",
                    "description": "Root directory to search/index",
                },
                "case_sensitive": {
                    "type": "boolean",
                    "default": False,
                    "description": "Case-sensitive search (for keyword query)",
                },
                "force": {
                    "type": "boolean",
                    "default": False,
                    "description": "Force full rebuild (for index actions)",
                },
                "strategy": {
                    "type": "string",
                    "enum": ["auto", "keyword", "semantic", "hybrid", "reranked", "multi", "reflective"],
                    "default": "auto",
                    "description": "Search strategy for query_agentic",
                },
                "bm25_weight": {
                    "type": "number",
                    "default": 0.3,
                    "description": "BM25 weight for hybrid search (0-1)",
                },
                "variations": {
                    "type": "integer",
                    "default": 3,
                    "description": "Number of query variations for query_multi",
                },
                "scope": {
                    "type": "string",
                    "enum": ["project", "all", "reference"],
                    "default": "project",
                    "description": "Search scope: 'project' (default, excludes CaseStudies/REPOS), 'all' (everything), 'reference' (only CaseStudies/REPOS)",
                },
            },
            "required": ["action"],
        },
        handler=k_rag,
    )
