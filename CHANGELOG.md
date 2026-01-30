# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-01-30

### Initial Public Release

#### Core Features
- Multi-agent orchestration with leader/worker architecture
- PTY daemon for persistent terminal session management
- Desktop Electron app with rich theming and UI
- Gateway API for unified LLM routing (Claude, LMStudio, Ollama, OpenAI-compatible)
- MCP integration with 16 tools providing 118 routed actions

#### Agent System
- Ralph leader for autonomous task orchestration
- Thinker system for multi-perspective debates
- Checkpoint and session persistence
- Cross-agent communication via inbox system

#### Desktop Application
- Immersive terminal with PTY session management
- Voice input with speech recognition
- Text-to-speech output with Edge TTS
- Screen capture and automation via k_pccontrol
- Multiple themes (Kuroryuu, Grunge, Light)
- Tray companion for quick access

#### Development Tools
- RAG indexing and semantic search
- Repository intelligence reports
- Real-time traffic monitoring
- GitHub integration for commits and PRs

#### Infrastructure
- Docker support with docker-compose
- Multi-provider LLM backend support
- Portable project setup via setup-project.ps1
- WSL compatibility

### Technical Details
- 431 development tasks completed
- 235 React components
- 9,030 line CLI with 24 commands
- 16 MCP tools with 118 actions
