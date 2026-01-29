# Desktop Features User Guide

This guide covers the desktop capture, voice input, and text-to-speech features in Kuroryuu.

## Table of Contents

1. [Screen Capture](#screen-capture)
2. [Voice Input](#voice-input)
3. [Text-to-Speech](#text-to-speech)
4. [Configuration](#configuration)
5. [Troubleshooting](#troubleshooting)

---

## Screen Capture

The screen capture feature allows you to take screenshots and record video from your desktop.

### Location
- **Sidebar Panel**: Access capture controls from the dedicated sidebar panel

### Taking Screenshots

1. Open the capture panel in the sidebar
2. Select a preset (or use default):
   - **Lossless**: Full quality PNG
   - **High**: High quality, smaller file
   - **Medium**: Balanced quality/size
   - **Low**: Smallest file size
3. Click "Screenshot" or use the keyboard shortcut
4. The screenshot is saved to your configured output directory

### Recording Video

1. Open the capture panel in the sidebar
2. Select a recording preset:
   - **Lossless**: Uncompressed video (large files)
   - **High**: H.264 CRF 18 (recommended)
   - **Medium**: H.264 CRF 23
   - **Low**: H.264 CRF 28 (smallest files)
3. Click "Start Recording"
4. Perform your actions
5. Click "Stop Recording"
6. The video is saved as MP4 to your output directory

### Region Capture

1. Click "Select Region"
2. Draw a rectangle on screen
3. Take screenshot or record just that region

### Output Files
- Screenshots: `capture_YYYYMMDD_HHMMSS.png`
- Videos: `recording_YYYYMMDD_HHMMSS.mp4`
- Default location: `~/Kuroryuu/captures/`

---

## Voice Input

The voice input feature allows you to speak into your microphone and have the text transcribed into the chat.

### Location
- **Chatbot UI**: Microphone button in the chat input area

### Using Voice Input

1. Click the microphone button (🎤) in the chat input
2. Speak your message clearly
3. The button will show recording status
4. Speech is automatically transcribed after:
   - You stop speaking (silence detection)
   - Timeout is reached (default: 10 seconds)
5. Transcribed text appears in the chat input
6. Edit if needed, then send

### Tips for Best Results

- Speak clearly and at a normal pace
- Minimize background noise
- Position microphone 6-12 inches from mouth
- Wait for the recording indicator before speaking

### Timeout Settings

- Default timeout: 10 seconds
- Maximum timeout: 15 seconds
- Configure in Settings > Voice Input

---

## Text-to-Speech

The TTS feature allows agent responses to be read aloud.

### Location
- **Chatbot UI**: "Speak" button on agent response messages

### Using TTS

1. Find an agent response in the chat
2. Click the "Speak" (🔊) button
3. Audio playback begins automatically
4. Click again to stop playback

### Voice Options

Available voices depend on your system:

**Windows SAPI Voices:**
- Microsoft David (male, US English)
- Microsoft Zira (female, US English)
- Additional voices if installed

**Edge Neural Voices (if configured):**
- High-quality neural voices
- More natural speech
- Requires internet connection

### Playback Controls

- **Rate**: Speech speed (0.5x - 2.0x)
- **Volume**: Audio volume (0% - 100%)
- **Pitch**: Voice pitch (optional)

Configure in Settings > Text-to-Speech

---

## Configuration

### Accessing Settings

1. Open Settings (gear icon)
2. Navigate to Features section
3. Configure each feature individually

### Capture Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Output Directory | Where files are saved | ~/Kuroryuu/captures |
| Default Preset | Default quality preset | high |
| Screenshot Format | PNG or JPEG | PNG |

### Voice Input Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Timeout | Max recording duration | 10 seconds |
| Language | Recognition language | en-US |

### TTS Settings

| Setting | Description | Default |
|---------|-------------|---------|
| Default Voice | Preferred voice | System default |
| Rate | Speech speed | 1.0 |
| Volume | Audio volume | 1.0 |
| Backend Priority | Which TTS engine first | native, edge |

### Configuration File

Settings are stored in JSON format:
- Location: `~/.kuroryuu/features-config.json`
- Format: JSON with sections for each feature

---

## Troubleshooting

### Screen Capture Issues

**"FFmpeg not found"**
- Install FFmpeg: https://ffmpeg.org/download.html
- Add to system PATH
- Restart Kuroryuu

**Black screenshots**
- Some applications prevent capture (DRM protection)
- Try running Kuroryuu as administrator

**Recording has no audio**
- Audio capture is not included by default
- Configure audio device in capture settings

### Voice Input Issues

**"Microphone not available"**
- Check microphone is connected
- Grant microphone permission to Kuroryuu
- Select correct input device in system settings

**Poor transcription quality**
- Reduce background noise
- Speak more clearly
- Check language setting matches your speech

**Timeout too short**
- Increase timeout in settings (max 15 seconds)

### TTS Issues

**No audio playback**
- Check system volume
- Verify speakers are connected
- Try a different TTS backend

**Voice sounds robotic**
- Try Edge neural voices (requires internet)
- Adjust rate and pitch settings

**"TTS backend unavailable"**
- Native: Ensure Windows SAPI is installed
- Edge: Check internet connection
- The system will automatically try fallback backends

---

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Screenshot | Ctrl+Shift+S |
| Start Recording | Ctrl+Shift+R |
| Stop Recording | Ctrl+Shift+R |
| Toggle Voice Input | Ctrl+Shift+V |

Configure shortcuts in Settings > Keyboard.

---

## Getting Help

- **Documentation**: This guide and developer docs
- **Issues**: Report bugs on GitHub
- **Community**: Join our Discord server
