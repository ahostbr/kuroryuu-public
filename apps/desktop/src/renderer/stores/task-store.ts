import { create } from 'zustand';
import type { Task, TaskStatus } from '../types/task';
import { toast } from '../components/ui/toast';

interface TaskLock {
  taskId: string;
  agentId: string;
  lockedAt: number;
}

interface TaskStore {
  tasks: Task[];
  todoPath: string;
  isLoading: boolean;
  error: string | null;
  locks: TaskLock[];

  // Actions
  loadTasks: () => Promise<void>;
  setTodoPath: (path: string) => void;
  createTask: (task: Task) => Promise<void>;
  updateTask: (taskId: string, updates: Partial<Omit<Task, 'id'>>) => Promise<void>;
  deleteTask: (taskId: string) => Promise<void>;
  updateTaskStatus: (taskId: string, status: TaskStatus) => Promise<void>;
  assignTask: (taskId: string, assignee: string | undefined) => Promise<void>;
  refresh: () => Promise<void>;

  // Locking
  lockTask: (taskId: string, agentId: string) => boolean;
  unlockTask: (taskId: string) => void;
  isLocked: (taskId: string) => boolean;
  getLockedBy: (taskId: string) => string | undefined;
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: [],
  todoPath: '',
  isLoading: false,
  error: null,
  locks: [],
  
  setTodoPath: (path) => set({ todoPath: path }),
  
  loadTasks: async () => {
    const { todoPath } = get();
    if (!todoPath) return;

    set({ isLoading: true, error: null });

    try {
      const tasks = await window.electronAPI.tasks.list();
      set({ tasks, isLoading: false });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      set({ error: errorMsg, isLoading: false });
      toast.error(`Failed to load tasks: ${errorMsg}`);
    }
  },

  createTask: async (task) => {
    const { tasks } = get();
    set({ tasks: [...tasks, task] }); // Optimistic update

    try {
      const result = await window.electronAPI.tasks.create(task);
      if (!result.success) throw new Error(result.error);
      toast.success(`Created task ${result.data?.id || task.id}`);
    } catch (err) {
      set({ tasks }); // Revert
      const errorMsg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to create task: ${errorMsg}`);
    }
  },

  updateTask: async (taskId, updates) => {
    const { tasks, isLocked } = get();

    if (isLocked(taskId)) {
      toast.warning(`Task ${taskId} is locked by another agent`);
      return;
    }

    const taskIndex = tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) {
      toast.error(`Task ${taskId} not found`);
      return;
    }

    const updated = tasks.map(t =>
      t.id === taskId ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t
    );
    set({ tasks: updated }); // Optimistic update

    try {
      const result = await window.electronAPI.tasks.update(taskId, updates);
      if (!result.success) throw new Error(result.error);
      toast.success(`Task ${taskId} updated`);
    } catch (err) {
      set({ tasks }); // Revert
      const errorMsg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to update task: ${errorMsg}`);
    }
  },

  deleteTask: async (taskId) => {
    const { tasks, isLocked } = get();

    if (isLocked(taskId)) {
      toast.warning(`Task ${taskId} is locked by another agent`);
      return;
    }

    const taskIndex = tasks.findIndex(t => t.id === taskId);
    if (taskIndex === -1) {
      toast.error(`Task ${taskId} not found`);
      return;
    }

    const updated = tasks.filter(t => t.id !== taskId);
    set({ tasks: updated }); // Optimistic update

    try {
      const result = await window.electronAPI.tasks.delete(taskId);
      if (!result.success) throw new Error(result.error);
      toast.success(`Task ${taskId} deleted`);
    } catch (err) {
      set({ tasks }); // Revert
      const errorMsg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to delete task: ${errorMsg}`);
    }
  },

  updateTaskStatus: async (taskId, status) => {
    const { tasks, isLocked } = get();

    if (isLocked(taskId)) {
      toast.warning(`Task ${taskId} is locked by another agent`);
      return;
    }

    const updated = tasks.map(t =>
      t.id === taskId ? { ...t, status } : t
    );
    set({ tasks: updated }); // Optimistic update

    try {
      const result = await window.electronAPI.tasks.setStatus(taskId, status);
      if (!result.success) throw new Error(result.error);
      toast.success(`Task ${taskId} moved to ${status}`);
    } catch (err) {
      set({ tasks }); // Revert
      const errorMsg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to update task: ${errorMsg}`);
    }
  },
  
  assignTask: async (taskId, assignee) => {
    const { tasks } = get();
    const updated = tasks.map(t =>
      t.id === taskId ? { ...t, assignee } : t
    );
    set({ tasks: updated }); // Optimistic update

    try {
      const result = await window.electronAPI.tasks.assign(taskId, assignee);
      if (!result.success) throw new Error(result.error);
      toast.success(`Task ${taskId} assigned`);
    } catch (err) {
      set({ tasks }); // Revert
      const errorMsg = err instanceof Error ? err.message : String(err);
      toast.error(`Failed to assign task: ${errorMsg}`);
    }
  },
  
  refresh: async () => {
    await get().loadTasks();
  },
  
  // Locking implementation
  lockTask: (taskId, agentId) => {
    const { locks } = get();
    const existing = locks.find(l => l.taskId === taskId);
    
    if (existing) {
      // Already locked
      return false;
    }
    
    set({
      locks: [...locks, { taskId, agentId, lockedAt: Date.now() }]
    });
    return true;
  },
  
  unlockTask: (taskId) => {
    const { locks } = get();
    set({ locks: locks.filter(l => l.taskId !== taskId) });
  },
  
  isLocked: (taskId) => {
    const { locks } = get();
    return locks.some(l => l.taskId === taskId);
  },
  
  getLockedBy: (taskId) => {
    const { locks } = get();
    return locks.find(l => l.taskId === taskId)?.agentId;
  }
}));

// Subscribe to task changes from main process
if (typeof window !== 'undefined' && window.electronAPI?.tasks?.watch) {
  window.electronAPI.tasks.watch((tasks) => {
    useTaskStore.setState({ tasks });
  });
}
