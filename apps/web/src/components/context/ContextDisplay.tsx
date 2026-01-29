/**
 * Context Display Component
 * Copilot-style file context area above input
 */
import { motion, AnimatePresence } from 'framer-motion';
import { FileText, X, ChevronDown, ChevronUp, Plus, Hash, GitBranch, Clock } from 'lucide-react';
import type { FileAttachment } from '../../types/files';
import { FileBubbleList } from '../attachments';
import { cn } from '../../lib/utils';
import { useState } from 'react';

interface ContextDisplayProps {
  files: FileAttachment[];
  onRemoveFile: (id: string) => void;
  onClearAll: () => void;
  onAddFiles: () => void;
  className?: string;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export function ContextDisplay({
  files,
  onRemoveFile,
  onClearAll,
  onAddFiles,
  className,
  collapsed = false,
  onToggleCollapse,
}: ContextDisplayProps) {
  if (files.length === 0) {
    return null;
  }
  
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      className={cn(
        "border-b border-[var(--copilot-border-default)]",
        "bg-[var(--copilot-bg-secondary)]",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2">
        <button
          onClick={onToggleCollapse}
          className="flex items-center gap-2 text-sm text-[var(--copilot-text-muted)] hover:text-[var(--copilot-text-primary)] transition-colors"
        >
          {collapsed ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronUp className="w-4 h-4" />
          )}
          <FileText className="w-4 h-4" />
          <span>Context</span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--copilot-bg-tertiary)]">
            {files.length}
          </span>
        </button>
        
        <div className="flex items-center gap-2">
          <button
            onClick={onAddFiles}
            className={cn(
              "p-1 rounded transition-colors",
              "text-[var(--copilot-text-muted)] hover:text-[var(--copilot-text-primary)]",
              "hover:bg-[var(--copilot-bg-hover)]"
            )}
            title="Add files"
          >
            <Plus className="w-4 h-4" />
          </button>
          <button
            onClick={onClearAll}
            className={cn(
              "p-1 rounded transition-colors",
              "text-[var(--copilot-text-muted)] hover:text-red-400",
              "hover:bg-[var(--copilot-bg-hover)]"
            )}
            title="Clear all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      {/* File Bubbles */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="px-4 pb-3"
          >
            <FileBubbleList
              files={files}
              onRemove={onRemoveFile}
              compact
              maxVisible={10}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

interface ContextPillProps {
  type: 'workspace' | 'selection' | 'symbol' | 'git';
  label: string;
  detail?: string;
  onRemove?: () => void;
}

export function ContextPill({ type, label, detail, onRemove }: ContextPillProps) {
  const icons = {
    workspace: FileText,
    selection: Hash,
    symbol: Hash,
    git: GitBranch,
  };
  
  const Icon = icons[type];
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-1 rounded-md",
        "bg-[var(--copilot-accent-blue)]/10 text-[var(--copilot-accent-blue)]",
        "text-xs font-medium"
      )}
    >
      <Icon className="w-3 h-3" />
      <span>{label}</span>
      {detail && (
        <span className="text-[var(--copilot-text-muted)]">• {detail}</span>
      )}
      {onRemove && (
        <button
          onClick={onRemove}
          className="ml-1 hover:text-red-400 transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </motion.div>
  );
}

interface QuickContextProps {
  recentFiles?: FileAttachment[];
  onSelectFile: (file: FileAttachment) => void;
  className?: string;
}

export function QuickContext({ recentFiles = [], onSelectFile, className }: QuickContextProps) {
  const [expanded, setExpanded] = useState(false);
  
  if (recentFiles.length === 0) return null;
  
  const visibleFiles = expanded ? recentFiles : recentFiles.slice(0, 3);
  
  return (
    <div className={cn("text-xs", className)}>
      <div className="flex items-center gap-2 mb-2 text-[var(--copilot-text-muted)]">
        <Clock className="w-3 h-3" />
        <span>Recent files</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {visibleFiles.map((file) => (
          <button
            key={file.id}
            onClick={() => onSelectFile(file)}
            className={cn(
              "px-2 py-1 rounded text-xs",
              "bg-[var(--copilot-bg-tertiary)] text-[var(--copilot-text-secondary)]",
              "hover:bg-[var(--copilot-bg-hover)] hover:text-[var(--copilot-text-primary)]",
              "transition-colors truncate max-w-[150px]"
            )}
          >
            {file.name}
          </button>
        ))}
        {recentFiles.length > 3 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className={cn(
              "px-2 py-1 rounded text-xs",
              "text-[var(--copilot-accent-blue)]",
              "hover:bg-[var(--copilot-bg-hover)]",
              "transition-colors"
            )}
          >
            {expanded ? 'Show less' : `+${recentFiles.length - 3} more`}
          </button>
        )}
      </div>
    </div>
  );
}
