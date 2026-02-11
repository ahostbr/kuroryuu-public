import { useMarketingStore } from '../../stores/marketing-store';
import { MARKETING_PHASES } from '../../types/marketing';
import { Settings2, LayoutGrid, Layers } from 'lucide-react';

export function MarketingHeader() {
  const activePhase = useMarketingStore((s) => s.activePhase);
  const setActivePhase = useMarketingStore((s) => s.setActivePhase);
  const viewMode = useMarketingStore((s) => s.viewMode);
  const setViewMode = useMarketingStore((s) => s.setViewMode);
  const activeTab = useMarketingStore((s) => s.activeTab);
  const setActiveTab = useMarketingStore((s) => s.setActiveTab);
  const setSetupComplete = useMarketingStore((s) => s.setSetupComplete);

  return (
    <div className="bg-zinc-800 border-b border-zinc-700 px-4 py-3">
      <div className="flex items-center justify-between">
        {/* Left: Title + Phase Breadcrumb */}
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-bold text-amber-500">Marketing</h1>
          <div className="flex items-center gap-1">
            {MARKETING_PHASES.map((phase, idx) => (
              <div key={phase.id} className="flex items-center">
                <button
                  onClick={() => setActivePhase(phase.id)}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                    activePhase === phase.id
                      ? 'bg-amber-500 text-zinc-900'
                      : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700'
                  }`}
                >
                  {phase.label}
                </button>
                {idx < MARKETING_PHASES.length - 1 && (
                  <span className="text-zinc-600 mx-1">›</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right: View mode toggle + Settings */}
        <div className="flex items-center gap-2">
          {/* Tab selector (for tabbed view) */}
          {viewMode === 'tabbed' && (
            <div className="flex items-center gap-1 bg-zinc-900 rounded p-1">
              <button
                onClick={() => setActiveTab('terminal')}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  activeTab === 'terminal'
                    ? 'bg-amber-500 text-zinc-900'
                    : 'text-zinc-400 hover:text-zinc-100'
                }`}
              >
                Terminal
              </button>
              <button
                onClick={() => setActiveTab('tools')}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  activeTab === 'tools'
                    ? 'bg-amber-500 text-zinc-900'
                    : 'text-zinc-400 hover:text-zinc-100'
                }`}
              >
                Tools
              </button>
              <button
                onClick={() => setActiveTab('gallery')}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  activeTab === 'gallery'
                    ? 'bg-amber-500 text-zinc-900'
                    : 'text-zinc-400 hover:text-zinc-100'
                }`}
              >
                Gallery
              </button>
            </div>
          )}

          {/* View mode toggle */}
          <div className="flex items-center gap-1 bg-zinc-900 rounded p-1">
            <button
              onClick={() => setViewMode('split')}
              className={`p-1.5 rounded transition-colors ${
                viewMode === 'split' ? 'bg-amber-500 text-zinc-900' : 'text-zinc-400 hover:text-zinc-100'
              }`}
              title="Split View"
            >
              <Layers className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('tabbed')}
              className={`p-1.5 rounded transition-colors ${
                viewMode === 'tabbed' ? 'bg-amber-500 text-zinc-900' : 'text-zinc-400 hover:text-zinc-100'
              }`}
              title="Tabbed View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>

          {/* Right panel toggle (for split view) */}
          {viewMode === 'split' && (
            <div className="flex items-center gap-1 bg-zinc-900 rounded p-1">
              <button
                onClick={() => setActiveTab('tools')}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  activeTab === 'tools'
                    ? 'bg-amber-500 text-zinc-900'
                    : 'text-zinc-400 hover:text-zinc-100'
                }`}
              >
                Tools
              </button>
              <button
                onClick={() => setActiveTab('gallery')}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  activeTab === 'gallery'
                    ? 'bg-amber-500 text-zinc-900'
                    : 'text-zinc-400 hover:text-zinc-100'
                }`}
              >
                Gallery
              </button>
            </div>
          )}

          {/* Settings (reopen wizard) */}
          <button
            onClick={() => setSetupComplete(false)}
            className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 rounded transition-colors"
            title="Setup Wizard"
          >
            <Settings2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
