import { useState, useCallback, useEffect, useRef } from 'react';
import type { WorkspaceTool, WorkspaceState } from './types';

interface WorkspaceContentProps {
  tools: WorkspaceTool[];
  terminal: React.ReactNode;
  terminalTitle?: string;
  state: WorkspaceState;
}

function ToolPageRouter({ tools, activeId }: { tools: WorkspaceTool[]; activeId: string }) {
  const tool = tools.find(t => t.id === activeId);
  return tool ? <>{tool.page}</> : null;
}

export function WorkspaceContent({ tools, terminal, terminalTitle = 'Terminal', state }: WorkspaceContentProps) {
  const { activeTool, showToolPanel, splitRatio, setSplitRatio, layoutMode } = state;

  // Split view resize handle
  const containerRef = useRef<HTMLDivElement>(null);

  const handleResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const container = containerRef.current;
    if (!container) return;
    const startX = e.clientX;
    const totalWidth = container.clientWidth;
    const initialRatio = splitRatio;

    const onMove = (moveE: MouseEvent) => {
      const dx = moveE.clientX - startX;
      const deltaPercent = (dx / totalWidth) * 100;
      setSplitRatio(initialRatio + deltaPercent);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [splitRatio, setSplitRatio]);

  // Terminal window state (drag + resize)
  const [win, setWin] = useState({ x: 20, y: 20, width: 700, height: 450 });
  const [resizing, setResizing] = useState(false);
  const termWrapperRef = useRef<HTMLDivElement>(null);

  const handleDrag = useCallback((e: React.MouseEvent) => {
    if (!(e.target as HTMLElement).closest('.window-drag-handle')) return;
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    const start = { ...win };
    const onMove = (me: MouseEvent) => {
      setWin(s => ({
        ...s,
        x: Math.max(0, start.x + me.clientX - startX),
        y: Math.max(0, start.y + me.clientY - startY),
      }));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [win]);

  const handleWindowResize = useCallback((e: React.MouseEvent, dir: string) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing(true);
    const startX = e.clientX, startY = e.clientY;
    const start = { ...win };
    const onMove = (me: MouseEvent) => {
      const dx = me.clientX - startX, dy = me.clientY - startY;
      setWin(s => ({
        ...s,
        ...(dir.includes('e') ? { width: Math.max(350, start.width + dx) } : {}),
        ...(dir.includes('s') ? { height: Math.max(200, start.height + dy) } : {}),
      }));
    };
    const onUp = () => {
      setResizing(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [win]);

  // Tool window state (for window mode)
  const [toolWin, setToolWin] = useState({ x: 740, y: 20, width: 600, height: 450 });
  const [toolResizing, setToolResizing] = useState(false);

  const handleToolDrag = useCallback((e: React.MouseEvent) => {
    if (!(e.target as HTMLElement).closest('.tool-window-drag-handle')) return;
    e.preventDefault();
    const startX = e.clientX, startY = e.clientY;
    const start = { ...toolWin };
    const onMove = (me: MouseEvent) => {
      setToolWin(s => ({
        ...s,
        x: Math.max(0, start.x + me.clientX - startX),
        y: Math.max(0, start.y + me.clientY - startY),
      }));
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [toolWin]);

  const handleToolWindowResize = useCallback((e: React.MouseEvent, dir: string) => {
    e.preventDefault();
    e.stopPropagation();
    setToolResizing(true);
    const startX = e.clientX, startY = e.clientY;
    const start = { ...toolWin };
    const onMove = (me: MouseEvent) => {
      const dx = me.clientX - startX, dy = me.clientY - startY;
      setToolWin(s => ({
        ...s,
        ...(dir.includes('e') ? { width: Math.max(350, start.width + dx) } : {}),
        ...(dir.includes('s') ? { height: Math.max(200, start.height + dy) } : {}),
      }));
    };
    const onUp = () => {
      setToolResizing(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [toolWin]);

  // Terminal refit hack (padding nudge)
  useEffect(() => {
    const el = termWrapperRef.current;
    if (!el) return;
    const timers = [300, 600, 1000].map(delay =>
      setTimeout(() => {
        el.style.paddingRight = '1px';
        requestAnimationFrame(() => { el.style.paddingRight = ''; });
      }, delay)
    );
    return () => timers.forEach(t => clearTimeout(t));
  }, [layoutMode, splitRatio]);

  const activeToolObj = tools.find(t => t.id === activeTool);
  const isWindow = layoutMode === 'window';

  // Grid and splitter modes: terminal left, tool page right (collapsible)
  if (!isWindow) {
    return (
      <div ref={containerRef} className="flex-1 flex flex-row h-full overflow-hidden">
        {/* Terminal (left) — takes full width when tool panel collapsed */}
        <div
          ref={termWrapperRef}
          style={{ width: showToolPanel ? `${100 - splitRatio}%` : '100%' }}
          className="h-full min-w-0 overflow-hidden transition-[width] duration-150"
        >
          <div className="h-full rounded-lg border border-zinc-700 overflow-hidden flex flex-col">
            <div className="flex-shrink-0 flex items-center px-3 py-1.5 bg-zinc-800 border-b border-zinc-700">
              <span className="text-xs font-medium text-zinc-400">{terminalTitle}</span>
            </div>
            <div className="flex-1 min-h-0 overflow-hidden">
              {terminal}
            </div>
          </div>
        </div>

        {/* Resize handle + Tool page (right) — only when panel is open */}
        {showToolPanel && (
          <>
            <div
              className="w-2 cursor-col-resize flex-shrink-0 flex items-center justify-center hover:bg-amber-500/20 transition-colors"
              onMouseDown={handleResize}
            >
              <div className="flex flex-col gap-0.5">
                {[0, 1, 2].map(i => (
                  <div key={i} className="w-1 h-1 rounded-full bg-zinc-500" />
                ))}
              </div>
            </div>

            <div style={{ width: `${splitRatio}%` }} className="h-full min-w-0 overflow-hidden">
              <ToolPageRouter tools={tools} activeId={activeTool} />
            </div>
          </>
        )}
      </div>
    );
  }

  // Window mode: both terminal and tool page are floating windows
  return (
    <div className="flex-1 relative overflow-hidden bg-zinc-900/50">
      {/* Floating terminal window */}
      <div
        onMouseDown={handleDrag}
        style={{ position: 'absolute', left: win.x, top: win.y, width: win.width, height: win.height, zIndex: 10 }}
        className={`rounded-lg overflow-hidden flex flex-col shadow-lg border-2 transition-colors ${resizing ? 'border-amber-500/60' : 'border-zinc-600'}`}
      >
        <div className="window-drag-handle flex-shrink-0 flex items-center justify-between px-3 py-1.5 bg-zinc-800/90 border-b border-zinc-700 cursor-move select-none">
          <span className="text-xs font-medium text-zinc-400">{terminalTitle}</span>
          <span className="text-[10px] text-zinc-500">drag to move</span>
        </div>
        <div ref={termWrapperRef} className="flex-1 min-h-0 overflow-hidden">
          {terminal}
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-amber-500/30 z-20" onMouseDown={(e) => handleWindowResize(e, 'e')} />
        <div className="absolute left-0 right-0 bottom-0 h-2 cursor-ns-resize hover:bg-amber-500/30 z-20" onMouseDown={(e) => handleWindowResize(e, 's')} />
        <div className="absolute right-0 bottom-0 w-4 h-4 cursor-nwse-resize hover:bg-amber-500/40 z-30 rounded-tl" onMouseDown={(e) => handleWindowResize(e, 'se')} />
      </div>

      {/* Floating tool page window — only when panel is open */}
      {showToolPanel && (
        <div
          onMouseDown={handleToolDrag}
          style={{ position: 'absolute', left: toolWin.x, top: toolWin.y, width: toolWin.width, height: toolWin.height, zIndex: 11 }}
          className={`rounded-lg overflow-hidden flex flex-col shadow-lg border-2 transition-colors ${toolResizing ? 'border-amber-500/60' : 'border-zinc-600'}`}
        >
          <div className="tool-window-drag-handle flex-shrink-0 flex items-center justify-between px-3 py-1.5 bg-zinc-800/90 border-b border-zinc-700 cursor-move select-none">
            <span className="text-xs font-medium text-zinc-400 capitalize">{activeToolObj?.label || activeTool.replace(/-/g, ' ')}</span>
            <span className="text-[10px] text-zinc-500">drag to move</span>
          </div>
          <div className="flex-1 min-h-0 overflow-auto">
            <ToolPageRouter tools={tools} activeId={activeTool} />
          </div>
          <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-amber-500/30 z-20" onMouseDown={(e) => handleToolWindowResize(e, 'e')} />
          <div className="absolute left-0 right-0 bottom-0 h-2 cursor-ns-resize hover:bg-amber-500/30 z-20" onMouseDown={(e) => handleToolWindowResize(e, 's')} />
          <div className="absolute right-0 bottom-0 w-4 h-4 cursor-nwse-resize hover:bg-amber-500/40 z-30 rounded-tl" onMouseDown={(e) => handleToolWindowResize(e, 'se')} />
        </div>
      )}
    </div>
  );
}
