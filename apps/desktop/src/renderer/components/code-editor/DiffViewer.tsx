/**
 * DiffViewer - Side-by-side diff using CodeMirror MergeView
 * Shows original (HEAD) vs modified (working tree) with syntax highlighting
 */

import { useEffect, useState, useMemo } from 'react';
import { useCodeEditorStore, type GitFile, getLanguageFromPath } from '../../stores/code-editor-store';
import { MergeViewWrapper } from './MergeViewWrapper';
import { X, RefreshCw, FileText, Plus, Minus, GitCompare, ToggleLeft, ToggleRight } from 'lucide-react';

interface DiffViewerProps {
  file: GitFile;
  onClose: () => void;
}

interface DiffStats {
  additions: number;
  deletions: number;
}

function calculateDiffStats(original: string, modified: string): DiffStats {
  const originalLines = original.split('\n');
  const modifiedLines = modified.split('\n');

  // Simple diff calculation (not perfect but good enough for stats)
  const originalSet = new Set(originalLines);
  const modifiedSet = new Set(modifiedLines);

  let additions = 0;
  let deletions = 0;

  // Count lines only in modified (additions)
  for (const line of modifiedLines) {
    if (!originalSet.has(line)) additions++;
  }

  // Count lines only in original (deletions)
  for (const line of originalLines) {
    if (!modifiedSet.has(line)) deletions++;
  }

  return { additions, deletions };
}

export function DiffViewer({ file, onClose }: DiffViewerProps) {
  const { projectRoot } = useCodeEditorStore();

  const [originalContent, setOriginalContent] = useState<string>('');
  const [modifiedContent, setModifiedContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'side-by-side' | 'unified'>('side-by-side');

  const fileName = file.path.split('/').pop() || file.path;
  const language = getLanguageFromPath(file.path);

  // Build full path
  const fullPath = useMemo(() => {
    if (file.path.includes(':') || file.path.startsWith('/')) {
      return file.path;
    }
    return projectRoot ? `${projectRoot}/${file.path}`.replace(/\\/g, '/') : file.path;
  }, [file.path, projectRoot]);

  // Load original (HEAD) and modified (working tree) content
  const loadDiffContent = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Get original content from HEAD
      const originalResult = await window.electronAPI?.git?.getFileAtRevision?.(fullPath, 'HEAD');

      // Get current file content (working tree)
      const modifiedResult = await window.electronAPI?.fs?.readFile?.(fullPath);

      if (originalResult?.ok) {
        setOriginalContent(originalResult.content);
      } else {
        // File might be new (untracked) - original is empty
        setOriginalContent('');
      }

      if (typeof modifiedResult === 'string') {
        setModifiedContent(modifiedResult);
      } else {
        // File might be deleted - modified is empty
        setModifiedContent('');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDiffContent();
  }, [fullPath]);

  // Calculate stats
  const stats = useMemo(() => {
    if (!originalContent && !modifiedContent) return { additions: 0, deletions: 0 };
    return calculateDiffStats(originalContent, modifiedContent);
  }, [originalContent, modifiedContent]);

  // Status labels based on file status
  const getStatusLabels = () => {
    switch (file.status) {
      case 'A':
        return { original: '(New file)', modified: 'Working Tree' };
      case 'D':
        return { original: 'HEAD', modified: '(Deleted)' };
      case '?':
        return { original: '(Untracked)', modified: 'Working Tree' };
      default:
        return { original: 'HEAD', modified: 'Working Tree' };
    }
  };

  const { original: originalLabel, modified: modifiedLabel } = getStatusLabels();

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/50">
        <div className="flex items-center gap-3">
          <GitCompare className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium">{fileName}</span>
          <span className="text-xs text-muted-foreground truncate max-w-[300px]">{file.path}</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Stats */}
          <div className="flex items-center gap-2 text-xs">
            <span className="flex items-center gap-1 text-green-400">
              <Plus className="w-3 h-3" />
              {stats.additions}
            </span>
            <span className="flex items-center gap-1 text-red-400">
              <Minus className="w-3 h-3" />
              {stats.deletions}
            </span>
          </div>

          {/* View mode toggle (future: unified view) */}
          {/* <button
            onClick={() => setViewMode(viewMode === 'side-by-side' ? 'unified' : 'side-by-side')}
            className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
              viewMode === 'side-by-side'
                ? 'bg-primary/20 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
            title={`Switch to ${viewMode === 'side-by-side' ? 'unified' : 'side-by-side'} view`}
          >
            {viewMode === 'side-by-side' ? (
              <ToggleRight className="w-4 h-4" />
            ) : (
              <ToggleLeft className="w-4 h-4" />
            )}
            {viewMode === 'side-by-side' ? 'Side-by-side' : 'Unified'}
          </button> */}

          {/* Refresh */}
          <button
            onClick={loadDiffContent}
            disabled={isLoading}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
            title="Refresh diff"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          {/* Close */}
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            title="Close diff view (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full text-red-500">
            <p>{error}</p>
          </div>
        ) : originalContent === '' && modifiedContent === '' ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <p>No changes to show</p>
          </div>
        ) : (
          <MergeViewWrapper
            originalContent={originalContent}
            modifiedContent={modifiedContent}
            language={language}
            originalLabel={originalLabel}
            modifiedLabel={modifiedLabel}
          />
        )}
      </div>
    </div>
  );
}
