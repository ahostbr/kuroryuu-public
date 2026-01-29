/**
 * GitHub Desktop Toolbar Component
 * Top navigation bar with repository dropdown, branch selector, and fetch button
 */

import { GitBranch, RefreshCw, ChevronDown } from 'lucide-react';
import { useRepositoryStore } from '../../stores/repository-store';

export function Toolbar() {
  const {
    repository,
    currentBranch,
    lastFetched,
    isFetching,
    fetchOrigin,
  } = useRepositoryStore();

  // Format relative time for "Last fetched X ago"
  const formatLastFetched = () => {
    if (!lastFetched) return 'Never fetched';

    const now = new Date();
    const diff = now.getTime() - lastFetched.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'Last fetched just now';
    if (minutes < 60) return `Last fetched ${minutes} minute${minutes !== 1 ? 's' : ''} ago`;
    if (hours < 24) return `Last fetched ${hours} hour${hours !== 1 ? 's' : ''} ago`;
    return `Last fetched ${days} day${days !== 1 ? 's' : ''} ago`;
  };

  return (
    <div className="ghd-toolbar">
      {/* Repository Section */}
      <div className="ghd-toolbar-section" style={{ minWidth: '180px' }}>
        <button className="ghd-toolbar-dropdown">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <span className="ghd-toolbar-dropdown-label">Current repository</span>
            <span className="ghd-toolbar-dropdown-value">
              {repository?.name || 'No repository'}
            </span>
          </div>
          <ChevronDown size={16} style={{ color: 'var(--ghd-text-secondary)' }} />
        </button>
      </div>

      {/* Branch Section */}
      <div className="ghd-toolbar-section" style={{ minWidth: '180px' }}>
        <button className="ghd-toolbar-dropdown">
          <GitBranch size={16} style={{ color: 'var(--ghd-text-secondary)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <span className="ghd-toolbar-dropdown-label">Current branch</span>
            <span className="ghd-toolbar-dropdown-value">
              {currentBranch?.name || 'No branch'}
            </span>
          </div>
          <ChevronDown size={16} style={{ color: 'var(--ghd-text-secondary)' }} />
        </button>
      </div>

      {/* Fetch Section */}
      <div className="ghd-toolbar-section" style={{ flex: 1, justifyContent: 'flex-start', borderRight: 'none' }}>
        <button
          className="ghd-toolbar-dropdown"
          onClick={fetchOrigin}
          disabled={isFetching}
          style={{ gap: '12px' }}
        >
          <RefreshCw
            size={16}
            style={{ color: 'var(--ghd-text-secondary)' }}
            className={isFetching ? 'animate-spin' : ''}
          />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
            <span className="ghd-toolbar-dropdown-value">
              {isFetching ? 'Fetching...' : 'Fetch origin'}
            </span>
            <span className="ghd-toolbar-dropdown-label">
              {formatLastFetched()}
            </span>
          </div>
        </button>
      </div>
    </div>
  );
}
