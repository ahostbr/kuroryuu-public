"""
Screenshot Error Classifier

Automatically classifies worker errors as code_issue, ui_issue, or unknown.
Used to route different nudge strategies based on error type.

Part of Phase 0 Tier 1.2 - Audit Trail Framework (Task 2)
"""

import logging
from pathlib import Path
from typing import Dict, Any, Optional

logger = logging.getLogger(__name__)


class ErrorClassifier:
    """Classify errors to determine nudge strategy."""

    # Keywords that indicate code issues
    CODE_KEYWORDS = [
        "import",
        "syntax",
        "typeerror",
        "referenceerror",
        "nameerror",
        "indentation",
        "eofmarker",
        "unexpected",
        "defined",
        "missing",
        "circular",
        "module",
        "package",
        "trace",
        "exception",
        "stack",
        "attribute",
        "key error",
        "value error",
        "assertion",
        "compile",
        "runtime",
    ]

    # Keywords that indicate UI issues
    UI_KEYWORDS = [
        "visible",
        "layout",
        "position",
        "click",
        "element",
        "dom",
        "render",
        "component",
        "viewport",
        "display",
        "alignment",
        "button",
        "field",
        "input",
        "modal",
        "page",
        "css",
        "style",
        "background",
        "border",
        "font",
        "color",
        "size",
        "width",
        "height",
    ]

    def classify_error(self, error_text: str, screenshot_path: Optional[str] = None) -> Dict[str, Any]:
        """
        Classify worker error as code_issue, ui_issue, or unknown.

        Args:
            error_text: Error message from worker
            screenshot_path: Path to screenshot (optional, for future image analysis)

        Returns:
            Classification dictionary with:
            {
                "type": "code_issue" | "ui_issue" | "unknown",
                "confidence": 0.0-1.0,
                "keywords": ["matched", "keywords"],
                "reasoning": ["why", "this", "classification"],
                "recommendation": "what nudge strategy to use"
            }
        """

        classification = {
            "type": "unknown",
            "confidence": 0.0,
            "keywords": [],
            "reasoning": [],
            "recommendation": "",
        }

        # --- TEXT ANALYSIS (NLP on error message) ---
        if not error_text:
            return classification

        error_lower = error_text.lower()

        # Count keyword matches
        code_hits = 0
        ui_hits = 0
        matched_code_keywords = []
        matched_ui_keywords = []

        for kw in self.CODE_KEYWORDS:
            if kw in error_lower:
                code_hits += 1
                matched_code_keywords.append(kw)

        for kw in self.UI_KEYWORDS:
            if kw in error_lower:
                ui_hits += 1
                matched_ui_keywords.append(kw)

        # --- DECISION LOGIC ---
        if code_hits >= 2:
            # Clear code issue
            classification["type"] = "code_issue"
            classification["confidence"] = min(0.95, 0.6 + code_hits * 0.1)
            classification["keywords"] = matched_code_keywords[:5]  # Top 5 keywords
            classification["reasoning"].append(f"Detected {code_hits} code error keywords")
            classification["recommendation"] = (
                "Send hint pointing to file:line + suggest checking imports/syntax/types"
            )

        elif ui_hits >= 2:
            # Clear UI issue
            classification["type"] = "ui_issue"
            classification["confidence"] = min(0.95, 0.6 + ui_hits * 0.1)
            classification["keywords"] = matched_ui_keywords[:5]  # Top 5 keywords
            classification["reasoning"].append(f"Detected {ui_hits} UI error keywords")
            classification["recommendation"] = (
                "Send hint with screenshot reference + coordinate clues (e.g., 'Button not visible at x,y')"
            )

        else:
            # Ambiguous case - look for contextual clues
            if code_hits >= 1 and ui_hits == 0:
                # More likely code
                classification["type"] = "code_issue"
                classification["confidence"] = 0.65
                classification["keywords"] = matched_code_keywords
                classification["reasoning"].append(f"Detected {code_hits} code keywords (low confidence)")
                classification["recommendation"] = "Ask worker: 'Is this a code issue (syntax/import) or UI issue (layout/visibility)?'"

            elif ui_hits >= 1 and code_hits == 0:
                # More likely UI
                classification["type"] = "ui_issue"
                classification["confidence"] = 0.65
                classification["keywords"] = matched_ui_keywords
                classification["reasoning"].append(f"Detected {ui_hits} UI keywords (low confidence)")
                classification["recommendation"] = "Ask worker: 'Is this a code issue (syntax/import) or UI issue (layout/visibility)?'"

            else:
                # Truly unknown
                classification["type"] = "unknown"
                classification["confidence"] = 0.0
                classification["keywords"] = matched_code_keywords + matched_ui_keywords
                classification["reasoning"].append("Insufficient evidence for classification")
                classification["recommendation"] = (
                    "Ask worker: 'Is this a code issue (syntax/import) or UI issue (layout/visibility)?'"
                )

        return classification


# Global classifier instance
_classifier = None


def get_error_classifier() -> ErrorClassifier:
    """Get or create global error classifier."""
    global _classifier
    if _classifier is None:
        _classifier = ErrorClassifier()
    return _classifier


def classify_error(error_text: str, screenshot_path: Optional[str] = None) -> Dict[str, Any]:
    """
    Classify error (convenience function).

    Args:
        error_text: Error message from worker
        screenshot_path: Optional path to screenshot

    Returns:
        Classification dict
    """
    classifier = get_error_classifier()
    return classifier.classify_error(error_text, screenshot_path)
