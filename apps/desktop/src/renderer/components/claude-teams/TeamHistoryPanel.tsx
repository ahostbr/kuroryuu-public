/**
 * TeamHistoryPanel - Shows archived team sessions
 *
 * Displays past team sessions that were auto-archived before cleanup.
 * Each entry shows team name, duration, stats, and allows loading full details.
 */
import { useEffect, useMemo, useState } from 'react';
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
import type { TeamHistoryEntry, ArchivedTeamSession, InboxMessage } from '../../types/claude-teams';
import { parseSystemMessage } from '../../types/claude-teams';

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
// Archive message & task sub-components
// ---------------------------------------------------------------------------

function ArchiveSystemBadge({ msg, timestamp }: { msg: { type: string; from?: string; taskId?: string; subject?: string }; timestamp: string }) {
  const styles: Record<string, { bg: string; text: string; label: string }> = {
    idle_notification: { bg: 'bg-gray-500/15', text: 'text-gray-400', label: 'IDLE' },
    shutdown_approved: { bg: 'bg-red-500/15', text: 'text-red-400', label: 'SHUTDOWN' },
    shutdown_request: { bg: 'bg-orange-500/15', text: 'text-orange-400', label: 'SHUTDOWN REQ' },
    task_completed: { bg: 'bg-green-500/15', text: 'text-green-400', label: 'TASK DONE' },
  };
  const s = styles[msg.type] || { bg: 'bg-gray-500/15', text: 'text-gray-400', label: msg.type.toUpperCase() };
  return (
    <div className="flex items-center gap-2 px-2 py-1 bg-secondary/20 rounded border border-border/30 text-[10px]">
      <span className={`px-1.5 py-0 rounded font-medium ${s.bg} ${s.text}`}>{s.label}</span>
      {msg.from && <span className="text-muted-foreground">{msg.from}</span>}
      {'taskId' in msg && msg.taskId && <span className="text-foreground/70">#{msg.taskId}</span>}
      {'subject' in msg && msg.subject && <span className="text-foreground/70 truncate">{msg.subject}</span>}
      <span className="text-muted-foreground/50 ml-auto flex-shrink-0">{timestamp}</span>
    </div>
  );
}

function ArchiveMessageItem({ msg, agentName, memberColor }: { msg: InboxMessage; agentName: string; memberColor?: string }) {
  const systemMsg = parseSystemMessage(msg.text);
  const timestamp = new Date(msg.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const colorDot = msg.color || memberColor || '#888';

  if (systemMsg) {
    return <ArchiveSystemBadge msg={systemMsg} timestamp={timestamp} />;
  }

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1.5 text-[10px]">
        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: colorDot }} />
        <span className="font-medium text-foreground">{msg.from}</span>
        <span className="text-muted-foreground/60">{timestamp}</span>
        <span className="text-muted-foreground/40">in {agentName}</span>
      </div>
      <div className="ml-3 bg-secondary/40 rounded px-2.5 py-1.5 border border-border/40">
        <p className="text-[11px] text-foreground/90 leading-relaxed whitespace-pre-wrap break-words">
          {msg.text.length > 500 ? msg.text.slice(0, 500) + '...' : msg.text}
        </p>
      </div>
    </div>
  );
}

function ArchiveMessages({ inboxes, members }: { inboxes: Record<string, InboxMessage[]>; members: { name: string; color?: string; agentType: string }[] }) {
  const [expanded, setExpanded] = useState(false);
  const [viewMode, setViewMode] = useState<'timeline' | 'by-agent'>('timeline');

  const memberColors = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of members) {
      map[m.name] = m.color || (m.agentType === 'team-lead' ? '#a78bfa' : '#60a5fa');
    }
    return map;
  }, [members]);

  const chronological = useMemo(() => {
    return Object.entries(inboxes)
      .flatMap(([agentName, msgs]) => msgs.map((m) => ({ ...m, _agentName: agentName })))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [inboxes]);

  const totalCount = chronological.length;
  if (totalCount === 0) return null;

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors mb-1"
      >
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        Messages ({totalCount})
      </button>

      {expanded && (
        <div>
          <div className="flex gap-1 mb-2">
            <button
              onClick={() => setViewMode('timeline')}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                viewMode === 'timeline' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              Timeline
            </button>
            <button
              onClick={() => setViewMode('by-agent')}
              className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                viewMode === 'by-agent' ? 'bg-primary/20 text-primary' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              By Agent
            </button>
          </div>

          <div className="max-h-60 overflow-y-auto space-y-1.5">
            {viewMode === 'timeline' ? (
              chronological.map((msg, idx) => (
                <ArchiveMessageItem
                  key={idx}
                  msg={msg}
                  agentName={msg._agentName}
                  memberColor={memberColors[msg.from]}
                />
              ))
            ) : (
              Object.entries(inboxes).map(([agentName, msgs]) => (
                <div key={agentName} className="mb-2">
                  <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground mb-1">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: memberColors[agentName] || '#888' }} />
                    {agentName} ({msgs.length})
                  </div>
                  <div className="space-y-1 ml-2">
                    {msgs.map((msg, idx) => (
                      <ArchiveMessageItem key={idx} msg={msg} agentName={agentName} memberColor={memberColors[msg.from]} />
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ExpandableTask({ task }: { task: { id: string; subject: string; status: string; owner?: string; description?: string } }) {
  const [expanded, setExpanded] = useState(false);
  const hasDesc = task.description && task.description.length > 0;

  return (
    <div>
      <div
        role={hasDesc ? 'button' : undefined}
        tabIndex={hasDesc ? 0 : undefined}
        onClick={() => hasDesc && setExpanded((v) => !v)}
        onKeyDown={(e) => {
          if (hasDesc && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setExpanded((v) => !v); }
        }}
        className={`flex items-center gap-2 text-xs py-0.5 ${hasDesc ? 'cursor-pointer hover:bg-secondary/30 rounded px-1 -mx-1' : ''}`}
      >
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
          task.status === 'completed' ? 'bg-green-400' : task.status === 'in_progress' ? 'bg-yellow-400' : 'bg-gray-400'
        }`} />
        {hasDesc && (expanded ? <ChevronDown className="w-2.5 h-2.5 text-muted-foreground flex-shrink-0" /> : <ChevronRight className="w-2.5 h-2.5 text-muted-foreground flex-shrink-0" />)}
        <span className="text-foreground truncate flex-1">{task.subject}</span>
        {task.owner && <span className="text-muted-foreground">@{task.owner}</span>}
      </div>
      {expanded && hasDesc && (
        <div className="ml-5 mt-1 mb-1 bg-secondary/30 rounded px-2.5 py-1.5 border border-border/30">
          <p className="text-[10px] text-foreground/80 leading-relaxed whitespace-pre-wrap break-words max-h-32 overflow-y-auto">
            {task.description}
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expanded archive detail view
// ---------------------------------------------------------------------------

function ArchiveDetail({ archiveId, onClose }: { archiveId: string; onClose?: () => void }) {
  const [archive, setArchive] = useState<ArchivedTeamSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDetails, setShowDetails] = useState(false);

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
      {/* Graph replay */}
      <ArchiveReplayPanel archiveId={archiveId} onClose={onClose} />

      {/* Toggle for text details */}
      <button
        onClick={() => setShowDetails((v) => !v)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {showDetails ? (
          <ChevronDown className="w-3 h-3" />
        ) : (
          <ChevronRight className="w-3 h-3" />
        )}
        Details
      </button>

      {showDetails && (
        <>
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
                Tasks ({tasks.filter((t) => t.status !== 'deleted').length})
              </h4>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {tasks
                  .filter((t) => t.status !== 'deleted')
                  .map((task) => (
                    <ExpandableTask key={task.id} task={task} />
                  ))}
              </div>
            </div>
          )}

          {/* Messages */}
          {Object.keys(archive.inboxes).length > 0 && (
            <ArchiveMessages inboxes={archive.inboxes} members={config.members} />
          )}
        </>
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
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((v) => !v)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded((v) => !v); } }}
        className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-secondary/30 transition-colors text-left cursor-pointer"
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
      </div>

      {/* Expanded detail */}
      {expanded && <ArchiveDetail archiveId={entry.id} onClose={() => setExpanded(false)} />}
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
