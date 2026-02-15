/**
 * CLIAgentsPanel - Clean panel for CLI agent sessions
 *
 * Shows CLI agent sessions spawned via k_bash and monitored via k_process.
 * Three sections: Running, Completed, Archived
 */
import { useEffect, useState } from 'react';
import {
  Play,
  Square,
  Archive,
  ChevronDown,
  ChevronRight,
  Trash2,
  Clock,
  FolderOpen,
  Terminal as TerminalIcon
} from 'lucide-react';
import { useCodingAgentsStore } from '../../stores/coding-agents-store';
import type { CodingAgentSession } from '../../stores/coding-agents-store';
import type { ArchivedSession } from '../../stores/coding-agents-persistence';
import { CLISpawnDialog } from './CLISpawnDialog';

export function CLIAgentsPanel() {
  const {
    sessions,
    archivedSessions,
    selectedSessionId,
    selectSession,
    killSession,
    deleteArchived,
    getSessionLog,
    getArchivedLog,
    startPolling,
    stopPolling,
  } = useCodingAgentsStore();

  const [showSpawnDialog, setShowSpawnDialog] = useState(false);
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set());
  const [sessionLogs, setSessionLogs] = useState<Record<string, string>>({});

  // Start polling on mount
  useEffect(() => {
    startPolling(5000);
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  // Separate sessions by status
  const runningSessions = sessions.filter(s => s.running);
  const completedSessions = sessions.filter(s => !s.running);

  // Filter archived sessions that aren't in the live sessions list
  const liveSessionIds = new Set(sessions.map(s => s.id));
  const displayedArchived = archivedSessions.filter(a => !liveSessionIds.has(a.id));

  const toggleExpand = async (sessionId: string, isArchived: boolean) => {
    const newExpanded = new Set(expandedSessions);

    if (expandedSessions.has(sessionId)) {
      newExpanded.delete(sessionId);
    } else {
      newExpanded.add(sessionId);

      // Load logs if not already loaded
      if (!sessionLogs[sessionId]) {
        if (isArchived) {
          const log = getArchivedLog(sessionId);
          if (log) {
            setSessionLogs(prev => ({ ...prev, [sessionId]: log }));
          }
        } else {
          const log = await getSessionLog(sessionId, 0, 500);
          setSessionLogs(prev => ({ ...prev, [sessionId]: log }));
        }
      }
    }

    setExpandedSessions(newExpanded);
  };

  const handleKill = async (sessionId: string) => {
    await killSession(sessionId);
  };

  const handleDelete = async (sessionId: string) => {
    await deleteArchived(sessionId);
    setExpandedSessions(prev => {
      const next = new Set(prev);
      next.delete(sessionId);
      return next;
    });
  };

  const renderSessionCard = (session: CodingAgentSession, isArchived: boolean = false) => {
    const isExpanded = expandedSessions.has(session.id);
    const log = sessionLogs[session.id] || '';

    return (
      <div
        key={session.id}
        className="rounded-lg border border-zinc-700 bg-zinc-800/50 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-3 hover:bg-zinc-700/30 transition-colors">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <button
              onClick={() => toggleExpand(session.id, isArchived)}
              className="p-1 hover:bg-zinc-600 rounded transition-colors flex-shrink-0"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-zinc-400" />
              ) : (
                <ChevronRight className="w-4 h-4 text-zinc-400" />
              )}
            </button>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-mono text-xs text-primary truncate">
                  {session.id.slice(0, 12)}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-xs flex-shrink-0 ${
                  session.running
                    ? 'bg-green-500/20 text-green-400'
                    : session.exit_code === 0
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'bg-red-500/20 text-red-400'
                }`}>
                  {session.running ? 'running' : session.exit_code === 0 ? 'completed' : `error (${session.exit_code})`}
                </span>
              </div>
              <div className="text-sm text-zinc-300 truncate font-mono">
                {session.command}
              </div>
              <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
                <span className="flex items-center gap-1">
                  <FolderOpen className="w-3 h-3" />
                  {session.workdir || '/'}
                </span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(session.started_at).toLocaleString()}
                </span>
                {session.pty && (
                  <span className="flex items-center gap-1">
                    <TerminalIcon className="w-3 h-3" />
                    PTY
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {session.running ? (
              <button
                onClick={() => handleKill(session.id)}
                className="p-2 rounded hover:bg-red-500/20 transition-colors text-red-400"
                title="Kill session"
              >
                <Square className="w-4 h-4" />
              </button>
            ) : isArchived ? (
              <button
                onClick={() => handleDelete(session.id)}
                className="p-2 rounded hover:bg-red-500/20 transition-colors text-red-400"
                title="Delete archived session"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            ) : null}
          </div>
        </div>

        {/* Expanded Log Viewer */}
        {isExpanded && (
          <div className="border-t border-zinc-700 bg-zinc-900/50 p-3">
            <div className="bg-zinc-950 rounded border border-zinc-700 overflow-auto max-h-64">
              <pre className="p-3 text-xs font-mono text-zinc-300 whitespace-pre-wrap">
                {log || <span className="text-zinc-500 italic">No logs available</span>}
              </pre>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderArchivedCard = (archived: ArchivedSession) => {
    return renderSessionCard(archived.session, true);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-zinc-700">
        <div className="flex items-center gap-3">
          <TerminalIcon className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold">CLI Agents</h2>
          {runningSessions.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-xs font-medium">
              {runningSessions.length} running
            </span>
          )}
        </div>
        <button
          onClick={() => setShowSpawnDialog(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm"
        >
          <Play className="w-4 h-4" />
          Spawn
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {sessions.length === 0 && displayedArchived.length === 0 ? (
          <div className="text-center py-12">
            <TerminalIcon className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
            <p className="text-zinc-400 text-sm">No CLI agent sessions</p>
            <p className="text-zinc-500 text-xs mt-2">
              Click "Spawn" to start a CLI agent (Claude, Codex, Kiro, Aider, etc.)
            </p>
          </div>
        ) : (
          <>
            {/* Running Sessions */}
            {runningSessions.length > 0 && (
              <div>
                <h3 className="text-xs uppercase tracking-wider text-zinc-500 mb-3 font-semibold">
                  Running ({runningSessions.length})
                </h3>
                <div className="space-y-2">
                  {runningSessions.map(session => renderSessionCard(session))}
                </div>
              </div>
            )}

            {/* Completed Sessions */}
            {completedSessions.length > 0 && (
              <div>
                <h3 className="text-xs uppercase tracking-wider text-zinc-500 mb-3 font-semibold">
                  Completed ({completedSessions.length})
                </h3>
                <div className="space-y-2">
                  {completedSessions.map(session => renderSessionCard(session))}
                </div>
              </div>
            )}

            {/* Archived Sessions */}
            {displayedArchived.length > 0 && (
              <div>
                <h3 className="text-xs uppercase tracking-wider text-zinc-500 mb-3 font-semibold flex items-center gap-1.5">
                  <Archive className="w-3 h-3" />
                  Archived ({displayedArchived.length})
                </h3>
                <div className="space-y-2">
                  {displayedArchived.map(archived => renderArchivedCard(archived))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Spawn Dialog */}
      <CLISpawnDialog
        isOpen={showSpawnDialog}
        onClose={() => setShowSpawnDialog(false)}
      />
    </div>
  );
}
