# Kuroryuu Screenshots

Screenshots of the Kuroryuu desktop application for documentation and the welcome screen tour.

---

## Dojo (Planning Workspace)

| File | Description |
|------|-------------|
| `dojo_1.jpg` | Dojo main view with orchestration queue showing task cards |
| `dojo_2.jpg` | Dojo PRD generation tab with AI-powered document creation |
| `dojo_3.jpg` | Dojo ideation assistant with brainstorming interface |
| `dojo_4.jpg` | Dojo roadmap view showing project timeline |

---

## Kanban (Task Management)

| File | Description |
|------|-------------|
| `kanban_1.jpg` | Kanban board overview with Backlog, Active, Done, Delayed columns |
| `kanban_2.jpg` | Kanban task detail view showing task properties |

---

## Terminals (Multi-Agent Grid)

| File | Description |
|------|-------------|
| `TERMINALS_1.jpg` | Terminal grid with Leader and Worker panes side-by-side |
| `TERMINALS_2.jpg` | Terminal with expanded worker output showing Claude execution |
| `TERMINALS_3.jpg` | Multi-terminal layout with 3+ agents active |

---

## Insights (AI Chat)

| File | Description |
|------|-------------|
| `insights_1.jpg` | Insights chat interface with model selector |
| `insights_2.jpg` | Insights conversation with code highlighting |

---

## Code Editor

| File | Description |
|------|-------------|
| `CODE_EDITOR_SCREENSHOT_1.jpg` | Code editor with file tree and syntax highlighting |
| `CODE_EDITOR_SCREENSHOT_2.jpg` | Code editor split view with multiple files |
| `CODE_EDITOR_SCREENSHOT_3.jpg` | Code editor with search results panel |

---

## HTTP Traffic Monitor

| File | Description |
|------|-------------|
| `http_1.jpg` | Traffic monitor graph view with agent nodes |
| `http_2.jpg` | Traffic monitor split view with request list |
| `http_3.jpg` | Traffic monitor detail panel showing request/response |

---

## PTY Traffic

| File | Description |
|------|-------------|
| `pty_1.jpg` | PTY traffic visualization with agent-to-terminal routing graph |

---

## Command Center

| File | Description |
|------|-------------|
| `command_center_1.jpg` | Command center with active agents list |
| `command_center_2.jpg` | Command center tool browser with MCP integrations |

---

## Integrations

| File | Description |
|------|-------------|
| `integrations_1.jpg` | Integrations page showing OAuth providers |
| `integrations_2.jpg` | Integrations API key configuration |
| `integrations_3.jpg` | Integrations connection status panel |

---

## Themes

| File | Description |
|------|-------------|
| `themes_1.jpg` | Theme selector showing Oscura Midnight |
| `themes_2.jpg` | Theme selector showing Dusk theme |
| `themes_3.jpg` | Matrix theme with digital rain effect |
| `themes_4.jpg` | Kuroryuu gold/dragon theme |
| `themes_5.jpg` | Retro CRT phosphor green theme |
| `themes_6.jpg` | Forest theme with green accents |

---

## Other Screens

| File | Description |
|------|-------------|
| `capture_1.jpg` | Screen capture page with recording controls |
| `claudetasks_1.jpg` | Claude Tasks monitor with donut chart and Gantt timeline |
| `transcripts_1.jpg` | Transcripts browser with archived sessions |
| `memory_1.jpg` | Memory graph visualization with Graphiti |
| `github_1.jpg` | GitHub worktrees page with branch management |
| `tray_1.jpg` | Tray Companion app with TTS and voice controls |
| `kuroryuu-cli_1.jpg` | Kuroryuu CLI REPL interface |

---

## Modals and Dialogs

| File | Description |
|------|-------------|
| `AddAgent_1.jpg` | Add Agent wizard for creating new agents |
| `leader_wizard_1.jpg` | Leader configuration wizard |
| `defense_mode_1.jpg` | Defense mode activation dialog |
| `defense_mode_2.jpg` | Defense mode status panel |

---

## Settings

| File | Description |
|------|-------------|
| `app_settings_1.jpg` | General application settings |
| `app_settings_2.jpg` | Appearance and theme settings |
| `app_settings_3.jpg` | Advanced settings and developer options |
| `domain_config_1.jpg` | Domain configuration for models |
| `domain_config_2.jpg` | Provider configuration panel |

---

## Changelog

| File | Description |
|------|-------------|
| `changelog_1.jpg` | Changelog viewer with recent updates |
| `changelog_2.jpg` | Changelog detail view with version notes |

---

## Multi-Agent Demos

| File | Description |
|------|-------------|
| `3_Agents In terminal_claude_claude_kimi.png` | Three agents (Claude + Claude + Kimi) running simultaneously |
| `3_Claudes able_to_comm_via_k_pccontrol.png` | Multiple Claudes communicating via k_pccontrol |

---

## Usage in Welcome Screen

Screenshots are imported and displayed in:
- **Tour** (`hotspots/index.ts`) - Guided tour with hotspot markers
- **Features** (`sections/FeaturesSection.tsx`) - Feature dropdowns with carousel navigation
- **CLI** (`sections/CLISection.tsx`) - CLI preview screenshot
- **Tray** (`sections/TraySection.tsx`) - Tray Companion screenshot

Features with multiple screenshots use the `ImageCarousel` component for navigation.
