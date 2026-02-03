/**
 * CodingAgents - Main panel for monitoring background coding agent sessions
 *
 * Shows sessions spawned via k_bash and monitored via k_process.
 */
import { useEffect } from 'react';
import { RefreshCw, Bot, AlertCircle } from 'lucide-react';
import { useCodingAgentsStore } from '../../stores/coding-agents-store';
import { SessionCard } from './SessionCard';
import { SessionLogViewer } from './SessionLogViewer';

export function CodingAgents() {
  const {
    sessions,
    selectedSessionId,
    isLoading,
    error,
    loadSessions,
    selectSession,
    killSession,
    startPolling,
    stopPolling,
  } = useCodingAgentsStore();

  // Start polling on mount, stop on unmount
  useEffect(() => {
    startPolling(5000);
    return () => stopPolling();
  }, [startPolling, stopPolling]);

  const selectedSession = sessions.find((s) => s.id === selectedSessionId);
  const runningSessions = sessions.filter((s) => s.running);
  const stoppedSessions = sessions.filter((s) => !s.running);

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
          <h1 className="text-xl font-bold">Coding Agents</h1>
          {runningSessions.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-xs font-medium">
              {runningSessions.length} running
            </span>
          )}
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
      <div className="flex-1 overflow-hidden flex">
        {/* Session List */}
        <div className="w-80 border-r border-border flex-shrink-0 overflow-y-auto p-4 space-y-4">
          {sessions.length === 0 ? (
            <div className="text-center py-12">
              <Bot className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground text-sm">No coding agent sessions</p>
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

              {/* Completed Sessions */}
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
            </>
          )}
        </div>

        {/* Log Viewer */}
        <div className="flex-1 p-4 overflow-hidden">
          {selectedSession ? (
            <SessionLogViewer
              session={selectedSession}
              onKill={() => handleKill(selectedSession.id)}
            />
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
    </div>
  );
}
