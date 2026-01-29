import { useState, useEffect } from 'react'
import { ChevronRight, ChevronDown, File, Folder, FolderOpen } from 'lucide-react'
import { cn } from '../lib/utils'

interface FileNode {
  name: string
  path: string
  type: 'file' | 'dir'
  children?: FileNode[]
  size?: number
}

interface FileTreeProps {
  root: FileNode
  onSelect?: (path: string) => void
  selectedPath?: string
}

interface TreeItemProps {
  node: FileNode
  level: number
  onSelect?: (path: string) => void
  selectedPath?: string
}

function TreeItem({ node, level, onSelect, selectedPath }: TreeItemProps) {
  const [isExpanded, setIsExpanded] = useState(level === 0)
  const isSelected = selectedPath === node.path
  const hasChildren = node.type === 'dir' && node.children && node.children.length > 0

  return (
    <div>
      <div
        className={cn(
          'flex items-center gap-1 py-1 px-2 cursor-pointer hover:bg-secondary transition-colors rounded',
          isSelected && 'bg-blue-500/20 text-blue-300'
        )}
        style={{ paddingLeft: `${level * 16}px` }}
        onClick={() => {
          if (hasChildren) setIsExpanded(!isExpanded)
          if (node.type === 'file') onSelect?.(node.path)
        }}
      >
        {hasChildren && (
          <button className="p-0 flex-shrink-0">
            {isExpanded ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
          </button>
        )}
        {!hasChildren && node.type === 'dir' && (
          <div className="w-4 h-4" />
        )}

        {node.type === 'dir' ? (
          isExpanded ? (
            <FolderOpen className="w-4 h-4 flex-shrink-0 text-primary" />
          ) : (
            <Folder className="w-4 h-4 flex-shrink-0 text-primary" />
          )
        ) : (
          <File className="w-4 h-4 flex-shrink-0 text-muted-foreground" />
        )}
        <span className="text-sm truncate text-foreground">{node.name}</span>
        {node.size && node.type === 'file' && (
          <span className="text-xs text-muted-foreground ml-auto flex-shrink-0">
            {formatSize(node.size)}
          </span>
        )}
      </div>

      {isExpanded && hasChildren && (
        <div>
          {node.children!.map((child) => (
            <TreeItem
              key={child.path}
              node={child}
              level={level + 1}
              onSelect={onSelect}
              selectedPath={selectedPath}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
}

export function FileTree({ root, onSelect, selectedPath }: FileTreeProps) {
  return (
    <div className="flex flex-col h-full bg-card border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border flex-shrink-0">
        <h3 className="text-sm font-medium text-foreground">Files</h3>
      </div>

      {/* Tree container */}
      <div className="flex-1 overflow-auto scrollbar-thin scrollbar-thumb-muted scrollbar-track-transparent">
        <div className="p-2">
          <TreeItem
            node={root}
            level={0}
            onSelect={onSelect}
            selectedPath={selectedPath}
          />
        </div>
      </div>
    </div>
  )
}
