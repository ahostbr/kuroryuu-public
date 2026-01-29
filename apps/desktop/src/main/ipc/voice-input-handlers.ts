/**
 * Voice Input IPC Handlers
 * 
 * IPC handlers for voice input operations from renderer process
 * 
 * Requirements: 2.1, 2.2, 2.3
 */

import { ipcMain, BrowserWindow, IpcMainInvokeEvent } from 'electron';
import { VoiceInputModule } from '../features/voice-input/module';
import { createVoiceInputModule } from '../features/voice-input/factory';
import { FeatureResponse, FeatureErrorCode } from '../features/base';
import { TranscriptionResult, VoiceInputStatus, MicrophoneCheckResult } from '../features/voice-input/types';

// ═══════════════════════════════════════════════════════════════════════════════
// Module Instance
// ═══════════════════════════════════════════════════════════════════════════════

let voiceInputModule: VoiceInputModule | null = null;

// ═══════════════════════════════════════════════════════════════════════════════
// Initialization
// ═══════════════════════════════════════════════════════════════════════════════

export async function initializeVoiceInputHandlers(): Promise<void> {
  voiceInputModule = createVoiceInputModule();
  await voiceInputModule.initialize();
  
  console.log('[VoiceInputHandlers] Initialized');
}

// ═══════════════════════════════════════════════════════════════════════════════
// IPC Handler Registration
// ═══════════════════════════════════════════════════════════════════════════════

export function registerVoiceInputHandlers(): void {
  // ─────────────────────────────────────────────────────────────────────────────
  // Start Listening
  // ─────────────────────────────────────────────────────────────────────────────
  
  ipcMain.handle('voice-input:start', async (
    _event: IpcMainInvokeEvent,
    params?: { timeout?: number; language?: string }
  ): Promise<FeatureResponse<void>> => {
    if (!voiceInputModule) {
      return {
        ok: false,
        error: 'Voice input module not initialized',
        errorCode: FeatureErrorCode.MODULE_NOT_INITIALIZED,
      };
    }

    return voiceInputModule.execute('start_listening', params || {});
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Stop Listening
  // ─────────────────────────────────────────────────────────────────────────────
  
  ipcMain.handle('voice-input:stop', async (
    _event: IpcMainInvokeEvent
  ): Promise<FeatureResponse<TranscriptionResult>> => {
    if (!voiceInputModule) {
      return {
        ok: false,
        error: 'Voice input module not initialized',
        errorCode: FeatureErrorCode.MODULE_NOT_INITIALIZED,
      };
    }

    return voiceInputModule.execute<TranscriptionResult>('stop_listening', {});
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Get Status
  // ─────────────────────────────────────────────────────────────────────────────
  
  ipcMain.handle('voice-input:status', async (
    _event: IpcMainInvokeEvent
  ): Promise<FeatureResponse<VoiceInputStatus>> => {
    if (!voiceInputModule) {
      return {
        ok: false,
        error: 'Voice input module not initialized',
        errorCode: FeatureErrorCode.MODULE_NOT_INITIALIZED,
      };
    }

    return voiceInputModule.execute<VoiceInputStatus>('get_status', {});
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Check Microphone
  // ─────────────────────────────────────────────────────────────────────────────
  
  ipcMain.handle('voice-input:check-microphone', async (
    _event: IpcMainInvokeEvent
  ): Promise<FeatureResponse<MicrophoneCheckResult>> => {
    if (!voiceInputModule) {
      return {
        ok: false,
        error: 'Voice input module not initialized',
        errorCode: FeatureErrorCode.MODULE_NOT_INITIALIZED,
      };
    }

    return voiceInputModule.execute<MicrophoneCheckResult>('check_microphone', {});
  });
  
  console.log('[VoiceInputHandlers] Handlers registered');
}

// ═══════════════════════════════════════════════════════════════════════════════
// Event Emission to Renderer
// ═══════════════════════════════════════════════════════════════════════════════

export function emitVoiceInputComplete(
  window: BrowserWindow,
  transcript: string,
  confidence: number
): void {
  window.webContents.send('voice-input:complete', { 
    transcript, 
    confidence,
    timestamp: Date.now(),
  });
}

export function emitVoiceInputError(
  window: BrowserWindow,
  error: string,
  errorType?: string
): void {
  window.webContents.send('voice-input:error', { 
    error,
    errorType,
    timestamp: Date.now(),
  });
}

export function emitVoiceInputStart(window: BrowserWindow): void {
  window.webContents.send('voice-input:start', {
    timestamp: Date.now(),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// Cleanup
// ═══════════════════════════════════════════════════════════════════════════════

export async function cleanupVoiceInputHandlers(): Promise<void> {
  if (voiceInputModule) {
    await voiceInputModule.shutdown();
    voiceInputModule = null;
  }
  
  ipcMain.removeHandler('voice-input:start');
  ipcMain.removeHandler('voice-input:stop');
  ipcMain.removeHandler('voice-input:status');
  ipcMain.removeHandler('voice-input:check-microphone');
  
  console.log('[VoiceInputHandlers] Cleaned up');
}
