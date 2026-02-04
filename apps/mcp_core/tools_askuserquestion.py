"""
k_askuserquestion - Interactive User Input Tool

Mirrors Claude Code CLI's AskUserQuestion tool exactly.
Pauses LLM execution until user responds via Desktop Assistant UI.

Features:
- 1-4 questions per call
- 2-4 options per question
- Multi-select support (checkboxes vs radio)
- "Other" option always available for custom text input
- Option descriptions for context
- 5-minute default timeout
"""

import os
import time
import uuid
from typing import Any, Dict, List, Optional

import httpx

# Gateway URL for question storage
GATEWAY_URL = os.environ.get("KURORYUU_GATEWAY_URL", "http://localhost:8200")


def _ok(data: Any = None) -> Dict[str, Any]:
    """Success response."""
    return {"ok": True, "data": data, "error": None}


def _err(error_code: str, message: str, data: Any = None) -> Dict[str, Any]:
    """Error response."""
    return {"ok": False, "error_code": error_code, "message": message, "data": data}


def k_askuserquestion(
    questions: Optional[List[Dict[str, Any]]] = None,
    timeout_seconds: int = 300,
    action: str = "ask",
    **kwargs: Any,
) -> Dict[str, Any]:
    """
    Ask the user 1-4 questions and wait for their responses.

    Mirrors Claude Code CLI's AskUserQuestion tool exactly.

    Args:
        action: "help" or "ask" (default: "ask")
        questions: List of 1-4 question objects:
            [
                {
                    "question": "Which library?",  # Full question text
                    "header": "Library",           # Short label (max 12 chars)
                    "multiSelect": false,          # true=checkboxes, false=radio
                    "options": [                   # 2-4 options
                        {"label": "React", "description": "Popular framework"},
                        {"label": "Vue", "description": "Simpler learning curve"},
                    ]
                }
            ]
        timeout_seconds: Max wait time (default 5 min, max 10 min)

    Returns:
        {
            "ok": true,
            "data": {
                "answers": {
                    "question_0": "React",           # Single select
                    "question_1": ["A", "B"],        # Multi select
                    "question_2": "Custom input..."  # "Other" option
                },
                "question_id": "q_abc123"
            }
        }
    """
    act = (action or "ask").strip().lower()

    if act == "help":
        return _ok({
            "tool": "k_askuserquestion",
            "description": "Ask the user questions and wait for their response via Desktop UI",
            "actions": {
                "help": "Show this help",
                "ask": "Ask questions (default)",
            },
            "parameters": {
                "questions": "List of 1-4 question objects",
                "timeout_seconds": "Max wait time (default 300, max 600)",
            },
            "question_format": {
                "question": "Full question text (required)",
                "header": "Short label, max 12 chars (required)",
                "multiSelect": "true for checkboxes, false for radio (default: false)",
                "options": "List of 2-4 {label, description?} objects (required)",
            },
            "example": {
                "questions": [
                    {
                        "question": "Which library should we use for the frontend?",
                        "header": "Library",
                        "multiSelect": False,
                        "options": [
                            {"label": "React (Recommended)", "description": "Popular, well-supported"},
                            {"label": "Vue", "description": "Simpler learning curve"},
                            {"label": "Svelte", "description": "Compile-time optimized"},
                        ]
                    }
                ]
            },
            "notes": [
                "User can always select 'Other' to type a custom answer",
                "Tool blocks until user responds or timeout",
                "Requires Kuroryuu Desktop for the UI",
            ],
        })

    # Validate questions
    if not questions:
        return _err("MISSING_PARAM", "questions is required. Use action='help' for usage.")

    if not isinstance(questions, list):
        return _err("INVALID_PARAMS", "questions must be a list")

    if len(questions) < 1:
        return _err("INVALID_PARAMS", "At least 1 question required")

    if len(questions) > 4:
        return _err("INVALID_PARAMS", "Maximum 4 questions allowed")

    # Validate each question
    for i, q in enumerate(questions):
        if not isinstance(q, dict):
            return _err("INVALID_PARAMS", f"Question {i}: must be an object")

        if "question" not in q or not q["question"]:
            return _err("INVALID_PARAMS", f"Question {i}: 'question' field is required")

        if "header" not in q or not q["header"]:
            return _err("INVALID_PARAMS", f"Question {i}: 'header' field is required")

        if len(q.get("header", "")) > 12:
            return _err("INVALID_PARAMS", f"Question {i}: header must be max 12 characters")

        opts = q.get("options", [])
        if not isinstance(opts, list):
            return _err("INVALID_PARAMS", f"Question {i}: 'options' must be a list")

        if len(opts) < 2:
            return _err("INVALID_PARAMS", f"Question {i}: at least 2 options required")

        if len(opts) > 4:
            return _err("INVALID_PARAMS", f"Question {i}: maximum 4 options allowed")

        for j, opt in enumerate(opts):
            if not isinstance(opt, dict):
                return _err("INVALID_PARAMS", f"Question {i}, Option {j}: must be an object")
            if "label" not in opt or not opt["label"]:
                return _err("INVALID_PARAMS", f"Question {i}, Option {j}: 'label' is required")

    # Validate timeout
    timeout_seconds = min(max(timeout_seconds, 10), 600)  # 10s - 10min

    try:
        # 1. Create question session in Gateway
        response = httpx.post(
            f"{GATEWAY_URL}/interact/ask",
            json={"questions": questions},
            timeout=10,
        )

        if response.status_code != 200:
            return _err("GATEWAY_ERROR", f"Failed to create question: {response.text}")

        data = response.json()
        if not data.get("ok"):
            return _err("GATEWAY_ERROR", data.get("message", "Unknown error"))

        question_id = data.get("question_id")
        if not question_id:
            return _err("GATEWAY_ERROR", "No question_id returned")

        # 2. Poll until all questions answered or timeout
        start = time.time()
        poll_count = 0

        while time.time() - start < timeout_seconds:
            time.sleep(0.5)  # Poll every 500ms
            poll_count += 1

            try:
                status_response = httpx.get(
                    f"{GATEWAY_URL}/interact/status/{question_id}",
                    timeout=5,
                )

                if status_response.status_code == 404:
                    return _err("NOT_FOUND", f"Question {question_id} not found")

                if status_response.status_code != 200:
                    continue  # Retry on transient errors

                status = status_response.json()

                if status.get("answered"):
                    return _ok({
                        "answers": status.get("answers", {}),
                        "questions": status.get("questions", []),  # Include for card display
                        "question_id": question_id,
                        "poll_count": poll_count,
                        "elapsed_seconds": round(time.time() - start, 1),
                    })

            except httpx.RequestError:
                continue  # Retry on connection errors

        # 3. Timeout
        return _err(
            "TIMEOUT",
            f"User did not respond within {timeout_seconds}s",
            {"question_id": question_id, "elapsed_seconds": timeout_seconds},
        )

    except httpx.RequestError as e:
        return _err("CONNECTION_ERROR", f"Failed to connect to Gateway: {e}")
    except Exception as e:
        return _err("UNEXPECTED_ERROR", str(e))


def register_askuserquestion_tools(registry: "ToolRegistry") -> None:
    """Register k_askuserquestion tool with the registry."""
    registry.register(
        name="k_askuserquestion",
        description=(
            "Ask the user 1-4 questions and wait for their response via Desktop UI. "
            "Supports multiple choice (radio/checkbox), option descriptions, and 'Other' text input. "
            "Actions: help, ask"
        ),
        input_schema={
            "type": "object",
            "properties": {
                "action": {
                    "type": "string",
                    "description": "Action to perform: help, ask",
                    "enum": ["help", "ask"],
                    "default": "ask",
                },
                "questions": {
                    "type": "array",
                    "description": "1-4 questions to ask the user",
                    "minItems": 1,
                    "maxItems": 4,
                    "items": {
                        "type": "object",
                        "properties": {
                            "question": {
                                "type": "string",
                                "description": "The full question text",
                            },
                            "header": {
                                "type": "string",
                                "description": "Short label/chip (max 12 chars)",
                                "maxLength": 12,
                            },
                            "multiSelect": {
                                "type": "boolean",
                                "description": "Allow multiple selections (checkboxes)",
                                "default": False,
                            },
                            "options": {
                                "type": "array",
                                "description": "2-4 answer options (user can always type 'Other')",
                                "minItems": 2,
                                "maxItems": 4,
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "label": {
                                            "type": "string",
                                            "description": "Option text",
                                        },
                                        "description": {
                                            "type": "string",
                                            "description": "Optional explanation",
                                        },
                                    },
                                    "required": ["label"],
                                },
                            },
                        },
                        "required": ["question", "header", "options"],
                    },
                },
                "timeout_seconds": {
                    "type": "integer",
                    "description": "Max wait time in seconds (default 300, max 600)",
                    "default": 300,
                    "minimum": 10,
                    "maximum": 600,
                },
            },
            "required": [],  # action defaults to "ask", questions required for ask
        },
        handler=k_askuserquestion,
    )
