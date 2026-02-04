/**
 * FileTreeCard - Rich visualization card for k_files results
 *
 * Displays:
 * - Collapsible tree view with folder/file icons
 * - File sizes (if available)
 * - Click to open file in editor
 * - Copy paths action
 */

import { useState, useCallback, useMemo } from 'react';
import {
  FolderTree,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Copy,
  Check,
  Folder,
  FolderOpen,
  FileCode,
  FileText,
  FileJson,
  FileImage,
  File,
  ExternalLink,
} from 'lucide-react';
import type { FileTreeData, FileTreeEntry } from '../../../types/insights';

interface FileTreeCardProps {
  data: FileTreeData;
  collapsed?: boolean;
}

// Get icon based on file extension
function getFileIcon(path: string): React.ElementType {
  // Split on both forward and back slashes to handle Windows paths
  const ext = path.split(/[/\\]/).pop()?.split('.').pop()?.toLowerCase() || '';

  // Code files
  if (['ts', 'tsx', 'js', 'jsx', 'py', 'rb', 'go', 'rs', 'java', 'c', 'cpp', 'h', 'cs', 'php', 'swift', 'kt'].includes(ext)) {
    return FileCode;
  }
  // JSON/Config
  if (['json', 'yaml', 'yml', 'toml', 'xml', 'ini', 'cfg'].includes(ext)) {
    return FileJson;
  }
  // Images
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp'].includes(ext)) {
    return FileImage;
  }
  // Text/Docs
  if (['md', 'txt', 'rst', 'doc', 'docx', 'pdf'].includes(ext)) {
    return FileText;
  }
  return File;
}

// Format file size
function formatSize(bytes?: number): string {
  if (bytes === undefined || bytes === null) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function FileItem({
  entry,
  depth = 0,
  onOpen
}: {
  entry: FileTreeEntry;
  depth?: number;
  onOpen: (path: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(depth < 2); // Auto-expand first 2 levels
  const isDirectory = entry.type === 'directory';
  const hasChildren = isDirectory && entry.children && entry.children.length > 0;

  const Icon = isDirectory
    ? (isExpanded ? FolderOpen : Folder)
    : getFileIcon(entry.path);

  const handleClick = () => {
    if (isDirectory && hasChildren) {
      setIsExpanded(!isExpanded);
    } else if (!isDirectory) {
      onOpen(entry.path);
    }
  };

  return (
    <div>
      <button
        onClick={handleClick}
        className="w-full flex items-center gap-1.5 px-2 py-1 rounded hover:bg-muted/30 transition-colors text-left group"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        title={entry.path}
      >
        {hasChildren ? (
          <span className="w-4 flex-shrink-0 text-muted-foreground">
            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </span>
        ) : (
          <span className="w-4 flex-shrink-0" />
        )}
        <Icon className={`w-4 h-4 flex-shrink-0 ${isDirectory ? 'text-yellow-400' : 'text-muted-foreground'}`} />
        <span className={`text-sm truncate ${isDirectory ? 'text-foreground font-medium' : 'text-foreground/80'}`}>
          {entry.path.split(/[/\\]/).pop() || entry.path}
        </span>
        {entry.size !== undefined && !isDirectory && (
          <span className="text-xs text-muted-foreground ml-auto">
            {formatSize(entry.size)}
          </span>
        )}
        {!isDirectory && (
          <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity ml-1" />
        )}
      </button>

      {/* Render children if expanded */}
      {isExpanded && hasChildren && (
        <div>
          {entry.children!.map((child, idx) => (
            <FileItem
              key={`${child.path}-${idx}`}
              entry={child}
              depth={depth + 1}
              onOpen={onOpen}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileTreeCard({ data, collapsed: initialCollapsed = false }: FileTreeCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);
  const [showAll, setShowAll] = useState(false);
  const [copied, setCopied] = useState(false);

  // Count totals
  const stats = useMemo(() => {
    let fileCount = 0;
    let dirCount = 0;
    let totalSize = 0;

    const countRecursive = (entries: FileTreeEntry[]) => {
      for (const entry of entries) {
        if (entry.type === 'directory') {
          dirCount++;
          if (entry.children) countRecursive(entry.children);
        } else {
          fileCount++;
          if (entry.size) totalSize += entry.size;
        }
      }
    };

    countRecursive(data.files);
    return { fileCount, dirCount, totalSize };
  }, [data.files]);

  // Limit visible files if not showing all
  const visibleFiles = showAll ? data.files : data.files.slice(0, 20);
  const hasMore = data.files.length > 20;

  const handleOpen = useCallback((path: string) => {
    // Use Electron IPC to open file
    (window as any).electronAPI?.fs?.openFile?.(path).catch((err: Error) => {
      console.warn('[FileTreeCard] Failed to open file:', err);
    });
  }, []);

  const handleCopyPaths = useCallback(() => {
    const collectPaths = (entries: FileTreeEntry[]): string[] => {
      return entries.flatMap(e => {
        if (e.type === 'directory' && e.children) {
          return [e.path, ...collectPaths(e.children)];
        }
        return [e.path];
      });
    };
    const paths = collectPaths(data.files).join('\n');
    navigator.clipboard.writeText(paths);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [data.files]);

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card/50 mt-2">
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-secondary/50 hover:bg-secondary/70 transition-colors"
      >
        <FolderTree className="w-4 h-4 text-yellow-400" />
        <span className="text-sm font-medium text-foreground">File Tree</span>
        <span className="text-xs text-muted-foreground">
          ({stats.fileCount} files, {stats.dirCount} folders)
        </span>
        <span className="flex-1" />
        <span className="text-muted-foreground">
          {isCollapsed ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronUp className="w-4 h-4" />
          )}
        </span>
      </button>

      {/* Body */}
      {!isCollapsed && (
        <div className="p-2 space-y-2">
          {/* Root path */}
          {data.rootPath && data.rootPath !== '.' && (
            <div className="px-2 py-1 text-xs text-muted-foreground font-mono truncate border-b border-border/30 pb-2 mb-1">
              {data.rootPath}
            </div>
          )}

          {/* File tree */}
          <div className="max-h-80 overflow-y-auto">
            {visibleFiles.map((entry, idx) => (
              <FileItem
                key={`${entry.path}-${idx}`}
                entry={entry}
                onOpen={handleOpen}
              />
            ))}
          </div>

          {/* Show more/less */}
          {hasMore && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="w-full text-xs text-primary hover:text-primary/80 transition-colors py-1"
            >
              {showAll ? 'Show less' : `+${data.files.length - 20} more entries`}
            </button>
          )}

          {/* Footer stats & actions */}
          <div className="flex items-center justify-between pt-2 border-t border-border/30">
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <File className="w-3 h-3" />
                {stats.fileCount} files
              </span>
              <span className="flex items-center gap-1">
                <Folder className="w-3 h-3" />
                {stats.dirCount} dirs
              </span>
              {stats.totalSize > 0 && (
                <span>{formatSize(stats.totalSize)}</span>
              )}
            </div>
            <button
              onClick={handleCopyPaths}
              className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-green-400" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  Copy
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
