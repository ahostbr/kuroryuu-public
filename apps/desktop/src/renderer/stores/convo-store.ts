import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface ConvoMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  terminalId: string;
}

export interface ConvoThread {
  id: string;
  terminalId: string;
  taskId?: string;
  messages: ConvoMessage[];
  createdAt: number;
  updatedAt: number;
}

interface ConvoStore {
  threads: Map<string, ConvoThread>;
  activeThreadId: string | null;

  // Actions
  createThread: (terminalId: string, taskId?: string) => string;
  addMessage: (threadId: string, role: ConvoMessage['role'], content: string) => void;
  getThread: (threadId: string) => ConvoThread | undefined;
  getThreadByTerminal: (terminalId: string) => ConvoThread | undefined;
  setActiveThread: (threadId: string | null) => void;
  clearThread: (threadId: string) => void;
  deleteThread: (threadId: string) => void;
  exportThread: (threadId: string) => string;
}

function generateId(): string {
  return `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Type for persisted state (subset of full store)
type PersistedConvoState = {
  threads: Map<string, ConvoThread>;
  activeThreadId: string | null;
};

// Type guard for serialized Map
interface SerializedMap {
  __type: 'Map';
  entries: [string, ConvoThread][];
}

function isSerializedMap(value: unknown): value is SerializedMap {
  return (
    typeof value === 'object' &&
    value !== null &&
    '__type' in value &&
    (value as SerializedMap).__type === 'Map' &&
    'entries' in value
  );
}

// Custom storage to handle Map serialization
const customStorage = createJSONStorage<PersistedConvoState>(() => localStorage, {
  reviver: (_key, value) => {
    // Revive Map from array of entries
    if (isSerializedMap(value)) {
      return new Map(value.entries);
    }
    return value;
  },
  replacer: (_key, value) => {
    // Serialize Map to array of entries
    if (value instanceof Map) {
      return { __type: 'Map', entries: Array.from(value.entries()) };
    }
    return value;
  },
});

export const useConvoStore = create<ConvoStore>()(
  persist(
    (set, get) => ({
      threads: new Map(),
      activeThreadId: null,

      createThread: (terminalId, taskId) => {
        const id = generateId();
        const now = Date.now();
        const thread: ConvoThread = {
          id,
          terminalId,
          taskId,
          messages: [],
          createdAt: now,
          updatedAt: now,
        };

        set(state => {
          const threads = new Map(state.threads);
          threads.set(id, thread);
          return { threads, activeThreadId: id };
        });

        return id;
      },

      addMessage: (threadId, role, content) => {
        const message: ConvoMessage = {
          id: generateMessageId(),
          role,
          content,
          timestamp: Date.now(),
          terminalId: threadId,
        };

        set(state => {
          const threads = new Map(state.threads);
          const thread = threads.get(threadId);

          if (thread) {
            threads.set(threadId, {
              ...thread,
              messages: [...thread.messages, message],
              updatedAt: Date.now(),
            });
          }

          return { threads };
        });
      },

      getThread: (threadId) => {
        return get().threads.get(threadId);
      },

      getThreadByTerminal: (terminalId) => {
        const threads = get().threads;
        for (const thread of threads.values()) {
          if (thread.terminalId === terminalId) {
            return thread;
          }
        }
        return undefined;
      },

      setActiveThread: (threadId) => {
        set({ activeThreadId: threadId });
      },

      clearThread: (threadId) => {
        set(state => {
          const threads = new Map(state.threads);
          const thread = threads.get(threadId);

          if (thread) {
            threads.set(threadId, {
              ...thread,
              messages: [],
              updatedAt: Date.now(),
            });
          }

          return { threads };
        });
      },

      deleteThread: (threadId) => {
        set(state => {
          const threads = new Map(state.threads);
          threads.delete(threadId);
          return {
            threads,
            activeThreadId: state.activeThreadId === threadId ? null : state.activeThreadId,
          };
        });
      },

      exportThread: (threadId) => {
        const thread = get().threads.get(threadId);
        if (!thread) return '';

        const lines = [
          `# Conversation Log`,
          `Thread: ${thread.id}`,
          `Terminal: ${thread.terminalId}`,
          thread.taskId ? `Task: ${thread.taskId}` : '',
          `Created: ${new Date(thread.createdAt).toISOString()}`,
          '',
          '---',
          '',
        ];

        for (const msg of thread.messages) {
          lines.push(`## ${msg.role.toUpperCase()} (${new Date(msg.timestamp).toISOString()})`);
          lines.push('');
          lines.push(msg.content);
          lines.push('');
        }

        return lines.join('\n');
      },
    }),
    {
      name: 'kuroryuu-conversations',
      storage: customStorage,
      partialize: (state) => ({
        threads: state.threads,
        activeThreadId: state.activeThreadId,
      }),
    }
  )
);
