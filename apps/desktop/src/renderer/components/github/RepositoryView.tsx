/**
 * GitHub Desktop Repository View Component
 * Main container that orchestrates all GitHub Desktop clone components
 */

import { useEffect } from 'react';
import { useRepositoryStore } from '../../stores/repository-store';
import { Toolbar } from './Toolbar';
import { TabBar } from './TabBar';
import { ChangesSidebar } from './ChangesSidebar';
import { DiffViewer } from './DiffViewer';
import { HistorySidebar } from './HistorySidebar';
import { CommitDetails } from './CommitDetails';

// Import the CSS
import '../../styles/github-desktop.css';

interface RepositoryViewProps {
  worktreesContent?: React.ReactNode;
}

export function RepositoryView({ worktreesContent }: RepositoryViewProps) {
  const {
    activeTab,
    changedFiles,
    initialize,
    refreshStatus,
  } = useRepositoryStore();

  // Initialize on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Auto-refresh git status every 10 seconds
  useEffect(() => {
    const interval = setInterval(refreshStatus, 10_000);
    return () => clearInterval(interval);
  }, [refreshStatus]);

  return (
    <div className="ghd-repository-view">
      {/* Top Toolbar */}
      <Toolbar />

      {/* Tab Bar + Main Content */}
      <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        {/* Tab bar spans both sidebar and content */}
        <TabBar changedFilesCount={changedFiles.length} />

        {/* Main content area */}
        <div className="ghd-main-content">
          {activeTab === 'changes' && (
            <>
              <ChangesSidebar />
              <DiffViewer />
            </>
          )}

          {activeTab === 'history' && (
            <>
              <HistorySidebar />
              <CommitDetails />
            </>
          )}

          {activeTab === 'worktrees' && (
            <div style={{ flex: 1, overflow: 'auto' }}>
              {worktreesContent}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Re-export components for individual use
export { Toolbar } from './Toolbar';
export { TabBar } from './TabBar';
export { ChangesSidebar } from './ChangesSidebar';
export { ChangedFileItem } from './ChangedFileItem';
export { CommitMessage } from './CommitMessage';
export { DiffViewer } from './DiffViewer';
export { HistorySidebar } from './HistorySidebar';
export { CommitDetails } from './CommitDetails';
