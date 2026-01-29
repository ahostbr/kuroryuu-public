import type { Task, TaskStatus } from '../types/task';

/**
 * Parse ai/todo.md format:
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
