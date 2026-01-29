/**
 * Transcripts Panel
 *
 * Browse archived Claude Code conversations from ai/exports/:
 * - Load and display index.json
 * - Group by date
 * - Search via k_rag
 * - Preview session details
 * - View full message history
 */
import { useState, useEffect } from 'react';
import {
  ScrollText,
  Search,
  Calendar,
  FileText,
  MessageSquare,
  Clock,
  Database,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  Filter,
  Info,
  ArrowLeft,
} from 'lucide-react';
import { useTranscriptsStore } from '../../stores/transcripts-store';
import { toast } from '../ui/toast';
import { MessageViewer } from './MessageViewer';

// ============================================================================
// Types
// ============================================================================
interface TranscriptSession {
  id: string;
  fullId: string;
  summary: string | string[];
  date: string;
  startTime?: string;
  path: string;
  messageCount: number;
  sizeBytes: number;
  project?: string;
  lastUpdate?: string;
}

// ============================================================================
// Helper functions
// ============================================================================
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSummary(summary: string | string[]): string {
  if (Array.isArray(summary)) {
    return summary.map(s => typeof s === 'string' ? s : JSON.stringify(s)).join(' ').slice(0, 100);
  }
  return summary?.slice(0, 100) || 'Untitled session';
}

function groupByDate(sessions: TranscriptSession[]): Record<string, TranscriptSession[]> {
  const groups: Record<string, TranscriptSession[]> = {};
  for (const session of sessions) {
    const date = session.date || 'Unknown';
    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(session);
  }
  // Sort dates in descending order
  const sortedKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));
  const sorted: Record<string, TranscriptSession[]> = {};
  for (const key of sortedKeys) {
    sorted[key] = groups[key];
  }
  return sorted;
}

// ============================================================================
// TranscriptCard - Individual session card
// ============================================================================
interface TranscriptCardProps {
  session: TranscriptSession;
  isSelected: boolean;
  onClick: () => void;
}

function TranscriptCard({ session, isSelected, onClick }: TranscriptCardProps) {
  const summary = formatSummary(session.summary);

  return (
    <div
      onClick={onClick}
      className={`p-3 rounded-lg border cursor-pointer transition-all ${
        isSelected
          ? 'bg-secondary border-primary/50 ring-1 ring-primary/20'
          : 'bg-card border-border hover:border-primary/30 hover:bg-secondary/50'
      }`}
    >
      {/* Title */}
      <h3 className="text-sm font-medium text-foreground mb-2 line-clamp-2">
        {summary}
      </h3>

      {/* Metadata */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <MessageSquare className="w-3 h-3" />
          {session.messageCount}
        </span>
        <span className="flex items-center gap-1">
          <Database className="w-3 h-3" />
          {formatBytes(session.sizeBytes)}
        </span>
        {session.startTime && (
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {session.startTime}
          </span>
        )}
      </div>

      {/* ID */}
      <div className="mt-2 text-xs text-muted-foreground/60 font-mono">
        {session.id}
      </div>
    </div>
  );
}

// ============================================================================
// DateGroup - Collapsible date section
// ============================================================================
interface DateGroupProps {
  date: string;
  sessions: TranscriptSession[];
  selectedId: string | null;
  onSelectSession: (session: TranscriptSession) => void;
  isExpanded: boolean;
  onToggle: () => void;
}

function DateGroup({ date, sessions, selectedId, onSelectSession, isExpanded, onToggle }: DateGroupProps) {
  return (
    <div className="mb-4">
      {/* Date Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-secondary/50 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
        <Calendar className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium text-foreground">{date}</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {sessions.length} session{sessions.length !== 1 ? 's' : ''}
        </span>
      </button>

      {/* Sessions */}
      {isExpanded && (
        <div className="ml-6 mt-2 space-y-2">
          {sessions.map((session) => (
            <TranscriptCard
              key={session.id}
              session={session}
              isSelected={selectedId === session.id}
              onClick={() => onSelectSession(session)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SessionDetailPanel - Full session details with tabs
// ============================================================================
interface SessionDetailPanelProps {
  session: TranscriptSession;
  onClose: () => void;
}

type DetailTab = 'info' | 'messages';

function SessionDetailPanel({ session, onClose }: SessionDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('messages');
  const summary = formatSummary(session.summary);

  return (
    <div className="w-[500px] h-full flex flex-col bg-card border-l border-border">
      {/* Header */}
      <div className="flex items-center gap-3 p-3 border-b border-border">
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
          title="Back to list"
        >
          <ArrowLeft className="w-4 h-4 text-muted-foreground" />
        </button>
        <span className="text-xs text-muted-foreground font-mono flex-1 truncate">{session.id}</span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
        <button
          onClick={() => setActiveTab('messages')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'messages'
              ? 'text-primary border-b-2 border-primary bg-secondary/30'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          Messages
        </button>
        <button
          onClick={() => setActiveTab('info')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'info'
              ? 'text-primary border-b-2 border-primary bg-secondary/30'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
          }`}
        >
          <Info className="w-4 h-4" />
          Info
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'messages' ? (
        <div className="flex-1 min-h-0">
          <MessageViewer sessionPath={session.path} />
        </div>
      ) : (
        <>
          {/* Info Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <h2 className="text-lg font-semibold text-foreground">{summary}</h2>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-secondary rounded-lg">
                <div className="text-xs text-muted-foreground mb-1">Messages</div>
                <div className="text-sm font-medium text-foreground">{session.messageCount}</div>
              </div>
              <div className="p-3 bg-secondary rounded-lg">
                <div className="text-xs text-muted-foreground mb-1">Size</div>
                <div className="text-sm font-medium text-foreground">{formatBytes(session.sizeBytes)}</div>
              </div>
              <div className="p-3 bg-secondary rounded-lg">
                <div className="text-xs text-muted-foreground mb-1">Date</div>
                <div className="text-sm font-medium text-foreground">{session.date}</div>
              </div>
              <div className="p-3 bg-secondary rounded-lg">
                <div className="text-xs text-muted-foreground mb-1">Start Time</div>
                <div className="text-sm font-medium text-foreground">{session.startTime || 'N/A'}</div>
              </div>
            </div>

            {/* Full ID */}
            <div>
              <h4 className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Session ID</h4>
              <div className="p-2 bg-secondary rounded-lg text-xs font-mono text-muted-foreground break-all">
                {session.fullId}
              </div>
            </div>

            {/* File Path */}
            <div>
              <h4 className="text-xs text-muted-foreground uppercase tracking-wide mb-2">File Path</h4>
              <div className="p-2 bg-secondary rounded-lg text-xs font-mono text-muted-foreground break-all">
                ai/exports/{session.path}
              </div>
            </div>

            {/* Project */}
            {session.project && (
              <div>
                <h4 className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Project</h4>
                <div className="p-2 bg-secondary rounded-lg text-xs text-muted-foreground">
                  {session.project}
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="p-4 border-t border-border space-y-2">
            <button
              onClick={async () => {
                // Open file in explorer/finder using shell.openPath
                try {
                  await window.electronAPI?.shell?.openPath?.(`ai/exports/${session.path}`);
                  toast.info('Opening file location...');
                } catch (err) {
                  toast.error('Failed to open file');
                }
              }}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-secondary text-foreground hover:bg-muted transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Open in Explorer
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// Transcripts - Main Component
// ============================================================================
export function Transcripts() {
  const {
    sessions,
    isLoading,
    searchQuery,
    selectedSessionId,
    loadSessions,
    setSearchQuery,
    selectSession,
    getFilteredSessions,
  } = useTranscriptsStore();

  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  // Auto-expand first 3 dates
  useEffect(() => {
    if (sessions.length > 0 && expandedDates.size === 0) {
      const grouped = groupByDate(sessions);
      const dates = Object.keys(grouped).slice(0, 3);
      setExpandedDates(new Set(dates));
    }
  }, [sessions, expandedDates.size]);

  const filteredSessions = getFilteredSessions();
  const groupedSessions = groupByDate(filteredSessions);
  const selectedSession = sessions.find((s) => s.id === selectedSessionId);

  const toggleDate = (date: string) => {
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  };

  return (
    <div className="h-full flex bg-background">
      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <ScrollText className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-semibold text-foreground">Transcripts</h1>
            <span className="px-2 py-0.5 rounded-full bg-secondary text-muted-foreground text-sm">
              {sessions.length} sessions
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => loadSessions()}
              disabled={isLoading}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary text-foreground hover:bg-muted transition-colors text-sm"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Info Banner */}
        <div className="px-6 py-3 border-b border-border bg-primary/5">
          <div className="flex items-start gap-3">
            <Info className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Claude Code Conversations</span>
              <span className="mx-1.5">·</span>
              Transcripts are exported automatically via the Kuroryuu plugin's{' '}
              <code className="px-1 py-0.5 bg-secondary rounded text-[10px]">export-transcript</code>{' '}
              hook on session end. Files are stored in{' '}
              <code className="px-1 py-0.5 bg-secondary rounded text-[10px]">ai/exports/</code>.
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search transcripts..."
              className="w-full pl-10 pr-4 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-muted-foreground">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4" />
                <p>Loading transcripts...</p>
              </div>
            </div>
          ) : Object.keys(groupedSessions).length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-muted-foreground">
                <ScrollText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p className="text-lg mb-2">No transcripts found</p>
                <p className="text-sm">
                  {searchQuery
                    ? 'Try a different search query'
                    : 'Conversations will appear here after export'}
                </p>
              </div>
            </div>
          ) : (
            Object.entries(groupedSessions).map(([date, dateSessions]) => (
              <DateGroup
                key={date}
                date={date}
                sessions={dateSessions}
                selectedId={selectedSessionId}
                onSelectSession={(s) => selectSession(s.id)}
                isExpanded={expandedDates.has(date)}
                onToggle={() => toggleDate(date)}
              />
            ))
          )}
        </div>
      </div>

      {/* Detail Panel */}
      {selectedSession && (
        <SessionDetailPanel
          session={selectedSession}
          onClose={() => selectSession(null)}
        />
      )}
    </div>
  );
}
