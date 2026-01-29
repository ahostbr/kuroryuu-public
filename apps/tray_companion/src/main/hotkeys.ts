import { globalShortcut, clipboard } from 'electron';
import { getSettings } from './settings';
import { speakText } from './tts/tts-manager';

let registeredHotkeys: Map<string, string> = new Map();

export function initializeHotkeys(): void {
  // Register default hotkey from settings
  const settings = getSettings();
  if (settings.hotkeyEnabled && settings.hotkey) {
    registerHotkey(settings.hotkey, 'speak-clipboard');
  }
  
  console.log('Hotkeys initialized');
}

export function registerHotkey(accelerator: string, action: string): { success: boolean; error?: string } {
  try {
    // Unregister if already exists
    if (registeredHotkeys.has(accelerator)) {
      globalShortcut.unregister(accelerator);
    }

    // Register new hotkey
    const success = globalShortcut.register(accelerator, () => {
      handleHotkeyAction(action);
    });

    if (success) {
      registeredHotkeys.set(accelerator, action);
      console.log(`Hotkey registered: ${accelerator} -> ${action}`);
      return { success: true };
    } else {
      console.error(`Failed to register hotkey: ${accelerator}`);
      return { success: false, error: 'Failed to register hotkey (may be in use)' };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown hotkey error';
    console.error('Hotkey registration error:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

export function unregisterHotkey(accelerator: string): { success: boolean; error?: string } {
  try {
    if (registeredHotkeys.has(accelerator)) {
      globalShortcut.unregister(accelerator);
      registeredHotkeys.delete(accelerator);
      console.log(`Hotkey unregistered: ${accelerator}`);
      return { success: true };
    } else {
      return { success: false, error: 'Hotkey not found' };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown hotkey error';
    console.error('Hotkey unregistration error:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

export function unregisterAllHotkeys(): void {
  try {
    globalShortcut.unregisterAll();
    registeredHotkeys.clear();
    console.log('All hotkeys unregistered');
  } catch (error) {
    console.error('Error unregistering all hotkeys:', error);
  }
}

export function getRegisteredHotkeys(): string[] {
  return Array.from(registeredHotkeys.keys());
}

function handleHotkeyAction(action: string): void {
  console.log(`Hotkey action triggered: ${action}`);
  
  switch (action) {
    case 'speak-clipboard':
      handleSpeakClipboard();
      break;
    case 'stop-speaking':
      // Import and call stop function
      const { stopSpeaking } = require('./tts/tts-manager');
      stopSpeaking();
      break;
    default:
      console.warn(`Unknown hotkey action: ${action}`);
  }
}

async function handleSpeakClipboard(): Promise<void> {
  try {
    const text = clipboard.readText();
    if (text && text.trim()) {
      console.log('Speaking clipboard text via hotkey');
      await speakText(text);
    } else {
      console.log('Clipboard is empty or contains no text');
    }
  } catch (error) {
    console.error('Error speaking clipboard text:', error);
  }
}

// Update hotkeys when settings change
export function updateHotkeysFromSettings(): void {
  const settings = getSettings();
  
  // Unregister all current hotkeys
  unregisterAllHotkeys();
  
  // Register new hotkey if enabled
  if (settings.hotkeyEnabled && settings.hotkey) {
    registerHotkey(settings.hotkey, 'speak-clipboard');
  }
}

// Validate hotkey accelerator format
export function validateHotkey(accelerator: string): { valid: boolean; error?: string } {
  if (!accelerator || !accelerator.trim()) {
    return { valid: false, error: 'Hotkey cannot be empty' };
  }

  // Basic validation for Electron accelerator format
  const validModifiers = ['CommandOrControl', 'Command', 'Control', 'Alt', 'Option', 'AltGr', 'Shift', 'Super'];
  const parts = accelerator.split('+');
  
  if (parts.length < 2) {
    return { valid: false, error: 'Hotkey must include at least one modifier and one key' };
  }

  const key = parts[parts.length - 1];
  const modifiers = parts.slice(0, -1);

  // Check if modifiers are valid
  for (const modifier of modifiers) {
    if (!validModifiers.includes(modifier)) {
      return { valid: false, error: `Invalid modifier: ${modifier}` };
    }
  }

  // Check if key is valid (basic check)
  if (key.length === 0) {
    return { valid: false, error: 'Key cannot be empty' };
  }

  return { valid: true };
}
