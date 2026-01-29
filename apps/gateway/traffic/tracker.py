"""
Traffic Statistics Tracker
In-memory statistics tracking with sliding time window
"""
from collections import deque
from datetime import datetime, timedelta
import threading
from typing import Dict, Any, List, Optional


class TrafficStatisticsTracker:
    """
    Tracks traffic statistics in a sliding time window.
    Thread-safe with automatic cleanup of old events.
    """

    def __init__(self, window_seconds: int = 60):
        self.window_seconds = window_seconds
        self.events: deque = deque()
        self.lock = threading.Lock()
        self._total_all_time = 0

    def add_event(self, event: Dict[str, Any]):
        """Add a traffic event to the tracker."""
        with self.lock:
            self.events.append({
                **event,
                'timestamp': datetime.now()
            })
            self._total_all_time += 1
            self._cleanup_old_events()

    def _cleanup_old_events(self):
        """Remove events outside the time window"""
        cutoff = datetime.now() - timedelta(seconds=self.window_seconds)
        while self.events and self.events[0]['timestamp'] < cutoff:
            self.events.popleft()

    def get_stats(self) -> Dict[str, Any]:
        """Get current traffic statistics."""
        with self.lock:
            total = len(self.events)

            if total == 0:
                return {
                    'requestsPerSecond': 0,
                    'avgLatency': 0,
                    'errorRate': 0,
                    'totalRequests': self._total_all_time
                }

            # Count errors (4xx and 5xx)
            errors = sum(1 for e in self.events if e.get('status', 200) >= 400)

            # Calculate average latency
            durations = [e['duration'] for e in self.events if 'duration' in e]
            avg_latency = sum(durations) / len(durations) if durations else 0

            # Calculate requests per second (based on actual window)
            if self.events:
                oldest = self.events[0]['timestamp']
                newest = self.events[-1]['timestamp']
                actual_window = (newest - oldest).total_seconds()
                if actual_window > 0:
                    requests_per_second = total / actual_window
                else:
                    requests_per_second = total
            else:
                requests_per_second = 0

            return {
                'requestsPerSecond': round(requests_per_second, 2),
                'avgLatency': round(avg_latency, 2),
                'errorRate': round(errors / total, 4) if total > 0 else 0,
                'totalRequests': self._total_all_time
            }

    def get_recent_events(self, limit: int = 100, category: Optional[str] = None) -> List[Dict[str, Any]]:
        """Get recent traffic events with optional filtering."""
        with self.lock:
            events = list(self.events)

            # Filter by category if specified
            if category:
                events = [e for e in events if e.get('category') == category]

            recent = events[-limit:]
            # Convert datetime to ISO string for JSON serialization
            return [
                {
                    **event,
                    'timestamp': event['timestamp'].isoformat()
                }
                for event in recent
            ]

    def get_endpoint_breakdown(self) -> Dict[str, Dict[str, Any]]:
        """Get statistics broken down by endpoint category."""
        with self.lock:
            breakdown = {}
            for event in self.events:
                cat = event.get('category', 'other')
                if cat not in breakdown:
                    breakdown[cat] = {'count': 0, 'errors': 0, 'total_duration': 0}
                breakdown[cat]['count'] += 1
                if event.get('status', 200) >= 400:
                    breakdown[cat]['errors'] += 1
                if 'duration' in event:
                    breakdown[cat]['total_duration'] += event['duration']

            # Calculate averages
            for cat, stats in breakdown.items():
                if stats['count'] > 0:
                    stats['avg_latency'] = round(stats['total_duration'] / stats['count'], 2)
                    stats['error_rate'] = round(stats['errors'] / stats['count'], 4)
                del stats['total_duration']

            return breakdown


# Global tracker instance
traffic_tracker = TrafficStatisticsTracker()
