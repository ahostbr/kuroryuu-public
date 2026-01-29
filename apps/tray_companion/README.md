# Kuroryuu TTS Companion v0.2

A standalone Electron tray application that provides text-to-speech functionality for Kuroryuu workflows. Enables hands-free AI conversations with auto-speak, hotkey support, MCP integration, and Devstral workflow.

## Features

### V0.1 Core Features
- **System Tray Integration**: Runs quietly in the system tray
- **Multiple TTS Engines**: Windows SAPI and Edge TTS support
- **Auto-speak**: Automatically speaks clipboard changes
- **Global Hotkeys**: Configurable keyboard shortcuts
- **Dark Theme UI**: Consistent with Kuroryuu desktop app
- **Settings Persistence**: Remembers your preferences

### V0.2 New Features
- **MCP Integration**: Connect to Kuroryuu MCP_CORE for RAG search, inbox messaging, and checkpoints
- **Devstral Workflow**: Full LM Studio API integration with conversation history
- **Enhanced Tray Menu**: Quick access to Devstral queries and RAG search
- **Workflow Enhancement**: Seamless integration between TTS, AI, and MCP tools

## Installation

### Prerequisites

- Node.js 18+ 
- Windows 10/11 (for Windows SAPI)
- Internet connection (for Edge TTS)

### Setup

```bash
# Navigate to the tray companion directory
cd apps/tray_companion

# Install dependencies
npm install

# Run in development mode
npm run dev

# Build for production
npm run build
```

## Usage

### First Run

1. Run `npm run dev` to start the application
2. Look for the Kuroryuu TTS icon in your system tray
3. Right-click the tray icon to access the context menu
4. Click "Settings" to configure TTS options

### Settings

**TTS Engine**:
- **Windows SAPI**: Uses built-in Windows text-to-speech
- **Edge TTS**: Uses Microsoft Edge neural voices (requires internet)

**Auto-speak**:
- Enable to automatically speak new clipboard content
- Configure maximum character limit to prevent very long text

**Hotkeys**:
- Set global keyboard shortcuts to trigger TTS
- Default: `CommandOrControl+Shift+S`

### Tray Menu

- **Speak Clipboard**: Immediately speak current clipboard content
- **Stop Speaking**: Stop any active TTS playback
- **Ask Devstral**: Send clipboard content to Devstral for explanation (V0.2)
- **RAG Search**: Search Kuroryuu codebase using clipboard content (V0.2)
- **Settings**: Open the settings window
- **Quit**: Exit the application

### V0.2 Settings Tabs

**TTS Engine**: Configure Windows SAPI or Edge TTS settings
**Hotkeys**: Set global keyboard shortcuts
**Auto-speak**: Configure clipboard monitoring
**Devstral**: LM Studio integration and conversation management
**MCP**: Kuroryuu MCP_CORE integration for RAG, inbox, and checkpoints

## Configuration

Settings are automatically saved to:
- Windows: `%APPDATA%/Kuroryuu/tray_companion/config.json`

### Devstral System Prompt

Tray Companion sends a system prompt as the first message on every LM Studio API request.
The system prompt configured inside the LM Studio desktop UI does not automatically apply to API clients.

Precedence:
1. **System prompt override** (Settings UI) if non-empty
2. **System prompt file** (optional) if set/found
3. Built-in default prompt

Auto prompt file lookup tries these folders (first match wins):
- `%APPDATA%/Kuroryuu/tray_companion/Prompts`
- `<Electron userData>/Prompts`
- `<app>/Prompts` (dev/portable)
- `<cwd>/Prompts` (dev)

## Troubleshooting

### TTS Not Working

1. **Windows SAPI**: Ensure Windows has TTS voices installed
2. **Edge TTS**: Check internet connection
3. **Permissions**: Some hotkeys may require administrator privileges

### Hotkeys Not Working

1. Check if the hotkey combination is already in use
2. Try a different key combination
3. Restart the application

### Audio Issues

1. Check system volume and audio output device
2. Test with different TTS engines
3. Verify audio drivers are working

### Model Selection Not Switching

Tray Companion can only switch to models that are currently **loaded** in LM Studio.
If the dropdown shows models that don’t switch, load the target model in LM Studio first (then hit **Test** to refresh).

## Development

### Project Structure

```
apps/tray_companion/
├── src/
│   ├── main/           # Electron main process
│   │   ├── index.ts    # Application entry point
│   │   ├── tray.ts     # System tray implementation
│   │   ├── settings.ts # Settings management
│   │   ├── hotkeys.ts  # Global hotkey handling
│   │   └── tts/        # TTS backend modules
│   ├── preload/        # Preload scripts for IPC
│   └── renderer/       # React UI components
├── resources/          # Icons and assets
└── package.json        # Dependencies and scripts
```

### Available Scripts

- `npm run dev`: Start development server
- `npm run build`: Build for production
- `npm run typecheck`: Run TypeScript type checking
- `npm run start`: Start built application

### Adding New TTS Backends

1. Create new backend class implementing `TTSBackend` interface
2. Add to `tts-manager.ts` initialization
3. Update settings interface and UI controls
4. Test with various text inputs

## Integration with Kuroryuu

This companion app is designed to work alongside the main Kuroryuu desktop application:

- **V0.1**: Standalone operation with clipboard monitoring ✅
- **V0.2**: Integration with Kuroryuu MCP_CORE for enhanced workflows ✅
- **Future**: Direct communication with Kuroryuu agents for coordinated multi-agent sessions

### V0.2 Workflow Examples

1. **Copy code → Ask Devstral**: Copy code to clipboard, right-click tray → "Ask Devstral" for explanation
2. **RAG + TTS**: Search codebase via MCP, results are automatically spoken
3. **Conversation Logging**: Devstral conversations are logged to MCP inbox for persistence
4. **Checkpoint Integration**: Save/load conversation states via MCP checkpoints

## License

Part of the Kuroryuu project. See main project LICENSE file.

## Support

For issues and feature requests, see the main Kuroryuu project repository.
