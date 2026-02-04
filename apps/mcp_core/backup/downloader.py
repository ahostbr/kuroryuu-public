"""Auto-download Restic binary from GitHub releases."""

from __future__ import annotations

import os
import platform
import shutil
import stat
import tempfile
import zipfile
from pathlib import Path
from typing import Any, Callable, Dict, Optional

import httpx

from .config import get_bin_dir

# Latest stable version as of 2026
RESTIC_VERSION = "0.17.3"
GITHUB_RELEASES_URL = "https://github.com/restic/restic/releases/download"


def get_platform_info() -> tuple[str, str]:
    """Get platform and architecture for download."""
    system = platform.system().lower()
    machine = platform.machine().lower()

    # Map to restic naming
    if system == "windows":
        os_name = "windows"
    elif system == "darwin":
        os_name = "darwin"
    else:
        os_name = "linux"

    # Map architecture
    if machine in ("x86_64", "amd64"):
        arch = "amd64"
    elif machine in ("arm64", "aarch64"):
        arch = "arm64"
    elif machine in ("i386", "i686", "x86"):
        arch = "386"
    else:
        arch = "amd64"  # Default fallback

    return os_name, arch


def get_download_url(version: str = RESTIC_VERSION) -> str:
    """Get download URL for current platform."""
    os_name, arch = get_platform_info()

    if os_name == "windows":
        filename = f"restic_{version}_{os_name}_{arch}.zip"
    else:
        filename = f"restic_{version}_{os_name}_{arch}.bz2"

    return f"{GITHUB_RELEASES_URL}/v{version}/{filename}"


def get_binary_path() -> Path:
    """Get path where restic binary should be installed."""
    bin_dir = get_bin_dir()
    if platform.system().lower() == "windows":
        return bin_dir / "restic.exe"
    return bin_dir / "restic"


def is_restic_installed() -> bool:
    """Check if restic binary exists."""
    return get_binary_path().exists()


def get_restic_version() -> Optional[str]:
    """Get installed restic version, or None if not installed."""
    import subprocess

    binary = get_binary_path()
    if not binary.exists():
        return None

    try:
        result = subprocess.run(
            [str(binary), "version"],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if result.returncode == 0:
            # Output like: "restic 0.17.3 compiled with go1.22.5 on windows/amd64"
            parts = result.stdout.strip().split()
            if len(parts) >= 2 and parts[0] == "restic":
                return parts[1]
    except Exception:
        pass
    return None


def download_restic(
    version: str = RESTIC_VERSION,
    progress_callback: Optional[Callable[[int, int], None]] = None,
) -> Dict[str, Any]:
    """Download and install restic binary.

    Args:
        version: Restic version to download
        progress_callback: Optional callback(bytes_downloaded, total_bytes)

    Returns:
        {ok, path, version} or {ok: False, error}
    """
    try:
        bin_dir = get_bin_dir()
        bin_dir.mkdir(parents=True, exist_ok=True)

        url = get_download_url(version)
        binary_path = get_binary_path()

        # Download to temp file
        with tempfile.NamedTemporaryFile(delete=False, suffix=".download") as tmp:
            tmp_path = Path(tmp.name)

        try:
            # Stream download
            with httpx.stream("GET", url, follow_redirects=True, timeout=300) as response:
                response.raise_for_status()
                total = int(response.headers.get("content-length", 0))
                downloaded = 0

                with tmp_path.open("wb") as f:
                    for chunk in response.iter_bytes(chunk_size=8192):
                        f.write(chunk)
                        downloaded += len(chunk)
                        if progress_callback and total > 0:
                            progress_callback(downloaded, total)

            # Extract based on format
            os_name, _ = get_platform_info()

            if os_name == "windows":
                # Extract from zip
                with zipfile.ZipFile(tmp_path, "r") as zf:
                    # Find restic.exe in archive
                    for name in zf.namelist():
                        if name.endswith("restic.exe") or name == "restic.exe":
                            with zf.open(name) as src, binary_path.open("wb") as dst:
                                shutil.copyfileobj(src, dst)
                            break
                    else:
                        # Just extract the first .exe
                        for name in zf.namelist():
                            if name.endswith(".exe"):
                                with zf.open(name) as src, binary_path.open("wb") as dst:
                                    shutil.copyfileobj(src, dst)
                                break
            else:
                # Extract from bz2
                import bz2
                with bz2.open(tmp_path, "rb") as src, binary_path.open("wb") as dst:
                    shutil.copyfileobj(src, dst)

                # Make executable on Unix
                binary_path.chmod(binary_path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)

        finally:
            # Clean up temp file
            try:
                tmp_path.unlink()
            except Exception:
                pass

        # Verify installation
        installed_version = get_restic_version()
        if not installed_version:
            return {"ok": False, "error": "Download succeeded but binary verification failed"}

        return {
            "ok": True,
            "path": str(binary_path),
            "version": installed_version,
        }

    except httpx.HTTPStatusError as e:
        return {"ok": False, "error": f"Download failed: HTTP {e.response.status_code}"}
    except Exception as e:
        return {"ok": False, "error": f"Download failed: {e}"}


def ensure_restic() -> Dict[str, Any]:
    """Ensure restic is installed, download if needed.

    Returns:
        {ok, path, version} or {ok: False, error}
    """
    binary_path = get_binary_path()

    if binary_path.exists():
        version = get_restic_version()
        if version:
            return {
                "ok": True,
                "path": str(binary_path),
                "version": version,
                "downloaded": False,
            }

    # Need to download
    result = download_restic()
    if result.get("ok"):
        result["downloaded"] = True
    return result
