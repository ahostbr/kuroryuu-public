/**
 * GitHub Desktop Commit Details Component
 * Shows full commit information when a commit is selected in History tab
 */

import { User, Calendar, GitCommit, FileText } from 'lucide-react';
import { useRepositoryStore } from '../../stores/repository-store';
import type { CommitDetails as CommitDetailsType, CommitFile } from '../../types/repository';

export function CommitDetails() {
  const {
    selectedCommit,
    selectedCommitDetails,
    isLoadingCommitDetails,
  } = useRepositoryStore();

  if (!selectedCommit) {
    return (
      <div className="ghd-diff-panel">
        <div className="ghd-empty-state">
          <GitCommit size={48} className="ghd-empty-state-icon" />
          <div className="ghd-empty-state-title">No commit selected</div>
          <div className="ghd-empty-state-description">
            Select a commit from the list to view its details
          </div>
        </div>
      </div>
    );
  }

  if (isLoadingCommitDetails) {
    return (
      <div className="ghd-diff-panel">
        <CommitHeader commit={selectedCommit} />
        <div className="ghd-loading" style={{ flex: 1 }}>
          <div className="ghd-spinner" />
        </div>
      </div>
    );
  }

  const details = selectedCommitDetails || selectedCommit;
  // Type guard for files - only CommitDetails has files array
  const hasFiles = (d: typeof details): d is CommitDetailsType =>
    d !== null && 'files' in d && Array.isArray((d as CommitDetailsType).files);

  return (
    <div className="ghd-commit-details">
      <CommitHeader commit={details} />
      <div className="ghd-commit-details-body">
        {/* Full message */}
        {details.message && String(details.message) !== details.summary && (
          <div className="ghd-commit-details-message">
            {String(details.message)}
          </div>
        )}

        {/* Files changed */}
        {hasFiles(details) && details.files.length > 0 && (
          <div className="ghd-commit-details-files">
            <div className="ghd-commit-details-files-header">
              Files changed ({details.files.length})
            </div>
            {details.files.map((file: CommitFile) => (
              <CommitFileItem key={file.path} file={file} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

interface CommitHeaderProps {
  commit: {
    summary: string;
    hash?: string;
    shortHash: string;
    author?: {
      name: string;
      email: string;
      date?: string;
    };
    timestamp?: number;
  };
}

function CommitHeader({ commit }: CommitHeaderProps) {
  // Format date
  const formatDate = (timestamp?: number, dateStr?: string) => {
    if (timestamp) {
      return new Date(timestamp).toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    if (dateStr) {
      return new Date(dateStr).toLocaleDateString('en-US', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    }
    return 'Unknown date';
  };

  return (
    <div className="ghd-commit-details-header">
      <div className="ghd-commit-details-title">
        {commit.summary}
      </div>
      <div className="ghd-commit-details-meta">
        {commit.author && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <User size={14} />
            <span>{commit.author.name}</span>
            <span style={{ color: 'var(--ghd-text-muted)' }}>
              &lt;{commit.author.email}&gt;
            </span>
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Calendar size={14} />
          <span>{formatDate(commit.timestamp, commit.author?.date)}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <GitCommit size={14} />
          <span style={{ fontFamily: 'var(--ghd-font-mono)' }}>
            {commit.shortHash}
          </span>
        </div>
      </div>
    </div>
  );
}

interface CommitFileItemProps {
  file: CommitFile;
}

function CommitFileItem({ file }: CommitFileItemProps) {
  const statusColors: Record<string, string> = {
    new: 'var(--ghd-status-new)',
    modified: 'var(--ghd-status-modified)',
    deleted: 'var(--ghd-status-deleted)',
    renamed: 'var(--ghd-status-renamed)',
  };

  return (
    <div
      className="ghd-file-item"
      style={{ cursor: 'default' }}
    >
      <FileText
        size={14}
        style={{ color: statusColors[file.status] || 'var(--ghd-text-muted)' }}
      />
      <div className="ghd-file-path" title={file.path}>
        {file.path}
      </div>
      <div style={{
        fontSize: 'var(--ghd-font-size-xs)',
        color: 'var(--ghd-text-muted)',
        display: 'flex',
        gap: '8px',
      }}>
        {file.additions > 0 && (
          <span style={{ color: 'var(--ghd-diff-add-text)' }}>
            +{file.additions}
          </span>
        )}
        {file.deletions > 0 && (
          <span style={{ color: 'var(--ghd-diff-del-text)' }}>
            -{file.deletions}
          </span>
        )}
      </div>
    </div>
  );
}
