/**
 * TeamHistoryPanel - Shows archived team sessions
 *
 * Displays past team sessions that were auto-archived before cleanup.
 * Each entry shows team name, duration, stats, and allows loading full details.
 */
import { useEffect, useState } from 'react';
import {
  Archive,
  Clock,
  Users,
  ListTodo,
  MessageSquare,
  CheckCircle2,
  Trash2,
  ChevronDown,
  ChevronRight,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useClaudeTeamsStore } from '../../stores/claude-teams-store';
import { ArchiveReplayPanel } from './ArchiveReplayPanel';
import type { TeamHistoryEntry, ArchivedTeamSession } from '../../types/claude-teams';

/** Format duration from ms to human-readable string */
function formatDuration(ms: number): string {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  const hours = Math.floor(ms / 3_600_000);
  const mins = Math.round((ms % 3_600_000) / 60_000);
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

/** Format date to locale string */
function formatDate(isoOrMs: string | number): string {
  const d = typeof isoOrMs === 'number' ? new Date(isoOrMs) : new Date(isoOrMs);
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Completion rate as percentage */
function completionRate(entry: TeamHistoryEntry): number {
  if (entry.stats.taskCount === 0) return 0;
  return Math.round((entry.stats.completedTasks / entry.stats.taskCount) * 100);
}

// ---------------------------------------------------------------------------
// Expanded archive detail view
// ---------------------------------------------------------------------------

function ArchiveDetail({ archiveId }: { archiveId: string }) {
  const [archive, setArchive] = useState<ArchivedTeamSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    window.electronAPI?.teamHistory?.loadArchive?.(archiveId).then((result) => {
      if (cancelled) return;
      if (result?.ok && result.archive) {
        setArchive(result.archive as ArchivedTeamSession);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [archiveId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-2 px-3 text-xs text-muted-foreground">
        <Loader2 className="w-3 h-3 animate-spin" />
        Loading archive...
      </div>
    );
  }

  if (!archive) {
    return (
      <div className="py-2 px-3 text-xs text-red-400">
        Failed to load archive data.
      </div>
    );
  }

  const config = archive.config;
  const tasks = archive.tasks;

  return (
    <div className="px-3 pb-3 space-y-3">
      {/* Members */}
      <div>
        <h4 className="text-xs font-medium text-muted-foreground mb-1">Members</h4>
        <div className="flex flex-wrap gap-1.5">
          {config.members.map((m) => (
            <span
              key={m.agentId}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-secondary/80"
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: m.color || (m.agentType === 'team-lead' ? '#a78bfa' : '#60a5fa') }}
              />
              {m.name}
              <span className="text-muted-foreground">({m.model?.split('-').slice(-1)[0] || 'unknown'})</span>
            </span>
          ))}
        </div>
      </div>

      {/* Tasks */}
      {tasks.length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-1">
            Tasks ({tasks.length})
          </h4>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {tasks
              .filter((t) => t.status !== 'deleted')
              .map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-2 text-xs py-0.5"
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      task.status === 'completed'
                        ? 'bg-green-400'
                        : task.status === 'in_progress'
                          ? 'bg-yellow-400'
                          : 'bg-gray-400'
                    }`}
                  />
                  <span className="text-foreground truncate flex-1">
                    {task.subject}
                  </span>
                  {task.owner && (
                    <span className="text-muted-foreground">@{task.owner}</span>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Message summary */}
      {Object.keys(archive.inboxes).length > 0 && (
        <div>
          <h4 className="text-xs font-medium text-muted-foreground mb-1">
            Messages ({archive.stats.messageCount})
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(archive.inboxes).map(([agent, msgs]) => (
              <span
                key={agent}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-secondary/60"
              >
                <MessageSquare className="w-3 h-3 text-muted-foreground" />
                {agent}: {msgs.length}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single history entry row
// ---------------------------------------------------------------------------

function HistoryRow({
  entry,
  onDelete,
}: {
  entry: TeamHistoryEntry;
  onDelete: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const rate = completionRate(entry);

  return (
    <div className="border border-border/60 rounded-lg overflow-hidden">
      {/* Header row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-secondary/30 transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        )}

        {/* Team name */}
        <span className="font-medium text-sm text-foreground">
          {entry.teamName}
        </span>

        {/* Stats badges */}
        <div className="flex items-center gap-2 ml-auto text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Users className="w-3 h-3" />
            {entry.stats.memberCount}
          </span>
          <span className="inline-flex items-center gap-1">
            <ListTodo className="w-3 h-3" />
            {entry.stats.taskCount}
          </span>
          {entry.stats.messageCount > 0 && (
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />
              {entry.stats.messageCount}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3 text-green-400" />
            {rate}%
          </span>
          <span className="inline-flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDuration(entry.duration)}
          </span>
          <span className="text-muted-foreground/60">
            {formatDate(entry.archivedAt)}
          </span>
        </div>

        {/* Delete button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirmDelete) {
              onDelete(entry.id);
              setConfirmDelete(false);
            } else {
              setConfirmDelete(true);
              setTimeout(() => setConfirmDelete(false), 3000);
            }
          }}
          className={`p-1 rounded transition-colors flex-shrink-0 ${
            confirmDelete
              ? 'text-red-400 bg-red-500/20 hover:bg-red-500/30'
              : 'text-muted-foreground/40 hover:text-red-400 hover:bg-red-500/10'
          }`}
          title={confirmDelete ? 'Click again to confirm delete' : 'Delete archive'}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </button>

      {/* Expanded detail */}
      {expanded && <ArchiveDetail archiveId={entry.id} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main panel
// ---------------------------------------------------------------------------

export function TeamHistoryPanel() {
  const { history, isLoadingHistory, loadHistory, deleteArchive } =
    useClaudeTeamsStore();

  // Load history on mount
  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <Archive className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold">Team History</h2>
          <span className="text-xs text-muted-foreground">
            ({history.length} session{history.length !== 1 ? 's' : ''})
          </span>
        </div>
        <button
          onClick={() => loadHistory()}
          disabled={isLoadingHistory}
          className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
          title="Refresh history"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoadingHistory ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3">
        {isLoadingHistory && history.length === 0 ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : history.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Archive className="w-10 h-10 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">No archived sessions yet.</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Teams are automatically archived when cleaned up.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {history.map((entry) => (
              <HistoryRow
                key={entry.id}
                entry={entry}
                onDelete={deleteArchive}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
