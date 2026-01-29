/**
 * TTS IPC Handlers
 * 
 * IPC handlers for TTS module communication between main and renderer processes.
 * 
 * Requirements: 3.1, 3.2
 */

import { ipcMain, IpcMainInvokeEvent } from 'electron';
import { TTSModule } from '../features/tts/module';
import type { SpeakParams, TTSAction } from '../features/tts/types';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface TTSHandlerDependencies {
  ttsModule: TTSModule;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Handler Registration
// ═══════════════════════════════════════════════════════════════════════════════

export function registerTTSHandlers(deps: TTSHandlerDependencies): void {
  const { ttsModule } = deps;
  
  console.log('[TTS Handlers] Registering TTS IPC handlers');
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Speak
  // ─────────────────────────────────────────────────────────────────────────────
  
  ipcMain.handle('tts:speak', async (_event: IpcMainInvokeEvent, params: SpeakParams) => {
    console.log('[TTS Handlers] tts:speak called with:', JSON.stringify(params));
    try {
      const result = await ttsModule.execute('speak', params as unknown as Record<string, unknown>);
      console.log('[TTS Handlers] tts:speak result:', JSON.stringify(result));
      return result;
    } catch (error) {
      console.error('[TTS Handlers] tts:speak error:', error);
      return { ok: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Stop
  // ─────────────────────────────────────────────────────────────────────────────
  
  ipcMain.handle('tts:stop', async () => {
    console.log('[TTS Handlers] tts:stop called');
    return ttsModule.execute('stop', {});
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Pause
  // ─────────────────────────────────────────────────────────────────────────────
  
  ipcMain.handle('tts:pause', async () => {
    console.log('[TTS Handlers] tts:pause called');
    return ttsModule.execute('pause', {});
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Resume
  // ─────────────────────────────────────────────────────────────────────────────
  
  ipcMain.handle('tts:resume', async () => {
    console.log('[TTS Handlers] tts:resume called');
    return ttsModule.execute('resume', {});
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Get Status
  // ─────────────────────────────────────────────────────────────────────────────
  
  ipcMain.handle('tts:status', async () => {
    console.log('[TTS Handlers] tts:status called');
    return ttsModule.execute('get_status', {});
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // List Voices
  // ─────────────────────────────────────────────────────────────────────────────
  
  ipcMain.handle('tts:listVoices', async () => {
    console.log('[TTS Handlers] tts:listVoices called');
    return ttsModule.execute('list_voices', {});
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Set Voice
  // ─────────────────────────────────────────────────────────────────────────────
  
  ipcMain.handle('tts:setVoice', async (_event: IpcMainInvokeEvent, voiceId: string) => {
    console.log('[TTS Handlers] tts:setVoice called with:', voiceId);
    return ttsModule.execute('set_voice', { voice: voiceId });
  });
  
  console.log('[TTS Handlers] All TTS IPC handlers registered');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Handler Removal
// ═══════════════════════════════════════════════════════════════════════════════

export function removeTTSHandlers(): void {
  ipcMain.removeHandler('tts:speak');
  ipcMain.removeHandler('tts:stop');
  ipcMain.removeHandler('tts:pause');
  ipcMain.removeHandler('tts:resume');
  ipcMain.removeHandler('tts:status');
  ipcMain.removeHandler('tts:listVoices');
  ipcMain.removeHandler('tts:setVoice');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Preload API Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Type declaration for window.electronAPI.tts
 * Add this to your preload script or global types
 *
 * Note: Uses FeatureResponse pattern (ok/error) not success/payload
 */
export interface ElectronTTSAPI {
  speak: (params: SpeakParams) => Promise<{ ok: boolean; result?: unknown; error?: string; errorCode?: string }>;
  stop: () => Promise<{ ok: boolean; error?: string; errorCode?: string }>;
  pause: () => Promise<{ ok: boolean; error?: string; errorCode?: string }>;
  resume: () => Promise<{ ok: boolean; error?: string; errorCode?: string }>;
  status: () => Promise<{ ok: boolean; result?: { isSpeaking: boolean; isPaused: boolean; currentVoice: string } }>;
  listVoices: () => Promise<{ ok: boolean; result?: Array<{ id: string; name: string; lang: string }> }>;
  setVoice: (voiceId: string) => Promise<{ ok: boolean; error?: string; errorCode?: string }>;
}

