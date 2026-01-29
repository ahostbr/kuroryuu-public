# sots_capture_ffmpeg.py
# SOTS Debug Capture wrapper for Windows + ffmpeg (gdigrab).
#
# OPTION C (VisualDigest) ADD-ON:
#   - When enabled, the capture also produces a "Buddy-friendly" always-current digest:
#       <script_dir>/SOTS_Capture/VisualDigest/latest/
#           latest.jpg       (updates live while recording)
#           storyboard.jpg   (updates periodically if Pillow is installed; otherwise created after recording)
#           manifest.json
#           run.log
#
#   - Per-session archive lives under the capture day folder:
#       <day_folder>/VisualDigestSessions/<mp4_stem>/
#           frames/frame_000001.jpg ...   (at digest_fps, default 0.1)
#           storyboard.jpg
#           manifest.json
#           run.log
#
# Notes:
#   - This patch is ADDITIVE: does not remove any existing flags/menus.
#   - Storyboard live updates require Pillow (pip install pillow). If missing,
#     we still do latest.jpg live and we generate storyboard at the end (best-effort).
#
# Existing Notes:
#   - Requires Windows.
#   - Some protected/hardware surfaces may not capture correctly with gdigrab.

from __future__ import annotations

import argparse
import datetime as dt
import json
import math
import os
import shlex
import shutil
import subprocess
import threading
import time
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import ctypes
from ctypes import wintypes


# -----------------------------
# Win32 helpers (ctypes)
# -----------------------------

user32 = ctypes.WinDLL("user32", use_last_error=True)

SM_XVIRTUALSCREEN = 76
SM_YVIRTUALSCREEN = 77
SM_CXVIRTUALSCREEN = 78
SM_CYVIRTUALSCREEN = 79


def get_virtual_screen_rect() -> Tuple[int, int, int, int]:
    """Returns (x, y, w, h) for the full virtual desktop (all monitors)."""
    x = user32.GetSystemMetrics(SM_XVIRTUALSCREEN)
    y = user32.GetSystemMetrics(SM_YVIRTUALSCREEN)
    w = user32.GetSystemMetrics(SM_CXVIRTUALSCREEN)
    h = user32.GetSystemMetrics(SM_CYVIRTUALSCREEN)
    return int(x), int(y), int(w), int(h)


@dataclass
class MonitorInfo:
    index: int
    device: str
    left: int
    top: int
    right: int
    bottom: int

    @property
    def width(self) -> int:
        return self.right - self.left

    @property
    def height(self) -> int:
        return self.bottom - self.top


class RECT(ctypes.Structure):
    _fields_ = [
        ("left", wintypes.LONG),
        ("top", wintypes.LONG),
        ("right", wintypes.LONG),
        ("bottom", wintypes.LONG),
    ]


class MONITORINFOEXW(ctypes.Structure):
    _fields_ = [
        ("cbSize", wintypes.DWORD),
        ("rcMonitor", RECT),
        ("rcWork", RECT),
        ("dwFlags", wintypes.DWORD),
        ("szDevice", wintypes.WCHAR * 32),
    ]


MONITORENUMPROC = ctypes.WINFUNCTYPE(
    wintypes.BOOL,
    wintypes.HMONITOR,
    wintypes.HDC,
    ctypes.POINTER(RECT),
    wintypes.LPARAM,
)


def get_monitors() -> List[MonitorInfo]:
    monitors: List[MonitorInfo] = []

    def _callback(hMonitor, hdcMonitor, lprcMonitor, dwData):
        info = MONITORINFOEXW()
        info.cbSize = ctypes.sizeof(MONITORINFOEXW)
        if not user32.GetMonitorInfoW(hMonitor, ctypes.byref(info)):
            return True

        rc = info.rcMonitor
        idx = len(monitors)
        monitors.append(
            MonitorInfo(
                index=idx,
                device=str(info.szDevice),
                left=int(rc.left),
                top=int(rc.top),
                right=int(rc.right),
                bottom=int(rc.bottom),
            )
        )
        return True

    cb = MONITORENUMPROC(_callback)
    if not user32.EnumDisplayMonitors(0, 0, cb, 0):
        raise RuntimeError("EnumDisplayMonitors failed")

    return monitors


# -----------------------------
# Config / presets
# -----------------------------

SETTINGS_SCHEMA_VERSION = 3  # bumped for VisualDigest fields
PRESETS_SCHEMA_VERSION = 2   # bumped for VisualDigest defaults in presets

SCALE_PRESETS: Dict[str, Optional[Tuple[int, int]]] = {
    "none": None,  # default: no scaling, keep native clarity
    "4k": (3840, 2160),
    "2160p": (3840, 2160),
    "1440p": (2560, 1440),
    "1080p": (1920, 1080),
    "720p": (1280, 720),
}

PIX_FMT_PRESETS = ["yuv420p", "yuv444p", "rgb24"]


def try_import_pillow():
    try:
        from PIL import Image  # type: ignore
        return Image
    except Exception:
        return None


def iso_local_now() -> str:
    return dt.datetime.now().astimezone().isoformat(timespec="seconds")


def quote_cmd(cmd: List[str]) -> str:
    return " ".join(shlex.quote(c) for c in cmd)


def build_vf(scale_preset: str, scale_w: int, scale_h: int) -> Optional[str]:
    if scale_preset.lower() != "none":
        preset = SCALE_PRESETS.get(scale_preset.lower())
        if preset is None:
            raise ValueError(f"Unknown scale preset: {scale_preset}")
        w, h = preset
        return f"scale={w}:{h}"

    if scale_w > 0 and scale_h > 0:
        return f"scale={scale_w}:{scale_h}"

    return None


# -----------------------------
# VisualDigest (Option C) helpers
# -----------------------------

def visualdigest_global_latest_dir(script_dir: Path) -> Path:
    return script_dir / "SOTS_Capture" / "VisualDigest" / "latest"


def visualdigest_session_dir(out_path: Path) -> Path:
    # Keep archives next to capture day folder so they get backed up with the MP4.
    return out_path.parent / "VisualDigestSessions" / out_path.stem


def safe_mkdir(p: Path) -> None:
    p.mkdir(parents=True, exist_ok=True)


def write_text(p: Path, s: str) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(s, encoding="utf-8")


def append_text(p: Path, s: str) -> None:
    p.parent.mkdir(parents=True, exist_ok=True)
    with p.open("a", encoding="utf-8") as f:
        f.write(s)


def log_to(path: Path, msg: str, also_print: bool = True) -> None:
    line = f"[{iso_local_now()}] {msg}\n"
    append_text(path, line)
    if also_print:
        print(line, end="")


def list_images_sorted(frames_dir: Path) -> List[Path]:
    if not frames_dir.exists():
        return []
    imgs = [p for p in frames_dir.iterdir() if p.is_file() and p.suffix.lower() in (".jpg", ".jpeg", ".png", ".webp")]
    imgs.sort(key=lambda p: (p.stat().st_mtime, p.name))
    return imgs


def sample_evenly(items: List[Path], max_items: int) -> List[Path]:
    if max_items <= 0 or len(items) <= max_items:
        return items
    n = len(items)
    step = n / float(max_items)
    out: List[Path] = []
    for i in range(max_items):
        idx = int(math.floor(i * step))
        idx = min(idx, n - 1)
        out.append(items[idx])
    if out and out[-1] != items[-1]:
        out[-1] = items[-1]
    return out


def build_storyboard_pillow(frames: List[Path], out_path: Path, cols: int, thumb_w: int, thumb_h: int) -> bool:
    Image = try_import_pillow()
    if Image is None:
        return False
    if not frames:
        return False

    cols = max(1, int(cols))
    rows = int(math.ceil(len(frames) / float(cols)))

    canvas_w = cols * thumb_w
    canvas_h = rows * thumb_h
    canvas = Image.new("RGB", (canvas_w, canvas_h))

    for i, p in enumerate(frames):
        r = i // cols
        c = i % cols
        try:
            im = Image.open(p)
            im = im.convert("RGB")
            im = im.resize((thumb_w, thumb_h))
            canvas.paste(im, (c * thumb_w, r * thumb_h))
        except Exception:
            # skip bad frames
            pass

    out_path.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out_path, quality=85)
    return True


def run_ffmpeg(cmd: List[str], log_path: Path) -> int:
    log_to(log_path, "CMD: " + quote_cmd(cmd))
    try:
        p = subprocess.run(cmd, capture_output=True, text=True)
        out = (p.stdout or "") + (p.stderr or "")
        if out.strip():
            log_to(log_path, "CMD_OUTPUT:\n" + out.strip(), also_print=False)
        return int(p.returncode)
    except Exception as e:
        log_to(log_path, f"ERROR running ffmpeg: {e}")
        return 1


def build_storyboard_best_effort(
    ffmpeg_exe: str,
    frames_dir: Path,
    out_path: Path,
    cols: int,
    thumb_w: int,
    thumb_h: int,
    max_frames: int,
    log_path: Path,
) -> bool:
    frames_all = list_images_sorted(frames_dir)
    if not frames_all:
        log_to(log_path, "Storyboard: no frames yet.")
        return False

    frames = sample_evenly(frames_all, max_frames=max_frames)

    # First try Pillow (best control, no ffmpeg complexity).
    if build_storyboard_pillow(frames, out_path, cols=cols, thumb_w=thumb_w, thumb_h=thumb_h):
        log_to(log_path, f"Storyboard written (Pillow): {out_path}")
        return True

    # If Pillow missing, do a pragmatic ffmpeg fallback:
    # - Copy chosen frames into a temp folder with sequential numbering,
    # - Use tile filter to generate a single image.
    tmp = out_path.parent / "._tmp_storyboard"
    if tmp.exists():
        shutil.rmtree(tmp, ignore_errors=True)
    safe_mkdir(tmp)

    # Renumber frames to %06d.jpg
    for i, src in enumerate(frames, start=1):
        dst = tmp / f"frame_{i:06d}.jpg"
        try:
            shutil.copy2(src, dst)
        except Exception:
            pass

    rows = int(math.ceil(len(frames) / float(max(1, cols))))
    # NOTE: This will stretch; it's a fallback.
    tile_vf = f"scale={thumb_w}:{thumb_h},tile={max(1, cols)}x{max(1, rows)}"
    cmd = [
        ffmpeg_exe,
        "-y",
        "-hide_banner",
        "-loglevel", "error",
        "-i", str(tmp / "frame_%06d.jpg"),
        "-frames:v", "1",
        "-vf", tile_vf,
        "-q:v", "3",
        str(out_path),
    ]
    rc = run_ffmpeg(cmd, log_path=log_path)
    shutil.rmtree(tmp, ignore_errors=True)

    if rc == 0 and out_path.exists():
        log_to(log_path, f"Storyboard written (ffmpeg fallback): {out_path}")
        return True

    log_to(log_path, "Storyboard: failed (no Pillow; ffmpeg fallback failed).")
    return False


class VisualDigestLiveUpdater(threading.Thread):
    """
    Watches a frames folder and periodically refreshes global VisualDigest/latest
    storyboard + manifest as frames arrive.
    """

    def __init__(
        self,
        ffmpeg_exe: str,
        script_dir: Path,
        out_mp4: Path,
        session_dir: Path,
        cfg: "CaptureConfig",
        stop_evt: threading.Event,
    ):
        super().__init__(daemon=True)
        self.ffmpeg_exe = ffmpeg_exe
        self.script_dir = script_dir
        self.out_mp4 = out_mp4
        self.session_dir = session_dir
        self.cfg = cfg
        self.stop_evt = stop_evt

        self.global_dir = visualdigest_global_latest_dir(script_dir)
        safe_mkdir(self.global_dir)
        self.global_log = self.global_dir / "run.log"
        self.session_log = self.session_dir / "run.log"

        safe_mkdir(self.session_dir)
        safe_mkdir(self.session_dir / "frames")

        # internal
        self._last_frame_count = -1
        self._last_storyboard_ts = 0.0

    def _write_manifest(self, live: bool, note: str = "") -> None:
        frames = list_images_sorted(self.session_dir / "frames")
        payload = {
            "schema": 1,
            "updated_at": iso_local_now(),
            "live": bool(live),
            "note": note,
            "mp4": str(self.out_mp4),
            "session_dir": str(self.session_dir),
            "global_latest_dir": str(self.global_dir),
            "digest": {
                "enabled": bool(self.cfg.digest_enabled),
                "fps": float(self.cfg.digest_fps),
                "max_frames": int(self.cfg.digest_storyboard_max_frames),
                "cols": int(self.cfg.digest_storyboard_cols),
                "thumb_w": int(self.cfg.digest_thumb_w),
                "thumb_h": int(self.cfg.digest_thumb_h),
                "storyboard_interval_sec": int(self.cfg.digest_storyboard_interval_sec),
                "write_storyboard": bool(self.cfg.digest_write_storyboard),
            },
            "frames": {
                "count": len(frames),
                "first": frames[0].name if frames else "",
                "last": frames[-1].name if frames else "",
            },
        }
        write_text(self.session_dir / "manifest.json", json.dumps(payload, indent=2))
        write_text(self.global_dir / "manifest.json", json.dumps(payload, indent=2))

    def _copy_latest_if_exists(self) -> None:
        # latest.jpg is written live by ffmpeg directly into global dir. We also mirror it into session dir.
        gl = self.global_dir / "latest.jpg"
        if gl.exists():
            try:
                shutil.copy2(gl, self.session_dir / "latest.jpg")
            except Exception:
                pass

    def _maybe_update_storyboard(self, force: bool = False) -> None:
        if not self.cfg.digest_write_storyboard:
            return

        now = time.time()
        if not force and (now - self._last_storyboard_ts) < float(self.cfg.digest_storyboard_interval_sec):
            return

        ok = build_storyboard_best_effort(
            ffmpeg_exe=self.ffmpeg_exe,
            frames_dir=self.session_dir / "frames",
            out_path=self.session_dir / "storyboard.jpg",
            cols=self.cfg.digest_storyboard_cols,
            thumb_w=self.cfg.digest_thumb_w,
            thumb_h=self.cfg.digest_thumb_h,
            max_frames=self.cfg.digest_storyboard_max_frames,
            log_path=self.session_log,
        )
        if ok:
            # mirror to global
            try:
                shutil.copy2(self.session_dir / "storyboard.jpg", self.global_dir / "storyboard.jpg")
            except Exception:
                pass
        self._last_storyboard_ts = now

    def run(self) -> None:
        log_to(self.session_log, f"[VisualDigest] Live updater started. session={self.session_dir}")
        log_to(self.global_log, f"[VisualDigest] Live updater started. mp4={self.out_mp4}", also_print=False)

        self._write_manifest(live=True, note="recording started")
        self._copy_latest_if_exists()

        while not self.stop_evt.is_set():
            frames = list_images_sorted(self.session_dir / "frames")
            count = len(frames)

            if count != self._last_frame_count:
                self._last_frame_count = count
                self._write_manifest(live=True, note="frames updated")
                self._copy_latest_if_exists()
                self._maybe_update_storyboard(force=False)

            time.sleep(max(0.5, float(self.cfg.digest_poll_interval_sec)))

        # final flush
        self._copy_latest_if_exists()
        self._maybe_update_storyboard(force=True)
        self._write_manifest(live=False, note="recording stopped")

        log_to(self.session_log, "[VisualDigest] Live updater stopped.")
        log_to(self.global_log, "[VisualDigest] Live updater stopped.", also_print=False)


# -----------------------------
# Capture config models
# -----------------------------

@dataclass
class CaptureConfig:
    # Preset identity (optional)
    profile_name: str = "CUSTOM"
    profile_key: str = ""

    # Capture behavior
    mode: str = "virtual"          # virtual|desktop|monitor|window
    fps: float = 1.0
    out: str = ""                  # optional; absolute or relative
    duration: float = 0.0          # 0 => until 'q'
    crf: int = 30
    x264_preset: str = "veryfast"
    draw_mouse: int = 1
    window_title: str = ""
    monitor_index: int = 0
    scale_preset: str = "none"
    scale_w: int = 0
    scale_h: int = 0
    pix_fmt: str = "yuv420p"

    # Extra ffmpeg args appended near the encoder section (advanced)
    ffmpeg_extra: List[str] = field(default_factory=list)

    # tool paths (optional)
    ffmpeg_path: str = ""
    ffprobe_path: str = ""

    # -----------------------------
    # VisualDigest (Option C)
    # -----------------------------
    digest_enabled: bool = True
    digest_fps: float = 0.1
    digest_write_storyboard: bool = True
    digest_storyboard_max_frames: int = 60
    digest_storyboard_cols: int = 6
    digest_thumb_w: int = 320
    digest_thumb_h: int = 180
    digest_storyboard_interval_sec: int = 60
    digest_poll_interval_sec: float = 2.0

    @staticmethod
    def defaults() -> "CaptureConfig":
        return CaptureConfig()

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        return {
            "schema_version": SETTINGS_SCHEMA_VERSION,
            "saved_utc": dt.datetime.utcnow().isoformat(timespec="seconds") + "Z",
            "capture": d,
        }

    @staticmethod
    def from_dict(data: Dict[str, Any]) -> "CaptureConfig":
        capture = data.get("capture", {})
        cfg = CaptureConfig.defaults()

        for k in asdict(cfg).keys():
            if k in capture:
                setattr(cfg, k, capture[k])

        cfg.mode = str(cfg.mode).lower()
        cfg.scale_preset = str(cfg.scale_preset).lower()
        cfg.pix_fmt = str(cfg.pix_fmt)
        cfg.profile_name = str(cfg.profile_name) if cfg.profile_name else "CUSTOM"
        cfg.profile_key = str(cfg.profile_key) if cfg.profile_key else ""
        if not isinstance(cfg.ffmpeg_extra, list):
            cfg.ffmpeg_extra = []

        # Coerce digest types safely
        # Force digest on so VisualDigest is always active regardless of stored settings.
        cfg.digest_enabled = True
        try:
            cfg.digest_fps = float(cfg.digest_fps)
        except Exception:
            cfg.digest_fps = 0.1

        cfg.digest_write_storyboard = bool(cfg.digest_write_storyboard)
        try:
            cfg.digest_storyboard_max_frames = int(cfg.digest_storyboard_max_frames)
        except Exception:
            cfg.digest_storyboard_max_frames = 60
        try:
            cfg.digest_storyboard_cols = int(cfg.digest_storyboard_cols)
        except Exception:
            cfg.digest_storyboard_cols = 6
        try:
            cfg.digest_thumb_w = int(cfg.digest_thumb_w)
            cfg.digest_thumb_h = int(cfg.digest_thumb_h)
        except Exception:
            cfg.digest_thumb_w = 320
            cfg.digest_thumb_h = 180
        try:
            cfg.digest_storyboard_interval_sec = int(cfg.digest_storyboard_interval_sec)
        except Exception:
            cfg.digest_storyboard_interval_sec = 60
        try:
            cfg.digest_poll_interval_sec = float(cfg.digest_poll_interval_sec)
        except Exception:
            cfg.digest_poll_interval_sec = 2.0

        return cfg


@dataclass
class Profile:
    key: str
    name: str
    desc: str
    overrides: Dict[str, Any] = field(default_factory=dict)
    ffmpeg_extra: List[str] = field(default_factory=list)


# -----------------------------
# Presets
# -----------------------------

def print_extended_help(parser: argparse.ArgumentParser) -> None:
    print(parser.format_help())
    print(
        "\n"
        "----------------------------------------\n"
        "SOTS_CAPTURE Extended Help (-help)\n"
        "----------------------------------------\n"
        "Menu mode (default):\n"
        "  - Script starts in a menu\n"
        "  - You confirm before recording starts\n"
        "  - When you press 'q' in ffmpeg, you return to the menu\n"
        "\n"
        "Persistent settings:\n"
        "  - <script_dir>/SOTS_Capture/settings.json\n"
        "\n"
        "Presets file:\n"
        "  - <script_dir>/SOTS_Capture/presets.json\n"
        "  - Edit it directly to add/remove/change presets\n"
        "\n"
        "Quick preset hotkeys:\n"
        "  - p1, p2, p3, ...\n"
        "\n"
        "Stop capture:\n"
        "  - Press 'q' in the ffmpeg window/console\n"
        "  - OR set a fixed capture time: --duration 20\n"
        "\n"
        "VisualDigest (Option C):\n"
        "  - Enable with: --digest 1\n"
        "  - Produces a live-updating folder for Buddy:\n"
        "      SOTS_Capture/VisualDigest/latest/latest.jpg\n"
        "      SOTS_Capture/VisualDigest/latest/storyboard.jpg\n"
        "      SOTS_Capture/VisualDigest/latest/manifest.json\n"
    )


def find_local_tool(script_dir: Path, explicit_path: str, exe_name: str) -> Optional[str]:
    if explicit_path:
        p = Path(explicit_path)
        if p.exists():
            return str(p)
        return None

    candidates = [
        script_dir / "ffmpeg" / "win64" / "bin" / exe_name,
        script_dir / "SOTS_Capture" / "ffmpeg" / "win64" / "bin" / exe_name,
        script_dir.parent / "python" / "ffmpeg" / "win64" / "bin" / exe_name,
    ]

    for c in candidates:
        if c.exists():
            return str(c)

    which = shutil.which(Path(exe_name).stem)
    return which


def resolve_output_path(script_dir: Path, out_arg: str, filename_default: str) -> Path:
    day_folder = script_dir / "SOTS_Capture" / dt.datetime.now().strftime("%Y%m%d")
    day_folder.mkdir(parents=True, exist_ok=True)

    if not out_arg:
        return day_folder / filename_default

    p = Path(out_arg)

    if p.is_absolute():
        p.parent.mkdir(parents=True, exist_ok=True)
        return p

    target = day_folder / p
    target.parent.mkdir(parents=True, exist_ok=True)
    return target


def settings_file_path(script_dir: Path, override_path: str = "") -> Path:
    if override_path.strip():
        return Path(override_path)
    return script_dir / "SOTS_Capture" / "settings.json"


def presets_file_path(script_dir: Path, override_path: str = "") -> Path:
    if override_path.strip():
        return Path(override_path)
    return script_dir / "SOTS_Capture" / "presets.json"


def load_settings(script_dir: Path, path_override: str, enabled: bool) -> Optional[CaptureConfig]:
    if not enabled:
        print("[SOTS_CAPTURE] Settings load disabled (--no-load-settings).")
        return None

    p = settings_file_path(script_dir, path_override)
    if not p.exists():
        print(f"[SOTS_CAPTURE] No settings file found (ok): {p}")
        return None

    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        cfg = CaptureConfig.from_dict(data)
        print(f"[SOTS_CAPTURE] Loaded settings: {p}")
        return cfg
    except Exception as e:
        print(f"[SOTS_CAPTURE] WARNING: failed to load settings.json: {p}")
        print(f"[SOTS_CAPTURE] Reason: {e}")
        return None


def save_settings(script_dir: Path, cfg: CaptureConfig, path_override: str, enabled: bool) -> bool:
    if not enabled:
        print("[SOTS_CAPTURE] Settings save disabled (--no-save-settings).")
        return False

    p = settings_file_path(script_dir, path_override)
    p.parent.mkdir(parents=True, exist_ok=True)

    try:
        p.write_text(json.dumps(cfg.to_dict(), indent=2), encoding="utf-8")
        print(f"[SOTS_CAPTURE] Saved settings: {p}")
        return True
    except Exception as e:
        print(f"[SOTS_CAPTURE] WARNING: failed to save settings.json: {p}")
        print(f"[SOTS_CAPTURE] Reason: {e}")
        return False


def default_profiles() -> List[Profile]:
    # ADDITIVE: p1 now enables VisualDigest by default (safe: only adds extra outputs).
    return [
        Profile(
            key="p1",
            name="OPTIMAL_BALANCED_444",
            desc="1fps full virtual; smaller files but still crisp (yuv444p, crf=30, preset=slow, tune=stillimage). VisualDigest ON.",
            overrides={
                "mode": "virtual",
                "fps": 1.0,
                "pix_fmt": "yuv444p",
                "crf": 30,
                "x264_preset": "slow",
                "scale_preset": "none",
                "scale_w": 0,
                "scale_h": 0,
                "digest_enabled": True,
                "digest_fps": 0.1,
            },
            ffmpeg_extra=["-tune", "stillimage"],
        ),
        Profile(
            key="p2",
            name="CRISP_MAX_444",
            desc="1fps full virtual; max clarity (yuv444p, crf=28, preset=veryfast).",
            overrides={
                "mode": "virtual",
                "fps": 1.0,
                "pix_fmt": "yuv444p",
                "crf": 28,
                "x264_preset": "veryfast",
                "scale_preset": "none",
                "scale_w": 0,
                "scale_h": 0,
            },
            ffmpeg_extra=[],
        ),
        Profile(
            key="p3",
            name="BALANCED_420",
            desc="1fps full virtual; smaller files + broad compatibility (yuv420p, crf=30, preset=slow, tune=stillimage).",
            overrides={
                "mode": "virtual",
                "fps": 1.0,
                "pix_fmt": "yuv420p",
                "crf": 30,
                "x264_preset": "slow",
                "scale_preset": "none",
                "scale_w": 0,
                "scale_h": 0,
            },
            ffmpeg_extra=["-tune", "stillimage"],
        ),
        Profile(
            key="p4",
            name="TINY_1080P",
            desc="1fps full virtual; smallest files (1080p downscale, yuv420p, crf=32).",
            overrides={
                "mode": "virtual",
                "fps": 1.0,
                "pix_fmt": "yuv420p",
                "crf": 32,
                "x264_preset": "veryfast",
                "scale_preset": "1080p",
                "scale_w": 0,
                "scale_h": 0,
            },
            ffmpeg_extra=[],
        ),
        Profile(
            key="p5",
            name="UE_WINDOW_444",
            desc='1fps window capture "Unreal Editor" (yuv444p, crf=30, preset=slow, tune=stillimage). VisualDigest ON.',
            overrides={
                "mode": "window",
                "fps": 1.0,
                "window_title": "Unreal Editor",
                "pix_fmt": "yuv444p",
                "crf": 30,
                "x264_preset": "slow",
                "scale_preset": "none",
                "scale_w": 0,
                "scale_h": 0,
                "digest_enabled": True,
                "digest_fps": 0.1,
            },
            ffmpeg_extra=["-tune", "stillimage"],
        ),
        Profile(
            key="p6",
            name="PRIMARY_ONLY",
            desc="1fps primary desktop only (no scaling).",
            overrides={
                "mode": "desktop",
                "fps": 1.0,
                "pix_fmt": "yuv420p",
                "crf": 30,
                "x264_preset": "veryfast",
                "scale_preset": "none",
                "scale_w": 0,
                "scale_h": 0,
            },
            ffmpeg_extra=[],
        ),
    ]


def write_default_presets_file(path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    profs = default_profiles()
    payload = {
        "schema_version": PRESETS_SCHEMA_VERSION,
        "saved_utc": dt.datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "profiles": [
            {
                "key": p.key,
                "name": p.name,
                "desc": p.desc,
                "overrides": p.overrides,
                "ffmpeg_extra": p.ffmpeg_extra,
            }
            for p in profs
        ],
    }
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def load_presets(script_dir: Path, override_path: str) -> Tuple[Path, List[Profile]]:
    p = presets_file_path(script_dir, override_path)
    if not p.exists():
        print(f"[SOTS_CAPTURE] presets.json missing; creating defaults at: {p}")
        write_default_presets_file(p)

    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        raw_profiles = data.get("profiles", [])
        profs: List[Profile] = []

        for rp in raw_profiles:
            key = str(rp.get("key", "")).strip().lower()
            name = str(rp.get("name", "")).strip()
            desc = str(rp.get("desc", "")).strip()
            overrides = rp.get("overrides", {}) if isinstance(rp.get("overrides", {}), dict) else {}
            ffmpeg_extra = rp.get("ffmpeg_extra", [])
            if not isinstance(ffmpeg_extra, list):
                ffmpeg_extra = []

            if not key or not name:
                continue

            profs.append(
                Profile(
                    key=key,
                    name=name,
                    desc=desc,
                    overrides=overrides,
                    ffmpeg_extra=[str(x) for x in ffmpeg_extra],
                )
            )

        if not profs:
            print("[SOTS_CAPTURE] WARNING: presets.json had no valid profiles. Rewriting defaults.")
            write_default_presets_file(p)
            profs = default_profiles()

        return p, profs

    except Exception as e:
        print(f"[SOTS_CAPTURE] WARNING: failed to load presets.json: {p}")
        print(f"[SOTS_CAPTURE] Reason: {e}")
        print("[SOTS_CAPTURE] Falling back to built-in defaults (and rewriting presets.json).")
        write_default_presets_file(p)
        return p, default_profiles()


def yes_no(prompt: str, default: bool = False) -> bool:
    suffix = " [Y/n]: " if default else " [y/N]: "
    while True:
        ans = input(prompt + suffix).strip().lower()
        if not ans:
            return default
        if ans in ("y", "yes"):
            return True
        if ans in ("n", "no"):
            return False
        print("Please enter y or n.")


def pause(msg: str = "Press Enter to continue...") -> None:
    try:
        input(msg)
    except EOFError:
        pass


def safe_int(prompt: str, cur: int, min_v: Optional[int] = None, max_v: Optional[int] = None) -> int:
    while True:
        s = input(f"{prompt} (current: {cur}) > ").strip()
        if s == "":
            return cur
        try:
            v = int(s)
        except ValueError:
            print("Enter a valid integer (or blank to keep current).")
            continue
        if min_v is not None and v < min_v:
            print(f"Must be >= {min_v}")
            continue
        if max_v is not None and v > max_v:
            print(f"Must be <= {max_v}")
            continue
        return v


def safe_float(prompt: str, cur: float, min_v: Optional[float] = None, max_v: Optional[float] = None) -> float:
    while True:
        s = input(f"{prompt} (current: {cur}) > ").strip()
        if s == "":
            return cur
        try:
            v = float(s)
        except ValueError:
            print("Enter a valid number (or blank to keep current).")
            continue
        if min_v is not None and v < min_v:
            print(f"Must be >= {min_v}")
            continue
        if max_v is not None and v > max_v:
            print(f"Must be <= {max_v}")
            continue
        return v


def safe_str(prompt: str, cur: str, allow_blank_keep: bool = True) -> str:
    s = input(f"{prompt} (current: {cur}) > ").strip()
    if s == "" and allow_blank_keep:
        return cur
    return s


def print_config_summary(cfg: CaptureConfig, script_dir: Path) -> None:
    day_folder = script_dir / "SOTS_Capture" / dt.datetime.now().strftime("%Y%m%d")
    gd = visualdigest_global_latest_dir(script_dir)

    print("\n==============================")
    print("SOTS_CAPTURE Current Settings")
    print("==============================")
    print(f"profile      : {cfg.profile_name} ({cfg.profile_key if cfg.profile_key else 'no key'})")
    print(f"mode         : {cfg.mode}")
    print(f"fps          : {cfg.fps}")
    print(f"duration     : {cfg.duration}  (0 = until 'q')")
    print(f"draw_mouse   : {cfg.draw_mouse}")
    print(f"crf          : {cfg.crf}")
    print(f"x264_preset  : {cfg.x264_preset}")
    print(f"pix_fmt      : {cfg.pix_fmt}")
    print(f"scale_preset : {cfg.scale_preset}")
    print(f"scale_w/h    : {cfg.scale_w} x {cfg.scale_h}")
    print(f"monitor_index: {cfg.monitor_index}")
    print(f"window_title : {cfg.window_title}")
    print(f"out          : {cfg.out if cfg.out else '(auto)'}")
    print(f"ffmpeg_extra : {cfg.ffmpeg_extra if cfg.ffmpeg_extra else '(none)'}")

    print("---- VisualDigest (Option C) ----")
    print(f"digest_enabled           : {cfg.digest_enabled}")
    print(f"digest_fps               : {cfg.digest_fps}")
    print(f"digest_write_storyboard  : {cfg.digest_write_storyboard}")
    print(f"digest_storyboard_max    : {cfg.digest_storyboard_max_frames}")
    print(f"digest_storyboard_cols   : {cfg.digest_storyboard_cols}")
    print(f"digest_thumb_w/h         : {cfg.digest_thumb_w} x {cfg.digest_thumb_h}")
    print(f"digest_storyboard_every  : {cfg.digest_storyboard_interval_sec}s")
    print(f"digest_global_latest_dir : {gd}")

    print("------------------------------")
    print(f"save folder  : {day_folder}")
    print("==============================\n")


def apply_profile(cfg: CaptureConfig, prof: Profile) -> None:
    cfg.profile_key = prof.key
    cfg.profile_name = prof.name

    allowed = set(asdict(CaptureConfig.defaults()).keys())

    for k, v in prof.overrides.items():
        if k not in allowed:
            continue
        if k in ("mode", "scale_preset"):
            setattr(cfg, k, str(v).lower())
        elif k in ("fps", "duration", "digest_fps", "digest_poll_interval_sec"):
            try:
                setattr(cfg, k, float(v))
            except Exception:
                pass
        elif k in (
            "crf",
            "draw_mouse",
            "monitor_index",
            "scale_w",
            "scale_h",
            "digest_storyboard_max_frames",
            "digest_storyboard_cols",
            "digest_thumb_w",
            "digest_thumb_h",
            "digest_storyboard_interval_sec",
        ):
            try:
                setattr(cfg, k, int(v))
            except Exception:
                pass
        elif k in ("digest_enabled", "digest_write_storyboard"):
            setattr(cfg, k, bool(v))
        else:
            setattr(cfg, k, v)

    cfg.ffmpeg_extra = [str(x) for x in prof.ffmpeg_extra] if prof.ffmpeg_extra else []


# -----------------------------
# ffmpeg command construction
# -----------------------------

def build_ffmpeg_cmd(
    ffmpeg: str,
    cfg: CaptureConfig,
    script_dir: Path,
) -> Tuple[List[str], Path, Path, Optional[Path]]:
    ts = dt.datetime.now().strftime("%Y%m%d_%H%M%S")
    filename_default = f"SOTS_capture_{cfg.mode}_{cfg.fps}fps_{ts}.mp4"
    out_path = resolve_output_path(script_dir, cfg.out, filename_default)
    log_path = out_path.with_suffix(".log")

    vf_main = build_vf(cfg.scale_preset, cfg.scale_w, cfg.scale_h)

    cmd: List[str] = [
        ffmpeg,
        "-y",
        "-f",
        "gdigrab",
        "-framerate",
        str(cfg.fps),
        "-draw_mouse",
        str(cfg.draw_mouse),
        "-stats",
    ]

    if cfg.mode == "virtual":
        vx, vy, vw, vh = get_virtual_screen_rect()
        cmd += [
            "-offset_x",
            str(vx),
            "-offset_y",
            str(vy),
            "-video_size",
            f"{vw}x{vh}",
            "-i",
            "desktop",
        ]
    elif cfg.mode == "desktop":
        cmd += ["-i", "desktop"]
    elif cfg.mode == "monitor":
        mons = get_monitors()
        if cfg.monitor_index < 0 or cfg.monitor_index >= len(mons):
            raise ValueError(f"monitor_index out of range (0..{len(mons)-1})")
        m = mons[cfg.monitor_index]
        cmd += [
            "-offset_x",
            str(m.left),
            "-offset_y",
            str(m.top),
            "-video_size",
            f"{m.width}x{m.height}",
            "-i",
            "desktop",
        ]
    elif cfg.mode == "window":
        if not cfg.window_title.strip():
            raise ValueError("window_title is required for mode=window")
        cmd += ["-i", f"title={cfg.window_title}"]
    else:
        raise ValueError(f"Unknown mode: {cfg.mode}")

    if cfg.duration and cfg.duration > 0:
        cmd += ["-t", str(cfg.duration)]

    session_dir: Optional[Path] = None

    # If VisualDigest enabled, use filter_complex split and add two extra outputs:
    #  - frames sequence to session_dir/frames/frame_%06d.jpg (at digest_fps)
    #  - latest.jpg (live overwrite) to global VisualDigest/latest/latest.jpg (at digest_fps)
    if cfg.digest_enabled:
        session_dir = visualdigest_session_dir(out_path)
        frames_dir = session_dir / "frames"
        safe_mkdir(frames_dir)

        global_dir = visualdigest_global_latest_dir(script_dir)
        safe_mkdir(global_dir)

        # Build filter_complex
        # Apply main scaling (vf_main) BEFORE split so all outputs match the same geometry.
        if vf_main:
            base = f"[0:v]{vf_main}[v0];"
        else:
            base = "[0:v]null[v0];"

        # Split into: mp4 + frames + latest
        # Apply digest fps on the image branches to reduce output.
        fc = (
            base
            + f"[v0]split=3[vmp4][vseq][vlat];"
            + f"[vseq]fps={cfg.digest_fps}[vseqo];"
            + f"[vlat]fps={cfg.digest_fps}[vlato]"
        )
        cmd += ["-filter_complex", fc]

        # MP4 output
        cmd += [
            "-map", "[vmp4]",
            "-c:v", "libx264",
            "-preset", str(cfg.x264_preset),
            "-crf", str(cfg.crf),
            "-pix_fmt", str(cfg.pix_fmt),
        ]
        if cfg.ffmpeg_extra:
            cmd += [str(x) for x in cfg.ffmpeg_extra]
        cmd += ["-movflags", "+faststart", str(out_path)]

        # Frames sequence output
        cmd += [
            "-map", "[vseqo]",
            "-f", "image2",
            "-q:v", "4",
            str(frames_dir / "frame_%06d.jpg"),
        ]

        # Live latest.jpg output (stable for Buddy)
        cmd += [
            "-map", "[vlato]",
            "-f", "image2",
            "-update", "1",
            "-q:v", "3",
            str(global_dir / "latest.jpg"),
        ]

    else:
        # Original single-output behavior (unchanged)
        if vf_main:
            cmd += ["-vf", vf_main]

        cmd += [
            "-c:v",
            "libx264",
            "-preset",
            str(cfg.x264_preset),
            "-crf",
            str(cfg.crf),
            "-pix_fmt",
            str(cfg.pix_fmt),
        ]

        if cfg.ffmpeg_extra:
            cmd += [str(x) for x in cfg.ffmpeg_extra]

        cmd += [
            "-movflags",
            "+faststart",
            str(out_path),
        ]

    return cmd, out_path, log_path, session_dir


def finalize_visualdigest(
    ffmpeg: str,
    script_dir: Path,
    cfg: CaptureConfig,
    out_path: Path,
    session_dir: Path,
) -> None:
    global_dir = visualdigest_global_latest_dir(script_dir)
    safe_mkdir(global_dir)
    safe_mkdir(session_dir)

    session_log = session_dir / "run.log"
    global_log = global_dir / "run.log"

    # Mirror the global latest.jpg into the session for archiving.
    gl = global_dir / "latest.jpg"
    if gl.exists():
        try:
            shutil.copy2(gl, session_dir / "latest.jpg")
        except Exception:
            pass

    # Build storyboard (best effort)
    if cfg.digest_write_storyboard:
        ok = build_storyboard_best_effort(
            ffmpeg_exe=ffmpeg,
            frames_dir=session_dir / "frames",
            out_path=session_dir / "storyboard.jpg",
            cols=cfg.digest_storyboard_cols,
            thumb_w=cfg.digest_thumb_w,
            thumb_h=cfg.digest_thumb_h,
            max_frames=cfg.digest_storyboard_max_frames,
            log_path=session_log,
        )
        if ok:
            try:
                shutil.copy2(session_dir / "storyboard.jpg", global_dir / "storyboard.jpg")
            except Exception:
                pass
    else:
        log_to(session_log, "Storyboard disabled by config.")
        log_to(global_log, "Storyboard disabled by config.", also_print=False)

    # Write manifest (final)
    frames = list_images_sorted(session_dir / "frames")
    payload = {
        "schema": 1,
        "finalized_at": iso_local_now(),
        "live": False,
        "mp4": str(out_path),
        "session_dir": str(session_dir),
        "global_latest_dir": str(global_dir),
        "digest": {
            "enabled": bool(cfg.digest_enabled),
            "fps": float(cfg.digest_fps),
            "max_frames": int(cfg.digest_storyboard_max_frames),
            "cols": int(cfg.digest_storyboard_cols),
            "thumb_w": int(cfg.digest_thumb_w),
            "thumb_h": int(cfg.digest_thumb_h),
            "storyboard_interval_sec": int(cfg.digest_storyboard_interval_sec),
            "write_storyboard": bool(cfg.digest_write_storyboard),
        },
        "frames": {
            "count": len(frames),
            "first": frames[0].name if frames else "",
            "last": frames[-1].name if frames else "",
        },
        "buddy_paths": {
            "latest_jpg": str(global_dir / "latest.jpg"),
            "storyboard_jpg": str(global_dir / "storyboard.jpg"),
            "manifest_json": str(global_dir / "manifest.json"),
        },
    }
    write_text(session_dir / "manifest.json", json.dumps(payload, indent=2))
    write_text(global_dir / "manifest.json", json.dumps(payload, indent=2))

    # Mirror logs
    try:
        shutil.copy2(session_log, global_log)
    except Exception:
        pass


def run_recording(ffmpeg: str, cfg: CaptureConfig, script_dir: Path) -> int:
    cmd, out_path, log_path, session_dir = build_ffmpeg_cmd(ffmpeg, cfg, script_dir)
    printable = quote_cmd(cmd)

    log_path.write_text(printable + "\n", encoding="utf-8")

    print("\n[SOTS_CAPTURE] ========================================")
    print(f"[SOTS_CAPTURE] Saving folder: {out_path.parent}")
    print(f"[SOTS_CAPTURE] Writing:       {out_path}")
    print(f"[SOTS_CAPTURE] Log:           {log_path}")
    if cfg.digest_enabled and session_dir is not None:
        gd = visualdigest_global_latest_dir(script_dir)
        print("[SOTS_CAPTURE] VisualDigest:   ENABLED (Option C)")
        print(f"[SOTS_CAPTURE]  - Session:    {session_dir}")
        print(f"[SOTS_CAPTURE]  - Buddy feed: {gd}  (latest.jpg updates live)")
    print(f"[SOTS_CAPTURE] Cmd:           {printable}")
    print("[SOTS_CAPTURE] ========================================")
    print("\n[SOTS_CAPTURE] RECORDING...")
    print("[SOTS_CAPTURE] Press 'q' in the ffmpeg window/console to stop.")
    print("[SOTS_CAPTURE] (After stop, you'll return to this menu.)\n")

    stop_evt = threading.Event()
    live_updater: Optional[VisualDigestLiveUpdater] = None

    # Start live digest updater thread (storyboard/manifest refresh) if enabled.
    if cfg.digest_enabled and session_dir is not None:
        safe_mkdir(session_dir)
        safe_mkdir(session_dir / "frames")
        # seed logs
        sess_log = session_dir / "run.log"
        glob_log = visualdigest_global_latest_dir(script_dir) / "run.log"
        log_to(sess_log, "VisualDigest enabled (live updater starting).")
        log_to(glob_log, "VisualDigest enabled (live updater starting).", also_print=False)

        live_updater = VisualDigestLiveUpdater(
            ffmpeg_exe=ffmpeg,
            script_dir=script_dir,
            out_mp4=out_path,
            session_dir=session_dir,
            cfg=cfg,
            stop_evt=stop_evt,
        )
        live_updater.start()

    try:
        proc = subprocess.Popen(cmd)
        rc = proc.wait()
    except KeyboardInterrupt:
        print("\n[SOTS_CAPTURE] KeyboardInterrupt received. Stopping ffmpeg...")
        try:
            proc.terminate()  # type: ignore[name-defined]
        except Exception:
            pass
        rc = 130

    # Stop live updater
    if live_updater is not None:
        stop_evt.set()
        try:
            live_updater.join(timeout=5.0)
        except Exception:
            pass

    print(f"\n[SOTS_CAPTURE] ffmpeg exit code: {rc}")
    if rc == 0:
        print(f"[SOTS_CAPTURE] Saved: {out_path}")
    else:
        print("[SOTS_CAPTURE] Recording may be incomplete. Check console/log.")

    # Finalize storyboard/manifest for the session and update global feed (best effort).
    if cfg.digest_enabled and session_dir is not None:
        try:
            finalize_visualdigest(ffmpeg=ffmpeg, script_dir=script_dir, cfg=cfg, out_path=out_path, session_dir=session_dir)
            print("[SOTS_CAPTURE] VisualDigest finalized (storyboard/manifest updated).")
        except Exception as e:
            print(f"[SOTS_CAPTURE] VisualDigest finalize failed: {e}")

    return int(rc)


# -----------------------------
# Menu UI
# -----------------------------

def edit_settings_menu(cfg: CaptureConfig, script_dir: Path) -> None:
    while True:
        print_config_summary(cfg, script_dir)
        print("Edit Settings")
        print("  1) mode (virtual/desktop/monitor/window)")
        print("  2) fps")
        print("  3) duration (0 = until 'q')")
        print("  4) output name/path (blank = auto)")
        print("  5) quality (crf/x264_preset/pix_fmt)")
        print("  6) target details (monitor_index/window_title)")
        print("  7) scaling (preset or custom)")
        print("  8) draw_mouse (0/1)")
        print("  9) ffmpeg_extra (advanced args list)")
        print(" 10) VisualDigest (Option C)")
        print("  B) back to main menu")
        choice = input("> ").strip().lower()

        if choice == "b":
            return

        cfg.profile_name = "CUSTOM"
        cfg.profile_key = ""

        if choice == "1":
            print("\nSelect mode:")
            print("  1) virtual (ALL monitors)")
            print("  2) desktop (primary only)")
            print("  3) monitor (single monitor by index)")
            print("  4) window (by title)")
            sel = input("> ").strip()
            if sel == "1":
                cfg.mode = "virtual"
            elif sel == "2":
                cfg.mode = "desktop"
            elif sel == "3":
                cfg.mode = "monitor"
            elif sel == "4":
                cfg.mode = "window"
            else:
                print("Invalid selection.")

        elif choice == "2":
            cfg.fps = safe_float("fps", cfg.fps, min_v=0.1, max_v=60.0)

        elif choice == "3":
            cfg.duration = safe_float("duration seconds (0=until q)", cfg.duration, min_v=0.0)

        elif choice == "4":
            new_out = input(f"out (current: {cfg.out if cfg.out else '(auto)'}) > ").strip()
            cfg.out = new_out

        elif choice == "5":
            cfg.crf = safe_int("crf (higher=smaller, lower=better)", cfg.crf, min_v=0, max_v=51)
            cfg.x264_preset = safe_str("x264_preset (ultrafast..veryslow)", cfg.x264_preset)

            print("\nPixel format presets:")
            for i, pf in enumerate(PIX_FMT_PRESETS, start=1):
                print(f"  {i}) {pf}")
            sel = input(f"pix_fmt (current: {cfg.pix_fmt}) [1-{len(PIX_FMT_PRESETS)} or blank to keep] > ").strip()
            if sel:
                try:
                    idx = int(sel) - 1
                    if 0 <= idx < len(PIX_FMT_PRESETS):
                        cfg.pix_fmt = PIX_FMT_PRESETS[idx]
                except ValueError:
                    print("Invalid pix_fmt selection.")

        elif choice == "6":
            if cfg.mode == "monitor":
                cfg.monitor_index = safe_int("monitor_index", cfg.monitor_index, min_v=0)
            elif cfg.mode == "window":
                cfg.window_title = safe_str("window_title", cfg.window_title, allow_blank_keep=False)
            else:
                print("Current mode is not monitor/window.")
                pause()

        elif choice == "7":
            print("\nScaling:")
            print("  1) preset")
            print("  2) custom")
            print("  3) clear (none)")
            sel = input("> ").strip()
            if sel == "1":
                keys = list(SCALE_PRESETS.keys())
                for i, k in enumerate(keys, start=1):
                    print(f"  {i}) {k}")
                pick = input(f"Select preset (current: {cfg.scale_preset}) > ").strip()
                try:
                    idx = int(pick) - 1
                    if 0 <= idx < len(keys):
                        cfg.scale_preset = keys[idx]
                        cfg.scale_w = 0
                        cfg.scale_h = 0
                except ValueError:
                    print("Invalid preset.")
            elif sel == "2":
                cfg.scale_preset = "none"
                cfg.scale_w = safe_int("scale_w", cfg.scale_w, min_v=0)
                cfg.scale_h = safe_int("scale_h", cfg.scale_h, min_v=0)
            elif sel == "3":
                cfg.scale_preset = "none"
                cfg.scale_w = 0
                cfg.scale_h = 0
            else:
                print("Invalid selection.")

        elif choice == "8":
            cfg.draw_mouse = safe_int("draw_mouse (0/1)", cfg.draw_mouse, min_v=0, max_v=1)

        elif choice == "9":
            print("\nffmpeg_extra: space-separated tokens. Example:  -tune stillimage")
            print(f"Current: {cfg.ffmpeg_extra if cfg.ffmpeg_extra else '(none)'}")
            s = input("> ").strip()
            cfg.ffmpeg_extra = s.split() if s else []

        elif choice == "10":
            print("\nVisualDigest (Option C)")
            print(f"  enabled            : {cfg.digest_enabled}")
            print(f"  digest_fps         : {cfg.digest_fps}  (0.1 = 1 frame / 10s)")
            print(f"  write_storyboard   : {cfg.digest_write_storyboard}")
            print(f"  storyboard every   : {cfg.digest_storyboard_interval_sec}s")
            print(f"  max frames         : {cfg.digest_storyboard_max_frames}")
            print(f"  cols               : {cfg.digest_storyboard_cols}")
            print(f"  thumb_w/h          : {cfg.digest_thumb_w} x {cfg.digest_thumb_h}")
            print(f"  poll interval      : {cfg.digest_poll_interval_sec}s")
            print("\n  1) toggle enabled")
            print("  2) set digest_fps")
            print("  3) toggle storyboard")
            print("  4) set storyboard interval seconds")
            print("  5) set storyboard max frames")
            print("  6) set storyboard cols")
            print("  7) set thumb w/h")
            print("  8) set poll interval seconds")
            print("  B) back")
            sel = input("> ").strip().lower()
            if sel == "b":
                continue
            if sel == "1":
                cfg.digest_enabled = not cfg.digest_enabled
            elif sel == "2":
                cfg.digest_fps = safe_float("digest_fps", cfg.digest_fps, min_v=0.01, max_v=10.0)
            elif sel == "3":
                cfg.digest_write_storyboard = not cfg.digest_write_storyboard
            elif sel == "4":
                cfg.digest_storyboard_interval_sec = safe_int("storyboard interval (sec)", cfg.digest_storyboard_interval_sec, min_v=1, max_v=3600)
            elif sel == "5":
                cfg.digest_storyboard_max_frames = safe_int("storyboard max frames", cfg.digest_storyboard_max_frames, min_v=4, max_v=1000)
            elif sel == "6":
                cfg.digest_storyboard_cols = safe_int("storyboard cols", cfg.digest_storyboard_cols, min_v=1, max_v=50)
            elif sel == "7":
                cfg.digest_thumb_w = safe_int("thumb_w", cfg.digest_thumb_w, min_v=32, max_v=2000)
                cfg.digest_thumb_h = safe_int("thumb_h", cfg.digest_thumb_h, min_v=32, max_v=2000)
            elif sel == "8":
                cfg.digest_poll_interval_sec = safe_float("poll interval (sec)", cfg.digest_poll_interval_sec, min_v=0.5, max_v=60.0)
            else:
                print("Invalid selection.")

        else:
            print("Unknown option.")


def list_monitors_ui() -> None:
    mons = get_monitors()
    print("\n[SOTS_CAPTURE] Monitors:")
    for m in mons:
        print(
            f"  [{m.index}] {m.device} rect=({m.left},{m.top})-({m.right},{m.bottom}) "
            f"size={m.width}x{m.height}"
        )
    vx, vy, vw, vh = get_virtual_screen_rect()
    print(f"[SOTS_CAPTURE] VirtualScreen rect=({vx},{vy}) size={vw}x{vh}\n")
    pause()


def presets_menu(cfg: CaptureConfig, profiles: List[Profile]) -> None:
    print("\nQuick Presets (type p1/p2/...)")
    for prof in profiles:
        print(f"  {prof.key}) {prof.name} - {prof.desc}")
    print("  B) back")

    choice = input("> ").strip().lower()
    if choice == "b":
        return

    for prof in profiles:
        if choice == prof.key:
            apply_profile(cfg, prof)
            print(f"[SOTS_CAPTURE] Applied preset: {prof.name}")
            pause()
            return

    print("Unknown preset.")
    pause()


def main_menu_loop(
    ffmpeg: str,
    cfg: CaptureConfig,
    script_dir: Path,
    ap: argparse.ArgumentParser,
    settings_path_override: str,
    presets_path_override: str,
    enable_save: bool,
    profiles: List[Profile],
    presets_path: Path,
) -> int:
    while True:
        print_config_summary(cfg, script_dir)

        print("Main Menu")
        print("  1) Start recording (uses current settings)")
        print("  2) Edit settings")
        print("  3) Show ffmpeg command (preview)")
        print("  4) List monitors")
        print("  5) Presets (menu)")
        print("  6) Reload presets.json")
        print("  S) Save settings now")
        print("  R) Reset to defaults (then apply p1)")
        print("  H) Show help (-help)")
        print("  Q) Quit")

        print("\nQuick preset hotkeys:")
        print("  " + "  ".join([f"{p.key}={p.name}" for p in profiles]))
        print(f"\nPresets file:  {presets_path}")
        choice = input("> ").strip().lower()

        # Preset hotkeys: p1/p2/...
        for prof in profiles:
            if choice == prof.key:
                apply_profile(cfg, prof)
                save_settings(script_dir, cfg, settings_path_override, enable_save)
                break
        else:
            if choice == "q":
                save_settings(script_dir, cfg, settings_path_override, enable_save)
                print("[SOTS_CAPTURE] Bye.")
                return 0

            if choice == "1":
                if not yes_no("Start recording now?", default=True):
                    continue
                try:
                    rc = run_recording(ffmpeg, cfg, script_dir)
                except ValueError as e:
                    print(f"[SOTS_CAPTURE] ERROR: {e}")
                    pause()
                    continue
                save_settings(script_dir, cfg, settings_path_override, enable_save)
                pause("Press Enter to return to menu...")
                continue

            if choice == "2":
                edit_settings_menu(cfg, script_dir)
                save_settings(script_dir, cfg, settings_path_override, enable_save)
                continue

            if choice == "3":
                try:
                    cmd, out_path, log_path, session_dir = build_ffmpeg_cmd(ffmpeg, cfg, script_dir)
                    print("\n[SOTS_CAPTURE] Command preview:")
                    print(quote_cmd(cmd))
                    print(f"\n[SOTS_CAPTURE] Would write: {out_path}")
                    print(f"[SOTS_CAPTURE] Would log:   {log_path}")
                    if session_dir is not None:
                        gd = visualdigest_global_latest_dir(script_dir)
                        print(f"[SOTS_CAPTURE] VisualDigest session: {session_dir}")
                        print(f"[SOTS_CAPTURE] VisualDigest global:  {gd}")
                    print()
                except ValueError as e:
                    print(f"[SOTS_CAPTURE] ERROR: {e}")
                pause()
                continue

            if choice == "4":
                list_monitors_ui()
                continue

            if choice == "5":
                presets_menu(cfg, profiles)
                save_settings(script_dir, cfg, settings_path_override, enable_save)
                continue

            if choice == "6":
                presets_path, profiles[:] = load_presets(script_dir, presets_path_override)  # reload in-place
                print(f"[SOTS_CAPTURE] Reloaded presets: {presets_path}")
                pause()
                continue

            if choice == "s":
                save_settings(script_dir, cfg, settings_path_override, enable_save)
                pause()
                continue

            if choice == "r":
                if yes_no("Reset ALL settings to defaults, then apply preset p1?", default=False):
                    cfg2 = CaptureConfig.defaults()
                    cfg.__dict__.update(cfg2.__dict__)
                    p1 = next((p for p in profiles if p.key == "p1"), None)
                    if p1:
                        apply_profile(cfg, p1)
                    save_settings(script_dir, cfg, settings_path_override, enable_save)
                continue

            if choice == "h":
                print_extended_help(ap)
                pause()
                continue

            print("Unknown option.")


# -----------------------------
# Entry
# -----------------------------

def main() -> int:
    ap = argparse.ArgumentParser(description="SOTS Debug Capture (ffmpeg + gdigrab, Windows)")

    ap.add_argument(
        "-help",
        dest="help_long",
        action="store_true",
        help="Show extended help (examples + troubleshooting) and exit.",
    )

    ap.add_argument(
        "--auto",
        action="store_true",
        help="Start recording immediately (skip menu + confirmation).",
    )

    ap.add_argument("--settings-path", default="", help="Override settings.json path.")
    ap.add_argument("--presets-path", default="", help="Override presets.json path.")
    ap.add_argument("--no-load-settings", action="store_true", help="Do not load settings.json at startup.")
    ap.add_argument("--no-save-settings", action="store_true", help="Do not save settings.json (no persistence).")

    ap.add_argument("--mode", choices=["virtual", "desktop", "monitor", "window"], default="virtual")
    ap.add_argument("--fps", type=float, default=1.0)
    ap.add_argument("--out", default="")
    ap.add_argument("--duration", type=float, default=0.0)
    ap.add_argument("--crf", type=int, default=30)
    ap.add_argument("--preset", default="veryfast")
    ap.add_argument("--draw-mouse", type=int, default=1, choices=[0, 1])
    ap.add_argument("--window-title", default="")
    ap.add_argument("--monitor-index", type=int, default=0)
    ap.add_argument("--scale-preset", default="none", choices=list(SCALE_PRESETS.keys()))
    ap.add_argument("--scale-w", type=int, default=0)
    ap.add_argument("--scale-h", type=int, default=0)
    ap.add_argument("--pix-fmt", default="yuv420p")
    ap.add_argument("--list-monitors", action="store_true")
    ap.add_argument("--ffmpeg-path", default="")
    ap.add_argument("--ffprobe-path", default="")

    # VisualDigest CLI (Option C)
    ap.add_argument("--digest", type=int, default=-1, help="VisualDigest enable: 1=on, 0=off. -1=leave as settings/preset.")
    ap.add_argument("--digest-fps", type=float, default=-1.0, help="VisualDigest fps (e.g., 0.1 = 1 frame/10s).")
    ap.add_argument("--digest-storyboard", type=int, default=-1, help="Storyboard enable: 1=on, 0=off. -1=leave.")
    ap.add_argument("--digest-storyboard-interval", type=int, default=-1, help="Storyboard update interval seconds.")
    ap.add_argument("--digest-max-frames", type=int, default=-1, help="Max frames used for storyboard.")
    ap.add_argument("--digest-cols", type=int, default=-1, help="Storyboard columns.")
    ap.add_argument("--digest-thumb-w", type=int, default=-1, help="Storyboard thumb width.")
    ap.add_argument("--digest-thumb-h", type=int, default=-1, help="Storyboard thumb height.")
    ap.add_argument("--digest-poll-interval", type=float, default=-1.0, help="Live digest poll interval seconds.")

    args = ap.parse_args()

    if args.help_long:
        print_extended_help(ap)
        return 0

    script_dir = Path(__file__).resolve().parent

    ffmpeg = find_local_tool(script_dir, args.ffmpeg_path, "ffmpeg.exe")
    if not ffmpeg:
        print("[SOTS_CAPTURE] ERROR: ffmpeg not found.")
        print("[SOTS_CAPTURE] Tip: run:  python sots_capture_ffmpeg.py -help")
        return 2

    if args.list_monitors:
        list_monitors_ui()
        return 0

    presets_path, profiles = load_presets(script_dir, args.presets_path)

    enable_load = not args.no_load_settings
    enable_save = not args.no_save_settings

    loaded = load_settings(script_dir, args.settings_path, enabled=enable_load)
    cfg = loaded if loaded is not None else CaptureConfig.defaults()

    # If no settings existed, apply p1 as the default profile
    if loaded is None:
        p1 = next((p for p in profiles if p.key == "p1"), None)
        if p1:
            apply_profile(cfg, p1)
            print("[SOTS_CAPTURE] No prior settings found; defaulting to preset p1.")

    # CLI overrides (explicit always wins)
    cfg.mode = str(args.mode).lower()
    cfg.fps = float(args.fps)
    cfg.out = str(args.out)
    cfg.duration = float(args.duration)
    cfg.crf = int(args.crf)
    cfg.x264_preset = str(args.preset)
    cfg.draw_mouse = int(args.draw_mouse)
    cfg.window_title = str(args.window_title)
    cfg.monitor_index = int(args.monitor_index)
    cfg.scale_preset = str(args.scale_preset).lower()
    cfg.scale_w = int(args.scale_w)
    cfg.scale_h = int(args.scale_h)
    cfg.pix_fmt = str(args.pix_fmt)

    # VisualDigest CLI overrides
    # Force digest on so VisualDigest is always active even if CLI tries to disable.
    cfg.digest_enabled = True
    if args.digest_fps > 0:
        cfg.digest_fps = float(args.digest_fps)
    if args.digest_storyboard in (0, 1):
        cfg.digest_write_storyboard = bool(args.digest_storyboard)
    if args.digest_storyboard_interval > 0:
        cfg.digest_storyboard_interval_sec = int(args.digest_storyboard_interval)
    if args.digest_max_frames > 0:
        cfg.digest_storyboard_max_frames = int(args.digest_max_frames)
    if args.digest_cols > 0:
        cfg.digest_storyboard_cols = int(args.digest_cols)
    if args.digest_thumb_w > 0:
        cfg.digest_thumb_w = int(args.digest_thumb_w)
    if args.digest_thumb_h > 0:
        cfg.digest_thumb_h = int(args.digest_thumb_h)
    if args.digest_poll_interval > 0:
        cfg.digest_poll_interval_sec = float(args.digest_poll_interval)

    if args.auto:
        rc = run_recording(ffmpeg, cfg, script_dir)
        save_settings(script_dir, cfg, args.settings_path, enabled=enable_save)
        return rc

    rc = main_menu_loop(
        ffmpeg=ffmpeg,
        cfg=cfg,
        script_dir=script_dir,
        ap=ap,
        settings_path_override=args.settings_path,
        presets_path_override=args.presets_path,
        enable_save=enable_save,
        profiles=profiles,
        presets_path=presets_path,
    )
    return rc


if __name__ == "__main__":
    raise SystemExit(main())
