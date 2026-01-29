"""Formula System - TOML workflow parsing and execution.

Formulas are reusable workflow templates stored as TOML files.
When "applied", they add tasks to ai/todo.md for execution.
"""

from __future__ import annotations

import os
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    import tomllib  # Python 3.11+
except ImportError:
    import tomli as tomllib  # Fallback

from .models import (
    Formula,
    FormulaStep,
    FormulaVar,
    FormulaVarType,
    SubTask,
    Task,
    TaskStatus,
)
from .todo_md import TodoMdParser, format_formula_task, _find_prompt_path
from ..utils.logging_config import get_logger

logger = get_logger(__name__)


# =============================================================================
# FORMULA STORAGE
# =============================================================================

# Default formulas directory (relative to project root)
DEFAULT_FORMULAS_DIR = "ai/formulas"


class FormulaStorage:
    """Manages formula TOML files on disk."""
    
    def __init__(self, base_dir: str = DEFAULT_FORMULAS_DIR):
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)
    
    def list_formulas(self) -> List[Path]:
        """List all TOML files in formulas directory."""
        formulas = []
        for toml_file in self.base_dir.rglob("*.toml"):
            formulas.append(toml_file)
        return sorted(formulas)
    
    def read_toml(self, path: Path) -> Dict[str, Any]:
        """Read and parse a TOML file."""
        with open(path, "rb") as f:
            return tomllib.load(f)
    
    def write_toml(self, path: Path, data: Dict[str, Any]) -> None:
        """Write formula data to TOML file.
        
        Note: tomllib is read-only, so we format manually.
        """
        content = self._format_toml(data)
        path.parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
    
    def _format_toml(self, data: Dict[str, Any]) -> str:
        """Format dict as TOML string."""
        lines = []
        
        # [formula] section
        if "formula" in data:
            lines.append("[formula]")
            for key, value in data["formula"].items():
                lines.append(f'{key} = {self._format_value(value)}')
            lines.append("")
        
        # [vars] section
        if "vars" in data:
            lines.append("[vars]")
            for name, var_def in data["vars"].items():
                var_str = ", ".join(f'{k} = {self._format_value(v)}' for k, v in var_def.items())
                lines.append(f'{name} = {{ {var_str} }}')
            lines.append("")
        
        # [[steps]] array
        if "steps" in data:
            for step in data["steps"]:
                lines.append("[[steps]]")
                for key, value in step.items():
                    lines.append(f'{key} = {self._format_value(value)}')
                lines.append("")
        
        return "\n".join(lines)
    
    def _format_value(self, value: Any) -> str:
        """Format a single value for TOML."""
        if isinstance(value, str):
            return f'"{value}"'
        elif isinstance(value, bool):
            return "true" if value else "false"
        elif isinstance(value, (int, float)):
            return str(value)
        elif isinstance(value, list):
            items = [self._format_value(v) for v in value]
            return f'[{", ".join(items)}]'
        else:
            return f'"{value}"'
    
    def get_formula_path(self, formula_id: str) -> Path:
        """Get path for a formula by ID."""
        # Check direct match first
        direct = self.base_dir / f"{formula_id}.toml"
        if direct.exists():
            return direct
        
        # Check custom folder
        custom = self.base_dir / "custom" / f"{formula_id}.toml"
        if custom.exists():
            return custom
        
        # Search by formula_id in file content
        for path in self.list_formulas():
            try:
                data = self.read_toml(path)
                if data.get("formula", {}).get("formula_id") == formula_id:
                    return path
            except Exception:
                continue
        
        return direct  # Return expected path even if not found


# =============================================================================
# FORMULA PARSER
# =============================================================================

class FormulaParser:
    """Parses TOML formula definitions into Formula models."""
    
    def __init__(self, prompts_dir: str = "ai/prompts"):
        self.prompts_dir = Path(prompts_dir)
    
    def parse_file(self, path: Path) -> Formula:
        """Parse a TOML file into a Formula."""
        with open(path, "rb") as f:
            data = tomllib.load(f)
        
        formula = self.parse_dict(data)
        formula.file_path = str(path)
        return formula
    
    def parse_dict(self, data: Dict[str, Any]) -> Formula:
        """Parse a dict (from TOML) into a Formula."""
        formula_data = data.get("formula", {})
        
        # Parse variables
        variables = []
        for name, var_def in data.get("vars", {}).items():
            variables.append(self._parse_var(name, var_def))
        
        # Parse steps
        steps = []
        for step_data in data.get("steps", []):
            steps.append(self._parse_step(step_data))
        
        return Formula(
            formula_id=formula_data.get("formula_id", formula_data.get("name", "").lower().replace(" ", "-")),
            name=formula_data.get("name", "Unnamed Formula"),
            description=formula_data.get("description", ""),
            version=formula_data.get("version", "1.0"),
            author=formula_data.get("author", "kuroryuu"),
            tags=formula_data.get("tags", []),
            variables=variables,
            steps=steps,
            is_builtin=formula_data.get("builtin", False),
        )
    
    def _parse_var(self, name: str, var_def: Dict[str, Any]) -> FormulaVar:
        """Parse a variable definition."""
        var_type_str = var_def.get("type", "string")
        try:
            var_type = FormulaVarType(var_type_str)
        except ValueError:
            var_type = FormulaVarType.STRING
        
        return FormulaVar(
            name=name,
            var_type=var_type,
            required=var_def.get("required", True),
            default=var_def.get("default"),
            prompt=var_def.get("prompt", f"Enter {name}:"),
            options=var_def.get("options", []),
            description=var_def.get("description", ""),
        )
    
    def _parse_step(self, step_data: Dict[str, Any]) -> FormulaStep:
        """Parse a step definition."""
        return FormulaStep(
            id=step_data.get("id", ""),
            name=step_data.get("name", ""),
            description=step_data.get("description", ""),
            prompt_ref=step_data.get("prompt_ref"),
            inline_prompt=step_data.get("inline_prompt", ""),
            needs=step_data.get("needs", []),
            input_artifacts=step_data.get("input_artifacts", []),
            output_artifact=step_data.get("output_artifact"),
            parallel=step_data.get("parallel", False),
            complexity_hint=step_data.get("complexity_hint", 5),
            optional=step_data.get("optional", False),
            uses_vars=step_data.get("uses_vars", []),
        )
    
    def resolve_prompt(self, prompt_ref: str) -> Optional[str]:
        """Resolve a prompt reference to actual content.
        
        Looks for ai/prompts/{prompt_ref}.md
        """
        path = self.prompts_dir / f"{prompt_ref}.md"
        if path.exists():
            return path.read_text(encoding="utf-8")
        return None
    
    def validate(self, formula: Formula) -> List[str]:
        """Validate a formula, returning list of errors."""
        errors = formula.validate_dag()
        
        # Check prompt refs exist
        for step in formula.steps:
            if step.prompt_ref:
                if not self.resolve_prompt(step.prompt_ref):
                    errors.append(f"Step '{step.id}': prompt_ref '{step.prompt_ref}' not found")
        
        # Check required vars have no default
        for var in formula.variables:
            if var.var_type == FormulaVarType.CHOICE and not var.options:
                errors.append(f"Variable '{var.name}': choice type requires options")
        
        return errors


# =============================================================================
# FORMULA APPLIER
# =============================================================================

class FormulaApplier:
    """Applies a formula by adding tasks to ai/todo.md."""

    def __init__(self, parser: FormulaParser):
        self.parser = parser

    def apply_legacy(
        self,
        formula: Formula,
        variables: Dict[str, Any],
        priority: int = 5,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Task:
        """DEPRECATED: Apply a formula into a Task object.

        Use apply_to_todo() instead, which appends tasks to ai/todo.md.

        1. Validate variables
        2. Create parent Task
        3. Create SubTasks from steps (with dependencies)
        4. Initialize blocked_by lists
        """
        # Validate variables
        errors = self._validate_variables(formula, variables)
        if errors:
            raise ValueError(f"Variable errors: {'; '.join(errors)}")
        
        # Create task title
        title_var = variables.get(formula.variables[0].name, "") if formula.variables else ""
        title = f"{formula.name}: {title_var}" if title_var else formula.name
        
        # Create parent task
        task = Task(
            title=title,
            description=formula.description,
            submitted_by="formula",
            priority=priority,
            metadata=metadata or {},
            formula_id=formula.formula_id,
            formula_vars=variables,
            status=TaskStatus.PENDING,
        )
        
        # Create subtasks from steps
        step_to_subtask_id: Dict[str, str] = {}
        
        for step in formula.steps:
            subtask = self._create_subtask(step, formula, variables)
            task.subtasks.append(subtask)
            step_to_subtask_id[step.id] = subtask.subtask_id
        
        # Resolve dependencies (convert step IDs to subtask IDs)
        for subtask in task.subtasks:
            if subtask.needs:
                resolved_needs = []
                for step_id in subtask.needs:
                    if step_id in step_to_subtask_id:
                        resolved_needs.append(step_to_subtask_id[step_id])
                subtask.needs = resolved_needs
                subtask.blocked_by = resolved_needs.copy()  # Start fully blocked
        
        task.status = TaskStatus.IN_PROGRESS
        task.started_at = datetime.utcnow()
        
        return task
    
    def _validate_variables(
        self,
        formula: Formula,
        variables: Dict[str, Any],
    ) -> List[str]:
        """Validate provided variables against formula definition."""
        errors = []
        
        for var in formula.variables:
            value = variables.get(var.name)
            
            # Check required
            if var.required and value is None and var.default is None:
                errors.append(f"Missing required variable: {var.name}")
                continue
            
            # Use default if not provided
            if value is None:
                value = var.default
                variables[var.name] = value
            
            # Check choice options
            if var.var_type == FormulaVarType.CHOICE:
                if value and str(value) not in var.options:
                    errors.append(f"Variable '{var.name}': '{value}' not in options {var.options}")
        
        return errors
    
    def _create_subtask(
        self,
        step: FormulaStep,
        formula: Formula,
        variables: Dict[str, Any],
    ) -> SubTask:
        """Create a SubTask from a FormulaStep."""
        # Build description with variable interpolation
        description = step.description or step.name
        description = self._interpolate(description, variables)
        
        # Load prompt content
        prompt_content = ""
        if step.prompt_ref:
            prompt_content = self.parser.resolve_prompt(step.prompt_ref) or ""
            prompt_content = self._interpolate(prompt_content, variables)
        elif step.inline_prompt:
            prompt_content = self._interpolate(step.inline_prompt, variables)
        
        # Append prompt to description
        if prompt_content:
            description = f"{description}\n\n---\n\n{prompt_content}"
        
        return SubTask(
            title=self._interpolate(step.name, variables),
            description=description,
            status=TaskStatus.PENDING,
            needs=step.needs.copy(),  # Will be resolved to subtask IDs later
            prompt_ref=step.prompt_ref,
            formula_step_id=step.id,
            input_artifacts=step.input_artifacts.copy(),
            output_artifact=step.output_artifact,
            complexity_score=step.complexity_hint,
            max_iterations=SubTask.calculate_max_iterations(step.complexity_hint),
        )
    
    def _interpolate(self, text: str, variables: Dict[str, Any]) -> str:
        """Interpolate {{var}} placeholders in text."""
        if not text:
            return text

        def replace(match):
            var_name = match.group(1).strip()
            return str(variables.get(var_name, match.group(0)))

        return re.sub(r'\{\{(\w+)\}\}', replace, text)

    def apply_to_todo(
        self,
        formula: Formula,
        variables: Dict[str, Any],
        todo_parser: Optional[TodoMdParser] = None,
    ) -> List[str]:
        """Apply a formula by appending tasks to ai/todo.md.

        This is the preferred method for applying formulas.
        It adds markdown checkbox items to the Backlog section of todo.md.

        Args:
            formula: The formula to apply
            variables: User-provided variable values
            todo_parser: Optional TodoMdParser instance

        Returns:
            List of task IDs that were added (e.g., ["T500", "T501"])

        Raises:
            ValueError: If variable validation fails
        """
        # Validate variables
        errors = self._validate_variables(formula, variables)
        if errors:
            raise ValueError(f"Variable errors: {'; '.join(errors)}")

        # Initialize parser
        if todo_parser is None:
            todo_parser = TodoMdParser()

        # Get feature name for grouping (from first variable or formula name)
        feature_name = ""
        if formula.variables:
            first_var = formula.variables[0].name
            feature_name = str(variables.get(first_var, ""))
        if not feature_name:
            feature_name = formula.name

        # Get next task IDs
        task_ids = todo_parser.get_next_task_ids(len(formula.steps))

        # Sort steps by dependency order (topological sort)
        sorted_steps = self._topological_sort(formula.steps)

        # Build task lines
        task_lines = []
        for i, step in enumerate(sorted_steps):
            task_id = task_ids[i]

            # Get step name with variable interpolation
            step_name = self._interpolate(step.name, variables)

            # Get description (first line only, interpolated)
            description = step.description or ""
            description = self._interpolate(description, variables)
            if '\n' in description:
                description = description.split('\n')[0]

            # Get prompt path
            prompt_ref = None
            if step.prompt_ref:
                # Find the actual prompt file path
                found_path = _find_prompt_path(step.prompt_ref)
                prompt_ref = found_path if found_path else f"ai/prompts/{step.prompt_ref}.md"

            # Format the task line
            task_line = format_formula_task(
                task_id=task_id,
                feature_name=feature_name,
                step_name=step_name,
                prompt_ref=prompt_ref,
                description=description,
                assignee="@agent",
            )
            task_lines.append(task_line)

        # Append to Backlog
        added_ids = todo_parser.append_to_backlog(task_lines)

        logger.info(
            f"Applied formula '{formula.name}' -> {len(added_ids)} tasks in todo.md: {added_ids}"
        )

        return added_ids

    def _topological_sort(self, steps: List[FormulaStep]) -> List[FormulaStep]:
        """Sort steps by dependency order.

        Steps with no dependencies come first, then steps that depend
        only on earlier steps.

        Args:
            steps: List of formula steps

        Returns:
            Topologically sorted list of steps
        """
        # Build dependency graph
        step_map = {s.id: s for s in steps}
        in_degree = {s.id: len(s.needs) for s in steps}

        # Find steps with no dependencies
        queue = [s for s in steps if not s.needs]
        result = []

        while queue:
            step = queue.pop(0)
            result.append(step)

            # Reduce in-degree for dependent steps
            for other in steps:
                if step.id in other.needs:
                    in_degree[other.id] -= 1
                    if in_degree[other.id] == 0:
                        queue.append(other)

        # If we couldn't sort all steps, there's a cycle - just return original order
        if len(result) != len(steps):
            logger.warning(
                f"Could not topologically sort steps (possible cycle), using original order"
            )
            return steps

        return result


# =============================================================================
# FORMULA SERVICE
# =============================================================================

class FormulaService:
    """High-level service for formula operations."""
    
    def __init__(
        self,
        formulas_dir: str = DEFAULT_FORMULAS_DIR,
        prompts_dir: str = "ai/prompts",
    ):
        self.storage = FormulaStorage(formulas_dir)
        self.parser = FormulaParser(prompts_dir)
        self.applier = FormulaApplier(self.parser)
    
    def list_formulas(self) -> List[Formula]:
        """List all available formulas."""
        formulas = []
        for path in self.storage.list_formulas():
            try:
                formula = self.parser.parse_file(path)
                formulas.append(formula)
            except Exception as e:
                # Log but continue
                logger.error(f"Error loading {path}: {e}")
        return formulas
    
    def get_formula(self, formula_id: str) -> Optional[Formula]:
        """Get a formula by ID."""
        path = self.storage.get_formula_path(formula_id)
        if path.exists():
            return self.parser.parse_file(path)
        return None
    
    def save_formula(self, formula: Formula) -> Path:
        """Save a formula to disk."""
        # Convert to TOML-compatible dict
        data = self._formula_to_dict(formula)
        
        # Determine path
        if formula.file_path:
            path = Path(formula.file_path)
        else:
            subdir = "" if formula.is_builtin else "custom"
            filename = f"{formula.formula_id}.toml"
            path = self.storage.base_dir / subdir / filename if subdir else self.storage.base_dir / filename
        
        self.storage.write_toml(path, data)
        return path
    
    def delete_formula(self, formula_id: str) -> bool:
        """Delete a formula by ID."""
        path = self.storage.get_formula_path(formula_id)
        if path.exists():
            path.unlink()
            return True
        return False
    
    def apply_formula_legacy(
        self,
        formula_id: str,
        variables: Dict[str, Any],
        priority: int = 5,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> Task:
        """DEPRECATED: Apply a formula by ID (legacy - creates Task objects).

        Use apply_formula_to_todo() instead, which appends
        tasks to ai/todo.md where agents actually read from.
        """
        formula = self.get_formula(formula_id)
        if not formula:
            raise ValueError(f"Formula not found: {formula_id}")

        return self.applier.apply_legacy(formula, variables, priority, metadata)

    def apply_formula_to_todo(
        self,
        formula_id: str,
        variables: Dict[str, Any],
    ) -> List[str]:
        """Apply a formula by appending tasks to ai/todo.md.

        This is the preferred method for applying formulas. It adds
        tasks to the Backlog section of ai/todo.md, which is the
        source of truth that Leaders and Workers read from.

        Args:
            formula_id: The formula ID to cook
            variables: User-provided variable values

        Returns:
            List of task IDs that were added (e.g., ["T500", "T501"])

        Raises:
            ValueError: If formula not found or variable validation fails
        """
        formula = self.get_formula(formula_id)
        if not formula:
            raise ValueError(f"Formula not found: {formula_id}")

        todo_parser = TodoMdParser()
        return self.applier.apply_to_todo(formula, variables, todo_parser)
    
    def validate_formula(self, formula: Formula) -> List[str]:
        """Validate a formula."""
        return self.parser.validate(formula)
    
    def _formula_to_dict(self, formula: Formula) -> Dict[str, Any]:
        """Convert Formula model to TOML-compatible dict."""
        data = {
            "formula": {
                "formula_id": formula.formula_id,
                "name": formula.name,
                "description": formula.description,
                "version": formula.version,
                "author": formula.author,
                "tags": formula.tags,
                "builtin": formula.is_builtin,
            },
            "vars": {},
            "steps": [],
        }
        
        for var in formula.variables:
            var_def = {
                "type": var.var_type.value,
                "required": var.required,
                "prompt": var.prompt,
            }
            if var.default is not None:
                var_def["default"] = var.default
            if var.options:
                var_def["options"] = var.options
            if var.description:
                var_def["description"] = var.description
            data["vars"][var.name] = var_def
        
        for step in formula.steps:
            step_dict = {
                "id": step.id,
                "name": step.name,
            }
            if step.description:
                step_dict["description"] = step.description
            if step.prompt_ref:
                step_dict["prompt_ref"] = step.prompt_ref
            if step.inline_prompt:
                step_dict["inline_prompt"] = step.inline_prompt
            if step.needs:
                step_dict["needs"] = step.needs
            if step.input_artifacts:
                step_dict["input_artifacts"] = step.input_artifacts
            if step.output_artifact:
                step_dict["output_artifact"] = step.output_artifact
            if step.parallel:
                step_dict["parallel"] = step.parallel
            if step.complexity_hint != 5:
                step_dict["complexity_hint"] = step.complexity_hint
            if step.optional:
                step_dict["optional"] = step.optional
            if step.uses_vars:
                step_dict["uses_vars"] = step.uses_vars
            data["steps"].append(step_dict)
        
        return data
