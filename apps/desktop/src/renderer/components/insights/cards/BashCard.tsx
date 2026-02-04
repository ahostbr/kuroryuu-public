/**
 * BashCard - Rich visualization card for k_bash results
 *
 * Displays:
 * - Command executed
 * - Output with syntax highlighting hints
 * - Exit code with status indicator
 * - Duration and background session info
 */

import React, { useState } from 'react';
import {
  Terminal,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  Clock,
  Play,
  Loader,
} from 'lucide-react';
import type { BashData } from '../../../types/insights';

interface BashCardProps {
  data: BashData;
  collapsed?: boolean;
}

function getExitCodeStatus(exitCode?: number): { icon: React.ReactNode; color: string } {
  if (exitCode === undefined) {
    return { icon: <Loader className="w-3.5 h-3.5 animate-spin" />, color: 'text-blue-400' };
  }
  if (exitCode === 0) {
    return { icon: <CheckCircle className="w-3.5 h-3.5" />, color: 'text-green-400' };
  }
  return { icon: <XCircle className="w-3.5 h-3.5" />, color: 'text-red-400' };
}

export function BashCard({ data, collapsed: initialCollapsed = false }: BashCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);

  const { icon: statusIcon, color: statusColor } = getExitCodeStatus(data.exitCode);
  const hasOutput = data.output && data.output.trim().length > 0;

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card/50 mt-2">
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-secondary/50 hover:bg-secondary/70 transition-colors"
      >
        <Terminal className="w-4 h-4 text-green-400" />
        <span className="text-sm font-medium text-foreground">Shell Command</span>
        <span className={statusColor}>
          {statusIcon}
        </span>
        {data.isBackground && (
          <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[10px]">
            background
          </span>
        )}
        {data.exitCode !== undefined && data.exitCode !== 0 && (
          <span className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 text-[10px]">
            exit {data.exitCode}
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
        <div className="p-3 space-y-3">
          {/* Command display */}
          {data.command && (
            <div className="bg-background/80 rounded-lg p-2 border border-border/30">
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground mb-1 uppercase">
                <Play className="w-3 h-3" />
                Command
              </div>
              <code className="text-xs font-mono text-green-400 break-all">
                $ {data.command}
              </code>
            </div>
          )}

          {/* Output display */}
          {hasOutput ? (
            <div className="bg-zinc-900 rounded-lg p-2 border border-border/30">
              <pre className="text-xs font-mono text-foreground overflow-x-auto max-h-48 overflow-y-auto whitespace-pre-wrap">
                {data.output}
              </pre>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground text-center py-2">
              No output
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t border-border/30">
            <span className={`flex items-center gap-1 ${statusColor}`}>
              {statusIcon}
              {data.exitCode !== undefined ? `Exit ${data.exitCode}` : 'Running...'}
            </span>
            {data.durationMs !== undefined && (
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {data.durationMs < 1000 ? `${data.durationMs}ms` : `${(data.durationMs / 1000).toFixed(1)}s`}
              </span>
            )}
            {data.sessionId && (
              <span className="font-mono truncate">
                Session: {data.sessionId.slice(0, 12)}...
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
