"""Artifact management for swarm runs."""
import json
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional


class ArtifactManager:
    """Manages artifacts produced by swarm agents."""
    
    def __init__(self, base_dir: Path):
        self.base_dir = Path(base_dir)
        self.base_dir.mkdir(parents=True, exist_ok=True)
        
    def save_artifact(
        self,
        swarm_id: str,
        role: str,
        filename: str,
        content: str
    ) -> Path:
        """Save an artifact for a role."""
        artifact_dir = self.base_dir / swarm_id
        artifact_dir.mkdir(parents=True, exist_ok=True)
        
        artifact_path = artifact_dir / filename
        artifact_path.write_text(content, encoding='utf-8')
        
        return artifact_path
        
    def load_artifact(self, swarm_id: str, filename: str) -> Optional[str]:
        """Load an artifact if it exists."""
        artifact_path = self.base_dir / swarm_id / filename
        if artifact_path.exists():
            return artifact_path.read_text(encoding='utf-8')
        return None
        
    def list_swarms(self) -> List[Dict]:
        """List all swarm runs with their summaries."""
        swarms = []
        
        for swarm_dir in self.base_dir.iterdir():
            if swarm_dir.is_dir() and swarm_dir.name.startswith('swarm_'):
                summary_path = swarm_dir / 'summary.json'
                if summary_path.exists():
                    summary = json.loads(summary_path.read_text(encoding='utf-8'))
                    swarms.append(summary)
                else:
                    # Partial swarm (no summary yet)
                    swarms.append({
                        'swarm_id': swarm_dir.name,
                        'task_id': 'unknown',
                        'approved': None,
                        'artifacts': {}
                    })
                    
        return sorted(swarms, key=lambda x: x.get('swarm_id', ''), reverse=True)
        
    def get_latest_swarm(self, task_id: Optional[str] = None) -> Optional[Dict]:
        """Get the most recent swarm, optionally filtered by task."""
        swarms = self.list_swarms()
        
        if task_id:
            swarms = [s for s in swarms if s.get('task_id') == task_id]
            
        return swarms[0] if swarms else None
        
    def cleanup_old_swarms(self, keep_count: int = 10):
        """Remove old swarm directories, keeping the most recent ones."""
        import shutil
        
        swarms = sorted(
            [d for d in self.base_dir.iterdir() if d.is_dir()],
            key=lambda d: d.stat().st_mtime,
            reverse=True
        )
        
        for swarm_dir in swarms[keep_count:]:
            shutil.rmtree(swarm_dir)
