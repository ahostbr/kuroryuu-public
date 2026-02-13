/**
 * KuroryuuAgents - Main panel for monitoring SDK-based coding agent sessions
 *
 * Shows sessions managed by Claude Agent SDK via IPC.
 * Features three views: Sessions (list), Agent Flow (graph), Terminal Agents
 */
import { useEffect, useRef, useState } from 'react';
import { RefreshCw, Bot, AlertCircle, List, GitBranch, Archive, Trash2, X, ClipboardList, Users, Plus, Brain, TerminalSquare, MessageSquare } from 'lucide-react';
import { useKuroryuuAgentsStore } from '../../stores/kuroryuu-agents-store';
import { useIdentityStore } from '../../stores/identity-store';
import { SessionCard } from './SessionCard';
import { SdkMessageRenderer } from './SdkMessageRenderer';
import { SessionTerminal, SessionTerminalPlaceholder } from './SessionTerminal';
import { AgentFlowPanel } from './AgentFlowPanel';
import { FindingsToTasksModal } from './FindingsToTasksModal';
import { AgentsEmptyState } from './AgentsEmptyState';
import { AgentsTab } from '../command-center/tabs/AgentsTab';
import { SpawnAgentDialog } from './SpawnAgentDialog';
import { AssistantPanel } from '../personal-assistant';
import { toast } from '../ui/toast';
import type { SDKAgentConfig } from '../../types/sdk-agent';

type ViewTab = 'sessions' | 'flow' | 'terminal-agents' | 'assistant';
type DetailTab = 'terminal' | 'messages';

export function KuroryuuAgents() {
  const {
    sessions,
    archivedSessions,
    selectedSessionId,
    isLoading,
    error,
    loadSessions,
    selectSession,
    stopAgent,
    startAgent,
    deleteArchived,
    subscribe,
    unsubscribe,
  } = useKuroryuuAgentsStore();

  // Tab state
  const [activeTab, setActiveTab] = useState<ViewTab>('sessions');

  // Spawn dialog state
  const [showSpawnDialog, setShowSpawnDialog] = useState(false);

  // Findings modal state
  const [findingsModalOpen, setFindingsModalOpen] = useState(false);

  // Detail view tab (terminal vs messages)
  const [detailTab, setDetailTab] = useState<DetailTab>('terminal');
  const termWrapperRef = useRef<HTMLDivElement>(null);

  // Assistant badge
  const { newActionCount, incrementNewActionCount, clearNewActionCount } = useIdentityStore();

  // Subscribe to SDK events on mount, unsubscribe on unmount
  useEffect(() => {
    subscribe();
    return () => unsubscribe();
  }, [subscribe, unsubscribe]);

  // Auto-navigate to sessions tab when CLI spawns
  useEffect(() => {
    const api = (window as unknown as { electronAPI: { sdkAgent: {
      onCliSessionSpawned?: (cb: (sid: string) => void) => () => void;
    }}}).electronAPI?.sdkAgent;

    if (!api?.onCliSessionSpawned) return;

    const off = api.onCliSessionSpawned((sessionId) => {
      setActiveTab('sessions');
      selectSession(sessionId);
    });

    return off;
  }, [selectSession]);

  // Listen for heartbeat completion events (badge + toast)
  useEffect(() => {
    const unsubCompleted = window.electronAPI.identity.onHeartbeatCompleted((data) => {
      if (data.actionsCount > 0) {
        if (activeTab !== 'assistant') {
          incrementNewActionCount(data.actionsCount);
        }
        // Show toast (toast mode is the default — main process sends this for all modes,
        // but the renderer only shows toast when the user can see it)
        toast.success(
          `Heartbeat: ${data.actionsCount} action${data.actionsCount !== 1 ? 's' : ''} ${data.status === 'failed' ? 'failed' : 'executed'}`
        );
      } else if (data.status === 'failed') {
        toast.error('Heartbeat failed');
      }
    });

    // Listen for TTS notifications from heartbeat
    const unsubTts = window.electronAPI.identity.onHeartbeatTts((text) => {
      window.electronAPI.tts.speak({ text }).catch(() => {
        // TTS unavailable, fall back to toast
        toast.success(text);
      });
    });

    return () => {
      unsubCompleted();
      unsubTts();
    };
  }, [activeTab, incrementNewActionCount]);

  // Auto-set detail tab based on selected session type
  useEffect(() => {
    const session = sessions.find((s) => s.id === selectedSessionId);
    if (session?.ptyId) {
      setDetailTab('terminal');
    } else {
      setDetailTab('messages');
    }
  }, [selectedSessionId, sessions]);

  // Force terminal refit after tab/session changes (Marketing terminal sizing pattern).
  // Delayed padding nudge guarantees ResizeObserver fires AFTER Terminal.tsx sets up its observer.
  useEffect(() => {
    const el = termWrapperRef.current;
    if (!el || detailTab !== 'terminal') return;
    const timers = [300, 600, 1000].map(delay =>
      setTimeout(() => {
        el.style.paddingRight = '1px';
        requestAnimationFrame(() => { el.style.paddingRight = ''; });
      }, delay)
    );
    return () => timers.forEach(t => clearTimeout(t));
  }, [detailTab, selectedSessionId]);

  const selectedSession = sessions.find((s) => s.id === selectedSessionId);
  const selectedArchived = archivedSessions.find((a) => a.id === selectedSessionId);
  const runningSessions = sessions.filter((s) => s.status === 'starting' || s.status === 'running');
  const completedSessions = sessions.filter((s) => s.status !== 'starting' && s.status !== 'running');
  const hasActiveCli = sessions.some(s => s.backend === 'cli' && (s.status === 'starting' || s.status === 'running'));
  // Filter archived sessions that aren't in the live sessions list
  const liveSessionIds = new Set(sessions.map(s => s.id));
  const displayedArchived = archivedSessions.filter(a => !liveSessionIds.has(a.id));

  const handleStop = async (sessionId: string) => {
    await stopAgent(sessionId);
    if (selectedSessionId === sessionId) {
      selectSession(null);
    }
  };

  const handleSpawn = async (config: SDKAgentConfig) => {
    const sessionId = await startAgent(config);
    if (sessionId) {
      selectSession(sessionId);
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
            <button
              onClick={() => setActiveTab('terminal-agents')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === 'terminal-agents'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              Terminal Agents
            </button>
            <button
              onClick={() => {
                setActiveTab('assistant');
                clearNewActionCount();
              }}
              className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === 'assistant'
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
            >
              <Brain className="w-3.5 h-3.5" />
              Assistant
              {newActionCount > 0 && activeTab !== 'assistant' && (
                <span className="absolute -top-1 -right-1 w-4 h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold">
                  {newActionCount > 9 ? '9+' : newActionCount}
                </span>
              )}
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowSpawnDialog(true)}
            disabled={hasActiveCli}
            title={hasActiveCli ? 'CLI session active — SDK spawn blocked' : 'Spawn a new agent'}
            className={`flex items-center gap-2 px-3 py-1.5 rounded transition-colors text-sm ${
              hasActiveCli
                ? 'bg-secondary text-muted-foreground cursor-not-allowed opacity-50'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            }`}
          >
            <Plus className="w-4 h-4" />
            Spawn
          </button>
          <button
            onClick={() => loadSessions()}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1.5 rounded bg-secondary hover:bg-secondary/80 transition-colors text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mx-4 mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span className="text-sm text-red-400">{error}</span>
        </div>
      )}

      {/* Content */}
      {activeTab === 'assistant' ? (
        <div className="flex-1 overflow-hidden">
          <AssistantPanel />
        </div>
      ) : activeTab === 'terminal-agents' ? (
        <div className="flex-1 overflow-hidden">
          <AgentsTab />
        </div>
      ) : activeTab === 'sessions' ? (
        <div className="flex-1 overflow-hidden flex">
          {/* Session List */}
          <div className="w-80 border-r border-border flex-shrink-0 overflow-y-auto p-4 space-y-4">
            {sessions.length === 0 && displayedArchived.length === 0 ? (
              <div className="text-center py-12">
                <Bot className="w-12 h-12 text-muted-foreground/30 mx-auto mb-4" />
                <p className="text-muted-foreground text-sm">No agent sessions</p>
                <p className="text-muted-foreground/60 text-xs mt-2">
                  Click "Spawn" to start an SDK agent
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
                          onStop={() => handleStop(session.id)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Completed Sessions */}
                {completedSessions.length > 0 && (
                  <div>
                    <h3 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">
                      Completed ({completedSessions.length})
                    </h3>
                    <div className="space-y-2">
                      {completedSessions.map((session) => (
                        <SessionCard
                          key={session.id}
                          session={session}
                          isSelected={selectedSessionId === session.id}
                          onSelect={() => selectSession(session.id)}
                          onStop={() => handleStop(session.id)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Archived Sessions */}
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
                              {archived.id.slice(0, 12)}
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
                              {archived.session.exit_code === 0 ? 'OK' : `Exit ${archived.session.exit_code}`}
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

          {/* Message Viewer */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {selectedSession ? (
              <div className="flex-1 min-h-0 flex flex-col bg-card rounded-lg border border-border m-4">
                {/* Session Header */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-border">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-sm text-primary">{selectedSession.id.slice(0, 12)}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs ${
                      selectedSession.status === 'running' || selectedSession.status === 'starting'
                        ? 'bg-green-500/20 text-green-400'
                        : selectedSession.status === 'completed'
                          ? 'bg-blue-500/20 text-blue-400'
                          : 'bg-red-500/20 text-red-400'
                    }`}>
                      {selectedSession.status}
                    </span>
                    {selectedSession.role && (
                      <span className="px-2 py-0.5 rounded bg-primary/20 text-primary text-xs">
                        {selectedSession.role}
                      </span>
                    )}
                    {selectedSession.totalCostUsd > 0 && (
                      <span className="text-xs text-muted-foreground">
                        ${selectedSession.totalCostUsd.toFixed(4)}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => selectSession(null)}
                    className="p-1.5 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                {/* Detail tab bar */}
                <div className="flex items-center gap-1 px-4 py-1.5 border-b border-border bg-secondary/20">
                  <button
                    onClick={() => setDetailTab('terminal')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      detailTab === 'terminal'
                        ? 'bg-primary/20 text-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                    }`}
                  >
                    <TerminalSquare className="w-3.5 h-3.5" />
                    Terminal
                  </button>
                  <button
                    onClick={() => setDetailTab('messages')}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      detailTab === 'messages'
                        ? 'bg-primary/20 text-primary'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                    }`}
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Messages
                  </button>
                </div>
                {/* Detail content — flex-1 min-h-0 overflow-hidden matches Marketing/TerminalGrid sizing */}
                <div ref={termWrapperRef} className="flex-1 min-h-0 overflow-hidden relative">
                  {detailTab === 'terminal' ? (
                    selectedSession.ptyId ? (
                      <SessionTerminal
                        sessionId={selectedSession.id}
                        ptyId={selectedSession.ptyId}
                        cwd={selectedSession.cwd}
                        status={selectedSession.status}
                      />
                    ) : (
                      <SessionTerminalPlaceholder />
                    )
                  ) : (
                    <SdkMessageRenderer sessionId={selectedSession.id} />
                  )}
                </div>
              </div>
            ) : selectedArchived ? (
              /* Archived Session Log Viewer */
              <div className="flex-1 min-h-0 flex flex-col bg-card rounded-lg border border-border m-4">
                <div className="flex items-center justify-between px-4 py-2 border-b border-border">
                  <div className="flex items-center gap-2">
                    <Archive className="w-4 h-4 text-muted-foreground" />
                    <span className="font-mono text-sm text-primary">{selectedArchived.id.slice(0, 12)}</span>
                    <span className="text-xs text-muted-foreground">(Archived)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setFindingsModalOpen(true)}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-xs bg-primary/20 border border-primary/50 text-primary rounded hover:bg-primary/40 transition-colors"
                    >
                      <ClipboardList className="w-3.5 h-3.5" />
                      Tasks
                    </button>
                    <button
                      onClick={() => deleteArchived(selectedArchived.id)}
                      className="p-1.5 rounded hover:bg-red-500/20 transition-colors text-red-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => selectSession(null)}
                      className="p-1.5 rounded hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
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
              <AgentsEmptyState />
            )}
          </div>
        </div>
      ) : (
        /* Agent Flow Graph View */
        <div className="flex-1 overflow-hidden">
          <AgentFlowPanel />
        </div>
      )}

      {/* Spawn Dialog */}
      <SpawnAgentDialog
        isOpen={showSpawnDialog}
        onClose={() => setShowSpawnDialog(false)}
        onSpawn={handleSpawn}
      />

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
