/**
 * TeammateOutputViewer - Scrollable viewer for teammate inbox messages.
 * Parses system messages for special badge formatting, supports auto-scroll
 * with manual pause, and optional text filtering.
 */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { MessageSquare, ArrowDown, Search } from 'lucide-react';
import { parseSystemMessage } from '../../types/claude-teams';
import type { InboxMessage, SystemMessage } from '../../types/claude-teams';

interface TeammateOutputViewerProps {
  messages: InboxMessage[];
  agentName: string;
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch {
    return iso;
  }
}

function SystemBadge({ sysMsg }: { sysMsg: SystemMessage }) {
  let label: string;
  let className: string;

  switch (sysMsg.type) {
    case 'idle_notification':
      label = 'IDLE';
      className = 'bg-yellow-900/40 text-yellow-400 border-yellow-700/50';
      break;
    case 'shutdown_approved':
      label = 'SHUTDOWN';
      className = 'bg-red-900/40 text-red-400 border-red-700/50';
      break;
    case 'task_completed':
      label = 'TASK DONE';
      className = 'bg-green-900/40 text-green-400 border-green-700/50';
      break;
    case 'shutdown_request':
      label = 'SHUTDOWN REQ';
      className = 'bg-orange-900/40 text-orange-400 border-orange-700/50';
      break;
  }

  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${className}`}>
      {label}
    </span>
  );
}

function SystemMessageContent({ sysMsg }: { sysMsg: SystemMessage }) {
  switch (sysMsg.type) {
    case 'idle_notification':
      return <span className="text-yellow-500/70">Reason: {sysMsg.idleReason}</span>;
    case 'shutdown_approved':
      return <span className="text-red-500/70">Backend: {sysMsg.backendType}</span>;
    case 'task_completed':
      return <span className="text-green-500/70">Task #{sysMsg.taskId}</span>;
    case 'shutdown_request':
      return <span className="text-orange-500/70">{sysMsg.content ?? 'No reason given'}</span>;
  }
}

function MessageItem({ message }: { message: InboxMessage }) {
  const sysMsg = parseSystemMessage(message.text);

  return (
    <div className={`px-2 py-1.5 border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors
      ${!message.read ? 'border-l-2 border-l-cyan-400' : ''}`}>
      <div className="flex items-center gap-2 mb-0.5">
        <span className="text-[10px] text-gray-600 font-mono">{formatTimestamp(message.timestamp)}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700/50">
          {message.from}
        </span>
        {sysMsg && <SystemBadge sysMsg={sysMsg} />}
        {!message.read && (
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 flex-shrink-0" />
        )}
      </div>
      <div className={`text-xs break-words pl-1 ${message.read ? 'text-gray-500' : 'text-gray-300'}`}>
        {sysMsg ? (
          <SystemMessageContent sysMsg={sysMsg} />
        ) : (
          <span>{message.text}</span>
        )}
      </div>
      {message.summary && !sysMsg && (
        <div className="text-[10px] text-gray-600 pl-1 mt-0.5 italic">{message.summary}</div>
      )}
    </div>
  );
}

export function TeammateOutputViewer({ messages, agentName }: TeammateOutputViewerProps) {
  const [filter, setFilter] = useState('');
  const [autoScroll, setAutoScroll] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevMessageCountRef = useRef(messages.length);

  // Filter messages by text content
  const filteredMessages = useMemo(() => {
    if (!filter.trim()) return messages;
    const q = filter.toLowerCase();
    return messages.filter(
      (m) =>
        m.text.toLowerCase().includes(q) ||
        m.from.toLowerCase().includes(q) ||
        (m.summary?.toLowerCase().includes(q) ?? false)
    );
  }, [messages, filter]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current && messages.length > prevMessageCountRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length, autoScroll]);

  // Detect manual scroll to pause auto-scroll
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoScroll(atBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      setAutoScroll(true);
    }
  }, []);

  return (
    <div className="flex flex-col h-full">
      {/* Filter bar */}
      <div className="flex items-center gap-1.5 px-2 py-1.5 border-b border-gray-800">
        <Search className="w-3 h-3 text-gray-600 flex-shrink-0" />
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter messages..."
          className="flex-1 bg-transparent text-xs text-gray-300 placeholder-gray-600
            focus:outline-none"
        />
        {filter && (
          <span className="text-[10px] text-gray-500">
            {filteredMessages.length}/{messages.length}
          </span>
        )}
      </div>

      {/* Messages area */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto max-h-48"
      >
        {filteredMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-gray-600">
            <MessageSquare className="w-5 h-5 mb-1 opacity-40" />
            <span className="text-[11px]">
              {messages.length === 0
                ? `No messages for ${agentName}`
                : 'No matching messages'}
            </span>
          </div>
        ) : (
          filteredMessages.map((msg, i) => (
            <MessageItem key={`${msg.timestamp}-${i}`} message={msg} />
          ))
        )}
      </div>

      {/* Scroll-to-bottom button */}
      {!autoScroll && messages.length > 0 && (
        <button
          onClick={scrollToBottom}
          className="flex items-center justify-center gap-1 py-1 text-[10px]
            text-cyan-400 bg-gray-900/80 border-t border-gray-800
            hover:bg-gray-800 transition-colors"
        >
          <ArrowDown className="w-3 h-3" />
          New messages
        </button>
      )}
    </div>
  );
}
