/**
 * TerminalCard - Rich visualization card for k_pty results
 *
 * Displays:
 * - PTY session list with shell info
 * - Terminal output preview
 * - Session metadata (cols, rows, source)
 */

import { useState } from 'react';
import {
  Terminal,
  ChevronDown,
  ChevronUp,
  MonitorSmartphone,
  Laptop,
  Hash,
} from 'lucide-react';
import type { TerminalData, TerminalSession } from '../../../types/insights';

interface TerminalCardProps {
  data: TerminalData;
  collapsed?: boolean;
}

function SessionItem({ session }: { session: TerminalSession }) {
  const isDesktop = session.source === 'desktop';

  return (
    <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-card/30 border border-border/50">
      {isDesktop ? (
        <MonitorSmartphone className="w-4 h-4 text-blue-400 flex-shrink-0" />
      ) : (
        <Laptop className="w-4 h-4 text-green-400 flex-shrink-0" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-foreground truncate">
            {session.session_id.slice(0, 12)}...
          </span>
          <span className="text-xs text-muted-foreground">
            {session.shell || 'shell'}
          </span>
        </div>
        {session.cwd && (
          <div className="text-xs text-muted-foreground truncate">
            {session.cwd}
          </div>
        )}
      </div>
      {session.cols && session.rows && (
        <span className="text-xs text-muted-foreground">
          {session.cols}x{session.rows}
        </span>
      )}
    </div>
  );
}

export function TerminalCard({ data, collapsed: initialCollapsed = false }: TerminalCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);

  const sessionCount = data.sessions?.length || data.count || 0;

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card/50 mt-2">
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-secondary/50 hover:bg-secondary/70 transition-colors"
      >
        <Terminal className="w-4 h-4 text-green-400" />
        <span className="text-sm font-medium text-foreground">PTY Sessions</span>
        <span className="text-xs text-muted-foreground">
          ({sessionCount} {sessionCount === 1 ? 'session' : 'sessions'})
        </span>
        {data.action && data.action !== 'list' && (
          <span className="px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 text-[10px]">
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
        <div className="p-3 space-y-2">
          {/* Session list */}
          {data.sessions && data.sessions.length > 0 ? (
            <div className="space-y-1.5">
              {data.sessions.map((session, idx) => (
                <SessionItem key={session.session_id || idx} session={session} />
              ))}
            </div>
          ) : data.output ? (
            /* Output preview */
            <div className="bg-background/50 rounded-lg p-3 border border-border/30">
              <pre className="text-xs font-mono text-muted-foreground overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap">
                {data.output.slice(0, 1000)}
                {data.output.length > 1000 && '...'}
              </pre>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground text-center py-2">
              No sessions found
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t border-border/30">
            <span className="flex items-center gap-1">
              <Hash className="w-3 h-3" />
              {sessionCount} sessions
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
