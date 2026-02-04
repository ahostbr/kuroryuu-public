import { create } from 'zustand';

/**
 * Claude Task - represents a task created by Claude Code's TaskCreate/TaskUpdate
 * These are synced from the ## Claude Tasks section of ai/todo.md
 */
export interface ClaudeTask {
  id: string;           // T001, T002, etc.
  description: string;  // Task description
  status: 'pending' | 'in_progress' | 'completed';
  worklog?: string;     // Path to worklog if linked
  checkpoint?: string;  // Checkpoint reference if linked
  createdAt?: Date;     // Parsed from (created: timestamp)
  completedAt?: Date;   // Parsed from (completed: timestamp)
}

export interface ClaudeTaskStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  completionRate: number; // 0-100
}

interface ClaudeTaskStore {
  tasks: ClaudeTask[];
  todoPath: string;
  isLoading: boolean;
  error: string | null;
  displayLimit: number; // 0 = all

  // Computed
  stats: ClaudeTaskStats;

  // Actions
  loadTasks: () => Promise<void>;
  setTodoPath: (path: string) => void;
  setDisplayLimit: (limit: number) => void;
  refresh: () => Promise<void>;
}

/**
 * Calculate stats from tasks
 */
function calculateStats(tasks: ClaudeTask[]): ClaudeTaskStats {
  const total = tasks.length;
  const completed = tasks.filter(t => t.status === 'completed').length;
  const inProgress = tasks.filter(t => t.status === 'in_progress').length;
  const pending = tasks.filter(t => t.status === 'pending').length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { total, pending, inProgress, completed, completionRate };
}

export const useClaudeTaskStore = create<ClaudeTaskStore>((set, get) => ({
  tasks: [],
  todoPath: '',
  isLoading: false,
  error: null,
  displayLimit: 0, // 0 = all
  stats: { total: 0, pending: 0, inProgress: 0, completed: 0, completionRate: 0 },

  setTodoPath: (path) => set({ todoPath: path }),

  setDisplayLimit: (limit) => set({ displayLimit: limit }),

  loadTasks: async () => {
    const { todoPath, isLoading } = get();
    if (!todoPath || isLoading) return;

    set({ isLoading: true, error: null });

    try {
      // Use centralized API - parsing and hashing happens in main process
      const tasks = await window.electronAPI.tasks.claudeList();
      const stats = calculateStats(tasks);
      set({ tasks, stats, isLoading: false });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      set({ error: errorMsg, isLoading: false });
    }
  },

  refresh: async () => {
    await get().loadTasks();
  },
}));

// Export helper for components that need filtered tasks
export function getDisplayTasks(tasks: ClaudeTask[], limit: number): ClaudeTask[] {
  if (limit === 0) return tasks;
  return tasks.slice(0, limit);
}
