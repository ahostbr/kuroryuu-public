/**
 * SessionCard - Rich visualization card for k_session results
 *
 * Displays:
 * - Session state with agent info
 * - Duration and timestamps
 * - Context summary
 */

import { useState } from 'react';
import {
  Activity,
  ChevronDown,
  ChevronUp,
  Clock,
  User,
  Cpu,
  Play,
  Square,
} from 'lucide-react';
import type { SessionData } from '../../../types/insights';

interface SessionCardProps {
  data: SessionData;
  collapsed?: boolean;
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

export function SessionCard({ data, collapsed: initialCollapsed = false }: SessionCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);

  const isActive = data.startedAt && !data.endedAt;

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card/50 mt-2">
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-secondary/50 hover:bg-secondary/70 transition-colors"
      >
        <Activity className={`w-4 h-4 ${isActive ? 'text-green-400' : 'text-blue-400'}`} />
        <span className="text-sm font-medium text-foreground">Session</span>
        {isActive && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 text-[10px]">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Active
          </span>
        )}
        {data.action && data.action !== 'context' && (
          <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[10px]">
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
        <div className="p-3 space-y-3">
          {/* Session info */}
          <div className="grid grid-cols-2 gap-3">
            {data.sessionId && (
              <div className="bg-background/50 rounded-lg p-2 border border-border/30">
                <div className="text-[10px] text-muted-foreground uppercase">Session ID</div>
                <div className="font-mono text-xs text-foreground truncate">
                  {data.sessionId.slice(0, 16)}...
                </div>
              </div>
            )}
            {data.agentId && (
              <div className="bg-background/50 rounded-lg p-2 border border-border/30">
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase">
                  <User className="w-3 h-3" />
                  Agent
                </div>
                <div className="text-xs text-foreground truncate">{data.agentId}</div>
              </div>
            )}
            {data.processId && (
              <div className="bg-background/50 rounded-lg p-2 border border-border/30">
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase">
                  <Cpu className="w-3 h-3" />
                  Process
                </div>
                <div className="font-mono text-xs text-foreground truncate">{data.processId}</div>
              </div>
            )}
          </div>

          {/* Timestamps */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            {data.startedAt && (
              <span className="flex items-center gap-1">
                <Play className="w-3 h-3 text-green-400" />
                Started: {formatTimestamp(data.startedAt)}
              </span>
            )}
            {data.endedAt && (
              <span className="flex items-center gap-1">
                <Square className="w-3 h-3 text-red-400" />
                Ended: {formatTimestamp(data.endedAt)}
              </span>
            )}
          </div>

          {/* Context preview */}
          {data.context && Object.keys(data.context).length > 0 && (
            <div className="bg-background/50 rounded-lg p-2 border border-border/30">
              <div className="text-[10px] text-muted-foreground uppercase mb-1">Context</div>
              <pre className="text-xs font-mono text-muted-foreground overflow-x-auto max-h-20 overflow-y-auto whitespace-pre-wrap">
                {JSON.stringify(data.context, null, 2).slice(0, 500)}
              </pre>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t border-border/30">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {isActive ? 'Session active' : 'Session ended'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
