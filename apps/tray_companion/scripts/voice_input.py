#!/usr/bin/env python3
"""
Kuroryuu Voice Input - Continuous Speech-to-Text

Listens continuously and outputs:
  LEVEL:<0-100>     - Audio level for visualization
  INTERIM:<text>    - Processing indicator
  TRANSCRIPT:<text> - Final transcript after pause
  STATUS:<status>   - started, error, etc.

Requirements:
    pip install SpeechRecognition pyaudio

Based on SOTS voice input but adapted for continuous always-listen mode.
"""

import sys
import time
import threading
import audioop

# Global state for thread communication
audio_level = 0
level_lock = threading.Lock()


def process_audio(recognizer, audio):
    """Callback for background listener - runs in separate thread"""
    global audio_level
    
    # Calculate level from audio chunk
    try:
        raw = audio.get_raw_data()
        rms = audioop.rms(raw, 2)
        level = min(100, int(rms / 50))  # Scale to 0-100
        with level_lock:
            audio_level = level
        print(f"LEVEL:{level}", flush=True)
    except:
        pass
    
    print("INTERIM:Processing...", flush=True)
    
    try:
        import speech_recognition as sr
        # Use Google Speech Recognition (free, no API key)
        transcript = recognizer.recognize_google(audio)
        if transcript and transcript.strip():
            print(f"TRANSCRIPT:{transcript}", flush=True)
    except Exception as e:
        import speech_recognition as sr
        if isinstance(e, sr.UnknownValueError):
            print("REJECTED", flush=True)
        elif isinstance(e, sr.RequestError):
            print(f"STATUS:error_network:{e}", flush=True)
        else:
            print("REJECTED", flush=True)


def main():
    global audio_level
    
    try:
        import speech_recognition as sr
    except ImportError:
        print("STATUS:error_no_speech_recognition", flush=True)
        sys.exit(1)
    
    try:
        import pyaudio
    except ImportError:
        print("STATUS:error_no_pyaudio", flush=True)
        sys.exit(1)
    
    recognizer = sr.Recognizer()
    
    # Tuned settings for responsive always-listen
    recognizer.energy_threshold = 300  # Lower = more sensitive
    recognizer.dynamic_energy_threshold = True
    recognizer.dynamic_energy_adjustment_damping = 0.15
    recognizer.dynamic_energy_ratio = 1.5
    recognizer.pause_threshold = 0.6  # 600ms pause = end of phrase
    recognizer.phrase_threshold = 0.2  # Min speech duration
    recognizer.non_speaking_duration = 0.4  # Silence padding
    
    try:
        mic = sr.Microphone()
        with mic as source:
            print("STATUS:adjusting", flush=True)
            recognizer.adjust_for_ambient_noise(source, duration=0.5)
        
        print("STATUS:started", flush=True)
        
        # Start background listening
        stop_listening = recognizer.listen_in_background(mic, process_audio, phrase_time_limit=10)
        
        # Main loop - decay audio level when not speaking
        while True:
            with level_lock:
                lvl = audio_level
                # Decay level gradually
                if audio_level > 0:
                    audio_level = max(0, audio_level - 3)
            print(f"LEVEL:{lvl}", flush=True)
            time.sleep(0.05)  # 50ms = 20fps
            
    except OSError as e:
        print(f"STATUS:error_microphone:{e}", flush=True)
        sys.exit(1)
    except KeyboardInterrupt:
        print("STATUS:stopped", flush=True)
        sys.exit(0)
    except Exception as e:
        print(f"STATUS:error:{e}", flush=True)
        sys.exit(1)


if __name__ == "__main__":
    main()
