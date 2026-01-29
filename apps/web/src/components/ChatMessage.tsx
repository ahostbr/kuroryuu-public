import { User, Bot, Wrench } from 'lucide-react';
import type { ChatMessage } from '../App';

interface ChatMessageProps {
  message: ChatMessage;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === 'user';
  const isTool = message.role === 'tool';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div
        className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
          isUser
            ? 'bg-yellow-500/20 text-yellow-500'
            : isTool
              ? 'bg-purple-500/20 text-purple-400'
              : 'bg-zinc-700 text-zinc-300'
        }`}
      >
        {isUser ? (
          <User className="w-4 h-4" />
        ) : isTool ? (
          <Wrench className="w-4 h-4" />
        ) : (
          <Bot className="w-4 h-4" />
        )}
      </div>

      {/* Content */}
      <div className={`flex-1 max-w-[85%] ${isUser ? 'text-right' : ''}`}>
        {/* Role label */}
        <div className="text-xs text-zinc-500 mb-1">
          {isUser ? 'You' : isTool ? message.toolName : 'Kuroryuu'}
        </div>

        {/* Message bubble */}
        <div
          className={`inline-block px-4 py-2 rounded-2xl ${
            isUser
              ? 'bg-yellow-500/20 text-yellow-100 rounded-tr-sm'
              : isTool
                ? 'bg-purple-500/10 text-purple-200 rounded-tl-sm border border-purple-500/20 font-mono text-sm'
                : 'bg-zinc-800 text-zinc-200 rounded-tl-sm'
          }`}
        >
          {message.isStreaming && !message.content ? (
            <span className="flex items-center gap-2 text-zinc-400">
              <span className="animate-pulse">●</span>
              <span className="animate-pulse delay-75">●</span>
              <span className="animate-pulse delay-150">●</span>
            </span>
          ) : (
            <div className="whitespace-pre-wrap break-words">
              {message.content}
              {message.isStreaming && (
                <span className="inline-block w-2 h-4 bg-yellow-500 ml-1 animate-pulse" />
              )}
            </div>
          )}
        </div>

        {/* Timestamp */}
        <div className="text-[10px] text-zinc-600 mt-1">
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}
