/**
 * Speech Recognition IPC Handlers
 * Bridges renderer to main process speech recognition
 */

import { ipcMain, BrowserWindow } from 'electron';
import * as speechRecognition from '../features/speech-recognition';

let mainWindow: BrowserWindow | null = null;

/**
 * Safely send to window - checks if window exists and is not destroyed
 */
function safeSend(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.webContents.send(channel, ...args);
    } catch (e) {
      // Window may have been destroyed between check and send
      console.log('[SpeechHandlers] Failed to send to window:', e);
    }
  }
}

export function registerSpeechHandlers(window: BrowserWindow): void {
  mainWindow = window;
  speechRecognition.initializeSpeechRecognition(window);
  
  console.log('[SpeechHandlers] Registering speech IPC handlers');
  
  // Stop speech recognition when window closes
  window.on('close', () => {
    console.log('[SpeechHandlers] Window closing, stopping speech recognition');
    speechRecognition.stopListening();
  });
  
  // Start listening
  ipcMain.handle('speech:start', async () => {
    console.log('[SpeechHandlers] speech:start called');
    
    const result = speechRecognition.startListening({
      onTranscript: (text) => {
        console.log('[SpeechHandlers] Sending transcript to renderer:', text);
        safeSend('speech:transcript', text);
      },
      onInterim: (text) => {
        safeSend('speech:interim', text);
      },
      onLevel: (level) => {
        safeSend('speech:level', level);
      },
      onStatus: (status) => {
        console.log('[SpeechHandlers] Sending status to renderer:', status);
        safeSend('speech:status', status);
      },
      onError: (error) => {
        console.log('[SpeechHandlers] Sending error to renderer:', error);
        safeSend('speech:error', error);
      },
    });
    
    return result;
  });
  
  // Stop listening
  ipcMain.handle('speech:stop', async () => {
    console.log('[SpeechHandlers] speech:stop called');
    return speechRecognition.stopListening();
  });
  
  // Get listening state
  ipcMain.handle('speech:isListening', async () => {
    return speechRecognition.getListeningState();
  });
  
  console.log('[SpeechHandlers] All speech IPC handlers registered');
}
