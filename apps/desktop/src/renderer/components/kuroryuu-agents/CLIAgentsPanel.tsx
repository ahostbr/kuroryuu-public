/**
 * CLIAgentsPanel - Panel for CLI agent sessions
 *
 * Shows CLI agent sessions spawned via Electron IPC PTY.
 * Uses kuroryuu-agents-store (IPC events) instead of k_process polling.
 * After spawn, auto-navigates to Sessions tab for terminal view.
 */
import { useEffect, useState } from 'react';
import {
  Play,
  Square,
  Archive,
  Trash2,
  Clock,
  FolderOpen,
  ExternalLink,
  Terminal as TerminalIcon
} from 'lucide-react';
import { useKuroryuuAgentsStore } from '../../stores/kuroryuu-agents-store';
import { CLISpawnDialog } from './CLISpawnDialog';

export function CLIAgentsPanel() {
  const {
    sessions,
    archivedSessions,
    stopAgent,
    deleteArchived,
    subscribe,
    unsubscribe,
  } = useKuroryuuAgentsStore();

  const [showSpawnDialog, setShowSpawnDialog] = useState(false);

  // Subscribe to IPC events on mount
  useEffect(() => {
    subscribe();
    return () => unsubscribe();
  }, [subscribe, unsubscribe]);

  // Filter to CLI-backend sessions only
  const cliSessions = sessions.filter(s => s.backend === 'cli');
  const runningSessions = cliSessions.filter(s => s.status === 'starting' || s.status === 'running');
  const completedSessions = cliSessions.filter(s => s.status !== 'starting' && s.status !== 'running');

  // Filter archived sessions to CLI ones
  const liveIds = new Set(cliSessions.map(s => s.id));
  const cliArchived = archivedSessions.filter(a =>
    a.id.startsWith('cli-') && !liveIds.has(a.id)
  );

  const handleStop = async (sessionId: string) => {
    await stopAgent(sessionId);
  };

  const handleDelete = async (sessionId: string) => {
    await deleteArchived(sessionId);
  };

  // Navigate to Sessions tab to view terminal
  const viewInSessions = (sessionId: string) => {
    // Use the store's selectSession + dispatch tab change
    // The parent KuroryuuAgents component listens to selectedSessionId
    useKuroryuuAgentsStore.getState().selectSession(sessionId);

    // Dispatch custom event to switch to sessions tab
    window.dispatchEvent(new CustomEvent('kuroryuu-agents:switch-tab', {
      detail: { tab: 'sessions', sessionId }
    }));
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
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
        {cliSessions.length === 0 && cliArchived.length === 0 ? (
          <div className="text-center py-12">
            <TerminalIcon className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
            <p className="text-muted-foreground text-sm">No CLI agent sessions</p>
            <p className="text-muted-foreground/60 text-xs mt-2">
              Click "Spawn" to start a CLI agent (Claude, Codex, Kiro, Aider, etc.)
            </p>
            <p className="text-muted-foreground/40 text-xs mt-1">
              Sessions open in the Sessions tab with a terminal view
            </p>
          </div>
        ) : (
          <>
            {/* Running Sessions */}
            {runningSessions.length > 0 && (
              <div>
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3 font-semibold">
                  Running ({runningSessions.length})
                </h3>
                <div className="space-y-2">
                  {runningSessions.map(session => (
                    <div
                      key={session.id}
                      className="rounded-lg border border-border bg-card overflow-hidden"
                    >
                      <div className="flex items-center justify-between p-3 hover:bg-secondary/30 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-xs text-primary truncate">
                              {session.id.slice(0, 12)}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-xs bg-green-500/20 text-green-400">
                              {session.status}
                            </span>
                            {session.ptyId && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-400">
                                PTY
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-foreground/80 truncate">
                            {session.prompt}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <FolderOpen className="w-3 h-3" />
                              {session.cwd || '/'}
                            </span>
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {new Date(session.startedAt).toLocaleString()}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                          <button
                            onClick={() => viewInSessions(session.id)}
                            className="p-2 rounded hover:bg-primary/20 transition-colors text-primary"
                            title="View terminal in Sessions tab"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleStop(session.id)}
                            className="p-2 rounded hover:bg-red-500/20 transition-colors text-red-400"
                            title="Stop session"
                          >
                            <Square className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Completed Sessions */}
            {completedSessions.length > 0 && (
              <div>
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3 font-semibold">
                  Completed ({completedSessions.length})
                </h3>
                <div className="space-y-2">
                  {completedSessions.map(session => (
                    <div
                      key={session.id}
                      className="rounded-lg border border-border bg-card overflow-hidden"
                    >
                      <div className="flex items-center justify-between p-3 hover:bg-secondary/30 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-xs text-primary truncate">
                              {session.id.slice(0, 12)}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-xs ${
                              session.status === 'completed'
                                ? 'bg-blue-500/20 text-blue-400'
                                : 'bg-red-500/20 text-red-400'
                            }`}>
                              {session.status}
                            </span>
                          </div>
                          <div className="text-sm text-foreground/80 truncate">
                            {session.prompt}
                          </div>
                          <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {new Date(session.startedAt).toLocaleString()}
                            </span>
                            {session.totalCostUsd > 0 && (
                              <span>${session.totalCostUsd.toFixed(4)}</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                          <button
                            onClick={() => viewInSessions(session.id)}
                            className="p-2 rounded hover:bg-primary/20 transition-colors text-primary"
                            title="View in Sessions tab"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Archived Sessions */}
            {cliArchived.length > 0 && (
              <div>
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-3 font-semibold flex items-center gap-1.5">
                  <Archive className="w-3 h-3" />
                  Archived ({cliArchived.length})
                </h3>
                <div className="space-y-2">
                  {cliArchived.map(archived => (
                    <div
                      key={archived.id}
                      className="rounded-lg border border-border bg-card overflow-hidden"
                    >
                      <div className="flex items-center justify-between p-3 hover:bg-secondary/30 transition-colors">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-xs text-primary truncate">
                              {archived.id.slice(0, 12)}
                            </span>
                            <span className={`px-2 py-0.5 rounded-full text-xs ${
                              archived.session.exit_code === 0
                                ? 'bg-blue-500/20 text-blue-400'
                                : 'bg-red-500/20 text-red-400'
                            }`}>
                              {archived.session.exit_code === 0 ? 'OK' : `Exit ${archived.session.exit_code}`}
                            </span>
                          </div>
                          <div className="text-sm text-foreground/80 truncate">
                            {archived.session.command}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {new Date(archived.archived_at).toLocaleDateString()}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDelete(archived.id)}
                          className="p-2 rounded hover:bg-red-500/20 transition-colors text-red-400 flex-shrink-0"
                          title="Delete archived session"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
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
