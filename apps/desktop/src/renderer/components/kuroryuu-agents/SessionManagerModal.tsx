/**
 * Session Manager Modal - Full control panel for all Kuroryuu agent sessions
 * Opens when clicking the SESSION MANAGER node in Agent Flow
 */
import React from 'react';
import { X, Cpu, Plus, Skull, Play, CheckCircle, XCircle, Square } from 'lucide-react';
import type { SDKAgentSessionSummary } from '../../types/sdk-agent';

interface SessionManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: SDKAgentSessionSummary[];
  onStopSession: (id: string) => void;
  onStopAll: () => void;
  onSpawnAgent: () => void;
  onSelectSession: (id: string) => void;
}

// Stats card component
function StatCard({ label, value, color }: { label: string; value: number; color: 'cyan' | 'green' | 'blue' | 'red' }) {
  const colorClasses = {
    cyan: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10',
    green: 'text-green-400 border-green-500/30 bg-green-500/10',
    blue: 'text-blue-400 border-blue-500/30 bg-blue-500/10',
    red: 'text-red-400 border-red-500/30 bg-red-500/10',
  };

  return (
    <div className={`flex-1 px-4 py-3 rounded-lg border ${colorClasses[color]}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs uppercase tracking-wider opacity-70">{label}</div>
    </div>
  );
}

// Session row component
function SessionRow({
  session,
  onStop,
  onSelect,
}: {
  session: SDKAgentSessionSummary;
  onStop?: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const isRunning = session.status === 'starting' || session.status === 'running';
  const promptPreview = session.prompt.length > 50
    ? session.prompt.substring(0, 50) + '...'
    : session.prompt;

  return (
    <div
      className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-black/30 border border-white/5 hover:border-white/20 transition-colors cursor-pointer group"
      onClick={() => onSelect(session.id)}
    >
      {/* Session ID */}
      <code className="text-xs font-mono text-primary/80 w-16 shrink-0">
        {session.id.slice(0, 8)}
      </code>

      {/* Prompt */}
      <span className="flex-1 text-sm text-gray-300 truncate" title={session.prompt}>
        {promptPreview}
      </span>

      {/* Role badge */}
      {session.role && (
        <span className="px-1.5 py-0.5 rounded bg-primary/20 text-primary text-[10px]">
          {session.role}
        </span>
      )}

      {/* Status */}
      {isRunning ? (
        <span className="flex items-center gap-1.5 text-xs text-green-400">
          <Play className="w-3 h-3 animate-pulse" />
          {session.status === 'starting' ? 'Starting' : 'Running'}
        </span>
      ) : session.status === 'completed' ? (
        <span className="flex items-center gap-1.5 text-xs text-blue-400">
          <CheckCircle className="w-3 h-3" />
          Completed
        </span>
      ) : session.status === 'error' ? (
        <span className="flex items-center gap-1.5 text-xs text-red-400">
          <XCircle className="w-3 h-3" />
          Error
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-xs text-yellow-400">
          <Square className="w-3 h-3" />
          Cancelled
        </span>
      )}

      {/* Stop button - only for running sessions */}
      {isRunning && onStop && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onStop(session.id);
          }}
          className="px-2.5 py-1 text-xs bg-red-500/20 border border-red-500/50 text-red-400 rounded hover:bg-red-500/40 transition-colors"
          title="Stop session"
        >
          <Square className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

// Session group component
function SessionGroup({
  title,
  sessions,
  onStop,
  onSelect,
}: {
  title: string;
  sessions: SDKAgentSessionSummary[];
  onStop?: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  if (sessions.length === 0) return null;

  return (
    <div>
      <h3 className="text-xs uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-2">
        {title === 'Running' ? (
          <Play className="w-3 h-3 text-green-400" />
        ) : (
          <CheckCircle className="w-3 h-3 text-blue-400" />
        )}
        {title} ({sessions.length})
      </h3>
      <div className="space-y-1.5">
        {sessions.map((session) => (
          <SessionRow
            key={session.id}
            session={session}
            onStop={onStop}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}

export function SessionManagerModal({
  isOpen,
  onClose,
  sessions,
  onStopSession,
  onStopAll,
  onSpawnAgent,
  onSelectSession,
}: SessionManagerModalProps) {
  if (!isOpen) return null;

  const running = sessions.filter((s) => s.status === 'starting' || s.status === 'running');
  const completed = sessions.filter((s) => s.status === 'completed');
  const failed = sessions.filter((s) => s.status === 'error' || s.status === 'cancelled');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-card border border-border rounded-xl shadow-2xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-black/50">
          <div className="flex items-center gap-3">
            <Cpu className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Session Manager</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Stats */}
        <div className="flex gap-3 p-4 border-b border-border bg-black/30">
          <StatCard label="Total" value={sessions.length} color="cyan" />
          <StatCard label="Running" value={running.length} color="green" />
          <StatCard label="Completed" value={completed.length} color="blue" />
          {failed.length > 0 && (
            <StatCard label="Failed" value={failed.length} color="red" />
          )}
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {sessions.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Cpu className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No sessions</p>
              <p className="text-xs mt-1">Click "New Agent" to spawn one</p>
            </div>
          ) : (
            <>
              <SessionGroup
                title="Running"
                sessions={running}
                onStop={onStopSession}
                onSelect={onSelectSession}
              />
              <SessionGroup
                title="Completed"
                sessions={completed}
                onSelect={onSelectSession}
              />
              {failed.length > 0 && (
                <SessionGroup
                  title="Failed"
                  sessions={failed}
                  onSelect={onSelectSession}
                />
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-black/50">
          <div>
            {running.length > 0 && (
              <button
                onClick={onStopAll}
                className="flex items-center gap-2 px-4 py-2 text-sm bg-red-500/20 border border-red-500/50 text-red-400 rounded-lg hover:bg-red-500/40 transition-colors"
              >
                <Skull className="w-4 h-4" />
                Stop All ({running.length})
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onSpawnAgent}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-primary/20 border border-primary/50 text-primary rounded-lg hover:bg-primary/40 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Agent
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm bg-white/5 border border-white/20 text-gray-300 rounded-lg hover:bg-white/10 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default SessionManagerModal;
