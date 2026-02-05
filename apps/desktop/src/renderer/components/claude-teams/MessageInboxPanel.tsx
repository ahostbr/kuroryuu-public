/**
 * Message Inbox Panel - Inter-teammate message viewer
 *
 * Displays messages from all teammates with filtering and system message parsing.
 * Shows both plain text messages (chat style) and system messages (compact badges).
 */
import { useState, useMemo, useRef, useEffect } from 'react';
import { MessageSquare, Filter, ChevronDown, User } from 'lucide-react';
import { useClaudeTeamsStore } from '../../stores/claude-teams-store';
import { parseSystemMessage, type InboxMessage, type SystemMessage } from '../../types/claude-teams';

type MessageFilter = 'all' | string; // 'all' or agent name

interface MessageWithAgent extends InboxMessage {
  agentName: string;
}

export function MessageInboxPanel() {
  const selectedTeam = useClaudeTeamsStore((s) => s.selectedTeam);
  const [filter, setFilter] = useState<MessageFilter>('all');
  const [showFilterMenu, setShowFilterMenu] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const filterMenuRef = useRef<HTMLDivElement>(null);

  // Flatten all inboxes into a single sorted list
  const allMessages = useMemo<MessageWithAgent[]>(() => {
    if (!selectedTeam) return [];
    return Object.entries(selectedTeam.inboxes)
      .flatMap(([agentName, msgs]) =>
        msgs.map((m) => ({ ...m, agentName }))
      )
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [selectedTeam]);

  // Get unique agent names for filter
  const agentNames = useMemo(() => {
    if (!selectedTeam) return [];
    return Array.from(new Set(Object.keys(selectedTeam.inboxes))).sort();
  }, [selectedTeam]);

  // Apply filter
  const filteredMessages = useMemo(() => {
    if (filter === 'all') return allMessages;
    return allMessages.filter((m) => m.agentName === filter);
  }, [allMessages, filter]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [filteredMessages]);

  // Close filter menu on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target as Node)) {
        setShowFilterMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!selectedTeam) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No team selected</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-secondary/30">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-foreground">Messages</h2>
          <span className="text-xs text-muted-foreground">
            ({filteredMessages.length})
          </span>
        </div>

        {/* Filter Dropdown */}
        <div className="relative" ref={filterMenuRef}>
          <button
            onClick={() => setShowFilterMenu(!showFilterMenu)}
            className="flex items-center gap-2 px-3 py-1.5 text-sm bg-secondary hover:bg-secondary/80 border border-border rounded-md transition-colors"
          >
            <Filter className="w-4 h-4" />
            {filter === 'all' ? 'All' : filter}
            <ChevronDown className="w-3 h-3" />
          </button>

          {showFilterMenu && (
            <div className="absolute right-0 mt-2 w-48 bg-secondary border border-border rounded-lg shadow-lg z-10 overflow-hidden">
              <button
                onClick={() => {
                  setFilter('all');
                  setShowFilterMenu(false);
                }}
                className={`w-full text-left px-4 py-2 text-sm hover:bg-secondary/80 transition-colors ${
                  filter === 'all' ? 'bg-primary/10 text-primary font-medium' : 'text-foreground'
                }`}
              >
                All Messages
              </button>
              <div className="border-t border-border my-1" />
              {agentNames.map((name) => (
                <button
                  key={name}
                  onClick={() => {
                    setFilter(name);
                    setShowFilterMenu(false);
                  }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-secondary/80 transition-colors ${
                    filter === name ? 'bg-primary/10 text-primary font-medium' : 'text-foreground'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <User className="w-3 h-3" />
                    {name}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Message List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {filteredMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full text-muted-foreground">
            <div className="text-center">
              <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No messages yet</p>
              <p className="text-xs mt-1">
                Messages from teammates will appear here
              </p>
            </div>
          </div>
        ) : (
          filteredMessages.map((msg, idx) => (
            <MessageItem key={idx} message={msg} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
}

// Helper component to render individual messages
function MessageItem({ message }: { message: MessageWithAgent }) {
  const systemMsg = parseSystemMessage(message.text);

  if (systemMsg) {
    return <SystemMessageBadge message={message} systemMessage={systemMsg} />;
  }

  // Plain text message - chat bubble style
  const timestamp = new Date(message.timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  // Derive color dot from message color or default
  const colorDot = message.color || '#888';

  return (
    <div className="flex flex-col gap-1">
      {/* Sender header */}
      <div className="flex items-center gap-2 text-xs">
        <div
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: colorDot }}
        />
        <span className="font-medium text-foreground">{message.agentName}</span>
        <span className="text-muted-foreground">{timestamp}</span>
      </div>

      {/* Message bubble */}
      <div className="ml-4 bg-secondary/50 rounded-lg px-4 py-2.5 border border-border">
        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
          {message.text}
        </p>
        {message.summary && (
          <p className="text-xs text-muted-foreground mt-2 italic">
            {message.summary}
          </p>
        )}
      </div>
    </div>
  );
}

// System message badge (compact format)
function SystemMessageBadge({
  message,
  systemMessage,
}: {
  message: MessageWithAgent;
  systemMessage: SystemMessage;
}) {
  const timestamp = new Date(message.timestamp).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });

  // Badge style based on system message type
  const badgeStyles: Record<SystemMessage['type'], { bg: string; text: string; label: string }> = {
    idle_notification: { bg: 'bg-gray-500/20', text: 'text-gray-400', label: 'IDLE' },
    shutdown_approved: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'SHUTDOWN' },
    shutdown_request: { bg: 'bg-orange-500/20', text: 'text-orange-400', label: 'SHUTDOWN REQ' },
    task_completed: { bg: 'bg-green-500/20', text: 'text-green-400', label: 'TASK DONE' },
  };

  const style = badgeStyles[systemMessage.type] || {
    bg: 'bg-gray-500/20',
    text: 'text-gray-400',
    label: 'SYSTEM',
  };

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-secondary/30 rounded-md border border-border/50">
      <div className="flex items-center gap-2 flex-1">
        <span
          className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded ${style.bg} ${style.text}`}
        >
          {style.label}
        </span>
        <span className="text-xs font-medium text-foreground">{message.agentName}</span>
        {systemMessage.type === 'task_completed' && 'taskId' in systemMessage && (
          <span className="text-xs text-muted-foreground">
            #{systemMessage.taskId}
          </span>
        )}
      </div>
      <span className="text-xs text-muted-foreground">{timestamp}</span>
    </div>
  );
}
