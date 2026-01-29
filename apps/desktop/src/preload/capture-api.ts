/**
 * Capture Preload API
 * 
 * Exposes capture IPC channels to renderer process.
 * 
 * Requirements: 1.9
 */

import { ipcRenderer, contextBridge } from 'electron';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

interface ScreenshotParams {
  mode: 'desktop' | 'primary' | 'window' | 'region';
  outputPath: string;
  windowTitle?: string;
  region?: { x: number; y: number; width: number; height: number };
  format?: 'png' | 'jpg';
  quality?: number;
}

interface StartRecordingParams {
  mode: 'desktop' | 'primary' | 'window' | 'region';
  outputPath: string;
  preset: string;
  windowTitle?: string;
  region?: { x: number; y: number; width: number; height: number };
  maxDuration?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// API Definition
// ═══════════════════════════════════════════════════════════════════════════════

export const captureApi = {
  // Actions
  screenshot: (params: ScreenshotParams) => ipcRenderer.invoke('capture:screenshot', params),
  start_recording: (params: StartRecordingParams) => ipcRenderer.invoke('capture:start_recording', params),
  stop_recording: () => ipcRenderer.invoke('capture:stop_recording'),
  get_status: () => ipcRenderer.invoke('capture:get_status'),
  list_presets: () => ipcRenderer.invoke('capture:list_presets'),
  
  // Event subscriptions
  onScreenshotComplete: (callback: (data: unknown) => void) => {
    const handler = (_event: unknown, data: unknown) => callback(data);
    ipcRenderer.on('capture:screenshot:complete', handler);
    return () => ipcRenderer.removeListener('capture:screenshot:complete', handler);
  },
  
  onRecordingStart: (callback: (data: unknown) => void) => {
    const handler = (_event: unknown, data: unknown) => callback(data);
    ipcRenderer.on('capture:record:start', handler);
    return () => ipcRenderer.removeListener('capture:record:start', handler);
  },
  
  onRecordingStop: (callback: (data: unknown) => void) => {
    const handler = (_event: unknown, data: unknown) => callback(data);
    ipcRenderer.on('capture:record:stop', handler);
    return () => ipcRenderer.removeListener('capture:record:stop', handler);
  },
  
  onError: (callback: (data: unknown) => void) => {
    const handler = (_event: unknown, data: unknown) => callback(data);
    ipcRenderer.on('capture:error', handler);
    return () => ipcRenderer.removeListener('capture:error', handler);
  },
};

export const dialogApi = {
  showOpenDialog: (options: unknown) => ipcRenderer.invoke('dialog:showOpenDialog', options),
};

// ═══════════════════════════════════════════════════════════════════════════════
// Context Bridge Exposure
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Expose capture API to renderer
 * Call this from your main preload script
 */
export function exposeCaptureApi(): void {
  contextBridge.exposeInMainWorld('api', {
    capture: captureApi,
    dialog: dialogApi,
  });
}
