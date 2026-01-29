"""
Traffic Event Storage
SQLite-based persistent storage for traffic history
24-hour retention, 10K event max
"""
import sqlite3
import json
import threading
import asyncio
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Any, List, Optional
from contextlib import contextmanager

from .models import TrafficEventDetail, EndpointSummary
from ..utils.logging_config import get_logger

logger = get_logger(__name__)


# Storage location
STORAGE_DIR = Path(__file__).parent.parent.parent.parent / "ai" / "traffic"
DB_PATH = STORAGE_DIR / "history.db"

# Retention settings
MAX_EVENTS = 10_000
RETENTION_HOURS = 24


class TrafficStorage:
    """
    SQLite-based traffic event storage with automatic cleanup.
    Thread-safe for concurrent access.
    """

    def __init__(self, db_path: Path = DB_PATH):
        self.db_path = db_path
        self._lock = threading.Lock()
        self._init_db()

    def _init_db(self):
        """Initialize database schema"""
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

        with self._get_connection() as conn:
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS traffic_events (
                    id TEXT PRIMARY KEY,
                    endpoint TEXT NOT NULL,
                    method TEXT NOT NULL,
                    status INTEGER,
                    duration REAL,
                    category TEXT NOT NULL,
                    timestamp TEXT NOT NULL,
                    request_headers TEXT,
                    request_body TEXT,
                    request_body_size INTEGER DEFAULT 0,
                    response_headers TEXT,
                    response_body TEXT,
                    response_body_size INTEGER DEFAULT 0,
                    client_ip TEXT,
                    user_agent TEXT,
                    correlation_id TEXT,
                    query_params TEXT,
                    error_type TEXT,
                    error_message TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                );

                CREATE INDEX IF NOT EXISTS idx_timestamp ON traffic_events(timestamp DESC);
                CREATE INDEX IF NOT EXISTS idx_endpoint ON traffic_events(endpoint);
                CREATE INDEX IF NOT EXISTS idx_category ON traffic_events(category);
                CREATE INDEX IF NOT EXISTS idx_status ON traffic_events(status);
            """)

    @contextmanager
    def _get_connection(self):
        """Get a database connection with proper cleanup"""
        conn = sqlite3.connect(str(self.db_path), timeout=10.0)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def store_event(self, event: TrafficEventDetail) -> bool:
        """Store a traffic event"""
        with self._lock:
            try:
                with self._get_connection() as conn:
                    conn.execute("""
                        INSERT OR REPLACE INTO traffic_events (
                            id, endpoint, method, status, duration, category, timestamp,
                            request_headers, request_body, request_body_size,
                            response_headers, response_body, response_body_size,
                            client_ip, user_agent, correlation_id, query_params,
                            error_type, error_message
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        event.id,
                        event.endpoint,
                        event.method,
                        event.status,
                        event.duration,
                        event.category,
                        event.timestamp.isoformat(),
                        json.dumps(event.request_headers),
                        event.request_body,
                        event.request_body_size,
                        json.dumps(event.response_headers),
                        event.response_body,
                        event.response_body_size,
                        event.client_ip,
                        event.user_agent,
                        event.correlation_id,
                        json.dumps(event.query_params),
                        event.error_type,
                        event.error_message,
                    ))
                return True
            except Exception as e:
                logger.error(f"Error storing event: {e}")
                return False

    def get_event(self, event_id: str) -> Optional[Dict[str, Any]]:
        """Get a single event by ID"""
        with self._get_connection() as conn:
            row = conn.execute(
                "SELECT * FROM traffic_events WHERE id = ?",
                (event_id,)
            ).fetchone()
            if row:
                return self._row_to_dict(row)
        return None

    def get_events(
        self,
        limit: int = 100,
        offset: int = 0,
        endpoint: Optional[str] = None,
        category: Optional[str] = None,
        status_min: Optional[int] = None,
        status_max: Optional[int] = None,
        method: Optional[str] = None,
        search: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Get events with filtering and pagination"""
        query = "SELECT * FROM traffic_events WHERE 1=1"
        params = []

        if endpoint:
            query += " AND endpoint LIKE ?"
            params.append(f"%{endpoint}%")
        if category:
            query += " AND category = ?"
            params.append(category)
        if status_min is not None:
            query += " AND status >= ?"
            params.append(status_min)
        if status_max is not None:
            query += " AND status <= ?"
            params.append(status_max)
        if method:
            query += " AND method = ?"
            params.append(method)
        if search:
            query += " AND (endpoint LIKE ? OR request_body LIKE ? OR response_body LIKE ?)"
            params.extend([f"%{search}%"] * 3)

        query += " ORDER BY timestamp DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        with self._get_connection() as conn:
            rows = conn.execute(query, params).fetchall()
            return [self._row_to_dict(row) for row in rows]

    def get_endpoint_summary(self, endpoint: str) -> Optional[EndpointSummary]:
        """Get summary statistics for a specific endpoint"""
        with self._get_connection() as conn:
            # Get basic stats
            row = conn.execute("""
                SELECT
                    endpoint,
                    category,
                    COUNT(*) as request_count,
                    SUM(CASE WHEN status >= 400 THEN 1 ELSE 0 END) as error_count,
                    AVG(duration) as avg_latency,
                    MIN(duration) as min_latency,
                    MAX(duration) as max_latency,
                    MAX(timestamp) as last_request_time
                FROM traffic_events
                WHERE endpoint = ?
                GROUP BY endpoint
            """, (endpoint,)).fetchone()

            if not row:
                return None

            # Get status breakdown
            status_rows = conn.execute("""
                SELECT status, COUNT(*) as count
                FROM traffic_events
                WHERE endpoint = ?
                GROUP BY status
            """, (endpoint,)).fetchall()
            status_breakdown = {r['status']: r['count'] for r in status_rows}

            # Get methods used
            method_rows = conn.execute("""
                SELECT DISTINCT method FROM traffic_events WHERE endpoint = ?
            """, (endpoint,)).fetchall()
            methods = [r['method'] for r in method_rows]

            # Calculate p95 latency
            latencies = conn.execute("""
                SELECT duration FROM traffic_events
                WHERE endpoint = ? AND duration IS NOT NULL
                ORDER BY duration
            """, (endpoint,)).fetchall()
            p95_latency = 0.0
            if latencies:
                idx = int(len(latencies) * 0.95)
                p95_latency = latencies[min(idx, len(latencies) - 1)]['duration'] or 0.0

            return EndpointSummary(
                endpoint=row['endpoint'],
                category=row['category'],
                request_count=row['request_count'],
                error_count=row['error_count'],
                avg_latency=row['avg_latency'] or 0.0,
                p95_latency=p95_latency,
                min_latency=row['min_latency'] or 0.0,
                max_latency=row['max_latency'] or 0.0,
                last_request_time=datetime.fromisoformat(row['last_request_time']) if row['last_request_time'] else None,
                status_breakdown=status_breakdown,
                methods_used=methods,
            )

    def get_all_endpoints(self) -> List[EndpointSummary]:
        """Get summary for all endpoints"""
        with self._get_connection() as conn:
            endpoints = conn.execute("""
                SELECT DISTINCT endpoint FROM traffic_events
            """).fetchall()
            return [
                self.get_endpoint_summary(row['endpoint'])
                for row in endpoints
                if self.get_endpoint_summary(row['endpoint'])
            ]

    def get_recent_for_endpoint(self, endpoint: str, limit: int = 50) -> List[Dict[str, Any]]:
        """Get recent events for a specific endpoint"""
        return self.get_events(limit=limit, endpoint=endpoint)

    def cleanup_old_events(self):
        """Remove events older than retention period and enforce max count"""
        with self._lock:
            with self._get_connection() as conn:
                # Remove old events
                cutoff = (datetime.now() - timedelta(hours=RETENTION_HOURS)).isoformat()
                conn.execute(
                    "DELETE FROM traffic_events WHERE timestamp < ?",
                    (cutoff,)
                )

                # Enforce max event count
                conn.execute("""
                    DELETE FROM traffic_events WHERE id IN (
                        SELECT id FROM traffic_events
                        ORDER BY timestamp DESC
                        LIMIT -1 OFFSET ?
                    )
                """, (MAX_EVENTS,))

    def get_stats(self) -> Dict[str, Any]:
        """Get storage statistics"""
        with self._get_connection() as conn:
            count = conn.execute("SELECT COUNT(*) as count FROM traffic_events").fetchone()['count']
            oldest = conn.execute("SELECT MIN(timestamp) as oldest FROM traffic_events").fetchone()['oldest']
            newest = conn.execute("SELECT MAX(timestamp) as newest FROM traffic_events").fetchone()['newest']
            return {
                "event_count": count,
                "oldest_event": oldest,
                "newest_event": newest,
                "db_path": str(self.db_path),
                "max_events": MAX_EVENTS,
                "retention_hours": RETENTION_HOURS,
            }

    def _row_to_dict(self, row: sqlite3.Row) -> Dict[str, Any]:
        """Convert a database row to a dictionary"""
        d = dict(row)
        # Parse JSON fields
        for field in ['request_headers', 'response_headers', 'query_params']:
            if d.get(field):
                try:
                    d[field] = json.loads(d[field])
                except json.JSONDecodeError:
                    d[field] = {}
        return d


# Global storage instance
traffic_storage = TrafficStorage()


async def cleanup_task():
    """Background task to periodically clean up old events"""
    while True:
        await asyncio.sleep(3600)  # Run every hour
        traffic_storage.cleanup_old_events()
