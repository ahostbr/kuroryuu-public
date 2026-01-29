/**
 * MessageViewer - Displays transcript messages in a chat-like format
 *
 * Renders user/assistant messages with support for:
 * - Text content
 * - Thinking blocks (collapsible)
 * - Tool use blocks
 * - Tool results
 * - Search and filtering
 * - Infinite scroll pagination
 */
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  User,
  Bot,
  Search,
  X,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Brain,
  Wrench,
  ArrowRight,
  Loader2,
  MessageSquare,
} from 'lucide-react';
import { useTranscriptsStore, type TranscriptMessage, type MessageContentBlock } from '../../stores/transcripts-store';
import { inferSourceFromId } from '../../services/model-registry';

// ============================================================================
// Helpers
// ============================================================================

function formatTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return timestamp;
  }
}

function truncateText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + '...';
}

function getSourceColor(source: string): string {
  const colors: Record<string, string> = {
    claude: '#c99a27',           // Anthropic gold
    gemini: '#4285f4',           // Google blue
    openai: '#10a37f',           // OpenAI green
    'github-copilot': '#6e5494', // GitHub purple
    kiro: '#ff9900',             // AWS orange
    antigravity: '#8b5cf6',      // Purple
    grok: '#1da1f2',             // X/Twitter blue
    local: '#6b7280',            // Gray for local models
  };
  return colors[source] || '#6b7280';
}

// ============================================================================
// CopyButton - Copy text to clipboard
// ============================================================================

function CopyButton({ text, className = '' }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }, [text]);

  return (
    <button
      onClick={handleCopy}
      className={`p-1 rounded hover:bg-secondary/80 transition-colors ${className}`}
      title={copied ? 'Copied!' : 'Copy to clipboard'}
    >
      {copied ? (
        <Check className="w-3.5 h-3.5 text-green-500" />
      ) : (
        <Copy className="w-3.5 h-3.5 text-muted-foreground" />
      )}
    </button>
  );
}

// ============================================================================
// TextBlock - Renders text content with markdown-like formatting
// ============================================================================

function TextBlock({ text }: { text: string }) {
  // Simple markdown-ish rendering - code blocks, bold, italic
  const rendered = useMemo(() => {
    // Split on code blocks first
    const parts = text.split(/(```[\s\S]*?```|`[^`]+`)/g);

    return parts.map((part, i) => {
      // Multiline code block
      if (part.startsWith('```') && part.endsWith('```')) {
        const content = part.slice(3, -3);
        const firstNewline = content.indexOf('\n');
        const lang = firstNewline > 0 ? content.slice(0, firstNewline).trim() : '';
        const code = firstNewline > 0 ? content.slice(firstNewline + 1) : content;

        return (
          <div key={i} className="my-2 relative group">
            {lang && (
              <div className="text-xs text-muted-foreground bg-secondary/80 px-2 py-1 rounded-t border-b border-border">
                {lang}
              </div>
            )}
            <pre className="p-3 bg-secondary/50 rounded-b text-xs font-mono overflow-x-auto">
              <code>{code}</code>
            </pre>
            <CopyButton
              text={code}
              className="absolute top-1 right-1 opacity-0 group-hover:opacity-100"
            />
          </div>
        );
      }

      // Inline code
      if (part.startsWith('`') && part.endsWith('`')) {
        return (
          <code key={i} className="px-1.5 py-0.5 bg-secondary/70 rounded text-sm font-mono">
            {part.slice(1, -1)}
          </code>
        );
      }

      // Regular text - preserve newlines
      return (
        <span key={i} className="whitespace-pre-wrap">
          {part}
        </span>
      );
    });
  }, [text]);

  return <div className="text-sm text-foreground leading-relaxed">{rendered}</div>;
}

// ============================================================================
// ThinkingBlock - Collapsible thinking content
// ============================================================================

function ThinkingBlock({ thinking }: { thinking: string }) {
  const [expanded, setExpanded] = useState(false);
  const preview = truncateText(thinking, 150);

  return (
    <div className="my-2 border border-border/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-secondary/30 hover:bg-secondary/50 transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
        <Brain className="w-4 h-4 text-purple-400" />
        <span className="text-xs font-medium text-muted-foreground">Thinking</span>
        {!expanded && (
          <span className="text-xs text-muted-foreground/70 truncate flex-1">{preview}</span>
        )}
      </button>
      {expanded && (
        <div className="p-3 text-xs text-muted-foreground bg-secondary/10 whitespace-pre-wrap max-h-[300px] overflow-y-auto">
          {thinking}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ToolUseBlock - Tool invocation display
// ============================================================================

function ToolUseBlock({ name, input }: { name: string; input: unknown }) {
  const [expanded, setExpanded] = useState(false);
  const inputStr = typeof input === 'string' ? input : JSON.stringify(input, null, 2);

  return (
    <div className="my-2 border border-border/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-blue-500/10 hover:bg-blue-500/20 transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
        <Wrench className="w-4 h-4 text-blue-400" />
        <span className="text-xs font-medium text-blue-300">{name}</span>
      </button>
      {expanded && (
        <div className="p-3 relative group">
          <pre className="text-xs font-mono text-muted-foreground overflow-x-auto max-h-[200px] overflow-y-auto">
            {inputStr}
          </pre>
          <CopyButton
            text={inputStr}
            className="absolute top-1 right-1 opacity-0 group-hover:opacity-100"
          />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ToolResultBlock - Tool result display
// ============================================================================

function ToolResultBlock({ content }: { content: unknown }) {
  const [expanded, setExpanded] = useState(false);
  const contentStr = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  const preview = truncateText(contentStr, 100);

  return (
    <div className="my-2 border border-border/50 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-green-500/10 hover:bg-green-500/20 transition-colors text-left"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
        <ArrowRight className="w-4 h-4 text-green-400" />
        <span className="text-xs font-medium text-green-300">Result</span>
        {!expanded && (
          <span className="text-xs text-muted-foreground/70 truncate flex-1">{preview}</span>
        )}
      </button>
      {expanded && (
        <div className="p-3 relative group">
          <pre className="text-xs font-mono text-muted-foreground overflow-x-auto max-h-[200px] overflow-y-auto whitespace-pre-wrap">
            {contentStr}
          </pre>
          <CopyButton
            text={contentStr}
            className="absolute top-1 right-1 opacity-0 group-hover:opacity-100"
          />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// ContentBlockRenderer - Renders a single content block
// ============================================================================

function ContentBlockRenderer({ block }: { block: MessageContentBlock }) {
  switch (block.type) {
    case 'text':
      return <TextBlock text={block.text} />;
    case 'thinking':
      return <ThinkingBlock thinking={block.thinking} />;
    case 'tool_use':
      return <ToolUseBlock name={block.name} input={block.input} />;
    case 'tool_result':
      return <ToolResultBlock content={block.content} />;
    case 'image':
      return (
        <div className="my-2 p-2 bg-secondary/30 rounded text-xs text-muted-foreground">
          [Image content]
        </div>
      );
    default:
      return null;
  }
}

// ============================================================================
// MessageBubble - Individual message display
// ============================================================================

interface MessageBubbleProps {
  message: TranscriptMessage;
}

const MessageBubble = React.memo(function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.type === 'user';

  // Derive source and display name from model ID
  const { displayName, sourceLabel, sourceColor } = useMemo(() => {
    if (isUser) return { displayName: 'You', sourceLabel: null, sourceColor: null };

    if (message.model) {
      const source = inferSourceFromId(message.model);
      // Capitalize and format source name
      const sourceLabel = source
        .split('-')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');
      return {
        displayName: sourceLabel,
        sourceLabel: message.model,
        sourceColor: getSourceColor(source),
      };
    }

    return { displayName: 'Assistant', sourceLabel: null, sourceColor: null };
  }, [isUser, message.model]);

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isUser ? 'bg-primary/20' : 'bg-secondary'
        }`}
      >
        {isUser ? (
          <User className="w-4 h-4 text-primary" />
        ) : (
          <Bot className="w-4 h-4 text-muted-foreground" />
        )}
      </div>

      {/* Content */}
      <div className={`flex-1 max-w-[85%] ${isUser ? 'text-right' : ''}`}>
        {/* Header */}
        <div
          className={`flex items-center gap-2 mb-1 text-xs text-muted-foreground ${
            isUser ? 'justify-end' : ''
          }`}
        >
          <span className="font-medium" style={{ color: sourceColor || undefined }}>{displayName}</span>
          <span>{formatTimestamp(message.timestamp)}</span>
          {sourceLabel && <span className="text-muted-foreground/60">({sourceLabel})</span>}
        </div>

        {/* Message body */}
        <div
          className={`rounded-xl px-4 py-3 ${
            isUser
              ? 'bg-primary/10 border border-primary/20'
              : 'bg-card border border-border'
          }`}
        >
          {/* Raw content (simple string messages) */}
          {message.rawContent && message.content.length === 0 && (
            <TextBlock text={message.rawContent} />
          )}

          {/* Content blocks */}
          {message.content.map((block, index) => (
            <ContentBlockRenderer key={index} block={block} />
          ))}
        </div>
      </div>
    </div>
  );
});

// ============================================================================
// MessageViewer - Main component
// ============================================================================

interface MessageViewerProps {
  sessionPath: string;
  onBack?: () => void;
}

export function MessageViewer({ sessionPath, onBack }: MessageViewerProps) {
  const {
    currentMessages,
    allMessages,
    messagesLoading,
    messageSearchQuery,
    loadMessages,
    loadMoreMessages,
    searchMessages,
    clearMessages,
  } = useTranscriptsStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLDivElement>(null);

  // Load messages on mount/path change
  useEffect(() => {
    loadMessages(sessionPath);
    return () => {
      // Don't clear on unmount - keep cached
    };
  }, [sessionPath, loadMessages]);

  // Infinite scroll observer
  useEffect(() => {
    if (!loadMoreRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !messagesLoading) {
          loadMoreMessages();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [loadMoreMessages, messagesLoading]);

  const hasMore = currentMessages.length < allMessages.length;

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
        {onBack && (
          <button
            onClick={onBack}
            className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-muted-foreground rotate-180" />
          </button>
        )}

        <MessageSquare className="w-5 h-5 text-primary" />
        <h2 className="text-sm font-medium text-foreground flex-1">Messages</h2>

        <span className="text-xs text-muted-foreground">
          {currentMessages.length} / {allMessages.length}
        </span>
      </div>

      {/* Search */}
      <div className="px-4 py-2 border-b border-border">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={messageSearchQuery}
            onChange={(e) => searchMessages(e.target.value)}
            placeholder="Search messages..."
            className="w-full pl-9 pr-8 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
          />
          {messageSearchQuery && (
            <button
              onClick={() => searchMessages('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-muted transition-colors"
            >
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={containerRef} className="flex-1 overflow-y-auto p-4 space-y-4">
        {messagesLoading && currentMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
              <p>Loading messages...</p>
            </div>
          </div>
        ) : currentMessages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center text-muted-foreground">
              <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg mb-2">No messages found</p>
              <p className="text-sm">
                {messageSearchQuery ? 'Try a different search query' : 'This transcript appears to be empty'}
              </p>
            </div>
          </div>
        ) : (
          <>
            {currentMessages.map((message) => (
              <MessageBubble key={message.uuid} message={message} />
            ))}

            {/* Load more trigger */}
            {hasMore && (
              <div ref={loadMoreRef} className="py-4 text-center">
                {messagesLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin mx-auto text-muted-foreground" />
                ) : (
                  <button
                    onClick={loadMoreMessages}
                    className="text-sm text-primary hover:underline"
                  >
                    Load more messages
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
