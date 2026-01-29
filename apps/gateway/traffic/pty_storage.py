"""
PTY Traffic Event Storage
SQLite-based persistent storage for PTY event history
Uses same database as HTTP traffic (ai/traffic/history.db) with new table
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

from .pty_models import PTYEventDetail, PTYSessionSummary
from ..utils.logging_config import get_logger

logger = get_logger(__name__)


# Storage location (same DB as HTTP traffic)
STORAGE_DIR = Path(__file__).parent.parent.parent.parent / "ai" / "traffic"
DB_PATH = STORAGE_DIR / "history.db"

# Retention settings
MAX_EVENTS = 10_000
RETENTION_HOURS = 24


class PTYTrafficStorage:
    """
    SQLite-based PTY event storage with automatic cleanup.
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
                CREATE TABLE IF NOT EXISTS pty_events (
                    id TEXT PRIMARY KEY,
                    session_id TEXT NOT NULL,
                    action TEXT NOT NULL,
                    agent_id TEXT,
                    owner_session_id TEXT,
                    timestamp TEXT NOT NULL,
                    command TEXT,
                    command_preview TEXT,
                    command_size INTEGER DEFAULT 0,
                    response TEXT,
                    response_preview TEXT,
                    response_size INTEGER DEFAULT 0,
                    response_truncated INTEGER DEFAULT 0,
                    duration REAL,
                    timeout_ms INTEGER,
                    timed_out INTEGER DEFAULT 0,
                    success INTEGER DEFAULT 1,
                    error_code TEXT,
                    error_message TEXT,
                    blocked INTEGER DEFAULT 0,
                    blocked_pattern TEXT,
                    session_source TEXT,
                    cli_type TEXT,
                    label TEXT,
                    created_at TEXT DEFAULT CURRENT_TIMESTAMP
                );

                CREATE INDEX IF NOT EXISTS idx_pty_timestamp ON pty_events(timestamp DESC);
                CREATE INDEX IF NOT EXISTS idx_pty_session ON pty_events(session_id);
                CREATE INDEX IF NOT EXISTS idx_pty_agent ON pty_events(agent_id);
                CREATE INDEX IF NOT EXISTS idx_pty_action ON pty_events(action);
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

    def store_event(self, event: PTYEventDetail) -> bool:
        """Store a PTY event"""
        with self._lock:
            try:
                with self._get_connection() as conn:
                    conn.execute("""
                        INSERT OR REPLACE INTO pty_events (
                            id, session_id, action, agent_id, owner_session_id,
                            timestamp, command, command_preview, command_size,
                            response, response_preview, response_size, response_truncated,
                            duration, timeout_ms, timed_out, success,
                            error_code, error_message, blocked, blocked_pattern,
                            session_source, cli_type, label
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        event.id,
                        event.session_id,
                        event.action,
                        event.agent_id,
                        event.owner_session_id,
                        event.timestamp.isoformat(),
                        event.command,
                        event.command_preview,
                        event.command_size,
                        event.response,
                        event.response_preview,
                        event.response_size,
                        1 if event.response_truncated else 0,
                        event.duration,
                        event.timeout_ms,
                        1 if event.timed_out else 0,
                        1 if event.success else 0,
                        event.error_code,
                        event.error_message,
                        1 if event.blocked else 0,
                        event.blocked_pattern,
                        event.session_source,
                        event.cli_type,
                        event.label,
                    ))
                return True
            except Exception as e:
                logger.error(f"Error storing PTY event: {e}")
                return False

    def get_event(self, event_id: str) -> Optional[Dict[str, Any]]:
        """Get a single event by ID"""
        with self._get_connection() as conn:
            row = conn.execute(
                "SELECT * FROM pty_events WHERE id = ?",
                (event_id,)
            ).fetchone()
            if row:
                return self._row_to_dict(row)
        return None

    def get_events(
        self,
        limit: int = 100,
        offset: int = 0,
        session_id: Optional[str] = None,
        agent_id: Optional[str] = None,
        action: Optional[str] = None,
        errors_only: bool = False,
        blocked_only: bool = False,
        search: Optional[str] = None,
        since: Optional[datetime] = None,
        until: Optional[datetime] = None,
    ) -> List[Dict[str, Any]]:
        """Get events with filtering and pagination"""
        query = "SELECT * FROM pty_events WHERE 1=1"
        params = []

        if session_id:
            query += " AND session_id = ?"
            params.append(session_id)
        if agent_id:
            query += " AND agent_id = ?"
            params.append(agent_id)
        if action:
            query += " AND action = ?"
            params.append(action)
        if errors_only:
            query += " AND success = 0"
        if blocked_only:
            query += " AND blocked = 1"
        if search:
            query += " AND (command LIKE ? OR response LIKE ? OR label LIKE ?)"
            params.extend([f"%{search}%"] * 3)
        if since:
            query += " AND timestamp >= ?"
            params.append(since.isoformat())
        if until:
            query += " AND timestamp <= ?"
            params.append(until.isoformat())

        query += " ORDER BY timestamp DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])

        with self._get_connection() as conn:
            rows = conn.execute(query, params).fetchall()
            return [self._row_to_dict(row) for row in rows]

    def get_session_summary(self, session_id: str) -> Optional[PTYSessionSummary]:
        """Get summary statistics for a specific PTY session"""
        with self._get_connection() as conn:
            # Get basic stats
            row = conn.execute("""
                SELECT
                    session_id,
                    agent_id,
                    owner_session_id,
                    label,
                    cli_type,
                    COUNT(*) as event_count,
                    SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as error_count,
                    SUM(CASE WHEN blocked = 1 THEN 1 ELSE 0 END) as blocked_count,
                    AVG(duration) as avg_duration,
                    SUM(command_size) as total_bytes_sent,
                    SUM(response_size) as total_bytes_received,
                    MIN(timestamp) as first_event_time,
                    MAX(timestamp) as last_event_time
                FROM pty_events
                WHERE session_id = ?
                GROUP BY session_id
            """, (session_id,)).fetchone()

            if not row:
                return None

            # Get action breakdown
            action_rows = conn.execute("""
                SELECT action, COUNT(*) as count
                FROM pty_events
                WHERE session_id = ?
                GROUP BY action
            """, (session_id,)).fetchall()
            action_breakdown = {r['action']: r['count'] for r in action_rows}

            return PTYSessionSummary(
                session_id=row['session_id'],
                agent_id=row['agent_id'],
                owner_session_id=row['owner_session_id'],
                label=row['label'],
                cli_type=row['cli_type'],
                event_count=row['event_count'],
                error_count=row['error_count'],
                blocked_count=row['blocked_count'],
                avg_duration=row['avg_duration'] or 0.0,
                total_bytes_sent=row['total_bytes_sent'] or 0,
                total_bytes_received=row['total_bytes_received'] or 0,
                first_event_time=datetime.fromisoformat(row['first_event_time']) if row['first_event_time'] else None,
                last_event_time=datetime.fromisoformat(row['last_event_time']) if row['last_event_time'] else None,
                action_breakdown=action_breakdown,
            )

    def get_all_sessions(self) -> List[PTYSessionSummary]:
        """Get summary for all PTY sessions"""
        with self._get_connection() as conn:
            sessions = conn.execute("""
                SELECT DISTINCT session_id FROM pty_events
            """).fetchall()
            return [
                self.get_session_summary(row['session_id'])
                for row in sessions
                if self.get_session_summary(row['session_id'])
            ]

    def get_blocked_commands(self, limit: int = 50) -> List[Dict[str, Any]]:
        """Get recent blocked commands"""
        return self.get_events(limit=limit, blocked_only=True)

    def cleanup_old_events(self):
        """Remove events older than retention period and enforce max count"""
        with self._lock:
            with self._get_connection() as conn:
                # Remove old events
                cutoff = (datetime.now() - timedelta(hours=RETENTION_HOURS)).isoformat()
                conn.execute(
                    "DELETE FROM pty_events WHERE timestamp < ?",
                    (cutoff,)
                )

                # Enforce max event count
                conn.execute("""
                    DELETE FROM pty_events WHERE id IN (
                        SELECT id FROM pty_events
                        ORDER BY timestamp DESC
                        LIMIT -1 OFFSET ?
                    )
                """, (MAX_EVENTS,))

    def get_stats(self) -> Dict[str, Any]:
        """Get storage statistics"""
        with self._get_connection() as conn:
            count = conn.execute("SELECT COUNT(*) as count FROM pty_events").fetchone()['count']
            oldest = conn.execute("SELECT MIN(timestamp) as oldest FROM pty_events").fetchone()['oldest']
            newest = conn.execute("SELECT MAX(timestamp) as newest FROM pty_events").fetchone()['newest']

            # Action breakdown
            action_rows = conn.execute("""
                SELECT action, COUNT(*) as count FROM pty_events GROUP BY action
            """).fetchall()
            action_breakdown = {r['action']: r['count'] for r in action_rows}

            # Agent breakdown
            agent_rows = conn.execute("""
                SELECT agent_id, COUNT(*) as count FROM pty_events
                WHERE agent_id IS NOT NULL GROUP BY agent_id
            """).fetchall()
            agent_breakdown = {r['agent_id']: r['count'] for r in agent_rows}

            # Session count
            session_count = conn.execute(
                "SELECT COUNT(DISTINCT session_id) as count FROM pty_events"
            ).fetchone()['count']

            # Error/blocked counts
            error_count = conn.execute(
                "SELECT COUNT(*) as count FROM pty_events WHERE success = 0"
            ).fetchone()['count']
            blocked_count = conn.execute(
                "SELECT COUNT(*) as count FROM pty_events WHERE blocked = 1"
            ).fetchone()['count']

            # Byte totals
            bytes_row = conn.execute("""
                SELECT
                    COALESCE(SUM(command_size), 0) as total_sent,
                    COALESCE(SUM(response_size), 0) as total_received
                FROM pty_events
            """).fetchone()

            return {
                "event_count": count,
                "session_count": session_count,
                "error_count": error_count,
                "blocked_count": blocked_count,
                "oldest_event": oldest,
                "newest_event": newest,
                "total_bytes_sent": bytes_row['total_sent'],
                "total_bytes_received": bytes_row['total_received'],
                "action_breakdown": action_breakdown,
                "agent_breakdown": agent_breakdown,
                "db_path": str(self.db_path),
                "max_events": MAX_EVENTS,
                "retention_hours": RETENTION_HOURS,
            }

    def _row_to_dict(self, row: sqlite3.Row) -> Dict[str, Any]:
        """Convert a database row to a dictionary"""
        d = dict(row)
        # Convert integer booleans
        for field in ['response_truncated', 'timed_out', 'success', 'blocked']:
            if field in d:
                d[field] = bool(d[field])
        return d


# Global storage instance
pty_traffic_storage = PTYTrafficStorage()


async def pty_cleanup_task():
    """Background task to periodically clean up old PTY events"""
    while True:
        await asyncio.sleep(3600)  # Run every hour
        pty_traffic_storage.cleanup_old_events()
