/**
 * ProcessCard - Rich visualization card for k_process results
 *
 * Displays:
 * - Background process sessions
 * - Process status (running/stopped)
 * - Exit codes and PIDs
 */

import { useState } from 'react';
import {
  Cpu,
  ChevronDown,
  ChevronUp,
  Play,
  Square,
  AlertCircle,
  Clock,
  Hash,
} from 'lucide-react';
import type { ProcessData, ProcessSession } from '../../../types/insights';

interface ProcessCardProps {
  data: ProcessData;
  collapsed?: boolean;
}

function ProcessItem({ session }: { session: ProcessSession }) {
  const isRunning = session.running;

  return (
    <div className="px-3 py-2 rounded-lg bg-card/30 border border-border/50">
      <div className="flex items-center gap-2">
        {isRunning ? (
          <Play className="w-4 h-4 text-green-400 flex-shrink-0" />
        ) : session.exit_code === 0 ? (
          <Square className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        ) : (
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
        )}
        <span className="font-mono text-xs text-foreground truncate flex-1">
          {session.command}
        </span>
        {isRunning && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 text-[10px]">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            Running
          </span>
        )}
      </div>
      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
        <span className="font-mono truncate" title={session.id}>
          {session.id.slice(0, 12)}...
        </span>
        {session.pid !== undefined && (
          <span className="flex items-center gap-1">
            <Hash className="w-3 h-3" />
            PID {session.pid}
          </span>
        )}
        {!isRunning && session.exit_code !== undefined && (
          <span className={session.exit_code === 0 ? 'text-green-400' : 'text-red-400'}>
            Exit {session.exit_code}
          </span>
        )}
        {session.created_at && (
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {new Date(session.created_at).toLocaleTimeString()}
          </span>
        )}
      </div>
    </div>
  );
}

export function ProcessCard({ data, collapsed: initialCollapsed = false }: ProcessCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);

  const sessionCount = data.sessions?.length || data.count || 0;
  const runningCount = data.sessions?.filter(s => s.running).length || 0;

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card/50 mt-2">
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-secondary/50 hover:bg-secondary/70 transition-colors"
      >
        <Cpu className="w-4 h-4 text-cyan-400" />
        <span className="text-sm font-medium text-foreground">Background Processes</span>
        <span className="text-xs text-muted-foreground">
          ({sessionCount})
        </span>
        {runningCount > 0 && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 text-[10px]">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            {runningCount} running
          </span>
        )}
        {data.action && data.action !== 'list' && (
          <span className="px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 text-[10px]">
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
          {/* Process list */}
          {data.sessions && data.sessions.length > 0 ? (
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {data.sessions.map((session, idx) => (
                <ProcessItem key={session.id || idx} session={session} />
              ))}
            </div>
          ) : data.output ? (
            /* Single session output */
            <div className="bg-zinc-900 rounded-lg p-2 border border-border/30">
              <pre className="text-xs font-mono text-foreground overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap">
                {data.output}
              </pre>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground text-center py-2">
              No background processes
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t border-border/30">
            <span className="flex items-center gap-1">
              <Cpu className="w-3 h-3" />
              {sessionCount} processes
            </span>
            {runningCount > 0 && (
              <span className="flex items-center gap-1 text-green-400">
                <Play className="w-3 h-3" />
                {runningCount} active
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
