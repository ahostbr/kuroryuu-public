"""Backup configuration management.

Config location: ~/.kuroryuu/restic-local-settings/
- backup_config.json: Main configuration
- exclusions.txt: Exclude patterns (one per line)
"""

from __future__ import annotations

import json
import os
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

# Try to import bcrypt for password hashing, fall back to hashlib
try:
    import bcrypt
    BCRYPT_AVAILABLE = True
except ImportError:
    BCRYPT_AVAILABLE = False
    import hashlib


def get_config_dir() -> Path:
    """Get config directory: ~/.kuroryuu/restic-local-settings/"""
    return Path.home() / ".kuroryuu" / "restic-local-settings"


def get_bin_dir() -> Path:
    """Get binary directory: ~/.kuroryuu/bin/"""
    return Path.home() / ".kuroryuu" / "bin"


def get_default_repo_path() -> Path:
    """Get default repository path: ~/.kuroryuu/restic-repo/"""
    return Path.home() / ".kuroryuu" / "restic-repo"


def get_default_config() -> Dict[str, Any]:
    """Return default configuration structure."""
    return {
        "schema_version": "1.0",
        "repository": {
            "path": str(get_default_repo_path()),
            "type": "local",
            "password_hash": None,
            "initialized": False,
            "last_check": None,
        },
        "backup": {
            "source_path": "",
            "exclusions_file": "exclusions.txt",
            "default_tags": ["manual"],
            "compression": "auto",
        },
        "retention": {
            "keep_last": 30,
            "keep_daily": 7,
            "keep_weekly": 4,
            "keep_monthly": 6,
        },
        "schedule": {
            "enabled": False,
            "interval_hours": 24,
            "last_auto_backup": None,
            "next_auto_backup": None,
        },
    }


DEFAULT_EXCLUSIONS = [
    "# Node.js",
    "**/node_modules/",
    "**/.next/",
    "**/dist/",
    "**/build/",
    "",
    "# Python",
    "**/__pycache__/",
    "**/*.pyc",
    "**/.venv/",
    "**/venv/",
    "**/.env/",
    "",
    "# Large/temp files",
    "**/*.zip",
    "**/*.tar.gz",
    "**/*.7z",
    "**/*.tmp",
    "**/*.temp",
    "",
    "# OS files",
    "**/.DS_Store",
    "**/Thumbs.db",
    "",
    "# Restic repo itself",
    ".kuroryuu/restic-repo/",
]


def _write_json_atomic(path: Path, obj: Dict[str, Any]) -> None:
    """Atomic JSON write with temp file."""
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.parent / f".{path.name}.tmp_{uuid.uuid4().hex}"
    data = json.dumps(obj, ensure_ascii=False, indent=2) + "\n"
    with tmp.open("w", encoding="utf-8", newline="\n") as f:
        f.write(data)
        f.flush()
        os.fsync(f.fileno())
    os.replace(str(tmp), str(path))


def _hash_password(password: str) -> str:
    """Hash password using bcrypt or fallback to SHA256."""
    if BCRYPT_AVAILABLE:
        return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
    else:
        # Fallback: SHA256 with salt (less secure but no dependency)
        salt = uuid.uuid4().hex
        hashed = hashlib.sha256((salt + password).encode()).hexdigest()
        return f"sha256:{salt}:{hashed}"


def _verify_password(password: str, stored_hash: str) -> bool:
    """Verify password against stored hash."""
    if not stored_hash:
        return False

    if BCRYPT_AVAILABLE and not stored_hash.startswith("sha256:"):
        return bcrypt.checkpw(password.encode(), stored_hash.encode())
    elif stored_hash.startswith("sha256:"):
        # Fallback verification
        parts = stored_hash.split(":")
        if len(parts) != 3:
            return False
        _, salt, expected = parts
        actual = hashlib.sha256((salt + password).encode()).hexdigest()
        return actual == expected
    return False


class BackupConfig:
    """Backup configuration manager."""

    def __init__(self) -> None:
        self.config_dir = get_config_dir()
        self.config_path = self.config_dir / "backup_config.json"
        self.exclusions_path = self.config_dir / "exclusions.txt"
        self._config: Optional[Dict[str, Any]] = None
        self._password: Optional[str] = None  # Cached in memory only

    def _ensure_dirs(self) -> None:
        """Create config directory if needed."""
        self.config_dir.mkdir(parents=True, exist_ok=True)
        get_bin_dir().mkdir(parents=True, exist_ok=True)

    def load(self) -> Dict[str, Any]:
        """Load config from disk, create default if missing."""
        self._ensure_dirs()

        if self.config_path.exists():
            try:
                with self.config_path.open("r", encoding="utf-8") as f:
                    self._config = json.load(f)
            except (json.JSONDecodeError, OSError):
                self._config = get_default_config()
                self.save()
        else:
            self._config = get_default_config()
            self.save()
            # Also create default exclusions
            self._write_default_exclusions()

        return self._config

    def save(self) -> None:
        """Save config to disk atomically."""
        self._ensure_dirs()
        if self._config is None:
            self._config = get_default_config()
        _write_json_atomic(self.config_path, self._config)

    def get(self, key: str, default: Any = None) -> Any:
        """Get config value by dot-notation key (e.g. 'repository.path')."""
        if self._config is None:
            self.load()

        parts = key.split(".")
        value = self._config
        for part in parts:
            if isinstance(value, dict):
                value = value.get(part, default)
            else:
                return default
        return value

    def set(self, key: str, value: Any) -> None:
        """Set config value by dot-notation key."""
        if self._config is None:
            self.load()

        parts = key.split(".")
        obj = self._config
        for part in parts[:-1]:
            if part not in obj or not isinstance(obj[part], dict):
                obj[part] = {}
            obj = obj[part]
        obj[parts[-1]] = value
        self.save()

    def set_password(self, password: str) -> None:
        """Set repository password (stores hash, caches plaintext in memory)."""
        self._password = password
        password_hash = _hash_password(password)
        self.set("repository.password_hash", password_hash)

    def verify_password(self, password: str) -> bool:
        """Verify password against stored hash."""
        stored_hash = self.get("repository.password_hash")
        return _verify_password(password, stored_hash)

    def get_password(self) -> Optional[str]:
        """Get cached password (only available in current session)."""
        return self._password

    def set_cached_password(self, password: str) -> None:
        """Set password in memory cache without saving hash."""
        self._password = password

    def get_exclusions(self) -> List[str]:
        """Read exclusion patterns from file."""
        if not self.exclusions_path.exists():
            self._write_default_exclusions()

        patterns = []
        with self.exclusions_path.open("r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    patterns.append(line)
        return patterns

    def set_exclusions(self, patterns: List[str]) -> None:
        """Write exclusion patterns to file."""
        self._ensure_dirs()
        with self.exclusions_path.open("w", encoding="utf-8", newline="\n") as f:
            for pattern in patterns:
                f.write(f"{pattern}\n")

    def _write_default_exclusions(self) -> None:
        """Write default exclusion patterns."""
        self._ensure_dirs()
        with self.exclusions_path.open("w", encoding="utf-8", newline="\n") as f:
            for line in DEFAULT_EXCLUSIONS:
                f.write(f"{line}\n")

    def is_configured(self) -> bool:
        """Check if backup is fully configured."""
        if self._config is None:
            self.load()
        return bool(
            self.get("repository.path")
            and self.get("repository.initialized")
            and self.get("backup.source_path")
        )

    def get_repo_path(self) -> Path:
        """Get repository path."""
        return Path(self.get("repository.path", str(get_default_repo_path())))

    def get_source_path(self) -> Optional[Path]:
        """Get backup source path."""
        source = self.get("backup.source_path")
        return Path(source) if source else None
