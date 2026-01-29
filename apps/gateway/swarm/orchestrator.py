"""Swarm orchestrator - coordinates multiple agents in a pipeline."""
import asyncio
import json
from datetime import datetime
from pathlib import Path
from typing import Callable, Optional, List

from ..llm.backends import LLMConfig, LLMMessage, LLMToolSchema, get_backend
from ..llm.harness import AgentHarness
from .roles import ROLES, SWARM_SEQUENCE


class SwarmOrchestrator:
    """Orchestrates a 3-agent swarm: Planner → Coder → Reviewer."""
    
    def __init__(
        self,
        task_id: str,
        project_root: Path,
        backend: str = 'lmstudio',
        max_turns_per_agent: int = 15,
        on_phase: Optional[Callable[[str, str, str], None]] = None,
        verbose: bool = True
    ):
        self.task_id = task_id
        self.project_root = Path(project_root).resolve()
        self.backend_name = backend
        self.max_turns_per_agent = max_turns_per_agent
        self.on_phase = on_phase or (lambda *_: None)
        self.verbose = verbose
        
        self.swarm_id = f"swarm_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        self.artifact_dir = self.project_root / 'WORKING' / 'swarms' / self.swarm_id
        self.todo_path = self.project_root / 'ai' / 'todo.md'
        
    def _emit(self, role: str, phase: str, detail: str = ''):
        """Emit phase event."""
        self.on_phase(role, phase, detail)
        msg = f"[SWARM] {role.upper()} | {phase}"
        if detail:
            msg += f" | {detail}"
        print(msg, flush=True)
        
    def _log(self, msg: str):
        """Verbose logging."""
        if self.verbose:
            print(f"[LOG] {msg}", flush=True)
            
    async def _load_task(self) -> dict:
        """Load task details from todo.md."""
        if not self.todo_path.exists():
            raise FileNotFoundError(f"Todo file not found: {self.todo_path}")
            
        content = self.todo_path.read_text(encoding='utf-8')
        
        for line in content.split('\n'):
            if self.task_id in line:
                # Extract title - handle both "T001: title" and "T001 — title" formats
                if '—' in line:
                    title = line.split('—', 1)[1].strip()
                elif ':' in line and self.task_id in line.split(':')[0]:
                    title = line.split(':', 1)[1].strip()
                else:
                    title = line
                # Clean up - remove metadata
                import re
                title = re.sub(r'\(owner:[^)]*\)', '', title)
                title = re.sub(r'\(status:[^)]*\)', '', title)
                title = title.split('@')[0].split('#')[0].strip()
                return {'id': self.task_id, 'title': title, 'raw': line}
                    
        raise ValueError(f"Task {self.task_id} not found in {self.todo_path}")
        
    def _get_tools(self) -> List[LLMToolSchema]:
        """Get tool definitions for agents that use tools."""
        return [
            LLMToolSchema(
                name="read_file",
                description="Read the contents of a file",
                parameters={
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "File path to read"}
                    },
                    "required": ["path"]
                }
            ),
            LLMToolSchema(
                name="write_file",
                description="Write content to a file",
                parameters={
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "File path to write"},
                        "content": {"type": "string", "description": "Content to write"}
                    },
                    "required": ["path", "content"]
                }
            ),
            LLMToolSchema(
                name="list_files",
                description="List files in a directory",
                parameters={
                    "type": "object",
                    "properties": {
                        "path": {"type": "string", "description": "Directory path"}
                    },
                    "required": ["path"]
                }
            )
        ]
        
    async def _tool_executor(self, name: str, args: dict) -> str:
        """Execute a tool and return result."""
        import uuid
        tool_id = f"{name}_{uuid.uuid4().hex[:6]}"
        print(f"[TOOL] start {name} {tool_id}", flush=True)
        
        try:
            if name == "read_file":
                file_path = Path(args["path"])
                if not file_path.is_absolute():
                    file_path = self.project_root / file_path
                if file_path.exists():
                    result = file_path.read_text(encoding='utf-8')[:10000]
                else:
                    result = f"Error: File not found: {file_path}"
            elif name == "write_file":
                file_path = Path(args["path"])
                if not file_path.is_absolute():
                    file_path = self.project_root / file_path
                file_path.parent.mkdir(parents=True, exist_ok=True)
                file_path.write_text(args["content"], encoding='utf-8')
                result = f"Written {len(args['content'])} bytes to {file_path}"
            elif name == "list_files":
                dir_path = Path(args["path"])
                if not dir_path.is_absolute():
                    dir_path = self.project_root / dir_path
                if dir_path.exists() and dir_path.is_dir():
                    files = [f.name + ('/' if f.is_dir() else '') for f in dir_path.iterdir()]
                    result = '\n'.join(files[:100])
                else:
                    result = f"Error: Directory not found: {dir_path}"
            else:
                result = f"Error: Unknown tool: {name}"
            print(f"[TOOL] end {name} {tool_id} ok", flush=True)
            return result
        except Exception as e:
            print(f"[TOOL] end {name} {tool_id} error", flush=True)
            return f"Error: {e}"
        
    async def _run_agent(self, role: str, context: str, task: dict) -> str:
        """Run a single agent with role-specific configuration."""
        role_config = ROLES[role]
        
        self._emit(role, 'START', task['id'])
        
        backend = get_backend(self.backend_name)
        
        # Build system prompt
        system_prompt = f"""{role_config['system']}

Project root: {self.project_root}
Task ID: {task['id']}
Task: {task['title']}
"""
        
        # Build messages
        messages = [
            LLMMessage(role="system", content=system_prompt),
            LLMMessage(role="user", content=context)
        ]
        
        # Configure based on role
        tools = self._get_tools() if role_config['tools_enabled'] else []
        config = LLMConfig(
            model=None,
            tools=tools,
            max_tokens=4096,
            temperature=0.5 if role == 'reviewer' else 0.7
        )
        
        # Run harness
        harness = AgentHarness(
            backend=backend,
            tool_executor=self._tool_executor,
            max_tool_calls=self.max_turns_per_agent
        )
        
        final_response = ""
        turns = 0
        
        try:
            async for event in harness.run(messages, config):
                if event.type == "text_delta":
                    final_response += event.data
                elif event.type == "tool_end":
                    turns += 1
                elif event.type == "done":
                    break
                elif event.type == "error":
                    self._log(f"Error: {event.data}")
                    break
        except Exception as e:
            self._log(f"Agent error: {e}")
            final_response = f"Error during execution: {e}"
        
        # Save artifact
        artifact_path = self.artifact_dir / role_config['artifact']
        artifact_path.parent.mkdir(parents=True, exist_ok=True)
        artifact_path.write_text(final_response, encoding='utf-8')
        
        self._emit(role, 'DONE', f"turns={turns} artifact={artifact_path.name}")
        
        return final_response
        
    async def run(self) -> dict:
        """Execute the full swarm pipeline."""
        self.artifact_dir.mkdir(parents=True, exist_ok=True)
        
        print(f"\n{'='*60}", flush=True)
        print(f"[SWARM] Starting {self.swarm_id} for task {self.task_id}", flush=True)
        print(f"{'='*60}\n", flush=True)
        
        # Load task
        task = await self._load_task()
        self._log(f"Task: {task['title']}")
        
        results = {}
        
        # Phase 1: Planner
        plan = await self._run_agent(
            'planner',
            f"Please create a detailed implementation plan for this task:\n\n{task['raw']}",
            task
        )
        results['plan'] = plan
        
        # Phase 2: Coder (with plan context)
        changes = await self._run_agent(
            'coder',
            f"Implement the following task according to this plan:\n\nTask: {task['raw']}\n\nPlan:\n{plan}",
            task
        )
        results['changes'] = changes
        
        # Phase 3: Reviewer (with plan + changes)
        review = await self._run_agent(
            'reviewer',
            f"""Review the following implementation:

Task: {task['raw']}

Plan:
{plan}

Implementation:
{changes}

Provide your review and verdict (APPROVED or CHANGES_REQUESTED).""",
            task
        )
        results['review'] = review
        
        # Determine approval status
        approved = 'APPROVED' in review.upper()
        
        # Build summary
        summary = {
            'swarm_id': self.swarm_id,
            'task_id': self.task_id,
            'task_title': task['title'],
            'backend': self.backend_name,
            'timestamp': datetime.now().isoformat(),
            'artifacts': {
                'plan': str(self.artifact_dir / 'plan.md'),
                'changes': str(self.artifact_dir / 'changes.diff'),
                'review': str(self.artifact_dir / 'review.md')
            },
            'approved': approved
        }
        
        # Save summary
        summary_path = self.artifact_dir / 'summary.json'
        summary_path.write_text(json.dumps(summary, indent=2), encoding='utf-8')
        
        print(f"\n{'='*60}", flush=True)
        print(f"[SWARM] Complete", flush=True)
        print(f"  Swarm ID: {self.swarm_id}", flush=True)
        print(f"  Task: {self.task_id}", flush=True)
        print(f"  Approved: {approved}", flush=True)
        print(f"  Artifacts: {self.artifact_dir}", flush=True)
        print(f"{'='*60}\n", flush=True)
        
        return summary
