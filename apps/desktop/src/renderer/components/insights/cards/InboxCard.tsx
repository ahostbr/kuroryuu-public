/**
 * InboxCard - Rich visualization card for k_inbox results
 *
 * Displays:
 * - Message list with status badges
 * - Message details (from, subject, priority)
 * - Folder indicator
 */

import { useState } from 'react';
import {
  Inbox,
  ChevronDown,
  ChevronUp,
  Mail,
  MailOpen,
  CheckCircle,
  AlertCircle,
  Clock,
  User,
} from 'lucide-react';
import type { InboxData, InboxMessage } from '../../../types/insights';

interface InboxCardProps {
  data: InboxData;
  collapsed?: boolean;
}

function getPriorityColor(priority?: string): string {
  switch (priority?.toLowerCase()) {
    case 'high':
    case 'urgent':
      return 'text-red-400';
    case 'medium':
      return 'text-yellow-400';
    case 'low':
      return 'text-green-400';
    default:
      return 'text-muted-foreground';
  }
}

function getStatusIcon(status?: string) {
  switch (status?.toLowerCase()) {
    case 'done':
    case 'complete':
    case 'completed':
      return <CheckCircle className="w-3.5 h-3.5 text-green-400" />;
    case 'error':
    case 'failed':
      return <AlertCircle className="w-3.5 h-3.5 text-red-400" />;
    case 'pending':
    case 'new':
      return <Mail className="w-3.5 h-3.5 text-blue-400" />;
    default:
      return <MailOpen className="w-3.5 h-3.5 text-muted-foreground" />;
  }
}

function MessageItem({ message }: { message: InboxMessage }) {
  return (
    <div className="flex items-start gap-3 px-3 py-2 rounded-lg bg-card/30 border border-border/50">
      {getStatusIcon(message.status)}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm text-foreground font-medium truncate">
            {message.subject || message.type || 'Message'}
          </span>
          {message.priority && (
            <span className={`text-[10px] ${getPriorityColor(message.priority)}`}>
              {message.priority}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <User className="w-3 h-3" />
            {message.from}
          </span>
          {message.timestamp && (
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(message.timestamp).toLocaleString()}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function InboxCard({ data, collapsed: initialCollapsed = false }: InboxCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);

  const messageCount = data.messages?.length || data.count || (data.message ? 1 : 0);

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card/50 mt-2">
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-secondary/50 hover:bg-secondary/70 transition-colors"
      >
        <Inbox className="w-4 h-4 text-indigo-400" />
        <span className="text-sm font-medium text-foreground">Inbox</span>
        <span className="text-xs text-muted-foreground">
          ({messageCount} {messageCount === 1 ? 'message' : 'messages'})
        </span>
        {data.folder && data.folder !== 'new' && (
          <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 text-[10px]">
            {data.folder}
          </span>
        )}
        {data.action && data.action !== 'list' && (
          <span className="px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 text-[10px]">
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
          {/* Message list */}
          {data.messages && data.messages.length > 0 ? (
            <div className="space-y-1.5 max-h-60 overflow-y-auto">
              {data.messages.map((msg, idx) => (
                <MessageItem key={msg.id || idx} message={msg} />
              ))}
            </div>
          ) : data.message ? (
            /* Single message */
            <MessageItem message={data.message} />
          ) : (
            <div className="text-xs text-muted-foreground text-center py-2">
              No messages found
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t border-border/30">
            <span className="flex items-center gap-1">
              <Mail className="w-3 h-3" />
              {messageCount} messages
            </span>
            {data.folder && (
              <span className="flex items-center gap-1">
                Folder: {data.folder}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
