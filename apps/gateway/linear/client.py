"""
Linear GraphQL API Client

Handles authentication and GraphQL operations with Linear.app.
"""

import os
import json
import httpx
from typing import Optional, Any
from dataclasses import asdict

from .models import (
    LinearIssue,
    LinearProject,
    LinearTeam,
    LinearUser,
    LinearLabel,
    LinearConfig,
    IssueState,
    IssuePriority,
    SyncResult,
    QUERIES,
    MUTATIONS,
)


class LinearClient:
    """
    Client for Linear GraphQL API.
    
    Usage:
        client = LinearClient(api_key="lin_api_...")
        teams = await client.get_teams()
        issues = await client.get_issues(team_id="...")
    """
    
    API_URL = "https://api.linear.app/graphql"
    
    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key or os.getenv("LINEAR_API_KEY")
        self._config: Optional[LinearConfig] = None
        self._http_client: Optional[httpx.AsyncClient] = None
    
    @property
    def is_configured(self) -> bool:
        """Check if API key is set"""
        return bool(self.api_key)
    
    @property
    def config(self) -> LinearConfig:
        """Get current configuration"""
        if self._config is None:
            self._config = LinearConfig(api_key=self.api_key)
        return self._config
    
    def configure(self, config: LinearConfig) -> None:
        """Update configuration"""
        self._config = config
        if config.api_key:
            self.api_key = config.api_key
    
    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create HTTP client"""
        if self._http_client is None:
            self._http_client = httpx.AsyncClient(
                headers={
                    "Authorization": self.api_key or "",
                    "Content-Type": "application/json",
                },
                timeout=30.0,
            )
        return self._http_client
    
    async def _execute(
        self, 
        query: str, 
        variables: Optional[dict] = None
    ) -> tuple[bool, dict | str]:
        """
        Execute a GraphQL query/mutation.
        
        Returns (success, data | error_message)
        """
        if not self.api_key:
            return False, "Linear API key not configured"
        
        try:
            client = await self._get_client()
            response = await client.post(
                self.API_URL,
                json={"query": query, "variables": variables or {}},
            )
            
            if response.status_code != 200:
                return False, f"HTTP {response.status_code}: {response.text}"
            
            result = response.json()
            
            if "errors" in result:
                errors = [e.get("message", str(e)) for e in result["errors"]]
                return False, "; ".join(errors)
            
            return True, result.get("data", {})
            
        except httpx.TimeoutException:
            return False, "Request timed out"
        except Exception as e:
            return False, str(e)
    
    async def close(self) -> None:
        """Close HTTP client"""
        if self._http_client:
            await self._http_client.aclose()
            self._http_client = None
    
    # ========================================================================
    # Read Operations
    # ========================================================================
    
    async def get_viewer(self) -> tuple[bool, LinearUser | str]:
        """Get authenticated user info"""
        success, data = await self._execute(QUERIES["viewer"])
        
        if not success:
            return False, data
        
        viewer = data.get("viewer", {})
        return True, LinearUser(
            id=viewer.get("id", ""),
            name=viewer.get("name", ""),
            email=viewer.get("email"),
        )
    
    async def get_teams(self) -> tuple[bool, list[LinearTeam] | str]:
        """Get all teams"""
        success, data = await self._execute(QUERIES["teams"])
        
        if not success:
            return False, data
        
        teams = []
        for node in data.get("teams", {}).get("nodes", []):
            teams.append(LinearTeam(
                id=node.get("id", ""),
                name=node.get("name", ""),
                key=node.get("key", ""),
                description=node.get("description"),
            ))
        
        return True, teams
    
    async def get_projects(
        self, 
        team_id: Optional[str] = None
    ) -> tuple[bool, list[LinearProject] | str]:
        """Get projects, optionally filtered by team"""
        success, data = await self._execute(
            QUERIES["projects"],
            {"teamId": team_id or self.config.team_id}
        )
        
        if not success:
            return False, data
        
        projects = []
        for node in data.get("projects", {}).get("nodes", []):
            projects.append(LinearProject(
                id=node.get("id", ""),
                name=node.get("name", ""),
                description=node.get("description"),
                state=node.get("state", "started"),
                progress=node.get("progress", 0.0),
                target_date=node.get("targetDate"),
                team_id=team_id,
            ))
        
        return True, projects
    
    async def get_issues(
        self,
        team_id: Optional[str] = None,
        project_id: Optional[str] = None,
        limit: int = 50,
    ) -> tuple[bool, list[LinearIssue] | str]:
        """Get issues filtered by team and/or project"""
        success, data = await self._execute(
            QUERIES["issues"],
            {
                "teamId": team_id or self.config.team_id,
                "projectId": project_id or self.config.project_id,
                "first": limit,
            }
        )
        
        if not success:
            return False, data
        
        issues = []
        for node in data.get("issues", {}).get("nodes", []):
            issues.append(self._parse_issue(node))
        
        return True, issues
    
    async def get_issue(self, issue_id: str) -> tuple[bool, LinearIssue | str]:
        """Get a single issue by ID"""
        success, data = await self._execute(QUERIES["issue"], {"id": issue_id})
        
        if not success:
            return False, data
        
        issue_data = data.get("issue")
        if not issue_data:
            return False, f"Issue not found: {issue_id}"
        
        return True, self._parse_issue(issue_data)
    
    def _parse_issue(self, node: dict) -> LinearIssue:
        """Parse issue node from GraphQL response"""
        # Parse state
        state_data = node.get("state", {})
        state_type = state_data.get("type", "").lower()
        state_map = {
            "backlog": IssueState.BACKLOG,
            "unstarted": IssueState.TODO,
            "started": IssueState.IN_PROGRESS,
            "completed": IssueState.DONE,
            "canceled": IssueState.CANCELED,
        }
        state = state_map.get(state_type, IssueState.TODO)
        
        # Parse assignee
        assignee_data = node.get("assignee")
        assignee = None
        if assignee_data:
            assignee = LinearUser(
                id=assignee_data.get("id", ""),
                name=assignee_data.get("name", ""),
                email=assignee_data.get("email"),
                display_name=assignee_data.get("displayName"),
                avatar_url=assignee_data.get("avatarUrl"),
            )
        
        # Parse team
        team_data = node.get("team")
        team = None
        if team_data:
            team = LinearTeam(
                id=team_data.get("id", ""),
                name=team_data.get("name", ""),
                key=team_data.get("key", ""),
            )
        
        # Parse project
        project_data = node.get("project")
        project = None
        if project_data:
            project = LinearProject(
                id=project_data.get("id", ""),
                name=project_data.get("name", ""),
                state=project_data.get("state", ""),
                progress=project_data.get("progress", 0.0),
            )
        
        # Parse labels
        labels = []
        for label_node in node.get("labels", {}).get("nodes", []):
            labels.append(LinearLabel(
                id=label_node.get("id", ""),
                name=label_node.get("name", ""),
                color=label_node.get("color", ""),
            ))
        
        return LinearIssue(
            id=node.get("id", ""),
            identifier=node.get("identifier", ""),
            title=node.get("title", ""),
            description=node.get("description"),
            state=state,
            priority=IssuePriority(node.get("priority", 0)),
            estimate=node.get("estimate"),
            assignee=assignee,
            team=team,
            project=project,
            labels=labels,
            parent_id=node.get("parent", {}).get("id") if node.get("parent") else None,
            created_at=node.get("createdAt"),
            updated_at=node.get("updatedAt"),
            completed_at=node.get("completedAt"),
        )
    
    # ========================================================================
    # Write Operations
    # ========================================================================
    
    async def create_issue(
        self,
        title: str,
        description: Optional[str] = None,
        team_id: Optional[str] = None,
        project_id: Optional[str] = None,
        assignee_id: Optional[str] = None,
        priority: int = 0,
        estimate: Optional[int] = None,
        label_ids: Optional[list[str]] = None,
    ) -> tuple[bool, LinearIssue | str]:
        """Create a new issue"""
        input_data: dict[str, Any] = {
            "title": title,
            "teamId": team_id or self.config.team_id,
        }
        
        if description:
            input_data["description"] = description
        if project_id or self.config.project_id:
            input_data["projectId"] = project_id or self.config.project_id
        if assignee_id or self.config.default_assignee_id:
            input_data["assigneeId"] = assignee_id or self.config.default_assignee_id
        if priority:
            input_data["priority"] = priority
        if estimate:
            input_data["estimate"] = estimate
        if label_ids:
            input_data["labelIds"] = label_ids
        
        success, data = await self._execute(
            MUTATIONS["create_issue"],
            {"input": input_data}
        )
        
        if not success:
            return False, data
        
        result = data.get("issueCreate", {})
        if not result.get("success"):
            return False, "Failed to create issue"
        
        issue_data = result.get("issue", {})
        return True, LinearIssue(
            id=issue_data.get("id", ""),
            identifier=issue_data.get("identifier", ""),
            title=issue_data.get("title", ""),
        )
    
    async def update_issue(
        self,
        issue_id: str,
        title: Optional[str] = None,
        description: Optional[str] = None,
        state_id: Optional[str] = None,
        assignee_id: Optional[str] = None,
        priority: Optional[int] = None,
        estimate: Optional[int] = None,
    ) -> tuple[bool, str]:
        """Update an existing issue"""
        input_data: dict[str, Any] = {}
        
        if title:
            input_data["title"] = title
        if description is not None:
            input_data["description"] = description
        if state_id:
            input_data["stateId"] = state_id
        if assignee_id:
            input_data["assigneeId"] = assignee_id
        if priority is not None:
            input_data["priority"] = priority
        if estimate is not None:
            input_data["estimate"] = estimate
        
        if not input_data:
            return False, "No fields to update"
        
        success, data = await self._execute(
            MUTATIONS["update_issue"],
            {"id": issue_id, "input": input_data}
        )
        
        if not success:
            return False, data
        
        result = data.get("issueUpdate", {})
        if not result.get("success"):
            return False, "Failed to update issue"
        
        return True, f"Updated issue {result.get('issue', {}).get('identifier', issue_id)}"
    
    async def add_comment(
        self,
        issue_id: str,
        body: str,
    ) -> tuple[bool, str]:
        """Add a comment to an issue"""
        success, data = await self._execute(
            MUTATIONS["create_comment"],
            {"issueId": issue_id, "body": body}
        )
        
        if not success:
            return False, data
        
        result = data.get("commentCreate", {})
        if not result.get("success"):
            return False, "Failed to create comment"
        
        return True, "Comment added"
    
    # ========================================================================
    # Sync Operations
    # ========================================================================
    
    async def sync_task_to_linear(
        self,
        task_id: str,
        title: str,
        description: Optional[str] = None,
        status: str = "todo",
    ) -> tuple[bool, LinearIssue | str]:
        """
        Sync a Kuroryuu task to Linear as an issue.
        
        Creates new issue if not linked, updates if already linked.
        """
        # Map Kuroryuu status to Linear priority
        priority_map = {
            "todo": 3,  # Medium
            "active": 2,  # High
            "done": 3,
        }
        
        return await self.create_issue(
            title=title,
            description=f"{description}\n\n---\n*Synced from Kuroryuu task: {task_id}*",
            priority=priority_map.get(status, 3),
        )


# Singleton instance
_client_instance: Optional[LinearClient] = None


def get_linear_client() -> LinearClient:
    """Get or create the Linear client singleton"""
    global _client_instance
    if _client_instance is None:
        _client_instance = LinearClient()
    return _client_instance
