/**
 * GitHub Desktop Diff Viewer Component
 * Shows file diff with line numbers and syntax highlighting
 */

import { Settings, FileCode } from 'lucide-react';
import { useRepositoryStore } from '../../stores/repository-store';
import type { DiffLine, FileDiff } from '../../types/repository';

export function DiffViewer() {
  const { selectedFile, selectedFileDiff, isLoadingDiff } = useRepositoryStore();

  if (!selectedFile) {
    return (
      <div className="ghd-diff-panel">
        <div className="ghd-empty-state">
          <FileCode size={48} className="ghd-empty-state-icon" />
          <div className="ghd-empty-state-title">No file selected</div>
          <div className="ghd-empty-state-description">
            Select a file from the list to view its changes
          </div>
        </div>
      </div>
    );
  }

  if (isLoadingDiff) {
    return (
      <div className="ghd-diff-panel">
        <DiffHeader path={selectedFile.path} />
        <div className="ghd-loading">
          <div className="ghd-spinner" />
        </div>
      </div>
    );
  }

  if (!selectedFileDiff) {
    return (
      <div className="ghd-diff-panel">
        <DiffHeader path={selectedFile.path} />
        <div className="ghd-empty-state">
          <div className="ghd-empty-state-description">
            Unable to load diff for this file
          </div>
        </div>
      </div>
    );
  }

  if (selectedFileDiff.isBinary) {
    return (
      <div className="ghd-diff-panel">
        <DiffHeader path={selectedFile.path} />
        <div className="ghd-empty-state">
          <div className="ghd-empty-state-title">Binary file</div>
          <div className="ghd-empty-state-description">
            Cannot display diff for binary files
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ghd-diff-panel">
      <DiffHeader
        path={selectedFile.path}
        additions={selectedFileDiff.additions}
        deletions={selectedFileDiff.deletions}
      />
      <div className="ghd-diff-content">
        {selectedFileDiff.hunks.map((hunk, hunkIndex) => (
          <DiffHunk key={hunkIndex} hunk={hunk} />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

interface DiffHeaderProps {
  path: string;
  additions?: number;
  deletions?: number;
}

function DiffHeader({ path, additions, deletions }: DiffHeaderProps) {
  return (
    <div className="ghd-diff-header">
      <div className="ghd-diff-filepath">
        {path}
        {additions !== undefined && deletions !== undefined && (
          <span style={{ marginLeft: '12px', fontSize: 'var(--ghd-font-size-xs)' }}>
            <span style={{ color: 'var(--ghd-diff-add-text)' }}>+{additions}</span>
            {' / '}
            <span style={{ color: 'var(--ghd-diff-del-text)' }}>-{deletions}</span>
          </span>
        )}
      </div>
      <div className="ghd-diff-actions">
        <button className="ghd-diff-action-btn" title="Diff options">
          <Settings size={14} />
        </button>
      </div>
    </div>
  );
}

interface DiffHunkProps {
  hunk: FileDiff['hunks'][0];
}

function DiffHunk({ hunk }: DiffHunkProps) {
  return (
    <div className="ghd-diff-hunk">
      <div className="ghd-diff-hunk-header">
        {hunk.header}
      </div>
      {hunk.lines.map((line, lineIndex) => (
        <DiffLineRow key={lineIndex} line={line} />
      ))}
    </div>
  );
}

interface DiffLineRowProps {
  line: DiffLine;
}

function DiffLineRow({ line }: DiffLineRowProps) {
  if (line.type === 'hunk') {
    return null; // Already rendered in header
  }

  return (
    <div className={`ghd-diff-line ${line.type}`}>
      <div className="ghd-diff-line-gutter">
        <div className="ghd-diff-line-number old">
          {line.type !== 'add' ? line.oldLineNumber || '' : ''}
        </div>
        <div className="ghd-diff-line-number new">
          {line.type !== 'delete' ? line.newLineNumber || '' : ''}
        </div>
      </div>
      <div className="ghd-diff-line-content">
        {line.type === 'add' && '+'}
        {line.type === 'delete' && '-'}
        {line.type === 'context' && ' '}
        {line.content}
      </div>
    </div>
  );
}
