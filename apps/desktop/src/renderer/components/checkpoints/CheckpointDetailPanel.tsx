/**
 * CheckpointDetailPanel - Detail view for selected checkpoint
 *
 * Shows full checkpoint info with tabs for Info and Data
 */
import { useState, useMemo } from 'react';
import {
  ArrowLeft,
  Info,
  Code,
  Copy,
  Check,
  FolderOpen,
  Download,
  Clock,
  Database,
  Tag,
  FileJson,
  FileText,
  ScrollText,
  ExternalLink,
} from 'lucide-react';
import { type CheckpointFull, formatBytes, extractTimeFromId, extractDateFromId } from '../../stores/checkpoints-store';
import { toast } from '../ui/toast';

// ============================================================================
// Helper: Extract plan/worklog paths from checkpoint data
// ============================================================================

interface RelatedDoc {
  type: 'plan' | 'worklog';
  path: string;
  name: string;
}

function extractRelatedDocs(data: unknown): RelatedDoc[] {
  const docs: RelatedDoc[] = [];
  const seen = new Set<string>();

  // Use positive character class - only match valid filename characters
  // This excludes glob wildcards (*, ?) and other invalid characters
  const planPattern = /Docs\/Plans\/[a-zA-Z0-9_\-]+\.md/gi;
  const worklogPattern = /Docs\/worklogs\/[a-zA-Z0-9_\-]+\.md/gi;

  function searchInValue(value: unknown): void {
    if (typeof value === 'string') {
      // Search for plan paths
      const planMatches = value.match(planPattern);
      if (planMatches) {
        for (const match of planMatches) {
          // Extra validation: skip if contains glob patterns
          if (match.includes('*') || match.includes('?')) continue;
          if (!seen.has(match)) {
            seen.add(match);
            const name = match.split('/').pop()?.replace('.md', '') || match;
            docs.push({ type: 'plan', path: match, name });
          }
        }
      }

      // Search for worklog paths
      const worklogMatches = value.match(worklogPattern);
      if (worklogMatches) {
        for (const match of worklogMatches) {
          // Extra validation: skip if contains glob patterns
          if (match.includes('*') || match.includes('?')) continue;
          if (!seen.has(match)) {
            seen.add(match);
            const name = match.split('/').pop()?.replace('.md', '') || match;
            docs.push({ type: 'worklog', path: match, name });
          }
        }
      }
    } else if (Array.isArray(value)) {
      for (const item of value) {
        searchInValue(item);
      }
    } else if (value && typeof value === 'object') {
      for (const key of Object.keys(value as Record<string, unknown>)) {
        searchInValue((value as Record<string, unknown>)[key]);
      }
    }
  }

  searchInValue(data);
  return docs;
}

interface CheckpointDetailPanelProps {
  checkpoint: CheckpointFull;
  isLoading: boolean;
  onClose: () => void;
}

type DetailTab = 'info' | 'data';

export function CheckpointDetailPanel({ checkpoint, isLoading, onClose }: CheckpointDetailPanelProps) {
  const [activeTab, setActiveTab] = useState<DetailTab>('info');
  const [copied, setCopied] = useState(false);
  const [showRawJson, setShowRawJson] = useState(false);

  const time = checkpoint.saved_at
    ? new Date(checkpoint.saved_at).toLocaleTimeString('en-US', { hour12: false })
    : extractTimeFromId(checkpoint.id);

  const date = checkpoint.saved_at
    ? new Date(checkpoint.saved_at).toLocaleDateString('en-US')
    : extractDateFromId(checkpoint.id);

  // Extract related documents (plans, worklogs) from checkpoint data
  const relatedDocs = useMemo(() => {
    return extractRelatedDocs(checkpoint.data);
  }, [checkpoint.data]);

  const openRelatedDoc = async (path: string) => {
    try {
      await window.electronAPI?.shell?.openPath?.(path);
      toast.info('Opening document...');
    } catch {
      toast.error('Failed to open document');
    }
  };

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(checkpoint.id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Checkpoint ID copied');
    } catch {
      toast.error('Failed to copy');
    }
  };

  const copyLoadCommand = async () => {
    const cmd = `/loadnow ${checkpoint.id}`;
    try {
      await navigator.clipboard.writeText(cmd);
      toast.success('Load command copied! Paste in Claude terminal.');
    } catch {
      toast.error('Failed to copy');
    }
  };

  const openFolder = async () => {
    try {
      const path = checkpoint.path || `ai/checkpoints/${checkpoint.name}`;
      await window.electronAPI?.shell?.openPath?.(path);
      toast.info('Opening checkpoint folder...');
    } catch {
      toast.error('Failed to open folder');
    }
  };

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
        <span className="text-xs text-muted-foreground font-mono flex-1 truncate">
          {checkpoint.id}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border">
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
        <button
          onClick={() => setActiveTab('data')}
          className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTab === 'data'
              ? 'text-primary border-b-2 border-primary bg-secondary/30'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
          }`}
        >
          <Code className="w-4 h-4" />
          Data
        </button>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin mx-auto mb-2" />
            <p className="text-sm">Loading checkpoint...</p>
          </div>
        </div>
      ) : activeTab === 'info' ? (
        <>
          {/* Info Tab Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Name */}
            <h2 className="text-lg font-semibold text-foreground">
              {checkpoint.name || 'Unnamed Checkpoint'}
            </h2>

            {/* Summary */}
            {checkpoint.summary && (
              <div className="p-3 bg-secondary rounded-lg">
                <h4 className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Summary</h4>
                <p className="text-sm text-foreground">{checkpoint.summary}</p>
              </div>
            )}

            {/* Related Documents - Plans & Worklogs */}
            {relatedDocs.length > 0 && (
              <div className="p-3 bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 rounded-lg">
                <h4 className="flex items-center gap-1.5 text-xs text-primary uppercase tracking-wide mb-3 font-semibold">
                  <FileText className="w-3.5 h-3.5" />
                  Related Documents
                </h4>
                <div className="space-y-2">
                  {relatedDocs.map((doc) => (
                    <button
                      key={doc.path}
                      onClick={() => openRelatedDoc(doc.path)}
                      className="w-full flex items-center gap-3 p-2 bg-background/50 hover:bg-background rounded-lg border border-border/50 hover:border-primary/30 transition-all group text-left"
                    >
                      {doc.type === 'plan' ? (
                        <div className="p-1.5 bg-blue-500/20 rounded">
                          <ScrollText className="w-3.5 h-3.5 text-blue-400" />
                        </div>
                      ) : (
                        <div className="p-1.5 bg-green-500/20 rounded">
                          <FileText className="w-3.5 h-3.5 text-green-400" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-foreground truncate">
                          {doc.name}
                        </div>
                        <div className="text-[10px] text-muted-foreground truncate">
                          {doc.type === 'plan' ? 'Implementation Plan' : 'Session Worklog'}
                        </div>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-secondary rounded-lg">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  <Database className="w-3 h-3" />
                  Size
                </div>
                <div className="text-sm font-medium text-foreground">
                  {formatBytes(checkpoint.size_bytes || 0)}
                </div>
              </div>
              <div className="p-3 bg-secondary rounded-lg">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1">
                  <Clock className="w-3 h-3" />
                  Created
                </div>
                <div className="text-sm font-medium text-foreground">{time}</div>
              </div>
            </div>

            {/* Tags */}
            {checkpoint.tags && checkpoint.tags.length > 0 && (
              <div>
                <h4 className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wide mb-2">
                  <Tag className="w-3 h-3" />
                  Tags
                </h4>
                <div className="flex flex-wrap gap-2">
                  {checkpoint.tags.map((tag) => (
                    <span
                      key={tag}
                      className="
                        px-2.5 py-1 rounded-full text-xs font-medium
                        bg-primary/10 text-primary border border-primary/20
                        hover:bg-primary/20 hover:border-primary/40
                        hover:shadow-[0_0_12px_rgba(201,162,39,0.3)]
                        transition-all duration-200
                      "
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Full ID */}
            <div>
              <h4 className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Checkpoint ID</h4>
              <div className="p-2 bg-secondary rounded-lg text-xs font-mono text-muted-foreground break-all">
                {checkpoint.id}
              </div>
            </div>

            {/* Date */}
            <div>
              <h4 className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Date</h4>
              <div className="p-2 bg-secondary rounded-lg text-xs text-muted-foreground">
                {date}
              </div>
            </div>

            {/* File Path */}
            {checkpoint.path && (
              <div>
                <h4 className="text-xs text-muted-foreground uppercase tracking-wide mb-2">File Path</h4>
                <div className="p-2 bg-secondary rounded-lg text-xs font-mono text-muted-foreground break-all">
                  {checkpoint.path}
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="p-4 border-t border-border space-y-2">
            <div className="flex gap-2">
              <button
                onClick={copyId}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-secondary text-foreground hover:bg-muted transition-colors text-sm"
              >
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                Copy ID
              </button>
              <button
                onClick={openFolder}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-secondary text-foreground hover:bg-muted transition-colors text-sm"
              >
                <FolderOpen className="w-4 h-4" />
                Open Folder
              </button>
            </div>
            <button
              onClick={copyLoadCommand}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary/20 text-primary hover:bg-primary/30 border border-primary/30 hover:border-primary/50 transition-all text-sm font-medium"
            >
              <Download className="w-4 h-4" />
              Load Checkpoint
            </button>
          </div>
        </>
      ) : (
        <>
          {/* Data Tab Content */}
          <div className="flex-1 overflow-hidden flex flex-col">
            {/* Toggle */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border">
              <span className="text-xs text-muted-foreground">
                {showRawJson ? 'Raw JSON' : 'Parsed View'}
              </span>
              <button
                onClick={() => setShowRawJson(!showRawJson)}
                className="flex items-center gap-1.5 px-2 py-1 text-xs bg-secondary rounded hover:bg-muted transition-colors"
              >
                <FileJson className="w-3 h-3" />
                {showRawJson ? 'Show Parsed' : 'Show Raw'}
              </button>
            </div>

            {/* Data View */}
            <div className="flex-1 overflow-auto p-4">
              {checkpoint.data ? (
                showRawJson ? (
                  <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all">
                    {JSON.stringify(checkpoint.data, null, 2)}
                  </pre>
                ) : (
                  <DataTree data={checkpoint.data} />
                )
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  <FileJson className="w-8 h-8 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">No data payload</p>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ============================================================================
// DataTree - Recursive data viewer
// ============================================================================

interface DataTreeProps {
  data: unknown;
  depth?: number;
}

function DataTree({ data, depth = 0 }: DataTreeProps) {
  if (data === null) return <span className="text-muted-foreground">null</span>;
  if (data === undefined) return <span className="text-muted-foreground">undefined</span>;

  if (typeof data === 'string') {
    return <span className="text-green-400">"{data.length > 100 ? data.slice(0, 100) + '...' : data}"</span>;
  }

  if (typeof data === 'number') {
    return <span className="text-blue-400">{data}</span>;
  }

  if (typeof data === 'boolean') {
    return <span className="text-purple-400">{data ? 'true' : 'false'}</span>;
  }

  if (Array.isArray(data)) {
    if (data.length === 0) return <span className="text-muted-foreground">[]</span>;
    return (
      <div className={depth > 0 ? 'ml-4' : ''}>
        <span className="text-muted-foreground">[</span>
        {data.slice(0, 10).map((item, i) => (
          <div key={i} className="ml-4">
            <DataTree data={item} depth={depth + 1} />
            {i < data.length - 1 && <span className="text-muted-foreground">,</span>}
          </div>
        ))}
        {data.length > 10 && (
          <div className="ml-4 text-muted-foreground text-xs">... {data.length - 10} more items</div>
        )}
        <span className="text-muted-foreground">]</span>
      </div>
    );
  }

  if (typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length === 0) return <span className="text-muted-foreground">{'{}'}</span>;
    return (
      <div className={depth > 0 ? 'ml-4' : ''}>
        <span className="text-muted-foreground">{'{'}</span>
        {entries.slice(0, 20).map(([key, value], i) => (
          <div key={key} className="ml-4">
            <span className="text-primary">{key}</span>
            <span className="text-muted-foreground">: </span>
            <DataTree data={value} depth={depth + 1} />
            {i < entries.length - 1 && <span className="text-muted-foreground">,</span>}
          </div>
        ))}
        {entries.length > 20 && (
          <div className="ml-4 text-muted-foreground text-xs">... {entries.length - 20} more keys</div>
        )}
        <span className="text-muted-foreground">{'}'}</span>
      </div>
    );
  }

  return <span className="text-muted-foreground">{String(data)}</span>;
}
