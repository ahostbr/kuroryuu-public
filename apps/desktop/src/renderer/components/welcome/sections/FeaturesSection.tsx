import React, { useState } from 'react';
import {
  Layers,
  LayoutGrid,
  Activity,
  ListTodo,
  Camera,
  Database,
  Search,
  GitBranch,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Sparkles,
  MessageSquare,
  Code,
  ClipboardCheck,
  Terminal,
  Radio,
  Plug,
  AppWindow,
  Globe,
  Zap,
  MousePointer,
  Brain,
  FileText,
  Users,
  Bot,
  Calendar,
  Archive,
  SlidersHorizontal,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { ImageCarousel } from '../ImageCarousel';

// Screenshot imports - Dojo (4)
import screenshotDojo1 from '../../../../../../../assets/screens/dojo_1.jpg';
import screenshotDojo2 from '../../../../../../../assets/screens/dojo_2.jpg';
import screenshotDojo3 from '../../../../../../../assets/screens/dojo_3.jpg';
import screenshotDojo4 from '../../../../../../../assets/screens/dojo_4.jpg';

// Screenshot imports - Kanban (2)
import screenshotKanban1 from '../../../../../../../assets/screens/kanban_1.jpg';
import screenshotKanban2 from '../../../../../../../assets/screens/kanban_2.jpg';

// Screenshot imports - Terminals (3)
import screenshotTerminals1 from '../../../../../../../assets/screens/TERMINALS_1.jpg';
import screenshotTerminals2 from '../../../../../../../assets/screens/TERMINALS_2.jpg';
import screenshotTerminals3 from '../../../../../../../assets/screens/TERMINALS_3.jpg';

// Screenshot imports - Insights (2)
import screenshotInsights1 from '../../../../../../../assets/screens/insights_1.jpg';
import screenshotInsights2 from '../../../../../../../assets/screens/insights_2.jpg';

// Screenshot imports - Code Editor (3)
import screenshotCodeEditor1 from '../../../../../../../assets/screens/CODE_EDITOR_SCREENSHOT_1.jpg';
import screenshotCodeEditor2 from '../../../../../../../assets/screens/CODE_EDITOR_SCREENSHOT_2.jpg';
import screenshotCodeEditor3 from '../../../../../../../assets/screens/CODE_EDITOR_SCREENSHOT_3.jpg';

// Screenshot imports - HTTP Traffic (3)
import screenshotHttp1 from '../../../../../../../assets/screens/http_1.jpg';
import screenshotHttp2 from '../../../../../../../assets/screens/http_2.jpg';
import screenshotHttp3 from '../../../../../../../assets/screens/http_3.jpg';

// Screenshot imports - Server Status (2)
import screenshotCommandCenter1 from '../../../../../../../assets/screens/command_center_1.jpg';
import screenshotCommandCenter2 from '../../../../../../../assets/screens/command_center_2.jpg';

// Screenshot imports - Integrations (3)
import screenshotIntegrations1 from '../../../../../../../assets/screens/integrations_1.jpg';
import screenshotIntegrations2 from '../../../../../../../assets/screens/integrations_2.jpg';
import screenshotIntegrations3 from '../../../../../../../assets/screens/integrations_3.jpg';

// Screenshot imports - Single screenshots
import screenshotClaudeTasks from '../../../../../../../assets/screens/claudetasks_1.jpg';
import screenshotPty from '../../../../../../../assets/screens/pty_1.jpg';
import screenshotCapture from '../../../../../../../assets/screens/capture_1.jpg';
import screenshotTranscripts from '../../../../../../../assets/screens/transcripts_1.jpg';
import screenshotMemory from '../../../../../../../assets/screens/memory_1.jpg';
import screenshotGithub from '../../../../../../../assets/screens/github_1.jpg';

// Helper to navigate to a view by dispatching a custom event
function navigateToView(route: string) {
  const viewName = route.replace(/^\//, '') || 'welcome';
  window.dispatchEvent(new CustomEvent('navigate-to-view', { detail: { view: viewName } }));
}

interface Feature {
  id: string;
  icon: React.ElementType;
  title: string;
  shortDesc: string;
  longDesc: string;
  bullets: string[];
  route?: string;
  externalUrl?: string;
  customWidget?: React.ComponentType;
  screenshots?: string[];
}

const features: Feature[] = [
  // === PROVIDERS Group ===
  {
    id: 'cliproxyapi',
    icon: Zap,
    title: 'CLIProxyAPI',
    shortDesc: 'Unified API for 61 models across 9 providers',
    longDesc: 'Your default AI provider. Routes requests to Claude, OpenAI, Gemini, Copilot, Kiro, and more through a single OpenAI-compatible API.',
    bullets: [
      '61 models from 9 providers',
      'OpenAI-compatible API on port 8317',
      'OAuth per provider - no API keys needed',
      'Auto-fallback between providers',
    ],
    // No route - configured via CLIProxyAPI tab
  },

  // === PLAN Group ===
  {
    id: 'dojo',
    icon: Sparkles,
    title: 'Dojo',
    shortDesc: 'Unified planning workspace with AI-powered workflows',
    longDesc: 'Feature planning hub combining orchestration, PRD generation, and ideation - powered by CLIProxyAPI.',
    bullets: [
      'Real-time task orchestration queue',
      'AI-powered PRD generation via CLIProxyAPI',
      'AI ideation assistant',
      'Recording indicator integration',
    ],
    route: 'dojo',
    screenshots: [screenshotDojo1, screenshotDojo2, screenshotDojo3, screenshotDojo4],
  },
  {
    id: 'kanban',
    icon: ListTodo,
    title: 'Kanban Tasks',
    shortDesc: 'Visual task management with Claude Tasks integration',
    longDesc: 'Organize work visually with a Kanban board that syncs automatically with Claude\'s task system.',
    bullets: [
      'Backlog → Active → Done flow',
      'Auto-sync with Claude Tasks',
      'Priority indicators',
      'Evidence chain to worklogs',
      'Task metadata persistence (description, priority, worklog, checkpoint)',
      'ai/task-meta.json sidecar for rich metadata',
    ],
    route: 'kanban',
    screenshots: [screenshotKanban1, screenshotKanban2],
  },
  {
    id: 'scheduler',
    icon: Calendar,
    title: 'Scheduler',
    shortDesc: 'Calendar-based job scheduling with dual execution modes',
    longDesc: 'Schedule recurring and one-off jobs with a visual calendar. Supports background (silent) and interactive (visible PowerShell) execution modes.',
    bullets: [
      'Calendar view with day modal for event management',
      'Background mode: silent auto-close with PID tracking',
      'Interactive mode: visible persistent PowerShell',
      'Per-job configurable timeout',
      'Job history panel with execution logs',
    ],
    route: 'scheduler',
  },

  // === BUILD Group ===
  {
    id: 'terminals',
    icon: LayoutGrid,
    title: 'Multi-Terminal Grid',
    shortDesc: 'Leader/Worker agent orchestration with dedicated PTY sessions',
    longDesc: 'Run multiple AI agents in parallel with full terminal access. The leader coordinates while workers execute tasks independently.',
    bullets: [
      'Leader/Worker orchestration pattern',
      'Dedicated PTY for each agent',
      'Real-time output streaming',
      'Resizable grid layout',
    ],
    route: 'terminals',
    screenshots: [screenshotTerminals1, screenshotTerminals2, screenshotTerminals3],
  },
  {
    id: 'ralph',
    icon: Users,
    title: 'Ralph Orchestrator',
    shortDesc: 'Autonomous task execution for 100+ hour sessions',
    longDesc: 'Long-running autonomous orchestration. Ralph coordinates a worker Claude via k_pty with intelligent intervention when stuck.',
    bullets: [
      'Promise-based signals: DONE, STUCK, PROGRESS',
      'Intelligent intervention when worker stuck',
      'Desktop silence detection with nudges',
      '3-strike escalation to human',
    ],
    route: 'terminals',
  },
  {
    id: 'worktrees',
    icon: GitBranch,
    title: 'GitHub Worktrees',
    shortDesc: 'Git integration for task-based branch management',
    longDesc: 'Manage git worktrees linked to tasks. Create, merge, and track branches without switching contexts.',
    bullets: [
      'Task-based worktree linking',
      'Merge and delete operations',
      'Status tracking (active, merged, pruned)',
      'Open explorer/terminal per worktree',
    ],
    route: 'worktrees',
    screenshots: [screenshotGithub],
  },
  {
    id: 'insights',
    icon: MessageSquare,
    title: 'Insights',
    shortDesc: 'Multi-model AI chat with voice capabilities',
    longDesc: 'Chat with any of 61 models via CLIProxyAPI. Includes text-to-speech and voice input.',
    bullets: [
      '61 models via CLIProxyAPI (Claude, GPT, Gemini, etc.)',
      'Text-to-speech output',
      'Voice input via Python backend',
      'Direct mode for raw queries',
    ],
    route: 'insights',
    screenshots: [screenshotInsights1, screenshotInsights2],
  },
  {
    id: 'code-editor',
    icon: Code,
    title: 'Code Editor',
    shortDesc: 'Dedicated code editing workspace',
    longDesc: 'Launch a separate code editor window for focused development.',
    bullets: [
      'Standalone editor window',
      'Full editor capabilities',
      'Separate from main app',
    ],
    screenshots: [screenshotCodeEditor1, screenshotCodeEditor2, screenshotCodeEditor3],
    // No route - launches external window
  },
  {
    id: 'claude-teams',
    icon: Users,
    title: 'Claude Teams',
    shortDesc: 'Multi-agent team orchestration with real-time monitoring',
    longDesc: 'Spawn, monitor, and coordinate Claude agent teams with health tracking, session archiving, replay visualization, analytics, and bulk operations.',
    bullets: [
      'Spawn teams from 7 templates (code-review, feature-dev, research, debug, etc.)',
      'Per-teammate model selection (Opus, Sonnet, Haiku)',
      'Health monitoring with 30s polling and unresponsive detection',
      'Session archive with ReactFlow replay in Hub/Hierarchy/Timeline views',
      'Analytics panel with velocity, completion%, bottleneck detection',
      'Bulk shutdown and broadcast operations',
    ],
    route: 'claude-teams',
  },
  {
    id: 'kuroryuu-agents',
    icon: Bot,
    title: 'Kuroryuu Agents',
    shortDesc: 'Coding agent sessions with real-time output streaming',
    longDesc: 'Launch and monitor coding agent sessions with dedicated PTYs, live log streaming, and hub-and-spoke flow visualization.',
    bullets: [
      'Spawn agents with presets (Claude, Codex, Kiro, Aider, Custom)',
      'Real-time output streaming via WebSocket',
      'Hub-and-spoke ReactFlow agent visualization',
      'Session persistence via IndexedDB',
      'Controls: pause, reset, reconnect, view toggle',
    ],
    route: 'kuroryuu-agents',
  },
  {
    id: 'generative-ui',
    icon: Sparkles,
    title: 'Generative UI',
    shortDesc: 'AI-powered dashboard generation with 51 themed components',
    longDesc: "Describe what you want to see and get a zone-based dashboard rendered from 51 A2UI components. Supports imperial/theme-aware mode toggle.",
    bullets: [
      '51 A2UI components across 11 categories (Data, Summary, Lists, Media, etc.)',
      '3-stage pipeline: content analysis, layout selection, component generation',
      'Zone-based dashboard with SSE streaming',
      'Imperial/Theme-aware mode toggle with CSS variable theming',
      "Standalone Electron window (Sidebar shortcut 'G')",
    ],
  },

  // === MONITOR Group ===
  {
    id: 'traffic',
    icon: Activity,
    title: 'Traffic Monitor',
    shortDesc: 'Real-time API request/response monitoring',
    longDesc: 'Full observability into every LLM interaction. See token usage, latency, and detailed payloads.',
    bullets: [
      'Request/response pairs',
      'Token counts and latency',
      'Filter by agent or model',
      'Detailed payload inspection',
    ],
    route: 'traffic-flow',
    screenshots: [screenshotHttp1, screenshotHttp2, screenshotHttp3],
  },
  {
    id: 'claude-tasks',
    icon: ClipboardCheck,
    title: 'Claude Tasks',
    shortDesc: 'Real-time Claude Code task monitoring',
    longDesc: 'Visualize TaskCreate/TaskUpdate activity from ai/todo.md with progress charts and timelines.',
    bullets: [
      'Progress donut chart',
      'Gantt timeline visualization',
      'Real-time file watching',
      'Worklog link tracking',
      'Team analytics: velocity, per-agent performance, bottleneck detection',
      'Task duration display and activeForm spinner',
    ],
    route: 'claude-tasks',
    screenshots: [screenshotClaudeTasks],
  },
  {
    id: 'pty-traffic',
    icon: Terminal,
    title: 'PTY Traffic',
    shortDesc: 'Agent-to-terminal data flow visualization',
    longDesc: 'Monitor shell session data between agents and PTY instances. Different from HTTP traffic.',
    bullets: [
      'Agent-to-PTY routing graph',
      'Session event history',
      'Live activity monitoring',
      'Terminal session tracking',
    ],
    route: 'pty-traffic',
    screenshots: [screenshotPty],
  },
  {
    id: 'command-center',
    icon: Radio,
    title: 'Server Status',
    shortDesc: 'Central hub for tools and servers',
    longDesc: 'Browse available tools, monitor server health, and access Graphiti.',
    bullets: [
      'Tool browser with MCP integrations',
      'Server health monitoring',
      'Graphiti knowledge graph (if enabled)',
    ],
    route: 'command-center',
    screenshots: [screenshotCommandCenter1, screenshotCommandCenter2],
  },
  {
    id: 'capture',
    icon: Camera,
    title: 'Screen Capture (k_capture)',
    shortDesc: 'Recording, screenshots, and visual digest',
    longDesc: 'Human-controlled capture via k_capture MCP tool. Screenshots, recordings, and AI-powered visual digests.',
    bullets: [
      'Screenshots via k_capture(action="screenshot")',
      'Recording via k_capture(action="start/stop")',
      'VisualDigest writes latest.jpg every 10 seconds',
      'Agents check via k_capture(action="get_latest")',
    ],
    route: 'capture',
    screenshots: [screenshotCapture],
  },
  {
    id: 'transcripts',
    icon: FileText,
    title: 'Transcripts',
    shortDesc: 'Browse archived Claude conversations',
    longDesc: 'Access historical Claude Code sessions. Search, filter, and review past conversations.',
    bullets: [
      'Archived session browser',
      'Search conversation content',
      'Filter by date/project',
      'Export and review',
    ],
    route: 'transcripts',
    screenshots: [screenshotTranscripts],
  },
  {
    id: 'domain-config',
    icon: SlidersHorizontal,
    title: 'Domain Config',
    shortDesc: 'Per-domain AI model and provider configuration',
    longDesc: 'Configure which LLM model and provider to use for different operations like chat, GenUI, code review, and more.',
    bullets: [
      'Per-domain model selection (chat, genui, code-review, etc.)',
      'Source-grouped provider dropdown (Claude, OpenAI, Gemini)',
      'CLIProxyAPI integration for model routing',
    ],
    route: 'domain-config',
  },

  // === SYSTEM Group ===
  {
    id: 'checkpoints',
    icon: Database,
    title: 'Checkpoints',
    shortDesc: 'Session persistence and state management',
    longDesc: 'Save and restore agent state across sessions. Never lose context or progress.',
    bullets: [
      'Save session snapshots',
      'Restore from any checkpoint',
      'Cross-reference worklogs',
      'Git-friendly storage',
      'Use /savenow or /k-save to save',
      'Use /loadnow or /k-load to restore',
      'Auto-worklog generation with cross-reference headers',
      'task_id auto-link to ai/task-meta.json sidecar',
    ],
  },
  {
    id: 'rag',
    icon: Search,
    title: 'RAG Search',
    shortDesc: 'Multi-strategy code and document search',
    longDesc: 'Intelligent search via k_rag with 10+ query modes: keyword, semantic, hybrid, reranked, multi, reflective, agentic, and interactive. Plus k_repo_intel for structured analysis.',
    bullets: [
      'k_rag: keyword, semantic, hybrid, reranked',
      'k_rag: multi, reflective, agentic modes',
      'k_rag: interactive human-in-loop selection',
      'k_repo_intel: symbol_map, routes, dependencies',
      'k_repo_intel: component and API analysis',
      'Interactive human-in-loop result filtering',
    ],
  },
  {
    id: 'memory',
    icon: Brain,
    title: 'Memory Graph',
    shortDesc: 'Knowledge graph visualization with Graphiti',
    longDesc: 'Browse and search your AI\'s memory. By default, persistence uses k_checkpoint from the Kuroryuu MCP plugin. Graphiti is opt-in for advanced knowledge graph features.',
    bullets: [
      'Default: k_checkpoint for session persistence',
      'Graphiti opt-in via Settings → Integrations',
      'Entity/fact/event/preference types',
      'Graph visualization mode',
      'Requires running Graphiti server',
      'Claude Memory tab (reads ~/.claude/projects/ memory)',
    ],
    route: 'memory',
    screenshots: [screenshotMemory],
  },
  {
    id: 'pccontrol',
    icon: MousePointer,
    title: 'PC Control',
    shortDesc: 'Full Windows desktop automation for agents',
    longDesc: 'Think of it as Playwright for your entire desktop. Enable agents to interact with any Windows application - not just browsers.',
    bullets: [
      'Click, double-click, right-click actions',
      'Type text and send keypresses',
      'Launch apps, get window list',
      'Pure PowerShell - no external deps',
      'Opt-in via Settings → Integrations',
      'Best results at 100% display scaling',
    ],
    // No route - enabled in Settings
  },
  {
    id: 'restic-backup',
    icon: Archive,
    title: 'Restic Backup',
    shortDesc: 'Encrypted backup and restore via k_backup MCP tool',
    longDesc: 'Full backup management with Restic. Initialize repos, create snapshots, diff, restore, and prune with real-time progress streaming.',
    bullets: [
      '11 actions: init, backup, list, restore, diff, check, forget, prune, config',
      'Auto-download of restic binary',
      'Real-time progress streaming to Gateway',
      'bcrypt password hashing for repository security',
      'Config backup/restore in Plugin Config tab',
    ],
  },
  {
    id: 'integrations',
    icon: Plug,
    title: 'Integrations',
    shortDesc: 'Configure LLM and SCM providers',
    longDesc: 'Manage OAuth tokens and external service connections via CLIProxyAPI.',
    bullets: [
      'CLIProxyAPI OAuth (Claude, OpenAI, Gemini, Copilot)',
      'API key fallback for direct access',
      'Connection verification',
      'Secure credential storage',
    ],
    screenshots: [screenshotIntegrations1, screenshotIntegrations2, screenshotIntegrations3],
    // No route - opens dialog
  },
  {
    id: 'tray-companion',
    icon: AppWindow,
    title: 'Tray Companion',
    shortDesc: 'TTS, voice input, and AI chat in your system tray',
    longDesc: 'Always-available companion with text-to-speech (Windows SAPI or Edge neural voices), voice input via Python speech recognition, and direct LMStudio chat with tool calling.',
    bullets: [
      'TTS with Edge neural, ElevenLabs, and Windows SAPI voices',
      'ElevenLabs integration with stability/similarity controls',
      'Smart completion announcements with context-aware messages',
      'Voice input with real-time waveform display',
      'LMStudio Devstral chat with auto-speak',
      'RAG search & MCP integration',
      'Global hotkeys (Ctrl+Shift+S to speak clipboard)',
      'Minimize-to-tray and close-to-tray support',
    ],
    // No route - launches external process
  },
  {
    id: 'chrome-bridge',
    icon: Globe,
    title: 'Claude in Chrome',
    shortDesc: 'Browser automation via Claude for Chrome extension',
    longDesc: 'Enable Claude Code CLI to control your browser through the official Claude for Chrome extension. Read pages, click elements, fill forms, and automate web tasks. Alternatively, Playwright MCP is available for browser-specific automation without enabling full PC control.',
    bullets: [
      'Install Claude for Chrome extension from Chrome Web Store',
      'Run Claude with --chrome flag: claude --chrome',
      'Read pages, click elements, fill forms',
      'Take screenshots and navigate sites',
      'Automate multi-step web workflows',
      'Or use Playwright MCP for headless browser automation',
    ],
    // No route - CLI feature
  },

  // === INTEGRATIONS Group ===
  {
    id: 'agents-overflow',
    icon: Globe,
    title: 'Agents Overflow',
    shortDesc: 'Q&A knowledge base for AI agent developers',
    longDesc: 'Search, browse, ask, and answer questions on Agents Overflow — a community-driven Q&A platform purpose-built for AI agent development. Integrated as a default Claude Code plugin with 4 slash commands.',
    bullets: [
      '/agents-overflow:search — Search questions by keyword or tag',
      '/agents-overflow:browse — Browse latest or read specific question',
      '/agents-overflow:ask — Post new questions (requires agent token)',
      '/agents-overflow:answer — Answer questions (requires agent token)',
      'Pre-installed as default Claude Code plugin',
      'Public commands work without auth, write commands need AO_AGENT_TOKEN',
      'agents-overflow.com — community Q&A for agent development',
    ],
    externalUrl: 'https://agents-overflow.com',
  },
];

interface FeaturesSectionProps {
  className?: string;
}

export function FeaturesSection({ className }: FeaturesSectionProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const handleToggle = (id: string) => {
    setExpandedId(expandedId === id ? null : id);
  };

  const handleJump = (route: string) => {
    navigateToView(route);
  };

  return (
    <div className={cn('w-full space-y-6', className)}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
          <Layers className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-semibold text-foreground">Features</h2>
          <p className="text-sm text-muted-foreground">
            Explore Kuroryuu&apos;s capabilities
          </p>
        </div>
      </div>

      {/* Feature cards */}
      <div className="space-y-3">
        {features.map((feature) => {
          const Icon = feature.icon;
          const isExpanded = expandedId === feature.id;

          return (
            <div
              key={feature.id}
              className={cn(
                'rounded-xl border transition-all',
                isExpanded
                  ? 'bg-card border-primary/30'
                  : 'bg-card/50 border-border hover:border-border/80'
              )}
            >
              {/* Header - always visible */}
              <button
                onClick={() => handleToggle(feature.id)}
                className="w-full p-4 flex items-center justify-between text-left"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      'w-10 h-10 rounded-lg flex items-center justify-center transition-colors',
                      isExpanded ? 'bg-primary/20' : 'bg-secondary'
                    )}
                  >
                    <Icon
                      className={cn(
                        'w-5 h-5 transition-colors',
                        isExpanded ? 'text-primary' : 'text-muted-foreground'
                      )}
                    />
                  </div>
                  <div>
                    <h3 className="font-medium text-foreground">{feature.title}</h3>
                    <p className="text-sm text-muted-foreground">{feature.shortDesc}</p>
                  </div>
                </div>
                {isExpanded ? (
                  <ChevronUp className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-muted-foreground" />
                )}
              </button>

              {/* Expanded content */}
              <div
                className={cn(
                  'overflow-hidden transition-all duration-300',
                  isExpanded ? 'max-h-[1200px] opacity-100' : 'max-h-0 opacity-0'
                )}
              >
                <div className="px-4 pb-4 pt-0 border-t border-border">
                  {/* Custom widget if provided */}
                  {feature.customWidget ? (
                    <div className="mt-3">
                      <feature.customWidget />
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground mt-3">
                        {feature.longDesc}
                      </p>
                      <ul className="mt-3 space-y-1.5">
                        {feature.bullets.map((bullet, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm">
                            <span className="text-primary">•</span>
                            <span className="text-muted-foreground">{bullet}</span>
                          </li>
                        ))}
                      </ul>

                      {/* Centered button above screenshot carousel */}
                      {feature.route && (
                        <div className="mt-4 flex flex-col items-center gap-4">
                          <button
                            onClick={() => handleJump(feature.route!)}
                            className={cn(
                              'flex items-center gap-2 px-4 py-2 rounded-lg',
                              'bg-primary text-primary-foreground hover:bg-primary/90',
                              'font-medium text-sm transition-colors'
                            )}
                          >
                            Open {feature.title}
                            <ExternalLink className="w-4 h-4" />
                          </button>

                          {/* Screenshot Carousel */}
                          {feature.screenshots && feature.screenshots.length > 0 && (
                            <ImageCarousel
                              images={feature.screenshots}
                              alt={`${feature.title} screenshot`}
                            />
                          )}
                        </div>
                      )}

                      {/* External URL button */}
                      {feature.externalUrl && !feature.route && (
                        <div className="mt-4 flex flex-col items-center gap-4">
                          <button
                            onClick={() => window.electronAPI?.shell?.openExternal?.(feature.externalUrl!)}
                            className={cn(
                              'flex items-center gap-2 px-4 py-2 rounded-lg',
                              'bg-primary text-primary-foreground hover:bg-primary/90',
                              'font-medium text-sm transition-colors'
                            )}
                          >
                            Visit {feature.title}
                            <ExternalLink className="w-4 h-4" />
                          </button>
                        </div>
                      )}

                      {/* Screenshot only (no route) */}
                      {!feature.route && feature.screenshots && feature.screenshots.length > 0 && (
                        <div className="mt-4">
                          <ImageCarousel
                            images={feature.screenshots}
                            alt={`${feature.title} screenshot`}
                          />
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
