"""
History Compaction

Summarize conversation history to reduce token usage.
Works with any LLM provider through the backend abstraction.
"""

from typing import List, Dict, Any, Optional, Protocol
import logging

logger = logging.getLogger(__name__)

# Default prompt for history compaction
COMPACT_PROMPT = """Summarize this conversation history into a concise context block.

Preserve:
- Key decisions made and their rationale
- Files discussed, modified, or created
- Current task state and progress
- Important technical context for continuing
- Any errors encountered and how they were resolved

Format as a structured summary that can replace the full history.
Keep it under 500 words while capturing essential context.

Conversation history:
"""

# Minimal prompt for very long histories
COMPACT_PROMPT_MINIMAL = """Create a brief summary of this conversation (under 200 words).
Focus on: current task, files touched, key decisions.

History:
"""


class LLMClient(Protocol):
    """Protocol for LLM client interface."""

    async def complete(
        self,
        messages: List[Dict[str, str]],
        model: Optional[str] = None
    ) -> Any:
        """Send completion request."""
        ...


async def compact_history(
    messages: List[Dict[str, Any]],
    llm_client: LLMClient,
    model: Optional[str] = None,
    max_messages: int = 30,
    truncate_length: int = 500
) -> str:
    """
    Summarize conversation history using the LLM.

    Args:
        messages: List of conversation messages
        llm_client: LLM client for generating summary
        model: Optional model override for summarization
        max_messages: Maximum messages to include in summary request
        truncate_length: Max chars per message in summary request

    Returns:
        Summarized context string
    """
    if not messages:
        return "No conversation history to summarize."

    # Select recent messages
    recent = messages[-max_messages:]

    # Format history for summarization
    history_text = _format_history_for_summary(recent, truncate_length)

    # Choose prompt based on history length
    prompt = COMPACT_PROMPT if len(recent) < 20 else COMPACT_PROMPT_MINIMAL

    try:
        response = await llm_client.complete(
            messages=[
                {"role": "system", "content": prompt},
                {"role": "user", "content": history_text}
            ],
            model=model
        )

        # Extract content from response
        summary = _extract_response_content(response)
        logger.info(f"Compacted {len(messages)} messages into {len(summary)} chars")

        return summary

    except Exception as e:
        logger.error(f"Compaction failed: {e}")
        # Fallback: simple truncation
        return _fallback_compact(messages)


def _format_history_for_summary(
    messages: List[Dict[str, Any]],
    truncate_length: int
) -> str:
    """Format messages for the summarization prompt."""
    lines = []

    for msg in messages:
        role = msg.get("role", "unknown")
        content = msg.get("content", "")

        # Handle different content formats
        if isinstance(content, list):
            # Multi-part content (e.g., with images)
            text_parts = [
                p.get("text", "") for p in content
                if isinstance(p, dict) and p.get("type") == "text"
            ]
            content = " ".join(text_parts)

        # Truncate long messages
        if len(content) > truncate_length:
            content = content[:truncate_length] + "..."

        # Format role
        role_label = {
            "user": "[User]",
            "assistant": "[Assistant]",
            "system": "[System]",
        }.get(role, f"[{role}]")

        lines.append(f"{role_label}: {content}")

    return "\n\n".join(lines)


def _extract_response_content(response: Any) -> str:
    """Extract text content from various response formats."""
    # Handle different response structures
    if isinstance(response, str):
        return response

    if hasattr(response, "content"):
        content = response.content
        if isinstance(content, str):
            return content
        if isinstance(content, list):
            return " ".join(str(c) for c in content)

    if isinstance(response, dict):
        if "content" in response:
            return str(response["content"])
        if "text" in response:
            return str(response["text"])
        if "choices" in response and response["choices"]:
            choice = response["choices"][0]
            if "message" in choice:
                return str(choice["message"].get("content", ""))
            if "text" in choice:
                return str(choice["text"])

    return str(response)


def _fallback_compact(messages: List[Dict[str, Any]]) -> str:
    """Fallback compaction when LLM call fails."""
    lines = ["[Conversation summary - LLM compaction unavailable]", ""]

    # Count messages by role
    user_count = sum(1 for m in messages if m.get("role") == "user")
    assistant_count = sum(1 for m in messages if m.get("role") == "assistant")

    lines.append(f"Messages: {len(messages)} total ({user_count} user, {assistant_count} assistant)")

    # Get first and last user messages
    user_messages = [m for m in messages if m.get("role") == "user"]
    if user_messages:
        first_user = str(user_messages[0].get("content", ""))[:100]
        lines.append(f"First topic: {first_user}...")

        if len(user_messages) > 1:
            last_user = str(user_messages[-1].get("content", ""))[:100]
            lines.append(f"Latest topic: {last_user}...")

    return "\n".join(lines)


def estimate_token_count(messages: List[Dict[str, Any]]) -> int:
    """
    Estimate token count for messages.

    Uses rough approximation: 1 token ≈ 4 characters.
    """
    total_chars = 0

    for msg in messages:
        content = msg.get("content", "")
        if isinstance(content, list):
            for part in content:
                if isinstance(part, dict) and "text" in part:
                    total_chars += len(part["text"])
        else:
            total_chars += len(str(content))

    return total_chars // 4


def should_compact(
    messages: List[Dict[str, Any]],
    threshold_tokens: int = 50000
) -> bool:
    """
    Determine if history should be compacted.

    Args:
        messages: Conversation messages
        threshold_tokens: Token threshold for suggesting compaction

    Returns:
        True if compaction is recommended
    """
    estimated = estimate_token_count(messages)
    return estimated > threshold_tokens


def format_usage_stats(messages: List[Dict[str, Any]]) -> str:
    """Format usage statistics for display."""
    total = len(messages)
    user_count = sum(1 for m in messages if m.get("role") == "user")
    assistant_count = sum(1 for m in messages if m.get("role") == "assistant")
    system_count = sum(1 for m in messages if m.get("role") == "system")

    estimated_tokens = estimate_token_count(messages)

    lines = [
        "Session Usage:",
        f"  Messages: {total} total",
        f"    - User: {user_count}",
        f"    - Assistant: {assistant_count}",
        f"    - System: {system_count}",
        f"  Estimated tokens: ~{estimated_tokens:,}",
    ]

    if should_compact(messages):
        lines.append("")
        lines.append("  [Tip: Use /compact to reduce token usage]")

    return "\n".join(lines)
