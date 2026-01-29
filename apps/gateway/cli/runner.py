"""
Agent runner - executes a task using the Gateway harness.
Outputs phase markers for UI parsing.

Uses provider-specific prompt builders for optimal tool formatting.
"""
import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional, Any, List

from ..llm.harness import AgentHarness, ToolCall, ToolResult
from ..llm.backends import LLMConfig, LLMMessage, LLMToolSchema, get_backend
from ..prompts import get_prompt_builder, PromptContext, ToolDefinition


class AgentRunner:
    """Runs an agent on a specific task with phase markers for UI."""
    
    PHASES = ['BOOT', 'PLAN', 'EXECUTE', 'REVIEW', 'VALIDATE', 'DONE']
    
    def __init__(
        self,
        task_id: str,
        thread_id: Optional[str] = None,
        backend: str = 'lmstudio',
        max_turns: int = 20,
        project_root: Path = Path('.'),
        verbose: bool = False
    ):
        self.task_id = task_id
        self.thread_id = thread_id or f"agent_{uuid.uuid4().hex[:8]}"
        self.backend_name = backend
        self.max_turns = max_turns
        self.project_root = project_root
        self.verbose = verbose
        
        self.todo_path = project_root / 'ai' / 'todo.md'
        self.convo_dir = project_root / 'WORKING' / 'convos' / self.thread_id
        
    def _phase(self, phase: str, detail: str = ''):
        """Output phase marker for UI parsing."""
        msg = f"[PHASE] {phase}"
        if detail:
            msg += f" | {detail}"
        print(msg, flush=True)
        
    def _tool_marker(self, event: str, name: str, tool_id: str, status: str = ''):
        """Output tool marker for UI parsing."""
        msg = f"[TOOL] {event} {name} {tool_id}"
        if status:
            msg += f" {status}"
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
        
        # Simple parse - find task line
        for line in content.split('\n'):
            if self.task_id in line:
                # Extract title after "T001: " or "T001 — "
                if ':' in line:
                    title = line.split(':', 1)[1].strip()
                elif '—' in line:
                    title = line.split('—', 1)[1].strip()
                else:
                    title = line
                # Remove @assignee and #tags and (owner:...) (status:...)
                title = title.split('@')[0].split('#')[0]
                title = title.split('(owner')[0].split('(status')[0].strip()
                return {'id': self.task_id, 'title': title, 'raw': line}
                    
        raise ValueError(f"Task {self.task_id} not found in {self.todo_path}")
            
    async def _save_conversation(self, messages: list):
        """Save conversation to disk."""
        self.convo_dir.mkdir(parents=True, exist_ok=True)
        ts = datetime.now().strftime('%Y%m%d_%H%M%S')
        convo_file = self.convo_dir / f"convo_{ts}.json"
        
        # Convert LLMMessage to dict for serialization
        serializable = []
        for msg in messages:
            if hasattr(msg, '__dict__'):
                serializable.append({
                    'role': msg.role,
                    'content': msg.content
                })
            else:
                serializable.append(msg)
        
        convo_file.write_text(json.dumps({
            'task_id': self.task_id,
            'thread_id': self.thread_id,
            'backend': self.backend_name,
            'timestamp': ts,
            'messages': serializable
        }, indent=2), encoding='utf-8')
        
        self._log(f"Saved conversation to {convo_file}")
        
    async def run(self):
        """Execute the agent run."""
        # BOOT
        self._phase('BOOT', f'task={self.task_id} thread={self.thread_id} backend={self.backend_name}')
        
        task = await self._load_task()
        self._log(f"Loaded task: {task['title']}")
        
        # Create basic tools - read/write file
        tools: List[LLMToolSchema] = [
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
        
        async def tool_executor(name: str, args: dict) -> str:
            """Execute a tool and return result."""
            tool_id = f"{name}_{uuid.uuid4().hex[:6]}"
            self._tool_marker('start', name, tool_id)
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
                self._tool_marker('end', name, tool_id, 'ok')
                return result
            except Exception as e:
                self._tool_marker('end', name, tool_id, 'error')
                return f"Error: {e}"
        
        backend = get_backend(self.backend_name)
        harness = AgentHarness(
            backend=backend, 
            tool_executor=tool_executor,
            max_tool_calls=self.max_turns
        )
        
        # PLAN
        self._phase('PLAN', task['title'])
        
        # Convert tools to ToolDefinition format for prompt builder
        tool_definitions = [
            ToolDefinition(
                name=t.name,
                description=t.description,
                parameters=t.parameters,
            )
            for t in tools
        ]
        
        # Build provider-specific prompt context
        prompt_context = PromptContext(
            cwd=str(self.project_root),
            workspace_name=self.project_root.name,
            model_id=self.backend_name,
            session_id=self.thread_id,
        )
        
        # Get provider-specific prompt builder
        try:
            prompt_builder = get_prompt_builder(self.backend_name)
            system_prompt = prompt_builder.build_system_prompt(tool_definitions, prompt_context)
            self._log(f"Using {prompt_builder.provider_name} prompt builder (XML tools: {prompt_builder.uses_xml_tools})")
        except ValueError:
            # Fallback to simple prompt if provider not found
            self._log(f"No prompt builder for {self.backend_name}, using fallback")
            system_prompt = f"""You are a coding agent working on task {self.task_id}.

Task: {task['title']}

Project root: {self.project_root}

Instructions:
1. Analyze what needs to be done
2. Use available tools to complete the task
3. Write clear code with comments
4. Test your changes if possible
5. Report completion status

Available tools will be provided. Use them to read files, write code, and verify results."""

        # Build messages
        messages = [
            LLMMessage(role="system", content=system_prompt),
            LLMMessage(role="user", content=f"Please complete task {self.task_id}: {task['title']}\n\nProject root: {self.project_root}")
        ]
        
        # Config
        config = LLMConfig(
            model=None,  # Use backend default
            tools=tools,
            max_tokens=4096,
            temperature=0.7
        )
        
        # EXECUTE
        self._phase('EXECUTE')
        
        final_response = ""
        turns = 0
        
        async for event in harness.run(messages, config):
            if event.type == "text_delta":
                final_response += event.data
            elif event.type == "tool_start":
                tool_call: ToolCall = event.data
                self._log(f"Tool: {tool_call.name}({tool_call.arguments})")
            elif event.type == "tool_end":
                tool_result: ToolResult = event.data
                self._log(f"Result: {tool_result.content[:100]}...")
                turns += 1
            elif event.type == "done":
                break
            elif event.type == "error":
                self._log(f"Error: {event.data}")
                break
        
        # REVIEW
        self._phase('REVIEW')
        self._log(f"Completed in {turns} tool calls")
        
        # Save artifacts
        await self._save_conversation(messages)

        # VALIDATE
        self._phase('VALIDATE', f"turns={turns}")
        
        # DONE
        self._phase('DONE', 'success' if final_response else 'incomplete')
        
        # Print final response
        print('\n' + '='*60)
        print('AGENT RESPONSE:')
        print('='*60)
        print(final_response or "(no response)")

