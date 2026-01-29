"""
Linear Integration Data Models
"""

from dataclasses import dataclass, field
from typing import Optional, Literal
from enum import Enum
from datetime import datetime


class SyncDirection(str, Enum):
    """Direction of sync between Kuroryuu and Linear"""
    KURORYUU_TO_LINEAR = "kuroryuu_to_linear"
    LINEAR_TO_KURORYUU = "linear_to_kuroryuu"
    BIDIRECTIONAL = "bidirectional"


class IssueState(str, Enum):
    """Linear issue states"""
    BACKLOG = "backlog"
    TODO = "todo"
    IN_PROGRESS = "in_progress"
    IN_REVIEW = "in_review"
    DONE = "done"
    CANCELED = "canceled"


class IssuePriority(int, Enum):
    """Linear issue priority (0 = no priority, 1 = urgent, 4 = low)"""
    NO_PRIORITY = 0
    URGENT = 1
    HIGH = 2
    MEDIUM = 3
    LOW = 4


@dataclass
class LinearUser:
    """Linear user/assignee"""
    id: str
    name: str
    email: Optional[str] = None
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None


@dataclass
class LinearTeam:
    """Linear team"""
    id: str
    name: str
    key: str  # e.g., "KUR" for Kuroryuu
    description: Optional[str] = None
    icon: Optional[str] = None


@dataclass 
class LinearProject:
    """Linear project"""
    id: str
    name: str
    description: Optional[str] = None
    state: str = "started"
    progress: float = 0.0
    target_date: Optional[str] = None
    team_id: Optional[str] = None


@dataclass
class LinearLabel:
    """Linear label"""
    id: str
    name: str
    color: str


@dataclass
class LinearIssue:
    """Linear issue"""
    id: str
    identifier: str  # e.g., "KUR-42"
    title: str
    description: Optional[str] = None
    state: IssueState = IssueState.TODO
    priority: IssuePriority = IssuePriority.NO_PRIORITY
    estimate: Optional[int] = None  # Story points
    assignee: Optional[LinearUser] = None
    team: Optional[LinearTeam] = None
    project: Optional[LinearProject] = None
    labels: list[LinearLabel] = field(default_factory=list)
    parent_id: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    completed_at: Optional[str] = None
    kuroryuu_task_id: Optional[str] = None  # Linked Kuroryuu task


@dataclass
class LinearConfig:
    """Linear integration configuration"""
    api_key: Optional[str] = None
    team_id: Optional[str] = None
    project_id: Optional[str] = None
    sync_direction: SyncDirection = SyncDirection.BIDIRECTIONAL
    auto_sync: bool = False
    sync_interval_minutes: int = 15
    default_assignee_id: Optional[str] = None
    label_mapping: dict[str, str] = field(default_factory=dict)  # Kuroryuu status -> Linear label


@dataclass
class SyncResult:
    """Result of a sync operation"""
    success: bool
    issues_created: int = 0
    issues_updated: int = 0
    issues_synced: list[str] = field(default_factory=list)
    errors: list[str] = field(default_factory=list)
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())


# GraphQL query fragments
ISSUE_FRAGMENT = """
fragment IssueFields on Issue {
    id
    identifier
    title
    description
    priority
    estimate
    state {
        id
        name
        type
    }
    assignee {
        id
        name
        email
        displayName
        avatarUrl
    }
    team {
        id
        name
        key
    }
    project {
        id
        name
        state
        progress
    }
    labels {
        nodes {
            id
            name
            color
        }
    }
    parent {
        id
    }
    createdAt
    updatedAt
    completedAt
}
"""

# GraphQL queries
QUERIES = {
    "viewer": """
        query Viewer {
            viewer {
                id
                name
                email
            }
        }
    """,
    
    "teams": """
        query Teams {
            teams {
                nodes {
                    id
                    name
                    key
                    description
                }
            }
        }
    """,
    
    "projects": """
        query Projects($teamId: String) {
            projects(filter: { team: { id: { eq: $teamId } } }) {
                nodes {
                    id
                    name
                    description
                    state
                    progress
                    targetDate
                }
            }
        }
    """,
    
    "issues": f"""
        {ISSUE_FRAGMENT}
        query Issues($teamId: String, $projectId: String, $first: Int) {{
            issues(
                filter: {{ 
                    team: {{ id: {{ eq: $teamId }} }},
                    project: {{ id: {{ eq: $projectId }} }}
                }},
                first: $first
            ) {{
                nodes {{
                    ...IssueFields
                }}
            }}
        }}
    """,
    
    "issue": f"""
        {ISSUE_FRAGMENT}
        query Issue($id: String!) {{
            issue(id: $id) {{
                ...IssueFields
            }}
        }}
    """,
}

# GraphQL mutations
MUTATIONS = {
    "create_issue": """
        mutation CreateIssue($input: IssueCreateInput!) {
            issueCreate(input: $input) {
                success
                issue {
                    id
                    identifier
                    title
                }
            }
        }
    """,
    
    "update_issue": """
        mutation UpdateIssue($id: String!, $input: IssueUpdateInput!) {
            issueUpdate(id: $id, input: $input) {
                success
                issue {
                    id
                    identifier
                    title
                }
            }
        }
    """,
    
    "create_comment": """
        mutation CreateComment($issueId: String!, $body: String!) {
            commentCreate(input: { issueId: $issueId, body: $body }) {
                success
                comment {
                    id
                    body
                }
            }
        }
    """,
}
