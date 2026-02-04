/**
 * HelpCard - Rich visualization card for k_help results
 *
 * Displays:
 * - Tool help information
 * - Available actions
 * - Usage examples
 * - All tools list
 */

import { useState } from 'react';
import {
  HelpCircle,
  ChevronDown,
  ChevronUp,
  BookOpen,
  Terminal,
  Code,
  List,
} from 'lucide-react';
import type { HelpData, HelpToolEntry } from '../../../types/insights';

interface HelpCardProps {
  data: HelpData;
  collapsed?: boolean;
}

function ToolItem({ tool }: { tool: HelpToolEntry }) {
  return (
    <div className="px-3 py-2 rounded-lg bg-card/30 border border-border/50">
      <div className="flex items-center gap-2">
        <Terminal className="w-4 h-4 text-teal-400 flex-shrink-0" />
        <span className="text-sm font-medium text-foreground">{tool.name}</span>
      </div>
      <div className="mt-1 text-xs text-muted-foreground truncate">
        {tool.description}
      </div>
      {tool.actions && tool.actions.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {tool.actions.slice(0, 5).map((action, idx) => (
            <span
              key={idx}
              className="px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-400 text-[9px]"
            >
              {action}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function HelpCard({ data, collapsed: initialCollapsed = false }: HelpCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);

  const toolCount = data.allTools?.length || 0;
  const actionCount = data.actions ? Object.keys(data.actions).length : 0;

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card/50 mt-2">
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-secondary/50 hover:bg-secondary/70 transition-colors"
      >
        <HelpCircle className="w-4 h-4 text-teal-400" />
        <span className="text-sm font-medium text-foreground">Help</span>
        {data.tool && (
          <span className="px-1.5 py-0.5 rounded bg-teal-500/10 text-teal-400 text-[10px]">
            {data.tool}
          </span>
        )}
        {(data.toolsCount || toolCount > 0) && (
          <span className="text-xs text-muted-foreground">
            ({data.toolsCount || toolCount} tools)
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
          {/* Usage hint */}
          {data.usage && (
            <div className="text-xs text-muted-foreground bg-teal-500/5 rounded px-2 py-1 border border-teal-500/20">
              💡 {data.usage}
            </div>
          )}

          {/* Tip */}
          {data.tip && (
            <div className="text-xs text-muted-foreground bg-blue-500/5 rounded px-2 py-1 border border-blue-500/20">
              🔍 {data.tip}
            </div>
          )}

          {/* Tool description */}
          {data.description && (
            <div className="bg-background/50 rounded-lg p-3 border border-border/30">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                <BookOpen className="w-3.5 h-3.5 text-teal-400" />
                <span className="uppercase">Description</span>
              </div>
              <div className="text-sm text-foreground">{data.description}</div>
            </div>
          )}

          {/* Keywords */}
          {data.keywords && data.keywords.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {data.keywords.map((kw, idx) => (
                <span
                  key={idx}
                  className="px-1.5 py-0.5 rounded bg-secondary text-muted-foreground text-[10px]"
                >
                  {kw}
                </span>
              ))}
            </div>
          )}

          {/* Actions */}
          {data.actions && actionCount > 0 && (
            <div className="bg-background/50 rounded-lg p-3 border border-border/30">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <List className="w-3.5 h-3.5 text-teal-400" />
                <span className="uppercase">Actions ({actionCount})</span>
              </div>
              <div className="space-y-1">
                {Object.entries(data.actions).map(([name, desc]) => (
                  <div key={name} className="flex items-start gap-2">
                    <code className="text-xs font-mono text-teal-400 whitespace-nowrap">{name}</code>
                    <span className="text-xs text-muted-foreground">{desc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Examples */}
          {data.examples && data.examples.length > 0 && (
            <div className="bg-background/50 rounded-lg p-3 border border-border/30">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <Code className="w-3.5 h-3.5 text-teal-400" />
                <span className="uppercase">Examples</span>
              </div>
              <div className="space-y-1">
                {data.examples.map((example, idx) => (
                  <code
                    key={idx}
                    className="block text-xs font-mono text-foreground bg-zinc-800 rounded px-2 py-1"
                  >
                    {example}
                  </code>
                ))}
              </div>
            </div>
          )}

          {/* All tools list */}
          {data.allTools && data.allTools.length > 0 && (
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {data.allTools.map((tool, idx) => (
                <ToolItem key={tool.name || idx} tool={tool} />
              ))}
            </div>
          )}

          {/* Empty state */}
          {!data.description && actionCount === 0 && toolCount === 0 && (
            <div className="text-xs text-muted-foreground text-center py-2">
              No help data available
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t border-border/30">
            <span className="flex items-center gap-1">
              <HelpCircle className="w-3 h-3" />
              {data.tool || 'Help'}
            </span>
            {actionCount > 0 && (
              <span>{actionCount} actions</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
