import React from 'react';
import { PanelLeftClose } from 'lucide-react';
import type { WorkspaceTool, WorkspaceState } from './types';

interface WorkspaceNavProps {
  tools: WorkspaceTool[];
  state: WorkspaceState;
}

export function WorkspaceNav({ tools, state }: WorkspaceNavProps) {
  const { activeTool, showToolPanel, setActiveTool, setShowToolPanel, setShowToolNav } = state;

  const handleNavClick = (id: string) => {
    if (id === activeTool && showToolPanel) {
      setShowToolPanel(false);
    } else {
      setActiveTool(id);
      setShowToolPanel(true);
    }
  };

  const topTools = tools.filter(t => !t.bottom);
  const bottomTools = tools.filter(t => t.bottom);

  const renderNavItem = (item: WorkspaceTool) => {
    const Icon = item.icon;
    const isActive = activeTool === item.id && showToolPanel;

    return (
      <div
        key={item.id}
        className={`w-12 h-12 flex items-center justify-center cursor-pointer relative group ${
          isActive
            ? 'bg-amber-500/10 border-l-2 border-amber-500'
            : 'border-l-2 border-transparent hover:bg-zinc-700/50'
        }`}
        onClick={() => handleNavClick(item.id)}
      >
        <Icon
          className={`w-5 h-5 ${
            isActive ? 'text-amber-500' : 'text-zinc-400 group-hover:text-zinc-100'
          }`}
        />
        {/* Tooltip */}
        <div className="absolute left-full ml-2 hidden group-hover:block z-50 pointer-events-none">
          <div className="bg-zinc-800 border border-zinc-600 rounded px-2 py-1 text-xs text-zinc-100 whitespace-nowrap">
            {item.label}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="w-12 h-full flex flex-col bg-zinc-800 border-r border-zinc-700 flex-shrink-0">
      {topTools.map(renderNavItem)}

      {bottomTools.length > 0 && (
        <div className="mt-auto border-t border-zinc-700">
          {bottomTools.map(renderNavItem)}
        </div>
      )}

      {/* Collapse button */}
      <div
        className={`w-12 h-10 flex items-center justify-center cursor-pointer border-t border-zinc-700 hover:bg-zinc-700/50 group ${bottomTools.length === 0 ? 'mt-auto' : ''}`}
        onClick={() => setShowToolNav(false)}
      >
        <PanelLeftClose className="w-4 h-4 text-zinc-500 group-hover:text-zinc-300" />
      </div>
    </div>
  );
}
