import { useState, useCallback, useEffect } from 'react';
import { WorkspaceHeader } from './WorkspaceHeader';
import { WorkspaceNav } from './WorkspaceNav';
import { WorkspaceContent } from './WorkspaceContent';
import type { TerminalWorkspaceProps, LayoutMode, WorkspaceState } from './types';

/**
 * TerminalWorkspace — Reusable layout for any panel that combines
 * a tool nav sidebar + terminal + collapsible tool pages.
 *
 * Features:
 * - VS Code-style icon nav (left)
 * - Terminal on the left, tool pages on the right (split/grid modes)
 * - Collapsible tool panel (click active nav icon to toggle)
 * - Draggable resize handle between terminal and tool page
 * - Window mode with two floating, draggable/resizable windows
 * - Optional skills dropdown in the header
 * - Layout mode toggle (grid/splitter/window) with optional persistence
 *
 * @example
 * ```tsx
 * <TerminalWorkspace
 *   title="Marketing"
 *   tools={[
 *     { id: 'research', icon: Search, label: 'Research', page: <ResearchPage /> },
 *     { id: 'gallery', icon: FolderOpen, label: 'Gallery', page: <GalleryPage />, bottom: true },
 *   ]}
 *   terminal={<MarketingTerminal />}
 *   terminalTitle="Marketing Terminal"
 *   skills={MARKETING_SKILLS}
 *   skillPathPrefix="ai/skills/marketing/"
 *   terminalPtyId={ptyId}
 *   layoutSettingsKey="ui.marketingLayout"
 *   onSettings={() => setSetupComplete(false)}
 * />
 * ```
 */
export function TerminalWorkspace({
  title,
  tools,
  skills,
  skillPathPrefix,
  terminal,
  terminalPtyId,
  terminalTitle = 'Terminal',
  layoutSettingsKey,
  headerExtra,
  onSettings,
  defaultTool,
  defaultLayout = 'window',
  defaultSplitRatio = 50,
}: TerminalWorkspaceProps) {
  // Internal state — consumers don't need their own store for layout
  const [activeTool, setActiveTool] = useState(defaultTool || tools[0]?.id || '');
  const [showToolNav, setShowToolNav] = useState(true);
  const [showToolPanel, setShowToolPanel] = useState(true);
  const [layoutMode, setLayoutModeInternal] = useState<LayoutMode>(defaultLayout);
  const [splitRatio, setSplitRatioInternal] = useState(defaultSplitRatio);

  const setSplitRatio = useCallback((ratio: number) => {
    setSplitRatioInternal(Math.max(20, Math.min(80, ratio)));
  }, []);

  const setLayoutMode = useCallback((mode: LayoutMode) => {
    setLayoutModeInternal(mode);
    if (layoutSettingsKey) {
      window.electronAPI?.settings?.set?.(layoutSettingsKey, mode).catch(console.error);
    }
  }, [layoutSettingsKey]);

  // Load persisted layout mode on mount
  useEffect(() => {
    if (!layoutSettingsKey) return;
    window.electronAPI?.settings?.get?.(layoutSettingsKey).then((raw: unknown) => {
      const mode = raw as LayoutMode | null;
      if (mode && ['grid', 'splitter', 'window'].includes(mode)) {
        setLayoutModeInternal(mode);
      }
    }).catch(console.error);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const state: WorkspaceState = {
    activeTool,
    setActiveTool,
    showToolNav,
    setShowToolNav,
    showToolPanel,
    setShowToolPanel,
    layoutMode,
    setLayoutMode,
    splitRatio,
    setSplitRatio,
  };

  return (
    <div className="w-full h-full flex flex-col bg-zinc-900">
      <WorkspaceHeader
        title={title}
        skills={skills}
        skillPathPrefix={skillPathPrefix}
        terminalPtyId={terminalPtyId}
        headerExtra={headerExtra}
        onSettings={onSettings}
        state={state}
      />
      <div className="flex-1 flex overflow-hidden">
        {showToolNav && <WorkspaceNav tools={tools} state={state} />}
        <WorkspaceContent
          tools={tools}
          terminal={terminal}
          terminalTitle={terminalTitle}
          state={state}
        />
      </div>
    </div>
  );
}
