/**
 * SessionCard - Displays a single SDK agent session summary
 */
import { Square, Play, StopCircle, Clock, FolderOpen, DollarSign, Cpu, Wrench } from 'lucide-react';
import type { SDKAgentSessionSummary } from '../../types/sdk-agent';

interface SessionCardProps {
  session: SDKAgentSessionSummary;
  claudeSessionId?: string;  // Claude Code session_id resolved from observability events
  isSelected: boolean;
  onSelect: () => void;
  onStop: () => void;
}

export function SessionCard({ session, claudeSessionId, isSelected, onSelect, onStop }: SessionCardProps) {
  const formatTime = (ts: number) => {
    try {
      return new Date(ts).toLocaleTimeString();
    } catch {
      return '';
    }
  };

  const isRunning = session.status === 'starting' || session.status === 'running';
  const isError = session.status === 'error';

  const statusColor = isRunning
    ? 'text-green-400'
    : isError
      ? 'text-red-400'
      : session.status === 'cancelled'
        ? 'text-yellow-400'
        : 'text-blue-400';

  const statusLabel = session.status === 'starting'
    ? 'Starting'
    : session.status === 'running'
      ? 'Running'
      : session.status === 'completed'
        ? 'Completed'
        : session.status === 'error'
          ? 'Error'
          : 'Cancelled';

  const truncate = (s: string, max = 80) => s.length <= max ? s : s.slice(0, max) + '...';

  return (
    <div
      onClick={onSelect}
      className={`
        p-4 rounded-lg border cursor-pointer transition-all duration-150
        ${isSelected
          ? 'border-primary bg-primary/10'
          : 'border-border hover:border-primary/50 bg-card hover:bg-secondary/30'
        }
      `}
    >
      {/* Header: Status + Role */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {isRunning ? (
            <span className={`flex items-center gap-1 ${statusColor} text-xs font-medium`}>
              <Play className="w-3 h-3 fill-current" />
              {statusLabel}
            </span>
          ) : (
            <span className={`flex items-center gap-1 ${statusColor} text-xs font-medium`}>
              <Square className="w-3 h-3 fill-current" />
              {statusLabel}
            </span>
          )}
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
            session.ptyId
              ? 'bg-amber-500/20 text-amber-400'
              : session.backend === 'cli'
                ? 'bg-emerald-500/20 text-emerald-400'
                : 'bg-violet-500/20 text-violet-400'
          }`}>
            {session.ptyId ? 'PTY' : session.backend === 'cli' ? 'CLI' : 'SDK'}
          </span>
          {session.role && (
            <span className="px-1.5 py-0.5 rounded bg-primary/20 text-primary text-[10px] font-medium">
              {session.role}
            </span>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground font-mono" title={session.id}>
          {claudeSessionId ? claudeSessionId.slice(0, 8) : session.id.slice(0, 8)}
        </span>
      </div>

      {/* Prompt */}
      <div className="text-sm text-foreground mb-2 break-words">
        {truncate(session.prompt)}
      </div>

      {/* Current tool */}
      {isRunning && session.currentTool && (
        <div className="flex items-center gap-1.5 mb-2 text-xs text-cyan-400">
          <Wrench className="w-3 h-3" />
          <span className="font-mono">{session.currentTool}</span>
        </div>
      )}

      {/* Metadata row */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1" title={session.cwd}>
          <FolderOpen className="w-3 h-3" />
          {session.cwd.split(/[/\\]/).pop()}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatTime(session.startedAt)}
        </span>
        <span className="flex items-center gap-1">
          <Cpu className="w-3 h-3" />
          {session.numTurns}t
        </span>
        {session.totalCostUsd > 0 && (
          <span className="flex items-center gap-1">
            <DollarSign className="w-3 h-3" />
            ${session.totalCostUsd.toFixed(3)}
          </span>
        )}
        {session.toolCallCount > 0 && (
          <span className="flex items-center gap-1">
            <Wrench className="w-3 h-3" />
            {session.toolCallCount}
          </span>
        )}
      </div>

      {/* Stop button */}
      {isRunning && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStop();
            }}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-red-400 hover:bg-red-400/10 transition-colors"
          >
            <StopCircle className="w-3 h-3" />
            Stop
          </button>
        </div>
      )}
    </div>
  );
}
