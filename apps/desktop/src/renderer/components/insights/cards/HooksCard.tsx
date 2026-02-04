/**
 * HooksCard - Rich visualization card for k_session/k_hooks results
 *
 * Displays:
 * - Session lifecycle events
 * - Hook configurations
 * - Context data
 */

import { useState } from 'react';
import {
  Settings,
  ChevronDown,
  ChevronUp,
  Activity,
  User,
  Terminal,
  CheckCircle,
  XCircle,
} from 'lucide-react';
import type { HooksData, HookEntry } from '../../../types/insights';

interface HooksCardProps {
  data: HooksData;
  collapsed?: boolean;
}

function HookItem({ hook }: { hook: HookEntry }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-card/30 border border-border/50">
      {hook.enabled ? (
        <CheckCircle className="w-3.5 h-3.5 text-green-400 flex-shrink-0" />
      ) : (
        <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
      )}
      <span className="text-xs font-medium text-foreground">{hook.name}</span>
      <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[9px]">
        {hook.type}
      </span>
      {hook.path && (
        <span className="text-xs text-muted-foreground truncate ml-auto">
          {hook.path.split(/[/\\]/).pop()}
        </span>
      )}
    </div>
  );
}

export function HooksCard({ data, collapsed: initialCollapsed = false }: HooksCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);

  const hookCount = data.hooks?.length || 0;

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card/50 mt-2">
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-secondary/50 hover:bg-secondary/70 transition-colors"
      >
        <Settings className="w-4 h-4 text-orange-400" />
        <span className="text-sm font-medium text-foreground">Session/Hooks</span>
        {data.action && (
          <span className="px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 text-[10px]">
            {data.action}
          </span>
        )}
        {data.sessionId && (
          <span className="text-xs text-muted-foreground truncate">
            {data.sessionId.slice(0, 12)}...
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
          {/* Session info */}
          {(data.sessionId || data.agentId || data.cliType) && (
            <div className="grid grid-cols-2 gap-2">
              {data.sessionId && (
                <div className="bg-background/50 rounded-lg p-2 border border-border/30">
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase">
                    <Activity className="w-3 h-3" />
                    Session
                  </div>
                  <div className="font-mono text-xs text-foreground truncate">
                    {data.sessionId.slice(0, 16)}...
                  </div>
                </div>
              )}
              {data.agentId && (
                <div className="bg-background/50 rounded-lg p-2 border border-border/30">
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase">
                    <User className="w-3 h-3" />
                    Agent
                  </div>
                  <div className="text-xs text-foreground truncate">{data.agentId}</div>
                </div>
              )}
              {data.cliType && (
                <div className="bg-background/50 rounded-lg p-2 border border-border/30">
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase">
                    <Terminal className="w-3 h-3" />
                    CLI Type
                  </div>
                  <div className="text-xs text-foreground">{data.cliType}</div>
                </div>
              )}
            </div>
          )}

          {/* Hooks list */}
          {data.hooks && data.hooks.length > 0 && (
            <div className="bg-background/50 rounded-lg p-3 border border-border/30">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <Settings className="w-3.5 h-3.5 text-orange-400" />
                <span className="uppercase">Hooks ({hookCount})</span>
              </div>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {data.hooks.map((hook, idx) => (
                  <HookItem key={hook.name || idx} hook={hook} />
                ))}
              </div>
            </div>
          )}

          {/* Context preview */}
          {data.context && Object.keys(data.context).length > 0 && (
            <div className="bg-background/50 rounded-lg p-2 border border-border/30">
              <div className="text-[10px] text-muted-foreground uppercase mb-1">Context</div>
              <pre className="text-xs font-mono text-muted-foreground overflow-x-auto max-h-20 overflow-y-auto whitespace-pre-wrap">
                {JSON.stringify(data.context, null, 2).slice(0, 400)}
              </pre>
            </div>
          )}

          {/* Empty state */}
          {!data.sessionId && !data.agentId && hookCount === 0 && !data.context && (
            <div className="text-xs text-muted-foreground text-center py-2">
              No session data
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t border-border/30">
            <span className="flex items-center gap-1">
              <Settings className="w-3 h-3" />
              {data.action || 'context'}
            </span>
            {hookCount > 0 && (
              <span>{hookCount} hooks</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
