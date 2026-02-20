# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

#### Git Bash Hook Path Utilities (Feb 19, 2026)
- `hook-paths.ts` with `hooksUseBash()`, `toGitBashPath()`, `escapePathForHooks()` for CC 2.1.47+ compatibility
- Version-aware UV path resolution and `cd "$CLAUDE_PROJECT_DIR"` prefix for correct CWD
- Desktop code generator updated to emit Git Bash-compatible hook commands

#### Playground UI & Skill (Feb 18, 2026)
- Renamed GenUI to Playground with dedicated Electron window and IPC handlers (open/list/read HTML files)
- 4 project-aware single-file HTML templates: agent-team-planner, architecture-explorer, hook-builder, theme-tuner
- `/k-playground` skill and command for Claude Code
- FeedbackBar component and usePlayground hook
- Blob URL viewer approach bypassing CSP restrictions for inline scripts

#### Backup Enhancements (Feb 18, 2026)
- Background streaming for backups (`background=true`, daemon thread)
- Password persistence in backup config (loaded on init, saved on change)
- `backup:reset` IPC handler and `BackupService.resetRepository()`
- 10s AbortController timeout for MCP requests to prevent hanging
- `statusError` in backup store with amber alert banner UI

#### Generic CLI PTY Support (Feb 16, 2026)
- Backend accepts `cliCommand/cliArgs/cliType` via IPC, routes non-Claude CLIs through `startGenericPty`
- Emits `cli:session-spawned` events for auto-navigation, max concurrent sessions raised to 5
- CLIAgentsPanel with PTY-aware session cards and action buttons (view/stop)
- LauncherCard component for Quick Access in App Settings

#### k-start-worker-loop Autonomous Task Loop (Feb 16, 2026)
- Loads pending T### tasks from `ai/todo.md`, spawns `do-work-builder` subagents per task
- Structured git commits with HEREDOC messages and Task/Request trailers
- Records `commit_hash`/`committed_at` in `ai/task-meta.json` sidecar
- Ralph prompts updated: workers forbidden from git operations, leader handles verification/commit

#### k_tts Agent-Initiated TTS Tool (Feb 15, 2026)
- New MCP tool with `speak` (direct) and `smart` (AI-summarized ~20 words via Gateway with fallback) actions
- Edge-tts playback, TTS queue integration, optional blocking via `wait=True`

#### CI/Release Workflows & Tests (Feb 15, 2026)
- GitHub Actions CI workflow: typecheck, vitest, pytest, build & publish
- Manual Release workflow for tagged releases
- Unit tests for updater, backup service, settings paths, and gateway endpoints
- Removed ~3,500 lines of dead code (legacy Insights, LMStudioPanel, AgentFlow, CodingAgents, SpawnAgentDialog)

#### Session Linking & Identity (Feb 13-14, 2026)
- CLI sessions bridged to Claude Code session IDs via observability event mapping
- Gateway auto-links `kuroryuu_session_id` → `session_id` with module-level cache
- k_session `update_memory` and `link` actions for mid-session state tracking
- MCP Bootstrap block injected into teammate prompts (k_session/k_collective lifecycle required)
- About dialog shows git version/commit info via `git describe`

#### Claude Teams Details Dashboard (Feb 13, 2026)
- Unified TeamDetailsDashboard consolidating members, tasks, messages, and analytics into tabbed view
- New components: CompletionRing, MemberCard, MembersTab, MessagesTab, OverviewTab, StatsRibbon, TasksTab
- Replaced separate TaskListPanel and TeamsAnalyticsPanel with single dashboard (live + archive modes)
- One-time memory injection modal at bootstrap (enables smartSessionStart, autoCheckpointOnEnd, previouslySection)

#### Global Plugin Sync Service (Feb 13, 2026)
- PluginSyncService: polls every 60s, compares mtime, syncs `.claude/plugins/kuro/` to `~/.claude/plugins/kuro-global/`
- `sync-global-plugin.ps1` with force flag, timestamp tracking, and global settings registration
- Plugin scripts resolve project root via `KURORYUU_PROJECT_ROOT` env var for dual project-local/global contexts

#### Image Lightbox & Asset IPC (Feb 13, 2026)
- ImageLightbox component with AnimatePresence modal overlay in assistant panel
- `app:getAssetDataUrl` IPC handler: reads project assets as base64 data URLs, auto-detects MIME type, prevents directory traversal
- Marlee Rose tribute image in About dialog

#### Developer Convenience Scripts (Feb 13, 2026)
- `claude-bypass.bat`: wrapper for Claude CLI with `--dangerously-skip-permissions`
- `make-shortcut.ps1`: creates Desktop shortcut for taskbar pinning
- `KillKuroryuu.bat`: invokes `kill_all.ps1` for quick shutdown

#### Zero-Cost Memory Injection (Feb 13, 2026)
- Agent→checkpoint linking: checkpoint save/load now carries agent_id/session_id, new `_load_latest_for_agent()` query
- Smart session start: `_action_start` returns resumption_context with checkpoint summary, worklog summary, working memory, and "Previously" section — all file reads, zero LLM cost
- Auto-checkpoint on session end: `_action_end` auto-saves lightweight checkpoint (`auto_{agent_id}`) with in-progress tasks and working memory snapshot
- Plugin Config UI: new Memory Injection section with 3 toggles (Smart Session Start, Auto-Checkpoint on End, Previously Section), all default ON

#### PTY Terminal View for Kuroryuu Agents (Feb 12-13, 2026)
- Dual execution mode: existing JSONL structured view preserved, new PTY terminal view added as primary tab
- Sessions spawn via PtyManager with real xterm.js embedded terminal
- Tab bar switching between Terminal and Messages views with auto-tab selection based on ptyId
- PTY badge (amber) on SessionCard when session has active PTY
- Heartbeat and scheduler route to PTY mode by default via `executionRendering` field on PromptAction
- Collapsible session list sidebar (w-56, PanelLeft toggle) matching Marketing page layout
- Layout mode switching: grid/splitter/window with cycle button, persisted to `ui.agentsLayout`
- Window mode with drag+resize handlers, CSS Grid terminal area

#### CLI Execution Backend (Feb 12, 2026)
- CLI-default execution backend replacing SDK API key dependency
- Spawns Claude CLI with OAuth authentication instead of requiring Anthropic API key
- Windows Claude path resolution via `which claude` with `.cmd` extension handling
- `startAgentPty()` method in cli-execution-service with PTY kill branch and ptyId tracking

#### CLI Event Renderer & Observability Bridge (Feb 12-13, 2026)
- New CliEventRenderer.tsx: renders observability HookEvents for CLI sessions via kuroryuu_session_id bridge
- `send_event.py` injects `KURORYUU_AGENT_SESSION` env var as `kuroryuu_session_id` into hook event payloads
- Compact-safe filtering: uses `payload.kuroryuu_session_id` instead of `session_id` — survives `/compact` and session ID changes
- Consistent 8-char session UUID display across PTY status line, observability panel, hook events, and Messages tab header
- KuroryuuAgents.tsx routes CLI sessions to CliEventRenderer, SDK sessions to SdkMessageRenderer

#### Claude Agent SDK Integration (Feb 11, 2026)
- Replaced CLI-based agent spawning (k_bash/k_process) with TypeScript `@anthropic-ai/claude-agent-sdk`
- New claude-sdk-service.ts main process wrapper with IPC handlers and preload bridge
- Zustand store with SDK IPC event subscriptions replacing k_process polling
- SpawnDialog with SDK config (role/model/permissionMode), SdkMessageRenderer with structured tool call display
- Agent-flow-store with SDK adapter, AGENT_ROLES updated with SDK-native fields (allowedTools, permissionMode)
- Deleted legacy SessionLogViewer, cleaned up persistence types

#### Inter-Agent Messaging — k_msg (Feb 11, 2026)
- New `k_msg` simplified messaging MCP tool wrapping k_inbox for inter-agent communication
- Actions: send, check, read, reply, complete, broadcast, list_agents
- Prompts index guide and KURORYUU_BOOTSTRAP updated with k_msg usage patterns

#### Personal Assistant & Identity System (Feb 12, 2026)
- Identity bootstrap system: soul.md, user.md, heartbeat.md, memory.md, `.bootstrap_complete` in `ai/identity/`
- BootstrapWelcome component with interactive CLI terminal spawn, file watcher for completion, skip/reset
- Daily memory files (`ai/identity/memory/YYYY-MM-DD.md`) with date picker UI in Identity Editor
- One-way Claude→Kuroryuu memory sync (MemorySyncService) with hash-based diffing and `[claude-auto]` tags
- Heartbeat config: agentName, maxLinesPerFile, maxTurns, timeoutMinutes as configurable fields
- Prompt Preview tab showing exact rendered heartbeat prompt in read-only CodeMirror with Copy/Refresh
- Inbox polling hook and UI toggle for agent message checking
- Auto-register/deregister agents with Gateway on session start/end

#### Ash Identity Bootstrap — The Twelve Pain Points (Feb 12, 2026)
- Established Ash as named identity — thinking partner and codebase sweeper, not code monkey
- Created T100-T111: twelve documented pain points as heartbeat sweep queue
- Standing order: each heartbeat, document one pain point → write `Docs/reviews/T{NNN}-{slug}.md` → link on task → update memory → stop
- All 12 pain point review documents written: Dojo/PRD, Chatbot, Agents redundancy, GenUI theme, Code Editor minimap, Capture theme, Marketing repos, Observability timelines, Restic backup, Auto-update, Kuroryuu CLI, Codebase consolidation

#### Persistent Session Archival (Feb 13, 2026)
- Extracted archival into persistent `initArchivalListener()` called from App.tsx on mount (never unmounts)
- Fixed bug where sessions completing while user was on a different panel were silently lost
- Fixed `pty:false` hardcode in ArchivedSessionData — now uses `!!session.ptyId`

#### kuroryuu.com Website Launch (Feb 11, 2026)
- Full Next.js 15 + OpenNext + Cloudflare Workers site: Home (hero, features, stats), Features (28 items across 4 groups), About, Downloads, Docs (5 MDX pages with sidebar nav), Blog (6 posts), Changelog
- Imperial dragon theme with dark aesthetic carried from desktop app
- Fixed undocumented OpenNext static cache deployment gap on Cloudflare
- FAB Marketplace links and YouTube integration
- GitHub releases created: v0.1.0 (hackathon, Jan 30) and v0.2.0 (website launch, Feb 11) on ahostbr/kuroryuu-public

#### Marketing Workspace — "Vibe Marketing" (Feb 11, 2026)
- 6 marketing skills + 6 gateway Python modules + 10 renderer TSX components + Zustand store
- Embedded Claude Code terminal with marketing-specific skills (image gen, video, screenshots via Gateway API)
- Split and tabbed view modes for workspace layout
- Skills and tools side panels with auto-install uv
- Floating draggable/resizable standalone terminal window component
- Marketing terminal persistence across layout switches

#### LLM Apps Catalog (Feb 11, 2026)
- Discovery engine from awesome-llm-apps shallow clone with Gateway catalog builder
- Desktop UI: run/quickstart cards, tutorial metadata, quick-start links
- "Check for Updates" pull-and-rebuild flow with new/removed app count delta
- k-find-app skill for searching the LLM Apps catalog from Claude Code
- Shared `buildCatalogFromDisk()` helper for catalog build and update paths

#### CLIProxyAPI Auto-Update System (Feb 11, 2026)
- Update check system with version comparison and UI indicators
- Automatic detection of available updates for CLIProxyAPI

#### GitHub-first Workflow (Feb 11, 2026)
- PR management, AI review, and workflow automation
- Setup-project script updates and lock file regeneration

#### GitHub/Chronicles UI (Feb 10, 2026)
- Branch selector with ahead/behind indicators and repository info popover in GitHub toolbar
- GitHub repo picker in RepoInfoPopover for multi-repo support
- Commit-file diff viewer with Claude AI summary UI
- Branch rename/delete UI and IPC handlers
- Worktrees basePath changed to `ai/worktrees/tasks`

#### Quizmaster Variant Selector (Feb 10, 2026)
- Support for multiple quizmaster prompt variants with selector UI

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

#### TTS Queue Hardening (Feb 17-18, 2026)
- Max lock age, PID liveness checks, and stale-lock cleanup in tts_queue.py

#### Port Management (Feb 16-17, 2026)
- Port-kill routine terminates child workers and parent Python processes (uvicorn master)
- Uvicorn passes app object directly instead of "server:app" import string

#### Marketing UI Refactor (Feb 16, 2026)
- Replaced sidebar/header/panels with TerminalWorkspace-driven layout and 7 paged tool components
- GalleryLightbox for image previews
- `marketing:injectKeys` IPC handler injects API keys from token store into local marketing Gateway
- Removed legacy MarketingHeader, MarketingToolPanel, MarketingSkillPicker, MarketingAssetGallery

#### Observability UI Refactor (Feb 15, 2026)
- 4 new timeline renderers: CompactStrip, DensityRidge, FlameStack, SpiralClock
- Zustand `useShallow` selectors on observability components to prevent unnecessary re-renders
- AgentSwimLanes simplified from SVG axis/tooltip to card-based lane UI

#### Heartbeat & Identity System (Feb 13, 2026)
- Mandatory identity file updates enforced in heartbeat prompt (daily memory, heartbeat.md, actions.json, soul.md)
- `0` = "Infinite" option for max lines/turns/timeout (skips truncation/validation)

#### Kuro Plugin Feature Defaults (Feb 13, 2026)
- `smartSessionStart`, `autoCheckpointOnEnd`, `previouslySection` default to opt-in (false)

#### CLI & Process Defaults (Feb 13, 2026)
- Default CLI CWD to project root via `KURORYUU_PROJECT_ROOT` env or resolved path
- Spawn dialog placeholder shows actual default working directory
- Session ID statusline priority: Claude Code session_id first, then Kuroryuu env vars

#### Agent Execution & UI (Feb 12-13, 2026)
- Kuroryuu Agents: default execution backend switched from SDK API to CLI PTY (no API key needed)
- SessionTerminal flattened to thin passthrough (no wrapper divs)
- LM Studio context windows marked as estimated in chat store
- Heartbeat countdown timer added to heartbeat service

#### SPA & Routing (Feb 10, 2026)
- Switched health probes to `/v1/health` endpoint; tightened SPA static file routing rules

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

#### Git Bash Hook Path Compatibility (Feb 19, 2026)
- CC 2.1.47+ runs hooks via Git Bash on Windows — backslash paths mangled to `C:UsersRyan...`
- UV paths converted to Git Bash format (`/c/Users/Ryan/.local/bin/uv.exe`)
- PowerShell `-Command` strings wrapped in single quotes to prevent bash variable/escape processing
- `cd "$CLAUDE_PROJECT_DIR" && ` prefix ensures correct CWD for relative script paths
- Desktop code generator (`kuro-config:save`, `setTeamTtsOverride`) updated to emit correct paths

#### Backup System Reliability (Feb 18, 2026)
- Persist backup config to disk when repository marked initialized
- Fixed nested-key config lookup (defaults not treated as traversal nodes)
- Atomic temp-file writes; `stdin=subprocess.DEVNULL` prevents subprocess hangs
- Preserve Python-managed fields (password, password_hash) when saving config
- Desktop `getStatus` throws errors instead of silent defaults

#### Terminal & UI Fixes (Feb 13-18, 2026)
- Shift+Tab intercepted at capture phase, forwards CSI Z escape to PTY instead of browser focus navigation
- `Dialog.Title` replaces raw `<h2>` in IntegrationsDialog for accessibility
- Unique changelog entry IDs with map index suffix
- `useSpawnTerminalAgent` falls back to env vars when IPC fails for project root

#### Session & PTY Fixes (Feb 12-13, 2026)
- Session archival persistence: onCompleted archival listener was tied to KuroryuuAgents component lifecycle — navigating away dropped completion events; extracted to persistent App.tsx-level listener
- PTY Messages compact fix: session_id-based filtering broke after `/compact`; switched to `payload.kuroryuu_session_id` filtering that survives session ID changes
- Terminal garbled text race condition: added `initialized` to ResizeObserver effect deps, post-init fits now call `pty.resize()`
- Terminal flex overflow: fixed with `flex-1 min-h-0` pattern for session viewers
- Agent terminal sizing: matched Marketing layout proportions

#### TTS Double-Fire Prevention (Feb 11, 2026)
- `smart_tts.py` `should_skip_global()` checked preference flags (`ttsOnStop` etc.) instead of actual hook commands, causing circular skip where global hooks deferred to project hooks that lacked TTS commands; fixed by inspecting `settings.hooks` for actual `smart_tts.py`/`edge_tts.py` commands
- Set `skipProjectTts=false` in `index.ts` so TTS is always present in project hooks
- Fixed timeout units mismatch: 90000→90 seconds in `index.ts` and `claude-teams-ipc.ts`

#### Marketing Terminal Fixes (Feb 11, 2026)
- Fixed input race condition on marketing terminal startup
- Fixed PTY behavior and terminal hook detection for marketing workspace
- Fixed marketing-handlers.ts `shell:true` boolean→string TypeScript type error
- Fixed preload `getToolStatus` return type missing `ToolStatus` fields

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

#### PTY Internals (Feb 19, 2026)
- `Docs/Architecture/K_PTY_INTERNALS.md` — comprehensive PTY architecture documentation (743 lines)

#### Architecture Reference Documents (Feb 17, 2026)
- `Docs/Architecture/AI_HARNESS_ARCHITECTURE.md` — governance, tasks, prompts, collective, identity (1,198 lines)
- `Docs/Architecture/DESKTOP_ARCHITECTURE.md` — Electron, stores, hooks, IPC, PTY, themes (1,138 lines)
- `Docs/Architecture/GATEWAY_ARCHITECTURE.md` — FastAPI, routers, orchestration, GenUI pipeline (1,305 lines)
- `Docs/Architecture/MCP_CORE_ARCHITECTURE.md` — tools, actions, RAG, PTY, security (946 lines)

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
