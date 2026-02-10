/**
 * GitHub Desktop Commit Message Component
 * Summary input, description textarea, and commit button
 */

import { Users, Settings, User, Sparkles } from 'lucide-react';
import { useRepositoryStore } from '../../stores/repository-store';

interface CommitMessageProps {
  includedCount: number;
  branchName: string;
}

export function CommitMessage({ includedCount, branchName }: CommitMessageProps) {
  const {
    commitSummary,
    commitDescription,
    isCommitting,
    isSummarizing,
    commitError,
    changedFiles,
    setCommitSummary,
    setCommitDescription,
    createCommit,
    summarizeCommit,
  } = useRepositoryStore();

  const canCommit = commitSummary.trim().length > 0 && includedCount > 0 && !isCommitting;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (canCommit) {
      await createCommit();
    }
  };

  return (
    <form className="ghd-commit-box" onSubmit={handleSubmit}>
      {/* Summary row with avatar */}
      <div className="ghd-commit-summary">
        <div className="ghd-commit-avatar">
          <User size={16} style={{ color: 'var(--ghd-text-muted)' }} />
        </div>
        <input
          type="text"
          placeholder="Summary (required)"
          value={commitSummary}
          onChange={(e) => setCommitSummary(e.target.value)}
          disabled={isCommitting}
        />
      </div>

      {/* Description with action bar */}
      <div className="ghd-commit-description">
        <textarea
          placeholder="Description"
          value={commitDescription}
          onChange={(e) => setCommitDescription(e.target.value)}
          disabled={isCommitting}
        />
        <div className="ghd-commit-action-bar">
          <button
            type="button"
            className="ghd-commit-action-btn"
            title="Add co-authors"
          >
            <Users size={14} />
          </button>
          <button
            type="button"
            className="ghd-commit-action-btn"
            title="Commit options"
          >
            <Settings size={14} />
          </button>
          <button
            type="button"
            className="ghd-commit-action-btn"
            title="AI summarize commit"
            onClick={() => summarizeCommit()}
            disabled={isSummarizing || changedFiles.length === 0}
            style={{
              marginLeft: 'auto',
              ...(isSummarizing ? { color: 'var(--ghd-accent-gold)', opacity: 0.7 } : {}),
            }}
          >
            <Sparkles size={14} style={isSummarizing ? { animation: 'spin 1.5s linear infinite' } : undefined} />
          </button>
        </div>
      </div>

      {/* Error message */}
      {commitError && (
        <div style={{
          color: 'var(--ghd-text-danger)',
          fontSize: 'var(--ghd-font-size-sm)',
          marginBottom: 'var(--ghd-spacing-sm)',
        }}>
          {commitError}
        </div>
      )}

      {/* Commit button */}
      <button
        type="submit"
        className="ghd-commit-button"
        disabled={!canCommit}
      >
        {isCommitting
          ? 'Committing...'
          : includedCount > 0
            ? `Commit ${includedCount} file${includedCount !== 1 ? 's' : ''} to ${branchName}`
            : `Commit to ${branchName}`
        }
      </button>
    </form>
  );
}
