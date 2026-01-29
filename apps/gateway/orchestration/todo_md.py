"""todo.md Parser and Writer - The source of truth for agent tasks.

This module manages the ai/todo.md file which is the canonical task list
that Leaders and Workers read from. Formulas "apply" by appending tasks here.

Key operations:
- read_all(): Read all tasks organized by section
- append_to_backlog(): Add new tasks to Backlog
- mark_task_done(): Move task to Done section with [x] checkbox
- move_task_to_active(): Move task from Backlog to Active
- update_task_status(): Update status tag (e.g., **IN_PROGRESS**)
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from ..utils.logging_config import get_logger

logger = get_logger(__name__)

# Default path to todo.md (relative to project root)
DEFAULT_TODO_PATH = "ai/todo.md"


class TaskState(Enum):
    """Task checkbox states in todo.md."""
    PENDING = "[ ]"      # Not started
    IN_PROGRESS = "[~]"  # In progress or deferred
    DONE = "[x]"         # Completed


@dataclass
class TodoItem:
    """A single task item from todo.md."""
    task_id: str          # e.g., "T500"
    title: str            # Task title/description
    status: str           # Status tag like **DONE**, **DEFERRED**, etc.
    assignee: str         # @agent or @human
    state: TaskState      # Checkbox state
    raw_line: str         # Original markdown line

    @property
    def id_number(self) -> int:
        """Extract numeric ID from task_id (e.g., T500 -> 500)."""
        match = re.search(r'T(\d+)', self.task_id)
        return int(match.group(1)) if match else 0


class TodoMdParser:
    """Parses and writes ai/todo.md file."""

    # Regex to parse a todo line
    # Example: - [ ] T500: Task description **DONE** @agent
    LINE_PATTERN = re.compile(
        r'^-\s+\[([ x~])\]\s+'           # Checkbox: - [ ] or - [x] or - [~]
        r'(T\d+):\s*'                     # Task ID: T500:
        r'(.+?)'                          # Title/description (non-greedy)
        r'(?:\s+\*\*(\w+)\*\*)?'          # Optional status: **DONE**
        r'\s+(@\w+)\s*$',                 # Assignee: @agent or @human
        re.MULTILINE
    )

    # Section headers
    SECTIONS = ["Backlog", "Active", "Delayed", "Done"]

    def __init__(self, todo_path: str = DEFAULT_TODO_PATH):
        self.todo_path = Path(todo_path)

    def read_all(self) -> Dict[str, List[TodoItem]]:
        """Read all tasks organized by section.

        Returns:
            Dict mapping section name to list of TodoItems
        """
        if not self.todo_path.exists():
            return {section: [] for section in self.SECTIONS}

        content = self.todo_path.read_text(encoding="utf-8")
        return self._parse_content(content)

    def _parse_content(self, content: str) -> Dict[str, List[TodoItem]]:
        """Parse todo.md content into sections."""
        result = {section: [] for section in self.SECTIONS}

        current_section = None
        for line in content.split('\n'):
            # Check for section header
            section_match = re.match(r'^##\s+(\w+)', line)
            if section_match:
                section_name = section_match.group(1)
                if section_name in self.SECTIONS:
                    current_section = section_name
                continue

            # Parse task line
            if current_section and line.strip().startswith('- ['):
                item = self._parse_line(line)
                if item:
                    result[current_section].append(item)

        return result

    def _parse_line(self, line: str) -> Optional[TodoItem]:
        """Parse a single todo line."""
        match = self.LINE_PATTERN.match(line.strip())
        if not match:
            # Try simpler pattern for lines without status tag
            simple = re.match(
                r'^-\s+\[([ x~])\]\s+(T\d+):\s*(.+?)\s+(@\w+)\s*$',
                line.strip()
            )
            if simple:
                checkbox, task_id, title, assignee = simple.groups()
                return TodoItem(
                    task_id=task_id,
                    title=title.strip(),
                    status="",
                    assignee=assignee,
                    state=self._checkbox_to_state(checkbox),
                    raw_line=line,
                )
            return None

        checkbox, task_id, title, status, assignee = match.groups()
        return TodoItem(
            task_id=task_id,
            title=title.strip(),
            status=status or "",
            assignee=assignee,
            state=self._checkbox_to_state(checkbox),
            raw_line=line,
        )

    def _checkbox_to_state(self, checkbox: str) -> TaskState:
        """Convert checkbox character to TaskState."""
        if checkbox == 'x':
            return TaskState.DONE
        elif checkbox == '~':
            return TaskState.IN_PROGRESS
        return TaskState.PENDING

    def get_max_task_id(self) -> int:
        """Get the highest task ID number in the file."""
        all_tasks = self.read_all()
        max_id = 0
        for section_tasks in all_tasks.values():
            for task in section_tasks:
                max_id = max(max_id, task.id_number)
        return max_id

    def get_next_task_ids(self, count: int) -> List[str]:
        """Generate the next N task IDs.

        Args:
            count: Number of IDs to generate

        Returns:
            List of task IDs like ["T500", "T501", "T502"]
        """
        start = self.get_max_task_id() + 1
        return [f"T{start + i}" for i in range(count)]

    def append_to_backlog(self, task_lines: List[str]) -> List[str]:
        """Append task lines to the Backlog section.

        Args:
            task_lines: List of formatted markdown lines (without leading "- [ ]")

        Returns:
            List of task IDs that were added
        """
        if not self.todo_path.exists():
            self._create_empty_todo()

        content = self.todo_path.read_text(encoding="utf-8")
        lines = content.split('\n')

        # Find the Backlog section
        backlog_idx = None
        next_section_idx = None

        for i, line in enumerate(lines):
            if re.match(r'^##\s+Backlog', line):
                backlog_idx = i
            elif backlog_idx is not None and re.match(r'^##\s+\w+', line):
                next_section_idx = i
                break

        if backlog_idx is None:
            logger.error("Backlog section not found in todo.md")
            return []

        # Find insertion point (after last item in Backlog, or after header)
        insert_idx = backlog_idx + 1
        if next_section_idx:
            # Insert before the next section
            insert_idx = next_section_idx
            # But skip any trailing whitespace
            while insert_idx > backlog_idx + 1 and not lines[insert_idx - 1].strip():
                insert_idx -= 1
        else:
            # No next section, find end of Backlog items
            for i in range(backlog_idx + 1, len(lines)):
                if lines[i].strip().startswith('- ['):
                    insert_idx = i + 1
                elif lines[i].strip() and not lines[i].strip().startswith('- '):
                    break

        # Insert the new tasks
        task_ids = []
        new_lines = []
        for task_line in task_lines:
            # Extract task ID from the line
            match = re.search(r'(T\d+):', task_line)
            if match:
                task_ids.append(match.group(1))
            new_lines.append(task_line)

        # Build new content
        result_lines = (
            lines[:insert_idx] +
            new_lines +
            ([""] if insert_idx < len(lines) and lines[insert_idx].strip() else []) +
            lines[insert_idx:]
        )

        # Write back
        new_content = '\n'.join(result_lines)
        self.todo_path.write_text(new_content, encoding="utf-8")

        logger.info(f"Added {len(task_ids)} tasks to Backlog: {task_ids}")
        return task_ids

    def mark_task_done(self, task_id: str, result_note: str = "") -> bool:
        """Mark a task as done and move it to the Done section.

        This is called by Workers when they complete a task.

        Args:
            task_id: Task ID like "T500"
            result_note: Optional note about the result (appended to task title)

        Returns:
            True if task was found and updated, False otherwise
        """
        return self._move_task(task_id, "Done", TaskState.DONE, result_note)

    def move_task_to_active(self, task_id: str) -> bool:
        """Move a task from Backlog to Active section.

        This is called by Leaders when they assign a task to a Worker.

        Args:
            task_id: Task ID like "T500"

        Returns:
            True if task was found and moved, False otherwise
        """
        return self._move_task(task_id, "Active", TaskState.IN_PROGRESS)

    def mark_task_in_progress(self, task_id: str) -> bool:
        """Mark a task as in progress (change checkbox to [~]).

        Args:
            task_id: Task ID like "T500"

        Returns:
            True if task was found and updated, False otherwise
        """
        if not self.todo_path.exists():
            return False

        content = self.todo_path.read_text(encoding="utf-8")
        lines = content.split('\n')
        updated = False

        for i, line in enumerate(lines):
            if f"{task_id}:" in line and line.strip().startswith("- ["):
                # Update checkbox to [~]
                updated_line = re.sub(r'^(-\s+)\[[ x~]\]', r'\1[~]', line)
                if updated_line != line:
                    lines[i] = updated_line
                    updated = True
                    logger.info(f"Marked task {task_id} as in progress")
                break

        if updated:
            self.todo_path.write_text('\n'.join(lines), encoding="utf-8")

        return updated

    def _move_task(
        self,
        task_id: str,
        target_section: str,
        new_state: TaskState,
        note: str = "",
    ) -> bool:
        """Move a task to a different section with optional state change.

        Args:
            task_id: Task ID to move
            target_section: Section to move to (Backlog, Active, Done, etc.)
            new_state: New checkbox state
            note: Optional note to append to task title

        Returns:
            True if task was found and moved
        """
        if not self.todo_path.exists():
            return False

        content = self.todo_path.read_text(encoding="utf-8")
        lines = content.split('\n')

        # Find the task line
        task_line = None
        task_line_idx = None

        for i, line in enumerate(lines):
            if f"{task_id}:" in line and line.strip().startswith("- ["):
                task_line = line
                task_line_idx = i
                break

        if task_line is None:
            logger.warning(f"Task {task_id} not found in todo.md")
            return False

        # Update the checkbox state
        checkbox_char = {
            TaskState.PENDING: " ",
            TaskState.IN_PROGRESS: "~",
            TaskState.DONE: "x",
        }.get(new_state, " ")

        updated_line = re.sub(r'^(-\s+)\[[ x~]\]', f'\\1[{checkbox_char}]', task_line)

        # Add note if provided
        if note:
            # Remove existing assignee, add note, re-add assignee
            assignee_match = re.search(r'(@\w+)\s*$', updated_line)
            if assignee_match:
                assignee = assignee_match.group(1)
                updated_line = re.sub(r'\s+@\w+\s*$', '', updated_line)
                updated_line = f"{updated_line} ({note}) {assignee}"
            else:
                updated_line = f"{updated_line} ({note})"

        # Add status tag for Done
        if new_state == TaskState.DONE and "**DONE**" not in updated_line:
            # Insert **DONE** before assignee
            assignee_match = re.search(r'(@\w+)\s*$', updated_line)
            if assignee_match:
                assignee = assignee_match.group(1)
                updated_line = re.sub(r'\s+@\w+\s*$', f' **DONE** {assignee}', updated_line)

        # Remove the task from its current location
        del lines[task_line_idx]

        # Find target section
        target_idx = None
        for i, line in enumerate(lines):
            if re.match(rf'^##\s+{target_section}\b', line):
                target_idx = i
                break

        if target_idx is None:
            logger.error(f"Section {target_section} not found in todo.md")
            # Re-insert the task at original position
            lines.insert(task_line_idx, task_line)
            return False

        # Find the end of the target section (before next section or EOF)
        insert_idx = target_idx + 1
        for i in range(target_idx + 1, len(lines)):
            if re.match(r'^##\s+\w+', lines[i]):
                # Insert before the next section, but after any existing tasks
                break
            if lines[i].strip().startswith("- ["):
                insert_idx = i + 1
            elif lines[i].strip() and not lines[i].startswith("#"):
                insert_idx = i + 1

        # Insert the updated task
        lines.insert(insert_idx, updated_line)

        # Write back
        self.todo_path.write_text('\n'.join(lines), encoding="utf-8")
        logger.info(f"Moved task {task_id} to {target_section} with state {new_state.value}")
        return True

    def update_task_status(self, task_id: str, status_tag: str) -> bool:
        """Update the status tag of a task (e.g., **IN_PROGRESS**, **BLOCKED**).

        Args:
            task_id: Task ID like "T500"
            status_tag: Status tag without ** (e.g., "IN_PROGRESS")

        Returns:
            True if task was found and updated
        """
        if not self.todo_path.exists():
            return False

        content = self.todo_path.read_text(encoding="utf-8")
        lines = content.split('\n')
        updated = False

        for i, line in enumerate(lines):
            if f"{task_id}:" in line and line.strip().startswith("- ["):
                # Remove existing status tag
                updated_line = re.sub(r'\s+\*\*\w+\*\*', '', line)

                # Add new status tag before assignee
                assignee_match = re.search(r'(@\w+)\s*$', updated_line)
                if assignee_match:
                    assignee = assignee_match.group(1)
                    updated_line = re.sub(
                        r'\s+@\w+\s*$',
                        f' **{status_tag}** {assignee}',
                        updated_line
                    )
                else:
                    updated_line = f"{updated_line} **{status_tag}**"

                lines[i] = updated_line
                updated = True
                logger.info(f"Updated task {task_id} status to **{status_tag}**")
                break

        if updated:
            self.todo_path.write_text('\n'.join(lines), encoding="utf-8")

        return updated

    def get_next_backlog_task(self) -> Optional[TodoItem]:
        """Get the next pending task from Backlog (FIFO order).

        This is called by Leaders to pick up the next task to assign.

        Returns:
            The next TodoItem from Backlog, or None if empty
        """
        all_tasks = self.read_all()
        backlog = all_tasks.get("Backlog", [])

        for task in backlog:
            if task.state == TaskState.PENDING:
                return task

        return None

    def get_active_tasks(self) -> List[TodoItem]:
        """Get all tasks currently in the Active section.

        Returns:
            List of TodoItems in Active section
        """
        all_tasks = self.read_all()
        return all_tasks.get("Active", [])

    def _create_empty_todo(self) -> None:
        """Create an empty todo.md with standard sections."""
        content = """# Tasks

## Backlog

## Active

## Delayed

## Done
"""
        self.todo_path.parent.mkdir(parents=True, exist_ok=True)
        self.todo_path.write_text(content, encoding="utf-8")
        logger.info(f"Created new todo.md at {self.todo_path}")


def format_formula_task(
    task_id: str,
    feature_name: str,
    step_name: str,
    prompt_ref: Optional[str],
    description: str,
    assignee: str = "@agent",
) -> str:
    """Format a formula step as a todo.md task line.

    Format: - [ ] T{id}: [{feature}] {step} - Read {prompt}: {summary} @agent

    Args:
        task_id: Task ID like "T500"
        feature_name: Feature/formula name for grouping
        step_name: Step name from formula
        prompt_ref: Path to prompt file (relative to ai/prompts/)
        description: Brief description/summary
        assignee: @agent or @human

    Returns:
        Formatted markdown line
    """
    parts = [f"- [ ] {task_id}:"]

    # Add feature tag if provided
    if feature_name:
        parts.append(f"[{feature_name}]")

    # Add step name
    parts.append(step_name)

    # Add prompt reference
    if prompt_ref:
        # Normalize prompt path
        if not prompt_ref.startswith("ai/prompts/"):
            # Try to find the prompt in standard locations
            prompt_path = _find_prompt_path(prompt_ref)
            if prompt_path:
                prompt_ref = prompt_path
            else:
                prompt_ref = f"ai/prompts/{prompt_ref}.md"
        parts.append(f"- Read {prompt_ref}:")
    elif description:
        parts.append("-")

    # Add description
    if description:
        # Truncate long descriptions
        if len(description) > 100:
            description = description[:97] + "..."
        parts.append(description)

    # Add assignee
    parts.append(assignee)

    return " ".join(parts)


def _find_prompt_path(prompt_ref: str) -> Optional[str]:
    """Try to find prompt file in standard locations.

    Searches:
    - ai/prompts/{prompt_ref}.md
    - ai/prompts/workflows/{prompt_ref}.md
    - ai/prompts/leader/{prompt_ref}.md
    - ai/prompts/worker/{prompt_ref}.md
    """
    base = Path("ai/prompts")
    locations = [
        base / f"{prompt_ref}.md",
        base / "workflows" / f"{prompt_ref}.md",
        base / "leader" / f"{prompt_ref}.md",
        base / "worker" / f"{prompt_ref}.md",
    ]

    for loc in locations:
        if loc.exists():
            return str(loc)

    return None
