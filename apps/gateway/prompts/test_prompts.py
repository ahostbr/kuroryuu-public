#!/usr/bin/env python
"""Test the prompt builder system.

Run with: python -m apps.gateway.prompts.test_prompts
"""

import sys
from pathlib import Path

# Add project root
sys.path.insert(0, str(Path(__file__).parent.parent.parent.parent))

from apps.gateway.prompts import (
    get_prompt_builder,
    list_providers,
    PromptContext,
    ToolDefinition,
)


def test_list_providers():
    """Test that all providers are registered."""
    providers = list_providers()
    print(f"Registered providers: {providers}")
    
    assert "lmstudio" in providers
    assert "anthropic" in providers
    assert "openai" in providers
    print("✓ All providers registered")


def test_lmstudio_prompt():
    """Test LM Studio XML prompt generation."""
    builder = get_prompt_builder("lmstudio")
    
    assert builder.provider_name == "lmstudio"
    assert builder.uses_xml_tools is True
    
    tools = [
        ToolDefinition(
            name="read_file",
            description="Read the contents of a file",
            parameters={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "File path to read",
                    }
                },
                "required": ["path"],
            }
        ),
        ToolDefinition(
            name="write_file",
            description="Write content to a file",
            parameters={
                "type": "object",
                "properties": {
                    "path": {"type": "string", "description": "File path"},
                    "content": {"type": "string", "description": "Content to write"},
                },
                "required": ["path", "content"],
            }
        ),
    ]
    
    context = PromptContext(
        cwd="/home/user/project",
        workspace_name="my-project",
    )
    
    prompt = builder.build_system_prompt(tools, context)
    
    # Verify XML tool format
    assert "<read_file>" in prompt
    assert "<path>" in prompt
    assert "</read_file>" in prompt
    assert "<write_file>" in prompt
    assert "</write_file>" in prompt
    
    # Verify sections
    assert "TOOL USE" in prompt
    assert "# Tools" in prompt
    assert "# Rules" in prompt
    
    print("✓ LM Studio XML prompt correct")
    print("\n" + "="*60)
    print("GENERATED LMSTUDIO PROMPT (first 2000 chars):")
    print("="*60)
    print(prompt[:2000])
    print("...")
    

def test_anthropic_prompt():
    """Test Anthropic native tools prompt generation."""
    builder = get_prompt_builder("anthropic")
    
    assert builder.provider_name == "anthropic"
    assert builder.uses_xml_tools is False
    
    tools = [
        ToolDefinition(
            name="search_code",
            description="Search for code patterns",
            parameters={
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "Search query"},
                },
                "required": ["query"],
            }
        ),
    ]
    
    context = PromptContext(cwd="/workspace")
    
    # System prompt should NOT contain XML tools
    prompt = builder.build_system_prompt(tools, context)
    assert "<search_code>" not in prompt
    
    # render_tools returns API-format tools
    api_tools = builder.render_tools(tools, context)
    assert isinstance(api_tools, list)
    assert len(api_tools) == 1
    assert api_tools[0]["name"] == "search_code"
    assert "input_schema" in api_tools[0]
    
    print("✓ Anthropic native tools prompt correct")


def test_openai_prompt():
    """Test OpenAI function calling prompt generation."""
    builder = get_prompt_builder("openai")
    
    assert builder.provider_name == "openai"
    assert builder.uses_xml_tools is False
    
    tools = [
        ToolDefinition(
            name="run_command",
            description="Execute a shell command",
            parameters={
                "type": "object",
                "properties": {
                    "command": {"type": "string", "description": "Command to run"},
                },
                "required": ["command"],
            }
        ),
    ]
    
    context = PromptContext(cwd="/workspace")
    
    # render_tools returns OpenAI function format
    api_tools = builder.render_tools(tools, context)
    assert isinstance(api_tools, list)
    assert len(api_tools) == 1
    assert api_tools[0]["type"] == "function"
    assert api_tools[0]["function"]["name"] == "run_command"
    
    print("✓ OpenAI function calling prompt correct")


def test_tool_result_rendering():
    """Test tool result formatting."""
    lmstudio = get_prompt_builder("lmstudio")
    anthropic = get_prompt_builder("anthropic")
    openai = get_prompt_builder("openai")
    
    result = {"files": ["a.py", "b.py"], "count": 2}
    
    # LM Studio: XML format
    lm_result = lmstudio.render_tool_result("list_files", result)
    assert "<tool_result>" in lm_result
    assert "list_files" in lm_result
    
    # Anthropic: Structured dict
    anth_result = anthropic.render_tool_result("list_files", result)
    assert isinstance(anth_result, dict)
    assert anth_result["type"] == "tool_result"
    
    # OpenAI: JSON string
    oai_result = openai.render_tool_result("list_files", result)
    assert isinstance(oai_result, str)
    assert "files" in oai_result
    
    print("✓ Tool result rendering correct for all providers")


def main():
    """Run all tests."""
    print("Testing Kuroryuu Prompt Builder System\n")
    
    test_list_providers()
    test_lmstudio_prompt()
    test_anthropic_prompt()
    test_openai_prompt()
    test_tool_result_rendering()
    
    print("\n" + "="*60)
    print("All tests passed!")
    print("="*60)


if __name__ == "__main__":
    main()
