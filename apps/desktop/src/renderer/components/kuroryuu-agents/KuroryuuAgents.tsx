/**
 * KuroryuuAgents - Main panel for monitoring background coding agent sessions
 *
 * Shows sessions spawned via k_bash and monitored via k_process.
 * Features two views: Sessions (list) and Agent Flow (graph)
 */
import { useEffect, useState } from 'react';
import { RefreshCw, Bot, AlertCircle, List, GitBranch, Archive, Trash2, X, ClipboardList } from 'lucide-react';
import { useKuroryuuAgentsStore } from '../../stores/kuroryuu-agents-store';
import { SessionCard } from './SessionCard';
import { SessionLogViewer } from './SessionLogViewer';
import { AgentFlowPanel } from './AgentFlowPanel';
import { FindingsToTasksModal } from './FindingsToTasksModal';

type ViewTab = 'sessions' | 'flow';

export function KuroryuuAgents() {
  const {
    sessions,
    archivedSessions,
    selectedSessionId,
    isLoading,
    error,
    loadSessions,
    selectSession,
    killSession,
    deleteArchived,
    startPolling,
    stopPolling,
  } = useKuroryuuAgentsStore();

  // Tab state
  const [activeTab, setActiveTab] = useState<ViewTab>('sessions');

  // Findings modal state
  const [findingsModalOpen, setFindingsModalOpen] = useState(false);

  // Start polling on mount, stop on unmount
  useEffect(() => {
    startPolling(5000);
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  const selectedSession = sessions.find((s) => s.id === selectedSessionId);
  const selectedArchived = archivedSessions.find((a) => a.id === selectedSessionId);
  const runningSessions = sessions.filter((s) => s.running);
  const stoppedSessions = sessions.filter((s) => !s.running);
  // Filter archived sessions that aren't in the live sessions list
  const liveSessionIds = new Set(sessions.map(s => s.id));
  const displayedArchived = archivedSessions.filter(a => !liveSessionIds.has(a.id));

  const handleKill = async (sessionId: string) => {
    await killSession(sessionId);
    if (selectedSessionId === sessionId) {
      selectSession(null);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-border p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Bot className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold">Kuroryuu Agents</h1>
          {runningSessions.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-xs font-medium">
              {runningSessions.length} running
            </span>
          )}

          {/* Tab Navigation */}
          <div className="flex items-center gap-1 ml-4 bg-secondary/50 rounded-lg p-1">
            <button
              onClick={() => setActiveTab('sessions')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === 'sessions'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              Sessions
            </button>
            <button
              onClick={() => setActiveTab('flow')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === 'flow'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              <GitBranch className="w-3.5 h-3.5" />
              Agent Flow
            </button>
          </div>
        </div>
        <button
          onClick={() => loadSessions()}
          disabled={isLoading}
          className="flex items-center gap-2 px-3 py-1.5 rounded bg-secondary hover:bg-secondary/80 transition-colors text-sm"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mx-4 mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span className="text-sm text-red-400">{error}</span>
        </div>
      )}

      {/* Content */}
      {activeTab === 'sessions' ? (
        <div className="flex-1 overflow-hidden flex">
          {/* Session List */}
          <div className="w-80 border-r border-border flex-shrink-0 overflow-y-auto p-4 space-y-4">
            {sessions.length === 0 && displayedArchived.length === 0 ? (
              <div className="text-center py-12">
                <Bot className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-muted-foreground text-sm">No Kuroryuu agent sessions</p>
                <p className="text-muted-foreground/60 text-xs mt-2">
                  Use k_bash with background=true to spawn agents
                </p>
              </div>
            ) : (
              <>
                {/* Running Sessions */}
                {runningSessions.length > 0 && (
                  <div>
                    <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                      Running ({runningSessions.length})
                    </h3>
                    <div className="space-y-2">
                      {runningSessions.map((session) => (
                        <SessionCard
                          key={session.id}
                          session={session}
                          isSelected={selectedSessionId === session.id}
                          onSelect={() => selectSession(session.id)}
                          onKill={() => handleKill(session.id)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Completed Sessions (live) */}
                {stoppedSessions.length > 0 && (
                  <div>
                    <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                      Completed ({stoppedSessions.length})
                    </h3>
                    <div className="space-y-2">
                      {stoppedSessions.map((session) => (
                        <SessionCard
                          key={session.id}
                          session={session}
                          isSelected={selectedSessionId === session.id}
                          onSelect={() => selectSession(session.id)}
                          onKill={() => handleKill(session.id)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Archived Sessions (persisted) */}
                {displayedArchived.length > 0 && (
                  <div>
                    <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1.5">
                      <Archive className="w-3 h-3" />
                      Archived ({displayedArchived.length})
                    </h3>
                    <div className="space-y-2">
                      {displayedArchived.map((archived) => (
                        <div
                          key={archived.id}
                          onClick={() => selectSession(archived.id)}
                          className={`p-3 rounded-lg border cursor-pointer transition-colors ${
                            selectedSessionId === archived.id
                              ? 'border-primary bg-primary/10'
                              : 'border-border hover:border-primary/50 bg-card'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-mono text-xs text-primary truncate flex-1">
                              {archived.id}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteArchived(archived.id);
                              }}
                              className="p-1 rounded hover:bg-red-500/20 transition-colors text-muted-foreground hover:text-red-400"
                              title="Delete archived session"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {archived.session.command}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                              archived.session.exit_code === 0
                                ? 'bg-blue-500/20 text-blue-400'
                                : 'bg-red-500/20 text-red-400'
                            }`}>
                              Exit {archived.session.exit_code}
                            </span>
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(archived.archived_at).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Log Viewer */}
          <div className="flex-1 p-4 overflow-hidden">
            {selectedSession ? (
              <SessionLogViewer
                session={selectedSession}
                onKill={() => handleKill(selectedSession.id)}
                onClose={() => selectSession(null)}
              />
            ) : selectedArchived ? (
              /* Archived Session Log Viewer */
              <div className="h-full flex flex-col bg-card rounded-lg border border-border">
                <div className="flex items-center justify-between px-4 py-2 border-b border-border">
                  <div className="flex items-center gap-2">
                    <Archive className="w-4 h-4 text-muted-foreground" />
                    <span className="font-mono text-sm text-primary">{selectedArchived.id}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      selectedArchived.session.exit_code === 0
                        ? 'bg-blue-500/20 text-blue-400'
                        : 'bg-red-500/20 text-red-400'
                    }`}>
                      Exit {selectedArchived.session.exit_code}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      (Archived)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setFindingsModalOpen(true)}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-primary/20 border border-primary/50 text-primary rounded hover:bg-primary/40 transition-colors"
                      title="Convert findings to tasks"
                    >
                      <ClipboardList className="w-3.5 h-3.5" />
                      Tasks
                    </button>
                    <button
                      onClick={() => deleteArchived(selectedArchived.id)}
                      className="p-1.5 rounded hover:bg-red-500/20 transition-colors text-red-400"
                      title="Delete archived session"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => selectSession(null)}
                      className="p-1.5 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                      title="Close"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <pre className="flex-1 overflow-auto p-4 font-mono text-xs text-foreground/90 bg-background/50 whitespace-pre-wrap">
                  {selectedArchived.logs || (
                    <span className="text-muted-foreground italic">No logs available</span>
                  )}
                </pre>
              </div>
            ) : (
              <div className="h-full flex items-center justify-center">
                <div className="text-center">
                  <Bot className="w-16 h-16 text-muted-foreground/20 mx-auto mb-4" />
                  <p className="text-muted-foreground">Select a session to view logs</p>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Agent Flow Graph View - Self-contained with embedded log viewer */
        <div className="flex-1 overflow-hidden">
          <AgentFlowPanel />
        </div>
      )}

      {/* Findings to Tasks Modal */}
      {selectedArchived && (
        <FindingsToTasksModal
          isOpen={findingsModalOpen}
          onClose={() => setFindingsModalOpen(false)}
          sessionId={selectedArchived.id}
          logs={selectedArchived.logs || ''}
        />
      )}
    </div>
  );
}
