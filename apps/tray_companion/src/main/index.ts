import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { createTray, updateTrayIcon } from './tray';
import { initializeSettings, getSettings, updateSettings } from './settings';
import { initializeTTS, speakText, stopSpeaking, getVoices } from './tts/tts-manager';
import { initializeHotkeys, registerHotkey, unregisterHotkey } from './hotkeys';
import { initializeClipboardMonitor, startClipboardMonitoring, stopClipboardMonitoring, updateClipboardMonitoringFromSettings } from './clipboard-monitor';
import { initializeMCP, getMCPInstance } from './mcp-integration';
import { initializeLMStudio, getLMStudioInstance, resolvePromptsDir } from './lmstudio-integration';
import { initializeSpeechRecognition, setMainWindow, startAlwaysListenMode, stopAlwaysListenMode, isCurrentlyListening, startListening, stopListening } from './speech-recognition';
import { initializeTokenStore, saveApiKey, getApiKey, deleteApiKey, hasApiKey } from './token-store';
import { reinitializeElevenLabs, getElevenLabsVoices } from './tts/tts-manager';

let settingsWindow: BrowserWindow | null = null;
let isQuitting = false;

function createSettingsWindow(): void {
  const preloadPath = join(__dirname, '../preload/index.js');
  const rendererPath = join(__dirname, '../renderer/index.html');

  console.log('[TrayCompanion] Creating window with paths:');
  console.log('[TrayCompanion]   __dirname:', __dirname);
  console.log('[TrayCompanion]   preload:', preloadPath);
  console.log('[TrayCompanion]   renderer:', rendererPath);
  console.log('[TrayCompanion]   is.dev:', is.dev);
  console.log('[TrayCompanion]   ELECTRON_RENDERER_URL:', process.env['ELECTRON_RENDERER_URL']);

  // Create the settings window
  settingsWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: preloadPath,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Debug: Log when preload has errors
  settingsWindow.webContents.on('preload-error', (_event, preloadPath, error) => {
    console.error('[TrayCompanion] Preload error:', preloadPath, error);
  });

  // Debug: Log when page fails to load
  settingsWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
    console.error('[TrayCompanion] Failed to load:', errorCode, errorDescription);
  });

  // Debug: Log when page finishes loading
  settingsWindow.webContents.on('did-finish-load', () => {
    console.log('[TrayCompanion] Page finished loading');
  });

  settingsWindow.on('ready-to-show', () => {
    console.log('[TrayCompanion] Window ready to show');
    settingsWindow?.show();
    // Set the main window reference for speech recognition
    if (settingsWindow) {
      setMainWindow(settingsWindow);
    }
  });

  settingsWindow.on('closed', () => {
    console.log('[TrayCompanion] Window closed');
    settingsWindow = null;
  });

  // Close to tray instead of quitting (unless app.quit() was called)
  settingsWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault();
      settingsWindow?.hide();
      console.log('[TrayCompanion] Window hidden to tray (close)');
    }
  });

  // Minimize to tray instead of taskbar
  settingsWindow.on('minimize', () => {
    settingsWindow?.hide();
    console.log('[TrayCompanion] Window hidden to tray');
  });

  settingsWindow.webContents.setWindowOpenHandler((details) => {
    require('electron').shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // Load the renderer - always use file path since we're not running vite dev server
  // The is.dev check with ELECTRON_RENDERER_URL only works when running via 'electron-vite dev'
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    console.log('[TrayCompanion] Loading URL:', process.env['ELECTRON_RENDERER_URL']);
    settingsWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    console.log('[TrayCompanion] Loading file:', rendererPath);
    settingsWindow.loadFile(rendererPath).catch(err => {
      console.error('[TrayCompanion] Failed to load file:', err);
    });
  }
}

// Single instance lock - ensure only one instance of tray companion runs
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  // Another instance is already running, quit this one
  console.log('[TrayCompanion] Another instance is already running, quitting...');
  app.quit();
} else {
  // Handle second-instance event - bring existing window to front
  app.on('second-instance', (_event, _commandLine, _workingDirectory) => {
    console.log('[TrayCompanion] Second instance detected, bringing window to front');

    // If settings window exists, focus it
    if (settingsWindow) {
      if (settingsWindow.isMinimized()) {
        settingsWindow.restore();
      }
      settingsWindow.focus();
      settingsWindow.show();
    } else {
      // Create window if it doesn't exist
      createSettingsWindow();
    }
  });
}

// Allow app.quit() to bypass close-to-tray
app.on('before-quit', () => {
  isQuitting = true;
});

// This method will be called when Electron has finished initialization
app.whenReady().then(async () => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.kuroryuu.tray-companion');

  // Default open or close DevTools by F12 in development
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  // Initialize all modules
  initializeTokenStore();
  initializeSettings();
  initializeTTS();
  initializeHotkeys();
  initializeClipboardMonitor();
  
  // Initialize V0.2 features
  const settings = getSettings();
  if (settings.voiceEnabled) {
    await initializeLMStudio();
    // Set main window for context updates
    const lmstudio = getLMStudioInstance();
    if (settingsWindow) {
      lmstudio.setMainWindow(settingsWindow);
    }
  }
  
  // Initialize MCP (skip if fails - continue without it)
  try {
    await initializeMCP();
  } catch (error) {
    console.warn('MCP initialization failed, continuing without MCP:', error);
  }
  
  // Initialize speech recognition
  initializeSpeechRecognition(settingsWindow ?? undefined);
  
  // Start always-listen mode if enabled - FIXED: don't start here, let UI handle it
  // Always-listen mode should be toggled from the UI
  if (settings.voiceEnabled && settings.voiceAlwaysListen && false) {
    console.log('Skipping auto-startup of always-listen mode - must be toggled from UI');
  }

  // Create tray with click handler that properly shows window
  createTray(() => {
    if (settingsWindow) {
      // Handle both minimized and hidden states
      if (settingsWindow.isMinimized()) {
        settingsWindow.restore();
      }
      if (!settingsWindow.isVisible()) {
        settingsWindow.show();
      }
      settingsWindow.focus();
      // Windows quirk: force window to front by toggling alwaysOnTop
      settingsWindow.setAlwaysOnTop(true);
      settingsWindow.setAlwaysOnTop(false);
      console.log('[TrayCompanion] Window shown from tray');
    } else {
      createSettingsWindow();
    }
  });

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createSettingsWindow();
  });
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC handlers
ipcMain.handle('settings:get', () => {
  console.log('[IPC] settings:get called');
  const settings = getSettings();
  console.log('[IPC] Returning settings:', JSON.stringify(settings));
  return settings;
});

ipcMain.handle('settings:update', async (_, newSettings) => {
  console.log('[IPC] settings:update called with:', JSON.stringify(newSettings));
  const result = updateSettings(newSettings);
  // Update clipboard monitoring based on autoSpeak setting
  updateClipboardMonitoringFromSettings();

  // Propagate voice assistant settings to the live integration instance
  try {
    const lmstudio = getLMStudioInstance();
    if (typeof newSettings?.localLlmUrl === 'string') {
      lmstudio.updateBaseUrl(result.localLlmUrl);
    }
    if (typeof newSettings?.voiceModel === 'string') {
      await lmstudio.setModel(result.voiceModel);
    }
    if (
      typeof newSettings?.voicePromptPath === 'string' ||
      typeof newSettings?.voiceSystemPrompt === 'string'
    ) {
      await lmstudio.reloadSystemPrompt();
    }
  } catch (error) {
    console.warn('[IPC] Failed to propagate voice assistant settings:', error);
  }
  return result;
});

ipcMain.handle('tts:speak', async (_, text: string) => {
  console.log('[IPC] tts:speak called, text length:', text.length);
  return await speakText(text);
});

ipcMain.handle('tts:stop', () => {
  console.log('[IPC] tts:stop called');
  return stopSpeaking();
});

ipcMain.handle('tts:getVoices', async () => {
  console.log('[IPC] tts:getVoices called');
  const voices = await getVoices();
  console.log('[IPC] tts:getVoices returning:', voices);
  return voices;
});

// ElevenLabs API key management
ipcMain.handle('elevenlabs:setApiKey', async (_, apiKey: string) => {
  try {
    saveApiKey('elevenlabs', apiKey);
    reinitializeElevenLabs();
    return { success: true };
  } catch (error) {
    console.error('[IPC] elevenlabs:setApiKey error:', error);
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('elevenlabs:hasApiKey', () => {
  return hasApiKey('elevenlabs');
});

ipcMain.handle('elevenlabs:removeApiKey', () => {
  try {
    deleteApiKey('elevenlabs');
    reinitializeElevenLabs();
    return { success: true };
  } catch (error) {
    console.error('[IPC] elevenlabs:removeApiKey error:', error);
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('elevenlabs:getVoices', async () => {
  try {
    return await getElevenLabsVoices();
  } catch (error) {
    console.error('[IPC] elevenlabs:getVoices error:', error);
    return [];
  }
});

ipcMain.handle('elevenlabs:testVoice', async (_, voiceId: string, text: string) => {
  try {
    const apiKey = getApiKey('elevenlabs');
    if (!apiKey) {
      return { success: false, error: 'No API key configured' };
    }
    // Import and use ElevenLabsTTS for preview
    const { ElevenLabsTTS } = await import('./tts/elevenlabs-tts');
    const tempTTS = new ElevenLabsTTS({ apiKey, voiceId });
    return await tempTTS.speak(text || 'Hello, this is a voice preview.');
  } catch (error) {
    console.error('[IPC] elevenlabs:testVoice error:', error);
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('hotkey:register', (_, accelerator: string, action: string) => {
  return registerHotkey(accelerator, action);
});

ipcMain.handle('hotkey:unregister', (_, accelerator: string) => {
  return unregisterHotkey(accelerator);
});

ipcMain.handle('clipboard:startMonitoring', () => {
  return startClipboardMonitoring();
});

ipcMain.handle('clipboard:stopMonitoring', () => {
  return stopClipboardMonitoring();
});

// V0.2 MCP handlers
ipcMain.handle('mcp:connect', async () => {
  const mcp = getMCPInstance();
  return await mcp.connect();
});

ipcMain.handle('mcp:sendMessage', async (_, recipient: string, message: string, priority: string) => {
  const mcp = getMCPInstance();
  return await mcp.sendInboxMessage(recipient, message, priority as any);
});

ipcMain.handle('mcp:ragQuery', async (_, query: string) => {
  const mcp = getMCPInstance();
  return await mcp.ragQuery(query);
});

ipcMain.handle('mcp:saveCheckpoint', async (_, name: string, data: any) => {
  const mcp = getMCPInstance();
  return await mcp.saveCheckpoint(name, data);
});

ipcMain.handle('mcp:loadCheckpoint', async (_, name: string) => {
  const mcp = getMCPInstance();
  return await mcp.loadCheckpoint(name);
});

// V0.2 Voice Assistant handlers (provider-agnostic)
ipcMain.handle('voice:sendMessage', async (_, message: string, autoSpeak: boolean) => {
  const lmstudio = getLMStudioInstance();
  return await lmstudio.sendMessage(message, autoSpeak);
});

ipcMain.handle('voice:testConnection', async () => {
  const lmstudio = getLMStudioInstance();
  return await lmstudio.testConnection();
});

ipcMain.handle('voice:clearHistory', () => {
  const lmstudio = getLMStudioInstance();
  lmstudio.clearHistory();
  return { success: true };
});

ipcMain.handle('voice:getHistory', () => {
  const lmstudio = getLMStudioInstance();
  return lmstudio.getHistory();
});

ipcMain.handle('voice:getContextInfo', () => {
  const lmstudio = getLMStudioInstance();
  return lmstudio.getContextInfo();
});

ipcMain.handle('voice:setMaxContextTokens', (_, maxTokens: number) => {
  const lmstudio = getLMStudioInstance();
  lmstudio.setMaxContextTokens(maxTokens);
  return { success: true };
});

ipcMain.handle('voice:quickQuery', async (_, query: string) => {
  const lmstudio = getLMStudioInstance();
  return await lmstudio.quickQuery(query);
});

ipcMain.handle('voice:getModels', async () => {
  const lmstudio = getLMStudioInstance();
  return await lmstudio.getModels();
});

// Get models from CLIProxyAPI (Claude, GPT, Gemini, etc.)
ipcMain.handle('voice:getCLIProxyModels', async () => {
  const lmstudio = getLMStudioInstance();
  return await lmstudio.fetchCLIProxyModels();
});

ipcMain.handle('voice:setModel', async (_, model: string) => {
  const lmstudio = getLMStudioInstance();
  await lmstudio.setModel(model);
  return { success: true };
});

ipcMain.handle('voice:reloadPrompt', async () => {
  const lmstudio = getLMStudioInstance();
  await lmstudio.reloadSystemPrompt();
  return { success: true };
});

ipcMain.handle('voice:selectPromptFile', async () => {
  const promptsDir = resolvePromptsDir();
  const result = await dialog.showOpenDialog({
    title: 'Select System Prompt File',
    defaultPath: promptsDir || undefined,
    properties: ['openFile'],
    filters: [
      { name: 'Markdown', extensions: ['md', 'txt'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

// Domain config handlers (for sync with Desktop app)
ipcMain.handle('domain-config:get-voice', () => {
  const lmstudio = getLMStudioInstance();
  const config = lmstudio.getVoiceDomainConfig();
  return {
    success: !!config,
    config,
    usingDomainConfig: lmstudio.isUsingDomainConfig(),
  };
});

// Provider health check (avoids CORS issues by running in main process)
ipcMain.handle('voice:checkProviderHealth', async () => {
  const health: Record<string, boolean> = {
    lmstudio: false,
    cliproxyapi: false,
    'gateway-auto': false,
    claude: false, // Set based on CLIProxyAPI health
  };

  const settings = getSettings();
  const lmstudioUrl = settings.localLlmUrl || 'http://127.0.0.1:1234';

  // Check LMStudio
  try {
    const response = await fetch(`${lmstudioUrl}/v1/models`, {
      signal: AbortSignal.timeout(3000),
    });
    health.lmstudio = response.ok;
  } catch {
    health.lmstudio = false;
  }

  // Check CLIProxyAPI at port 8317
  try {
    const response = await fetch('http://127.0.0.1:8317/v1/models', {
      headers: { 'Authorization': 'Bearer kuroryuu-local-key' },
      signal: AbortSignal.timeout(2000),
    });
    health.cliproxyapi = response.ok;
  } catch {
    health.cliproxyapi = false;
  }

  // Claude is accessible via CLIProxyAPI
  health.claude = health.cliproxyapi;

  // Check Gateway
  try {
    const response = await fetch('http://127.0.0.1:8200/v1/health', {
      signal: AbortSignal.timeout(3000),
    });
    health['gateway-auto'] = response.ok;
  } catch {
    health['gateway-auto'] = false;
  }

  return health;
});

// Speech recognition handlers
ipcMain.handle('speech:startListening', async () => {
  const result = startListening(
    (transcript) => {
      // Send transcript to renderer
      if (settingsWindow) {
        settingsWindow.webContents.send('speech:transcript', transcript);
      }
    },
    () => {
      // Voice detected callback - update tray icon
      updateTrayIcon('listening');
    }
  );
  
  // Update tray icon based on result
  if (result.success) {
    updateTrayIcon('listening');
  }
  
  return result;
});

ipcMain.handle('speech:stopListening', () => {
  stopListening();
  updateTrayIcon('idle');
  return { success: true };
});

ipcMain.handle('speech:isListening', () => {
  return isCurrentlyListening();
});

ipcMain.handle('speech:startAlwaysListen', async (_, forceEnable?: boolean) => {
  const result = await startAlwaysListenMode(forceEnable ?? false);
  if (result.success) {
    updateTrayIcon('always-listening');
  }
  return result;
});

ipcMain.handle('speech:stopAlwaysListen', () => {
  stopAlwaysListenMode();
  updateTrayIcon('idle');
  return { success: true };
});

// Window control handlers
ipcMain.handle('window:toggleFullscreen', () => {
  if (settingsWindow) {
    settingsWindow.setFullScreen(!settingsWindow.isFullScreen());
    return { success: true };
  }
  return { success: false, error: 'Window not available' };
});

ipcMain.handle('window:minimize', () => {
  if (settingsWindow) {
    settingsWindow.minimize();
    return { success: true };
  }
  return { success: false };
});

ipcMain.handle('window:maximize', () => {
  if (settingsWindow) {
    settingsWindow.maximize();
    return { success: true };
  }
  return { success: false };
});

ipcMain.handle('window:close', () => {
  if (settingsWindow) {
    settingsWindow.close();
    return { success: true };
  }
  return { success: false };
});

// In this file you can include the rest of your app's specific main process code.
