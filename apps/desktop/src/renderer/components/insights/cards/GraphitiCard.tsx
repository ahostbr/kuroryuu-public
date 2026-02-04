/**
 * GraphitiCard - Rich visualization card for k_graphiti_migrate results
 *
 * Displays:
 * - Migration status
 * - Server connection info
 * - Migration progress/counts
 */

import { useState } from 'react';
import {
  Database,
  ChevronDown,
  ChevronUp,
  Server,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ArrowRight,
  FileText,
} from 'lucide-react';
import type { GraphitiData } from '../../../types/insights';

interface GraphitiCardProps {
  data: GraphitiData;
  collapsed?: boolean;
}

export function GraphitiCard({ data, collapsed: initialCollapsed = false }: GraphitiCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);

  const isHealthy = data.status === 'healthy';
  const hasError = data.error || data.status === 'unreachable';

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card/50 mt-2">
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-secondary/50 hover:bg-secondary/70 transition-colors"
      >
        <Database className="w-4 h-4 text-sky-400" />
        <span className="text-sm font-medium text-foreground">Graphiti Migration</span>
        {isHealthy && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 text-[10px]">
            <CheckCircle className="w-3 h-3" />
            Healthy
          </span>
        )}
        {hasError && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 text-[10px]">
            <XCircle className="w-3 h-3" />
            Error
          </span>
        )}
        {data.dryRun && (
          <span className="px-1.5 py-0.5 rounded bg-yellow-500/10 text-yellow-400 text-[10px]">
            Dry Run
          </span>
        )}
        {data.action && (
          <span className="px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400 text-[10px]">
            {data.action}
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
          {/* Server info */}
          {data.server && (
            <div className="bg-background/50 rounded-lg p-2 border border-border/30">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase mb-1">
                <Server className="w-3 h-3" />
                Server
              </div>
              <div className="flex items-center gap-2">
                <code className="text-xs font-mono text-foreground">{data.server}</code>
                {isHealthy ? (
                  <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-red-400" />
                )}
              </div>
            </div>
          )}

          {/* Error message */}
          {data.error && (
            <div className="bg-red-500/5 rounded-lg p-3 border border-red-500/20">
              <div className="flex items-center gap-2 text-xs text-red-400 mb-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span className="uppercase">Error</span>
              </div>
              <div className="text-sm text-red-400">{data.error}</div>
            </div>
          )}

          {/* Migration counts */}
          {(data.checkpointCount !== undefined || data.worklogCount !== undefined) && (
            <div className="grid grid-cols-2 gap-2">
              {data.checkpointCount !== undefined && (
                <div className="bg-background/50 rounded-lg p-2 border border-border/30">
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase">
                    <Database className="w-3 h-3" />
                    Checkpoints
                  </div>
                  <div className="text-lg font-medium text-foreground">{data.checkpointCount}</div>
                </div>
              )}
              {data.worklogCount !== undefined && (
                <div className="bg-background/50 rounded-lg p-2 border border-border/30">
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase">
                    <FileText className="w-3 h-3" />
                    Worklogs
                  </div>
                  <div className="text-lg font-medium text-foreground">{data.worklogCount}</div>
                </div>
              )}
            </div>
          )}

          {/* Migration results */}
          {(data.migrated !== undefined || data.failed !== undefined) && (
            <div className="bg-background/50 rounded-lg p-3 border border-border/30">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <ArrowRight className="w-3.5 h-3.5 text-sky-400" />
                <span className="uppercase">Migration Results</span>
              </div>
              <div className="flex items-center gap-4">
                {data.migrated !== undefined && (
                  <div className="flex items-center gap-1">
                    <CheckCircle className="w-4 h-4 text-green-400" />
                    <span className="text-sm text-foreground">{data.migrated} migrated</span>
                  </div>
                )}
                {data.failed !== undefined && data.failed > 0 && (
                  <div className="flex items-center gap-1">
                    <XCircle className="w-4 h-4 text-red-400" />
                    <span className="text-sm text-foreground">{data.failed} failed</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!data.server && !data.error && data.checkpointCount === undefined && data.migrated === undefined && (
            <div className="text-xs text-muted-foreground text-center py-2">
              No migration data
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t border-border/30">
            <span className="flex items-center gap-1">
              <Database className="w-3 h-3" />
              {data.action || 'status'}
            </span>
            {data.dryRun && (
              <span className="text-yellow-400">Dry run mode</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
