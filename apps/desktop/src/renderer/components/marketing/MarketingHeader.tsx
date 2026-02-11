import { useMarketingStore } from '../../stores/marketing-store';
import { MARKETING_PHASES } from '../../types/marketing';
import { Settings2, Lightbulb, Wrench } from 'lucide-react';

export function MarketingHeader() {
  const activePhase = useMarketingStore((s) => s.activePhase);
  const setActivePhase = useMarketingStore((s) => s.setActivePhase);
  const showSkillsSidebar = useMarketingStore((s) => s.showSkillsSidebar);
  const setShowSkillsSidebar = useMarketingStore((s) => s.setShowSkillsSidebar);
  const showToolsPanel = useMarketingStore((s) => s.showToolsPanel);
  const setShowToolsPanel = useMarketingStore((s) => s.setShowToolsPanel);
  const toolsPanelTab = useMarketingStore((s) => s.toolsPanelTab);
  const setToolsPanelTab = useMarketingStore((s) => s.setToolsPanelTab);
  const setSetupComplete = useMarketingStore((s) => s.setSetupComplete);

  return (
    <div className="bg-zinc-800 border-b border-zinc-700 px-4 py-3">
      <div className="flex items-center justify-between">
        {/* Left: Skills toggle + Title + Phase Breadcrumb */}
        <div className="flex items-center gap-3">
          {/* Skills sidebar toggle */}
          <button
            onClick={() => setShowSkillsSidebar(!showSkillsSidebar)}
            className={`p-1.5 rounded transition-colors ${
              showSkillsSidebar
                ? 'bg-amber-500/20 text-amber-500'
                : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700'
            }`}
            title="Toggle Skills"
          >
            <Lightbulb className="w-4 h-4" />
          </button>

          <div className="w-px h-5 bg-zinc-600" />

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

        {/* Right: Tools panel toggle + tab switcher + Settings */}
        <div className="flex items-center gap-2">
          {/* Tools panel toggle */}
          <button
            onClick={() => setShowToolsPanel(!showToolsPanel)}
            className={`p-1.5 rounded transition-colors ${
              showToolsPanel
                ? 'bg-amber-500/20 text-amber-500'
                : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700'
            }`}
            title="Toggle Tools Panel"
          >
            <Wrench className="w-4 h-4" />
          </button>

          {/* Tools/Gallery tab switcher (visible when panel open) */}
          {showToolsPanel && (
            <div className="flex items-center gap-1 bg-zinc-900 rounded p-1">
              <button
                onClick={() => setToolsPanelTab('tools')}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  toolsPanelTab === 'tools'
                    ? 'bg-amber-500 text-zinc-900'
                    : 'text-zinc-400 hover:text-zinc-100'
                }`}
              >
                Tools
              </button>
              <button
                onClick={() => setToolsPanelTab('gallery')}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  toolsPanelTab === 'gallery'
                    ? 'bg-amber-500 text-zinc-900'
                    : 'text-zinc-400 hover:text-zinc-100'
                }`}
              >
                Gallery
              </button>
            </div>
          )}

          <div className="w-px h-5 bg-zinc-600" />

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
