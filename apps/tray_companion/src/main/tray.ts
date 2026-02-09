import { Tray, Menu, nativeImage, app, clipboard } from 'electron';
import { join } from 'path';
import { existsSync } from 'fs';
import { speakText, stopSpeaking } from './tts/tts-manager';
import { getSettings, updateSettings } from './settings';
import { getLMStudioInstance } from './lmstudio-integration';
import { getMCPInstance } from './mcp-integration';

let tray: Tray | null = null;
let currentState: 'idle' | 'listening' | 'always-listening' = 'idle';
let settingsClickHandler: (() => void) | null = null;

/**
 * Get the tray icon path that works in both dev and packaged builds.
 * Priority:
 * 1. Packaged: process.resourcesPath/icon.ico
 * 2. Dev build: __dirname/../../resources/icon.ico (electron-vite out/main -> resources)
 * 3. Fallback: app.getAppPath()/resources/icon.ico
 */
function getTrayIconPath(): string {
  // In packaged app, resources are in process.resourcesPath
  const packagedPath = join(process.resourcesPath, 'icon.ico');
  if (existsSync(packagedPath)) {
    console.log('[Tray] Using packaged icon:', packagedPath);
    return packagedPath;
  }

  // Dev build: electron-vite outputs to out/main, resources is at ../../resources
  const devPath = join(__dirname, '../../resources/icon.ico');
  if (existsSync(devPath)) {
    console.log('[Tray] Using dev icon:', devPath);
    return devPath;
  }

  // Fallback: try app path
  const fallbackPath = join(app.getAppPath(), 'resources/icon.ico');
  console.log('[Tray] Using fallback icon:', fallbackPath);
  return fallbackPath;
}

export function createTray(onSettingsClick: () => void): void {
  // Store the settings click handler for later use
  settingsClickHandler = onSettingsClick;

  // Create tray icon with proper path resolution
  const iconPath = getTrayIconPath();
  console.log('[Tray] Loading icon from:', iconPath);
  let icon = nativeImage.createFromPath(iconPath);

  // Check if icon loaded correctly
  if (icon.isEmpty()) {
    console.warn('[Tray] Icon is empty, creating fallback icon');
    // Create a simple 16x16 colored icon as fallback
    icon = nativeImage.createFromBuffer(
      Buffer.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
        // Minimal valid 16x16 PNG (solid color)
      ])
    );
  } else {
    console.log('[Tray] Icon loaded successfully, size:', icon.getSize());
  }

  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  
  // Set initial tooltip and state
  updateTrayIcon('idle');
  
  // Create context menu
  rebuildTrayMenu();
  
  // Handle tray click (show settings)
  tray.on('click', onSettingsClick);

  // Handle double-click (also show settings)
  tray.on('double-click', onSettingsClick);

  console.log('Tray created successfully');
}

export function updateTrayIcon(state: 'idle' | 'listening' | 'always-listening'): void {
  if (!tray) return;
  
  currentState = state;
  
  // Update tooltip based on state
  switch (state) {
    case 'idle':
      tray.setToolTip('Kuroryuu TTS Companion - Idle');
      break;
    case 'listening':
      tray.setToolTip('Kuroryuu TTS Companion - Listening...');
      break;
    case 'always-listening':
      tray.setToolTip('Kuroryuu TTS Companion - Always Listening');
      break;
  }
  
  // Rebuild menu to reflect new state
  rebuildTrayMenu();
}

export function updateTrayMenu(): void {
  rebuildTrayMenu();
}

function rebuildTrayMenu(): void {
  if (!tray) return;
  
  const settings = getSettings();
  
  // Create context menu with current state
  // Note: sublabel doesn't render on Windows native menus, so descriptions go in labels
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Speak Clipboard  (read aloud via TTS)',
      click: async () => {
        const text = clipboard.readText();
        if (text.trim()) {
          await speakText(text);
        }
      }
    },
    {
      label: 'Stop Speaking  (silence playback)',
      click: () => {
        stopSpeaking();
      }
    },
    { type: 'separator' },
    {
      label: `Status: ${currentState.replace('-', ' ').toUpperCase()}`,
      enabled: false
    },
    {
      label: `Auto-speak: ${settings.autoSpeak ? 'ON' : 'OFF'}  (auto-read clipboard)`,
      type: 'checkbox',
      checked: settings.autoSpeak,
      click: () => {
        const current = getSettings();
        updateSettings({ autoSpeak: !current.autoSpeak });
        updateTrayIcon(currentState);
        console.log('[Tray] Auto-speak toggled to:', !current.autoSpeak);
      }
    },
    {
      label: `Engine: ${settings.engine.toUpperCase()}`,
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Ask LMStudio  (clipboard → LMStudio)',
      click: async () => {
        const text = clipboard.readText();
        if (text.trim()) {
          const lmstudio = getLMStudioInstance();
          await lmstudio.quickQuery(`Explain this: ${text}`);
        }
      }
    },
    {
      label: 'RAG Search  (clipboard → Gateway RAG)',
      click: async () => {
        const text = clipboard.readText();
        if (text.trim()) {
          const mcp = getMCPInstance();
          const result = await mcp.ragQuery(text);
          console.log('RAG search result:', result);
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Settings  (open companion window)',
      click: () => {
        if (settingsClickHandler) {
          settingsClickHandler();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit  (exit completely)',
      click: () => {
        app.quit();
      }
    }
  ]);
  
  tray.setContextMenu(contextMenu);
}
