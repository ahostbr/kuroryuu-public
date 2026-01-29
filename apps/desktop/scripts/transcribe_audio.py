#!/usr/bin/env python3
"""
Kuroryuu Desktop Audio Transcription (T073 + Whisper Fix)

One-shot speech-to-text transcription from an audio file.

Usage:
    python transcribe_audio.py <audio_file_path> [--engine whisper|google]

Outputs:
    TRANSCRIPT:<text>   - The transcribed text
    CONFIDENCE:<float>  - Confidence score (if available)
    ERROR:<message>     - Error message if transcription fails

Supports:
    - .wav files directly
    - .webm files (converted via ffmpeg if available)
    - .mp3, .ogg, .flac files (via ffmpeg)

Engines:
    - whisper: Local OpenAI Whisper (offline, private, default)
    - google: Google Speech Recognition (online, free)

Requirements:
    pip install SpeechRecognition pydub openai-whisper
    Optional: ffmpeg for webm/mp3 conversion
"""

import sys
import os
import argparse
import tempfile

# ============================================================================
# FFMPEG PATH SETUP (required for Whisper audio decoding)
# ============================================================================

def get_project_root():
    """Get project root from env var or derive from script location."""
    # First check environment variable
    env_root = os.environ.get('KURORYUU_PROJECT_ROOT')
    if env_root:
        return env_root
    # Script is at: apps/desktop/scripts/ -> go up 3 levels to Kuroryuu
    script_dir = os.path.dirname(os.path.abspath(__file__))
    return os.path.dirname(os.path.dirname(os.path.dirname(script_dir)))

def setup_ffmpeg_path():
    """Add ffmpeg to PATH if not already available."""
    # Check if ffmpeg is already in PATH
    import shutil
    if shutil.which('ffmpeg'):
        return True

    # Get project root for path-agnostic ffmpeg detection
    project_root = get_project_root()

    # Common ffmpeg locations (project-relative first, then system)
    ffmpeg_locations = [
        os.path.join(project_root, 'ffmpeg', 'win64', 'bin'),
        os.path.join(project_root, 'ffmpeg', 'bin'),
        os.path.join(project_root, 'ffmpeg'),
        'C:/ffmpeg/bin',
    ]

    for loc in ffmpeg_locations:
        ffmpeg_exe = os.path.join(loc, 'ffmpeg.exe')
        if os.path.exists(ffmpeg_exe):
            os.environ['PATH'] = loc + os.pathsep + os.environ.get('PATH', '')
            print(f"[transcribe] Added ffmpeg to PATH: {loc}", file=sys.stderr)
            return True

    print("[transcribe] Warning: ffmpeg not found, Whisper may fail", file=sys.stderr)
    return False

# Setup ffmpeg path on module load
setup_ffmpeg_path()

def convert_to_wav(audio_path: str) -> tuple[str, bool]:
    """
    Convert audio file to WAV format if needed.

    Returns:
        tuple of (wav_path, is_temp_file)
    """
    ext = os.path.splitext(audio_path)[1].lower()

    # Already WAV
    if ext in ['.wav', '.wave']:
        return audio_path, False

    try:
        from pydub import AudioSegment

        # Load audio file
        audio = AudioSegment.from_file(audio_path)

        # Export as wav to temp file
        with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as f:
            wav_path = f.name

        audio.export(wav_path, format="wav")
        print(f"[transcribe] Converted {ext} to wav: {wav_path}", file=sys.stderr)
        return wav_path, True

    except ImportError:
        print("ERROR:pydub not installed. Install with: pip install pydub", flush=True)
        sys.exit(1)
    except Exception as e:
        print(f"ERROR:Failed to convert audio: {e}", flush=True)
        sys.exit(1)


def transcribe_whisper(audio_path: str) -> tuple[str, float]:
    """
    Transcribe audio using local OpenAI Whisper model.

    Returns:
        tuple of (transcription, confidence)
    """
    try:
        import whisper
    except ImportError:
        print("ERROR:openai-whisper not installed. Install with: pip install openai-whisper", flush=True)
        sys.exit(1)

    print("[transcribe] Loading Whisper model (tiny)...", file=sys.stderr)

    try:
        # Use tiny model for speed (base is too slow for real-time)
        model = whisper.load_model("tiny")

        print("[transcribe] Transcribing with Whisper (local)...", file=sys.stderr)

        # Transcribe audio
        result = model.transcribe(audio_path, fp16=False)

        transcript = result.get("text", "").strip()

        if not transcript:
            print("ERROR:No speech detected in audio", flush=True)
            sys.exit(1)

        # Whisper doesn't provide per-segment confidence easily,
        # but we can estimate from language probability
        language_prob = result.get("language_probability", 0.95)
        confidence = language_prob if language_prob else 0.95

        return transcript, confidence

    except Exception as e:
        print(f"ERROR:Whisper transcription failed: {e}", flush=True)
        sys.exit(1)


def transcribe_google(audio_path: str) -> tuple[str, float]:
    """
    Transcribe audio using Google Speech Recognition API.

    Returns:
        tuple of (transcription, confidence)
    """
    try:
        import speech_recognition as sr
    except ImportError:
        print("ERROR:speech_recognition not installed. Install with: pip install SpeechRecognition", flush=True)
        sys.exit(1)

    recognizer = sr.Recognizer()

    # Convert to WAV if needed (Google needs WAV)
    wav_path, is_temp = convert_to_wav(audio_path)

    try:
        # Load audio file
        with sr.AudioFile(wav_path) as source:
            print("[transcribe] Loading audio...", file=sys.stderr)
            audio = recognizer.record(source)

        print("[transcribe] Transcribing with Google Speech API...", file=sys.stderr)

        # Use Google Speech Recognition (free, no API key needed)
        result = recognizer.recognize_google(audio, show_all=True)

        if not result:
            print("ERROR:No speech detected in audio", flush=True)
            sys.exit(1)

        # Extract best transcription and confidence
        if isinstance(result, dict) and 'alternative' in result:
            alternatives = result['alternative']
            if alternatives:
                best = alternatives[0]
                transcript = best.get('transcript', '')
                confidence = best.get('confidence', 0.0)
                return transcript, confidence

        # Fallback: simple string result
        transcript = recognizer.recognize_google(audio)
        return transcript, 0.95

    except sr.UnknownValueError:
        print("ERROR:Speech not recognized", flush=True)
        sys.exit(1)
    except sr.RequestError as e:
        print(f"ERROR:Google Speech API error: {e}", flush=True)
        sys.exit(1)
    finally:
        # Cleanup temp wav file
        if is_temp and os.path.exists(wav_path):
            try:
                os.remove(wav_path)
                print(f"[transcribe] Cleaned up temp file: {wav_path}", file=sys.stderr)
            except:
                pass


def transcribe_file(audio_path: str, engine: str = "whisper") -> tuple[str, float]:
    """
    Transcribe an audio file using the specified engine.

    Args:
        audio_path: Path to audio file
        engine: 'whisper' (local) or 'google' (online)

    Returns:
        tuple of (transcription, confidence)
    """
    if engine == "whisper":
        return transcribe_whisper(audio_path)
    elif engine == "google":
        return transcribe_google(audio_path)
    else:
        print(f"ERROR:Unknown engine: {engine}. Use 'whisper' or 'google'", flush=True)
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description="Transcribe audio to text")
    parser.add_argument("audio_file", help="Path to audio file")
    parser.add_argument("--engine", choices=["whisper", "google"], default="whisper",
                        help="STT engine: whisper (local, default) or google (online)")

    args = parser.parse_args()

    audio_path = args.audio_file
    engine = args.engine

    if not os.path.exists(audio_path):
        print(f"ERROR:Audio file not found: {audio_path}", flush=True)
        sys.exit(1)

    print(f"[transcribe] Processing: {audio_path}", file=sys.stderr)
    print(f"[transcribe] File size: {os.path.getsize(audio_path)} bytes", file=sys.stderr)
    print(f"[transcribe] Engine: {engine}", file=sys.stderr)

    transcript, confidence = transcribe_file(audio_path, engine)

    print(f"TRANSCRIPT:{transcript}", flush=True)
    print(f"CONFIDENCE:{confidence:.4f}", flush=True)


if __name__ == "__main__":
    main()
