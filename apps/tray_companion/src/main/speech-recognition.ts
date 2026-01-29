import { spawn, ChildProcess } from 'child_process';
import { getSettings } from './settings';
import { getLMStudioInstance } from './lmstudio-integration';
import { BrowserWindow, app } from 'electron';
import * as path from 'path';
import { getPythonExe, getVoiceInputScriptPath } from './utils/paths';

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

type SpeechState = 'idle' | 'listening' | 'hearing' | 'processing' | 'sending' | 'responding';

let recognitionProcess: ChildProcess | null = null;
let isListening = false;
let onTranscriptCallback: ((text: string) => void) | null = null;
let onVoiceDetectedCallback: (() => void) | null = null;
let mainWindow: BrowserWindow | null = null;
let isAlwaysListeningMode = false;
let currentState: SpeechState = 'idle';

// Timeouts and buffers
let silenceTimeout: NodeJS.Timeout | null = null;
let forceTranscriptTimeout: NodeJS.Timeout | null = null;
let currentInterimTranscript: string = '';
let voiceStartTime: number | null = null;
let lastAudioLevel: number = 0;
let isTTSPlaying: boolean = false;  // Pause recognition during TTS playback
let pausedForTTS: boolean = false;  // Flag to prevent cleanup during TTS pause

// Configuration
const SILENCE_TIMEOUT_MS = 500;          // 500ms of silence = send message (was 1000)
const FORCE_SEND_TIMEOUT_MS = 8000;      // Force send after 8 seconds of voice

// ============================================================================
// STATE TRANSITIONS
// ============================================================================

function setState(newState: SpeechState): void {
  if (currentState !== newState) {
    console.log(`[Speech] State: ${currentState} → ${newState}`);
    currentState = newState;
    
    // Send state to renderer
    safeSend('speech-state', newState);
  }
}

// ============================================================================
// INITIALIZATION
// ============================================================================

export function initializeSpeechRecognition(window?: BrowserWindow): void {
  if (window) {
    mainWindow = window;
  }
  console.log('[Speech] Module initialized');
}

export function setMainWindow(window: BrowserWindow): void {
  mainWindow = window;
}

// ============================================================================
// PYTHON VOICE INPUT SCRIPT PATH (using centralized path utilities)
// ============================================================================

function getVoiceInputScript(): string {
  // In prod: resources/scripts/voice_input.py
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'scripts', 'voice_input.py');
  }
  // In dev: use centralized path utility
  return getVoiceInputScriptPath();
}

// ============================================================================
// START/STOP LISTENING
// ============================================================================

export function startListening(
  onTranscript: (text: string) => void, 
  onVoiceDetected?: () => void, 
  alwaysListening: boolean = false
): { success: boolean; error?: string } {
  console.log('[Speech] startListening called - alwaysListening:', alwaysListening, 'isListening:', isListening, 'pausedForTTS:', pausedForTTS);
  
  // Allow restart if we're resuming from TTS pause
  if (isListening && !pausedForTTS) {
    console.error('[Speech] Already listening');
    return { success: false, error: 'Already listening' };
  }

  isAlwaysListeningMode = alwaysListening;
  onTranscriptCallback = onTranscript;
  onVoiceDetectedCallback = onVoiceDetected || null;
  voiceStartTime = null;
  currentInterimTranscript = '';
  
  setState('listening');

  const scriptPath = getVoiceInputScript();
  console.log('[Speech] Using Python script:', scriptPath);

  // Use venv Python if available (path-agnostic)
  const pythonExe = getPythonExe();
  console.log('[Speech] Using Python:', pythonExe);

  try {
    // Use Python for speech recognition (Google Speech API via SpeechRecognition library)
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
        console.log('[Speech] Python:', error);
      }
    });

    recognitionProcess.on('close', (code) => {
      console.log('[Speech] Process closed with code:', code);
      // Don't cleanup if we're just paused for TTS
      if (!pausedForTTS) {
        cleanup();
      }
    });

    recognitionProcess.on('error', (error) => {
      console.error('[Speech] Process error:', error);
      cleanup();
    });

    isListening = true;
    playListeningStartSound();
    
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to start speech recognition';
    console.error('[Speech] Failed to start:', errorMessage);
    cleanup();
    return { success: false, error: errorMessage };
  }
}

// Helper to safely send to renderer (prevents "Object has been destroyed" errors)
function safeSend(channel: string, ...args: any[]): void {
  try {
    if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send(channel, ...args);
    }
  } catch (e) {
    // Window destroyed during send - ignore
  }
}

function handleRecognitionOutput(line: string): void {
  // Skip processing while TTS is playing (prevents feedback loop)
  if (isTTSPlaying && !line.startsWith('LEVEL:')) {
    return;
  }
  
  // Audio level (0-100 from Python)
  if (line.startsWith('LEVEL:')) {
    const level = parseInt(line.substring(6), 10) || 0;
    lastAudioLevel = level / 100; // Normalize to 0-1
    
    safeSend('audio-level', lastAudioLevel);
    
    // Detect voice activity based on level
    if (level > 10 && currentState === 'listening') {
      setState('hearing');
      if (!voiceStartTime) {
        voiceStartTime = Date.now();
        startForceTranscriptTimeout();
      }
    }
    
    // Detect silence after speech
    if (level < 5 && (currentState === 'hearing' || currentState === 'processing') && currentInterimTranscript.trim()) {
      resetSilenceTimeout();
    }
    return;
  }
  
  // Voice detected
  if (line.startsWith('VOICE:') || line === 'VOICE:1') {
    if (currentState === 'listening') {
      setState('hearing');
    }
    if (!voiceStartTime) {
      voiceStartTime = Date.now();
      startForceTranscriptTimeout();
    }
    handleVoiceDetected();
    return;
  }
  
  // Status updates from Python
  if (line.startsWith('STATUS:')) {
    const status = line.substring(7);
    console.log('[Speech] Status:', status);
    if (status.startsWith('error')) {
      console.error('[Speech] Python error:', status);
    }
    return;
  }
  
  // Interim transcript (processing indicator)
  if (line.startsWith('INTERIM:')) {
    const interim = line.substring(8);
    
    console.log('[Speech] Interim:', interim);
    
    // Filter out status-only messages that aren't actual speech
    const isStatusOnly = interim === '...' || interim === 'Processing...' || interim.toLowerCase() === 'processing';
    
    if (interim && interim.trim() && !isStatusOnly) {
      currentInterimTranscript = interim;
      setState('processing');
      
      safeSend('speech-interim', interim);
    } else if (isStatusOnly) {
      // Processing indicator - show processing state but don't save as transcript
      setState('processing');
    }
    return;
  }
  
  // Final transcript from Google Speech
  if (line.startsWith('TRANSCRIPT:')) {
    const transcript = line.substring(11);
    
    console.log('[Speech] Final transcript:', transcript);
    
    if (transcript && transcript.trim().length > 0) {
      clearAllTimeouts();;
      currentInterimTranscript = '';
      voiceStartTime = null;
      
      safeSend('speech-interim', '');
      
      handleTranscript(transcript);
    }
    return;
  }
  
  // Rejected speech - send interim as fallback
  if (line === 'REJECTED') {
    console.log('[Speech] Speech rejected');
    if (currentInterimTranscript.trim()) {
      console.log('[Speech] Sending interim as fallback:', currentInterimTranscript);
      const transcriptToSend = currentInterimTranscript;
      clearAllTimeouts();
      currentInterimTranscript = '';
      voiceStartTime = null;
      handleTranscript(transcriptToSend);
    } else {
      setState('listening');
    }
    return;
  }
  
  // Status updates
  if (line.startsWith('STATUS:')) {
    console.log('[Speech] Status:', line.substring(7));
    return;
  }
  
  // Heartbeat - confirms process is alive
  if (line === 'HEARTBEAT') {
    return;
  }
}

export function stopListening(): void {
  console.log('[Speech] stopListening called');
  cleanup();
  playListeningStopSound();
}

function cleanup(): void {
  clearAllTimeouts();
  
  if (recognitionProcess) {
    recognitionProcess.kill();
    recognitionProcess = null;
  }
  
  isListening = false;
  isAlwaysListeningMode = false;
  onTranscriptCallback = null;
  currentInterimTranscript = '';
  voiceStartTime = null;
  lastAudioLevel = 0;
  
  setState('idle');
}

export function isCurrentlyListening(): boolean {
  return isListening;
}

// ============================================================================
// TIMEOUT MANAGEMENT
// ============================================================================

function clearAllTimeouts(): void {
  clearSilenceTimeout();
  clearForceTranscriptTimeout();
}

function clearSilenceTimeout(): void {
  if (silenceTimeout) {
    clearTimeout(silenceTimeout);
    silenceTimeout = null;
  }
}

function clearForceTranscriptTimeout(): void {
  if (forceTranscriptTimeout) {
    clearTimeout(forceTranscriptTimeout);
    forceTranscriptTimeout = null;
  }
}

function resetSilenceTimeout(): void {
  clearSilenceTimeout();
  
  if (isAlwaysListeningMode && currentInterimTranscript.trim()) {
    console.log('[Speech] Starting silence timeout (500ms) for:', currentInterimTranscript);
    
    silenceTimeout = setTimeout(() => {
      if (currentInterimTranscript.trim()) {
        console.log('[Speech] Silence timeout fired - sending:', currentInterimTranscript);
        
        safeSend('speech-interim', '');
        
        const transcriptToSend = currentInterimTranscript;
        currentInterimTranscript = '';
        voiceStartTime = null;
        clearForceTranscriptTimeout();
        
        handleTranscript(transcriptToSend);
      }
    }, SILENCE_TIMEOUT_MS);
  }
}

function startForceTranscriptTimeout(): void {
  clearForceTranscriptTimeout();
  
  if (isAlwaysListeningMode) {
    console.log('[Speech] Starting force-send timeout (8s)');
    
    forceTranscriptTimeout = setTimeout(() => {
      if (currentInterimTranscript.trim()) {
        console.log('[Speech] Force timeout fired - sending:', currentInterimTranscript);
        
        safeSend('speech-interim', '');
        
        const transcriptToSend = currentInterimTranscript;
        currentInterimTranscript = '';
        voiceStartTime = null;
        clearSilenceTimeout();
        
        handleTranscript(transcriptToSend);
      } else {
        console.log('[Speech] Force timeout fired but no transcript');
        voiceStartTime = null;
        setState('listening');
      }
    }, FORCE_SEND_TIMEOUT_MS);
  }
}

// ============================================================================
// TRANSCRIPT HANDLING
// ============================================================================

async function handleTranscript(transcript: string): Promise<void> {
  console.log('[Speech] handleTranscript:', transcript);
  
  setState('sending');
  
  await handleTranscriptForChat(transcript);
  
  if (onTranscriptCallback) {
    onTranscriptCallback(transcript);
  }
  
  // Return to listening after processing
  setTimeout(() => {
    if (isListening) {
      setState('listening');
    }
  }, 500);
}

async function handleTranscriptForChat(transcript: string): Promise<void> {
  const settings = getSettings();
  
  console.log('[Speech] handleTranscriptForChat:', transcript);
  
  // Send transcript to UI
  safeSend('speech:transcript', transcript);
  
  // In always-listen mode, send to LMStudio
  if (isAlwaysListeningMode && transcript.trim()) {
    console.log('[Speech] Auto-sending to LMStudio...');
    
    try {
      const lmstudio = getLMStudioInstance();
      
      if (!lmstudio) {
        console.error('[Speech] LMStudio instance is null');
        sendMessageResult(false, 'LMStudio not initialized', transcript);
        return;
      }
      
      setState('sending');
      
      const result = await lmstudio.sendMessage(transcript, settings.voiceAutoSpeak !== false);
      
      if (result.success) {
        console.log('[Speech] Message sent successfully');
        setState('responding');
        sendMessageResult(true, undefined, transcript);
      } else {
        console.error('[Speech] Failed to send:', result.error);
        sendMessageResult(false, result.error, transcript);
      }
    } catch (error) {
      console.error('[Speech] Error sending:', error);
      sendMessageResult(false, String(error), transcript);
    }
  }
}

function sendMessageResult(success: boolean, error: string | undefined, command: string): void {
  safeSend('voice-message-sent', {
    success,
    error,
    command,
    timestamp: new Date().toISOString()
  });
}

// ============================================================================
// ALWAYS-LISTEN MODE
// ============================================================================

export async function startAlwaysListenMode(forceEnable: boolean = false): Promise<{ success: boolean; error?: string }> {
  const settings = getSettings();

  console.log('[Speech] startAlwaysListenMode called, forceEnable:', forceEnable);

  if (!forceEnable && !settings.voiceEnabled) {
    return { success: false, error: 'Voice Assistant is not enabled' };
  }

  return startListening(
    (transcript) => console.log('[Speech] Always-listen transcript:', transcript),
    undefined,
    true
  );
}

export function stopAlwaysListenMode(): void {
  console.log('[Speech] stopAlwaysListenMode called');
  stopListening();
}

// ============================================================================
// VOICE DETECTION
// ============================================================================

let lastVoiceDetectedTime = 0;
const VOICE_DETECTED_THROTTLE_MS = 500;

function handleVoiceDetected(): void {
  const now = Date.now();
  if (now - lastVoiceDetectedTime < VOICE_DETECTED_THROTTLE_MS) {
    return;
  }
  lastVoiceDetectedTime = now;
  
  console.log('[Speech] Voice detected');
  
  playNotificationSound();
  
  safeSend('voice-detected');
  
  if (onVoiceDetectedCallback) {
    onVoiceDetectedCallback();
  }
}

// ============================================================================
// SOUND EFFECTS
// ============================================================================

function playNotificationSound(): void {
  try {
    spawn('powershell', ['-Command', `
      Add-Type -AssemblyName System.Windows.Forms
      [System.Windows.Forms.SystemSounds]::Asterisk.Play()
    `], { windowsHide: true, detached: true });
  } catch (error) {
    console.error('[Speech] Failed to play notification sound:', error);
  }
}

function playListeningStartSound(): void {
  try {
    spawn('powershell', ['-Command', `
      Add-Type -AssemblyName System.Windows.Forms
      [System.Windows.Forms.SystemSounds]::Exclamation.Play()
    `], { windowsHide: true, detached: true });
  } catch (error) {
    console.error('[Speech] Failed to play start sound:', error);
  }
}

function playListeningStopSound(): void {
  try {
    spawn('powershell', ['-Command', `
      Add-Type -AssemblyName System.Windows.Forms
      [System.Windows.Forms.SystemSounds]::Hand.Play()
    `], { windowsHide: true, detached: true });
  } catch (error) {
    console.error('[Speech] Failed to play stop sound:', error);
  }
}

// ============================================================================
// EXPORTS FOR STATUS
// ============================================================================

export function getCurrentState(): SpeechState {
  return currentState;
}

export function getAudioLevel(): number {
  return lastAudioLevel;
}

// ============================================================================
// TTS PLAYBACK CONTROL - Pause recognition during TTS to prevent feedback
// ============================================================================

let savedCallbacks: { onTranscript: ((text: string) => void) | null; onVoiceDetected: (() => void) | null } | null = null;
let wasAlwaysListening = false;

export function setTTSPlaying(playing: boolean): void {
  console.log(`[Speech] TTS playing: ${playing}, isListening: ${isListening}, isAlwaysListeningMode: ${isAlwaysListeningMode}`);
  isTTSPlaying = playing;

  if (playing) {
    // Save state and kill process during TTS
    if (recognitionProcess && isAlwaysListeningMode) {
      console.log('[Speech] Pausing recognition during TTS playback');
      wasAlwaysListening = true;
      pausedForTTS = true;  // Prevent cleanup
      savedCallbacks = {
        onTranscript: onTranscriptCallback,
        onVoiceDetected: onVoiceDetectedCallback
      };
      // Kill process but DON'T call cleanup - preserve state
      recognitionProcess.kill();
      recognitionProcess = null;
      // Reset isListening so we can restart later
      isListening = false;
    }
    currentInterimTranscript = '';
    clearAllTimeouts();
    setState('responding');
  } else {
    // Restart recognition after TTS
    const shouldRestart = wasAlwaysListening && !recognitionProcess;
    pausedForTTS = false;  // Allow cleanup again

    if (shouldRestart) {
      console.log('[Speech] Restarting recognition after TTS');
      wasAlwaysListening = false;
      // Use longer delay to ensure TTS audio is fully stopped
      setTimeout(() => {
        if (!recognitionProcess) {
          // Restart with saved callbacks
          const cb = savedCallbacks;
          savedCallbacks = null;
          console.log('[Speech] Executing restart...');
          startListening(
            cb?.onTranscript || ((t) => console.log('[Speech] Transcript:', t)),
            cb?.onVoiceDetected || undefined,
            true
          );
        }
      }, 800);  // Increased from 500ms
    }

    if (isListening || isAlwaysListeningMode) {
      setState('listening');
    }
  }
}

export function isTTSCurrentlyPlaying(): boolean {
  return isTTSPlaying;
}
