"""PRD Prompt Building Logic

Constructs prompts for LMStudio PRD generation with repo_intel context.
Follows the pattern from repo_intel/router.py:generate_ideas()
"""
from __future__ import annotations

from typing import Any, Dict, List


def build_prd_prompt(
    title: str,
    description: str,
    scope: str,
    include_tech_spec: bool,
    include_acceptance: bool,
    context: Dict[str, Any],
) -> str:
    """Build PRD generation prompt with repo_intel context.

    Args:
        title: PRD title
        description: PRD description/requirements
        scope: "task", "feature", or "epic"
        include_tech_spec: Whether to include technical specification section
        include_acceptance: Whether to include acceptance criteria section
        context: Codebase context from repo_intel (components, endpoints, TODOs)

    Returns:
        Complete prompt string for LLM
    """
    sections: List[str] = []

    # Section 1: CODEBASE ANALYSIS
    sections.append("# CODEBASE ANALYSIS\n")
    sections.append(format_context(context))

    # Section 2: PRD REQUIREMENTS
    sections.append("\n# PRD REQUIREMENTS\n")
    sections.append(f"**Title:** {title}\n")
    sections.append(f"**Description:** {description}\n")
    sections.append(f"**Scope:** {scope}\n")
    sections.append(f"**Include Technical Specification:** {include_tech_spec}\n")
    sections.append(f"**Include Acceptance Criteria:** {include_acceptance}\n")

    # Section 3: OUTPUT SPECIFICATION
    sections.append("\n# OUTPUT SPECIFICATION\n")
    sections.append(_get_output_spec(include_tech_spec, include_acceptance))

    return "\n".join(sections)


def format_context(context: Dict[str, Any]) -> str:
    """Format repo_intel context into readable codebase analysis.

    Args:
        context: Dictionary with keys like "components", "endpoints", "todos", etc.

    Returns:
        Formatted markdown string with codebase analysis
    """
    parts: List[str] = []

    # React Components
    if context.get("components"):
        comp_count = len(context["components"])
        parts.append(f"## React Components ({comp_count} total)\n")
        for comp in context["components"][:10]:  # Top 10
            parts.append(f"- **{comp.get('name', 'Unknown')}** ({comp.get('file', 'unknown')})")
        if comp_count > 10:
            parts.append(f"- _(and {comp_count - 10} more)_")
        parts.append("")

    # API Endpoints
    if context.get("endpoints"):
        ep_count = len(context["endpoints"])
        parts.append(f"## API Endpoints ({ep_count} total)\n")
        for ep in context["endpoints"][:10]:  # Top 10
            method = ep.get("method", "GET")
            route = ep.get("route", "/unknown")
            handler = ep.get("handler", "unknown")
            parts.append(f"- **{method} {route}** → `{handler}`")
        if ep_count > 10:
            parts.append(f"- _(and {ep_count - 10} more)_")
        parts.append("")

    # TODOs from codebase
    if context.get("todos"):
        todo_count = len(context["todos"])
        parts.append(f"## Existing TODOs ({todo_count} total)\n")
        for todo in context["todos"][:5]:  # Top 5
            text = todo.get("text", "Unknown TODO")
            file = todo.get("file", "unknown")
            parts.append(f"- {text} _({file})_")
        if todo_count > 5:
            parts.append(f"- _(and {todo_count - 5} more)_")
        parts.append("")

    # Dependencies
    if context.get("dependencies"):
        deps = context["dependencies"]
        if isinstance(deps, dict):
            dep_count = len(deps)
            parts.append(f"## Dependencies ({dep_count} total)\n")
            items = list(deps.items())[:10]
            for name, version in items:
                parts.append(f"- **{name}** ({version})")
            if dep_count > 10:
                parts.append(f"- _(and {dep_count - 10} more)_")
            parts.append("")

    # Routes (from routing analysis)
    if context.get("routes"):
        route_count = len(context["routes"])
        parts.append(f"## Application Routes ({route_count} total)\n")
        for route in context["routes"][:8]:
            path = route.get("path", "/unknown")
            component = route.get("component", "Unknown")
            parts.append(f"- **{path}** → `{component}`")
        if route_count > 8:
            parts.append(f"- _(and {route_count - 8} more)_")
        parts.append("")

    if not parts:
        return "_(No codebase context available)_\n"

    return "\n".join(parts)


def _get_output_spec(include_tech_spec: bool, include_acceptance: bool) -> str:
    """Get the output specification section for the prompt.

    Args:
        include_tech_spec: Whether to include technical specification
        include_acceptance: Whether to include acceptance criteria

    Returns:
        Markdown string with output requirements
    """
    spec = """Generate a comprehensive Product Requirements Document in **markdown format** with these sections:

## Required Sections

### 1. Overview
- **Problem Statement**: What problem does this solve? Who is affected?
- **Proposed Solution**: High-level approach to solving the problem
- **Success Metrics**: How will we measure success? (quantitative metrics)
- **Out of Scope**: What this PRD explicitly does NOT cover

### 2. Requirements
Functional requirements organized by priority:
- **P0 (Must Have)**: Critical requirements for launch
- **P1 (Should Have)**: Important but not critical
- **P2 (Nice to Have)**: Future enhancements

**IMPORTANT**: Reference actual codebase files, components, and endpoints from the analysis above. Be specific about what needs to be modified or created.

### 3. User Stories
Concrete scenarios based on existing patterns in the codebase:
- **As a [persona], I want [goal], so that [benefit]**
- Include acceptance criteria for each story
- Reference actual UI components or flows from the codebase

### 4. Implementation Plan
Phased approach with concrete file references:
- **Phase 1**: Foundation (files to create/modify)
- **Phase 2**: Core functionality (specific components/endpoints)
- **Phase 3**: Integration and testing
- **Phase 4**: Documentation and rollout

Reference real files from the codebase analysis.
"""

    if include_tech_spec:
        spec += """
### 5. Technical Specification
**IMPORTANT**: Only include this section if requested.
- **Architecture**: System design, data flow, component interaction
- **Data Models**: Database schemas, API contracts, types
- **API Endpoints**: New endpoints with request/response schemas
- **Dependencies**: External libraries, services, or system dependencies
- **Migration Strategy**: How to transition from current state (if applicable)

Reference existing architecture patterns from the codebase analysis.
"""

    if include_acceptance:
        spec += """
### 6. Acceptance Criteria
**IMPORTANT**: Only include this section if requested.
Testable requirements for completion:
- [ ] **Functional**: Feature works as specified in user stories
- [ ] **Performance**: Meets defined performance benchmarks
- [ ] **Security**: Passes security review (auth, data protection, input validation)
- [ ] **Accessibility**: WCAG 2.1 AA compliance (if UI changes)
- [ ] **Testing**: Unit tests, integration tests, E2E tests
- [ ] **Documentation**: Updated docs, runbooks, API specs
"""

    spec += """
### 7. Risks & Mitigations
Technical risks based on codebase analysis:
- **Risk**: [Description] | **Likelihood**: High/Medium/Low | **Impact**: High/Medium/Low
- **Mitigation**: [Strategy to reduce or eliminate risk]

### 8. Dependencies
Existing systems this integrates with:
- **Internal**: Components, services, APIs (reference actual code)
- **External**: Third-party services, libraries, APIs
- **Blocking**: What must be completed before this can start?

---

## Formatting Requirements
- Use proper markdown headings (##, ###)
- Use bullet points and numbered lists for clarity
- Use **bold** for emphasis
- Use `code formatting` for file paths, functions, and technical terms
- Reference actual files and components from the codebase analysis
- Be specific and actionable

## Tone
Write as a senior product manager and technical architect who deeply understands the existing codebase.
"""

    return spec
