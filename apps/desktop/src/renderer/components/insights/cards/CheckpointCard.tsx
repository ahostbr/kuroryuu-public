/**
 * CheckpointCard - Rich visualization card for k_checkpoint results
 *
 * Displays:
 * - Checkpoint list with timestamps
 * - Checkpoint details (name, tags, summary)
 * - Size information
 */

import { useState } from 'react';
import {
  Save,
  ChevronDown,
  ChevronUp,
  Clock,
  Tag,
  FileText,
  HardDrive,
} from 'lucide-react';
import type { CheckpointData, CheckpointEntry } from '../../../types/insights';

interface CheckpointCardProps {
  data: CheckpointData;
  collapsed?: boolean;
}

function formatBytes(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function formatTimestamp(ts?: string): string {
  if (!ts) return '';
  try {
    const date = new Date(ts);
    return date.toLocaleString();
  } catch {
    return ts;
  }
}

function CheckpointItem({ checkpoint }: { checkpoint: CheckpointEntry }) {
  return (
    <div className="px-3 py-2 rounded-lg bg-card/30 border border-border/50">
      <div className="flex items-center gap-2">
        <Save className="w-4 h-4 text-amber-400 flex-shrink-0" />
        <span className="font-mono text-sm text-foreground truncate">
          {checkpoint.id.slice(0, 20)}...
        </span>
        {checkpoint.size_bytes && (
          <span className="text-xs text-muted-foreground ml-auto">
            {formatBytes(checkpoint.size_bytes)}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
        {checkpoint.saved_at && (
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatTimestamp(checkpoint.saved_at)}
          </span>
        )}
        {checkpoint.name && (
          <span className="truncate">{checkpoint.name}</span>
        )}
      </div>
      {checkpoint.summary && (
        <div className="mt-1 text-xs text-muted-foreground truncate">
          {checkpoint.summary}
        </div>
      )}
      {checkpoint.tags && checkpoint.tags.length > 0 && (
        <div className="flex items-center gap-1 mt-1">
          <Tag className="w-3 h-3 text-muted-foreground" />
          {checkpoint.tags.slice(0, 3).map((tag, idx) => (
            <span
              key={idx}
              className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function CheckpointCard({ data, collapsed: initialCollapsed = false }: CheckpointCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);

  const checkpointCount = data.checkpoints?.length || data.count || (data.id ? 1 : 0);

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card/50 mt-2">
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-secondary/50 hover:bg-secondary/70 transition-colors"
      >
        <Save className="w-4 h-4 text-amber-400" />
        <span className="text-sm font-medium text-foreground">Checkpoints</span>
        <span className="text-xs text-muted-foreground">
          ({checkpointCount})
        </span>
        {data.action && data.action !== 'list' && (
          <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 text-[10px]">
            {data.action}
          </span>
        )}
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
        <div className="p-3 space-y-2">
          {/* Checkpoint list */}
          {data.checkpoints && data.checkpoints.length > 0 ? (
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {data.checkpoints.map((cp, idx) => (
                <CheckpointItem key={cp.id || idx} checkpoint={cp} />
              ))}
            </div>
          ) : data.id ? (
            /* Single checkpoint saved */
            <div className="bg-background/50 rounded-lg p-3 border border-border/30">
              <div className="flex items-center gap-2">
                <Save className="w-4 h-4 text-green-400" />
                <span className="text-sm text-foreground">Checkpoint saved</span>
              </div>
              <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                <div className="font-mono truncate">{data.id}</div>
                {data.savedAt && (
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatTimestamp(data.savedAt)}
                  </div>
                )}
                {data.path && (
                  <div className="flex items-center gap-1">
                    <FileText className="w-3 h-3" />
                    {data.path}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground text-center py-2">
              No checkpoints found
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t border-border/30">
            <span className="flex items-center gap-1">
              <HardDrive className="w-3 h-3" />
              {checkpointCount} checkpoints
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
