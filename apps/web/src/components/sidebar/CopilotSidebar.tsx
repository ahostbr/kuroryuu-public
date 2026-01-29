/**
 * Copilot Sidebar Component
 * Dark theme sidebar matching Copilot interface
 */
import { Plus, MessageSquare, Trash2, ChevronDown, Sparkles, Settings } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '../../lib/utils';

interface ChatSession {
  id: string;
  title: string;
  messages: unknown[];
  createdAt: number;
}

interface CopilotSidebarProps {
  sessions: ChatSession[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  backend: 'claude' | 'lmstudio';
  onBackendChange: (backend: 'claude' | 'lmstudio') => void;
}

export function CopilotSidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  backend,
  onBackendChange,
}: CopilotSidebarProps) {
  // Group sessions by date
  const groupedSessions = sessions.reduce((groups, session) => {
    const date = new Date(session.createdAt);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    let label: string;
    if (date.toDateString() === today.toDateString()) {
      label = 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
      label = 'Yesterday';
    } else if (date > new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000)) {
      label = 'This Week';
    } else {
      label = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
    
    if (!groups[label]) groups[label] = [];
    groups[label].push(session);
    return groups;
  }, {} as Record<string, ChatSession[]>);

  return (
    <div className="w-64 h-full flex flex-col bg-[var(--copilot-bg-secondary)] border-r border-[var(--copilot-border-default)]">
      {/* Header */}
      <div className="p-4 border-b border-[var(--copilot-border-default)]">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-2xl">🐉</span>
          <span className="text-lg font-semibold text-[var(--copilot-text-bright)]">Kuroryuu</span>
        </div>
        
        {/* New Chat Button */}
        <button
          onClick={onNewSession}
          className={cn(
            "w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg",
            "bg-[var(--copilot-btn-primary)] text-white",
            "hover:bg-[var(--copilot-btn-primary-hover)] transition-colors",
            "font-medium text-sm"
          )}
        >
          <Plus className="w-4 h-4" />
          <span>New Chat</span>
        </button>
      </div>

      {/* Backend Selector */}
      <div className="p-3 border-b border-[var(--copilot-border-default)]">
        <div className="relative">
          <select
            value={backend}
            onChange={(e) => onBackendChange(e.target.value as 'claude' | 'lmstudio')}
            className={cn(
              "w-full appearance-none bg-[var(--copilot-bg-tertiary)]",
              "border border-[var(--copilot-border-default)] rounded-lg",
              "px-3 py-2 text-sm text-[var(--copilot-text-primary)] cursor-pointer",
              "focus:outline-none focus:border-[var(--copilot-border-focus)]",
              "transition-colors"
            )}
          >
            <option value="claude">Claude (Anthropic)</option>
            <option value="lmstudio">LM Studio (Local)</option>
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--copilot-text-muted)] pointer-events-none" />
        </div>
      </div>

      {/* Session List */}
      <div className="flex-1 overflow-auto px-2 py-2">
        {Object.keys(groupedSessions).length === 0 ? (
          <div className="text-center py-8">
            <MessageSquare className="w-8 h-8 mx-auto mb-2 text-[var(--copilot-text-muted)] opacity-50" />
            <p className="text-sm text-[var(--copilot-text-muted)]">No conversations yet</p>
            <p className="text-xs text-[var(--copilot-text-muted)]">Start a new chat to begin</p>
          </div>
        ) : (
          Object.entries(groupedSessions).map(([label, groupSessions]) => (
            <div key={label} className="mb-4">
              <div className="px-2 py-1 text-xs text-[var(--copilot-text-muted)] font-medium uppercase tracking-wide">
                {label}
              </div>
              <div className="space-y-0.5">
                {groupSessions.map(session => (
                  <motion.button
                    key={session.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    onClick={() => onSelectSession(session.id)}
                    className={cn(
                      "w-full group flex items-center gap-2 px-2 py-2 rounded-lg text-left",
                      "transition-colors",
                      session.id === activeSessionId
                        ? "bg-[var(--copilot-bg-active)] text-[var(--copilot-text-bright)]"
                        : "text-[var(--copilot-text-secondary)] hover:bg-[var(--copilot-bg-hover)] hover:text-[var(--copilot-text-primary)]"
                    )}
                  >
                    <MessageSquare className="w-4 h-4 flex-shrink-0" />
                    <span className="flex-1 text-sm truncate">{session.title}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDeleteSession(session.id);
                      }}
                      className={cn(
                        "opacity-0 group-hover:opacity-100 p-1 rounded",
                        "hover:bg-[var(--copilot-bg-tertiary)] text-[var(--copilot-text-muted)]",
                        "hover:text-red-400 transition-all"
                      )}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </motion.button>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="p-3 border-t border-[var(--copilot-border-default)]">
        <div className="flex items-center justify-between text-xs text-[var(--copilot-text-muted)]">
          <div className="flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            <span>Kuroryuu v0.1.0</span>
          </div>
          <button className="p-1 hover:bg-[var(--copilot-bg-hover)] rounded transition-colors">
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
