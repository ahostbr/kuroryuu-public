# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

#### Agent Flow & Coding Agents (Feb 4, 2026)
- ReactFlow-based hub-and-spoke Agent Flow visualization
- Real-time output streaming via WebSocket for coding agents
- Session persistence via IndexedDB
- Spawn agent UI with presets (Claude, Codex, Kiro, Aider, Custom)
- Tab navigation (Sessions/Agent Flow) in Coding Agents panel
- Custom node components (SessionManagerNode, AgentSessionNode)
- Controls panel (pause, reset, reconnect, view toggle)
- Stats bar (total, running, completed, failed)
- LIVE indicator in SessionLogViewer

#### Restic Backup Manager (Feb 4, 2026)
- k_backup MCP tool with 11 actions (init, backup, list, restore, diff, check, forget, prune, config)
- Real-time progress streaming to Gateway
- Desktop service layer with 16 IPC handlers
- bcrypt password hashing for repository security
- Auto-download of restic binary
- Metadata enrichment (short_id, parent refs, time_ago)

#### Configuration Management (Feb 4, 2026)
- Config backup/restore system in Desktop Plugin Config
- Expandable preview UI (TTS, validators, hooks, features)
- Backup list with timestamps, restore, delete functions

#### Smart TTS Features (Feb 3, 2026)
- Smart completion announcements via TTS
- Task extraction from agent transcripts
- Prompt engineering for contextual messages
- UI dropdown for summary provider selection
- Performance optimization with content hashing

#### Coding Agent Infrastructure (Feb 1, 2026)
- k_bash tool with PTY and background support
- k_process tool for session monitoring (list, poll, log, write, submit, kill)
- Desktop UI panel with session cards and live log viewer
- Zustand store for session state management
- Coding-agent skill documentation and KURORYUU_LEADER.md integration

#### CLI v2 (Jan 31, 2026)
- Updated dragon ASCII art (36 lines)
- MCP error throttling to prevent console spam
- Full feature set: Chat, Tools, Agents, Config, Help tabs
- 6 themes: kuroryuu, solarized-dark, dracula, nord, monokai, neon

#### Post-Release Features (Jan 30-31, 2026)
- Leader death restart mechanism (batch file)
- AskUserQuestion UI component
- Image lightbox functionality
- Quizmaster cinematic redesign with animations

### Changed

#### UI/UX Improvements (Feb 1-4, 2026)
- TTS queue timeout increased (5s → 25s)
- Default userName made configurable (previously hardcoded)
- SETTINGS_DIR path resolution fixed
- Claude Mode dialog scrolling improved
- Agent Launcher double-modal issue resolved
- Plan Mode button added (shift+tab shortcut)

### Fixed

#### Gateway & Network (Jan 30-31, 2026)
- Network graph endpoint explosion (15K → 39 endpoints)
- Screenshot path typo (captures → capture)
- Gateway startup logger undefined error
- Gateway health endpoint corrections
- CLI auto-start service handling

#### CLIProxy Fixes (Jan 30 - Feb 3, 2026)
- CLIProxyAPI hung state and shutdown cleanup
- CLIProxyAPI auto-start on Desktop launch (reordered startup sequence)
- Native mode improvements
- Registration logging improvements

#### PTY & Terminal (Jan 29-30, 2026)
- PTY spawn fixes
- Terminal registration logging improvements
- Endpoint explosion fixes

#### Desktop Application (Jan 29 - Feb 4, 2026)
- TTS config path bug
- Hotkeys and status UI adjustments
- Claude Tasks evidence linking for worklog/checkpoint props
- Restored Claude Tasks section to ai/todo.md

### Security

#### Security Hardening (Feb 4, 2026)
- Fixed proxy header bypass vulnerability (CRITICAL)
- CORS lockdown to localhost-only
- WebSocket origin validation
- Origin/Referer validation for POST/PUT/DELETE requests
- Desktop auth localhost-only enforcement
- Removed ALLOW_EXTERNAL config option

### Documentation

#### New Documentation (Jan 30 - Feb 2, 2026)
- Comprehensive k_pty PTY Control System guide (631 lines, 11 actions)
- OpenCode case study (~4,500 words analyzing Go-based terminal AI)
- Kuro Plugin documentation (14 slash commands, 5 hooks, 2 skills, 11 agents)
- Max-swarm multi-agent coordination docs

### Removed

#### Public Release Cleanup (Jan 28-29, 2026)
- Removed Clawdbot Docker worker integration (6 files, 2,112 lines)
- Removed 8-step onboarding wizard (14 files deleted)
- Removed internal tools and feature gating for public release

---

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
