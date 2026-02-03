/**
 * RAGResultsCard - Rich visualization card for k_rag query results
 *
 * Displays:
 * - Query and strategy used
 * - Match list with file paths, line numbers, and relevance scores
 * - Code snippets with syntax highlighting (if available)
 * - Stats (time, files scanned, match count)
 * - Copy paths action
 */

import { useState, useCallback } from 'react';
import {
  Search,
  FileCode,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Clock,
  Files,
  Hash,
} from 'lucide-react';
import type { RAGResultsData, RAGMatch } from '../../../types/insights';

interface RAGResultsCardProps {
  data: RAGResultsData;
  collapsed?: boolean;
}

function ScoreBar({ score }: { score: number }) {
  const percentage = Math.round(score * 100);
  const getColor = (pct: number) => {
    if (pct >= 90) return 'bg-emerald-500';
    if (pct >= 70) return 'bg-lime-500';
    if (pct >= 50) return 'bg-yellow-500';
    return 'bg-orange-500';
  };

  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${getColor(percentage)}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <span className="text-xs text-muted-foreground font-mono w-8 text-right">
        {percentage}%
      </span>
    </div>
  );
}

function MatchItem({ match, index }: { match: RAGMatch; index: number }) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="border border-border/50 rounded-lg overflow-hidden bg-card/30">
      {/* Match header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/30 transition-colors"
      >
        <FileCode className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <span className="flex-1 text-left text-sm font-mono truncate text-foreground">
          {match.path}
          {match.line && (
            <span className="text-muted-foreground">:{match.line}</span>
          )}
        </span>
        <ScoreBar score={match.score} />
        {match.snippet && (
          <span className="text-muted-foreground">
            {isExpanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </span>
        )}
      </button>

      {/* Snippet (expanded) */}
      {isExpanded && match.snippet && (
        <div className="px-3 py-2 border-t border-border/30 bg-background/50">
          <pre className="text-xs font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap">
            {match.snippet}
          </pre>
        </div>
      )}
    </div>
  );
}

export function RAGResultsCard({ data, collapsed: initialCollapsed = false }: RAGResultsCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);
  const [showAll, setShowAll] = useState(false);
  const [copied, setCopied] = useState(false);

  const visibleMatches = showAll ? data.matches : data.matches.slice(0, 5);
  const hasMore = data.matches.length > 5;

  const handleCopyPaths = useCallback(() => {
    const paths = data.matches.map(m => m.line ? `${m.path}:${m.line}` : m.path).join('\n');
    navigator.clipboard.writeText(paths);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [data.matches]);

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card/50 mt-2">
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-secondary/50 hover:bg-secondary/70 transition-colors"
      >
        <Search className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium text-foreground">RAG Results</span>
        <span className="text-xs text-muted-foreground">
          ({data.totalMatches || data.matches.length} matches)
        </span>
        <span className="flex-1" />
        <span className="text-muted-foreground">
          {isCollapsed ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronUp className="w-4 h-4" />
          )}
        </span>
      </button>

      {/* Body */}
      {!isCollapsed && (
        <div className="p-3 space-y-3">
          {/* Query info */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
              <Hash className="w-3 h-3" />
              <span className="font-mono">{data.query}</span>
            </div>
            {data.strategy && (
              <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px]">
                {data.strategy}
              </span>
            )}
          </div>

          {/* Matches */}
          <div className="space-y-1.5">
            {visibleMatches.map((match, idx) => (
              <MatchItem key={`${match.path}-${match.line}-${idx}`} match={match} index={idx} />
            ))}
          </div>

          {/* Show more/less */}
          {hasMore && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="w-full text-xs text-primary hover:text-primary/80 transition-colors py-1"
            >
              {showAll ? 'Show less' : `+${data.matches.length - 5} more results`}
            </button>
          )}

          {/* Footer stats & actions */}
          <div className="flex items-center justify-between pt-2 border-t border-border/30">
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              {data.scanTimeMs !== undefined && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {data.scanTimeMs}ms
                </span>
              )}
              {data.filesScanned !== undefined && (
                <span className="flex items-center gap-1">
                  <Files className="w-3 h-3" />
                  {data.filesScanned} files
                </span>
              )}
              <span className="flex items-center gap-1">
                <Search className="w-3 h-3" />
                {data.matches.length} matches
              </span>
            </div>
            <button
              onClick={handleCopyPaths}
              className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-green-400" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  Copy
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
