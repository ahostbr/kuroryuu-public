"""LM Studio Prompt Builder - Native and XML tool formats.

Supports two modes:
1. Native mode (default for Devstral/Qwen/Llama-3): Uses OpenAI-compatible tool
   calling API with minimal system prompt (~150 tokens)
2. XML mode (fallback): Cline-style XML tool format embedded in system prompt

Native mode is preferred when the model supports it, reducing token usage by ~84%.
"""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional, Union

from .base import PromptBuilder, PromptContext, ToolDefinition


class LMStudioPromptBuilder(PromptBuilder):
    """Builds prompts for LM Studio - native or XML format.

    Supports two modes:
    - Native mode: Minimal system prompt, tools via API (set context.extra["use_native_tools"] = True)
    - XML mode: Full XML tool documentation in system prompt (default)
    """

    def __init__(self) -> None:
        self._native_mode = False

    @property
    def provider_name(self) -> str:
        return "lmstudio"

    @property
    def uses_xml_tools(self) -> bool:
        # Returns False when native mode is active
        return not self._native_mode

    def is_native_mode(self, context: PromptContext) -> bool:
        """Check if native tool mode is requested.

        Defaults to True since most modern LMStudio models (Devstral, Qwen, Llama-3)
        support native OpenAI-compatible tool calling.
        """
        return context.extra.get("use_native_tools", True)
    
    def build_system_prompt(
        self,
        tools: List[ToolDefinition],
        context: PromptContext,
    ) -> str:
        """Build system prompt - minimal for native mode, full for XML mode."""
        self._native_mode = self.is_native_mode(context)

        if self._native_mode:
            # Minimal prompt for native tool calling (~150 tokens)
            return self._build_native_system_prompt(context)

        # Full XML mode prompt (~2000+ tokens)
        sections = [
            self._build_kuroryuu_laws_section(context),
            self._build_identity_section(context),
            self._build_tool_use_section(),
            self._build_tools_section(tools, context),
            self._build_rules_section(context),
            self._build_workflow_section(),
        ]

        return "\n\n".join(s for s in sections if s)

    def _build_native_system_prompt(self, context: PromptContext) -> str:
        """Build minimal system prompt for native tool calling mode."""
        cwd = context.cwd or "."
        return f"""You are Kuroryuu, an autonomous coding agent. Use the provided tools to accomplish tasks.

Working directory: {cwd}

Guidelines:
- Read files before modifying them
- Verify changes after making them
- Explain your reasoning briefly
- Ask for clarification when needed"""
    
    def _build_kuroryuu_laws_section(self, context: PromptContext) -> str:
        """Load KURORYUU_BOOTSTRAP.md from project root."""
        from pathlib import Path
        bootstrap_path = Path(context.cwd or ".") / "KURORYUU_BOOTSTRAP.md"
        if not bootstrap_path.exists():
            bootstrap_path = Path(__file__).parent.parent.parent.parent.parent / "KURORYUU_BOOTSTRAP.md"
        if bootstrap_path.exists():
            try:
                return bootstrap_path.read_text(encoding="utf-8")
            except Exception:
                pass
        return ""
    
    def render_tools(
        self,
        tools: List[ToolDefinition],
        context: PromptContext,
    ) -> Any:
        """Render tools - native schemas or XML documentation."""
        if not tools:
            return [] if self.is_native_mode(context) else ""

        if self.is_native_mode(context):
            # Return OpenAI-compatible tool schemas for API payload
            return [
                {
                    "type": "function",
                    "function": {
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": tool.parameters,
                    },
                }
                for tool in tools
            ]

        # XML documentation for system prompt
        tool_docs = []
        for tool in tools:
            tool_docs.append(self._render_single_tool(tool, context))

        return "\n\n".join(tool_docs)
    
    def render_tool_result(
        self,
        tool_name: str,
        result: Any,
        is_error: bool = False,
    ) -> str:
        """Render tool result for conversation."""
        if is_error:
            return f"<tool_error>\n<name>{tool_name}</name>\n<error>{result}</error>\n</tool_error>"
        
        # Format result based on type
        if isinstance(result, dict):
            result_str = json.dumps(result, indent=2)
        elif isinstance(result, list):
            result_str = json.dumps(result, indent=2)
        else:
            result_str = str(result)
        
        return f"<tool_result>\n<name>{tool_name}</name>\n<output>{result_str}</output>\n</tool_result>"
    
    # ═══════════════════════════════════════════════════════════════════════════
    # Section Builders
    # ═══════════════════════════════════════════════════════════════════════════
    
    def _build_identity_section(self, context: PromptContext) -> str:
        """Build the identity/role section."""
        return """You are Kuroryuu, a highly skilled software engineer with extensive knowledge in many programming languages, frameworks, design patterns, and best practices.

You are an autonomous coding agent that uses tools to accomplish tasks. You think carefully before acting, always verify your work, and communicate clearly about your progress."""
    
    def _build_tool_use_section(self) -> str:
        """Build the tool use formatting instructions."""
        return """TOOL USE

You have access to a set of tools that are executed upon the user's approval. You can use one tool per message, and will receive the result of that tool use in the user's response. You use tools step-by-step to accomplish a given task, with each tool use informed by the result of the previous tool use.

# Tool Use Formatting

Tool use is formatted using XML-style tags. The tool name is enclosed in opening and closing tags, and each parameter is similarly enclosed within its own set of tags. Here's the structure:

<tool_name>
<parameter1_name>value1</parameter1_name>
<parameter2_name>value2</parameter2_name>
...
</tool_name>

For example:

<read_file>
<path>src/main.py</path>
</read_file>

Always adhere to this format for the tool use to ensure proper parsing and execution."""
    
    def _build_tools_section(
        self,
        tools: List[ToolDefinition],
        context: PromptContext,
    ) -> str:
        """Build the tools documentation section."""
        if not tools:
            return "# Tools\n\nNo tools are currently available."
        
        tools_doc = self.render_tools(tools, context)
        return f"# Tools\n\n{tools_doc}"
    
    def _build_rules_section(self, context: PromptContext) -> str:
        """Build the rules and constraints section."""
        cwd_info = f"Current working directory: {context.cwd}" if context.cwd else ""
        
        return f"""# Rules

1. Tool Use Guidelines:
   - Always use tools to gather information before making changes
   - One tool use per message
   - Wait for tool results before proceeding
   - Verify changes after making them

2. File Operations:
   - Always read files before modifying them
   - Use relative paths from the working directory
   - Create parent directories as needed
   {cwd_info}

3. Communication:
   - Explain what you're doing and why
   - Ask for clarification when requirements are unclear
   - Report errors and propose solutions

4. Quality:
   - Write clean, well-documented code
   - Follow existing patterns in the codebase
   - Test changes when possible"""
    
    def _build_workflow_section(self) -> str:
        """Build the workflow guidance section."""
        return """# Workflow

1. UNDERSTAND: Read the user's request carefully
2. PLAN: Break complex tasks into steps
3. GATHER: Use tools to understand the current state
4. EXECUTE: Make changes one step at a time
5. VERIFY: Check that changes work as expected
6. REPORT: Summarize what was done

Always think step-by-step and verify your work."""
    
    # ═══════════════════════════════════════════════════════════════════════════
    # Tool Rendering
    # ═══════════════════════════════════════════════════════════════════════════
    
    def _render_single_tool(
        self,
        tool: ToolDefinition,
        context: PromptContext,
    ) -> str:
        """Render a single tool in Cline XML documentation format.

        Special handling for routed tools (those with action parameter enum).
        """
        # Check if this is a routed tool
        if tool.is_routed_tool():
            return self._render_routed_tool(tool, context)

        # Normal tool rendering
        lines = [f"## {tool.name}"]

        # Description
        if tool.description:
            desc = tool.description
            # Replace context placeholders
            if context.cwd:
                desc = desc.replace("{{CWD}}", context.cwd)
            lines.append(f"Description: {desc}")

        # Parameters
        params = self._get_tool_parameters(tool)
        if params:
            lines.append("Parameters:")
            for param in params:
                required = "(required)" if param["required"] else "(optional)"
                desc = param.get("description", "")
                lines.append(f"- {param['name']}: {required} {desc}")

        # Usage example
        usage = self._build_usage_example(tool, params)
        lines.append("Usage:")
        lines.append(usage)

        return "\n".join(lines)

    def _render_routed_tool(
        self,
        tool: ToolDefinition,
        context: PromptContext,
    ) -> str:
        """Render a routed tool with action documentation."""
        lines = [f"## {tool.name}"]

        # Description
        if tool.description:
            desc = tool.description
            if context.cwd:
                desc = desc.replace("{{CWD}}", context.cwd)
            lines.append(f"Description: {desc}")

        # Get available actions
        actions = tool.get_routed_actions()
        if actions:
            lines.append("Available Actions:")
            for action in actions:
                lines.append(f"- {action}")

        # Parameters (excluding action, since it's documented above)
        params = self._get_tool_parameters(tool)
        action_param_idx = next(
            (i for i, p in enumerate(params) if p["name"] == "action"),
            -1
        )
        if action_param_idx >= 0:
            params.pop(action_param_idx)

        if params:
            lines.append("Parameters:")
            for param in params:
                required = "(required)" if param["required"] else "(optional)"
                desc = param.get("description", "")
                lines.append(f"- {param['name']}: {required} {desc}")

        # Usage examples for main actions
        lines.append("Usage Examples:")
        for action in actions[:3]:  # Show first 3 actions
            if action == "help":
                continue  # Skip help action in examples
            example = f"<{tool.name}>\n<action>{action}</action>"

            # Add relevant parameter examples based on action
            for param in params:
                if param.get("required") or action in param.get("description", "").lower():
                    example_value = self._get_example_value(param)
                    example += f"\n<{param['name']}>{example_value}</{param['name']}>"

            example += f"\n</{tool.name}>"
            lines.append(example)

        return "\n".join(lines)
    
    def _get_tool_parameters(self, tool: ToolDefinition) -> List[Dict[str, Any]]:
        """Extract parameter info from tool schema."""
        params = []
        schema = tool.parameters
        
        properties = schema.get("properties", {})
        required = set(schema.get("required", []))
        
        for name, prop_schema in properties.items():
            param = {
                "name": name,
                "required": name in required,
                "type": prop_schema.get("type", "string"),
                "description": prop_schema.get("description", ""),
            }
            
            if "enum" in prop_schema:
                param["enum"] = prop_schema["enum"]
            if "default" in prop_schema:
                param["default"] = prop_schema["default"]
            
            params.append(param)
        
        # Sort: required first, then alphabetically
        params.sort(key=lambda p: (not p["required"], p["name"]))
        
        return params
    
    def _build_usage_example(
        self,
        tool: ToolDefinition,
        params: List[Dict[str, Any]],
    ) -> str:
        """Build XML usage example for a tool."""
        lines = [f"<{tool.name}>"]
        
        for param in params:
            example_value = self._get_example_value(param)
            lines.append(f"<{param['name']}>{example_value}</{param['name']}>")
        
        lines.append(f"</{tool.name}>")
        
        return "\n".join(lines)
    
    def _get_example_value(self, param: Dict[str, Any]) -> str:
        """Get an example value for a parameter."""
        # Use default if available
        if "default" in param:
            return str(param["default"])
        
        # Use first enum value if available
        if "enum" in param and param["enum"]:
            return str(param["enum"][0])
        
        # Generate based on type and name
        name = param["name"]
        param_type = param["type"]
        
        if param_type == "boolean":
            return "true"
        elif param_type == "integer":
            return "10"
        elif param_type == "number":
            return "1.0"
        elif param_type == "array":
            return "[]"
        elif param_type == "object":
            return "{}"
        elif "path" in name.lower():
            return "path/to/file"
        elif "query" in name.lower():
            return "search query"
        elif "command" in name.lower():
            return "your command"
        elif "content" in name.lower():
            return "your content"
        else:
            return f"value for {name}"
