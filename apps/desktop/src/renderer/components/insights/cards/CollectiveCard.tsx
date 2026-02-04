/**
 * CollectiveCard - Rich visualization card for k_collective results
 *
 * Displays:
 * - Collective intelligence patterns
 * - Skill matrix overview
 * - Pattern success rates
 */

import { useState } from 'react';
import {
  Brain,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  TrendingUp,
  Award,
  Clock,
} from 'lucide-react';
import type { CollectiveData, CollectivePattern } from '../../../types/insights';

interface CollectiveCardProps {
  data: CollectiveData;
  collapsed?: boolean;
}

function PatternItem({ pattern }: { pattern: CollectivePattern }) {
  const successRate = pattern.success_rate !== undefined
    ? Math.round(pattern.success_rate * 100)
    : null;

  return (
    <div className="px-3 py-2 rounded-lg bg-card/30 border border-border/50">
      <div className="flex items-center gap-2">
        <Lightbulb className="w-4 h-4 text-yellow-400 flex-shrink-0" />
        <span className="text-sm text-foreground font-medium truncate">
          {pattern.task_type}
        </span>
        {successRate !== null && (
          <span className={`ml-auto text-xs ${successRate >= 80 ? 'text-green-400' : successRate >= 50 ? 'text-yellow-400' : 'text-red-400'}`}>
            {successRate}%
          </span>
        )}
      </div>
      <div className="mt-1 text-xs text-muted-foreground truncate">
        {pattern.approach}
      </div>
      {pattern.evidence && (
        <div className="mt-1 text-xs text-muted-foreground/70 truncate italic">
          "{pattern.evidence}"
        </div>
      )}
      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
        {pattern.uses !== undefined && (
          <span className="flex items-center gap-1">
            <TrendingUp className="w-3 h-3" />
            {pattern.uses} uses
          </span>
        )}
        {pattern.created_at && (
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {new Date(pattern.created_at).toLocaleDateString()}
          </span>
        )}
      </div>
    </div>
  );
}

export function CollectiveCard({ data, collapsed: initialCollapsed = false }: CollectiveCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);

  const patternCount = data.patterns?.length || data.count || 0;
  const skillCount = data.skillMatrix ? Object.keys(data.skillMatrix).length : 0;

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card/50 mt-2">
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-secondary/50 hover:bg-secondary/70 transition-colors"
      >
        <Brain className="w-4 h-4 text-purple-400" />
        <span className="text-sm font-medium text-foreground">Collective Intelligence</span>
        {patternCount > 0 && (
          <span className="text-xs text-muted-foreground">
            ({patternCount} patterns)
          </span>
        )}
        {skillCount > 0 && (
          <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 text-[10px]">
            {skillCount} skills
          </span>
        )}
        {data.action && data.action !== 'query' && (
          <span className="px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 text-[10px]">
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
          {/* Pattern list */}
          {data.patterns && data.patterns.length > 0 ? (
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {data.patterns.map((pattern, idx) => (
                <PatternItem key={pattern.id || idx} pattern={pattern} />
              ))}
            </div>
          ) : (
            <div className="text-xs text-muted-foreground text-center py-2">
              No patterns found
            </div>
          )}

          {/* Skill matrix preview */}
          {data.skillMatrix && Object.keys(data.skillMatrix).length > 0 && (
            <div className="bg-background/50 rounded-lg p-3 border border-border/30">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <Award className="w-3.5 h-3.5 text-purple-400" />
                <span className="uppercase">Skill Matrix ({skillCount} agents)</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {Object.entries(data.skillMatrix).slice(0, 6).map(([agent, skills]) => (
                  <span
                    key={agent}
                    className="px-2 py-1 rounded bg-primary/10 text-primary text-[10px]"
                    title={`${agent}: ${Array.isArray(skills) ? skills.join(', ') : skills}`}
                  >
                    {agent}: {Array.isArray(skills) ? skills.length : 0} skills
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t border-border/30">
            <span className="flex items-center gap-1">
              <Brain className="w-3 h-3" />
              {patternCount} patterns
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
