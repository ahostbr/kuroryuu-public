"""
Traffic Event Models
Extended data models for full request/response capture
"""
from pydantic import BaseModel, Field
from typing import Dict, Any, Optional, List
from datetime import datetime
from enum import Enum


class RequestMethod(str, Enum):
    """HTTP request methods"""
    GET = "GET"
    POST = "POST"
    PUT = "PUT"
    PATCH = "PATCH"
    DELETE = "DELETE"
    HEAD = "HEAD"
    OPTIONS = "OPTIONS"


class TrafficEventBase(BaseModel):
    """Base traffic event with minimal fields"""
    id: str
    endpoint: str
    method: str
    status: Optional[int] = None
    duration: Optional[float] = None  # milliseconds
    category: str
    timestamp: datetime = Field(default_factory=datetime.now)


class TrafficEventDetail(TrafficEventBase):
    """
    Extended traffic event with full request/response capture.
    Body fields are truncated to 10KB max.
    """
    # Request details
    request_headers: Dict[str, str] = Field(default_factory=dict)
    request_body: Optional[str] = None
    request_body_size: int = 0
    request_body_truncated: bool = False
    query_params: Dict[str, str] = Field(default_factory=dict)

    # Response details
    response_headers: Dict[str, str] = Field(default_factory=dict)
    response_body: Optional[str] = None
    response_body_size: int = 0
    response_body_truncated: bool = False

    # Context
    client_ip: Optional[str] = None
    user_agent: Optional[str] = None
    correlation_id: Optional[str] = None

    # Error info
    error_type: Optional[str] = None
    error_message: Optional[str] = None

    class Config:
        json_encoders = {
            datetime: lambda v: v.isoformat()
        }


class EndpointSummary(BaseModel):
    """Summary statistics for a single endpoint"""
    endpoint: str
    category: str
    request_count: int = 0
    error_count: int = 0
    avg_latency: float = 0.0
    p95_latency: float = 0.0
    min_latency: float = 0.0
    max_latency: float = 0.0
    last_request_time: Optional[datetime] = None
    status_breakdown: Dict[int, int] = Field(default_factory=dict)  # status code -> count
    methods_used: List[str] = Field(default_factory=list)


class TrafficStats(BaseModel):
    """Real-time traffic statistics"""
    requests_per_second: float = 0.0
    avg_latency: float = 0.0
    error_rate: float = 0.0
    total_requests: int = 0
    active_endpoints: int = 0

    # Time-series data for charts (last 60 data points)
    latency_history: List[Dict[str, Any]] = Field(default_factory=list)
    throughput_history: List[Dict[str, Any]] = Field(default_factory=list)


# Constants
MAX_BODY_SIZE = 10 * 1024  # 10KB max for body capture
SENSITIVE_HEADERS = {
    "authorization",
    "cookie",
    "set-cookie",
    "x-api-key",
    "x-auth-token",
    "x-csrf-token",
    "x-access-token",
}


def filter_headers(headers: Dict[str, str]) -> Dict[str, str]:
    """Filter out sensitive headers for security"""
    return {
        k: "[REDACTED]" if k.lower() in SENSITIVE_HEADERS else v
        for k, v in headers.items()
    }


def truncate_body(body: str, max_size: int = MAX_BODY_SIZE) -> tuple[str, bool]:
    """Truncate body if too large, return (body, was_truncated)"""
    if len(body) <= max_size:
        return body, False
    return body[:max_size] + "\n... [TRUNCATED]", True


# Preview size for WebSocket broadcasts (smaller for real-time streaming)
PREVIEW_SIZE = 500


def create_body_preview(body: Optional[str], max_size: int = PREVIEW_SIZE) -> Optional[str]:
    """Create a preview of the body for WebSocket streaming (first N chars)"""
    if not body:
        return None
    if len(body) <= max_size:
        return body
    return body[:max_size] + "..."
