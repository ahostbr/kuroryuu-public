/**
 * Zustand store for Insights chat sessions
 */
import { create } from 'zustand';
import type { InsightsSession, InsightsMessage, InsightsModel, ToolCall } from '../types/insights';
import { useDomainConfigStore } from './domain-config-store';

function generateId(): string {
  return `ins-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface InsightsStore {
  sessions: InsightsSession[];
  activeSessionId: string | null;
  isStreaming: boolean;
  
  // Session actions
  createSession: (model?: InsightsModel) => string;
  deleteSession: (sessionId: string) => void;
  setActiveSession: (sessionId: string | null) => void;
  getActiveSession: () => InsightsSession | undefined;
  updateSessionTitle: (sessionId: string, title: string) => void;
  
  // Message actions
  addMessage: (sessionId: string, role: InsightsMessage['role'], content: string, model?: InsightsModel) => string;
  updateMessage: (sessionId: string, messageId: string, updates: Partial<InsightsMessage>) => void;
  addToolCall: (sessionId: string, messageId: string, toolCall: ToolCall) => void;
  updateToolCall: (sessionId: string, messageId: string, toolCallId: string, updates: Partial<ToolCall>) => void;
  setStreaming: (streaming: boolean) => void;
  
  // Persistence
  loadSessions: () => Promise<void>;
  saveSessions: () => Promise<void>;
}

export const useInsightsStore = create<InsightsStore>((set, get) => ({
  sessions: [],
  activeSessionId: null,
  isStreaming: false,

  createSession: (model?: InsightsModel) => {
    const id = generateId();
    const now = Date.now();

    // Use domain config for default model if not specified
    const domainConfig = useDomainConfigStore.getState().getConfigForDomain('code-editor');
    const modelToUse = model || (domainConfig.modelId as InsightsModel) || 'claude-sonnet-4-20250514';

    const session: InsightsSession = {
      id,
      title: 'New Chat',
      messages: [],
      model: modelToUse,
      createdAt: now,
      updatedAt: now,
    };
    
    set(state => ({
      sessions: [session, ...state.sessions],
      activeSessionId: id,
    }));
    
    return id;
  },

  deleteSession: (sessionId) => {
    set(state => {
      const newSessions = state.sessions.filter(s => s.id !== sessionId);
      const newActiveId = state.activeSessionId === sessionId
        ? (newSessions[0]?.id ?? null)
        : state.activeSessionId;
      return {
        sessions: newSessions,
        activeSessionId: newActiveId,
      };
    });
    get().saveSessions();
  },

  setActiveSession: (sessionId) => {
    set({ activeSessionId: sessionId });
  },

  getActiveSession: () => {
    const { sessions, activeSessionId } = get();
    return sessions.find(s => s.id === activeSessionId);
  },

  updateSessionTitle: (sessionId, title) => {
    set(state => ({
      sessions: state.sessions.map(s =>
        s.id === sessionId ? { ...s, title, updatedAt: Date.now() } : s
      ),
    }));
    get().saveSessions();
  },

  addMessage: (sessionId, role, content, model) => {
    const messageId = generateMessageId();
    const message: InsightsMessage = {
      id: messageId,
      role,
      content,
      timestamp: Date.now(),
      model,
      status: role === 'assistant' ? 'pending' : 'complete',
    };

    set(state => ({
      sessions: state.sessions.map(s => {
        if (s.id === sessionId) {
          // Auto-generate title from first user message
          const newTitle = s.messages.length === 0 && role === 'user'
            ? content.slice(0, 50) + (content.length > 50 ? '...' : '')
            : s.title;
          return {
            ...s,
            title: newTitle,
            messages: [...s.messages, message],
            updatedAt: Date.now(),
          };
        }
        return s;
      }),
    }));

    // Auto-save after adding messages (debounced by caller if needed)
    get().saveSessions();

    return messageId;
  },

  updateMessage: (sessionId, messageId, updates) => {
    set(state => ({
      sessions: state.sessions.map(s => {
        if (s.id === sessionId) {
          return {
            ...s,
            messages: s.messages.map(m =>
              m.id === messageId ? { ...m, ...updates } : m
            ),
            updatedAt: Date.now(),
          };
        }
        return s;
      }),
    }));
    // Save after message updates (e.g., streaming completion)
    if (updates.status === 'complete' || updates.status === 'error') {
      get().saveSessions();
    }
  },

  addToolCall: (sessionId, messageId, toolCall) => {
    set(state => ({
      sessions: state.sessions.map(s => {
        if (s.id === sessionId) {
          return {
            ...s,
            messages: s.messages.map(m => {
              if (m.id === messageId) {
                return {
                  ...m,
                  toolCalls: [...(m.toolCalls || []), toolCall],
                };
              }
              return m;
            }),
            updatedAt: Date.now(),
          };
        }
        return s;
      }),
    }));
  },

  updateToolCall: (sessionId, messageId, toolCallId, updates) => {
    set(state => ({
      sessions: state.sessions.map(s => {
        if (s.id === sessionId) {
          return {
            ...s,
            messages: s.messages.map(m => {
              if (m.id === messageId && m.toolCalls) {
                return {
                  ...m,
                  toolCalls: m.toolCalls.map(tc =>
                    tc.id === toolCallId ? { ...tc, ...updates } : tc
                  ),
                };
              }
              return m;
            }),
          };
        }
        return s;
      }),
    }));
  },

  setStreaming: (streaming) => {
    set({ isStreaming: streaming });
  },

  loadSessions: async () => {
    try {
      // Load from unified settings store
      const saved = await window.electronAPI?.settings?.get?.('insights.sessions', 'user');
      if (saved && Array.isArray(saved)) {
        const sessions = saved as InsightsSession[];
        // Sort by updatedAt descending
        sessions.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        set({
          sessions,
          activeSessionId: sessions[0]?.id ?? null,
        });
        console.log(`[InsightsStore] Loaded ${sessions.length} sessions from disk`);
      }
    } catch (error) {
      console.error('[InsightsStore] Failed to load sessions:', error);
    }
  },

  saveSessions: async () => {
    try {
      const { sessions } = get();
      // Only save the last 50 sessions to prevent bloat
      const sessionsToSave = sessions.slice(0, 50);
      await window.electronAPI?.settings?.set?.('insights.sessions', sessionsToSave, 'user');
    } catch (error) {
      console.error('[InsightsStore] Failed to save sessions:', error);
    }
  },
}));

// Auto-load sessions when store is first accessed
if (typeof window !== 'undefined') {
  // Delay to ensure electronAPI is ready
  setTimeout(() => {
    useInsightsStore.getState().loadSessions();
  }, 100);
}
