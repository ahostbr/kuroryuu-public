import { useMarketingStore } from '../../stores/marketing-store';
import { MarketingHeader } from './MarketingHeader';
import { MarketingTerminal } from './MarketingTerminal';
import { MarketingSkillPicker } from './MarketingSkillPicker';
import { MarketingToolPanel } from './MarketingToolPanel';
import { MarketingAssetGallery } from './MarketingAssetGallery';

export function MarketingWorkspace() {
  const viewMode = useMarketingStore((s) => s.viewMode);
  const activeTab = useMarketingStore((s) => s.activeTab);

  if (viewMode === 'split') {
    return (
      <div className="w-full h-full flex flex-col bg-zinc-900">
        <MarketingHeader />
        <div className="flex-1 flex gap-4 p-4 overflow-hidden">
          {/* Left: Terminal + Skill Picker */}
          <div className="flex-1 flex flex-col gap-4 min-w-0">
            <MarketingSkillPicker />
            <div className="flex-1 min-h-0">
              <MarketingTerminal />
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
          <div className="flex-1 min-h-0">
            <MarketingTerminal />
          </div>
        </div>
        {activeTab === 'tools' && <MarketingToolPanel />}
        {activeTab === 'gallery' && <MarketingAssetGallery />}
      </div>
    </div>
  );
}
