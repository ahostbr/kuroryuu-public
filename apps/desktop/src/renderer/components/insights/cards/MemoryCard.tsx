/**
 * MemoryCard - Rich visualization card for k_memory results
 *
 * Displays:
 * - Active goal
 * - Current blockers
 * - Next steps
 * - Todo file preview
 */

import { useState } from 'react';
import {
  Brain,
  ChevronDown,
  ChevronUp,
  Target,
  AlertTriangle,
  ListChecks,
  FileText,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import type { MemoryData } from '../../../types/insights';

interface MemoryCardProps {
  data: MemoryData;
  collapsed?: boolean;
}

export function MemoryCard({ data, collapsed: initialCollapsed = false }: MemoryCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);

  const hasGoal = data.goal || data.workingMemory?.active_goal;
  const blockers = data.blockers || data.workingMemory?.blockers || [];
  const steps = data.steps || data.workingMemory?.next_steps || [];

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card/50 mt-2">
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-secondary/50 hover:bg-secondary/70 transition-colors"
      >
        <Brain className="w-4 h-4 text-pink-400" />
        <span className="text-sm font-medium text-foreground">Working Memory</span>
        {data.action && data.action !== 'get' && (
          <span className="px-1.5 py-0.5 rounded bg-pink-500/10 text-pink-400 text-[10px]">
            {data.action}
          </span>
        )}
        {blockers.length > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 text-[10px]">
            {blockers.length} blockers
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
          {/* Active Goal */}
          {hasGoal && (
            <div className="bg-background/50 rounded-lg p-3 border border-border/30">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <Target className="w-3.5 h-3.5 text-emerald-400" />
                <span className="uppercase">Active Goal</span>
              </div>
              <div className="text-sm text-foreground">
                {data.goal || data.workingMemory?.active_goal}
              </div>
            </div>
          )}

          {/* Blockers */}
          {blockers.length > 0 && (
            <div className="bg-red-500/5 rounded-lg p-3 border border-red-500/20">
              <div className="flex items-center gap-2 text-xs text-red-400 mb-2">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span className="uppercase">Blockers ({blockers.length})</span>
              </div>
              <ul className="space-y-1">
                {blockers.map((blocker, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-foreground">
                    <XCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />
                    <span>{blocker}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Next Steps */}
          {steps.length > 0 && (
            <div className="bg-background/50 rounded-lg p-3 border border-border/30">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <ListChecks className="w-3.5 h-3.5 text-blue-400" />
                <span className="uppercase">Next Steps ({steps.length})</span>
              </div>
              <ol className="space-y-1 list-decimal list-inside">
                {steps.map((step, idx) => (
                  <li key={idx} className="text-sm text-foreground">
                    {step}
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Todo preview */}
          {data.todoPreview && (
            <div className="bg-background/50 rounded-lg p-3 border border-border/30">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <FileText className="w-3.5 h-3.5" />
                <span className="uppercase">Todo Preview</span>
                {data.todoExists !== undefined && (
                  data.todoExists ? (
                    <CheckCircle className="w-3 h-3 text-green-400" />
                  ) : (
                    <XCircle className="w-3 h-3 text-red-400" />
                  )
                )}
              </div>
              <pre className="text-xs font-mono text-muted-foreground overflow-x-auto max-h-24 overflow-y-auto whitespace-pre-wrap">
                {data.todoPreview}
              </pre>
            </div>
          )}

          {/* Empty state */}
          {!hasGoal && blockers.length === 0 && steps.length === 0 && !data.todoPreview && (
            <div className="text-xs text-muted-foreground text-center py-2">
              Working memory is empty
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t border-border/30">
            {data.todoPath && (
              <span className="flex items-center gap-1 truncate">
                <FileText className="w-3 h-3" />
                {data.todoPath}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
