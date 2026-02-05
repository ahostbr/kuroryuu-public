import React, { useState, useEffect } from 'react';
import { useSidebarStore } from '../stores/sidebar-store';
import {
  LayoutGrid,
  TerminalSquare,
  Brain,
  FileText,
  Terminal,
  GitBranch,
  Settings,
  Plug,
  Share2,
  Sparkles,
  Layers,
  ChevronDown,
  Bot,
  ChevronLeft,
  ChevronRight,
  Activity,
  Home,
  ClipboardList,
  Hammer,
  Eye,
  Package,
  Swords,
  Camera,
  ScrollText,
  Code2,
  Radio,
  Cpu,
  Archive,
} from 'lucide-react';
import { useSettingsStore } from '../stores/settings-store';
import { useDomainConfigStore } from '../stores/domain-config-store';
import { useIsThemedStyle } from '../hooks/useTheme';
import { useCaptureStore } from '../stores/capture-store';
import { RecordingIndicator } from './capture/RecordingIndicator';

// Themed assets
import pillarVertical from '../assets/themes/kuroryuu/borders/pillar-vertical.png';
import kuroryuuDragon from '../assets/shared/logos/kuroryuu-dragon.png';

// Sidebar with collapse/expand functionality - v2

export type View =
  | 'kanban'
  | 'terminals'
  | 'insights'
  | 'ideation'
  | 'changelog'
  | 'context'
  | 'memory'
  | 'command-center'
  | 'worktrees'
  | 'traffic-flow'
  | 'pty-traffic'
  | 'welcome'
  | 'dojo'
  | 'transcripts'
  | 'capture'
  | 'claude-tasks'
  | 'coding-agents'
  | 'backups';

interface SidebarProps {
  activeView: View;
  onSelectView: (view: View) => void;
}

interface NavItem {
  id: View;
  label: string;
  icon: React.ElementType;
  shortcut?: string;
}

interface NavGroup {
  id: string;
  label: string;
  icon: React.ElementType;
  items: NavItem[];
}

// Workflow-based navigation: PLAN → BUILD → MONITOR → SHIP
// NOTE: dag and canvas items hidden (Graphiti consolidation) - code preserved for potential revert
const navGroups: NavGroup[] = [
  {
    id: 'plan',
    label: 'Plan',
    icon: ClipboardList,
    items: [
      { id: 'dojo', label: 'Dojo', icon: Swords, shortcut: 'D' },
      { id: 'kanban', label: 'Kanban', icon: LayoutGrid, shortcut: 'K' },
      // { id: 'dag', label: 'Task DAG', icon: Share2, shortcut: 'G' }, // Hidden: Use Graphiti tab in Command Center
    ],
  },
  {
    id: 'build',
    label: 'Build',
    icon: Hammer,
    items: [
      { id: 'terminals', label: 'Terminals', icon: TerminalSquare, shortcut: 'T' },
      { id: 'worktrees', label: 'GitHub', icon: GitBranch, shortcut: 'W' },
      { id: 'insights', label: 'Insights', icon: Brain, shortcut: 'N' },
    ],
  },
  {
    id: 'monitor',
    label: 'Monitor',
    icon: Eye,
    items: [
      { id: 'claude-tasks', label: 'Claude Plugin', icon: Sparkles, shortcut: 'C' },
      { id: 'coding-agents', label: 'Coding Agents', icon: Bot, shortcut: 'A' },
      { id: 'traffic-flow', label: 'HTTP Traffic', icon: Activity, shortcut: 'F' },
      { id: 'pty-traffic', label: 'PTY Traffic', icon: Radio, shortcut: 'Y' },
      { id: 'command-center', label: 'Command Center', icon: Terminal, shortcut: 'M' },
      { id: 'capture', label: 'Capture', icon: Camera, shortcut: 'P' },
    ],
  },
  {
    id: 'ship',
    label: 'Chronicles',
    icon: Package,
    items: [
      { id: 'memory', label: 'Memory', icon: Bot },
      // { id: 'canvas', label: 'Canvas', icon: Layers, shortcut: 'V' }, // Hidden: Use Graphiti tab in Command Center
      { id: 'changelog', label: 'Changelog', icon: FileText, shortcut: 'L' },
      { id: 'transcripts', label: 'Transcripts', icon: ScrollText, shortcut: 'R' },
      { id: 'backups', label: 'Backups', icon: Archive, shortcut: 'B' },
    ],
  },
];

const STORAGE_KEY = 'kuroryuu-sidebar-expanded';
const COLLAPSED_KEY = 'kuroryuu-sidebar-collapsed';

function SidebarGroup({
  group,
  isExpanded,
  onToggle,
  activeView,
  onSelectView,
  extraAction,
}: {
  group: NavGroup;
  isExpanded: boolean;
  onToggle: () => void;
  activeView: View;
  onSelectView: (view: View) => void;
  extraAction?: React.ReactNode;
}) {
  const hasActiveItem = group.items.some((item) => item.id === activeView);

  return (
    <div className="w-full">
      {/* Group Header */}
      <button
        onClick={onToggle}
        className={`
          w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-all duration-200
          text-xs uppercase tracking-wider font-medium
          ${hasActiveItem ? 'text-primary' : 'text-muted-foreground'}
          hover:bg-secondary/50 hover:text-foreground
        `}
      >
        <group.icon className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1 text-left">{group.label}</span>
        <ChevronDown
          className={`w-4 h-4 transition-transform duration-200 ${
            isExpanded ? 'rotate-0' : '-rotate-90'
          }`}
        />
      </button>

      {/* Group Items */}
      <div
        className={`
          overflow-hidden transition-all duration-200 ease-in-out
          ${isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}
        `}
      >
        <div className="pl-2 pr-1 py-1 space-y-0.5">
          {group.items.map((item) => (
            <button
              key={item.id}
              onClick={() => onSelectView(item.id)}
              className={`
                group relative w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-150
                ${
                  activeView === item.id
                    ? 'bg-secondary text-primary'
                    : 'text-muted-foreground hover:bg-secondary/40 hover:text-foreground'
                }
              `}
            >
              {/* Active indicator */}
              {activeView === item.id && (
                <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-primary rounded-r-full" />
              )}

              <item.icon className="w-4 h-4 flex-shrink-0" />
              <span className="text-sm flex-1 text-left">{item.label}</span>
              {item.shortcut && (
                <span className="text-[10px] text-muted-foreground/60 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
                  {item.shortcut}
                </span>
              )}
            </button>
          ))}
          {/* Extra action (e.g., CodeEditor window button) */}
          {extraAction}
        </div>
      </div>
    </div>
  );
}

export function Sidebar({ activeView, onSelectView }: SidebarProps) {
  const openDialog = useSettingsStore((s) => s.openDialog);
  const { isKuroryuu, isGrunge } = useIsThemedStyle();

  // Use global sidebar store (replaces local state + localStorage)
  const { isCollapsed, toggle, setCollapsed } = useSidebarStore();

  // Global capture store for recording indicator
  const isRecording = useCaptureStore((s) => s.isRecording);

  // Load expanded state from localStorage
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return new Set(JSON.parse(stored));
      }
    } catch {}
    // Default: all expanded
    return new Set(navGroups.map((g) => g.id));
  });

  // Persist expanded state
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...expandedGroups]));
  }, [expandedGroups]);

  // Auto-expand group when navigating to an item in it
  useEffect(() => {
    for (const group of navGroups) {
      if (group.items.some((item) => item.id === activeView)) {
        setExpandedGroups((prev) => new Set([...prev, group.id]));
        break;
      }
    }
  }, [activeView]);

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });
  };

  // Calculate outer wrapper width class
  // Collapsed: w-12 (48px)
  // Expanded Kuroryuu: w-64 (256px = 208 sidebar + 24 left pillar + 24 right pillar)
  // Expanded other: w-52 (208px)
  const outerWidthClass = isCollapsed
    ? 'w-12'
    : isKuroryuu
      ? 'w-64'
      : 'w-52';

  return (
    <div className={`h-full flex relative transition-all duration-300 flex-shrink-0 ${outerWidthClass}`}>
      {/* Kuroryuu: Left pillar decoration */}
      {isKuroryuu && !isCollapsed && (
        <div
          className="w-6 h-full flex-shrink-0"
          style={{
            backgroundImage: `url(${pillarVertical})`,
            backgroundSize: 'contain',
            backgroundRepeat: 'repeat-y',
            backgroundPosition: 'center',
            opacity: 0.7,
          }}
        />
      )}

      {/* Main sidebar content */}
      <div className={`h-full bg-sidebar flex flex-col relative transition-all duration-300 overflow-hidden ${
        isCollapsed ? 'w-12' : 'w-52'
      } ${isKuroryuu ? '' : 'border-r border-sidebar-border'}`}>
        {/* Collapse/Expand Toggle Button */}
        <div className={`absolute top-3 z-10 transition-all duration-300 ${isCollapsed ? 'right-1' : 'right-2'}`}>
          <button
            onClick={toggle}
            className={`p-1 rounded transition-colors ${
              isKuroryuu
                ? 'text-primary/70 hover:text-primary hover:bg-primary/15'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            }`}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Collapsed State View */}
        {isCollapsed && (
          <div className="flex flex-col items-center justify-between pt-16 pb-4 h-full">
            {/* Top section: logo, expand text, nav icons */}
            <div className="flex flex-col items-center gap-6">
              {/* Dragon logo */}
              {(isKuroryuu || isGrunge) && (
                <img
                  src={kuroryuuDragon}
                  alt="Kuroryuu"
                  className="w-8 h-8 cursor-pointer"
                  onClick={() => setCollapsed(false)}
                  style={{
                    filter: isKuroryuu ? 'drop-shadow(0 0 4px rgba(201, 162, 39, 0.5))' : 'grayscale(100%)',
                  }}
                />
              )}

              {/* Vertical "EXPAND" text */}
              <div
                className={`text-[10px] tracking-widest font-medium cursor-pointer ${
                  isKuroryuu ? 'text-primary/60 hover:text-primary' : 'text-muted-foreground hover:text-foreground'
                }`}
                style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
                onClick={() => setCollapsed(false)}
              >
                EXPAND
              </div>

              {/* Navigation indicators */}
              <div className="flex flex-col items-center gap-3 mt-4">
                {/* Home button */}
                <button
                  onClick={() => onSelectView('welcome')}
                  className={`p-1.5 rounded transition-colors ${
                    activeView === 'welcome'
                      ? isKuroryuu ? 'text-primary bg-primary/20' : 'text-primary bg-secondary'
                      : isKuroryuu
                        ? 'text-primary/50 hover:text-primary hover:bg-primary/10'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }`}
                  title="Home"
                >
                  <Home className="w-4 h-4" />
                </button>

                {navGroups.map((group) => {
                  const hasActive = group.items.some((item) => item.id === activeView);
                  return (
                    <button
                      key={group.id}
                      onClick={() => {
                        // Expand sidebar
                        setCollapsed(false);
                        // Expand only this group, collapse all others
                        setExpandedGroups(new Set([group.id]));
                        // Navigate to first item in group
                        if (group.items.length > 0) {
                          onSelectView(group.items[0].id);
                        }
                      }}
                      className={`p-1.5 rounded transition-colors ${
                        hasActive
                          ? isKuroryuu ? 'text-primary bg-primary/20' : 'text-primary bg-secondary'
                          : isKuroryuu
                            ? 'text-primary/50 hover:text-primary hover:bg-primary/10'
                            : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                      }`}
                      title={group.label}
                    >
                      <group.icon className="w-4 h-4" />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bottom section: Settings cog */}
            <button
              onClick={() => openDialog('app')}
              className={`p-1.5 rounded transition-colors ${
                isKuroryuu
                  ? 'text-primary/50 hover:text-primary hover:bg-primary/10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Logo / Brand - Expanded State */}
        <div className={`px-4 py-4 border-b border-border/50 flex items-center gap-3 transition-opacity duration-300 ${
          isCollapsed ? 'opacity-0 pointer-events-none absolute' : 'opacity-100'
        }`}>
          {/* Dragon logo - always show for themed styles, debug: show for all themes */}
          {(isKuroryuu || isGrunge) && (
            <img
              src={kuroryuuDragon}
              alt="Kuroryuu"
              className="w-10 h-10"
              style={{
                filter: isKuroryuu ? 'drop-shadow(0 0 4px rgba(201, 162, 39, 0.5))' : 'grayscale(100%)',
              }}
              onError={(e) => console.error('Dragon logo failed to load:', e)}
            />
          )}
          <div>
            <h1 className="text-lg font-bold text-primary tracking-tight">Kuroryuu</h1>
            <p className="text-[10px] text-muted-foreground mt-0.5">黒き幻影の霧の龍</p>
          </div>
        </div>

        {/* Floating Recording Indicator - shown when on headerless panels (traffic-flow) */}
        {isRecording && activeView === 'traffic-flow' && !isCollapsed && (
          <div className="px-3 py-2 border-b border-red-500/30 bg-red-500/5">
            <RecordingIndicator variant="floating" />
          </div>
        )}

      {/* Navigation Groups */}
      <div className={`flex-1 overflow-y-auto py-3 px-2 space-y-1 transition-opacity duration-300 ${
        isCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}>
        {/* Home / Welcome - Always visible at top */}
        <button
          onClick={() => onSelectView('welcome')}
          className={`
            group relative w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-150 mb-2
            ${
              activeView === 'welcome'
                ? 'bg-secondary text-primary'
                : 'text-muted-foreground hover:bg-secondary/40 hover:text-foreground'
            }
          `}
        >
          {activeView === 'welcome' && (
            <div className="absolute left-0 top-2 bottom-2 w-0.5 bg-primary rounded-r-full" />
          )}
          <Home className="w-4 h-4 flex-shrink-0" />
          <span className="text-sm flex-1 text-left font-medium">Home</span>
          <span className="text-[10px] text-muted-foreground/60 font-mono opacity-0 group-hover:opacity-100 transition-opacity">
            H
          </span>
        </button>

        <div className="h-px bg-border/50 my-2" />

        {navGroups.map((group) => (
          <SidebarGroup
            key={group.id}
            group={group}
            isExpanded={expandedGroups.has(group.id)}
            onToggle={() => toggleGroup(group.id)}
            activeView={activeView}
            onSelectView={onSelectView}
            extraAction={group.id === 'build' ? (
              <button
                onClick={() => window.electronAPI?.codeEditor?.open?.()}
                className="group relative w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-150 text-muted-foreground hover:bg-secondary/40 hover:text-foreground mt-1 border-t border-border/30 pt-2"
              >
                <Code2 className="w-4 h-4 flex-shrink-0" />
                <span className="text-sm flex-1 text-left">CodeEditor</span>
                <span className="text-[10px] text-muted-foreground/40 font-mono">
                  ↗
                </span>
              </button>
            ) : undefined}
          />
        ))}
      </div>

      {/* Bottom Actions */}
      <div className={`border-t border-border/50 p-2 space-y-1 transition-opacity duration-300 ${
        isCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}>
        <button
          onClick={() => openDialog('integrations')}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-all duration-150"
        >
          <Plug className="w-4 h-4" />
          <span className="text-sm">Integrations</span>
        </button>

        <button
          onClick={() => useDomainConfigStore.getState().openDialog()}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-all duration-150"
        >
          <Cpu className="w-4 h-4" />
          <span className="text-sm">Domain Config</span>
        </button>

        <button
          onClick={() => openDialog('app')}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-all duration-150"
        >
          <Settings className="w-4 h-4" />
          <span className="text-sm">Settings</span>
          <span className="text-[10px] text-muted-foreground/60 font-mono ml-auto">
            Ctrl+,
          </span>
        </button>

        {/* Launch Tray Companion - Shift+click for debug mode (shows terminal) */}
        <button
          onClick={(e) => window.electronAPI?.app?.launchTrayCompanion?.({ debug: e.shiftKey })}
          title="Launch Tray Companion (Shift+click for debug mode)"
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:bg-secondary/50 hover:text-foreground transition-all duration-150"
        >
          <Bot className="w-4 h-4" />
          <span className="text-sm">Tray Companion</span>
        </button>
      </div>
      </div>

      {/* Kuroryuu: Right pillar decoration */}
      {isKuroryuu && !isCollapsed && (
        <div
          className="w-6 h-full flex-shrink-0"
          style={{
            backgroundImage: `url(${pillarVertical})`,
            backgroundSize: 'contain',
            backgroundRepeat: 'repeat-y',
            backgroundPosition: 'center',
            opacity: 0.7,
            transform: 'scaleX(-1)', // Mirror the pillar
          }}
        />
      )}
    </div>
  );
}
