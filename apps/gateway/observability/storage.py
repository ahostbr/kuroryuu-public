"""
Observability Event Storage
SQLite-based persistent storage for hook events
24-hour retention, 50K event max
"""
import sqlite3
import json
import threading
import asyncio
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, Any, List, Optional
from contextlib import contextmanager

from .models import HookEventCreate
from ..utils.logging_config import get_logger

logger = get_logger(__name__)

# Storage location
STORAGE_DIR = Path(__file__).parent.parent.parent.parent / "ai" / "observability"
DB_PATH = STORAGE_DIR / "events.db"

# Retention settings
MAX_EVENTS = 50_000
RETENTION_HOURS = 24


class ObservabilityStorage:
    """
    SQLite-based hook event storage with automatic cleanup.
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
                CREATE TABLE IF NOT EXISTS hook_events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source_app TEXT NOT NULL,
                    session_id TEXT NOT NULL,
                    agent_id TEXT,
                    hook_event_type TEXT NOT NULL,
                    tool_name TEXT,
                    payload TEXT NOT NULL,
                    chat_transcript TEXT,
                    summary TEXT,
                    model_name TEXT,
                    timestamp INTEGER NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_obs_session_id ON hook_events(session_id);
                CREATE INDEX IF NOT EXISTS idx_obs_timestamp ON hook_events(timestamp DESC);
                CREATE INDEX IF NOT EXISTS idx_obs_event_type ON hook_events(hook_event_type);
                CREATE INDEX IF NOT EXISTS idx_obs_tool_name ON hook_events(tool_name);
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

    def store_event(self, event: HookEventCreate) -> Optional[int]:
        """Store a hook event, return its ID"""
        with self._lock:
            try:
                with self._get_connection() as conn:
                    cursor = conn.execute("""
                        INSERT INTO hook_events (
                            source_app, session_id, agent_id, hook_event_type,
                            tool_name, payload, chat_transcript, summary,
                            model_name, timestamp
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        event.source_app,
                        event.session_id,
                        event.agent_id,
                        event.hook_event_type,
                        event.tool_name,
                        json.dumps(self._sanitize_surrogates(event.payload)),
                        event.chat_transcript,
                        event.summary,
                        event.model_name,
                        event.timestamp,
                    ))
                    return cursor.lastrowid
            except Exception as e:
                logger.error(f"Error storing observability event: {e}")
                return None

    def get_recent_events(
        self,
        limit: int = 300,
        session_id: Optional[str] = None,
        source_app: Optional[str] = None,
        event_type: Optional[str] = None,
        tool_name: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Get recent events with optional filtering"""
        query = "SELECT * FROM hook_events WHERE 1=1"
        params: list = []

        if session_id:
            query += " AND session_id = ?"
            params.append(session_id)
        if source_app:
            query += " AND source_app = ?"
            params.append(source_app)
        if event_type:
            query += " AND hook_event_type = ?"
            params.append(event_type)
        if tool_name:
            query += " AND tool_name LIKE ?"
            params.append(f"%{tool_name}%")

        query += " ORDER BY timestamp DESC LIMIT ?"
        params.append(limit)

        with self._get_connection() as conn:
            rows = conn.execute(query, params).fetchall()
            return [self._row_to_dict(row) for row in rows]

    def get_filters(self) -> Dict[str, List[str]]:
        """Get distinct values for filter dropdowns"""
        with self._get_connection() as conn:
            source_apps = [r["source_app"] for r in conn.execute(
                "SELECT DISTINCT source_app FROM hook_events ORDER BY source_app"
            ).fetchall()]
            sessions = [r["session_id"] for r in conn.execute(
                "SELECT DISTINCT session_id FROM hook_events ORDER BY session_id"
            ).fetchall()]
            event_types = [r["hook_event_type"] for r in conn.execute(
                "SELECT DISTINCT hook_event_type FROM hook_events ORDER BY hook_event_type"
            ).fetchall()]
            return {
                "source_apps": source_apps,
                "sessions": sessions,
                "event_types": event_types,
            }

    def get_stats(self) -> Dict[str, Any]:
        """Get aggregate statistics"""
        with self._get_connection() as conn:
            total = conn.execute("SELECT COUNT(*) as c FROM hook_events").fetchone()["c"]

            # Events in last minute
            one_min_ago = int((datetime.utcnow() - timedelta(minutes=1)).timestamp() * 1000)
            recent = conn.execute(
                "SELECT COUNT(*) as c FROM hook_events WHERE timestamp > ?",
                (one_min_ago,)
            ).fetchone()["c"]

            # Active sessions (events in last 5 min)
            five_min_ago = int((datetime.utcnow() - timedelta(minutes=5)).timestamp() * 1000)
            active_sessions = conn.execute(
                "SELECT COUNT(DISTINCT session_id) as c FROM hook_events WHERE timestamp > ?",
                (five_min_ago,)
            ).fetchone()["c"]

            # Tool counts
            tool_rows = conn.execute(
                "SELECT tool_name, COUNT(*) as c FROM hook_events WHERE tool_name IS NOT NULL GROUP BY tool_name ORDER BY c DESC LIMIT 20"
            ).fetchall()
            tool_counts = {r["tool_name"]: r["c"] for r in tool_rows}

            # Event type counts
            type_rows = conn.execute(
                "SELECT hook_event_type, COUNT(*) as c FROM hook_events GROUP BY hook_event_type ORDER BY c DESC"
            ).fetchall()
            event_type_counts = {r["hook_event_type"]: r["c"] for r in type_rows}

            return {
                "total_events": total,
                "events_per_minute": recent,
                "active_sessions": active_sessions,
                "tool_counts": tool_counts,
                "event_type_counts": event_type_counts,
                "storage": {
                    "db_path": str(self.db_path),
                    "max_events": MAX_EVENTS,
                    "retention_hours": RETENTION_HOURS,
                },
            }

    def clear_all_events(self) -> int:
        """Delete all events. Returns count deleted."""
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.execute("SELECT COUNT(*) FROM hook_events")
                count = cursor.fetchone()[0]
                conn.execute("DELETE FROM hook_events")
                return count

    def delete_session_events(self, session_id: str) -> int:
        """Delete all events for a specific session. Returns count deleted."""
        with self._lock:
            with self._get_connection() as conn:
                cursor = conn.execute("SELECT COUNT(*) FROM hook_events WHERE session_id = ?", (session_id,))
                count = cursor.fetchone()[0]
                conn.execute("DELETE FROM hook_events WHERE session_id = ?", (session_id,))
                return count

    def export_session_events(self, session_id: str) -> List[Dict[str, Any]]:
        """Export all events for a specific session."""
        with self._get_connection() as conn:
            rows = conn.execute(
                "SELECT * FROM hook_events WHERE session_id = ? ORDER BY timestamp ASC",
                (session_id,),
            ).fetchall()
            return [self._row_to_dict(row) for row in rows]

    def export_all_events(self) -> List[Dict[str, Any]]:
        """Export all events for backup/download."""
        with self._get_connection() as conn:
            rows = conn.execute(
                "SELECT * FROM hook_events ORDER BY timestamp ASC"
            ).fetchall()
            return [self._row_to_dict(row) for row in rows]

    def import_events(self, events: List[Dict[str, Any]]) -> Dict[str, int]:
        """Import events from a backup. Skips duplicates by source_app+session_id+timestamp+hook_event_type."""
        imported = 0
        skipped = 0
        with self._lock:
            with self._get_connection() as conn:
                for ev in events:
                    # Check for duplicate by composite key
                    existing = conn.execute(
                        "SELECT 1 FROM hook_events WHERE source_app=? AND session_id=? AND timestamp=? AND hook_event_type=? LIMIT 1",
                        (ev.get("source_app", ""), ev.get("session_id", ""), ev.get("timestamp", 0), ev.get("hook_event_type", "")),
                    ).fetchone()
                    if existing:
                        skipped += 1
                        continue
                    payload = ev.get("payload", {})
                    if isinstance(payload, dict):
                        payload = json.dumps(payload)
                    conn.execute("""
                        INSERT INTO hook_events (
                            source_app, session_id, agent_id, hook_event_type,
                            tool_name, payload, chat_transcript, summary,
                            model_name, timestamp
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, (
                        ev.get("source_app", "kuroryuu"),
                        ev.get("session_id", ""),
                        ev.get("agent_id"),
                        ev.get("hook_event_type", ""),
                        ev.get("tool_name"),
                        payload,
                        ev.get("chat_transcript"),
                        ev.get("summary"),
                        ev.get("model_name"),
                        ev.get("timestamp", 0),
                    ))
                    imported += 1
        return {"imported": imported, "skipped": skipped}

    def cleanup_old_events(self):
        """Remove events older than retention period and enforce max count"""
        with self._lock:
            with self._get_connection() as conn:
                cutoff = int((datetime.utcnow() - timedelta(hours=RETENTION_HOURS)).timestamp() * 1000)
                conn.execute("DELETE FROM hook_events WHERE timestamp < ?", (cutoff,))

                conn.execute("""
                    DELETE FROM hook_events WHERE id IN (
                        SELECT id FROM hook_events
                        ORDER BY timestamp DESC
                        LIMIT -1 OFFSET ?
                    )
                """, (MAX_EVENTS,))

    @staticmethod
    def _sanitize_surrogates(obj):
        """Replace orphan UTF-16 surrogates that crash UTF-8 encoding.

        Windows file system APIs can produce lone surrogates (U+D800..U+DFFF)
        in paths. These are valid in Python strings but cannot be encoded to
        UTF-8, causing FastAPI's JSONResponse to crash with:
          UnicodeEncodeError: 'utf-8' codec can't encode character '\\udXXX'
        """
        if isinstance(obj, str):
            # encode with surrogatepass to preserve, then decode with replace
            # to swap surrogates for the Unicode replacement character
            return obj.encode('utf-16', 'surrogatepass').decode('utf-16', 'replace')
        if isinstance(obj, dict):
            return {k: ObservabilityStorage._sanitize_surrogates(v) for k, v in obj.items()}
        if isinstance(obj, list):
            return [ObservabilityStorage._sanitize_surrogates(item) for item in obj]
        return obj

    def _row_to_dict(self, row: sqlite3.Row) -> Dict[str, Any]:
        """Convert a database row to a dictionary"""
        d = dict(row)
        if d.get("payload"):
            try:
                d["payload"] = self._sanitize_surrogates(json.loads(d["payload"]))
            except json.JSONDecodeError:
                d["payload"] = {}
        return d


# Global storage instance
observability_storage = ObservabilityStorage()


async def cleanup_task():
    """Background task to periodically clean up old events"""
    while True:
        await asyncio.sleep(3600)  # Run every hour
        observability_storage.cleanup_old_events()
