/**
 * Zustand store for Transcripts
 *
 * Manages transcript session index and message viewing
 */
import { create } from 'zustand';

// ============================================================================
// Types
// ============================================================================

export interface TranscriptSession {
  id: string;
  fullId: string;
  summary: string | string[];
  date: string;
  startTime?: string;
  path: string;
  messageCount: number;
  sizeBytes: number;
  project?: string;
  lastUpdate?: string;
}

export type MessageContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string; signature?: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: unknown }
  | { type: 'image'; source: { type: string; media_type?: string; data?: string } };

export interface TranscriptMessage {
  uuid: string;
  type: 'user' | 'assistant' | 'system';
  timestamp: string;
  content: MessageContentBlock[];
  rawContent?: string; // For simple string content
  isMeta?: boolean;
  parentUuid?: string | null;
  sessionId?: string;
  model?: string;
}

interface TranscriptsStore {
  // Session index state
  sessions: TranscriptSession[];
  isLoading: boolean;
  searchQuery: string;
  selectedSessionId: string | null;

  // Message viewer state
  currentMessages: TranscriptMessage[];
  allMessages: TranscriptMessage[]; // Full list for searching
  messagesLoading: boolean;
  messageSearchQuery: string;
  visibleMessageCount: number;
  currentSessionPath: string | null;

  // Session actions
  loadSessions: () => Promise<void>;
  setSearchQuery: (query: string) => void;
  selectSession: (id: string | null) => void;
  getFilteredSessions: () => TranscriptSession[];

  // Message actions
  loadMessages: (path: string) => Promise<void>;
  loadMoreMessages: () => void;
  searchMessages: (query: string) => void;
  clearMessages: () => void;
  getFilteredMessages: () => TranscriptMessage[];
}

// ============================================================================
// Constants
// ============================================================================

const MESSAGES_PER_PAGE = 50;

// ============================================================================
// Helpers
// ============================================================================

function stripBOM(content: string): string {
  return content.charCodeAt(0) === 0xFEFF ? content.slice(1) : content;
}

function parseMessageContent(raw: unknown): MessageContentBlock[] {
  if (!raw) return [];

  // String content (simple user messages)
  if (typeof raw === 'string') {
    return [{ type: 'text', text: raw }];
  }

  // Array of content blocks
  if (Array.isArray(raw)) {
    return raw.map((block) => {
      if (block.type === 'text') {
        return { type: 'text', text: block.text || '' };
      }
      if (block.type === 'thinking') {
        return { type: 'thinking', thinking: block.thinking || '', signature: block.signature };
      }
      if (block.type === 'tool_use') {
        return { type: 'tool_use', id: block.id, name: block.name, input: block.input };
      }
      if (block.type === 'tool_result') {
        return { type: 'tool_result', tool_use_id: block.tool_use_id, content: block.content };
      }
      if (block.type === 'image') {
        return { type: 'image', source: block.source };
      }
      // Default to text for unknown blocks
      return { type: 'text', text: JSON.stringify(block) };
    });
  }

  return [];
}

function parseJSONL(content: string): TranscriptMessage[] {
  const lines = content.split('\n').filter((line) => line.trim());
  const messages: TranscriptMessage[] = [];

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);

      // Skip non-message entries
      if (!entry.type || !['user', 'assistant'].includes(entry.type)) {
        continue;
      }

      const msg: TranscriptMessage = {
        uuid: entry.uuid || crypto.randomUUID(),
        type: entry.type,
        timestamp: entry.timestamp || new Date().toISOString(),
        content: [],
        isMeta: entry.isMeta,
        parentUuid: entry.parentUuid,
        sessionId: entry.sessionId,
      };

      // Parse message content
      if (entry.message) {
        if (entry.message.content) {
          msg.content = parseMessageContent(entry.message.content);
          if (typeof entry.message.content === 'string') {
            msg.rawContent = entry.message.content;
          }
        }
        if (entry.message.model) {
          msg.model = entry.message.model;
        }
      }

      // Skip empty messages
      if (msg.content.length === 0 && !msg.rawContent) {
        continue;
      }

      messages.push(msg);
    } catch {
      // Skip malformed lines
    }
  }

  return messages;
}

export const useTranscriptsStore = create<TranscriptsStore>((set, get) => ({
  // Session state
  sessions: [],
  isLoading: false,
  searchQuery: '',
  selectedSessionId: null,

  // Message viewer state
  currentMessages: [],
  allMessages: [],
  messagesLoading: false,
  messageSearchQuery: '',
  visibleMessageCount: MESSAGES_PER_PAGE,
  currentSessionPath: null,

  // ============================================================================
  // Session Actions
  // ============================================================================

  loadSessions: async () => {
    set({ isLoading: true });

    try {
      let indexData: { sessions: TranscriptSession[] } | null = null;

      if (window.electronAPI?.fs?.readFile) {
        try {
          const content = await window.electronAPI.fs.readFile('ai/exports/index.json');
          indexData = JSON.parse(stripBOM(content));
        } catch (e) {
          console.error('[Transcripts] Failed to read via Electron:', e);
        }
      }

      // Fallback: try fetch (for dev mode)
      if (!indexData) {
        try {
          const response = await fetch('/api/transcripts/index');
          if (response.ok) {
            indexData = await response.json();
          }
        } catch (e) {
          console.warn('[Transcripts] Failed to fetch from API:', e);
        }
      }

      if (indexData?.sessions) {
        // Sort by date descending
        const sorted = [...indexData.sessions].sort((a, b) => {
          const dateCompare = (b.date || '').localeCompare(a.date || '');
          if (dateCompare !== 0) return dateCompare;
          return (b.startTime || '').localeCompare(a.startTime || '');
        });
        set({ sessions: sorted });
      }
    } catch (error) {
      console.error('[Transcripts] Failed to load sessions:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
  },

  selectSession: (id) => {
    set({ selectedSessionId: id });
    // Clear messages when changing sessions
    if (id === null) {
      get().clearMessages();
    }
  },

  getFilteredSessions: () => {
    const { sessions, searchQuery } = get();
    if (!searchQuery.trim()) {
      return sessions;
    }

    const query = searchQuery.toLowerCase();
    return sessions.filter((session) => {
      const summary =
        typeof session.summary === 'string'
          ? session.summary
          : Array.isArray(session.summary)
          ? session.summary.join(' ')
          : '';
      return (
        summary.toLowerCase().includes(query) ||
        session.id.toLowerCase().includes(query) ||
        session.date?.includes(query) ||
        session.project?.toLowerCase().includes(query)
      );
    });
  },

  // ============================================================================
  // Message Actions
  // ============================================================================

  loadMessages: async (path: string) => {
    const { currentSessionPath } = get();

    // Skip if already loaded
    if (path === currentSessionPath) {
      return;
    }

    set({ messagesLoading: true, messageSearchQuery: '', visibleMessageCount: MESSAGES_PER_PAGE });

    try {
      if (!window.electronAPI?.fs?.readFile) {
        throw new Error('Electron API not available');
      }

      const fullPath = `ai/exports/${path}`;
      const content = await window.electronAPI.fs.readFile(fullPath);
      const messages = parseJSONL(stripBOM(content));

      // Sort by timestamp
      messages.sort((a, b) => a.timestamp.localeCompare(b.timestamp));

      set({
        allMessages: messages,
        currentMessages: messages.slice(0, MESSAGES_PER_PAGE),
        currentSessionPath: path,
      });

      console.log(`[Transcripts] Loaded ${messages.length} messages from ${path}`);
    } catch (error) {
      console.error('[Transcripts] Failed to load messages:', error);
      set({ allMessages: [], currentMessages: [] });
    } finally {
      set({ messagesLoading: false });
    }
  },

  loadMoreMessages: () => {
    const { allMessages, visibleMessageCount, messageSearchQuery } = get();
    const newCount = visibleMessageCount + MESSAGES_PER_PAGE;

    // Apply search filter if active
    let filtered = allMessages;
    if (messageSearchQuery.trim()) {
      const query = messageSearchQuery.toLowerCase();
      filtered = allMessages.filter((msg) => {
        const text = msg.content
          .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
          .map((b) => b.text)
          .join(' ');
        return text.toLowerCase().includes(query) || msg.rawContent?.toLowerCase().includes(query);
      });
    }

    set({
      visibleMessageCount: newCount,
      currentMessages: filtered.slice(0, newCount),
    });
  },

  searchMessages: (query: string) => {
    const { allMessages } = get();

    set({ messageSearchQuery: query, visibleMessageCount: MESSAGES_PER_PAGE });

    if (!query.trim()) {
      set({ currentMessages: allMessages.slice(0, MESSAGES_PER_PAGE) });
      return;
    }

    const lowerQuery = query.toLowerCase();
    const filtered = allMessages.filter((msg) => {
      // Search in text content
      const text = msg.content
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map((b) => b.text)
        .join(' ');

      // Search in thinking blocks
      const thinking = msg.content
        .filter((b): b is { type: 'thinking'; thinking: string } => b.type === 'thinking')
        .map((b) => b.thinking)
        .join(' ');

      // Search in tool names
      const tools = msg.content
        .filter((b): b is { type: 'tool_use'; id: string; name: string; input: unknown } => b.type === 'tool_use')
        .map((b) => b.name)
        .join(' ');

      return (
        text.toLowerCase().includes(lowerQuery) ||
        thinking.toLowerCase().includes(lowerQuery) ||
        tools.toLowerCase().includes(lowerQuery) ||
        msg.rawContent?.toLowerCase().includes(lowerQuery)
      );
    });

    set({ currentMessages: filtered.slice(0, MESSAGES_PER_PAGE) });
  },

  clearMessages: () => {
    set({
      currentMessages: [],
      allMessages: [],
      messagesLoading: false,
      messageSearchQuery: '',
      visibleMessageCount: MESSAGES_PER_PAGE,
      currentSessionPath: null,
    });
  },

  getFilteredMessages: () => {
    return get().currentMessages;
  },
}));
