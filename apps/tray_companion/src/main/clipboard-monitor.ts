import { clipboard } from 'electron';
import { createHash } from 'crypto';
import { getSettings } from './settings';
import { speakText } from './tts/tts-manager';

let isMonitoring = false;
let monitorInterval: NodeJS.Timeout | null = null;
let lastClipboardHash = '';
let lastClipboardText = '';

const MONITOR_INTERVAL_MS = 1000; // Check clipboard every second

export function initializeClipboardMonitor(): void {
  // Initialize with current clipboard content to avoid speaking on startup
  try {
    const currentText = clipboard.readText();
    lastClipboardText = currentText;
    lastClipboardHash = hashText(currentText);
    console.log('Clipboard monitor initialized');
  } catch (error) {
    console.error('Error initializing clipboard monitor:', error);
  }
}

export function startClipboardMonitoring(): { success: boolean; error?: string } {
  if (isMonitoring) {
    return { success: true }; // Already monitoring
  }

  try {
    isMonitoring = true;
    
    monitorInterval = setInterval(() => {
      checkClipboardChange();
    }, MONITOR_INTERVAL_MS);

    console.log('Clipboard monitoring started');
    return { success: true };
  } catch (error) {
    isMonitoring = false;
    const errorMessage = error instanceof Error ? error.message : 'Unknown clipboard monitor error';
    console.error('Error starting clipboard monitoring:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

export function stopClipboardMonitoring(): { success: boolean; error?: string } {
  if (!isMonitoring) {
    return { success: true }; // Already stopped
  }

  try {
    isMonitoring = false;
    
    if (monitorInterval) {
      clearInterval(monitorInterval);
      monitorInterval = null;
    }

    console.log('Clipboard monitoring stopped');
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown clipboard monitor error';
    console.error('Error stopping clipboard monitoring:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

function checkClipboardChange(): void {
  try {
    const settings = getSettings();
    
    // Only monitor if auto-speak is enabled
    if (!settings.autoSpeak) {
      return;
    }

    const currentText = clipboard.readText();
    
    // Skip if clipboard is empty or unchanged
    if (!currentText || !currentText.trim()) {
      return;
    }

    const currentHash = hashText(currentText);
    
    // Check if content has changed
    if (currentHash !== lastClipboardHash) {
      lastClipboardHash = currentHash;
      lastClipboardText = currentText;
      
      console.log('Clipboard changed, triggering auto-speak');
      handleClipboardChange(currentText);
    }
  } catch (error) {
    console.error('Error checking clipboard change:', error);
  }
}

async function handleClipboardChange(text: string): Promise<void> {
  try {
    const settings = getSettings();
    
    // Apply text length limit
    let processedText = text.trim();
    if (processedText.length > settings.maxChars) {
      processedText = processedText.substring(0, settings.maxChars) + '...';
      console.log(`Text truncated to ${settings.maxChars} characters`);
    }

    // Filter out very short text (likely not intentional)
    if (processedText.length < 3) {
      console.log('Skipping very short clipboard text');
      return;
    }

    // Filter out URLs (optional - can be configured later)
    if (isUrl(processedText)) {
      console.log('Skipping URL clipboard content');
      return;
    }

    // Speak the text
    console.log('Auto-speaking clipboard text:', processedText.substring(0, 50) + '...');
    await speakText(processedText);
  } catch (error) {
    console.error('Error handling clipboard change:', error);
  }
}

function hashText(text: string): string {
  return createHash('md5').update(text.trim()).digest('hex');
}

function isUrl(text: string): boolean {
  try {
    new URL(text);
    return true;
  } catch {
    return false;
  }
}

export function isClipboardMonitoring(): boolean {
  return isMonitoring;
}

export function getClipboardStatus(): {
  monitoring: boolean;
  lastText: string;
  lastHash: string;
} {
  return {
    monitoring: isMonitoring,
    lastText: lastClipboardText.substring(0, 100), // First 100 chars for privacy
    lastHash: lastClipboardHash
  };
}

// Update monitoring state when settings change
export function updateClipboardMonitoringFromSettings(): void {
  const settings = getSettings();
  
  if (settings.autoSpeak && !isMonitoring) {
    startClipboardMonitoring();
  } else if (!settings.autoSpeak && isMonitoring) {
    stopClipboardMonitoring();
  }
}

// Manual clipboard speak (for tray menu)
export async function speakCurrentClipboard(): Promise<{ success: boolean; error?: string }> {
  try {
    const text = clipboard.readText();
    
    if (!text || !text.trim()) {
      return { success: false, error: 'Clipboard is empty' };
    }

    const result = await speakText(text);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error speaking current clipboard:', errorMessage);
    return { success: false, error: errorMessage };
  }
}
