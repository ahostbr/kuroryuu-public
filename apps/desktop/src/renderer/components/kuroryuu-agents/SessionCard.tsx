/**
 * SessionCard - Displays a single coding agent session
 */
import { Square, Play, Trash2, Terminal, Clock, FolderOpen } from 'lucide-react';
import type { KuroryuuAgentSession } from '../../stores/kuroryuu-agents-store';

interface SessionCardProps {
  session: KuroryuuAgentSession;
  isSelected: boolean;
  onSelect: () => void;
  onKill: () => void;
}

export function SessionCard({ session, isSelected, onSelect, onKill }: SessionCardProps) {
  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString();
    } catch {
      return isoString;
    }
  };

  const truncateCommand = (cmd: string, maxLen = 60) => {
    if (cmd.length <= maxLen) return cmd;
    return cmd.slice(0, maxLen) + '...';
  };

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
      {/* Header: Status + ID */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {session.running ? (
            <span className="flex items-center gap-1 text-green-400 text-xs font-medium">
              <Play className="w-3 h-3 fill-current" />
              Running
            </span>
          ) : (
            <span className={`flex items-center gap-1 text-xs font-medium ${
              session.exit_code === 0 ? 'text-blue-400' : 'text-red-400'
            }`}>
              <Square className="w-3 h-3 fill-current" />
              {session.exit_code === 0 ? 'Completed' : `Exit ${session.exit_code}`}
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground font-mono">
          {session.id}
        </span>
      </div>

      {/* Command */}
      <div className="flex items-start gap-2 mb-3">
        <Terminal className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
        <code className="text-sm text-foreground break-all">
          {truncateCommand(session.command)}
        </code>
      </div>

      {/* Metadata row */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1" title={session.workdir}>
          <FolderOpen className="w-3 h-3" />
          {session.workdir.split(/[/\\]/).pop()}
        </span>
        <span className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatTime(session.started_at)}
        </span>
        {session.pty && (
          <span className="px-1.5 py-0.5 rounded bg-secondary text-xs">PTY</span>
        )}
        <span className="ml-auto">
          {session.output_lines} lines
        </span>
      </div>

      {/* Actions */}
      {session.running && (
        <div className="mt-3 pt-3 border-t border-border/50">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onKill();
            }}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-red-400 hover:bg-red-400/10 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
            Kill
          </button>
        </div>
      )}
    </div>
  );
}
