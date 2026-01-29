/**
 * File Attachment Bubble Component
 * Copilot-style file bubble with hover tooltip
 */
import { useState } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { FileAttachment } from '../../types/files';
import { getFileIcon, formatFileSize, getFileLanguage } from '../../types/files';
import { cn } from '../../lib/utils';

interface FileBubbleProps {
  file: FileAttachment;
  onRemove?: () => void;
  showTooltip?: boolean;
  compact?: boolean;
}

export function FileBubble({ file, onRemove, showTooltip = true, compact = false }: FileBubbleProps) {
  const [isHovered, setIsHovered] = useState(false);
  
  const icon = getFileIcon(file.name);
  const language = getFileLanguage(file.name);
  
  return (
    <div className="relative inline-block">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className={cn(
          "flex items-center gap-2 px-2.5 py-1.5 rounded-md",
          "bg-[var(--copilot-file-bg)] border border-[var(--copilot-file-border)]",
          "hover:bg-[var(--copilot-file-hover)] transition-colors cursor-default",
          "text-[var(--copilot-text-primary)] text-sm",
          compact && "px-2 py-1"
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* File Icon */}
        <span className="text-base flex-shrink-0">{icon}</span>
        
        {/* File Name */}
        <span className={cn(
          "truncate",
          compact ? "max-w-[100px]" : "max-w-[180px]"
        )}>
          {file.name}
        </span>
        
        {/* Line Range Badge */}
        {file.lineRange && (
          <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--copilot-accent-blue)]/20 text-[var(--copilot-accent-blue)]">
            L{file.lineRange.start}-{file.lineRange.end}
          </span>
        )}
        
        {/* Remove Button */}
        {onRemove && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className={cn(
              "p-0.5 rounded hover:bg-[var(--copilot-bg-active)]",
              "text-[var(--copilot-text-muted)] hover:text-[var(--copilot-text-primary)]",
              "transition-colors"
            )}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </motion.div>
      
      {/* Hover Tooltip */}
      <AnimatePresence>
        {showTooltip && isHovered && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className={cn(
              "absolute z-50 bottom-full left-0 mb-2 p-3 rounded-lg",
              "bg-[var(--copilot-bg-secondary)] border border-[var(--copilot-border-default)]",
              "shadow-[var(--copilot-shadow-lg)] min-w-[250px] max-w-[350px]"
            )}
          >
            {/* Full Path */}
            <div className="text-xs text-[var(--copilot-text-muted)] mb-1">Full Path</div>
            <div className="text-sm text-[var(--copilot-text-primary)] font-mono mb-2 break-all">
              {file.path}
            </div>
            
            {/* File Info Grid */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-[var(--copilot-text-muted)]">Language: </span>
                <span className="text-[var(--copilot-accent-green)]">{language}</span>
              </div>
              <div>
                <span className="text-[var(--copilot-text-muted)]">Size: </span>
                <span className="text-[var(--copilot-text-secondary)]">{formatFileSize(file.size)}</span>
              </div>
              {file.lineRange && (
                <div className="col-span-2">
                  <span className="text-[var(--copilot-text-muted)]">Lines: </span>
                  <span className="text-[var(--copilot-accent-blue)]">
                    {file.lineRange.start} - {file.lineRange.end}
                  </span>
                </div>
              )}
            </div>
            
            {/* Preview (if available) */}
            {file.preview && (
              <div className="mt-2 pt-2 border-t border-[var(--copilot-border-default)]">
                <div className="text-xs text-[var(--copilot-text-muted)] mb-1">Preview</div>
                <pre className="text-xs text-[var(--copilot-text-secondary)] font-mono overflow-hidden max-h-[60px]">
                  {file.preview}
                </pre>
              </div>
            )}
            
            {/* Tooltip Arrow */}
            <div className="absolute -bottom-1 left-4 w-2 h-2 bg-[var(--copilot-bg-secondary)] border-r border-b border-[var(--copilot-border-default)] transform rotate-45" />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface FileBubbleListProps {
  files: FileAttachment[];
  onRemove?: (id: string) => void;
  compact?: boolean;
  maxVisible?: number;
}

export function FileBubbleList({ files, onRemove, compact = false, maxVisible = 5 }: FileBubbleListProps) {
  const visibleFiles = files.slice(0, maxVisible);
  const hiddenCount = files.length - maxVisible;
  
  return (
    <div className="flex flex-wrap gap-1.5">
      <AnimatePresence mode="popLayout">
        {visibleFiles.map((file) => (
          <FileBubble
            key={file.id}
            file={file}
            onRemove={onRemove ? () => onRemove(file.id) : undefined}
            compact={compact}
          />
        ))}
      </AnimatePresence>
      
      {hiddenCount > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className={cn(
            "flex items-center px-2.5 py-1.5 rounded-md",
            "bg-[var(--copilot-bg-tertiary)] text-[var(--copilot-text-muted)]",
            "text-sm cursor-pointer hover:text-[var(--copilot-text-secondary)]"
          )}
        >
          +{hiddenCount} more
        </motion.div>
      )}
    </div>
  );
}
