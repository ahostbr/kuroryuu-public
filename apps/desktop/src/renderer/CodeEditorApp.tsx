/**
 * CodeEditorApp - Standalone code editor window
 * Renders when loaded with #/code-editor hash route
 */

import { useEffect, useCallback, useState } from 'react';
import { useCodeEditorStore } from './stores/code-editor-store';
import { useAssistantChatStore } from './stores/assistant-store';
import {
  ActivityBar,
  EditorTabs,
  DiffViewer,
  KuroryuuDesktopAssistantPanel,
  BranchSwitcher,
  type ActivityView,
} from './components/code-editor';
import { FileExplorerPanel } from './components/FileExplorerPanel';
import { EditorPane } from './components/editdoc/EditorPane';
import { PreviewPane } from './components/editdoc/PreviewPane';
import { ToastContainer } from './components/ui/toast';
import { toast } from './components/ui/toaster';
import {
  RefreshCw,
  Eye,
  EyeOff,
  Save,
  Map,
  ChevronRight,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';

export default function CodeEditorApp() {
  const {
    openFiles,
    activeFileIndex,
    isRefreshing,
    watcherStatus,
    showPreview,
    sidebarWidth,
    projectRoot,
    diffViewFile,
    refreshGitStatus,
    togglePreview,
    updateFileContent,
    markFileSaved,
    setProjectRoot,
    setDiffViewFile,
    openFile,
  } = useCodeEditorStore();

  const { setEditorContext, setPanelOpen } = useAssistantChatStore();

  // Activity bar state - controls which LEFT sidebar view is active
  const [activeView, setActiveView] = useState<ActivityView | null>('explorer');
  // Track if primary sidebar (left) is visible - hidden by default for cleaner UI
  const [showPrimarySidebar, setShowPrimarySidebar] = useState(false);
  // Track if AI panel (right) is visible - independent from left sidebar
  const [showAIPanel, setShowAIPanel] = useState(false);
  // Minimap toggle (T425)
  const [showMinimap, setShowMinimap] = useState(false);
  // Cursor position for status bar
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorCol, setCursorCol] = useState(1);
  // Track if file explorer is empty
  const [explorerIsEmpty, setExplorerIsEmpty] = useState(false);

  const activeFile = activeFileIndex >= 0 ? openFiles[activeFileIndex] : null;

  // Handle activity view change from ActivityBar
  const handleViewChange = useCallback((view: ActivityView | null) => {
    // AI panel is independent - only toggle when AI is clicked
    if (view === 'ai') {
      setShowAIPanel(prev => !prev);
      setPanelOpen(!showAIPanel);
      return; // Don't change left sidebar view
    }

    // All other views control the primary (left) sidebar
    if (activeView === view) {
      // Toggle off - hide sidebar
      setShowPrimarySidebar(prev => !prev);
    } else {
      // Switch to this view, show sidebar
      setActiveView(view);
      setShowPrimarySidebar(true);
    }
  }, [activeView, showAIPanel, setPanelOpen]);

  // Check if a right panel should be shown based on active view
  const isRightPanelView = (view: ActivityView | null): boolean => {
    return view === 'ai';
  };

  // Check if sidebar has content to show (collapse when empty or no active view)
  const sidebarHasContent = (): boolean => {
    // Only explorer is supported - AI is independent right panel
    if (!activeView || activeView === 'ai') {
      return false;
    }
    if (activeView === 'explorer') {
      return !!projectRoot && !explorerIsEmpty;
    }
    return false;
  };

  // Update AI chat context when active file changes
  useEffect(() => {
    if (activeFile) {
      setEditorContext({
        filePath: activeFile.path,
        content: activeFile.content,
        language: activeFile.language,
        lineCount: activeFile.content.split('\n').length,
      });
    } else {
      setEditorContext(null);
    }
  }, [activeFile?.path, activeFile?.content, setEditorContext]);

  // Initialize on mount
  useEffect(() => {
    // Get project root from main process (path-agnostic)
    window.electronAPI?.app?.getProjectRoot?.()
      .then((root: string) => {
        setProjectRoot(root.replace(/\\/g, '/'));
      })
      .catch((err) => {
        console.error('[CodeEditorApp] Failed to get project root:', err);
        // Don't hardcode - leave empty and let components handle gracefully
      });

    // Initial git status refresh
    refreshGitStatus();

    // Set up polling interval for git status (every 10 seconds)
    const interval = setInterval(() => {
      refreshGitStatus();
    }, 10000);

    return () => clearInterval(interval);
  }, []);

  // Handle file save
  const handleSave = useCallback(async () => {
    if (!activeFile || activeFileIndex < 0) return;

    try {
      await window.electronAPI?.fs?.writeFile?.(activeFile.path, activeFile.content);
      markFileSaved(activeFileIndex);
      toast.success('File saved');
      // Refresh git status after save
      refreshGitStatus();
    } catch (err) {
      toast.error('Failed to save file');
    }
  }, [activeFile, activeFileIndex, markFileSaved, refreshGitStatus]);

  // Handle content change
  const handleContentChange = useCallback((content: string) => {
    if (activeFileIndex >= 0) {
      updateFileContent(activeFileIndex, content);
    }
  }, [activeFileIndex, updateFileContent]);

  // Handle Go to Definition (Ctrl+Click or F12)
  const handleGoToDefinition = useCallback(async (symbol: string, line: number, column: number) => {
    // Search for symbol definition using k_repo_intel
    try {
      const result = await window.electronAPI?.mcp?.call?.('k_repo_intel', {
        action: 'get',
        report: 'symbol_map',
        query: symbol,
        limit: 10,
      });

      const resultData = result?.result as { data?: { symbols?: unknown[] } } | undefined;
      if (result?.ok && resultData?.data?.symbols) {
        const symbols = resultData.data.symbols as Array<{
          name: string;
          file: string;
          line: number;
          exported: boolean;
        }>;

        // Find exact match
        const match = symbols.find(s => s.name === symbol);
        if (match) {
          // Open the file
          let fullPath = match.file;
          if (!fullPath.includes(':') && projectRoot) {
            fullPath = `${projectRoot}/${match.file}`.replace(/\\/g, '/');
          }

          const content = await window.electronAPI?.fs?.readFile?.(fullPath);
          if (typeof content === 'string') {
            openFile(fullPath, content);
            toast.success(`Definition: ${match.file}:${match.line}`);
          }
        } else {
          toast.info(`No definition found for "${symbol}"`);
        }
      }
    } catch (err) {
      console.error('[GoToDefinition] Error:', err);
      toast.error('Failed to find definition');
    }
  }, [projectRoot, openFile]);

  // Handle Find References (Shift+F12) - shows toast since references panel removed
  const handleFindReferences = useCallback((symbol: string) => {
    toast.info(`Find references: "${symbol}" - use k_repo_intel in AI chat`);
  }, []);

  // Keyboard shortcuts (simplified - only explorer, AI, and essential shortcuts)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+S - Save file
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
      // Ctrl+Shift+E - Toggle Explorer
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        handleViewChange('explorer');
      }
      // Ctrl+Shift+A - Toggle AI panel
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        handleViewChange('ai');
      }
      // Ctrl+Shift+M - Toggle Minimap
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'M') {
        e.preventDefault();
        setShowMinimap(prev => !prev);
      }
      // Ctrl+B - Toggle Primary Sidebar
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        setShowPrimarySidebar(prev => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave, handleViewChange, activeView]);

  // Watcher status display
  const watcherStatusText = {
    idle: 'Idle',
    watching: 'Watching',
    syncing: 'Syncing...',
    'changes-detected': 'Changes detected',
  }[watcherStatus];

  return (
    <div className="h-screen w-screen flex flex-col bg-background text-foreground overflow-hidden">
      {/* Header - Cleaner VS Code style */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-card/50 h-9">
        {/* Left: Sidebar toggle + Breadcrumbs */}
        <div className="flex items-center gap-2">
          {/* Toggle primary sidebar */}
          <button
            onClick={() => setShowPrimarySidebar(prev => !prev)}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title={showPrimarySidebar ? 'Hide Sidebar (Ctrl+B)' : 'Show Sidebar (Ctrl+B)'}
          >
            {showPrimarySidebar ? <PanelLeftClose className="w-4 h-4" /> : <PanelLeft className="w-4 h-4" />}
          </button>

          {/* Breadcrumbs */}
          {activeFile && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {activeFile.path.split('/').slice(-3).map((part, i, arr) => (
                <span key={i} className="flex items-center gap-1">
                  <span className={i === arr.length - 1 ? 'text-foreground' : ''}>{part}</span>
                  {i < arr.length - 1 && <ChevronRight className="w-3 h-3" />}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Center: Branch + Status */}
        <div className="flex items-center gap-3">
          <BranchSwitcher />

          {/* Watcher status */}
          <div className="flex items-center gap-1.5 text-xs">
            <div className={`w-1.5 h-1.5 rounded-full ${
              watcherStatus === 'watching' ? 'bg-green-500' :
              watcherStatus === 'syncing' ? 'bg-yellow-500 animate-pulse' :
              watcherStatus === 'changes-detected' ? 'bg-orange-500' :
              'bg-muted-foreground'
            }`} />
            <span className="text-muted-foreground text-[10px]">{watcherStatusText}</span>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1">
          {/* Refresh */}
          <button
            onClick={() => refreshGitStatus()}
            disabled={isRefreshing}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            title="Refresh git status"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>

          {/* Preview toggle (markdown) */}
          {activeFile?.language === 'markdown' && (
            <button
              onClick={togglePreview}
              className={`p-1 rounded transition-colors ${
                showPreview ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
              }`}
              title={showPreview ? 'Hide preview' : 'Show preview'}
            >
              {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            </button>
          )}

          {/* Minimap toggle */}
          <button
            onClick={() => setShowMinimap(prev => !prev)}
            className={`p-1 rounded transition-colors ${
              showMinimap ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
            title={showMinimap ? 'Hide minimap (Ctrl+Shift+M)' : 'Show minimap (Ctrl+Shift+M)'}
          >
            <Map className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Activity Bar - VS Code style vertical icon bar */}
        <ActivityBar
          activeView={activeView}
          onViewChange={handleViewChange}
          isAIActive={showAIPanel}
        />

        {/* Primary Sidebar (Explorer only) - pop in/out */}
        {showPrimarySidebar && sidebarHasContent() && (
          <div
            className="border-r border-border bg-card/30 flex-shrink-0 overflow-hidden"
            style={{ width: sidebarWidth }}
          >
            {activeView === 'explorer' && projectRoot && (
              <FileExplorerPanel
                projectRoot={projectRoot}
                onFileSelect={async (path) => {
                  try {
                    const content = await window.electronAPI?.fs?.readFile?.(path);
                    if (typeof content === 'string') {
                      openFile(path, content);
                    }
                  } catch (err) {
                    console.error('[CodeEditorApp] Failed to open file:', err);
                  }
                }}
                onEmptyChange={setExplorerIsEmpty}
              />
            )}
          </div>
        )}

        {/* Editor area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Tabs (only show when not in diff view) */}
          {!diffViewFile && <EditorTabs />}

          {/* Diff view or Editor/Preview split */}
          <div className="flex-1 flex overflow-hidden">
            {diffViewFile ? (
              <DiffViewer
                file={diffViewFile}
                onClose={() => setDiffViewFile(null)}
              />
            ) : activeFile ? (
              <>
                {/* Editor pane */}
                <div className={`${showPreview ? 'w-1/2 border-r border-border' : 'flex-1'} overflow-hidden`}>
                  <EditorPane
                    key={activeFile.path}
                    content={activeFile.content}
                    onChange={handleContentChange}
                    onCursorChange={(line, col) => { setCursorLine(line); setCursorCol(col); }}
                    onSave={handleSave}
                    onGoToDefinition={handleGoToDefinition}
                    onFindReferences={handleFindReferences}
                    language={activeFile.language}
                    showMinimap={showMinimap}
                    showFoldGutter={true}
                  />
                </div>

                {/* Preview pane (markdown only) */}
                {showPreview && activeFile.language === 'markdown' && (
                  <div className="w-1/2 overflow-hidden">
                    <PreviewPane content={activeFile.content} />
                  </div>
                )}
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <p className="text-lg mb-2">No file open</p>
                  <p className="text-sm">Select a file from the sidebar to edit</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel (AI Chat only) - independent from left sidebar */}
        {showAIPanel && (
          <div className="flex-shrink-0 h-full overflow-hidden">
            <KuroryuuDesktopAssistantPanel mode="panel" />
          </div>
        )}
      </div>

      {/* Status bar - VS Code style */}
      <div className="flex items-center justify-between px-2 h-6 border-t border-border bg-card/50 text-[11px]">
        {/* Left side */}
        <div className="flex items-center gap-3">
          {/* Git branch indicator */}
          {activeView === 'git' || activeView === 'explorer' ? (
            <span className="text-muted-foreground hover:text-foreground cursor-pointer">
              master
            </span>
          ) : null}

          {/* Sync indicator */}
          <span className="text-muted-foreground">
            {isRefreshing ? '↻ Syncing...' : ''}
          </span>
        </div>

        {/* Right side */}
        <div className="flex items-center gap-3">
          {activeFile && (
            <>
              {/* Line:Col */}
              <span className="text-muted-foreground hover:text-foreground cursor-pointer">
                Ln {cursorLine}, Col {cursorCol}
              </span>

              {/* Spaces/Tabs */}
              <span className="text-muted-foreground hover:text-foreground cursor-pointer">
                Spaces: 2
              </span>

              {/* Encoding */}
              <span className="text-muted-foreground hover:text-foreground cursor-pointer">
                UTF-8
              </span>

              {/* EOL */}
              <span className="text-muted-foreground hover:text-foreground cursor-pointer">
                LF
              </span>

              {/* Language mode */}
              <span className="text-muted-foreground hover:text-foreground cursor-pointer capitalize">
                {activeFile.language}
              </span>

              {/* Dirty indicator */}
              {activeFile.isDirty && (
                <span className="text-primary flex items-center gap-1">
                  <Save className="w-3 h-3" />
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Toast container */}
      <ToastContainer />
    </div>
  );
}
