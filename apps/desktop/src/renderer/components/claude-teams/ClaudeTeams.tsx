/**
 * ClaudeTeams - Main panel for Claude Code Agent Teams
 *
 * Replaces the old CodingAgents panel. Shows teams created via the official
 * Claude Code Agent Teams feature, monitored via file watcher on
 * ~/.claude/teams/ and ~/.claude/tasks/.
 *
 * Three view modes: Hub+Spokes (Phase 3), Hierarchy (Phase 6), Timeline (Phase 7).
 */
import { useEffect, useState } from 'react';
import {
  Users,
  RefreshCw,
  AlertCircle,
  Network,
  GitBranch,
  Clock,
  Loader2,
  ListTodo,
  Archive,
} from 'lucide-react';
import { useClaudeTeamsStore, setupClaudeTeamsIpcListeners } from '../../stores/claude-teams-store';
import { useTeamFlowStore } from '../../stores/team-flow-store';
import { TeamFlowPanel } from './TeamFlowPanel';
import { TeammateDetailPanel } from './TeammateDetailPanel';
import { TaskListPanel } from './TaskListPanel';
import { TeamHistoryPanel } from './TeamHistoryPanel';
import type { FlowViewMode } from '../../types/claude-teams';

const VIEW_TABS: { id: FlowViewMode; label: string; icon: React.ElementType; ready: boolean }[] = [
  { id: 'hub-spokes', label: 'Hub', icon: Network, ready: true },
  { id: 'hierarchy', label: 'Hierarchy', icon: GitBranch, ready: true },
  { id: 'timeline', label: 'Timeline', icon: Clock, ready: true },
];

export function ClaudeTeams() {
  const {
    teams,
    selectedTeamId,
    selectedTeam,
    isWatching,
    isLoading,
    error,
    selectTeam,
    startWatching,
    stopWatching,
    setError,
  } = useClaudeTeamsStore();

  const [activeView, setActiveView] = useState<FlowViewMode>('hub-spokes');
  const [showTasks, setShowTasks] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const setViewMode = useTeamFlowStore((s) => s.setViewMode);
  const history = useClaudeTeamsStore((s) => s.history);
  const loadHistory = useClaudeTeamsStore((s) => s.loadHistory);

  // Sync view mode to flow store when tab changes
  const handleViewChange = (view: FlowViewMode) => {
    setActiveView(view);
    setViewMode(view);
  };

  // Start file watcher and IPC listeners on mount
  // ORDERING IS CRITICAL: setupClaudeTeamsIpcListeners() must run BEFORE startWatching()
  // so that IPC handlers are registered before the watcher sends any push events.
  // startWatching() consumes the initial snapshot to hydrate state, covering any events
  // that might have been missed during the brief window between handler registration and
  // watcher startup.
  useEffect(() => {
    const cleanupListeners = setupClaudeTeamsIpcListeners();
    startWatching();
    loadHistory();

    return () => {
      cleanupListeners();
      stopWatching();
    };
  }, [startWatching, stopWatching, loadHistory]);

  // Auto-select first team if none selected
  useEffect(() => {
    if (!selectedTeamId && teams.length > 0) {
      selectTeam(teams[0].config.name);
    }
  }, [teams, selectedTeamId, selectTeam]);

  const memberCount = selectedTeam?.config.members.length ?? 0;
  const taskCount = selectedTeam?.tasks.filter((t) => t.status !== 'deleted').length ?? 0;
  const activeTasks = selectedTeam?.tasks.filter((t) => t.status === 'in_progress').length ?? 0;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="border-b border-border p-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold">Claude Teams</h1>

          {/* Team name badge */}
          {selectedTeam && (
            <span className="px-2 py-0.5 rounded-full bg-primary/20 text-primary text-xs font-medium">
              {selectedTeam.config.name}
            </span>
          )}

          {/* Member count */}
          {memberCount > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-xs font-medium">
              {memberCount} member{memberCount !== 1 ? 's' : ''}
            </span>
          )}

          {/* View tabs */}
          <div className="flex items-center gap-1 ml-4 bg-secondary/50 rounded-lg p-1">
            {VIEW_TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => tab.ready && handleViewChange(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  activeView === tab.id
                    ? 'bg-primary text-primary-foreground'
                    : tab.ready
                      ? 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                      : 'text-muted-foreground/40 cursor-not-allowed'
                }`}
                title={tab.ready ? tab.label : `${tab.label} (Coming Soon)`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Right side controls */}
        <div className="flex items-center gap-2">
          {/* Tasks toggle */}
          {selectedTeam && (
            <button
              onClick={() => setShowTasks((v) => !v)}
              className={`p-2 rounded-lg transition-colors ${
                showTasks
                  ? 'text-primary bg-primary/10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
              title="Toggle task panel"
            >
              <ListTodo className="w-4 h-4" />
            </button>
          )}

          {/* History toggle */}
          <button
            onClick={() => setShowHistory((v) => !v)}
            className={`p-2 rounded-lg transition-colors relative ${
              showHistory
                ? 'text-primary bg-primary/10'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
            }`}
            title="Team history"
          >
            <Archive className="w-4 h-4" />
            {history.length > 0 && !showHistory && (
              <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-primary text-[9px] text-primary-foreground flex items-center justify-center font-bold">
                {history.length > 9 ? '9+' : history.length}
              </span>
            )}
          </button>

          {/* Connection status */}
          <span
            className={`w-2 h-2 rounded-full ${
              isWatching ? 'bg-green-400' : 'bg-red-400'
            }`}
            title={isWatching ? 'Watching file system' : 'Not connected'}
          />

          {/* Refresh */}
          <button
            onClick={() => startWatching()}
            disabled={isLoading}
            className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
            title="Refresh teams"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="border-b border-red-500/30 bg-red-500/10 px-4 py-2 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
          <span className="text-sm text-red-400 flex-1">{error}</span>
          <button
            onClick={() => setError(null)}
            className="text-red-400 hover:text-red-300 text-xs"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Team selector (when multiple teams exist) */}
      {teams.length > 1 && (
        <div className="border-b border-border px-4 py-2 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Team:</span>
          <div className="flex gap-1">
            {teams.map((team) => (
              <button
                key={team.config.name}
                onClick={() => selectTeam(team.config.name)}
                className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                  selectedTeamId === team.config.name
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}
              >
                {team.config.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 overflow-hidden flex flex-col">
        {showHistory ? (
          /* History view */
          <TeamHistoryPanel />
        ) : isLoading && teams.length === 0 ? (
          /* Loading state */
          <div className="h-full flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin" />
              <span className="text-sm">Scanning for teams...</span>
            </div>
          </div>
        ) : teams.length === 0 ? (
          /* Empty state */
          <div className="h-full flex items-center justify-center">
            <div className="flex flex-col items-center gap-4 text-center max-w-md">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <Users className="w-8 h-8 text-primary/60" />
              </div>
              <h2 className="text-lg font-semibold text-foreground">No Active Teams</h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Create a team from Claude Code CLI to get started. Teams will appear
                here automatically when detected.
              </p>
              <div className="bg-secondary/50 rounded-lg p-3 w-full">
                <p className="text-xs text-muted-foreground mb-2">Quick start in Claude Code CLI:</p>
                <code className="text-xs text-primary font-mono">
                  Use the Teammate tool with operation: "spawnTeam"
                </code>
              </div>
              {history.length > 0 && (
                <button
                  onClick={() => setShowHistory(true)}
                  className="flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
                >
                  <Archive className="w-4 h-4" />
                  View {history.length} past session{history.length !== 1 ? 's' : ''}
                </button>
              )}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span
                  className={`w-2 h-2 rounded-full ${isWatching ? 'bg-green-400' : 'bg-red-400'}`}
                />
                {isWatching
                  ? 'Watching ~/.claude/teams/ for changes...'
                  : 'File watcher not active'}
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Graph + Detail Panel */}
            <div className="flex-1 overflow-hidden relative">
              <TeamFlowPanel />
              <TeammateDetailPanel />
            </div>

            {/* Task panel (collapsible, below graph) */}
            {showTasks && (
              <div className="border-t border-border p-3 max-h-[40%] overflow-y-auto">
                <TaskListPanel />
              </div>
            )}
          </>
        )}
      </div>

      {/* Status bar */}
      {selectedTeam && (
        <div className="border-t border-border px-4 py-1.5 flex items-center gap-4 text-xs text-muted-foreground">
          <span>{memberCount} member{memberCount !== 1 ? 's' : ''}</span>
          <span className="text-border">|</span>
          <span>{taskCount} task{taskCount !== 1 ? 's' : ''}</span>
          {activeTasks > 0 && (
            <>
              <span className="text-border">|</span>
              <span className="text-green-400">{activeTasks} in progress</span>
            </>
          )}
          <span className="text-border">|</span>
          <span>
            Created {new Date(selectedTeam.config.createdAt).toLocaleString()}
          </span>
        </div>
      )}
    </div>
  );
}

export default ClaudeTeams;
