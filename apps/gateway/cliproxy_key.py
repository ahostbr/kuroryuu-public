"""API key for the local CLIProxyAPIPlus.

New installs get a random key in the proxy's config.yaml (`api-keys`). Clients read it from
there rather than sending a key hard-coded in this public repo. The config is looked up the
same way Kuroryuu Desktop resolves it (cliproxy-native.ts getDefaultDataDir): the
project-local .cliproxyapi/ if it exists, else the per-user Kuroryuu/cliproxyapi directory.

Keep in sync with apps/kuroryuu_cli/cliproxy_key.py (a separately installed package).
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

# Configs written before random keys had no `api-keys`, so the proxy accepted any value.
LEGACY_API_KEY = "kuroryuu-local"

_FIRST_API_KEY = re.compile(
    r"^api-keys:[ \t]*\r?\n[ \t]+-[ \t]*[\"']?([^\"'\r\n#]+?)[\"']?[ \t]*(?:#.*)?$",
    re.MULTILINE,
)


def _data_dir() -> Path:
    root = Path(os.environ.get("KURORYUU_PROJECT_ROOT") or Path(__file__).resolve().parents[2])
    local = root / ".cliproxyapi"
    if local.is_dir():
        return local
    if sys.platform == "win32":
        return Path(os.environ.get("APPDATA", Path.home() / "AppData" / "Roaming")) / "Kuroryuu" / "cliproxyapi"
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "Kuroryuu" / "cliproxyapi"
    return Path.home() / ".config" / "Kuroryuu" / "cliproxyapi"


def cliproxy_api_key() -> str:
    """KURORYUU_CLIPROXY_API_KEY, else the first `api-keys` entry, else the legacy key."""
    from_env = os.environ.get("KURORYUU_CLIPROXY_API_KEY", "").strip()
    if from_env:
        return from_env
    try:
        text = (_data_dir() / "config.yaml").read_text(encoding="utf-8")
    except OSError:
        return LEGACY_API_KEY
    match = _FIRST_API_KEY.search(text)
    return match.group(1).strip() if match else LEGACY_API_KEY


def cliproxy_auth_header() -> str:
    """Value for the Authorization header."""
    return f"Bearer {cliproxy_api_key()}"
