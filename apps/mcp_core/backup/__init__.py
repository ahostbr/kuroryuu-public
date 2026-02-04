"""Kuroryuu Backup Module - Restic-based backup management.

Submodules:
- config: Configuration management (~/.kuroryuu/restic-local-settings/)
- downloader: Auto-download restic binary from GitHub
- restic_wrapper: Safe binary invocation with password handling
- streaming: Real-time progress emission to Gateway
- snapshot_utils: Git-like snapshot metadata enrichment
"""

from .config import BackupConfig, get_config_dir, get_default_config
from .restic_wrapper import ResticWrapper
from .streaming import emit_backup_progress
from .snapshot_utils import enrich_snapshot, format_bytes, format_time_ago

__all__ = [
    "BackupConfig",
    "get_config_dir",
    "get_default_config",
    "ResticWrapper",
    "emit_backup_progress",
    "enrich_snapshot",
    "format_bytes",
    "format_time_ago",
]
