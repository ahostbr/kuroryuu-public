import { useState, useCallback } from 'react';
import { useMarketingStore } from '../../stores/marketing-store';
import { MarketingHeader } from './MarketingHeader';
import { MarketingTerminal } from './MarketingTerminal';
import { MarketingSkillPicker } from './MarketingSkillPicker';
import { MarketingToolPanel } from './MarketingToolPanel';
import { MarketingAssetGallery } from './MarketingAssetGallery';

function FloatingTerminalWindow() {
  const [win, setWin] = useState({ x: 20, y: 20, width: 700, height: 450 });
  const [resizing, setResizing] = useState(false);

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

  const handleResize = useCallback((e: React.MouseEvent, dir: string) => {
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

  return (
    <div
      onMouseDown={handleDrag}
      style={{
        position: 'absolute',
        left: win.x,
        top: win.y,
        width: win.width,
        height: win.height,
        zIndex: 10,
      }}
      className={`rounded-lg overflow-hidden flex flex-col shadow-lg border-2 transition-colors ${
        resizing ? 'border-primary/60' : 'border-border'
      }`}
    >
      {/* Title bar / drag handle */}
      <div className="window-drag-handle flex-shrink-0 flex items-center justify-between px-3 py-1.5 bg-card/90 border-b border-border cursor-move select-none">
        <span className="text-xs text-muted-foreground">Marketing Terminal</span>
        <span className="text-[10px] text-muted-foreground/50">drag to move · edges to resize</span>
      </div>

      {/* Terminal content — explicit dimensions for FitAddon */}
      <div className="flex-1 min-h-0">
        <MarketingTerminal />
      </div>

      {/* Resize handles — wider hit targets, always subtly visible */}
      <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-primary/5 hover:bg-primary/30 z-20" onMouseDown={(e) => handleResize(e, 'e')} />
      <div className="absolute left-0 right-0 bottom-0 h-2 cursor-ns-resize bg-primary/5 hover:bg-primary/30 z-20" onMouseDown={(e) => handleResize(e, 's')} />
      <div className="absolute right-0 bottom-0 w-4 h-4 cursor-nwse-resize bg-primary/15 hover:bg-primary/40 z-30 rounded-tl" onMouseDown={(e) => handleResize(e, 'se')} />
    </div>
  );
}

export function MarketingWorkspace() {
  const showSkillsSidebar = useMarketingStore((s) => s.showSkillsSidebar);
  const showToolsPanel = useMarketingStore((s) => s.showToolsPanel);
  const toolsPanelTab = useMarketingStore((s) => s.toolsPanelTab);
  const layoutMode = useMarketingStore((s) => s.layoutMode);

  return (
    <div className="w-full h-full flex flex-col bg-zinc-900">
      <MarketingHeader />
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar — Skills (fly-in, like FileExplorer) */}
        {showSkillsSidebar && (
          <div className="w-56 flex-shrink-0 border-r border-zinc-700 bg-zinc-800 overflow-y-auto">
            <MarketingSkillPicker />
          </div>
        )}

        {/* Center — Terminal area */}
        <div className={`flex-1 min-w-0 overflow-hidden ${
          layoutMode === 'grid' ? 'grid grid-cols-1 grid-rows-1 gap-1 p-1' :
          layoutMode === 'splitter' ? 'flex flex-row gap-1 p-1' :
          'relative p-4'
        }`}>
          {layoutMode === 'window' ? (
            <FloatingTerminalWindow />
          ) : (
            /* Grid/Splitter: terminal fills the area */
            <div className="rounded-lg border-2 border-primary/60 overflow-hidden flex flex-col
                            shadow-[0_0_30px_rgba(201,162,39,0.3)] ring-1 ring-primary/20"
                 style={layoutMode === 'splitter' ? { flex: '1 1 100%', minWidth: 200, height: '100%' } : undefined}>
              <div className="flex-shrink-0 flex items-center justify-between px-3 py-2
                              bg-card/90 border-b border-primary/60
                              bg-gradient-to-r from-primary/10 via-card to-primary/10
                              shadow-[0_2px_12px_rgba(201,162,39,0.25)]">
                <span className="text-xs font-medium text-muted-foreground">Marketing Terminal</span>
              </div>
              <div className="flex-1 min-h-0">
                <MarketingTerminal />
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar — Tools/Gallery (fly-in from right) */}
        {showToolsPanel && (
          <div className="w-80 flex-shrink-0 border-l border-zinc-700 bg-zinc-800 overflow-y-auto">
            {toolsPanelTab === 'tools' && <MarketingToolPanel />}
            {toolsPanelTab === 'gallery' && <MarketingAssetGallery />}
          </div>
        )}
      </div>
    </div>
  );
}
