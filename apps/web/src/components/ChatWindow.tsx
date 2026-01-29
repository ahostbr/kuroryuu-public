import { useState, useRef, useEffect } from 'react';
import { Send, Square } from 'lucide-react';
import { ChatMessage as ChatMessageComponent } from './ChatMessage';
import type { ChatSession, ChatMessage } from '../App';

interface ChatWindowProps {
  session: ChatSession;
  onUpdateMessages: (messages: ChatMessage[]) => void;
  backend: 'claude' | 'lmstudio';
}

export function ChatWindow({ session, onUpdateMessages, backend: _backend }: ChatWindowProps) {
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [session.messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    const userMessage: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: input.trim(),
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
    setInput('');
    setIsStreaming(true);

    const controller = new AbortController();
    setAbortController(controller);

    try {
      // Build messages for API
      const apiMessages = newMessages
        .filter(m => m.role === 'user' || (m.role === 'assistant' && !m.isStreaming))
        .map(m => ({ role: m.role, content: m.content }));

      // Use Kuroryuu chat endpoint for web frontend
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

            // Handle both Kuroryuu (delta) and v2 (text_delta) formats
            if (event.type === 'delta' || event.type === 'text_delta') {
              assistantContent += event.text;
              currentMessages = currentMessages.map(m =>
                m.id === assistantMessage.id
                  ? { ...m, content: assistantContent }
                  : m
              );
              onUpdateMessages(currentMessages);
            } else if (event.type === 'tool_call') {
              // Add tool call message
              const toolMsg: ChatMessage = {
                id: `msg-${Date.now()}`,
                role: 'tool',
                content: `Calling ${event.name}...`,
                timestamp: Date.now(),
                toolName: event.name,
              };
              currentMessages = [...currentMessages, toolMsg];
              onUpdateMessages(currentMessages);
            } else if (event.type === 'tool_result') {
              // Update tool message with result
              currentMessages = currentMessages.map(m =>
                m.toolName === event.name && !m.toolResult
                  ? { ...m, content: `${event.name}: ${event.result?.slice(0, 200)}...`, toolResult: event.result }
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
        // User cancelled
        const cancelledMessages = newMessages.map(m =>
          m.id === assistantMessage.id
            ? { ...m, content: m.content + '\n\n*[Cancelled]*', isStreaming: false }
            : m
        );
        onUpdateMessages(cancelledMessages);
      } else {
        // Error
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

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">
          {session.messages.length === 0 ? (
            <div className="text-center text-zinc-500 py-16">
              <p className="text-lg mb-2">Start a conversation</p>
              <p className="text-sm">Ask anything or use tools via MCP</p>
            </div>
          ) : (
            <div className="space-y-4">
              {session.messages.map(message => (
                <ChatMessageComponent key={message.id} message={message} />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* Input Area */}
      <div className="border-t border-zinc-800 p-4">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          <div className="relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Send a message..."
              disabled={isStreaming}
              rows={1}
              className="w-full resize-none bg-zinc-800 border border-zinc-700 rounded-xl
                         px-4 py-3 pr-12 text-zinc-100 placeholder-zinc-500
                         focus:outline-none focus:border-yellow-500
                         disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ minHeight: '48px', maxHeight: '200px' }}
            />
            <button
              type={isStreaming ? 'button' : 'submit'}
              onClick={isStreaming ? handleStop : undefined}
              disabled={!isStreaming && !input.trim()}
              className={`absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg
                         transition-colors ${
                           isStreaming
                             ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                             : input.trim()
                               ? 'bg-yellow-500 text-zinc-900 hover:bg-yellow-400'
                               : 'bg-zinc-700 text-zinc-500 cursor-not-allowed'
                         }`}
            >
              {isStreaming ? (
                <Square className="w-4 h-4" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
          <p className="text-xs text-zinc-600 mt-2 text-center">
            Press Enter to send, Shift+Enter for new line
          </p>
        </form>
      </div>
    </div>
  );
}
