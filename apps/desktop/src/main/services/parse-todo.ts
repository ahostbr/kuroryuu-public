/**
 * Unified todo.md parser for main process
 *
 * Combines:
 * - Kanban task parser (parseTodoMd)
 * - Claude task parser (parseClaudeTasks)
 * - Serialization and utility functions
 */

// ========== TYPES ==========

export type TaskStatus = 'backlog' | 'active' | 'delayed' | 'done';

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
  status: 'pending' | 'in_progress' | 'completed';
  worklog?: string;
  createdAt?: Date;
  completedAt?: Date;
}

export interface ClaudeTaskStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  completionRate: number;
}

// ========== KANBAN TASK PARSER ==========

/**
 * Parse ai/todo.md format into Kanban tasks:
 *
 * ## Backlog
 * - [ ] T001: Task title
 * - [ ] T002: Another task
 *
 * ## Active
 * - [~] T003: In progress task @agent_001
 *
 * ## Delayed
 * - [~] T004: Task title **SKIPPED** - reason @agent
 * - [~] T005: Task title **DEFERRED** - reason @agent
 *
 * ## Done
 * - [x] T006: Completed task
 */
export function parseTodoMd(content: string): Task[] {
  const tasks: Task[] = [];
  let currentStatus: TaskStatus = 'backlog';

  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Section headers
    if (trimmed.match(/^##\s*backlog/i)) {
      currentStatus = 'backlog';
      continue;
    }
    if (trimmed.match(/^##\s*(active|in.?progress)/i)) {
      currentStatus = 'active';
      continue;
    }
    if (trimmed.match(/^##\s*(delayed|blocked|waiting)/i)) {
      currentStatus = 'delayed';
      continue;
    }
    if (trimmed.match(/^##\s*(done|completed?)/i)) {
      currentStatus = 'done';
      continue;
    }

    // Task lines: - [ ] T001: Title @assignee #tag
    // Also handles: - [ ] T001 — Title (owner: x) (status: y)
    const taskMatch = trimmed.match(
      /^-\s*\[([ x~])\]\s*(T\d+)\s*[:\u2014—-]\s*(.+)$/i
    );

    if (taskMatch) {
      const [, checkbox, id, rest] = taskMatch;

      // Status is determined by section header, checkbox is just for display
      // [x] = done, [~] = in progress (active or delayed), [ ] = backlog
      let status = currentStatus;
      if (checkbox === 'x') status = 'done';
      // [~] means "in progress" - keep the section's status (active or delayed)
      // Only override to active if we're in backlog with a ~ checkbox
      else if (checkbox === '~' && currentStatus === 'backlog') status = 'active';

      // Extract notes (**SKIPPED** - reason, **DEFERRED** - reason, etc.)
      // Pattern: **STATUS** followed by optional " - reason"
      const notesMatch = rest.match(/\*\*(SKIPPED|DEFERRED|BLOCKED|WIP)\*\*\s*(?:-\s*)?(.*)$/i);
      let notes: string | undefined;
      let textWithoutNotes = rest;

      if (notesMatch) {
        const [fullMatch, noteType, noteReason] = notesMatch;
        // Keep the full notes string including **TYPE** and reason
        notes = fullMatch.trim();
        // Remove notes from the text for title extraction
        textWithoutNotes = rest.replace(fullMatch, '');
      }

      // Extract assignee (@agent_001) or (owner: agent_001)
      const assigneeMatch = textWithoutNotes.match(/@(\S+)/) || textWithoutNotes.match(/\(owner:\s*(\w+)\)/);
      const assignee = assigneeMatch?.[1];

      // Extract tags (#tag1 #tag2)
      const tagMatches = textWithoutNotes.matchAll(/#(\S+)/g);
      const tags = Array.from(tagMatches, m => m[1]);

      // Clean title (remove @assignee, #tags, (owner: ...), (status: ...))
      const title = textWithoutNotes
        .replace(/@\S+/g, '')
        .replace(/#\S+/g, '')
        .replace(/\(owner:\s*\w+\)/gi, '')
        .replace(/\(status:\s*\w+\)/gi, '')
        .replace(/\(already complete\)/gi, '')
        .replace(/\(requires \w+\)/gi, '')
        .trim();

      tasks.push({
        id: id.toUpperCase(),
        title,
        status,
        assignee,
        tags: tags.length > 0 ? tags : undefined,
        notes
      });
    }
  }

  return tasks;
}

// ========== KANBAN TASK SERIALIZER ==========

/**
 * Serialize Kanban tasks back to todo.md format
 */
export function serializeTodoMd(tasks: Task[]): string {
  const backlog = tasks.filter(t => t.status === 'backlog');
  const active = tasks.filter(t => t.status === 'active');
  const delayed = tasks.filter(t => t.status === 'delayed');
  const done = tasks.filter(t => t.status === 'done');

  const formatTask = (t: Task): string => {
    const checkbox = t.status === 'done' ? 'x' : (t.status === 'active' || t.status === 'delayed') ? '~' : ' ';
    let line = `- [${checkbox}] ${t.id}: ${t.title}`;
    // Add notes (e.g., **SKIPPED** - reason) after title
    if (t.notes) line += `  ${t.notes}`;
    if (t.assignee) line += ` @${t.assignee}`;
    if (t.tags?.length) line += ' ' + t.tags.map(tag => `#${tag}`).join(' ');
    return line;
  };

  return [
    '# Tasks',
    '',
    '## Backlog',
    ...backlog.map(formatTask),
    '',
    '## Active',
    ...active.map(formatTask),
    '',
    '## Delayed',
    ...delayed.map(formatTask),
    '',
    '## Done',
    ...done.map(formatTask),
    ''
  ].join('\n');
}

// ========== CLAUDE TASK PARSER ==========

/**
 * Parse Claude tasks from todo.md content
 * Searches all sections for task lines with Claude-specific metadata
 *
 * Format:
 * - [ ] T###: description @agent [worklog: ...] (created: ...) (completed: ...)
 * - [x] T###: ...
 * - [~] T###: ... (in progress)
 */
export function parseClaudeTasks(content: string): ClaudeTask[] {
  const tasks: ClaudeTask[] = [];

  // Normalize line endings (Windows CRLF -> LF)
  const normalizedContent = content.replace(/\r\n/g, '\n');

  // Match task lines anywhere in the file
  const taskPattern = /^- \[([ x~])\] (T\d{3,}):\s*(.+)$/gm;
  let match;

  while ((match = taskPattern.exec(normalizedContent)) !== null) {
    const checkbox = match[1];
    const isCompleted = checkbox === 'x';
    const isInProgress = checkbox === '~';
    const id = match[2];
    const rest = match[3];

    // Parse description (everything before @agent or [worklog: or (created:)
    let description = rest;
    const atAgentIdx = rest.indexOf('@agent');
    if (atAgentIdx > 0) {
      description = rest.substring(0, atAgentIdx).trim();
    }

    // Parse worklog
    let worklog: string | undefined;
    const worklogMatch = rest.match(/\[worklog:\s*([^\]]+)\]/);
    if (worklogMatch && worklogMatch[1] !== 'pending') {
      worklog = worklogMatch[1].trim();
    }

    // Parse created timestamp
    let createdAt: Date | undefined;
    const createdMatch = rest.match(/\(created:\s*([^)]+)\)/);
    if (createdMatch) {
      createdAt = new Date(createdMatch[1].trim());
      if (isNaN(createdAt.getTime())) createdAt = undefined;
    }

    // Parse completed timestamp
    let completedAt: Date | undefined;
    const completedMatch = rest.match(/\(completed:\s*([^)]+)\)/);
    if (completedMatch) {
      completedAt = new Date(completedMatch[1].trim());
      if (isNaN(completedAt.getTime())) completedAt = undefined;
    }

    tasks.push({
      id,
      description,
      status: isCompleted ? 'completed' : isInProgress ? 'in_progress' : 'pending',
      worklog,
      createdAt,
      completedAt,
    });
  }

  return tasks;
}

// ========== CLAUDE TASK STATS ==========

/**
 * Calculate statistics from Claude tasks
 */
export function calculateClaudeTaskStats(tasks: ClaudeTask[]): ClaudeTaskStats {
  const total = tasks.length;
  const completed = tasks.filter(t => t.status === 'completed').length;
  const inProgress = tasks.filter(t => t.status === 'in_progress').length;
  const pending = tasks.filter(t => t.status === 'pending').length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { total, pending, inProgress, completed, completionRate };
}

// ========== UTILITY FUNCTIONS ==========

/**
 * Simple hash function for content comparison
 * Avoids re-parsing unchanged files
 */
export function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}

/**
 * Get next available task ID from existing tasks
 * Returns next T### ID (e.g., "T001", "T002", etc.)
 */
export function getNextTaskId(tasks: Task[]): string {
  if (tasks.length === 0) return 'T001';

  // Extract numeric IDs and find max
  const maxId = tasks.reduce((max, task) => {
    const match = task.id.match(/^T(\d+)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      return num > max ? num : max;
    }
    return max;
  }, 0);

  // Return next ID with zero-padding
  const nextNum = maxId + 1;
  return `T${String(nextNum).padStart(3, '0')}`;
}

/**
 * Generate unique task ID avoiding existing IDs
 * Returns next available T### ID
 */
export function generateTaskId(existingIds: string[]): string {
  if (existingIds.length === 0) return 'T001';

  // Extract numeric IDs and find max
  const maxId = existingIds.reduce((max, id) => {
    const match = id.match(/^T(\d+)$/i);
    if (match) {
      const num = parseInt(match[1], 10);
      return num > max ? num : max;
    }
    return max;
  }, 0);

  // Return next ID with zero-padding
  const nextNum = maxId + 1;
  return `T${String(nextNum).padStart(3, '0')}`;
}

/**
 * Filter tasks for display (limit to N tasks)
 * @param tasks Task array
 * @param limit Maximum number of tasks (0 = all)
 */
export function getDisplayTasks<T>(tasks: T[], limit: number): T[] {
  if (limit === 0) return tasks;
  return tasks.slice(0, limit);
}
