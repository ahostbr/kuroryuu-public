/**
 * ActivityBar - VS Code-style vertical activity bar
 * Fixed 48px width, icons at 24px, active indicator on left border
 */

import { useState } from 'react';
import {
  Files,
  Search,
  GitBranch,
  Package,
  Settings,
  Bot,
  ListTodo,
  Network,
  Code2,
  MapPin,
} from 'lucide-react';

export type ActivityView =
  | 'explorer'
  | 'search'
  | 'git'
  | 'extensions'
  | 'ai'
  | 'todos'
  | 'graph'
  | 'outline'
  | 'refs';

interface ActivityBarProps {
  activeView: ActivityView | null;
  onViewChange: (view: ActivityView | null) => void;
  isAIActive?: boolean; // AI panel has independent state
}

interface ActivityItem {
  id: ActivityView;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  shortcut?: string;
  badge?: number;
}

// Main activity items (top section)
const mainActivities: ActivityItem[] = [
  { id: 'explorer', icon: Files, label: 'Explorer', shortcut: 'Ctrl+Shift+E' },
  { id: 'search', icon: Search, label: 'Search', shortcut: 'Ctrl+Shift+F' },
  { id: 'git', icon: GitBranch, label: 'Source Control', shortcut: 'Ctrl+Shift+G' },
  { id: 'todos', icon: ListTodo, label: 'TODOs', shortcut: 'Ctrl+Shift+T' },
  { id: 'outline', icon: Code2, label: 'Outline', shortcut: 'Ctrl+Shift+O' },
  { id: 'refs', icon: MapPin, label: 'References' },
  { id: 'graph', icon: Network, label: 'Import Graph' },
  { id: 'ai', icon: Bot, label: 'AI Chat', shortcut: 'Ctrl+Shift+A' },
];

// Bottom section items
const bottomActivities: ActivityItem[] = [
  { id: 'extensions', icon: Package, label: 'Extensions' },
];

export function ActivityBar({ activeView, onViewChange, isAIActive }: ActivityBarProps) {
  const [hoveredItem, setHoveredItem] = useState<ActivityView | null>(null);

  const handleClick = (view: ActivityView) => {
    // Toggle: click same view to close, or switch to new view
    onViewChange(activeView === view ? null : view);
  };

  const renderItem = (item: ActivityItem) => {
    // AI has independent active state
    const isActive = item.id === 'ai' ? isAIActive : activeView === item.id;
    const isHovered = hoveredItem === item.id;
    const Icon = item.icon;

    return (
      <div
        key={item.id}
        className="relative w-12 h-12 flex items-center justify-center cursor-pointer group"
        onClick={() => handleClick(item.id)}
        onMouseEnter={() => setHoveredItem(item.id)}
        onMouseLeave={() => setHoveredItem(null)}
        title={item.shortcut ? `${item.label} (${item.shortcut})` : item.label}
      >
        {/* Active indicator - left border */}
        {isActive && (
          <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-primary" />
        )}

        {/* Icon */}
        <Icon
          className={`w-6 h-6 transition-colors ${
            isActive
              ? 'text-foreground'
              : isHovered
              ? 'text-foreground'
              : 'text-muted-foreground'
          }`}
        />

        {/* Badge */}
        {item.badge && item.badge > 0 && (
          <div className="absolute top-1 right-1 min-w-4 h-4 px-1 text-[9px] font-semibold rounded-full bg-primary text-primary-foreground flex items-center justify-center">
            {item.badge > 99 ? '99+' : item.badge}
          </div>
        )}

        {/* Hover tooltip (appears on right) */}
        {isHovered && (
          <div className="absolute left-12 top-1/2 -translate-y-1/2 z-50 pointer-events-none">
            <div className="bg-popover text-popover-foreground text-xs px-2 py-1 rounded shadow-lg border border-border whitespace-nowrap">
              {item.label}
              {item.shortcut && (
                <span className="ml-2 text-muted-foreground">{item.shortcut}</span>
              )}
            </div>
          </div>
        )}

        {/* Active background */}
        {isActive && (
          <div className="absolute inset-0 bg-primary/10 pointer-events-none" />
        )}
      </div>
    );
  };

  return (
    <div className="w-12 h-full flex flex-col bg-card border-r border-border">
      {/* Main activities (top) */}
      <div className="flex flex-col flex-1">
        {mainActivities.map(renderItem)}
      </div>

      {/* Bottom activities (settings, etc.) */}
      <div className="flex flex-col border-t border-border">
        {bottomActivities.map(renderItem)}

        {/* Settings (always at bottom, not a view toggle) */}
        <div
          className="relative w-12 h-12 flex items-center justify-center cursor-pointer group"
          onMouseEnter={() => setHoveredItem('extensions')}
          onMouseLeave={() => setHoveredItem(null)}
          title="Settings"
        >
          <Settings
            className={`w-6 h-6 transition-colors ${
              hoveredItem === 'extensions'
                ? 'text-foreground'
                : 'text-muted-foreground'
            }`}
          />
        </div>
      </div>
    </div>
  );
}
