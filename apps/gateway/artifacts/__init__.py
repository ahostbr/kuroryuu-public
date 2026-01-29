"""
Artifacts module - Canvas artifact management.

Provides REST API and storage for interactive canvas artifacts:
- Document (markdown, code, diff)
- Diagram (ReactFlow nodes/edges)
- Chart (data visualization)
- Calendar (events, meeting picker)
- Seatmap (grid selection)
- Code (syntax-highlighted)
"""

from .router import router
from .models import (
    Artifact,
    ArtifactCreate,
    ArtifactUpdate,
    ArtifactResponse,
    ArtifactListResponse,
)
from .storage import ArtifactStorage

__all__ = [
    "router",
    "Artifact",
    "ArtifactCreate",
    "ArtifactUpdate",
    "ArtifactResponse",
    "ArtifactListResponse",
    "ArtifactStorage",
]
