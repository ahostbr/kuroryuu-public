import { Settings2, LayoutGrid, GripVertical, Layers, PanelLeftOpen } from 'lucide-react';
import { SkillsDropdown } from './SkillsDropdown';
import type { WorkspaceSkill, WorkspaceState } from './types';

interface WorkspaceHeaderProps {
  title: string;
  skills?: WorkspaceSkill[];
  skillPathPrefix?: string;
  terminalPtyId?: string | null;
  headerExtra?: React.ReactNode;
  onSettings?: () => void;
  state: WorkspaceState;
}

export function WorkspaceHeader({
  title,
  skills,
  skillPathPrefix,
  terminalPtyId,
  headerExtra,
  onSettings,
  state,
}: WorkspaceHeaderProps) {
  const { layoutMode, setLayoutMode, showToolNav, setShowToolNav } = state;

  return (
    <div className="bg-zinc-800 border-b border-zinc-700 px-4 py-3">
      <div className="flex items-center justify-between">
        {/* Left: Title + optional expand + skills dropdown */}
        <div className="flex items-center gap-3">
          {!showToolNav && (
            <button
              onClick={() => setShowToolNav(true)}
              className="p-1.5 rounded transition-colors text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700"
              title="Show tool nav"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button>
          )}
          <h1 className="text-xl font-bold text-amber-500">{title}</h1>
          {skills && skills.length > 0 && (
            <>
              <div className="w-px h-5 bg-zinc-600" />
              <SkillsDropdown
                skills={skills}
                pathPrefix={skillPathPrefix || ''}
                terminalPtyId={terminalPtyId || null}
              />
            </>
          )}
        </div>

        {/* Right: extra + layout toggle + settings */}
        <div className="flex items-center gap-2">
          {headerExtra}

          {/* Layout Mode Toggle */}
          <div className="relative group">
            <button
              onClick={() => {
                const modes: ('grid' | 'splitter' | 'window')[] = ['grid', 'splitter', 'window'];
                const idx = modes.indexOf(layoutMode);
                setLayoutMode(modes[(idx + 1) % modes.length]);
              }}
              className="p-1.5 rounded transition-colors text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700"
              title={`Layout: ${layoutMode.charAt(0).toUpperCase() + layoutMode.slice(1)}`}
            >
              {layoutMode === 'grid' && <LayoutGrid className="w-4 h-4" />}
              {layoutMode === 'splitter' && <GripVertical className="w-4 h-4" />}
              {layoutMode === 'window' && <Layers className="w-4 h-4" />}
            </button>
            <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 px-1.5 py-0.5 text-[10px] font-medium
              bg-zinc-800 border border-zinc-600 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
              {layoutMode}
            </div>
          </div>

          {onSettings && (
            <>
              <div className="w-px h-5 bg-zinc-600" />
              <button
                onClick={onSettings}
                className="p-2 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 rounded transition-colors"
                title="Settings"
              >
                <Settings2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
