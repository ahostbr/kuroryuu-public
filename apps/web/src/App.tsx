/**
 * Kuroryuu Web App
 * Copilot-style GUI Clone
 */
import { useState, useEffect, useCallback } from 'react';
import { CopilotChatWindow } from './components/chat';
import { CopilotSidebar } from './components/sidebar';
import { Menu, X } from 'lucide-react';
import { cn } from './lib/utils';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  timestamp: number;
  toolName?: string;
  toolResult?: string;
  isStreaming?: boolean;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
}

// API helpers for chat history persistence
const API_BASE = '';  // Same origin

async function fetchSessions(): Promise<ChatSession[]> {
  try {
    const res = await fetch(`${API_BASE}/v1/chat-history/sessions`, { credentials: 'include' });
    if (!res.ok) return [];
    const data = await res.json();
    // API returns summaries, not full sessions
    return data.map((s: any) => ({
      id: s.id,
      title: s.title,
      messages: [],  // Will be loaded on demand
      createdAt: s.createdAt,
    }));
  } catch {
    return [];
  }
}

async function fetchFullSession(sessionId: string): Promise<ChatSession | null> {
  try {
    const res = await fetch(`${API_BASE}/v1/chat-history/sessions/${sessionId}`, { credentials: 'include' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function saveSessionToServer(session: ChatSession): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/v1/chat-history/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ session }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function deleteSessionFromServer(sessionId: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}/v1/chat-history/sessions/${sessionId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    return res.ok;
  } catch {
    return false;
  }
}

export function App() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [backend, setBackend] = useState<'claude' | 'lmstudio'>('claude');
  const [_isLoading, setIsLoading] = useState(true);  // TODO: Add loading spinner

  // Load sessions on mount
  useEffect(() => {
    fetchSessions().then(loaded => {
      setSessions(loaded);
      setIsLoading(false);
    });
  }, []);

  // Load full session when selecting
  const selectSession = useCallback(async (id: string) => {
    setActiveSessionId(id);
    // Check if we already have messages loaded
    const existing = sessions.find(s => s.id === id);
    if (existing && existing.messages.length === 0) {
      const full = await fetchFullSession(id);
      if (full) {
        setSessions(prev => prev.map(s => s.id === id ? full : s));
      }
    }
  }, [sessions]);

  const activeSession = sessions.find(s => s.id === activeSessionId);

  const createSession = () => {
    const id = `session-${Date.now()}`;
    const newSession: ChatSession = {
      id,
      title: 'New Chat',
      messages: [],
      createdAt: Date.now(),
    };
    setSessions(prev => [newSession, ...prev]);
    setActiveSessionId(id);
    // Save to server (fire and forget)
    saveSessionToServer(newSession);
  };

  const updateSession = (sessionId: string, messages: ChatMessage[]) => {
    let updatedSession: ChatSession | null = null;
    setSessions(prev =>
      prev.map(s => {
        if (s.id !== sessionId) return s;
        // Update title from first user message
        const firstUserMsg = messages.find(m => m.role === 'user');
        const title = firstUserMsg
          ? firstUserMsg.content.slice(0, 40) + (firstUserMsg.content.length > 40 ? '...' : '')
          : s.title;
        updatedSession = { ...s, messages, title };
        return updatedSession;
      })
    );
    // Persist to server (debounced would be better, but simple for now)
    if (updatedSession) {
      saveSessionToServer(updatedSession);
    }
  };

  const deleteSession = (sessionId: string) => {
    setSessions(prev => prev.filter(s => s.id !== sessionId));
    deleteSessionFromServer(sessionId);  // Fire and forget
    if (activeSessionId === sessionId) {
      const remaining = sessions.filter(s => s.id !== sessionId);
      setActiveSessionId(remaining[0]?.id ?? null);
    }
  };

  return (
    <div className="h-screen w-screen flex bg-[var(--copilot-bg-primary)] overflow-hidden">
      {/* Mobile Menu Button */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className={cn(
          "fixed top-4 left-4 z-50 p-2 rounded-lg md:hidden",
          "bg-[var(--copilot-bg-secondary)] border border-[var(--copilot-border-default)]",
          "text-[var(--copilot-text-primary)]"
        )}
      >
        {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Sidebar */}
      <div className={cn(
        "fixed md:relative z-40 h-full transition-transform duration-300",
        sidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0 md:hidden"
      )}>
        <CopilotSidebar
          sessions={sessions}
          activeSessionId={activeSessionId}
          onSelectSession={(id) => {
            selectSession(id);  // Load full session from server
            if (window.innerWidth < 768) setSidebarOpen(false);
          }}
          onNewSession={createSession}
          onDeleteSession={deleteSession}
          backend={backend}
          onBackendChange={setBackend}
        />
      </div>

      {/* Sidebar Overlay (mobile) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className={cn(
          "h-12 flex items-center justify-between px-4",
          "border-b border-[var(--copilot-border-default)]",
          "bg-[var(--copilot-bg-secondary)]"
        )}>
          <div className="flex items-center gap-3">
            {/* Mobile menu handled by fixed button */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-1.5 hover:bg-[var(--copilot-bg-hover)] rounded-lg transition-colors hidden md:block"
            >
              <Menu className="w-5 h-5 text-[var(--copilot-text-muted)]" />
            </button>
            <div className="flex items-center gap-2">
              <span className="text-xl">🐉</span>
              <h1 className="text-base font-medium text-[var(--copilot-text-bright)]">
                {activeSession?.title || 'Kuroryuu'}
              </h1>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <span className={cn(
              "text-xs px-2 py-1 rounded-md",
              backend === 'claude' 
                ? "bg-[var(--copilot-accent-orange)]/20 text-[var(--copilot-accent-orange)]" 
                : "bg-[var(--copilot-accent-blue)]/20 text-[var(--copilot-accent-blue)]"
            )}>
              {backend === 'claude' ? 'Claude' : 'LM Studio'}
            </span>
          </div>
        </header>

        {/* Chat Area */}
        <main className="flex-1 overflow-hidden">
          {activeSession ? (
            <CopilotChatWindow
              session={activeSession}
              onUpdateMessages={(msgs) => updateSession(activeSession.id, msgs)}
              backend={backend}
            />
          ) : (
            <WelcomeScreen onNewChat={createSession} />
          )}
        </main>
      </div>
    </div>
  );
}

interface WelcomeScreenProps {
  onNewChat: () => void;
}

function WelcomeScreen({ onNewChat }: WelcomeScreenProps) {
  return (
    <div className="h-full flex flex-col items-center justify-center px-4 bg-[var(--copilot-bg-primary)]">
      <div className="text-center max-w-md">
        <div className="inline-flex items-center justify-center w-24 h-24 rounded-2xl bg-[var(--copilot-accent-purple)]/10 mb-6">
          <img src="/sots_logo.png" alt="Kuroryuu" className="w-20 h-20 object-contain" />
        </div>
        
        <h1 className="text-3xl font-bold text-[var(--copilot-text-bright)] mb-3">
          Welcome to Kuroryuu
        </h1>
        <p className="text-[var(--copilot-text-muted)] mb-8">
          Provider-agnostic AI agent harness. Ask questions, get help with code, 
          or let me assist with complex tasks.
        </p>
        
        <button
          onClick={onNewChat}
          className={cn(
            "px-6 py-3 rounded-xl font-medium",
            "bg-[var(--copilot-btn-primary)] text-white",
            "hover:bg-[var(--copilot-btn-primary-hover)]",
            "transition-colors shadow-[var(--copilot-shadow-md)]"
          )}
        >
          Start New Chat
        </button>
        
        <div className="mt-8 grid grid-cols-2 gap-3 text-sm">
          {[
            { icon: '💬', label: 'Chat with AI' },
            { icon: '🎤', label: 'Voice Input' },
            { icon: '📎', label: 'Attach Files' },
            { icon: '🛠️', label: 'Tool Calls' },
          ].map((item, i) => (
            <div
              key={i}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg",
                "bg-[var(--copilot-bg-tertiary)]",
                "text-[var(--copilot-text-secondary)]"
              )}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
