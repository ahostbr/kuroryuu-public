/**
 * GitHub Desktop Tab Bar Component
 * Three tabs: Changes | History | Worktrees
 */

import { useRepositoryStore } from '../../stores/repository-store';
import type { ActiveTab } from '../../types/repository';

interface TabBarProps {
  changedFilesCount: number;
}

export function TabBar({ changedFilesCount }: TabBarProps) {
  const { activeTab, setActiveTab } = useRepositoryStore();

  const tabs: { id: ActiveTab; label: string; badge?: number }[] = [
    { id: 'changes', label: 'Changes', badge: changedFilesCount > 0 ? changedFilesCount : undefined },
    { id: 'history', label: 'History' },
    { id: 'worktrees', label: 'Worktrees' },
  ];

  return (
    <div className="ghd-tabbar">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className={`ghd-tab ${activeTab === tab.id ? 'active' : ''}`}
          onClick={() => setActiveTab(tab.id)}
        >
          <span>{tab.label}</span>
          {tab.badge !== undefined && (
            <span className="ghd-tab-badge">{tab.badge}</span>
          )}
        </button>
      ))}
    </div>
  );
}
