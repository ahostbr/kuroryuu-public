/**
 * Context Screen Component
 * Two tabs: Project Index (file tree with AI indexing) and Memories (searchable cards)
 */

import { useEffect } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import {
  FolderTree,
  Brain,
  Search,
  Plus,
  RefreshCw,
  File,
  Folder,
  FolderOpen,
  Check,
  Clock,
  AlertCircle,
  Circle,
  Trash2,
  Cloud,
  CloudOff,
  Tag,
} from 'lucide-react';
import { useContextStore } from '../../stores/context-store';
import type { FileNode, Memory, IndexStatus } from '../../types/context';
import { INDEX_STATUS_CONFIG, MEMORY_SOURCE_CONFIG } from '../../types/context';

// ============================================================================
// Project Index Tab Components
// ============================================================================

function IndexStatusIcon({ status }: { status: IndexStatus }) {
  switch (status) {
    case 'indexed':
      return <Check className="w-3.5 h-3.5 text-green-400" />;
    case 'pending':
      return <Clock className="w-3.5 h-3.5 text-primary animate-pulse" />;
    case 'error':
      return <AlertCircle className="w-3.5 h-3.5 text-red-400" />;
    default:
      return <Circle className="w-3.5 h-3.5 text-muted-foreground" />;
  }
}

function FileTreeNode({ 
  node, 
  depth = 0,
  onToggle,
  onSelect,
  onReindex,
  selectedPath,
}: { 
  node: FileNode; 
  depth?: number;
  onToggle: (id: string) => void;
  onSelect: (node: FileNode) => void;
  onReindex: (path: string) => void;
  selectedPath?: string;
}) {
  const isFolder = node.type === 'folder';
  const isSelected = node.path === selectedPath;
  
  return (
    <div>
      <div
        className={`
          flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer group
          ${isSelected ? 'bg-secondary' : 'hover:bg-secondary/50'}
        `}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          if (isFolder) {
            onToggle(node.id);
          } else {
            onSelect(node);
          }
        }}
      >
        {/* Folder/File Icon */}
        {isFolder ? (
          node.expanded ? (
            <FolderOpen className="w-4 h-4 text-primary flex-shrink-0" />
          ) : (
            <Folder className="w-4 h-4 text-primary flex-shrink-0" />
          )
        ) : (
          <File className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        )}
        
        {/* Name */}
        <span className="text-sm text-foreground flex-1 truncate">{node.name}</span>
        
        {/* Index Status (files only) */}
        {!isFolder && (
          <div className="flex items-center gap-2">
            <IndexStatusIcon status={node.indexStatus} />
            <button
              onClick={(e) => {
                e.stopPropagation();
                onReindex(node.path);
              }}
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-muted rounded transition-opacity"
              title="Reindex file"
            >
              <RefreshCw className="w-3 h-3 text-muted-foreground" />
            </button>
          </div>
        )}
      </div>
      
      {/* Children */}
      {isFolder && node.expanded && node.children && (
        <div>
          {node.children.map(child => (
            <FileTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              onToggle={onToggle}
              onSelect={onSelect}
              onReindex={onReindex}
              selectedPath={selectedPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectIndexTab() {
  const { 
    fileTree, 
    indexStats, 
    isIndexing, 
    selectedFile,
    toggleFolder,
    selectFile,
    reindexAll,
    reindexFile,
  } = useContextStore();

  const formatDate = (timestamp?: number) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  return (
    <div className="flex h-full">
      {/* File Tree Panel */}
      <div className="w-72 border-r border-border flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-foreground">Project Files</h3>
            <button
              onClick={reindexAll}
              disabled={isIndexing}
              className="flex items-center gap-1.5 px-2 py-1 text-xs bg-secondary hover:bg-muted rounded transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isIndexing ? 'animate-spin' : ''}`} />
              {isIndexing ? 'Indexing...' : 'Reindex All'}
            </button>
          </div>
          
          {/* Stats */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <Check className="w-3 h-3 text-green-400" />
              <span className="text-muted-foreground">{indexStats.indexedFiles} indexed</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-3 h-3 text-primary" />
              <span className="text-muted-foreground">{indexStats.pendingFiles} pending</span>
            </div>
            <div className="flex items-center gap-1.5">
              <AlertCircle className="w-3 h-3 text-red-400" />
              <span className="text-muted-foreground">{indexStats.errorFiles} errors</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Circle className="w-3 h-3 text-muted-foreground" />
              <span className="text-muted-foreground">{indexStats.totalFiles - indexStats.indexedFiles - indexStats.pendingFiles - indexStats.errorFiles} skipped</span>
            </div>
          </div>
        </div>
        
        {/* Tree */}
        <div className="flex-1 overflow-y-auto p-2">
          {fileTree.map(node => (
            <FileTreeNode
              key={node.id}
              node={node}
              onToggle={toggleFolder}
              onSelect={selectFile}
              onReindex={reindexFile}
              selectedPath={selectedFile?.path}
            />
          ))}
        </div>
      </div>
      
      {/* File Details Panel */}
      <div className="flex-1 p-6">
        {selectedFile ? (
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-medium text-foreground">{selectedFile.name}</h3>
                <p className="text-sm text-muted-foreground mt-1">{selectedFile.path}</p>
              </div>
              <div className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs ${INDEX_STATUS_CONFIG[selectedFile.indexStatus].color}`}>
                <IndexStatusIcon status={selectedFile.indexStatus} />
                {INDEX_STATUS_CONFIG[selectedFile.indexStatus].label}
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4 p-4 bg-card/50 rounded-lg border border-border">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Size</p>
                <p className="text-sm text-foreground">{formatSize(selectedFile.size)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Extension</p>
                <p className="text-sm text-foreground">{selectedFile.extension || 'None'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Last Indexed</p>
                <p className="text-sm text-foreground">{formatDate(selectedFile.lastIndexed)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Status</p>
                <p className="text-sm text-foreground">{INDEX_STATUS_CONFIG[selectedFile.indexStatus].label}</p>
              </div>
            </div>
            
            <button
              onClick={() => reindexFile(selectedFile.path)}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-black rounded-lg hover:bg-primary/80 transition-colors text-sm font-medium"
            >
              <RefreshCw className="w-4 h-4" />
              Reindex This File
            </button>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <FolderTree className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Select a file to view details</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Memories Tab Components
// ============================================================================

function MemoryCard({ 
  memory, 
  isSelected,
  onSelect,
  onDelete,
}: { 
  memory: Memory;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const sourceConfig = MEMORY_SOURCE_CONFIG[memory.source];
  
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  
  const getSyncIcon = () => {
    switch (memory.syncStatus) {
      case 'synced':
        return <Cloud className="w-3.5 h-3.5 text-green-400" />;
      case 'pending':
        return <Cloud className="w-3.5 h-3.5 text-primary animate-pulse" />;
      case 'error':
        return <CloudOff className="w-3.5 h-3.5 text-red-400" />;
      default:
        return <CloudOff className="w-3.5 h-3.5 text-muted-foreground" />;
    }
  };

  return (
    <div
      onClick={onSelect}
      className={`
        p-4 rounded-lg border cursor-pointer transition-all group
        ${isSelected 
          ? 'bg-secondary border-primary/50' 
          : 'bg-card/50 border-border hover:border-border'
        }
      `}
    >
      <div className="flex items-start justify-between mb-2">
        <h4 className="text-sm font-medium text-foreground flex-1 pr-2">{memory.title}</h4>
        <div className="flex items-center gap-2">
          {getSyncIcon()}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-muted rounded transition-opacity"
          >
            <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-red-400" />
          </button>
        </div>
      </div>
      
      <p className="text-xs text-muted-foreground line-clamp-2 mb-3">{memory.content}</p>
      
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`text-xs px-1.5 py-0.5 rounded ${sourceConfig.color}`}>
            {sourceConfig.label}
          </span>
          <span className="text-xs text-muted-foreground">{formatDate(memory.createdAt)}</span>
        </div>
        
        {memory.tags.length > 0 && (
          <div className="flex items-center gap-1">
            <Tag className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">{memory.tags.length}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function MemoriesTab() {
  const {
    memories,
    memorySearchQuery,
    filteredMemories,
    selectedMemory,
    isSyncing,
    setMemorySearchQuery,
    selectMemory,
    addMemory,
    deleteMemory,
    syncMemories,
  } = useContextStore();

  const handleAddMemory = () => {
    addMemory({
      title: 'New Memory',
      content: 'Add your memory content here...',
      source: 'user',
      tags: [],
    });
  };

  return (
    <div className="flex h-full">
      {/* Memory List Panel */}
      <div className="w-80 border-r border-border flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-border space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-foreground">Memories</h3>
            <div className="flex items-center gap-2">
              <button
                onClick={syncMemories}
                disabled={isSyncing}
                className="p-1.5 hover:bg-secondary rounded transition-colors disabled:opacity-50"
                title="Sync memories"
              >
                <RefreshCw className={`w-4 h-4 text-muted-foreground ${isSyncing ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={handleAddMemory}
                className="flex items-center gap-1.5 px-2 py-1 text-xs bg-primary text-black rounded hover:bg-primary/80 transition-colors"
              >
                <Plus className="w-3 h-3" />
                Add
              </button>
            </div>
          </div>
          
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={memorySearchQuery}
              onChange={(e) => setMemorySearchQuery(e.target.value)}
              placeholder="Search memories..."
              className="w-full pl-9 pr-3 py-2 bg-card border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-border"
            />
          </div>
          
          <p className="text-xs text-muted-foreground">{filteredMemories.length} of {memories.length} memories</p>
        </div>
        
        {/* Memory List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {filteredMemories.map(memory => (
            <MemoryCard
              key={memory.id}
              memory={memory}
              isSelected={selectedMemory?.id === memory.id}
              onSelect={() => selectMemory(memory)}
              onDelete={() => deleteMemory(memory.id)}
            />
          ))}
          
          {filteredMemories.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <Brain className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No memories found</p>
            </div>
          )}
        </div>
      </div>
      
      {/* Memory Detail Panel */}
      <div className="flex-1 p-6">
        {selectedMemory ? (
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-medium text-foreground">{selectedMemory.title}</h3>
                <div className="flex items-center gap-2 mt-2">
                  <span className={`text-xs px-2 py-0.5 rounded ${MEMORY_SOURCE_CONFIG[selectedMemory.source].color}`}>
                    {MEMORY_SOURCE_CONFIG[selectedMemory.source].label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Created {new Date(selectedMemory.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
            </div>
            
            <div className="p-4 bg-card/50 rounded-lg border border-border">
              <p className="text-sm text-foreground whitespace-pre-wrap">{selectedMemory.content}</p>
            </div>
            
            {selectedMemory.tags.length > 0 && (
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Tags</p>
                <div className="flex flex-wrap gap-2">
                  {selectedMemory.tags.map(tag => (
                    <span
                      key={tag}
                      className="px-2 py-1 text-xs bg-secondary text-foreground rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}
            
            <div className="flex items-center gap-4 pt-4 border-t border-border">
              <div>
                <p className="text-xs text-muted-foreground">Last Updated</p>
                <p className="text-sm text-foreground">
                  {new Date(selectedMemory.updatedAt).toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Sync Status</p>
                <p className="text-sm text-foreground capitalize">{selectedMemory.syncStatus.replace('-', ' ')}</p>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <Brain className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Select a memory to view details</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Main Context Component
// ============================================================================

export function Context() {
  const { activeTab, setActiveTab, initialize } = useContextStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="px-6 py-4 border-b border-border">
        <h1 className="text-xl font-semibold text-foreground">Context</h1>
        <p className="text-sm text-muted-foreground mt-1">Manage project index and memories</p>
      </div>

      {/* Tabs */}
      <Tabs.Root
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as typeof activeTab)}
        className="flex-1 flex flex-col"
      >
        <Tabs.List className="flex border-b border-border px-6">
          <Tabs.Trigger
            value="project-index"
            className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground border-b-2 border-transparent data-[state=active]:text-primary data-[state=active]:border-primary transition-colors"
          >
            <FolderTree className="w-4 h-4" />
            Project Index
          </Tabs.Trigger>
          <Tabs.Trigger
            value="memories"
            className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground border-b-2 border-transparent data-[state=active]:text-primary data-[state=active]:border-primary transition-colors"
          >
            <Brain className="w-4 h-4" />
            Memories
          </Tabs.Trigger>
        </Tabs.List>

        <Tabs.Content value="project-index" className="flex-1 overflow-hidden">
          <ProjectIndexTab />
        </Tabs.Content>
        <Tabs.Content value="memories" className="flex-1 overflow-hidden">
          <MemoriesTab />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
