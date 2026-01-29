import { Tray, Menu, nativeImage, app, clipboard } from 'electron';
import { join } from 'path';
import { speakText, stopSpeaking } from './tts/tts-manager';
import { getSettings } from './settings';
import { getLMStudioInstance } from './lmstudio-integration';
import { getMCPInstance } from './mcp-integration';

let tray: Tray | null = null;
let currentState: 'idle' | 'listening' | 'always-listening' = 'idle';
let settingsClickHandler: (() => void) | null = null;

export function createTray(onSettingsClick: () => void): void {
  // Store the settings click handler for later use
  settingsClickHandler = onSettingsClick;
  
  // Create tray icon
  const iconPath = join(__dirname, '../../resources/icon.ico');
  const icon = nativeImage.createFromPath(iconPath);
  
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  
  // Set initial tooltip and state
  updateTrayIcon('idle');
  
  // Create context menu
  rebuildTrayMenu();
  
  // Handle tray click (show settings)
  tray.on('click', onSettingsClick);
  
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
  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Speak Clipboard',
      click: async () => {
        const text = clipboard.readText();
        if (text.trim()) {
          await speakText(text);
        }
      }
    },
    {
      label: 'Stop Speaking',
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
      label: `Auto-speak: ${settings.autoSpeak ? 'ON' : 'OFF'}`,
      type: 'checkbox',
      checked: settings.autoSpeak,
      click: () => {
        console.log('Toggle auto-speak');
      }
    },
    {
      label: `Engine: ${settings.engine.toUpperCase()}`,
      enabled: false
    },
    { type: 'separator' },
    {
      label: 'Ask LMStudio',
      click: async () => {
        const text = clipboard.readText();
        if (text.trim()) {
          const lmstudio = getLMStudioInstance();
          await lmstudio.quickQuery(`Explain this: ${text}`);
        }
      }
    },
    {
      label: 'RAG Search',
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
      label: 'Settings',
      click: () => {
        if (settingsClickHandler) {
          settingsClickHandler();
        }
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit();
      }
    }
  ]);
  
  tray.setContextMenu(contextMenu);
}
