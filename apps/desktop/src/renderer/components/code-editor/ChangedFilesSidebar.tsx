/**
 * ChangedFilesSidebar - Git status sidebar with stage/unstage/commit functionality
 */

import { useCallback, useState, useEffect } from 'react';
import { useCodeEditorStore, type GitFile } from '../../stores/code-editor-store';
import { toast } from '../ui/toaster';
import {
  FileText,
  FilePlus,
  FileX,
  FileQuestion,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Plus,
  Minus,
  Check,
  X,
  GitCommit,
  PlusCircle,
  MinusCircle,
  Diff,
} from 'lucide-react';

interface FileGroupProps {
  title: string;
  files: GitFile[];
  defaultOpen?: boolean;
  onFileClick: (file: GitFile) => void;
  onStage?: (file: GitFile) => void;
  onUnstage?: (file: GitFile) => void;
  onViewDiff?: (file: GitFile) => void;
  showStageButton?: boolean;
  showUnstageButton?: boolean;
}

function FileGroup({
  title,
  files,
  defaultOpen = true,
  onFileClick,
  onStage,
  onUnstage,
  onViewDiff,
  showStageButton,
  showUnstageButton,
}: FileGroupProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  if (files.length === 0) return null;

  return (
    <div className="mb-2">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-1 w-full px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        <span>{title}</span>
        <span className="ml-auto text-muted-foreground/60">({files.length})</span>
      </button>

      {isOpen && (
        <div className="ml-2">
          {files.map((file) => (
            <FileItem
              key={file.path}
              file={file}
              onClick={() => onFileClick(file)}
              onStage={showStageButton ? () => onStage?.(file) : undefined}
              onUnstage={showUnstageButton ? () => onUnstage?.(file) : undefined}
              onViewDiff={onViewDiff ? () => onViewDiff(file) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface FileItemProps {
  file: GitFile;
  onClick: () => void;
  onStage?: () => void;
  onUnstage?: () => void;
  onViewDiff?: () => void;
}

function FileItem({ file, onClick, onStage, onUnstage, onViewDiff }: FileItemProps) {
  const fileName = file.path.split('/').pop() || file.path;
  const dirPath = file.path.includes('/') ? file.path.substring(0, file.path.lastIndexOf('/')) : '';

  // Status icon and color
  const StatusIcon = {
    M: FileText,
    A: FilePlus,
    D: FileX,
    '?': FileQuestion,
    R: FileText,
  }[file.status] || FileText;

  const statusColor = {
    M: 'text-yellow-500',
    A: 'text-green-500',
    D: 'text-red-500',
    '?': 'text-blue-500',
    R: 'text-purple-500',
  }[file.status] || 'text-muted-foreground';

  return (
    <div className="flex items-center gap-1 w-full px-2 py-1 text-sm hover:bg-muted/50 rounded transition-colors group">
      <button
        onClick={onClick}
        className="flex items-center gap-2 flex-1 text-left truncate"
      >
        <StatusIcon className={`w-4 h-4 flex-shrink-0 ${statusColor}`} />
        <div className="flex-1 truncate">
          <span className="text-foreground">{fileName}</span>
          {dirPath && (
            <span className="text-muted-foreground/60 text-xs ml-1">{dirPath}</span>
          )}
        </div>
      </button>
      <span className={`text-xs font-mono ${statusColor}`}>{file.status}</span>

      {/* Action buttons */}
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {onViewDiff && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onViewDiff();
            }}
            className="p-0.5 rounded hover:bg-blue-500/20 text-blue-500 transition-colors"
            title="View diff"
          >
            <Diff className="w-3.5 h-3.5" />
          </button>
        )}
        {onStage && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStage();
            }}
            className="p-0.5 rounded hover:bg-green-500/20 text-green-500 transition-colors"
            title="Stage file"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        )}
        {onUnstage && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onUnstage();
            }}
            className="p-0.5 rounded hover:bg-red-500/20 text-red-500 transition-colors"
            title="Unstage file"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// Conventional commit types
const COMMIT_TYPES = [
  { value: '', label: 'No prefix', description: 'Plain commit message' },
  { value: 'feat', label: 'feat', description: 'A new feature' },
  { value: 'fix', label: 'fix', description: 'A bug fix' },
  { value: 'docs', label: 'docs', description: 'Documentation changes' },
  { value: 'style', label: 'style', description: 'Code style (formatting, etc)' },
  { value: 'refactor', label: 'refactor', description: 'Code refactoring' },
  { value: 'perf', label: 'perf', description: 'Performance improvements' },
  { value: 'test', label: 'test', description: 'Adding/updating tests' },
  { value: 'build', label: 'build', description: 'Build system changes' },
  { value: 'ci', label: 'ci', description: 'CI/CD changes' },
  { value: 'chore', label: 'chore', description: 'Other changes' },
];

interface CommitBoxProps {
  onCommit: (message: string) => Promise<void>;
  onAmend: (message: string) => Promise<void>;
  disabled: boolean;
  stagedCount: number;
  lastCommitMessage?: string;
}

function CommitBox({ onCommit, onAmend, disabled, stagedCount, lastCommitMessage }: CommitBoxProps) {
  const [message, setMessage] = useState('');
  const [isCommitting, setIsCommitting] = useState(false);
  const [isAmend, setIsAmend] = useState(false);
  const [commitType, setCommitType] = useState('');
  const [showTypeDropdown, setShowTypeDropdown] = useState(false);

  // When amend is toggled on, pre-fill with last commit message
  const handleAmendToggle = () => {
    const newAmend = !isAmend;
    setIsAmend(newAmend);
    if (newAmend && lastCommitMessage && !message) {
      setMessage(lastCommitMessage);
    }
  };

  const handleCommit = async () => {
    if (!message.trim()) return;
    if (!isAmend && disabled) return;

    setIsCommitting(true);
    try {
      // Build final message with type prefix
      const finalMessage = commitType
        ? `${commitType}: ${message.trim()}`
        : message.trim();

      if (isAmend) {
        await onAmend(finalMessage);
      } else {
        await onCommit(finalMessage);
      }
      setMessage('');
      setCommitType('');
      setIsAmend(false);
    } finally {
      setIsCommitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleCommit();
    }
  };

  const selectedType = COMMIT_TYPES.find(t => t.value === commitType);
  const canCommit = message.trim() && (isAmend || !disabled);

  return (
    <div className="border-t border-border p-2 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <GitCommit className="w-3.5 h-3.5" />
          <span>Commit ({stagedCount} staged)</span>
        </div>
      </div>

      {/* Commit type dropdown */}
      <div className="relative">
        <button
          onClick={() => setShowTypeDropdown(!showTypeDropdown)}
          className="w-full flex items-center justify-between px-2 py-1.5 text-xs bg-background border border-border rounded hover:border-muted-foreground/50 transition-colors"
        >
          <span className={commitType ? 'text-primary font-medium' : 'text-muted-foreground'}>
            {selectedType?.label || 'Select type (optional)'}
          </span>
          <ChevronDown className={`w-3 h-3 text-muted-foreground transition-transform ${showTypeDropdown ? 'rotate-180' : ''}`} />
        </button>

        {showTypeDropdown && (
          <div className="absolute z-10 top-full left-0 right-0 mt-1 py-1 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
            {COMMIT_TYPES.map((type) => (
              <button
                key={type.value}
                onClick={() => {
                  setCommitType(type.value);
                  setShowTypeDropdown(false);
                }}
                className={`w-full px-2 py-1.5 text-left text-xs hover:bg-muted transition-colors ${
                  type.value === commitType ? 'bg-primary/10 text-primary' : ''
                }`}
              >
                <span className="font-medium">{type.label || '(none)'}</span>
                <span className="text-muted-foreground ml-2">{type.description}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Message input */}
      <textarea
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={isAmend ? 'Amend commit message...' : 'Commit message...'}
        className="w-full h-16 px-2 py-1.5 text-sm bg-background border border-border rounded resize-none focus:outline-none focus:ring-1 focus:ring-primary"
        disabled={isCommitting}
      />

      {/* Preview of final message */}
      {message.trim() && commitType && (
        <div className="text-xs text-muted-foreground px-1">
          Preview: <span className="text-primary">{commitType}:</span> {message.trim().substring(0, 40)}...
        </div>
      )}

      {/* Amend checkbox */}
      <label className="flex items-center gap-2 text-xs cursor-pointer group">
        <input
          type="checkbox"
          checked={isAmend}
          onChange={handleAmendToggle}
          className="w-3.5 h-3.5 rounded border-border accent-primary cursor-pointer"
        />
        <span className="text-muted-foreground group-hover:text-foreground transition-colors">
          Amend last commit
        </span>
        {isAmend && lastCommitMessage && (
          <span className="text-muted-foreground/60 truncate max-w-[120px]" title={lastCommitMessage}>
            ({lastCommitMessage.substring(0, 20)}...)
          </span>
        )}
      </label>

      {/* Commit button */}
      <button
        onClick={handleCommit}
        disabled={!canCommit || isCommitting}
        className="w-full py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
      >
        {isCommitting ? (
          <>
            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            {isAmend ? 'Amending...' : 'Committing...'}
          </>
        ) : (
          <>
            <Check className="w-3.5 h-3.5" />
            {isAmend ? 'Amend Commit' : 'Commit'}
          </>
        )}
      </button>

      <p className="text-xs text-muted-foreground text-center">Ctrl+Enter to commit</p>
    </div>
  );
}

export function ChangedFilesSidebar() {
  const {
    changedFiles,
    isRefreshing,
    watcherStatus,
    refreshGitStatus,
    projectRoot,
    openFile,
    stageFile,
    unstageFile,
    stageAll,
    unstageAll,
    commit,
    commitAmend,
    setDiffViewFile,
    lastCommit,
    fetchLastCommit,
  } = useCodeEditorStore();

  // Fetch last commit on mount for amend feature
  useEffect(() => {
    fetchLastCommit();
  }, [fetchLastCommit]);

  // Group files by status
  const stagedFiles = changedFiles.filter(f => f.staged);
  const modifiedFiles = changedFiles.filter(f => !f.staged && f.status === 'M');
  const untrackedFiles = changedFiles.filter(f => !f.staged && f.status === '?');
  const otherFiles = changedFiles.filter(
    f => !f.staged && f.status !== 'M' && f.status !== '?'
  );
  const unstagedFiles = [...modifiedFiles, ...untrackedFiles, ...otherFiles];

  // Handle file click - load file and open it
  const handleFileClick = useCallback(async (file: GitFile) => {
    const fullPath = `${projectRoot}/${file.path}`;
    try {
      const content = await window.electronAPI?.fs?.readFile?.(fullPath);
      if (typeof content === 'string') {
        openFile(fullPath, content);
      }
    } catch (err) {
      console.error('[ChangedFilesSidebar] Failed to load file:', err);
      toast.error('Failed to load file');
    }
  }, [projectRoot, openFile]);

  // Stage a single file
  const handleStage = useCallback(async (file: GitFile) => {
    const success = await stageFile(file.path);
    if (success) {
      toast.success(`Staged: ${file.path.split('/').pop()}`);
    } else {
      toast.error('Failed to stage file');
    }
  }, [stageFile]);

  // Unstage a single file
  const handleUnstage = useCallback(async (file: GitFile) => {
    const success = await unstageFile(file.path);
    if (success) {
      toast.success(`Unstaged: ${file.path.split('/').pop()}`);
    } else {
      toast.error('Failed to unstage file');
    }
  }, [unstageFile]);

  // Stage all files
  const handleStageAll = useCallback(async () => {
    const success = await stageAll();
    if (success) {
      toast.success('Staged all files');
    } else {
      toast.error('Failed to stage all files');
    }
  }, [stageAll]);

  // Unstage all files
  const handleUnstageAll = useCallback(async () => {
    const success = await unstageAll();
    if (success) {
      toast.success('Unstaged all files');
    } else {
      toast.error('Failed to unstage all files');
    }
  }, [unstageAll]);

  // Commit staged files
  const handleCommit = useCallback(async (message: string) => {
    const result = await commit(message);
    if (result.ok) {
      toast.success('Committed successfully');
    } else {
      toast.error(`Commit failed: ${result.error}`);
    }
  }, [commit]);

  // Amend last commit
  const handleAmend = useCallback(async (message: string) => {
    const result = await commitAmend(message);
    if (result.ok) {
      toast.success('Commit amended successfully');
    } else {
      toast.error(`Amend failed: ${result.error}`);
    }
  }, [commitAmend]);

  // View diff for a file
  const handleViewDiff = useCallback((file: GitFile) => {
    setDiffViewFile(file);
  }, [setDiffViewFile]);

  // Watcher status indicator
  const watcherIndicator = {
    idle: '○',
    watching: '⟳',
    syncing: '↻',
    'changes-detected': '⚠',
  }[watcherStatus];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Source Control
        </span>
        <button
          onClick={() => refreshGitStatus()}
          disabled={isRefreshing}
          className="p-1 rounded hover:bg-muted transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Watcher status */}
      <div className="px-3 py-1.5 text-xs text-muted-foreground border-b border-border/50">
        <span>{watcherIndicator} {watcherStatus === 'watching' ? 'Watching...' : watcherStatus}</span>
      </div>

      {/* Bulk actions */}
      {changedFiles.length > 0 && (
        <div className="flex items-center justify-end gap-1 px-3 py-1.5 border-b border-border/50">
          {unstagedFiles.length > 0 && (
            <button
              onClick={handleStageAll}
              className="flex items-center gap-1 px-2 py-0.5 text-xs text-green-500 hover:bg-green-500/10 rounded transition-colors"
              title="Stage all"
            >
              <PlusCircle className="w-3 h-3" />
              Stage All
            </button>
          )}
          {stagedFiles.length > 0 && (
            <button
              onClick={handleUnstageAll}
              className="flex items-center gap-1 px-2 py-0.5 text-xs text-red-500 hover:bg-red-500/10 rounded transition-colors"
              title="Unstage all"
            >
              <MinusCircle className="w-3 h-3" />
              Unstage All
            </button>
          )}
        </div>
      )}

      {/* File list */}
      <div className="flex-1 overflow-y-auto py-2">
        {changedFiles.length === 0 ? (
          <div className="px-3 py-4 text-center text-xs text-muted-foreground">
            <p>No changes detected</p>
          </div>
        ) : (
          <>
            <FileGroup
              title="Staged Changes"
              files={stagedFiles}
              onFileClick={handleFileClick}
              onUnstage={handleUnstage}
              onViewDiff={handleViewDiff}
              showUnstageButton
            />
            <FileGroup
              title="Modified"
              files={modifiedFiles}
              onFileClick={handleFileClick}
              onStage={handleStage}
              onViewDiff={handleViewDiff}
              showStageButton
            />
            <FileGroup
              title="Untracked"
              files={untrackedFiles}
              onFileClick={handleFileClick}
              onStage={handleStage}
              showStageButton
            />
            <FileGroup
              title="Other"
              files={otherFiles}
              defaultOpen={false}
              onFileClick={handleFileClick}
              onStage={handleStage}
              onViewDiff={handleViewDiff}
              showStageButton
            />
          </>
        )}
      </div>

      {/* Commit box */}
      <CommitBox
        onCommit={handleCommit}
        onAmend={handleAmend}
        disabled={stagedFiles.length === 0}
        stagedCount={stagedFiles.length}
        lastCommitMessage={lastCommit?.subject}
      />

      {/* Footer with count */}
      <div className="px-3 py-1.5 text-xs text-muted-foreground border-t border-border">
        {changedFiles.length} file{changedFiles.length !== 1 ? 's' : ''} changed
      </div>
    </div>
  );
}
