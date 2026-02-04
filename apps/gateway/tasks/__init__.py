"""Task Management - Single integration point for all task creation."""

from .router import router as tasks_router

__all__ = ["tasks_router"]
