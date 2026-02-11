import { useState, useCallback } from 'react';
import { useMarketingStore } from '../../stores/marketing-store';
import { MarketingHeader } from './MarketingHeader';
import { MarketingTerminal } from './MarketingTerminal';
import { MarketingSkillPicker } from './MarketingSkillPicker';
import { MarketingToolPanel } from './MarketingToolPanel';
import { MarketingAssetGallery } from './MarketingAssetGallery';

function FloatingTerminalWindow() {
  const [win, setWin] = useState({ x: 20, y: 20, width: 700, height: 450 });

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
      className="rounded-lg border border-border overflow-hidden flex flex-col shadow-lg"
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

      {/* Resize handles */}
      <div className="absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize" onMouseDown={(e) => handleResize(e, 'e')} />
      <div className="absolute left-0 right-0 bottom-0 h-1 cursor-ns-resize" onMouseDown={(e) => handleResize(e, 's')} />
      <div className="absolute right-0 bottom-0 w-3 h-3 cursor-nwse-resize" onMouseDown={(e) => handleResize(e, 'se')} />
    </div>
  );
}

export function MarketingWorkspace() {
  const viewMode = useMarketingStore((s) => s.viewMode);
  const activeTab = useMarketingStore((s) => s.activeTab);

  if (viewMode === 'split') {
    return (
      <div className="w-full h-full flex flex-col bg-zinc-900">
        <MarketingHeader />
        <div className="flex-1 flex gap-4 p-4 overflow-hidden">
          {/* Left: Skill Picker + Floating Terminal */}
          <div className="flex-1 flex flex-col gap-4 min-w-0">
            <MarketingSkillPicker />
            <div className="flex-1 min-h-0 relative">
              <FloatingTerminalWindow />
            </div>
          </div>

          {/* Right: Tool Panel or Asset Gallery */}
          <div className="w-96 min-w-0">
            {activeTab === 'tools' && <MarketingToolPanel />}
            {activeTab === 'gallery' && <MarketingAssetGallery />}
          </div>
        </div>
      </div>
    );
  }

  // Tabbed view
  return (
    <div className="w-full h-full flex flex-col bg-zinc-900">
      <MarketingHeader />
      <div className="flex-1 p-4 overflow-hidden relative">
        {/* Terminal stays mounted, hidden via CSS to preserve PTY */}
        <div className={`absolute inset-0 p-4 flex flex-col gap-4 ${activeTab === 'terminal' ? '' : 'hidden pointer-events-none'}`}>
          <MarketingSkillPicker />
          <div className="flex-1 min-h-0 relative">
            <FloatingTerminalWindow />
          </div>
        </div>
        {activeTab === 'tools' && <MarketingToolPanel />}
        {activeTab === 'gallery' && <MarketingAssetGallery />}
      </div>
    </div>
  );
}
