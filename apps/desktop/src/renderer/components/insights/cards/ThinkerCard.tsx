/**
 * ThinkerCard - Rich visualization card for k_thinker_channel results
 *
 * Displays:
 * - Thinker-to-thinker communication
 * - Chat-style message display
 * - Target agent info
 */

import { useState } from 'react';
import {
  MessageSquare,
  ChevronDown,
  ChevronUp,
  Send,
  User,
  Clock,
  CheckCircle,
  ArrowRight,
} from 'lucide-react';
import type { ThinkerData, ThinkerMessage } from '../../../types/insights';

interface ThinkerCardProps {
  data: ThinkerData;
  collapsed?: boolean;
}

function MessageItem({ message }: { message: ThinkerMessage }) {
  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-card/30 border border-border/50">
      <User className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-violet-400">
            {message.from}
          </span>
          {message.timestamp && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(message.timestamp).toLocaleTimeString()}
            </span>
          )}
        </div>
        <div className="mt-1 text-sm text-foreground whitespace-pre-wrap break-words">
          {message.content}
        </div>
      </div>
    </div>
  );
}

export function ThinkerCard({ data, collapsed: initialCollapsed = false }: ThinkerCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);

  const messageCount = data.messages?.length || 0;
  const isSendAction = data.action === 'send_line';

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card/50 mt-2">
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-secondary/50 hover:bg-secondary/70 transition-colors"
      >
        <MessageSquare className="w-4 h-4 text-violet-400" />
        <span className="text-sm font-medium text-foreground">Thinker Channel</span>
        {data.targetAgentId && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <ArrowRight className="w-3 h-3" />
            {data.targetAgentId}
          </span>
        )}
        {isSendAction && data.sent && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 text-[10px]">
            <CheckCircle className="w-3 h-3" />
            Sent
          </span>
        )}
        {data.action && (
          <span className="px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 text-[10px]">
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
          {/* Target agent info */}
          {data.targetAgentId && (
            <div className="bg-background/50 rounded-lg p-2 border border-border/30">
              <div className="flex items-center gap-2 text-xs">
                <User className="w-3.5 h-3.5 text-violet-400" />
                <span className="text-muted-foreground">Target:</span>
                <span className="text-foreground font-medium">{data.targetAgentId}</span>
              </div>
            </div>
          )}

          {/* Messages list */}
          {data.messages && data.messages.length > 0 ? (
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {data.messages.map((msg, idx) => (
                <MessageItem key={idx} message={msg} />
              ))}
            </div>
          ) : data.output ? (
            /* Single output/content */
            <div className="bg-zinc-900 rounded-lg p-3 border border-border/30">
              <pre className="text-xs font-mono text-foreground overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap">
                {data.output}
              </pre>
            </div>
          ) : isSendAction && data.sent ? (
            <div className="flex items-center justify-center gap-2 py-4 text-green-400">
              <CheckCircle className="w-5 h-5" />
              <span className="text-sm">Message sent successfully</span>
            </div>
          ) : (
            <div className="text-xs text-muted-foreground text-center py-2">
              No messages
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t border-border/30">
            <span className="flex items-center gap-1">
              <MessageSquare className="w-3 h-3" />
              {data.action || 'read'}
            </span>
            {messageCount > 0 && (
              <span>{messageCount} messages</span>
            )}
            {isSendAction && (
              <span className="flex items-center gap-1">
                <Send className="w-3 h-3" />
                {data.sent ? 'Delivered' : 'Pending'}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
