import { promises as fs } from 'fs';
import { watch, FSWatcher } from 'fs';
import { join } from 'path';
import { EventEmitter } from 'events';

export type TaskStatus = 'backlog' | 'active' | 'delayed' | 'done';
export type ClaudeTaskStatus = 'pending' | 'in_progress' | 'completed';

export interface Task {
  id: string;
  title: string;
  status: TaskStatus;
  assignee?: string;
  tags?: string[];
  notes?: string;
}

export interface ClaudeTask {
  id: string;
  description: string;
  status: ClaudeTaskStatus;
  worklog?: string;
  checkpoint?: string;
  createdAt?: Date;
  completedAt?: Date;
}

interface TasksChangedCallback {
  (tasks: Task[]): void;
}

/**
 * TaskService - Centralized service for ALL todo.md operations
 *
 * Handles:
 * - File I/O, parsing, and validation
 * - Event emission when tasks change
 * - Both Kanban tasks and Claude task monitoring
 */
export class TaskService extends EventEmitter {
  private projectRoot: string | null = null;
  private todoPath: string | null = null;
  private watcher: FSWatcher | null = null;
  private skipNextReload = false;
  private debounceTimer: NodeJS.Timeout | null = null;
  private readonly DEBOUNCE_MS = 300;

  /**
   * Initialize the service with project root path
   */
  initialize(projectRoot: string): void {
    this.projectRoot = projectRoot;
    this.todoPath = join(projectRoot, 'ai', 'todo.md');
  }

  /**
   * Ensures service is initialized
   */
  private ensureInitialized(): void {
    if (!this.projectRoot || !this.todoPath) {
      throw new Error('TaskService not initialized. Call initialize() first.');
    }
  }

  /**
   * Read and parse the entire todo.md file
   */
  private async readTodoFile(): Promise<string> {
    this.ensureInitialized();
    try {
      return await fs.readFile(this.todoPath!, 'utf-8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return '# Tasks\n\n## Backlog\n\n## Active\n\n## Delayed\n\n## Done\n\n';
      }
      throw error;
    }
  }

  /**
   * Write content to todo.md file
   */
  private async writeTodoFile(content: string): Promise<void> {
    this.ensureInitialized();
    this.skipNextReload = true;
    await fs.writeFile(this.todoPath!, content, 'utf-8');
  }

  /**
   * Parse task line from todo.md
   * Format: - [x] T001: description @@assignee #tag1 #tag2
   */
  private parseTaskLine(line: string): Task | null {
    // Match pattern: - [ ] or - [x] or - [~]
    const taskMatch = line.match(/^-\s+\[([ x~])\]\s+([A-Z0-9]+):\s+(.+)/);
    if (!taskMatch) return null;

    const [, checkbox, id, rest] = taskMatch;

    // Extract assignee (@@user)
    const assigneeMatch = rest.match(/@@(\S+)/);
    const assignee = assigneeMatch ? assigneeMatch[1] : undefined;

    // Extract tags (#tag)
    const tagMatches = rest.matchAll(/#(\S+)/g);
    const tags = Array.from(tagMatches, m => m[1]);

    // Clean title (remove assignee and tags)
    const title = rest
      .replace(/@@\S+/g, '')
      .replace(/#\S+/g, '')
      .replace(/\(completed:.*?\)/g, '')
      .replace(/\(created:.*?\)/g, '')
      .trim();

    // Determine status from checkbox
    let status: TaskStatus = 'backlog';
    if (checkbox === 'x') status = 'done';
    else if (checkbox === '~') status = 'active';

    return {
      id,
      title,
      status,
      assignee,
      tags: tags.length > 0 ? tags : undefined,
    };
  }

  /**
   * Parse Claude task line
   * Format: - [ ] T001: description @agent [worklog: path] [checkpoint: cp] (created: ts) (completed: ts)
   */
  private parseClaudeTaskLine(line: string): ClaudeTask | null {
    const taskMatch = line.match(/^-\s+\[([ x~])\]\s+([A-Z0-9]+):\s+(.+)/);
    if (!taskMatch) return null;

    const [, checkbox, id, rest] = taskMatch;

    // Extract worklog
    const worklogMatch = rest.match(/\[worklog:\s*([^\]]+)\]/);
    const worklog = worklogMatch && worklogMatch[1] !== 'pending' ? worklogMatch[1] : undefined;

    // Extract checkpoint
    const checkpointMatch = rest.match(/\[checkpoint:\s*([^\]]+)\]/);
    const checkpoint = checkpointMatch && checkpointMatch[1] !== 'pending' ? checkpointMatch[1] : undefined;

    // Extract timestamps
    const createdMatch = rest.match(/\(created:\s*([^)]+)\)/);
    const completedMatch = rest.match(/\(completed:\s*([^)]+)\)/);

    const createdAt = createdMatch ? new Date(createdMatch[1]) : undefined;
    const completedAt = completedMatch ? new Date(completedMatch[1]) : undefined;

    // Clean description
    const description = rest
      .replace(/\[worklog:.*?\]/g, '')
      .replace(/\[checkpoint:.*?\]/g, '')
      .replace(/\(created:.*?\)/g, '')
      .replace(/\(completed:.*?\)/g, '')
      .replace(/@\S+/g, '')
      .trim();

    // Determine status
    let status: ClaudeTaskStatus = 'pending';
    if (checkbox === 'x') status = 'completed';
    else if (checkbox === '~') status = 'in_progress';

    return {
      id,
      description,
      status,
      worklog,
      checkpoint,
      createdAt,
      completedAt,
    };
  }

  /**
   * Format task to todo.md line
   */
  private formatTaskLine(task: Task): string {
    const checkbox = task.status === 'done' ? 'x' : task.status === 'active' ? '~' : ' ';
    let line = `- [${checkbox}] ${task.id}: ${task.title}`;

    if (task.assignee) {
      line += ` @@${task.assignee}`;
    }

    if (task.tags && task.tags.length > 0) {
      line += ' ' + task.tags.map(t => `#${t}`).join(' ');
    }

    return line;
  }

  /**
   * List all Kanban tasks
   */
  async listTasks(): Promise<Task[]> {
    const content = await this.readTodoFile();
    const lines = content.split('\n');
    const tasks: Task[] = [];
    let currentSection: TaskStatus | null = null;

    for (const line of lines) {
      // Track sections
      if (line.startsWith('## Backlog')) currentSection = 'backlog';
      else if (line.startsWith('## Active')) currentSection = 'active';
      else if (line.startsWith('## Delayed')) currentSection = 'delayed';
      else if (line.startsWith('## Done')) currentSection = 'done';
      else if (line.startsWith('## Claude Tasks')) currentSection = null; // Stop at Claude section

      // Parse tasks in Kanban sections only
      if (currentSection && line.startsWith('- [')) {
        const task = this.parseTaskLine(line);
        if (task) {
          // Override status with section
          task.status = currentSection;
          tasks.push(task);
        }
      }
    }

    return tasks;
  }

  /**
   * Get a specific task by ID
   */
  async getTask(taskId: string): Promise<Task | null> {
    const tasks = await this.listTasks();
    return tasks.find(t => t.id === taskId) || null;
  }

  /**
   * Create a new task
   */
  async createTask(task: Omit<Task, 'id'>): Promise<Task> {
    const content = await this.readTodoFile();
    const lines = content.split('\n');

    // Generate next task ID
    const existingIds = (await this.listTasks()).map(t => t.id);
    const nextId = this.generateNextTaskId(existingIds);

    const newTask: Task = { ...task, id: nextId };
    const taskLine = this.formatTaskLine(newTask);

    // Find the appropriate section to insert
    const sectionHeader = `## ${this.capitalizeFirst(newTask.status)}`;
    const sectionIndex = lines.findIndex(line => line === sectionHeader);

    if (sectionIndex === -1) {
      throw new Error(`Section not found: ${sectionHeader}`);
    }

    // Insert after section header
    lines.splice(sectionIndex + 1, 0, taskLine);

    await this.writeTodoFile(lines.join('\n'));
    this.emit('tasksChanged', await this.listTasks());

    return newTask;
  }

  /**
   * Update an existing task
   */
  async updateTask(taskId: string, updates: Partial<Task>): Promise<Task> {
    const content = await this.readTodoFile();
    const lines = content.split('\n');

    let taskIndex = -1;
    let currentSection: TaskStatus | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith('## Backlog')) currentSection = 'backlog';
      else if (line.startsWith('## Active')) currentSection = 'active';
      else if (line.startsWith('## Delayed')) currentSection = 'delayed';
      else if (line.startsWith('## Done')) currentSection = 'done';
      else if (line.startsWith('## Claude Tasks')) currentSection = null;

      if (currentSection && line.startsWith('- [')) {
        const task = this.parseTaskLine(line);
        if (task && task.id === taskId) {
          taskIndex = i;
          break;
        }
      }
    }

    if (taskIndex === -1) {
      throw new Error(`Task not found: ${taskId}`);
    }

    const existingTask = this.parseTaskLine(lines[taskIndex])!;
    const updatedTask: Task = { ...existingTask, ...updates };

    // If status changed, move to new section
    if (updates.status && updates.status !== existingTask.status) {
      lines.splice(taskIndex, 1); // Remove from old section

      const newSectionHeader = `## ${this.capitalizeFirst(updates.status)}`;
      const newSectionIndex = lines.findIndex(line => line === newSectionHeader);

      if (newSectionIndex === -1) {
        throw new Error(`Section not found: ${newSectionHeader}`);
      }

      lines.splice(newSectionIndex + 1, 0, this.formatTaskLine(updatedTask));
    } else {
      lines[taskIndex] = this.formatTaskLine(updatedTask);
    }

    await this.writeTodoFile(lines.join('\n'));
    this.emit('tasksChanged', await this.listTasks());

    return updatedTask;
  }

  /**
   * Delete a task
   */
  async deleteTask(taskId: string): Promise<void> {
    const content = await this.readTodoFile();
    const lines = content.split('\n');

    let taskIndex = -1;
    let currentSection: TaskStatus | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line.startsWith('## Backlog')) currentSection = 'backlog';
      else if (line.startsWith('## Active')) currentSection = 'active';
      else if (line.startsWith('## Delayed')) currentSection = 'delayed';
      else if (line.startsWith('## Done')) currentSection = 'done';
      else if (line.startsWith('## Claude Tasks')) currentSection = null;

      if (currentSection && line.startsWith('- [')) {
        const task = this.parseTaskLine(line);
        if (task && task.id === taskId) {
          taskIndex = i;
          break;
        }
      }
    }

    if (taskIndex === -1) {
      throw new Error(`Task not found: ${taskId}`);
    }

    lines.splice(taskIndex, 1);

    await this.writeTodoFile(lines.join('\n'));
    this.emit('tasksChanged', await this.listTasks());
  }

  /**
   * Update task status (convenience method)
   */
  async updateTaskStatus(taskId: string, status: TaskStatus): Promise<Task> {
    return this.updateTask(taskId, { status });
  }

  /**
   * Assign a task (convenience method)
   */
  async assignTask(taskId: string, assignee: string): Promise<Task> {
    return this.updateTask(taskId, { assignee });
  }

  /**
   * List Claude tasks (read-only)
   */
  async listClaudeTasks(): Promise<ClaudeTask[]> {
    const content = await this.readTodoFile();
    const lines = content.split('\n');
    const tasks: ClaudeTask[] = [];
    let inClaudeSection = false;

    for (const line of lines) {
      if (line.startsWith('## Claude Tasks')) {
        inClaudeSection = true;
        continue;
      }

      // Stop at next section
      if (inClaudeSection && line.startsWith('## ') && !line.startsWith('## Claude Tasks')) {
        break;
      }

      if (inClaudeSection && line.startsWith('- [')) {
        const task = this.parseClaudeTaskLine(line);
        if (task) {
          tasks.push(task);
        }
      }
    }

    return tasks;
  }

  /**
   * Start file watching
   */
  startWatching(): void {
    this.ensureInitialized();

    if (this.watcher) {
      return; // Already watching
    }

    this.watcher = watch(this.todoPath!, (eventType) => {
      if (this.skipNextReload) {
        this.skipNextReload = false;
        return;
      }

      // Debounce file changes
      if (this.debounceTimer) {
        clearTimeout(this.debounceTimer);
      }

      this.debounceTimer = setTimeout(async () => {
        const tasks = await this.listTasks();
        this.emit('tasksChanged', tasks);
      }, this.DEBOUNCE_MS);
    });
  }

  /**
   * Stop file watching
   */
  stopWatching(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /**
   * Register callback for task changes
   * Returns unsubscribe function
   */
  onTasksChanged(callback: TasksChangedCallback): () => void {
    this.on('tasksChanged', callback);

    return () => {
      this.off('tasksChanged', callback);
    };
  }

  /**
   * Generate next task ID
   */
  private generateNextTaskId(existingIds: string[]): string {
    // Find highest numeric T### ID
    const numericIds = existingIds
      .filter(id => /^T\d+$/.test(id))
      .map(id => parseInt(id.substring(1), 10));

    const maxId = numericIds.length > 0 ? Math.max(...numericIds) : 0;
    const nextNum = maxId + 1;

    return `T${nextNum.toString().padStart(3, '0')}`;
  }

  /**
   * Capitalize first letter
   */
  private capitalizeFirst(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }
}

// Singleton instance
let instance: TaskService | null = null;

/**
 * Get or create TaskService singleton
 */
export function getTaskService(): TaskService {
  if (!instance) {
    instance = new TaskService();
  }
  return instance;
}
