/**
 * GitHub Desktop Changes Sidebar Component
 * File list with filter, staging controls, and commit message
 */

import { Filter, ChevronDown } from 'lucide-react';
import { useRepositoryStore } from '../../stores/repository-store';
import { ChangedFileItem } from './ChangedFileItem';
import { CommitMessage } from './CommitMessage';

export function ChangesSidebar() {
  const {
    changedFiles,
    selectedFile,
    filterText,
    setFilterText,
    selectFile,
    toggleFileStaged,
    stageAll,
    unstageAll,
    currentBranch,
    discardFileChanges,
  } = useRepositoryStore();

  // Filter files based on search text
  const filteredFiles = changedFiles.filter((file) =>
    file.path.toLowerCase().includes(filterText.toLowerCase())
  );

  // Calculate inclusion state
  const includedCount = changedFiles.filter((f) => f.included).length;
  const totalCount = changedFiles.length;
  const allIncluded = includedCount === totalCount;
  const noneIncluded = includedCount === 0;

  const handleCheckAllChange = () => {
    if (allIncluded) {
      unstageAll();
    } else {
      stageAll();
    }
  };

  return (
    <div className="ghd-sidebar">
      {/* Header with filter */}
      <div className="ghd-sidebar-header">
        <div className="ghd-filter-row">
          <button className="ghd-filter-button">
            <Filter size={14} />
            <ChevronDown size={12} />
          </button>
          <input
            type="text"
            className="ghd-filter-input"
            placeholder="Filter"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
          />
        </div>
        <div className="ghd-checkbox-row">
          <input
            type="checkbox"
            checked={allIncluded}
            ref={(el) => {
              if (el) {
                el.indeterminate = !allIncluded && !noneIncluded;
              }
            }}
            onChange={handleCheckAllChange}
          />
          <span>
            {totalCount} changed file{totalCount !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* File list */}
      <div className="ghd-file-list">
        {filteredFiles.length === 0 ? (
          <div className="ghd-empty-state" style={{ padding: '24px' }}>
            {filterText ? (
              <span>No files match your filter</span>
            ) : (
              <span>No changed files</span>
            )}
          </div>
        ) : (
          filteredFiles.map((file) => (
            <ChangedFileItem
              key={file.path}
              file={file}
              isSelected={selectedFile?.path === file.path}
              onSelect={() => selectFile(file)}
              onToggleIncluded={() => toggleFileStaged(file.path)}
              onDiscard={() => discardFileChanges(file.path)}
            />
          ))
        )}
      </div>

      {/* Commit message box */}
      <CommitMessage
        includedCount={includedCount}
        branchName={currentBranch?.name || 'master'}
      />
    </div>
  );
}
