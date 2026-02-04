/**
 * ToolSearchCard - Rich visualization card for k_MCPTOOLSEARCH results
 *
 * Displays:
 * - Search query and mode
 * - Matched tools with scores
 * - Execution results
 */

import { useState } from 'react';
import {
  Search,
  ChevronDown,
  ChevronUp,
  Zap,
  Star,
  Play,
  CheckCircle,
} from 'lucide-react';
import type { ToolSearchData, ToolSearchMatch } from '../../../types/insights';

interface ToolSearchCardProps {
  data: ToolSearchData;
  collapsed?: boolean;
}

function MatchItem({ match }: { match: ToolSearchMatch }) {
  const scorePercent = Math.round(match.score * 100);

  return (
    <div className="px-3 py-2 rounded-lg bg-card/30 border border-border/50">
      <div className="flex items-center gap-2">
        <Zap className="w-4 h-4 text-yellow-400 flex-shrink-0" />
        <span className="text-sm font-medium text-foreground">{match.tool}</span>
        <span className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <Star className="w-3 h-3 text-yellow-400" />
          {scorePercent}%
        </span>
      </div>
      {match.description && (
        <div className="mt-1 text-xs text-muted-foreground truncate">
          {match.description}
        </div>
      )}
      {match.actions && match.actions.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {match.actions.slice(0, 4).map((action, idx) => (
            <span
              key={idx}
              className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[9px]"
            >
              {action}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function ToolSearchCard({ data, collapsed: initialCollapsed = false }: ToolSearchCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);

  const matchCount = data.matches?.length || 0;
  const isExecuteMode = data.mode === 'execute';

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card/50 mt-2">
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-secondary/50 hover:bg-secondary/70 transition-colors"
      >
        <Search className="w-4 h-4 text-yellow-400" />
        <span className="text-sm font-medium text-foreground">Tool Search</span>
        {data.query && (
          <span className="text-xs text-muted-foreground truncate max-w-[150px]">
            "{data.query}"
          </span>
        )}
        {isExecuteMode && data.toolUsed && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 text-[10px]">
            <CheckCircle className="w-3 h-3" />
            Executed
          </span>
        )}
        {data.mode && (
          <span className="px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 text-[10px]">
            {data.mode}
          </span>
        )}
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
          {data.query && (
            <div className="bg-background/50 rounded-lg p-2 border border-border/30">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase mb-1">
                <Search className="w-3 h-3" />
                Query
              </div>
              <div className="text-sm text-foreground">{data.query}</div>
            </div>
          )}

          {/* Execution result */}
          {isExecuteMode && data.toolUsed && (
            <div className="bg-green-500/5 rounded-lg p-3 border border-green-500/20">
              <div className="flex items-center gap-2 text-xs text-green-400 mb-2">
                <Play className="w-3.5 h-3.5" />
                <span className="uppercase">Executed: {data.toolUsed}</span>
              </div>
              {data.result !== undefined && (
                <pre className="text-xs font-mono text-muted-foreground overflow-x-auto max-h-32 overflow-y-auto whitespace-pre-wrap">
                  {String(typeof data.result === 'string' ? data.result : JSON.stringify(data.result, null, 2)).slice(0, 500)}
                </pre>
              )}
            </div>
          )}

          {/* Match list */}
          {data.matches && data.matches.length > 0 && (
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {data.matches.map((match, idx) => (
                <MatchItem key={match.tool || idx} match={match} />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!data.query && matchCount === 0 && !data.toolUsed && (
            <div className="text-xs text-muted-foreground text-center py-2">
              No search results
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t border-border/30">
            <span className="flex items-center gap-1">
              <Search className="w-3 h-3" />
              {matchCount} matches
            </span>
            {data.mode && (
              <span>Mode: {data.mode}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
