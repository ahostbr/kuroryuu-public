#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.8"
# dependencies = [
#     "edge-tts",
# ]
# ///

"""
Edge TTS Script for Kuroryuu

Uses Microsoft Edge's free TTS service via edge-tts package.
High quality neural voices, no API key required.

Usage:
  uv run edge_tts.py                    # Uses default text
  uv run edge_tts.py "Your custom text" # Uses provided text

Voice: en-GB-SoniaNeural (British English, female)
"""

import sys
import subprocess
import tempfile
import os


def get_uv_path():
    """Get UV executable path dynamically."""
    if os.environ.get('UV_PATH'):
        return os.environ['UV_PATH']
    if sys.platform == 'win32':
        return os.path.join(os.path.expanduser('~'), '.local', 'bin', 'uv.exe')
    return 'uv'


def speak(text: str, voice: str = "en-GB-SoniaNeural"):
    """Generate and play TTS audio using Edge TTS CLI."""
    # Import TTS queue for serialization
    try:
        from tts_queue import acquire_tts_lock, release_tts_lock
        use_queue = True
    except ImportError:
        use_queue = False

    agent_id = f"edge_tts_{os.getpid()}"

    # Acquire TTS lock to prevent overlapping audio (short timeout - play anyway if fails)
    if use_queue:
        if not acquire_tts_lock(agent_id, timeout=5):
            print(f"[EdgeTTS] Queue busy - playing anyway")
            use_queue = False  # Don't try to release a lock we don't have

    try:
        return _speak_internal(text, voice)
    finally:
        if use_queue:
            release_tts_lock(agent_id)


def _speak_internal(text: str, voice: str = "en-GB-SoniaNeural"):
    """Internal TTS implementation."""
    try:
        # Create temp file for audio
        with tempfile.NamedTemporaryFile(suffix=".mp3", delete=False) as tmp:
            tmp_path = tmp.name

        try:
            # Use edge-tts CLI via uvx
            uv_path = get_uv_path()

            # Generate audio using edge-tts CLI
            result = subprocess.run(
                [uv_path, "run", "--with", "edge-tts", "edge-tts",
                 "--voice", voice, "--text", text, "--write-media", tmp_path],
                capture_output=True,
                text=True,
                timeout=30
            )

            if result.returncode != 0:
                print(f"Generation error: {result.stderr}")
                return False

            # Play audio using PowerShell MediaPlayer
            ps_cmd = f'''
            Add-Type -AssemblyName presentationCore
            $player = New-Object System.Windows.Media.MediaPlayer
            $player.Open("{tmp_path}")
            Start-Sleep -Milliseconds 300
            $player.Play()
            $duration = $player.NaturalDuration
            if ($duration.HasTimeSpan) {{
                $ms = $duration.TimeSpan.TotalMilliseconds + 500
                Start-Sleep -Milliseconds $ms
            }} else {{
                Start-Sleep -Seconds 5
            }}
            $player.Close()
            '''
            subprocess.run(
                ["powershell.exe", "-NoProfile", "-Command", ps_cmd],
                capture_output=True,
                timeout=30
            )

            print("Playback complete!")
            return True

        finally:
            # Clean up temp file
            try:
                os.unlink(tmp_path)
            except:
                pass

    except Exception as e:
        print(f"Error: {e}")
        return False


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Edge TTS')
    parser.add_argument('text', nargs='?', default='Task complete!', help='Text to speak')
    parser.add_argument('--voice', '-v', default='en-GB-SoniaNeural', help='Voice to use')
    args = parser.parse_args()

    print(f"Edge TTS ({args.voice.split('-')[-1].replace('Neural', '')})")
    print("=" * 20)
    print(f"Text: {args.text}")
    print("Speaking...")

    speak(args.text, args.voice)


if __name__ == "__main__":
    main()
