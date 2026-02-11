# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

#### Generative UI Case Study — Full AG-UI Pipeline (Feb 5-6, 2026)
- Gateway A2UI engine with 3-stage pipeline: content analyzer, layout selector, component generator (8 Python files in `apps/gateway/genui/`)
- 51 A2UI React components across 11 categories (Data, Summary, Instructional, Lists, Resources, People, News, Media, Comparison, Layout, Tags)
- A2UIRenderer, A2UICatalog, and LayoutEngine for zone-based dashboard rendering
- Zustand store with SSE consumption and JSON Patch state updates
- Standalone Electron window with IPC bridge, `#/genui` hash route, and sidebar launcher (G shortcut)
- Full panel UI: GenUIInput (samples + drag-drop), GenUILoading (progress), GenUIDashboard (zone-based grid), GenUISourceView
- Imperial/Theme-aware mode toggle with `--g-*` CSS variable theming, `color-mix()` opacity pattern (~250 hardcoded colors refactored across 13 files)
- GenUI domain added to Domain Config with configurable LLM model/provider selection threading through generation pipeline
- Source-based model grouping in domain config dropdown (groups by Claude, OpenAI, Gemini, etc. instead of mega-group)
- Design token injection into Gateway prompt generation for Kuroryuu dark imperial aesthetic

#### Claude Teams Analytics & Visualization (Feb 5-7, 2026)
- TeamsAnalyticsPanel with team summary metrics: velocity, completion%, messages, response latency, message rate, uptime
- Per-agent performance bars and bottleneck detection
- Task duration display in TaskCard and on graph nodes
- activeForm spinner on task nodes, backendType badges on teammate nodes
- Dependency edges in graph views
- Auto-mark-read for inbox messages with read/unread styling
- Prompt preview and subscription details in TeammateDetailPanel

#### Claude Teams Timeline Bake-Off (Feb 6, 2026)
- 4 timeline renderers: SVG Vertical Spine, ReactFlow Swimlane Flow, ECharts Horizontal Dots, Canvas Rainbow Arc
- Shared infrastructure: timeline-types.ts, timeline-utils.ts, TimelineTaskCard, TimelineToolbar, TimelineView wrapper
- Adaptive density, 4 color modes, theme-dependent animations
- Archive replay support with renderer switching
- Hover tooltips: Canvas floating tooltip, SVG/ReactFlow browser title tooltips with whileHover scale

#### ElevenLabs TTS Integration (Feb 6, 2026)
- speak_elevenlabs() backend in smart_tts.py with provider routing
- Desktop token-store integration for encrypted API key management via electron.safeStorage
- Dynamic voice fetching from ElevenLabs REST API with model selection (Turbo v2.5, Multilingual v2)
- Stability/similarity sliders, voice preview, voice metadata (labels, accent, age, gender)
- Voice sharing UI: recommended voice (Kuroryuu_1), one-click select, voice ID paste/copy
- Unified API key management through Integrations dialog, consumed by Plugin Config, Desktop Assistant, TTSButton, smart_tts.py, and Tray Companion

#### Task Metadata System (Phases 18-19, Feb 5-6, 2026)
- ai/task-meta.json sidecar for rich metadata: description, priority, category, complexity, worklog, checkpoint
- SIDECAR_KEYS routing constant for field separation between todo.md and sidecar
- IPC handlers: getMeta, updateMeta, linkWorklog, linkCheckpoint
- PostToolUse hook writes full description to sidecar on TaskCreate
- Gateway merges sidecar on `/v1/tasks/list`; new `GET /v1/tasks/{id}` and `PUT /v1/tasks/{id}/meta` endpoints
- k_checkpoint `task_id` parameter auto-links checkpoint+worklog paths to sidecar on save
- k_checkpoint `worklog=true` auto-generates KuroRyuuWorkLog with cross-reference header
- k_checkpoint `append` action for deep-merge in-place updates

#### Scheduler System (Feb 6-7, 2026)
- Full scheduler engine with storage, CalendarView, DayModal, JobEditor, JobHistoryPanel, SchedulerPanel
- Dual execution modes: Background (silent, auto-closes with PID tracking) and Interactive (visible, persistent PowerShell -NoExit)
- Per-job configurable timeout replacing hardcoded 1-hour limit
- CRUD operations for scheduled events, jobs, and prompts

#### Team Orchestration Enhancements (Feb 6-7, 2026)
- /k-spawnteam command with 7 templates: code-review, feature-dev, research, debug, prd-workflow, thinker-debate, security-audit, quality-review
- Prompt pack loading from `ai/prompt_packs/` at spawn time with YAML frontmatter stripping
- Thinker pairing system with `--pairing` flag (visionary+skeptic, red_team+blue_team, etc.)
- Stale team auto-cleanup: 30-minute staleness detection (60s polling), auto-archive and delete dead teams
- Archive message viewer with Timeline/By-Agent views, chat bubbles, expandable task descriptions
- Inbox-based teammate messaging replacing fire-and-forget CLI
- Codex-Claude command bridge skill for slash command resolution

#### Desktop UI Additions (Feb 5-6, 2026)
- Dragon-centric empty states for Ideation, Roadmap, Kuroryuu Agents, HTTP Traffic, and Orchestration panels (crimson breathing animation, gold kanji, scanlines+vignette)
- Reusable DragonBackdrop component with DRAGON_ASCII constant
- Capture panel redesigned as dark imperial surveillance console with terminal-style buttons, surveillance-frame image preview
- 7 new tool category icons: Memory, Inbox, Thinker, Process, Session, Files, Capture
- Quizmaster v5 "The Living Quizmaster" — self-evolving prompt with k_rag reconnaissance, adaptive domain weighting, k_collective memory, self-rewrite with mutation log

#### Infrastructure & Services (Feb 6, 2026)
- ClaudeSettingsWriter service: centralized singleton with per-file async mutex, auto-backup (keep 20), protected field validation, atomic .tmp writes; all 6 settings.json writers refactored
- Global TTS hooks: install/remove/status IPC, UV binary resolution, prerequisites validation, source-based double-fire prevention
- Playwright CLI skill replacing legacy Playwright MCP entry
- MCP Stdio bridge supporting both Content-Length framed (MCP/LSP) and legacy newline-delimited JSON-RPC

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

#### Multi-Agent Observability Dashboard (Feb 9-10, 2026)
- Gateway observability module: SQLite storage, WebSocket live streaming, 5 REST endpoints (`/v1/observability/events`, `/stream`, `/stats`, `/export`, `/clear`)
- ObservabilityStorage with event ingestion, time-range queries, tool analytics aggregation, adaptive time bucketing
- 13 hook scripts via unified `send_event.py` (Python/uv) replacing 12 individual PowerShell wrappers
- Zustand store with WebSocket auto-reconnect, time range filtering, tool frequency maps, swim lane grouping
- 7 React UI components: ObservabilityPanel (tab router), EventTimeline, PulseChart, ToolAnalytics, SwimLanes, ObservabilitySettings, ExportButton
- Export/import JSON, copy-to-clipboard, extended time ranges (1h/6h/24h/all), live timestamp refresh
- Windows piggyback pattern: observability hooks only appended to existing hook arrays to avoid Claude Code terminal input freeze bug on Windows v2.1.37

#### Superpowers V2 Prompts (Feb 10, 2026)
- 7 V2 prompt files with Superpowers discipline integration (verification gates, rationalization prevention, red flags, forbidden responses)
- Files: worker_iterate_v2, worker_loop_v2, leader_escalate_v2, prd_validator_v2, prd_code_reviewer_v2, prd_hackathon_finalizer_v2, ralph_done_v2

#### Agents Overflow Integration (Feb 10, 2026)
- Installed Agents Overflow plugin commands: ao-search, ao-browse, ao-ask, ao-answer
- Updated agent prompts (worker_iterate, worker_iterate_v2, KURORYUU_BOOTSTRAP) with AO awareness
- Homescreen feature card with `shell.openExternal` URL button
- Plugin registered in settings.json

#### VirtualBox Sandboxing Documentation (Feb 10, 2026)
- Technical analysis of VirtualBox 7.2.6 Python API for programmatic VM sandboxing
- End-user guide for sandbox setup (`Docs/Guides/VirtualBox-Sandboxing.md`)

### Changed

#### UI/UX Updates (Feb 9-10, 2026)
- Sidebar: moved Claude Plugin from PLAN nav group to bottom actions section (custom ClaudeCodeIcon SVG with square eye cutouts and blocky body)
- Domain config dialog: embedded category headers inside first card of each category (continuous 2-col grid, no blank spots)
- KuroPluginConfig: fixed "Your Name" input width with flex-1 layout
- Settings template/default updated with current feature set (agent teams, official plugins, observability)
- Git commit log parser: NUL-delimited format for reliable multi-line commit message handling
- Observability hooks consolidated: 12 PowerShell wrapper scripts replaced with single `send_event.py` (Python/uv)
- Log rotation and reduced verbose logging in Gateway

#### UI/UX Overhaul (Feb 5-8, 2026)
- Command Center renamed to Server Status; ServersTab compacted from grid of large cards to single card with compact rows (~40px each); ToolsTab server section from ~240px grid to ~40px inline status bar
- TTS Companion layout redesign: vertical sidebar replaced with horizontal top-bar navigation (52px), 3-column TTS settings, collapsible Voice Assistant sections
- Settings window now closes to tray instead of quitting; clarified tray menu labels with sublabel descriptions
- Sidebar reorganization: Insights→ChatBot, Backups→Integrations, GitHub→Chronicles, Claude Plugin→Plan, Coding Agents→Build
- Desktop Assistant empty state overhaul with dramatic ASCII dragon centerpiece, crimson pulsing glow, gold kanji header, scanlines+vignette overlays, 2x2 glass action cards
- EditorPane upgraded with readOnly prop; CodeMirror 6 for both editable and read-only displays
- DataTable enhanced to accept object rows with auto-derived headers and null/undefined handling
- Domain config model dropdown now groups by actual source provider (Claude, OpenAI, Gemini) instead of single mega-group
- Settings broadcast to all BrowserWindows instead of only mainWindow (fixes GenUI window sync)
- Dev Mode improvements: keyboard shortcuts aligned, Hot Reload button in App Settings, devMode persists with user scope, mirrored into Electron-wide settings for HMR gating
- TTS voice priority: smart_tts.py reads voice from settings.json first (over CLI arg) so voice changes work without restarting Claude
- ElevenLabs API key managed in Integrations dialog; Plugin Config shows "Managed in Integrations" badge
- Renamed worklog prefix from KiroWorkLog_ to KuroRyuuWorkLog_
- Renamed /max-parallel to /max-subagents-parallel across 17 files
- Team cleanup mechanism: replaced broken fire-and-forget CLI cleanup with direct IPC handler using fs.promises.rm()
- Claude Teams IPC robustness: guarded done() helper preventing multiple resolutions, shell-only-on-Windows, 30s timeout with kill
- smart_tts.py playback: position-based polling replaces fixed 15s sleep, maxPolls cap, wait for playback start before evaluating staleness
- Model alias: added "claude-opus-4-6-20250205" mapping

#### UI/UX Improvements (Feb 1-4, 2026)
- TTS queue timeout increased (5s → 25s)
- Default userName made configurable (previously hardcoded)
- SETTINGS_DIR path resolution fixed
- Claude Mode dialog scrolling improved
- Agent Launcher double-modal issue resolved
- Plan Mode button added (shift+tab shortcut)

### Fixed

#### Observability Fixes (Feb 9-10, 2026)
- Windows hook terminal freeze: standalone hook arrays (SessionStart, SessionEnd, SubagentStart, etc.) break keyboard input on Windows v2.1.37 — fixed via piggyback pattern (only append to existing hook arrays)
- UTF-16 surrogate crash: orphan surrogates (`\udc90`) in Windows file paths crash FastAPI JSONResponse UTF-8 encoding — added `_sanitize_surrogates()` to ObservabilityStorage
- Startup race condition: observability WebSocket connected before Gateway ready — added health probe with 3 retries (1s delay)
- CORS middleware ordering: moved CORS to outermost position; excluded `/v1/observability` from TrafficMonitoringMiddleware
- WebSocket disconnect race: null check on handlers before close in observability-store.ts
- Global exception handler with CORS headers for unhandled route errors

#### Git & Config Fixes (Feb 10, 2026)
- Removed `.claude/settings.json` from git tracking to prevent personal API keys/paths from being committed
- Stripped API key from commit history via rebase + force push
- Scrubbed `.gitignore` from all 17 past commits using git-filter-repo (168→166 commits)
- GitHub OAuth auto-restore after history rewrite using `shell.openExternal`

#### GenUI Fixes (Feb 6-8, 2026)
- GenUI provider routing: now respects domain config provider selection instead of always falling back to LMStudio
- GenUI SSE 3 bugs: STATE_SNAPSHOT nesting, snake_case→camelCase field mapping, RUN_FINISHED fallback to force complete status
- GenUI theme CSS variables: removed invalid hsl() wrappers — theme vars are hex colors not HSL components
- GenUI window settings sync: GenUI window never called loadSettings(); settings:changed IPC only sent to mainWindow
- TableOfContents crash guard on undefined title from LLM output

#### TTS Fixes (Feb 6-8, 2026)
- TTS double-fire prevention: --source arg in smart_tts.py, KURORYUU_TTS_SOURCE=global env var, skip global hooks when local project handles TTS
- TTS Companion UI freeze: IPC event listeners accumulated without cleanup (9 listeners); all on* preload functions now return unsubscribe callbacks; audio level throttled to 15 FPS
- TTS Companion minimize-to-tray: removed broken e.preventDefault on non-cancellable minimize event; removed restore() that re-showed window
- KURORYUU_TTS_SOURCE Windows error: replaced POSIX env prefix with --source global CLI arg for cross-platform compatibility

#### Claude Teams Fixes (Feb 5-7, 2026)
- Internal tasks excluded from metrics: filtered out metadata._internal teammate tracker tasks from UI counts, graphs, velocity, and archive stats
- Team archive on external deletion: added unlinkDir handler; on Windows, recursive dir deletion only fires unlinkDir not individual unlink events
- LeadNode target handle: changed Top handle from type=source to type=target; fixed ReactFlow edge-root-lead error in hierarchy/archive views
- Timeline container height: all 4 renderers changed from flex-1 to absolute inset-0 for proper height propagation
- ECharts tooltip overflow: replaced rich tooltip with collapsible info card overlay
- Nested button HTML warning: changed outer button to div role=button in TeamHistoryPanel HistoryRow
- Archive viewport height: changed fixed h-[350px] to responsive h-[calc(100vh-280px)] min-h-[300px]
- ArchiveReplayPanel z-index: added missing 'relative' to container

#### Task & Data Fixes (Feb 5-6, 2026)
- SIDECAR_KEYS hotfix: added constant as single source of truth for field routing; fixed createTask not forwarding all metadata fields
- Kanban description edit not persisting: TaskDetailModal rendered TaskOverview without passing onDescriptionChange callback
- BOM encoding: PowerShell UTF8Encoding($false) to avoid BOM; Python utf-8-sig for BOM-tolerant reads
- Matrix particles z-order: moved MatrixParticles/ScanlineOverlay after ReactFlow in DOM for proper stacking

#### Desktop & Infrastructure Fixes (Feb 6, 2026)
- Duplicate BackupRestorePanel removed from Integrations dialog; replaced with single Restic Backups "Open" button
- Restic install 3 bugs: field name mismatch (binary→restic), missing ensure action, wrong response access pattern
- Portability: replaced 3 hardcoded C:\Users\Ryan paths with dynamic process.env.UV_PATH || os.homedir() pattern
- Timeline data filter: removed _internal metadata filter from normalizeToTimeline() to match status bar count

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

#### Settings Security (Feb 10, 2026)
- Removed `settings.json` from version control to prevent API key exposure in git history
- Cleaned API key from git commit history via interactive rebase + force push
- Updated `settings.template.json` and `settings.default.json` as safe tracked alternatives with current feature set

#### Security Review (Feb 7, 2026)
- Full security audit of execClaudeCmd helper, IPC handlers, scheduler executeJavaScript, preload bridges (localhost-only Electron context)
- Localhost security posture documented

#### Security Hardening (Feb 4, 2026)
- Fixed proxy header bypass vulnerability (CRITICAL)
- CORS lockdown to localhost-only
- WebSocket origin validation
- Origin/Referer validation for POST/PUT/DELETE requests
- Desktop auth localhost-only enforcement
- Removed ALLOW_EXTERNAL config option

### Documentation

#### New Documentation (Feb 9-10, 2026)
- VirtualBox sandboxing: technical API analysis of VBox 7.2.6 Python bindings + end-user setup guide
- V2 workflow prompts with Superpowers discipline techniques (verification gates, rationalization prevention)
- Agents Overflow integration docs in KURORYUU_BOOTSTRAP.md and worker prompts
- Observability Dashboard architecture (Gateway module, hooks, WebSocket streaming, UI components)

#### New Documentation (Feb 5-7, 2026)
- Timeline View architecture doc (TIMELINE_VIEW.md) covering 4 renderers, data flow, and user guide
- Code reviews: CSS layout, data normalization edge cases, unlinkDir handler
- Performance analysis: fire-and-forget vs await pattern tradeoffs for IPC calls
- Test coverage analysis: test cases for new IPC handlers, store actions, scheduler strategies
- Void Editor documentation: architecture, features, and UI component docs for external codebase analysis
- Plan archives: separated phases 13-16 (Desktop UI) from phases 17-18B (Task Infrastructure)

#### New Documentation (Jan 30 - Feb 2, 2026)
- Comprehensive k_pty PTY Control System guide (631 lines, 11 actions)
- OpenCode case study (~4,500 words analyzing Go-based terminal AI)
- Kuro Plugin documentation (14 slash commands, 5 hooks, 2 skills, 11 agents)
- Max-swarm multi-agent coordination docs

### Removed

#### Cleanup (Feb 5-8, 2026)
- Pen Testers prompt pack TXT files (deprecated templates)
- Legacy files: dragon-gray-fog.png, konami-dragon-v3.png, todo_legacy_20260123.md, bulk_port_a2ui.ps1
- ToolsTab CompactServerCard component (~130 lines, replaced by inline status bar)
- Teams Adapter block from thinker prompts
- Legacy Playwright MCP entry (replaced by Playwright CLI skill)

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
