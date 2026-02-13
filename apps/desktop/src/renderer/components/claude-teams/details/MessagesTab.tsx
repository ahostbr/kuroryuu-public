import React, { useState, useMemo, useRef, useEffect } from 'react';
import { MessageSquare } from 'lucide-react';
import type { InboxMessage } from '../../../types/claude-teams';
import { parseSystemMessage } from '../../../types/claude-teams';

interface MessagesTabProps {
  inboxes: Record<string, InboxMessage[]>;
  members: { name: string; color?: string; agentType: string }[];
  mode: 'live' | 'archive';
}

type MessageWithAgent = InboxMessage & { _agentName: string };

export const MessagesTab: React.FC<MessagesTabProps> = ({ inboxes, members, mode }) => {
  const [filter, setFilter] = useState<'all' | string>('all');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const memberColors = useMemo(() => {
    const colors: Record<string, string> = {};
    members.forEach(member => {
      colors[member.name] = member.color || '#888';
    });
    return colors;
  }, [members]);

  const allMessages = useMemo(() => {
    const messages = Object.entries(inboxes)
      .flatMap(([agentName, msgs]) => msgs.map(m => ({ ...m, _agentName: agentName } as MessageWithAgent)))
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
    return messages;
  }, [inboxes]);

  const filteredMessages = useMemo(() => {
    if (filter === 'all') return allMessages;
    return allMessages.filter(m => m._agentName === filter);
  }, [allMessages, filter]);

  const uniqueAgents = useMemo(() => {
    const agents = new Set<string>();
    Object.keys(inboxes).forEach(agentName => agents.add(agentName));
    return Array.from(agents).sort();
  }, [inboxes]);

  useEffect(() => {
    if (mode === 'live' && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filteredMessages, mode]);

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const getSystemMessageBadgeStyle = (type: string) => {
    switch (type) {
      case 'idle_notification':
        return { bg: 'bg-muted-foreground/15', text: 'text-muted-foreground', label: 'IDLE' };
      case 'shutdown_approved':
        return { bg: 'bg-destructive/15', text: 'text-destructive', label: 'SHUTDOWN' };
      case 'shutdown_request':
        return { bg: 'bg-warning/15', text: 'text-warning', label: 'SHUTDOWN REQ' };
      case 'task_completed':
        return { bg: 'bg-success/15', text: 'text-success', label: 'TASK DONE' };
      default:
        return { bg: 'bg-secondary/20', text: 'text-muted-foreground', label: 'SYSTEM' };
    }
  };

  return (
    <div>
      {/* Agent filter bar */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        <button
          onClick={() => setFilter('all')}
          className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors cursor-pointer ${
            filter === 'all'
              ? 'bg-primary/20 text-primary'
              : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
          }`}
        >
          All
        </button>
        {uniqueAgents.map(agent => {
          const color = memberColors[agent] || '#888';
          return (
            <button
              key={agent}
              onClick={() => setFilter(agent)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium transition-colors cursor-pointer ${
                filter === agent
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              }`}
            >
              <div className="w-1 h-1 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
              {agent}
            </button>
          );
        })}
      </div>

      {/* Message list */}
      <div className="space-y-2 max-h-[500px] overflow-y-auto">
        {filteredMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
            <MessageSquare className="w-8 h-8 opacity-30 mb-2" />
            <p className="text-xs">No messages yet</p>
          </div>
        ) : (
          filteredMessages.map((msg, idx) => {
            const systemMsg = parseSystemMessage(msg.text);
            const timestamp = formatTimestamp(msg.timestamp);

            if (systemMsg) {
              const badgeStyle = getSystemMessageBadgeStyle(systemMsg.type);
              return (
                <div
                  key={`${msg._agentName}-${idx}`}
                  className="flex items-center gap-2 px-2.5 py-1.5 bg-secondary/20 rounded border border-border/30 text-[10px]"
                >
                  <span className={`px-1.5 py-0.5 rounded font-medium ${badgeStyle.bg} ${badgeStyle.text}`}>
                    {badgeStyle.label}
                  </span>
                  {msg.from && <span className="text-muted-foreground">{msg.from}</span>}
                  <span className="text-muted-foreground/50 ml-auto flex-shrink-0">{timestamp}</span>
                </div>
              );
            }

            const memberColor = memberColors[msg.from || ''] || '#888';
            const displayText = msg.text.length > 500 ? msg.text.slice(0, 500) + '...' : msg.text;

            return (
              <div key={`${msg._agentName}-${idx}`} className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5 text-[10px]">
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: msg.color || memberColor }}
                  />
                  <span className="font-medium text-foreground">{msg.from}</span>
                  <span className="text-muted-foreground/60">{timestamp}</span>
                  <span className="text-muted-foreground/40">in {msg._agentName}</span>
                </div>
                <div className="ml-3 bg-secondary/40 rounded-lg px-3 py-2 border border-border/40">
                  <p className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap break-words">
                    {displayText}
                  </p>
                  {msg.summary && (
                    <p className="text-[10px] text-muted-foreground mt-1.5 italic">{msg.summary}</p>
                  )}
                </div>
              </div>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
};
