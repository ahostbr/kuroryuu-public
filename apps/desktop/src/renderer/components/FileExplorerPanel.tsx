import React, { useState, useEffect, useCallback } from 'react';
import { 
  Folder, 
  File, 
  ChevronRight, 
  ChevronDown, 
  FileCode, 
  FileText, 
  FileJson, 
  Image,
  RefreshCw,
  AlertCircle
} from 'lucide-react';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileNode[];
}

interface FileExplorerPanelProps {
  projectRoot: string;
  onFileSelect?: (path: string) => void;
  onFileDrop?: (path: string) => void;
  onEmptyChange?: (isEmpty: boolean) => void;
}

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'tsx':
    case 'ts':
      return <FileCode className="w-4 h-4 text-blue-400" />;
    case 'jsx':
    case 'js':
      return <FileCode className="w-4 h-4 text-primary" />;
    case 'py':
      return <FileCode className="w-4 h-4 text-green-400" />;
    case 'json':
      return <FileJson className="w-4 h-4 text-primary" />;
    case 'md':
    case 'txt':
      return <FileText className="w-4 h-4 text-muted-foreground" />;
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
    case 'ico':
      return <Image className="w-4 h-4 text-purple-400" />;
    case 'css':
    case 'scss':
    case 'less':
      return <FileCode className="w-4 h-4 text-pink-400" />;
    case 'html':
      return <FileCode className="w-4 h-4 text-orange-400" />;
    default:
      return <File className="w-4 h-4 text-muted-foreground" />;
  }
}

interface TreeNodeProps {
  node: FileNode;
  depth: number;
  projectRoot: string;
  onSelect?: (path: string) => void;
}

function TreeNode({ node, depth, projectRoot, onSelect }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 1);

  const handleClick = () => {
    if (node.type === 'directory') {
      setExpanded(!expanded);
    } else {
      // node.path is already an absolute path from readTree
      onSelect?.(node.path);
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    // node.path is already an absolute path from readTree
    e.dataTransfer.setData('text/plain', node.path);
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <div>
      <div
        onClick={handleClick}
        draggable={node.type === 'file'}
        onDragStart={handleDragStart}
        className={`
          flex items-center gap-1.5 py-1 px-2 cursor-pointer rounded
          hover:bg-secondary/50 transition-colors text-sm
          ${node.type === 'file' ? 'text-foreground' : 'text-foreground font-medium'}
        `}
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {node.type === 'directory' ? (
          <>
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
            )}
            <Folder className={`w-4 h-4 flex-shrink-0 ${expanded ? 'text-primary' : 'text-muted-foreground'}`} />
          </>
        ) : (
          <>
            <span className="w-3.5 flex-shrink-0" />
            {getFileIcon(node.name)}
          </>
        )}
        <span className="truncate">{node.name}</span>
      </div>
      
      {node.type === 'directory' && expanded && node.children && (
        <div>
          {node.children.map(child => (
            <TreeNode 
              key={child.path} 
              node={child} 
              depth={depth + 1}
              projectRoot={projectRoot}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileExplorerPanel({ projectRoot, onFileSelect, onFileDrop, onEmptyChange }: FileExplorerPanelProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [fileTree, setFileTree] = useState<FileNode[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Notify parent when empty state changes
  useEffect(() => {
    const isEmpty = !isLoading && (error !== null || fileTree.length === 0);
    onEmptyChange?.(isEmpty);
  }, [isLoading, error, fileTree.length, onEmptyChange]);

  const loadFileTree = useCallback(async () => {
    if (!projectRoot) {
      setError('No project root specified');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Use the new readTree IPC call
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const api = window.electronAPI as any;
      if (!api?.fs?.readTree) {
        throw new Error('fs.readTree not available');
      }
      const tree = await api.fs.readTree(projectRoot, 4);
      setFileTree(tree as FileNode[]);
    } catch (err) {
      console.error('[FileExplorer] Failed to load tree:', err);
      setError('Failed to load files');
    } finally {
      setIsLoading(false);
    }
  }, [projectRoot]);

  useEffect(() => {
    loadFileTree();
  }, [loadFileTree]);

  const handleRefresh = () => {
    loadFileTree();
  };

  return (
    <div className="h-full flex flex-col bg-background border-r border-border">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Files</span>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-secondary transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-auto py-2">
        {isLoading && fileTree.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-muted-foreground text-sm">
            <RefreshCw className="w-4 h-4 animate-spin mr-2" />
            Loading...
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-20 text-red-400 text-sm px-3">
            <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
            <span>{error}</span>
          </div>
        ) : fileTree.length === 0 ? (
          <div className="flex items-center justify-center h-20 text-muted-foreground text-sm">
            No files found
          </div>
        ) : (
          fileTree.map(node => (
            <TreeNode 
              key={node.path} 
              node={node} 
              depth={0}
              projectRoot={projectRoot}
              onSelect={onFileSelect}
            />
          ))
        )}
      </div>

      {/* Footer hint */}
      <div className="px-3 py-2 border-t border-border">
        <p className="text-xs text-muted-foreground">
          Drag files to terminal to insert path
        </p>
      </div>
    </div>
  );
}
