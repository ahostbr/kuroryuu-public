/**
 * Speech Recognition Module for Desktop
 * Uses Python SpeechRecognition library via subprocess
 * Copied from tray_companion/src/main/speech-recognition.ts
 */

import { spawn, ChildProcess } from 'child_process';
import { BrowserWindow, app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { getPythonExe, getVoiceInputScriptPath } from '../utils/paths';

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

let recognitionProcess: ChildProcess | null = null;
let isListening = false;
let mainWindow: BrowserWindow | null = null;

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initializeSpeechRecognition(window?: BrowserWindow): void {
  if (window) {
    mainWindow = window;
  }
  console.log('[SpeechRecognition] Module initialized');
}

export function setMainWindow(window: BrowserWindow): void {
  mainWindow = window;
}

// ============================================================================
// PYTHON VOICE INPUT SCRIPT PATH (using centralized path utilities)
// ============================================================================

function getVoiceInputScript(): string {
  // Production path takes precedence
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'scripts', 'voice_input.py');
  }

  const scriptPath = getVoiceInputScriptPath();
  console.log('[SpeechRecognition] Using script:', scriptPath);
  return scriptPath;
}

function getPythonPath(): string {
  const pythonPath = getPythonExe();
  console.log('[SpeechRecognition] Using Python:', pythonPath);
  return pythonPath;
}

// ============================================================================
// START/STOP LISTENING
// ============================================================================

export interface SpeechRecognitionResult {
  success: boolean;
  error?: string;
}

export interface SpeechRecognitionCallbacks {
  onTranscript: (text: string) => void;
  onInterim?: (text: string) => void;
  onLevel?: (level: number) => void;
  onStatus?: (status: string) => void;
  onError?: (error: string) => void;
}

let callbacks: SpeechRecognitionCallbacks | null = null;

export function startListening(cbs: SpeechRecognitionCallbacks): SpeechRecognitionResult {
  console.log('[SpeechRecognition] startListening called, isListening:', isListening);
  
  if (isListening) {
    console.log('[SpeechRecognition] Already listening');
    return { success: false, error: 'Already listening' };
  }

  callbacks = cbs;
  const scriptPath = getVoiceInputScript();
  const pythonExe = getPythonPath();
  
  console.log('[SpeechRecognition] Script:', scriptPath);
  console.log('[SpeechRecognition] Python:', pythonExe);

  try {
    recognitionProcess = spawn(pythonExe, [scriptPath], {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    recognitionProcess.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        handleRecognitionOutput(trimmed);
      }
    });

    recognitionProcess.stderr?.on('data', (data: Buffer) => {
      const error = data.toString().trim();
      if (error) {
        console.log('[SpeechRecognition] Python stderr:', error);
      }
    });

    recognitionProcess.on('close', (code) => {
      console.log('[SpeechRecognition] Process closed with code:', code);
      cleanup();
    });

    recognitionProcess.on('error', (error) => {
      console.error('[SpeechRecognition] Process error:', error);
      callbacks?.onError?.(error.message);
      cleanup();
    });

    isListening = true;
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to start speech recognition';
    console.error('[SpeechRecognition] Failed to start:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

export function stopListening(): SpeechRecognitionResult {
  console.log('[SpeechRecognition] stopListening called, isListening:', isListening);
  
  if (!isListening) {
    return { success: false, error: 'Not listening' };
  }

  cleanup();
  return { success: true };
}

export function getListeningState(): boolean {
  return isListening;
}

// ============================================================================
// OUTPUT HANDLING
// ============================================================================

function handleRecognitionOutput(line: string): void {
  // Parse output from Python script
  if (line.startsWith('TRANSCRIPT:')) {
    const text = line.substring('TRANSCRIPT:'.length);
    console.log('[SpeechRecognition] Transcript:', text);
    callbacks?.onTranscript(text);
  } else if (line.startsWith('INTERIM:')) {
    const text = line.substring('INTERIM:'.length);
    callbacks?.onInterim?.(text);
  } else if (line.startsWith('LEVEL:')) {
    const level = parseInt(line.substring('LEVEL:'.length), 10);
    if (!isNaN(level)) {
      callbacks?.onLevel?.(level);
    }
  } else if (line.startsWith('STATUS:')) {
    const status = line.substring('STATUS:'.length);
    console.log('[SpeechRecognition] Status:', status);
    callbacks?.onStatus?.(status);
    
    if (status.startsWith('error')) {
      callbacks?.onError?.(status);
    }
  } else if (line === 'REJECTED') {
    // Speech not recognized, ignore
    console.log('[SpeechRecognition] Speech rejected (not understood)');
  }
}

// ============================================================================
// CLEANUP
// ============================================================================

function cleanup(): void {
  console.log('[SpeechRecognition] Cleanup');
  
  if (recognitionProcess) {
    try {
      recognitionProcess.kill();
    } catch (e) {
      // Ignore
    }
    recognitionProcess = null;
  }
  
  isListening = false;
  callbacks = null;
}
