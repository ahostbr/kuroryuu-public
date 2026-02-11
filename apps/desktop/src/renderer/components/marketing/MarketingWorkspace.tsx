import { useState, useCallback, useEffect, useRef } from 'react';
import { useMarketingStore } from '../../stores/marketing-store';
import { MarketingHeader } from './MarketingHeader';
import { MarketingTerminal } from './MarketingTerminal';
import { MarketingSkillPicker } from './MarketingSkillPicker';
import { MarketingToolPanel } from './MarketingToolPanel';
import { MarketingAssetGallery } from './MarketingAssetGallery';

export function MarketingWorkspace() {
  const showSkillsSidebar = useMarketingStore((s) => s.showSkillsSidebar);
  const showToolsPanel = useMarketingStore((s) => s.showToolsPanel);
  const toolsPanelTab = useMarketingStore((s) => s.toolsPanelTab);
  const layoutMode = useMarketingStore((s) => s.layoutMode);
  const termWrapperRef = useRef<HTMLDivElement>(null);

  // Window mode state (drag + resize)
  const [win, setWin] = useState({ x: 20, y: 20, width: 700, height: 450 });
  const [resizing, setResizing] = useState(false);

  const handleDrag = useCallback((e: React.MouseEvent) => {
    if (layoutMode !== 'window') return;
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
  }, [win, layoutMode]);

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

  // Force terminal ResizeObserver to fire after layout mode changes.
  // Briefly toggle 1px padding on the wrapper — this guarantees the observed
  // element's dimensions change, even if the grid layout settles to similar
  // pixel values as the previous mode.
  useEffect(() => {
    const el = termWrapperRef.current;
    if (!el) return;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      el.style.paddingRight = '1px';
      raf2 = requestAnimationFrame(() => {
        el.style.paddingRight = '';
      });
    });
    return () => { cancelAnimationFrame(raf1); cancelAnimationFrame(raf2); };
  }, [layoutMode, showSkillsSidebar, showToolsPanel]);

  // Compute container styles based on layout mode
  const isWindow = layoutMode === 'window';

  const containerStyle: React.CSSProperties = isWindow
    ? { position: 'absolute', left: win.x, top: win.y, width: win.width, height: win.height, zIndex: 10 }
    : layoutMode === 'splitter'
      ? { flex: '1 1 100%', minWidth: 200, height: '100%' }
      : { width: '100%', height: '100%' };

  const containerClass = isWindow
    ? `rounded-lg overflow-hidden flex flex-col shadow-lg border-2 transition-colors ${resizing ? 'border-primary/60' : 'border-border'}`
    : 'rounded-lg border-2 border-primary/60 overflow-hidden flex flex-col shadow-[0_0_30px_rgba(201,162,39,0.3)] ring-1 ring-primary/20';

  const headerClass = isWindow
    ? 'window-drag-handle flex-shrink-0 flex items-center justify-between px-3 py-1.5 bg-card/90 border-b border-border cursor-move select-none'
    : 'flex-shrink-0 flex items-center justify-between px-3 py-2 bg-card/90 border-b border-primary/60 bg-gradient-to-r from-primary/10 via-card to-primary/10 shadow-[0_2px_12px_rgba(201,162,39,0.25)]';

  return (
    <div className="w-full h-full flex flex-col bg-zinc-900">
      <MarketingHeader />
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar — Skills */}
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
          {/* Single terminal container — always same tree position, styling changes per mode */}
          <div
            onMouseDown={isWindow ? handleDrag : undefined}
            style={containerStyle}
            className={containerClass}
          >
            {/* Header */}
            <div className={headerClass}>
              <span className="text-xs font-medium text-muted-foreground">Marketing Terminal</span>
              {isWindow && (
                <span className="text-[10px] text-muted-foreground/50">drag to move · edges to resize</span>
              )}
            </div>

            {/* Terminal content — always at same tree position for stable ResizeObserver */}
            <div ref={termWrapperRef} className="flex-1 min-h-0 overflow-hidden relative">
              <MarketingTerminal />
            </div>

            {/* Resize handles (window mode only) */}
            {isWindow && (
              <>
                <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize bg-primary/5 hover:bg-primary/30 z-20" onMouseDown={(e) => handleResize(e, 'e')} />
                <div className="absolute left-0 right-0 bottom-0 h-2 cursor-ns-resize bg-primary/5 hover:bg-primary/30 z-20" onMouseDown={(e) => handleResize(e, 's')} />
                <div className="absolute right-0 bottom-0 w-4 h-4 cursor-nwse-resize bg-primary/15 hover:bg-primary/40 z-30 rounded-tl" onMouseDown={(e) => handleResize(e, 'se')} />
              </>
            )}
          </div>
        </div>

        {/* Right sidebar — Tools/Gallery */}
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
