/**
 * Copilot Chat Message Component
 * Styled to match VS Code Copilot interface
 */
import { useState } from 'react';
import { User, Wrench, Copy, Check, ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '../../lib/utils';

interface ChatMessageData {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  toolName?: string;
  toolResult?: string;
  isStreaming?: boolean;
}

interface CopilotMessageProps {
  message: ChatMessageData;
}

export function CopilotMessage({ message }: CopilotMessageProps) {
  const [copied, setCopied] = useState(false);
  const [toolExpanded, setToolExpanded] = useState(false);
  
  const isUser = message.role === 'user';
  const isTool = message.role === 'tool';
  
  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  
  // Tool call message
  if (isTool) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="px-4 py-2"
      >
        <button
          onClick={() => setToolExpanded(!toolExpanded)}
          className={cn(
            "flex items-center gap-2 w-full p-2 rounded-lg",
            "bg-[var(--copilot-msg-tool-bg)] border border-[var(--copilot-accent-blue)]/20",
            "hover:bg-[var(--copilot-accent-blue)]/20 transition-colors",
            "text-left"
          )}
        >
          <div className="flex items-center justify-center w-6 h-6 rounded bg-[var(--copilot-accent-blue)]/20">
            <Wrench className="w-3.5 h-3.5 text-[var(--copilot-accent-blue)]" />
          </div>
          
          <span className="flex-1 text-sm text-[var(--copilot-accent-blue)] font-medium">
            {message.toolName}
          </span>
          
          {toolExpanded ? (
            <ChevronDown className="w-4 h-4 text-[var(--copilot-text-muted)]" />
          ) : (
            <ChevronRight className="w-4 h-4 text-[var(--copilot-text-muted)]" />
          )}
        </button>
        
        <AnimatePresence>
          {toolExpanded && message.toolResult && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-2 ml-8"
            >
              <pre className={cn(
                "p-3 rounded-lg text-xs overflow-x-auto",
                "bg-[var(--copilot-bg-primary)] border border-[var(--copilot-border-default)]",
                "text-[var(--copilot-text-secondary)] font-mono"
              )}>
                {message.toolResult}
              </pre>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    );
  }
  
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "group px-4 py-3",
        isUser && "bg-[var(--copilot-msg-user-bg)]"
      )}
    >
      <div className="max-w-3xl mx-auto">
        <div className="flex gap-3">
          {/* Avatar */}
          <div className={cn(
            "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
            isUser
              ? "bg-[var(--copilot-accent-blue)]/20"
              : "bg-[var(--copilot-accent-purple)]/20"
          )}>
            {isUser ? (
              <User className="w-4 h-4 text-[var(--copilot-accent-blue)]" />
            ) : (
              <Sparkles className="w-4 h-4 text-[var(--copilot-accent-purple)]" />
            )}
          </div>
          
          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Header */}
            <div className="flex items-center gap-2 mb-1">
              <span className="text-sm font-medium text-[var(--copilot-text-primary)]">
                {isUser ? 'You' : 'Kuroryuu'}
              </span>
              <span className="text-xs text-[var(--copilot-text-muted)]">
                {new Date(message.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            </div>
            
            {/* Message Body */}
            <div className={cn(
              "prose prose-invert prose-sm max-w-none",
              "text-[var(--copilot-text-primary)]",
              "[&_pre]:bg-[var(--copilot-bg-primary)] [&_pre]:border [&_pre]:border-[var(--copilot-border-default)]",
              "[&_pre]:rounded-lg [&_pre]:p-3",
              "[&_code]:text-[var(--copilot-accent-orange)] [&_code]:bg-transparent [&_code]:px-1",
              "[&_pre_code]:text-[var(--copilot-text-secondary)]",
              "[&_a]:text-[var(--copilot-accent-blue)] [&_a]:no-underline [&_a:hover]:underline",
              "[&_strong]:text-[var(--copilot-text-bright)]",
              "[&_h1]:text-[var(--copilot-text-bright)] [&_h2]:text-[var(--copilot-text-bright)] [&_h3]:text-[var(--copilot-text-bright)]",
              "[&_li]:text-[var(--copilot-text-primary)]",
              "[&_blockquote]:border-l-[var(--copilot-accent-blue)] [&_blockquote]:text-[var(--copilot-text-secondary)]"
            )}>
              {message.isStreaming && !message.content ? (
                <StreamingIndicator />
              ) : (
                <>
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {message.content}
                  </ReactMarkdown>
                  {message.isStreaming && (
                    <span className="inline-block w-2 h-4 bg-[var(--copilot-accent-purple)] ml-1 animate-pulse" />
                  )}
                </>
              )}
            </div>
            
            {/* Actions (show on hover) */}
            {!message.isStreaming && message.content && (
              <div className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={handleCopy}
                  className={cn(
                    "flex items-center gap-1.5 px-2 py-1 rounded text-xs",
                    "text-[var(--copilot-text-muted)] hover:text-[var(--copilot-text-primary)]",
                    "hover:bg-[var(--copilot-bg-hover)] transition-colors"
                  )}
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-green-400" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function StreamingIndicator() {
  return (
    <div className="flex items-center gap-1.5 text-[var(--copilot-text-muted)]">
      <motion.span
        animate={{ opacity: [0.3, 1, 0.3] }}
        transition={{ duration: 1.2, repeat: Infinity }}
        className="w-2 h-2 rounded-full bg-[var(--copilot-accent-purple)]"
      />
      <motion.span
        animate={{ opacity: [0.3, 1, 0.3] }}
        transition={{ duration: 1.2, repeat: Infinity, delay: 0.2 }}
        className="w-2 h-2 rounded-full bg-[var(--copilot-accent-purple)]"
      />
      <motion.span
        animate={{ opacity: [0.3, 1, 0.3] }}
        transition={{ duration: 1.2, repeat: Infinity, delay: 0.4 }}
        className="w-2 h-2 rounded-full bg-[var(--copilot-accent-purple)]"
      />
    </div>
  );
}

interface MessageListProps {
  messages: ChatMessageData[];
}

export function CopilotMessageList({ messages }: MessageListProps) {
  return (
    <div className="divide-y divide-[var(--copilot-border-default)]">
      {messages.map((message) => (
        <CopilotMessage key={message.id} message={message} />
      ))}
    </div>
  );
}
