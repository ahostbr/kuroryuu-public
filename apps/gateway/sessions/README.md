# Agent Sessions Module

RAG-integrated session storage for Kuroryuu agents.

## Features
- Full chat history persistence per agent session
- JSON files in `ai/agent_sessions/`
- Queryable by tools (semantic search support)
- Auto-indexed for context injection

## Files
- `models.py` - AgentSession, ChatMessage dataclasses
- `storage.py` - SessionStorage class with RAG integration
