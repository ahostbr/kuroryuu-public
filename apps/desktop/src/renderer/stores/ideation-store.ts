/**
 * Zustand store for Ideation
 * 
 * Uses Gateway API for AI-powered idea generation
 */
import { create } from 'zustand';
import type { Idea, IdeaType, IdeaStatus, IdeationConfig, IdeaSessionSummary, SavedIdea } from '../types/ideation';
import { gatewayClient, listIdeaSessions, saveIdeaSession, loadIdeaSession, deleteIdeaSession, exportIdeaSession } from '../services/gateway-client';
import { useTaskStore } from './task-store';
import { useDomainConfigStore } from './domain-config-store';
import type { Task } from '../types/task';

function generateId(): string {
  return `idea-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Map LLM category to our IdeaType
function mapCategoryToType(category: string): IdeaType {
  const catMap: Record<string, IdeaType> = {
    'improvement': 'improvement',
    'code improvement': 'improvement',
    'code': 'improvement',
    'vulnerability': 'vulnerability',
    'security': 'vulnerability',
    'performance': 'performance',
    'optimization': 'performance',
    'documentation': 'documentation',
    'docs': 'documentation',
    'testing': 'testing',
    'test': 'testing',
    'tests': 'testing',
  };
  return catMap[category?.toLowerCase()] || 'improvement';
}

// Map LLM impact to our impact
function mapImpact(impact: string): Idea['impact'] {
  const impactMap: Record<string, Idea['impact']> = {
    'high': 'high',
    'critical': 'high',
    'medium': 'medium',
    'moderate': 'medium',
    'low': 'low',
    'minor': 'low',
  };
  return impactMap[impact?.toLowerCase()] || 'medium';
}

interface IdeationStore {
  ideas: Idea[];
  selectedIdeaId: string | null;
  isGenerating: boolean;
  generationProgress: number;
  config: IdeationConfig;
  filter: IdeaType | 'all';
  
  // Session management
  sessions: IdeaSessionSummary[];
  currentSessionId: string | null;
  isLoadingSessions: boolean;
  isSessionManagerOpen: boolean;

  // Actions
  setFilter: (filter: IdeaType | 'all') => void;
  selectIdea: (id: string | null) => void;
  addIdea: (idea: Omit<Idea, 'id' | 'createdAt' | 'updatedAt' | 'status'>) => string;
  updateIdea: (id: string, updates: Partial<Idea>) => void;
  dismissIdea: (id: string) => void;
  dismissAll: () => void;
  convertToTask: (id: string) => Promise<string | null>;
  setConfig: (config: Partial<IdeationConfig>) => void;
  
  // Generation
  startGeneration: () => Promise<void>;
  cancelGeneration: () => void;
  
  // Session management
  openSessionManager: () => void;
  closeSessionManager: () => void;
  loadSessions: () => Promise<void>;
  saveSession: (name: string, description?: string) => Promise<string | null>;
  loadSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  exportSession: (sessionId: string, format: 'markdown' | 'json') => Promise<string | null>;
  clearSession: () => void;
  
  // Selectors
  getFilteredIdeas: () => Idea[];
  getSelectedIdea: () => Idea | undefined;
  getIdeaCountByType: () => Record<IdeaType | 'all', number>;
}

const DEFAULT_CONFIG: IdeationConfig = {
  types: ['improvement', 'vulnerability', 'performance', 'documentation', 'testing'],
  maxIdeas: 20,
  includeFiles: true,
};

export const useIdeationStore = create<IdeationStore>((set, get) => ({
  ideas: [],
  selectedIdeaId: null,
  isGenerating: false,
  generationProgress: 0,
  config: DEFAULT_CONFIG,
  filter: 'all',
  
  // Session management state
  sessions: [],
  currentSessionId: null,
  isLoadingSessions: false,
  isSessionManagerOpen: false,

  setFilter: (filter) => set({ filter }),

  selectIdea: (id) => set({ selectedIdeaId: id }),

  addIdea: (ideaData) => {
    const id = generateId();
    const now = Date.now();
    const idea: Idea = {
      ...ideaData,
      id,
      status: 'new',
      createdAt: now,
      updatedAt: now,
    };
    set(state => ({ ideas: [...state.ideas, idea] }));
    return id;
  },

  updateIdea: (id, updates) => {
    set(state => ({
      ideas: state.ideas.map(idea =>
        idea.id === id ? { ...idea, ...updates, updatedAt: Date.now() } : idea
      ),
    }));
  },

  dismissIdea: (id) => {
    set(state => ({
      ideas: state.ideas.map(idea =>
        idea.id === id ? { ...idea, status: 'dismissed' as IdeaStatus, updatedAt: Date.now() } : idea
      ),
      selectedIdeaId: state.selectedIdeaId === id ? null : state.selectedIdeaId,
    }));
  },

  dismissAll: () => {
    set(state => ({
      ideas: state.ideas.map(idea =>
        idea.status === 'new' ? { ...idea, status: 'dismissed' as IdeaStatus, updatedAt: Date.now() } : idea
      ),
      selectedIdeaId: null,
    }));
  },

  convertToTask: async (id) => {
    const idea = get().ideas.find(i => i.id === id);
    if (!idea) return null;

    // Generate next task ID by finding the highest existing T### number
    const taskStore = useTaskStore.getState();
    const existingIds = taskStore.tasks
      .map(t => parseInt(t.id.replace('T', ''), 10))
      .filter(n => !isNaN(n));
    const nextNum = existingIds.length > 0 ? Math.max(...existingIds) + 1 : 171;
    const taskId = `T${String(nextNum).padStart(3, '0')}`;

    // Map idea impact to task priority
    const priorityMap: Record<string, 'low' | 'medium' | 'high'> = {
      low: 'low',
      medium: 'medium',
      high: 'high',
    };

    // Map idea type to task category
    const categoryMap: Record<IdeaType, string> = {
      improvement: 'Backend Wiring',
      vulnerability: 'Backend Wiring',
      performance: 'Backend Wiring',
      documentation: 'UI Improvements',
      testing: 'Backend Wiring',
    };

    // Create the task object
    const task: Task = {
      id: taskId,
      title: idea.title,
      description: idea.description + (idea.rationale ? `\n\nRationale: ${idea.rationale}` : ''),
      status: 'backlog',
      priority: priorityMap[idea.impact || 'medium'] || 'medium',
      tags: idea.files?.map(f => f.split('/').pop() || f).slice(0, 3),
      category: categoryMap[idea.type] as Task['category'],
      assignee: '@agent',
      createdAt: new Date().toISOString(),
    };

    // Create via task-store (persists to disk)
    await taskStore.createTask(task);

    set(state => ({
      ideas: state.ideas.map(i =>
        i.id === id ? { ...i, status: 'converted' as IdeaStatus, taskId, updatedAt: Date.now() } : i
      ),
    }));

    return taskId;
  },

  setConfig: (configUpdates) => {
    set(state => ({
      config: { ...state.config, ...configUpdates },
    }));
  },

  startGeneration: async () => {
    set({ isGenerating: true, generationProgress: 0, ideas: [] });
    
    const { config, addIdea } = get();
    
    // Map our type names to categories for the prompt
    const categories = config.types.map(t => {
      const catNames: Record<IdeaType, string> = {
        improvement: 'Code Improvements',
        vulnerability: 'Security Vulnerabilities',
        performance: 'Performance Optimizations',
        documentation: 'Documentation',
        testing: 'Testing',
      };
      return catNames[t];
    });

    set({ generationProgress: 10 });

    // Get domain-specific model config
    const domainConfig = useDomainConfigStore.getState().getConfigForDomain('ideation');

    // Call Gateway API with repo_intel-enhanced config
    const result = await gatewayClient.generate.ideas(
      'A software development project',
      categories,
      domainConfig.modelId || 'claude-3-5-sonnet',
      {
        maxIdeas: config.maxIdeas,
        includeTodos: true,
        provider: domainConfig.provider,
      }
    );

    set({ generationProgress: 50 });

    if (!result.ok || !result.data) {
      console.error('Idea generation failed:', result.error);
      set({ isGenerating: false, generationProgress: 0 });
      return;
    }

    // Parse and add ideas one by one with simulated streaming
    const ideas = result.data.ideas as Array<{
      title?: string;
      name?: string;
      description?: string;
      category?: string;
      type?: string;
      impact?: string;
      rationale?: string;
      files?: string[];
      effort?: string;
    }>;

    for (let i = 0; i < ideas.length; i++) {
      if (!get().isGenerating) break; // Cancelled

      const idea = ideas[i];
      const ideaData: Omit<Idea, 'id' | 'createdAt' | 'updatedAt' | 'status'> = {
        title: idea.title || idea.name || 'Untitled Idea',
        description: idea.description || '',
        type: mapCategoryToType(idea.category || idea.type || 'improvement'),
        impact: mapImpact(idea.impact || 'medium'),
        rationale: idea.rationale || idea.description || '',
        effort: idea.effort?.toLowerCase() as Idea['effort'] || 'medium',
        files: idea.files || [],
      };

      addIdea(ideaData);
      set({ generationProgress: 50 + ((i + 1) / ideas.length) * 50 });
      
      // Small delay for visual feedback
      await new Promise(resolve => setTimeout(resolve, 150));
    }

    set({ isGenerating: false, generationProgress: 100 });
  },

  cancelGeneration: () => {
    set({ isGenerating: false });
  },

  getFilteredIdeas: () => {
    const { ideas, filter } = get();
    if (filter === 'all') {
      return ideas.filter(i => i.status !== 'dismissed');
    }
    return ideas.filter(i => i.type === filter && i.status !== 'dismissed');
  },

  getSelectedIdea: () => {
    const { ideas, selectedIdeaId } = get();
    return ideas.find(i => i.id === selectedIdeaId);
  },

  getIdeaCountByType: () => {
    const { ideas } = get();
    const activeIdeas = ideas.filter(i => i.status !== 'dismissed');
    const counts: Record<IdeaType | 'all', number> = {
      all: activeIdeas.length,
      improvement: 0,
      vulnerability: 0,
      performance: 0,
      documentation: 0,
      testing: 0,
    };
    activeIdeas.forEach(idea => {
      counts[idea.type]++;
    });
    return counts;
  },

  // Session management
  openSessionManager: () => {
    set({ isSessionManagerOpen: true });
    get().loadSessions();
  },

  closeSessionManager: () => set({ isSessionManagerOpen: false }),

  loadSessions: async () => {
    set({ isLoadingSessions: true });
    try {
      const result = await listIdeaSessions();
      if (result.ok && result.data) {
        set({ sessions: result.data });
      }
    } catch (e) {
      console.error('Failed to load sessions:', e);
    } finally {
      set({ isLoadingSessions: false });
    }
  },

  saveSession: async (name: string, description = '') => {
    const { ideas, config } = get();
    
    // Convert Idea[] to SavedIdea[] for API
    const savedIdeas: SavedIdea[] = ideas.map(idea => ({
      id: idea.id,
      title: idea.title,
      description: idea.description,
      type: idea.type,
      impact: idea.impact || 'medium',
      effort: idea.effort || 'medium',
      rationale: idea.rationale || '',
      files: idea.files || [],
      status: idea.status,
      created_at: new Date(idea.createdAt).toISOString(),
      updated_at: new Date(idea.updatedAt).toISOString(),
    }));

    try {
      const result = await saveIdeaSession(name, description, savedIdeas, config as unknown as Record<string, unknown>);
      if (result.ok && result.data) {
        set({ currentSessionId: result.data.session_id });
        // Refresh sessions list
        get().loadSessions();
        return result.data.session_id;
      }
    } catch (e) {
      console.error('Failed to save session:', e);
    }
    return null;
  },

  loadSession: async (sessionId: string) => {
    try {
      const result = await loadIdeaSession(sessionId);
      if (result.ok && result.data) {
        const session = result.data;
        
        // Convert SavedIdea[] to Idea[]
        const ideas: Idea[] = session.ideas.map(saved => ({
          id: saved.id,
          title: saved.title,
          description: saved.description,
          type: saved.type as IdeaType,
          impact: saved.impact as Idea['impact'],
          effort: saved.effort as Idea['effort'],
          rationale: saved.rationale,
          files: saved.files,
          status: saved.status as IdeaStatus,
          createdAt: new Date(saved.created_at).getTime(),
          updatedAt: new Date(saved.updated_at).getTime(),
        }));

        set({
          ideas,
          currentSessionId: sessionId,
          isSessionManagerOpen: false,
          selectedIdeaId: null,
        });
      }
    } catch (e) {
      console.error('Failed to load session:', e);
    }
  },

  deleteSession: async (sessionId: string) => {
    try {
      const result = await deleteIdeaSession(sessionId);
      if (result.ok) {
        // If deleting current session, clear it
        if (get().currentSessionId === sessionId) {
          set({ currentSessionId: null });
        }
        // Refresh list
        get().loadSessions();
      }
    } catch (e) {
      console.error('Failed to delete session:', e);
    }
  },

  exportSession: async (sessionId: string, format: 'markdown' | 'json') => {
    try {
      const result = await exportIdeaSession(sessionId, format);
      if (result.ok && result.data) {
        return result.data.content;
      }
    } catch (e) {
      console.error('Failed to export session:', e);
    }
    return null;
  },

  clearSession: () => {
    set({
      ideas: [],
      currentSessionId: null,
      selectedIdeaId: null,
    });
  },
}));
