/**
 * Execution History
 *
 * Shows past tool executions for the current tool.
 */
import React from 'react';
import { X, CheckCircle, XCircle, Clock, Trash2 } from 'lucide-react';
import type { ToolExecution } from '../../../types/command-center';
import { useToolExecution } from '../../../hooks/useCommandCenter';

interface ExecutionHistoryProps {
  history: ToolExecution[];
  onClose: () => void;
}

export function ExecutionHistory({ history, onClose }: ExecutionHistoryProps) {
  const { clearExecutionHistory, setToolArg, resetToolArgs } = useToolExecution();

  const handleRerun = (execution: ToolExecution) => {
    // Reset current args and apply the historical args
    resetToolArgs();
    Object.entries(execution.args).forEach(([key, value]) => {
      setToolArg(key, value);
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <h3 className="font-medium text-foreground">Execution History</h3>
        <div className="flex items-center gap-2">
          <button
            onClick={() => clearExecutionHistory()}
            className="p-1.5 rounded hover:bg-secondary transition-colors"
            title="Clear history"
          >
            <Trash2 className="w-4 h-4 text-muted-foreground" />
          </button>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-secondary transition-colors"
          >
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* History List */}
      <div className="flex-1 overflow-auto">
        {history.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-center">
            <div className="text-muted-foreground">
              <Clock className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No execution history</p>
            </div>
          </div>
        ) : (
          <div className="p-2 space-y-2">
            {history.map((execution) => (
              <HistoryItem
                key={execution.id}
                execution={execution}
                onRerun={() => handleRerun(execution)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface HistoryItemProps {
  execution: ToolExecution;
  onRerun: () => void;
}

function HistoryItem({ execution, onRerun }: HistoryItemProps) {
  const { status, startTime, durationMs, args, error } = execution;

  const formatTime = (iso: string) => {
    const date = new Date(iso);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatArgs = (args: Record<string, unknown>): string => {
    const entries = Object.entries(args);
    if (entries.length === 0) return '(no args)';
    if (entries.length === 1) {
      const [key, value] = entries[0];
      const strValue = typeof value === 'string' ? value : JSON.stringify(value);
      return `${key}: ${strValue.length > 20 ? strValue.substring(0, 20) + '...' : strValue}`;
    }
    return `${entries.length} parameters`;
  };

  return (
    <div
      className={`p-3 rounded-lg border transition-colors ${
        status === 'success'
          ? 'border-success/20 bg-success/5'
          : status === 'error'
            ? 'border-destructive/20 bg-destructive/5'
            : 'border-border bg-secondary/50'
      }`}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2">
          {status === 'success' ? (
            <CheckCircle className="w-4 h-4 text-success" />
          ) : status === 'error' ? (
            <XCircle className="w-4 h-4 text-destructive" />
          ) : (
            <Clock className="w-4 h-4 text-muted-foreground" />
          )}
          <span className="text-sm font-medium text-foreground">
            {formatTime(startTime)}
          </span>
          {durationMs !== undefined && (
            <span className="text-xs text-muted-foreground">({durationMs}ms)</span>
          )}
        </div>

        <button
          onClick={onRerun}
          className="text-xs text-primary hover:underline"
        >
          Use args
        </button>
      </div>

      <p className="text-xs text-muted-foreground truncate">{formatArgs(args)}</p>

      {error && (
        <p className="text-xs text-destructive mt-1 truncate" title={error}>
          {error}
        </p>
      )}
    </div>
  );
}

export default ExecutionHistory;
