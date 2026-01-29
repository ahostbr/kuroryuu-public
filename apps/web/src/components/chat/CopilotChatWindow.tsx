/**
 * Copilot Chat Window Component
 * Complete Copilot-style chat interface with all features integrated
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { CopilotInput } from '../input';
import { CopilotMessageList } from '../messages';
import { cn } from '../../lib/utils';
import type { FileAttachment } from '../../types/files';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  toolName?: string;
  toolResult?: string;
  isStreaming?: boolean;
}

interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
}

interface CopilotChatWindowProps {
  session: ChatSession;
  onUpdateMessages: (messages: ChatMessage[]) => void;
  backend: 'claude' | 'lmstudio';
}

export function CopilotChatWindow({ session, onUpdateMessages, backend: _backend }: CopilotChatWindowProps) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [session.messages, scrollToBottom]);

  const handleSubmit = async (message: string, contextFiles: FileAttachment[]) => {
    if (!message.trim() || isStreaming) return;

    // Build context string from files with actual content
    let contextStr = '';
    if (contextFiles.length > 0) {
      contextStr = '\n\n--- Attached Files ---\n';
      for (const file of contextFiles) {
        contextStr += `\n### File: ${file.name}`;
        if (file.language) contextStr += ` (${file.language})`;
        contextStr += `\nSize: ${file.size} bytes\n`;
        
        if (file.content) {
          if (file.content.startsWith('data:image/')) {
            // For images, include the base64 data
            contextStr += `[Image data attached]\n`;
            // Note: For vision models, we'd need to handle this specially
          } else {
            contextStr += '```\n' + file.content + '\n```\n';
          }
        } else {
          contextStr += '[No content available]\n';
        }
      }
      contextStr += '\n--- End Attached Files ---\n\n';
    }

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: contextStr + message.trim(),
      timestamp: Date.now(),
    };

    const assistantMessage: ChatMessage = {
      id: `msg-${Date.now() + 1}`,
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      isStreaming: true,
    };

    const newMessages = [...session.messages, userMessage, assistantMessage];
    onUpdateMessages(newMessages);
    setIsStreaming(true);

    const controller = new AbortController();
    setAbortController(controller);

    try {
      // Build messages for API
      const apiMessages = newMessages
        .filter(m => m.role === 'user' || (m.role === 'assistant' && !m.isStreaming))
        .map(m => ({ role: m.role, content: m.content }));

      // Use Kuroryuu chat endpoint (routes to Gemma, not Devstral)
      const history = apiMessages.slice(0, -1).map(m => ({ role: m.role, content: m.content }));
      const currentMessage = apiMessages[apiMessages.length - 1]?.content || '';

      const response = await fetch('/v1/kuroryuu/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: currentMessage,
          history,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        // Check if Kuroryuu is sleeping
        if (response.status === 503) {
          const errorData = await response.json().catch(() => ({}));
          if (errorData.sleeping) {
            throw new Error('Kuroryuu is sleeping... Please try again later.');
          }
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let assistantContent = '';
      let currentMessages = [...newMessages];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const event = JSON.parse(data);
            
            // Handle both 'delta' (from tool_events) and 'text_delta' (from harness)
            if (event.type === 'delta' || event.type === 'text_delta') {
              assistantContent += event.text;
              currentMessages = currentMessages.map(m =>
                m.id === assistantMessage.id
                  ? { ...m, content: assistantContent }
                  : m
              );
              onUpdateMessages(currentMessages);
            } else if (event.type === 'tool_call' || event.type === 'tool_start') {
              const toolMsg: ChatMessage = {
                id: `msg-${Date.now()}`,
                role: 'tool',
                content: `Calling ${event.name}...`,
                timestamp: Date.now(),
                toolName: event.name,
              };
              currentMessages = [...currentMessages, toolMsg];
              onUpdateMessages(currentMessages);
            } else if (event.type === 'tool_result' || event.type === 'tool_end') {
              currentMessages = currentMessages.map(m =>
                m.toolName === event.name && !m.toolResult
                  ? { ...m, content: `${event.name}`, toolResult: event.result || event.preview }
                  : m
              );
              onUpdateMessages(currentMessages);
            } else if (event.type === 'error') {
              assistantContent += `\n\n⚠️ Error: ${event.message}`;
              currentMessages = currentMessages.map(m =>
                m.id === assistantMessage.id
                  ? { ...m, content: assistantContent }
                  : m
              );
              onUpdateMessages(currentMessages);
            }
          } catch {
            // Ignore parse errors
          }
        }
      }

      // Mark streaming complete
      currentMessages = currentMessages.map(m =>
        m.id === assistantMessage.id
          ? { ...m, isStreaming: false }
          : m
      );
      onUpdateMessages(currentMessages);

    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        const cancelledMessages = newMessages.map(m =>
          m.id === assistantMessage.id
            ? { ...m, content: m.content + '\n\n*[Cancelled]*', isStreaming: false }
            : m
        );
        onUpdateMessages(cancelledMessages);
      } else {
        const errorMessages = newMessages.map(m =>
          m.id === assistantMessage.id
            ? { ...m, content: `⚠️ Error: ${(err as Error).message}`, isStreaming: false }
            : m
        );
        onUpdateMessages(errorMessages);
      }
    } finally {
      setIsStreaming(false);
      setAbortController(null);
    }
  };

  const handleStop = () => {
    abortController?.abort();
  };

  return (
    <div className="h-full flex flex-col bg-[var(--copilot-bg-primary)]">
      {/* Messages Area */}
      <div className="flex-1 overflow-auto">
        {session.messages.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <CopilotMessageList messages={session.messages} />
            <div ref={messagesEndRef} className="h-4" />
          </>
        )}
      </div>

      {/* Input Area */}
      <div className="border-t border-[var(--copilot-border-default)] p-4 bg-[var(--copilot-bg-secondary)]">
        <div className="max-w-3xl mx-auto">
          <CopilotInput
            onSubmit={handleSubmit}
            onStop={handleStop}
            isStreaming={isStreaming}
            placeholder="Ask Kuroryuu anything..."
          />
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="h-full flex flex-col items-center justify-center px-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center max-w-md"
      >
        {/* Logo */}
        <motion.div
          animate={{ rotate: [0, 5, -5, 0] }}
          transition={{ duration: 4, repeat: Infinity }}
          className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--copilot-accent-purple)]/10 mb-6"
        >
          <span className="text-4xl">🐉</span>
        </motion.div>
        
        {/* Title */}
        <h1 className="text-2xl font-semibold text-[var(--copilot-text-bright)] mb-2">
          Kuroryuu
        </h1>
        <p className="text-[var(--copilot-text-muted)] mb-8">
          Your AI-powered coding assistant. Ask questions, get help with code, or explore ideas.
        </p>
        
        {/* Suggestions */}
        <div className="grid gap-2">
          {[
            "Explain how React hooks work",
            "Help me debug this error",
            "Write a Python function to...",
            "What's the best way to..."
          ].map((suggestion, i) => (
            <motion.button
              key={i}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
              className={cn(
                "text-left px-4 py-3 rounded-lg",
                "bg-[var(--copilot-bg-tertiary)] border border-[var(--copilot-border-default)]",
                "text-[var(--copilot-text-secondary)] text-sm",
                "hover:bg-[var(--copilot-bg-hover)] hover:border-[var(--copilot-border-light)]",
                "transition-colors"
              )}
            >
              {suggestion}
            </motion.button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
